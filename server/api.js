// HTTP routing for the CV editor's local file API. Persistence lives in
// server/data.js (versions, their per-language documents, and the language
// label store) and AI in server/ai.js. Mounted as connect middleware by
// vite.config.js so `npm run dev` serves the app and this API on one port
// (no proxy, no CORS).
import fs from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  tailorCv,
  streamCoverLetter,
  translateCv,
  extractCompany,
  isDebug,
  debugLevel,
} from "./ai.js";
import { improveInlineTarget } from "./inline-ai.js";
import {
  DATA_DIR,
  ensureReady,
  ensureDirs,
  listVersions,
  getVersion,
  createVersion,
  renameVersion,
  deleteVersion,
  versionLangs,
  readCv,
  writeCv,
  deleteCvLang,
  getLanguages,
  upsertLanguageLabels,
  isCatalogLang,
} from "./data.js";

function send(res, status, body) {
  res.statusCode = status;
  res.setHeader("Content-Type", "application/json");
  res.end(JSON.stringify(body));
}

function readBody(req) {
  return new Promise((resolve, reject) => {
    let data = "";
    req.on("data", (c) => (data += c));
    req.on("end", () => {
      if (!data) return resolve({});
      try {
        resolve(JSON.parse(data));
      } catch (e) {
        reject(e);
      }
    });
    req.on("error", reject);
  });
}

const MIME_EXT = {
  "image/png": "png",
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/svg+xml": "svg",
};
const EXT_MIME = Object.fromEntries(
  Object.entries(MIME_EXT).map(([m, e]) => [e, m])
);

async function findAvatar() {
  const files = await fs.readdir(DATA_DIR).catch(() => []);
  return files.find((f) => /^avatar\.(png|jpg|webp|gif|svg)$/.test(f)) || null;
}

// Strip an HTML document down to readable text.
function htmlToText(html) {
  return html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&quot;/gi, '"')
    .replace(/\s+/g, " ")
    .trim();
}

// Wrap fetch with an abort timeout so a slow or hung upstream (the JS-rendering
// reader can stall on the free tier) can never block the request indefinitely.
async function fetchWithTimeout(url, { timeoutMs = 12000, ...opts } = {}) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    return await fetch(url, { ...opts, signal: ctrl.signal });
  } finally {
    clearTimeout(timer);
  }
}

// Plain server-side fetch: only sees server-rendered HTML.
async function fetchDirectText(url, timeoutMs = 10000) {
  const resp = await fetchWithTimeout(url, {
    headers: { "User-Agent": "Mozilla/5.0 (cv.json job tailor)" },
    redirect: "follow",
    timeoutMs,
  });
  if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
  return htmlToText(await resp.text());
}

// Build the headers for a Jina reader request. If JINA_API_KEY is set we send it
// as a Bearer token (faster, higher rate limits); otherwise the request goes to
// the free anonymous tier.
//
// IMPORTANT: the link summary (X-With-Links-Summary) is only appended in the
// default markdown format — the plain "text" format strips it. So we only force
// text when we DON'T need links; when we do, we take markdown (which still
// carries the page text, just with markdown links we can parse out).
function readerHeaders(env, withLinks) {
  const headers = {
    "User-Agent": "Mozilla/5.0 (cv.json job tailor)",
  };
  if (withLinks) {
    headers["X-With-Links-Summary"] = "true";
  } else {
    headers["X-Return-Format"] = "text";
  }
  const key = env?.JINA_API_KEY && String(env.JINA_API_KEY).trim();
  if (key) headers["Authorization"] = `Bearer ${key}`;
  return headers;
}

// Fallback for JS-heavy pages (LinkedIn, Workday, Greenhouse, etc.): the Jina
// AI Reader renders the page and returns clean, already-extracted text. This is
// an external service — the URL (not the CV) is sent to it. With `withLinks` it
// also appends a link summary, so we can get a page's text AND its links from a
// single render instead of fetching it twice. Pass `env` to use JINA_API_KEY.
async function fetchReaderText(url, { env, timeoutMs = 18000, withLinks = false } = {}) {
  const resp = await fetchWithTimeout(`https://r.jina.ai/${url}`, {
    headers: readerHeaders(env, withLinks),
    redirect: "follow",
    timeoutMs,
  });
  if (!resp.ok) throw new Error(`reader HTTP ${resp.status}`);
  return (await resp.text()).replace(/\s+\n/g, "\n").trim();
}

// Fetch a URL as text, trying a direct fetch first and falling back to the
// reader service when the direct result is too thin to be the real content.
// Pass `label` to emit debug logs about which path was used, `env` for the key.
async function fetchUrlText(url, { env, minDirect = 600, label } = {}) {
  let text = "";
  let via = "direct";
  try {
    text = await fetchDirectText(url);
  } catch (e) {
    if (label) console.log(`[${label}] direct fetch failed: ${e.message}`);
  }
  if (text.length < minDirect) {
    try {
      const viaReader = await fetchReaderText(url, { env });
      if (viaReader.length > text.length) {
        text = viaReader;
        via = "reader";
      }
    } catch (e) {
      if (label) console.log(`[${label}] reader fetch failed: ${e.message}`);
    }
  }
  if (label) console.log(`[${label}] fetched ${url} via ${via} (${text.length} chars)`);
  return text;
}

// Shared bounds for the small in-memory caches below (job text + company
// research): reuse for the TTL window and the max number of entries kept.
const RESEARCH_TTL_MS = 10 * 60 * 1000; // 10 minutes
const RESEARCH_CACHE_MAX = 20;

// Cache resolved job text per URL so the tailor + cover-letter calls (and repeat
// clicks) for the same posting don't refetch/re-render it. Same TTL as research.
const jobTextCache = new Map(); // url -> { text, ts }

// Resolve a job posting to plain text. Pasted text is used as-is; a URL is
// fetched server-side (avoids browser CORS), with a JS-rendering reader
// fallback so JS-heavy boards still work, and cached by URL.
async function resolveJobText(job, env) {
  if (job?.text && job.text.trim()) return job.text.trim();
  const url = job?.url && String(job.url).trim();
  if (!url) throw new Error("Provide a job description (text or url).");
  if (!/^https?:\/\//i.test(url))
    throw new Error("URL must start with http(s)://");

  const hit = jobTextCache.get(url);
  if (hit && Date.now() - hit.ts < RESEARCH_TTL_MS) {
    if (isDebug(env)) console.log(`[job] cache hit for ${url}`);
    return hit.text;
  }
  if (isDebug(env)) console.log(`[job] cache miss for ${url}`);

  const text = await fetchUrlText(url, { env, label: isDebug(env) ? "job" : undefined });
  if (!text || text.length < 80) {
    throw new Error(
      "Couldn't extract enough text from that URL — try pasting the job description instead."
    );
  }
  const resolved = text.slice(0, 20000); // cap to keep prompts reasonable
  jobTextCache.set(url, { text: resolved, ts: Date.now() });
  if (jobTextCache.size > RESEARCH_CACHE_MAX) {
    jobTextCache.delete(jobTextCache.keys().next().value);
  }
  return resolved;
}

// Parse same-site links out of a reader body that was fetched with the
// link-summary option. Pure (no network): returns normalised, deduped, same-host
// URLs, so we can reuse the single homepage render instead of fetching it twice.
function parseSameSiteLinks(body, base) {
  let host;
  try {
    host = new URL(base).host;
  } catch {
    return [];
  }
  const seen = new Set();
  const links = [];
  for (let raw of String(body).match(/https?:\/\/[^\s)\]]+/g) || []) {
    raw = raw.replace(/[.,)\]]+$/, ""); // strip trailing punctuation
    let u;
    try {
      u = new URL(raw);
    } catch {
      continue;
    }
    if (u.host !== host) continue; // same site only
    if (/\.(png|jpe?g|gif|svg|webp|pdf|zip|mp4|mp3|css|js|ico|woff2?)$/i.test(u.pathname)) continue;
    const norm = (u.origin + u.pathname).replace(/\/+$/, "");
    if (!seen.has(norm)) {
      seen.add(norm);
      links.push(norm);
    }
  }
  return links;
}

// Which internal paths look informative enough to crawl first.
const RESEARCH_PRIORITY =
  /(about|om-?oss|company|selskap|team|product|produkt|solution|losning|løsning|service|tjenest|feature|funksjon|platform|plattform|technolog|teknolog|career|jobb|stilling|hvem|hva)/i;

// Bounds for the company crawl, configurable via env (defaults in parens):
//   RESEARCH_MAX_PAGES (6)   total pages to read, incl. the homepage
//   RESEARCH_PER_PAGE  (2200) chars kept per page
//   RESEARCH_TOTAL_CAP (12000) overall char cap, keeps the prompt from ballooning
// A non-numeric/invalid value falls back to the default.
function researchBounds(env = {}) {
  const num = (v, fallback) => {
    const n = Number(v);
    return Number.isFinite(n) && n > 0 ? n : fallback;
  };
  return {
    maxPages: num(env.RESEARCH_MAX_PAGES, 6),
    perPage: num(env.RESEARCH_PER_PAGE, 2200),
    totalCap: num(env.RESEARCH_TOTAL_CAP, 12000),
    priority: RESEARCH_PRIORITY,
  };
}

// Best-effort company research: ask the model for the employer + website from
// the posting, then crawl a bounded set of the company's own pages (homepage +
// prioritised internal links). Never throws — research is a bonus, not a
// requirement for tailoring.
//
// NOTE: verbose [research] logging below is temporary/diagnostic — remove once
// the research step is dialled in.
async function buildCompanyInfo({ env, jobText }) {
  const bounds = researchBounds(env);
  const debug = isDebug(env);
  const log = (...a) => debug && console.log(...a);
  const t0 = Date.now();
  const elapsed = () => `${((Date.now() - t0) / 1000).toFixed(1)}s`;
  try {
    log("\n[research] ── company research start ──");
    log(`[research] job text length: ${jobText.length} chars`);
    log(
      `[research] bounds: maxPages=${bounds.maxPages} perPage=${bounds.perPage} totalCap=${bounds.totalCap}` +
        ` | jina key: ${env?.JINA_API_KEY ? "yes" : "no (free tier)"}`,
    );
    const { company, website } = await extractCompany({ env, jobText });
    log(`[research] model extracted (${elapsed()}):`, JSON.stringify({ company, website }));
    let info = company ? `Company: ${company}\n` : "";
    let site = website && String(website).trim();
    if (site) {
      if (!/^https?:\/\//i.test(site)) site = `https://${site}`;
      const base = site.replace(/\/+$/, "");

      // Render the homepage ONCE, asking the reader for both the page text and
      // its link summary — no second render just to discover links.
      let home = await fetchReaderText(base, { env, withLinks: true }).catch((e) => {
        log(`[research] homepage reader failed: ${e.message}`);
        return "";
      });
      if (home.length < 400) {
        const direct = await fetchDirectText(base).catch(() => "");
        if (direct.length > home.length) home = direct;
      }
      log(`[research] homepage -> ${home.length} chars (${elapsed()})`);
      if (home) info += `\nHomepage:\n${home.slice(0, bounds.perPage)}`;

      // Crawl a bounded, prioritised set of the site's own links (parsed from
      // the homepage render above). Informative paths (about/product/…) first.
      // Each page goes direct-first, reader-only-as-fallback (same as the job
      // URL path) — fast/free for server-rendered pages, reader only when a page
      // is a JS shell with too little text.
      const links = parseSameSiteLinks(home, base)
        .filter((u) => u.replace(/\/+$/, "") !== base)
        .sort(
          (a, b) =>
            (bounds.priority.test(b) ? 1 : 0) - (bounds.priority.test(a) ? 1 : 0),
        )
        .slice(0, bounds.maxPages - 1);
      log(`[research] crawling ${links.length} pages (${elapsed()})`);

      const fetched = await Promise.allSettled(
        links.map((u) => fetchUrlText(u, { env, label: debug ? "research" : undefined })),
      );
      links.forEach((u, i) => {
        if (info.length > bounds.totalCap) return; // keep the prompt bounded
        const c = fetched[i].status === "fulfilled" ? fetched[i].value : "";
        if (c && c.length > 200) info += `\n\n[${u}]\n${c.slice(0, bounds.perPage)}`;
      });
    } else {
      log("[research] no website to fetch");
    }
    info = info.trim();
    log(`[research] final companyInfo: ${info.length} chars (${elapsed()})`);
    if (debugLevel(env) >= 2) {
      log(
        "[research] --- company research (verbose) ---\n" +
          (info || "(empty)") +
          "\n[research] --- end company research ---",
      );
    }
    log(`[research] ── company research end (${elapsed()}) ──\n`);
    return info || null;
  } catch (e) {
    console.log(`[research] failed after ${elapsed()}: ${e?.message || e}`);
    return null;
  }
}

// Small in-memory cache so company research is computed once per distinct job
// input and reused across the tailor + cover-letter calls (and repeat clicks)
// while the posting hasn't changed. Keyed by a hash of the resolved job text.
const researchCache = new Map(); // key -> { info, ts }

async function getCompanyInfo({ env, jobText }) {
  const key = createHash("sha1").update(jobText).digest("hex");
  const hit = researchCache.get(key);
  if (hit && Date.now() - hit.ts < RESEARCH_TTL_MS) {
    if (isDebug(env)) console.log(`[research] cache hit (${key.slice(0, 8)})`);
    return hit.info;
  }
  if (isDebug(env)) console.log(`[research] cache miss (${key.slice(0, 8)})`);
  const info = await buildCompanyInfo({ env, jobText });
  researchCache.set(key, { info, ts: Date.now() });
  // Evict the oldest entry if the cache grows past its cap (insertion-ordered).
  if (researchCache.size > RESEARCH_CACHE_MAX) {
    researchCache.delete(researchCache.keys().next().value);
  }
  return info;
}

// Translate one version's document from a source language into a target
// language, writing the new translation into the same version.
async function generateLanguage(env, { versionId, sourceLang, targetLang }) {
  if (!versionId || !(await getVersion(versionId)))
    throw new Error("Unknown version.");
  if (!isCatalogLang(sourceLang)) throw new Error("Unknown source language.");
  if (!isCatalogLang(targetLang))
    throw new Error("Target language is not in the catalog.");
  if (targetLang === sourceLang)
    throw new Error("Source and target languages must differ.");

  const sourceDoc = await readCv(versionId, sourceLang);
  if (!sourceDoc)
    throw new Error("This version has no document in the source language.");

  const { doc: translated, labels } = await translateCv({
    env,
    doc: sourceDoc,
    sourceLang,
    targetLang,
  });
  await writeCv(versionId, targetLang, translated);
  await upsertLanguageLabels(targetLang, labels);
  return { lang: targetLang, langs: await versionLangs(versionId) };
}

export function cvApiMiddleware(env = process.env) {
  return async function (req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","cv","v1","en"]
    if (parts[0] !== "api") return next();

    try {
      await ensureReady();

      // --- /api/ai/* ------------------------------------------------------
      if (parts[1] === "ai") {
        if (req.method !== "POST")
          return send(res, 405, { error: "method not allowed" });

        // /api/ai/translate — translate a version's doc into a target language.
        if (parts[2] === "translate") {
          const { versionId, sourceLang, targetLang } = await readBody(req);
          const result = await generateLanguage(env, {
            versionId,
            sourceLang,
            targetLang,
          });
          return send(res, 200, { ok: true, ...result });
        }

        const { doc, lang, job, tone, extraContext, research, cvSource, target } =
          await readBody(req);
        if (!doc || typeof doc !== "object")
          return send(res, 400, { error: "missing cv document" });
        if (!isCatalogLang(lang))
          return send(res, 400, { error: "unknown language" });

        if (parts[2] === "inline") {
          const improved = await improveInlineTarget({
            env,
            doc,
            lang,
            target,
            cvSource,
          });
          return send(res, 200, improved);
        }

        const jobText = await resolveJobText(job, env);
        const companyInfo = research
          ? await getCompanyInfo({ env, jobText })
          : null;

        if (parts[2] === "tailor") {
          const tailored = await tailorCv({
            env,
            doc,
            jobText,
            lang,
            extraContext,
            companyInfo,
            cvSource,
          });
          return send(res, 200, tailored);
        }
        if (parts[2] === "cover-letter") {
          const result = streamCoverLetter({
            env,
            doc,
            jobText,
            lang,
            tone,
            extraContext,
            companyInfo,
            cvSource,
          });
          // Stream plain text straight to the client (text/plain chunks).
          return result.pipeTextStreamToResponse(res);
        }
        return send(res, 404, { error: "not found" });
      }

      // --- /api/versions --------------------------------------------------
      if (parts[1] === "versions") {
        if (!parts[2]) {
          if (req.method === "GET") return send(res, 200, await listVersions());
          if (req.method === "POST") {
            const { name, fromVersionId } = await readBody(req);
            const v = await createVersion({ name, fromVersionId });
            return send(res, 200, v);
          }
          return send(res, 405, { error: "method not allowed" });
        }
        // /api/versions/:id
        const id = parts[2];
        if (req.method === "PATCH") {
          const { name } = await readBody(req);
          const v = await renameVersion(id, name);
          if (!v) return send(res, 404, { error: "not found" });
          return send(res, 200, v);
        }
        if (req.method === "DELETE") {
          const ok = await deleteVersion(id);
          if (!ok)
            return send(res, 400, {
              error: "cannot delete (unknown, or the last remaining version)",
            });
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/cv/:versionId/:lang ---------------------------------------
      if (parts[1] === "cv" && parts[2] && parts[3]) {
        const versionId = parts[2];
        const lang = parts[3];
        if (!isCatalogLang(lang))
          return send(res, 400, { error: "unknown language" });
        if (!(await getVersion(versionId)))
          return send(res, 404, { error: "unknown version" });
        if (req.method === "GET") {
          const doc = await readCv(versionId, lang);
          if (!doc) return send(res, 404, { error: "no document for this language" });
          return send(res, 200, doc);
        }
        if (req.method === "PUT") {
          await writeCv(versionId, lang, await readBody(req));
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          await deleteCvLang(versionId, lang);
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/languages (label store: translated UI section headings) ---
      if (parts[1] === "languages" && !parts[2]) {
        if (req.method === "GET") return send(res, 200, await getLanguages());
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/avatar — single shared image in data/ ---------------------
      if (parts[1] === "avatar") {
        await ensureDirs();
        if (req.method === "GET") {
          const file = await findAvatar();
          if (!file) return send(res, 404, { error: "no avatar" });
          const ext = file.split(".").pop();
          const buf = await fs.readFile(path.join(DATA_DIR, file));
          res.statusCode = 200;
          res.setHeader("Content-Type", EXT_MIME[ext] || "application/octet-stream");
          res.setHeader("Cache-Control", "no-cache");
          return res.end(buf);
        }
        if (req.method === "POST") {
          const { dataUrl } = await readBody(req);
          const m = String(dataUrl || "").match(/^data:([^;]+);base64,([\s\S]+)$/);
          if (!m || !MIME_EXT[m[1]])
            return send(res, 400, { error: "expected a base64 image data URL" });
          const existing = await findAvatar();
          if (existing)
            await fs.unlink(path.join(DATA_DIR, existing)).catch(() => {});
          await fs.writeFile(
            path.join(DATA_DIR, `avatar.${MIME_EXT[m[1]]}`),
            Buffer.from(m[2], "base64")
          );
          return send(res, 200, { ok: true });
        }
        if (req.method === "DELETE") {
          const file = await findAvatar();
          if (file) await fs.unlink(path.join(DATA_DIR, file)).catch(() => {});
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      return send(res, 404, { error: "not found" });
    } catch (err) {
      return send(res, 500, {
        error: String(err && err.message ? err.message : err),
      });
    }
  };
}

// HTTP routing for the CV editor's local file API. Persistence lives in
// server/data.js (live docs, the language registry, and revision history) and
// AI in server/ai.js. Mounted as connect middleware by vite.config.js so
// `npm run dev` serves the app and this API on one port (no proxy, no CORS).
import fs from "node:fs/promises";
import path from "node:path";
import { tailorCv, streamCoverLetter, translateCv } from "./ai.js";
import {
  DATA_DIR,
  VERSIONS_DIR,
  ensureDirs,
  readCv,
  writeCv,
  getLanguages,
  getLanguage,
  getLanguagesWithStatus,
  isEnabledLang,
  upsertLanguage,
  deleteLanguage,
  isCatalogLang,
  hashDoc,
  listRevisions,
  createRevision,
  getRevision,
  deleteRevision,
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

// Keep version/revision names filesystem-safe.
const safeName = (s) =>
  String(s)
    .trim()
    .replace(/[^a-zA-Z0-9_-]+/g, "-")
    .replace(/^-+|-+$/g, "");

async function langAllowed(code) {
  const langs = await getLanguages();
  return isEnabledLang(langs, code);
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

// Resolve a job posting to plain text. Pasted text is used as-is; a URL is
// fetched server-side (avoids browser CORS) and stripped to readable text.
async function resolveJobText(job) {
  if (job?.text && job.text.trim()) return job.text.trim();
  const url = job?.url && String(job.url).trim();
  if (!url) throw new Error("Provide a job description (text or url).");
  if (!/^https?:\/\//i.test(url))
    throw new Error("URL must start with http(s)://");
  const resp = await fetch(url, {
    headers: { "User-Agent": "Mozilla/5.0 (cv.json job tailor)" },
    redirect: "follow",
  });
  if (!resp.ok) throw new Error(`Could not fetch the URL (HTTP ${resp.status}).`);
  const html = await resp.text();
  const text = html
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
  if (text.length < 80) {
    throw new Error(
      "Couldn't extract enough text from that URL — try pasting the job description instead."
    );
  }
  return text.slice(0, 20000); // cap to keep prompts reasonable
}

// Generate (or refresh) a language by translating from a source language.
async function generateLanguage(env, { sourceLang, targetLang, overwrite }) {
  if (!(await langAllowed(sourceLang)))
    throw new Error("Unknown source language.");
  if (!isCatalogLang(targetLang))
    throw new Error("Target language is not in the catalog.");
  if (targetLang === sourceLang)
    throw new Error("Source and target languages must differ.");

  // Any existing entry (enabled or disabled) requires overwrite, so we never
  // silently clobber/re-enable a language or skip the pre-overwrite snapshot.
  const existing = await getLanguage(targetLang);
  if (existing && !overwrite) {
    throw new Error(
      `Language "${targetLang}" already exists. Pass overwrite to regenerate it.`
    );
  }

  const sourceDoc = await readCv(sourceLang);

  // Snapshot the current target before overwriting, so a regeneration is undoable.
  if (existing && overwrite) {
    const prev = await readCv(targetLang).catch(() => null);
    if (prev) {
      await createRevision({
        lang: targetLang,
        kind: "manual",
        label: "Before re-translate",
        doc: prev,
        note: "Auto-saved before regenerating translation",
      });
    }
  }

  const { doc: translated, labels } = await translateCv({
    env,
    doc: sourceDoc,
    sourceLang,
    targetLang,
  });

  await writeCv(targetLang, translated);

  const sourceHash = hashDoc(sourceDoc);
  const meta = await upsertLanguage(targetLang, {
    enabled: true,
    labels,
    sourceLang,
    sourceHash,
    reviewStatus: "needs-review",
  });

  await createRevision({
    lang: targetLang,
    kind: "translation",
    label: `Translated from ${sourceLang.toUpperCase()}`,
    doc: translated,
    sourceLang,
    sourceHash,
  });

  return meta;
}

export function cvApiMiddleware(env = process.env) {
  return async function (req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","cv","en"]
    if (parts[0] !== "api") return next();

    try {
      // --- /api/ai/* ------------------------------------------------------
      if (parts[1] === "ai") {
        if (req.method !== "POST")
          return send(res, 405, { error: "method not allowed" });

        // /api/ai/translate — translate a source CV into a target language.
        if (parts[2] === "translate") {
          const { sourceLang, targetLang, overwrite } = await readBody(req);
          const meta = await generateLanguage(env, {
            sourceLang,
            targetLang,
            overwrite,
          });
          return send(res, 200, { ok: true, language: meta });
        }

        const { doc, lang, job, tone } = await readBody(req);
        if (!doc || typeof doc !== "object")
          return send(res, 400, { error: "missing cv document" });
        if (!(await langAllowed(lang)))
          return send(res, 400, { error: "unknown language" });
        const jobText = await resolveJobText(job);

        if (parts[2] === "tailor") {
          const tailored = await tailorCv({ env, doc, jobText, lang });
          return send(res, 200, tailored);
        }
        if (parts[2] === "cover-letter") {
          const result = streamCoverLetter({ env, doc, jobText, lang, tone });
          return result.pipeTextStreamToResponse(res);
        }
        return send(res, 404, { error: "not found" });
      }

      // --- /api/languages -------------------------------------------------
      if (parts[1] === "languages") {
        if (!parts[2]) {
          if (req.method === "GET") {
            const langs = await getLanguagesWithStatus();
            return send(res, 200, langs);
          }
          return send(res, 405, { error: "method not allowed" });
        }
        // /api/languages/:code
        const code = parts[2];
        if (req.method === "PATCH") {
          const patch = await readBody(req);
          // Whitelist what callers may change.
          const allowed = {};
          if (typeof patch.enabled === "boolean") allowed.enabled = patch.enabled;
          if (typeof patch.reviewStatus === "string")
            allowed.reviewStatus = patch.reviewStatus;
          if (patch.labels && typeof patch.labels === "object")
            allowed.labels = patch.labels;
          const meta = await upsertLanguage(code, allowed);
          return send(res, 200, meta);
        }
        if (req.method === "DELETE") {
          const lang = await getLanguage(code);
          if (lang?.builtin)
            return send(res, 400, { error: "cannot delete a built-in language" });
          await deleteLanguage(code);
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/revisions -------------------------------------------------
      if (parts[1] === "revisions") {
        await ensureDirs();
        if (!parts[2]) {
          if (req.method === "GET") {
            const lang = url.searchParams.get("lang") || undefined;
            return send(res, 200, await listRevisions(lang));
          }
          if (req.method === "POST") {
            const { lang, kind, label, doc, note } = await readBody(req);
            if (!(await langAllowed(lang)))
              return send(res, 400, { error: "unknown language" });
            if (!doc || typeof doc !== "object")
              return send(res, 400, { error: "missing cv document" });
            const meta = await createRevision({ lang, kind, label, doc, note });
            return send(res, 200, meta);
          }
          return send(res, 405, { error: "method not allowed" });
        }
        // /api/revisions/:id
        const id = safeName(parts[2]);
        if (req.method === "GET") {
          const rev = await getRevision(id);
          if (!rev) return send(res, 404, { error: "not found" });
          return send(res, 200, rev);
        }
        if (req.method === "DELETE") {
          await deleteRevision(id);
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/cv/:lang --------------------------------------------------
      if (parts[1] === "cv" && parts[2]) {
        const lang = parts[2];
        if (!(await langAllowed(lang)))
          return send(res, 400, { error: "unknown language" });
        if (req.method === "GET") return send(res, 200, await readCv(lang));
        if (req.method === "PUT") {
          await writeCv(lang, await readBody(req));
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // --- /api/versions (legacy named snapshots) -------------------------
      if (parts[1] === "versions") {
        await ensureDirs();
        if (!parts[2] && req.method === "GET") {
          const files = await fs.readdir(VERSIONS_DIR).catch(() => []);
          const versions = files
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
              const m = f.match(/^(.*)\.([a-z]{2,3})\.json$/);
              return m ? { name: m[1], lang: m[2], file: f } : null;
            })
            .filter(Boolean);
          return send(res, 200, versions);
        }
        if (!parts[2] && req.method === "POST") {
          const { name, lang, doc } = await readBody(req);
          const clean = safeName(name);
          if (!clean) return send(res, 400, { error: "invalid name" });
          if (!(await langAllowed(lang)))
            return send(res, 400, { error: "unknown language" });
          const file = path.join(VERSIONS_DIR, `${clean}.${lang}.json`);
          await fs.writeFile(file, JSON.stringify(doc, null, 2));
          return send(res, 200, { ok: true, name: clean, lang });
        }
        if (parts[2] && parts[3]) {
          const clean = safeName(parts[2]);
          if (!clean) return send(res, 400, { error: "invalid name" });
          const lang = parts[3];
          if (!(await langAllowed(lang)))
            return send(res, 400, { error: "unknown language" });
          const file = path.join(VERSIONS_DIR, `${clean}.${lang}.json`);
          if (req.method === "GET") {
            const raw = await fs.readFile(file, "utf-8");
            return send(res, 200, JSON.parse(raw));
          }
          if (req.method === "DELETE") {
            await fs.unlink(file).catch(() => {});
            return send(res, 200, { ok: true });
          }
        }
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

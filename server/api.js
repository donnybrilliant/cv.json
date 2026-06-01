// Tiny file-backed API for the CV editor.
// Persists each language as a plain JSON file on disk under data/, with named
// snapshots under data/versions/. Mounted as connect middleware by vite.config.js
// so `npm run dev` serves the app and this API on one port (no proxy, no CORS).
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "node:fs/promises";
import path from "node:path";

const ROOT = process.cwd();
const DATA_DIR = path.join(ROOT, "data");
const VERSIONS_DIR = path.join(DATA_DIR, "versions");
// Seed source: the original read-only data shipped with the app.
const SEED_DIR = path.join(ROOT, "public", "data");

const LANGS = ["no", "en", "es"];
const dbCache = new Map();

async function ensureDirs() {
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
}

async function readSeed(lang) {
  try {
    const raw = await fs.readFile(path.join(SEED_DIR, `data.${lang}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {}; // no seed available -> start empty
  }
}

// One lowdb instance per language, cached. Seeds from public/data on first run.
async function getDb(lang) {
  if (dbCache.has(lang)) return dbCache.get(lang);
  await ensureDirs();
  const file = path.join(DATA_DIR, `cv.${lang}.json`);
  const defaultData = await readSeed(lang);
  const db = new Low(new JSONFile(file), defaultData);
  await db.read();
  if (db.data == null) db.data = defaultData;
  await db.write(); // materialize the file on first touch
  dbCache.set(lang, db);
  return db;
}

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

// Keep version names filesystem-safe.
const safeName = (s) => String(s).trim().replace(/[^a-zA-Z0-9_-]+/g, "-").replace(/^-+|-+$/g, "");

const MIME_EXT = { "image/png": "png", "image/jpeg": "jpg", "image/webp": "webp", "image/gif": "gif", "image/svg+xml": "svg" };
const EXT_MIME = Object.fromEntries(Object.entries(MIME_EXT).map(([m, e]) => [e, m]));

async function findAvatar() {
  const files = await fs.readdir(DATA_DIR).catch(() => []);
  return files.find((f) => /^avatar\.(png|jpg|webp|gif|svg)$/.test(f)) || null;
}

export function cvApiMiddleware() {
  return async function (req, res, next) {
    const url = new URL(req.url, "http://localhost");
    const parts = url.pathname.split("/").filter(Boolean); // e.g. ["api","cv","en"]
    if (parts[0] !== "api") return next();

    try {
      // /api/cv/:lang
      if (parts[1] === "cv" && parts[2]) {
        const lang = parts[2];
        if (!LANGS.includes(lang)) return send(res, 400, { error: "unknown language" });
        const db = await getDb(lang);
        if (req.method === "GET") return send(res, 200, db.data);
        if (req.method === "PUT") {
          db.data = await readBody(req);
          await db.write();
          return send(res, 200, { ok: true });
        }
        return send(res, 405, { error: "method not allowed" });
      }

      // /api/versions  and  /api/versions/:name/:lang
      if (parts[1] === "versions") {
        await ensureDirs();
        // List
        if (!parts[2] && req.method === "GET") {
          const files = await fs.readdir(VERSIONS_DIR).catch(() => []);
          const versions = files
            .filter((f) => f.endsWith(".json"))
            .map((f) => {
              const m = f.match(/^(.*)\.(no|en|es)\.json$/);
              return m ? { name: m[1], lang: m[2], file: f } : null;
            })
            .filter(Boolean);
          return send(res, 200, versions);
        }
        // Create
        if (!parts[2] && req.method === "POST") {
          const { name, lang, doc } = await readBody(req);
          const clean = safeName(name);
          if (!clean) return send(res, 400, { error: "invalid name" });
          if (!LANGS.includes(lang)) return send(res, 400, { error: "unknown language" });
          const file = path.join(VERSIONS_DIR, `${clean}.${lang}.json`);
          await fs.writeFile(file, JSON.stringify(doc, null, 2));
          return send(res, 200, { ok: true, name: clean, lang });
        }
        // Read / delete a specific snapshot: /api/versions/:name/:lang
        if (parts[2] && parts[3]) {
          const clean = safeName(parts[2]);
          if (!clean) return send(res, 400, { error: "invalid name" });
          const lang = parts[3];
          if (!LANGS.includes(lang)) return send(res, 400, { error: "unknown language" });
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

      // /api/avatar — single shared image in data/ (local only, not in git)
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
          if (!m || !MIME_EXT[m[1]]) return send(res, 400, { error: "expected a base64 image data URL" });
          // Remove any existing avatar (possibly a different extension) first.
          const existing = await findAvatar();
          if (existing) await fs.unlink(path.join(DATA_DIR, existing)).catch(() => {});
          await fs.writeFile(path.join(DATA_DIR, `avatar.${MIME_EXT[m[1]]}`), Buffer.from(m[2], "base64"));
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
      return send(res, 500, { error: String(err && err.message ? err.message : err) });
    }
  };
}
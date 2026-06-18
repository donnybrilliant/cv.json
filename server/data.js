// File-backed persistence for the CV editor: live language documents, the
// language registry (data/languages.json), and the structured revision history
// (data/revisions/). Kept separate from routing (server/api.js) and AI
// (server/ai.js) so each layer stays small and testable.
import { Low } from "lowdb";
import { JSONFile } from "lowdb/node";
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import {
  BUILTIN_LANGUAGES,
  catalogEntry,
} from "../src/i18n/languages.js";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
export const VERSIONS_DIR = path.join(DATA_DIR, "versions");
export const REVISIONS_DIR = path.join(DATA_DIR, "revisions");
// Seed source: the original read-only sample data shipped with the app.
const SEED_DIR = path.join(ROOT, "public", "data");

const LANGUAGES_FILE = path.join(DATA_DIR, "languages.json");
const REVISIONS_INDEX = path.join(DATA_DIR, "revisions.json");

const dbCache = new Map();

export async function ensureDirs() {
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
  await fs.mkdir(REVISIONS_DIR, { recursive: true });
}

// --- stable hashing (for staleness detection) ----------------------------
// Sort object keys so logically-equal docs hash equal regardless of key order.
function stableStringify(value) {
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stableStringify).join(",")}]`;
  const keys = Object.keys(value).sort();
  return `{${keys
    .map((k) => `${JSON.stringify(k)}:${stableStringify(value[k])}`)
    .join(",")}}`;
}

// Hash only the translatable content, so cosmetic-only changes (theme,
// section visibility) don't mark translations stale.
export function hashDoc(doc) {
  if (!doc || typeof doc !== "object") return "";
  const rest = { ...doc };
  delete rest.theme;
  delete rest.hiddenSections;
  return crypto.createHash("sha1").update(stableStringify(rest)).digest("hex");
}

// --- live CV documents ----------------------------------------------------
async function readSeed(lang) {
  try {
    const raw = await fs.readFile(path.join(SEED_DIR, `data.${lang}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return {}; // no seed available -> start empty
  }
}

// One lowdb instance per language, cached. Seeds builtin languages from
// public/data on first run; generated languages start from whatever is written.
export async function getDb(lang) {
  if (dbCache.has(lang)) return dbCache.get(lang);
  await ensureDirs();
  const file = path.join(DATA_DIR, `cv.${lang}.json`);
  const defaultData = await readSeed(lang);
  const db = new Low(new JSONFile(file), defaultData);
  await db.read();
  if (db.data == null) db.data = defaultData;
  await db.write();
  dbCache.set(lang, db);
  return db;
}

export async function readCv(lang) {
  const db = await getDb(lang);
  return db.data;
}

export async function writeCv(lang, doc) {
  const db = await getDb(lang);
  db.data = doc;
  await db.write();
  return db.data;
}

// True if a live document file exists for this language.
export async function cvExists(lang) {
  try {
    await fs.access(path.join(DATA_DIR, `cv.${lang}.json`));
    return true;
  } catch {
    // Builtins may not be materialized yet but always have a seed.
    return BUILTIN_LANGUAGES.some((l) => l.code === lang);
  }
}

// --- language registry ----------------------------------------------------
async function readLanguagesFile() {
  try {
    const raw = await fs.readFile(LANGUAGES_FILE, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.languages)) return parsed.languages;
  } catch {
    /* fall through to seed */
  }
  return null;
}

async function writeLanguagesFile(languages) {
  await ensureDirs();
  await fs.writeFile(LANGUAGES_FILE, JSON.stringify({ languages }, null, 2));
}

// Load the registry, seeding builtins on first run.
export async function getLanguages() {
  const existing = await readLanguagesFile();
  if (existing) return existing;
  const seeded = BUILTIN_LANGUAGES.map((l) => ({
    ...l,
    createdAt: new Date().toISOString(),
  }));
  await writeLanguagesFile(seeded);
  return seeded;
}

export async function getLanguage(code) {
  const langs = await getLanguages();
  return langs.find((l) => l.code === code) || null;
}

export function isEnabledLang(langs, code) {
  return langs.some((l) => l.code === code && l.enabled !== false);
}

// Create or merge a language entry. Returns the saved entry.
export async function upsertLanguage(code, patch = {}) {
  const langs = await getLanguages();
  const i = langs.findIndex((l) => l.code === code);
  if (i === -1) {
    const entry = {
      code,
      builtin: false,
      enabled: true,
      reviewStatus: "needs-review",
      sourceLang: null,
      sourceHash: null,
      labels: {},
      createdAt: new Date().toISOString(),
      ...patch,
    };
    langs.push(entry);
    await writeLanguagesFile(langs);
    return entry;
  }
  langs[i] = { ...langs[i], ...patch, updatedAt: new Date().toISOString() };
  await writeLanguagesFile(langs);
  return langs[i];
}

export async function deleteLanguage(code) {
  const langs = await getLanguages();
  const entry = langs.find((l) => l.code === code);
  if (!entry) return false;
  if (entry.builtin) {
    // Don't remove builtins from disk; just disable them.
    await upsertLanguage(code, { enabled: false });
    return true;
  }
  const next = langs.filter((l) => l.code !== code);
  await writeLanguagesFile(next);
  // Best-effort cleanup of the live doc + its revisions.
  await fs.unlink(path.join(DATA_DIR, `cv.${code}.json`)).catch(() => {});
  dbCache.delete(code);
  const revs = await getRevisionsIndex();
  for (const r of revs.filter((r) => r.lang === code)) {
    await fs.unlink(path.join(REVISIONS_DIR, `${r.id}.json`)).catch(() => {});
  }
  await writeRevisionsIndex(revs.filter((r) => r.lang !== code));
  return true;
}

// Annotate each language with a `stale` flag: true when a translation's source
// document has changed since it was generated.
export async function getLanguagesWithStatus() {
  const langs = await getLanguages();
  const hashCache = new Map();
  const liveHash = async (lang) => {
    if (hashCache.has(lang)) return hashCache.get(lang);
    let h = "";
    try {
      h = hashDoc(await readCv(lang));
    } catch {
      h = "";
    }
    hashCache.set(lang, h);
    return h;
  };
  const out = [];
  for (const l of langs) {
    let stale = false;
    if (l.sourceLang && l.sourceHash) {
      const current = await liveHash(l.sourceLang);
      stale = Boolean(current) && current !== l.sourceHash;
    }
    out.push({ ...l, stale });
  }
  return out;
}

// --- revisions ------------------------------------------------------------
async function getRevisionsIndex() {
  try {
    const raw = await fs.readFile(REVISIONS_INDEX, "utf-8");
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed?.revisions)) return parsed.revisions;
  } catch {
    /* none yet */
  }
  return [];
}

async function writeRevisionsIndex(revisions) {
  await ensureDirs();
  await fs.writeFile(REVISIONS_INDEX, JSON.stringify({ revisions }, null, 2));
}

// List revision metadata (newest first), optionally filtered by language.
export async function listRevisions(lang) {
  const all = await getRevisionsIndex();
  const filtered = lang ? all.filter((r) => r.lang === lang) : all;
  return [...filtered].sort((a, b) =>
    String(b.createdAt).localeCompare(String(a.createdAt))
  );
}

const REVISION_KINDS = new Set([
  "source",
  "translation",
  "tailor-before",
  "tailor-after",
  "manual",
]);

// Persist a full document as an immutable revision + index its metadata.
export async function createRevision({
  lang,
  kind = "manual",
  label = "",
  doc,
  sourceLang = null,
  sourceRevisionId = null,
  sourceHash = null,
  model = null,
  note = "",
}) {
  await ensureDirs();
  const id = `${Date.now().toString(36)}-${crypto.randomUUID().slice(0, 8)}`;
  const meta = {
    id,
    lang,
    kind: REVISION_KINDS.has(kind) ? kind : "manual",
    label,
    sourceLang,
    sourceRevisionId,
    sourceHash: sourceHash ?? hashDoc(doc),
    model,
    note,
    createdAt: new Date().toISOString(),
  };
  await fs.writeFile(
    path.join(REVISIONS_DIR, `${id}.json`),
    JSON.stringify({ ...meta, doc }, null, 2)
  );
  const index = await getRevisionsIndex();
  index.push(meta);
  await writeRevisionsIndex(index);
  return meta;
}

export async function getRevision(id) {
  try {
    const raw = await fs.readFile(path.join(REVISIONS_DIR, `${id}.json`), "utf-8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}

export async function deleteRevision(id) {
  await fs.unlink(path.join(REVISIONS_DIR, `${id}.json`)).catch(() => {});
  const index = await getRevisionsIndex();
  await writeRevisionsIndex(index.filter((r) => r.id !== id));
  return true;
}

// Validate a target language code against the catalog (prevents junk codes).
export function isCatalogLang(code) {
  return Boolean(catalogEntry(code));
}

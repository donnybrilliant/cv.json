// File-backed persistence for the CV editor. The unit of organisation is a
// **version** (e.g. "Frontend", "Backend") — a named document the user switches
// between. Each version is a folder under data/versions/{id}/ holding one
// cv.{lang}.json per language translation. A small language registry
// (data/languages.json) stores the translated UI section headings ("labels").
//
// Kept separate from routing (server/api.js) and AI (server/ai.js) so each
// layer stays small and testable.
import fs from "node:fs/promises";
import path from "node:path";
import crypto from "node:crypto";
import { BUILTIN_LANGUAGES, catalogEntry } from "../src/i18n/languages.js";

const ROOT = process.cwd();
export const DATA_DIR = path.join(ROOT, "data");
const VERSIONS_DIR = path.join(DATA_DIR, "versions");
// Seed source: the original read-only sample data shipped with the app.
const SEED_DIR = path.join(ROOT, "public", "data");

const VERSIONS_FILE = path.join(DATA_DIR, "versions.json");
const LANGUAGES_FILE = path.join(DATA_DIR, "languages.json");

// Validate a language code against the catalog (prevents junk codes / paths).
export function isCatalogLang(code) {
  return Boolean(catalogEntry(code));
}

function newId() {
  return `v${Date.now().toString(36)}${crypto.randomUUID().slice(0, 4)}`;
}

const versionDir = (id) => path.join(VERSIONS_DIR, id);
const cvFile = (id, lang) => path.join(versionDir(id), `cv.${lang}.json`);

async function readJson(file) {
  try {
    return JSON.parse(await fs.readFile(file, "utf-8"));
  } catch {
    return null;
  }
}

async function writeJson(file, value) {
  await fs.writeFile(file, JSON.stringify(value, null, 2));
}

// The shipped sample CV for a language, if any (used to seed new versions).
async function readSeed(lang) {
  return (await readJson(path.join(SEED_DIR, `data.${lang}.json`))) || null;
}

// --- one-time setup + migration -----------------------------------------
let readyPromise = null;
export function ensureReady() {
  if (!readyPromise) readyPromise = setup();
  return readyPromise;
}

export async function ensureDirs() {
  await fs.mkdir(VERSIONS_DIR, { recursive: true });
}

async function setup() {
  await ensureDirs();
  if (await readJson(VERSIONS_FILE)) return; // already on the version layout
  await migrate();
}

// Move from the old per-language layout (data/cv.{lang}.json + flat
// data/versions/{name}.{lang}.json snapshots) to the version-folder layout.
// Copies (never deletes) so the originals remain as a fallback. On a fresh
// install it just seeds a "My CV" version from the shipped sample data.
async function migrate() {
  const entries = [];

  // 1) The live docs become the first version, "My CV".
  const v1 = newId();
  await fs.mkdir(versionDir(v1), { recursive: true });
  const rootFiles = await fs.readdir(DATA_DIR).catch(() => []);
  const liveLangs = rootFiles
    .map((f) => f.match(/^cv\.([a-z]{2,3})\.json$/)?.[1])
    .filter(Boolean);
  if (liveLangs.length) {
    for (const lang of liveLangs) {
      const doc = await readJson(path.join(DATA_DIR, `cv.${lang}.json`));
      if (doc) await writeJson(cvFile(v1, lang), doc);
    }
  } else {
    // Fresh install: seed the builtin languages from the shipped sample.
    for (const l of BUILTIN_LANGUAGES) {
      const seed = await readSeed(l.code);
      if (seed) await writeJson(cvFile(v1, l.code), seed);
    }
  }
  entries.push({ id: v1, name: "My CV", createdAt: new Date().toISOString() });

  // 2) Old flat named snapshots -> one version each (skip auto before-tailor).
  const versFiles = await fs.readdir(VERSIONS_DIR, { withFileTypes: true }).catch(() => []);
  const byName = new Map();
  for (const ent of versFiles) {
    if (!ent.isFile()) continue;
    const m = ent.name.match(/^(.+)\.([a-z]{2,3})\.json$/);
    if (!m) continue;
    const [, name, lang] = m;
    if (/^before-tailor-/.test(name)) continue;
    if (!byName.has(name)) byName.set(name, []);
    byName.get(name).push(lang);
  }
  for (const [name, langs] of byName) {
    const id = newId();
    await fs.mkdir(versionDir(id), { recursive: true });
    for (const lang of langs) {
      const doc = await readJson(path.join(VERSIONS_DIR, `${name}.${lang}.json`));
      if (doc) await writeJson(cvFile(id, lang), doc);
    }
    entries.push({ id, name, createdAt: new Date().toISOString() });
  }

  await writeJson(VERSIONS_FILE, { versions: entries });

  // 3) Language label store: keep any existing labels, else seed from builtins.
  const existing = await readJson(LANGUAGES_FILE);
  const source = Array.isArray(existing?.languages) ? existing.languages : BUILTIN_LANGUAGES;
  const languages = source.map((l) => ({
    code: l.code,
    builtin: Boolean(l.builtin) || BUILTIN_LANGUAGES.some((b) => b.code === l.code),
    labels: l.labels || {},
  }));
  await writeJson(LANGUAGES_FILE, { languages });
}

// --- versions -------------------------------------------------------------
async function readVersions() {
  const data = await readJson(VERSIONS_FILE);
  return Array.isArray(data?.versions) ? data.versions : [];
}

async function writeVersions(versions) {
  await writeJson(VERSIONS_FILE, { versions });
}

// Languages a version actually has a document for (sorted for stable display).
export async function versionLangs(id) {
  const files = await fs.readdir(versionDir(id)).catch(() => []);
  return files
    .map((f) => f.match(/^cv\.([a-z]{2,3})\.json$/)?.[1])
    .filter(Boolean)
    .sort();
}

// List versions with the languages each one contains.
export async function listVersions() {
  const versions = await readVersions();
  const out = [];
  for (const v of versions) {
    out.push({ ...v, langs: await versionLangs(v.id) });
  }
  return out;
}

export async function getVersion(id) {
  return (await readVersions()).find((v) => v.id === id) || null;
}

// Create a version. With `fromVersionId`, copy that version's documents;
// otherwise seed the builtin languages from the shipped sample.
export async function createVersion({ name, fromVersionId = null }) {
  const id = newId();
  await fs.mkdir(versionDir(id), { recursive: true });
  if (fromVersionId) {
    for (const lang of await versionLangs(fromVersionId)) {
      const doc = await readJson(cvFile(fromVersionId, lang));
      if (doc) await writeJson(cvFile(id, lang), doc);
    }
  } else {
    for (const l of BUILTIN_LANGUAGES) {
      const seed = await readSeed(l.code);
      if (seed) await writeJson(cvFile(id, l.code), seed);
    }
  }
  const versions = await readVersions();
  const entry = {
    id,
    name: String(name || "Untitled").trim() || "Untitled",
    createdAt: new Date().toISOString(),
  };
  versions.push(entry);
  await writeVersions(versions);
  return { ...entry, langs: await versionLangs(id) };
}

export async function renameVersion(id, name) {
  const versions = await readVersions();
  const v = versions.find((x) => x.id === id);
  if (!v) return null;
  v.name = String(name || "").trim() || v.name;
  v.updatedAt = new Date().toISOString();
  await writeVersions(versions);
  return { ...v, langs: await versionLangs(id) };
}

// Delete a version (and its documents). Refuses to delete the last one so the
// app always has something to load.
export async function deleteVersion(id) {
  const versions = await readVersions();
  if (versions.length <= 1) return false;
  if (!versions.some((v) => v.id === id)) return false;
  await writeVersions(versions.filter((v) => v.id !== id));
  await fs.rm(versionDir(id), { recursive: true, force: true }).catch(() => {});
  return true;
}

// --- documents ------------------------------------------------------------
export async function readCv(versionId, lang) {
  return await readJson(cvFile(versionId, lang)); // null when missing -> 404
}

export async function writeCv(versionId, lang, doc) {
  await fs.mkdir(versionDir(versionId), { recursive: true });
  await writeJson(cvFile(versionId, lang), doc);
  return doc;
}

export async function deleteCvLang(versionId, lang) {
  await fs.unlink(cvFile(versionId, lang)).catch(() => {});
  return true;
}

// --- language label store -------------------------------------------------
export async function getLanguages() {
  const data = await readJson(LANGUAGES_FILE);
  if (Array.isArray(data?.languages)) return data.languages;
  const seeded = BUILTIN_LANGUAGES.map((l) => ({
    code: l.code,
    builtin: true,
    labels: l.labels || {},
  }));
  await writeJson(LANGUAGES_FILE, { languages: seeded });
  return seeded;
}

// Record the translated UI section headings for a language (created on the
// first translation into it).
export async function upsertLanguageLabels(code, labels) {
  const languages = await getLanguages();
  const i = languages.findIndex((l) => l.code === code);
  if (i === -1) {
    languages.push({ code, builtin: false, labels: labels || {} });
  } else {
    languages[i] = { ...languages[i], labels: labels || languages[i].labels };
  }
  await writeJson(LANGUAGES_FILE, { languages });
  return languages.find((l) => l.code === code);
}

// Thin fetch wrappers around the local file-backed API (see server/api.js).
async function json(res) {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

export const getCv = (lang) => fetch(`/api/cv/${lang}`).then(json);

export const putCv = (lang, doc) =>
  fetch(`/api/cv/${lang}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  }).then(json);

// --- languages registry ---------------------------------------------------
export const listLanguages = () => fetch("/api/languages").then(json);

export const patchLanguage = (code, patch) =>
  fetch(`/api/languages/${code}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(patch),
  }).then(json);

export const deleteLanguage = (code) =>
  fetch(`/api/languages/${code}`, { method: "DELETE" }).then(json);

// AI: generate (or refresh) a language by translating from a source language.
export const translateLanguage = (sourceLang, targetLang, overwrite = false) =>
  fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ sourceLang, targetLang, overwrite }),
  }).then(json);

// --- revisions (structured source/AI history) -----------------------------
export const listRevisions = (lang) =>
  fetch(`/api/revisions${lang ? `?lang=${encodeURIComponent(lang)}` : ""}`).then(
    json
  );

export const createRevision = (payload) =>
  fetch("/api/revisions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  }).then(json);

export const getRevision = (id) =>
  fetch(`/api/revisions/${encodeURIComponent(id)}`).then(json);

export const deleteRevision = (id) =>
  fetch(`/api/revisions/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
    json
  );

export const listVersions = () => fetch("/api/versions").then(json);

export const createVersion = (name, lang, doc) =>
  fetch("/api/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, lang, doc }),
  }).then(json);

export const getVersion = (name, lang) =>
  fetch(`/api/versions/${encodeURIComponent(name)}/${lang}`).then(json);

export const deleteVersion = (name, lang) =>
  fetch(`/api/versions/${encodeURIComponent(name)}/${lang}`, {
    method: "DELETE",
  }).then(json);

// AI: tailor the whole CV to a job posting. `job` is { text } or { url }.
// `opts` may carry { extraContext, research }. Returns a new tailored document
// (same shape as the current doc).
export const tailorCv = (lang, doc, job, opts = {}) =>
  fetch("/api/ai/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, doc, job, ...opts }),
  }).then(json);

// AI: stream a cover letter. Calls `onChunk(textSoFar)` as text arrives and
// resolves with the full letter. `job` is { text } or { url }; `opts` may carry
// { tone, extraContext, research }.
export const coverLetter = async (lang, doc, job, opts = {}, onChunk) => {
  const res = await fetch("/api/ai/cover-letter", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, doc, job, ...opts }),
  });
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let full = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    full += decoder.decode(value, { stream: true });
    onChunk?.(full);
  }
  full += decoder.decode();
  onChunk?.(full);
  return full;
};

// Avatar: a single shared image file. `dataUrl` is a base64 data URL.
export const uploadAvatar = (dataUrl) =>
  fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  }).then(json);

export const deleteAvatar = () =>
  fetch("/api/avatar", { method: "DELETE" }).then(json);

// Whether a custom avatar is stored on disk. GET /api/avatar returns the image
// (200) or 404 when none exists; we only need the status, not the bytes.
export const avatarExists = () =>
  fetch("/api/avatar", { method: "GET" })
    .then((res) => ({ exists: res.ok }))
    .catch(() => ({ exists: false }));

// URL for the current avatar; `v` busts the browser cache after a change.
export const avatarUrl = (v) => `/api/avatar?v=${v}`;

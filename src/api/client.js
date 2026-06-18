// Thin fetch wrappers around the local file-backed API (see server/api.js).
async function json(res) {
  if (!res.ok) throw new Error(`API ${res.status}: ${await res.text()}`);
  return res.json();
}

// --- versions -------------------------------------------------------------
export const listVersions = () => fetch("/api/versions").then(json);

export const createVersion = (name, fromVersionId = null) =>
  fetch("/api/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, fromVersionId }),
  }).then(json);

export const renameVersion = (id, name) =>
  fetch(`/api/versions/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  }).then(json);

export const deleteVersion = (id) =>
  fetch(`/api/versions/${encodeURIComponent(id)}`, { method: "DELETE" }).then(
    json
  );

// --- documents (per version + language) -----------------------------------
export const getCv = (versionId, lang) =>
  fetch(`/api/cv/${encodeURIComponent(versionId)}/${lang}`).then(json);

export const putCv = (versionId, lang, doc) =>
  fetch(`/api/cv/${encodeURIComponent(versionId)}/${lang}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(doc),
  }).then(json);

export const deleteCvLang = (versionId, lang) =>
  fetch(`/api/cv/${encodeURIComponent(versionId)}/${lang}`, {
    method: "DELETE",
  }).then(json);

// --- languages (label store: translated UI section headings) --------------
export const listLanguages = () => fetch("/api/languages").then(json);

// AI: translate a version's document into a new language (a copy inside the
// same version). Re-run to refresh an existing translation.
export const translate = (versionId, sourceLang, targetLang) =>
  fetch("/api/ai/translate", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ versionId, sourceLang, targetLang }),
  }).then(json);

// AI: tailor the whole CV to a job posting. `job` is { text } or { url }.
// `opts` may carry { extraContext, research, cvSource }. Returns a new tailored
// document (same shape as the current doc).
export const tailorCv = (lang, doc, job, opts = {}) =>
  fetch("/api/ai/tailor", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, doc, job, ...opts }),
  }).then(json);

// AI: improve one editable main-content target (bio, bullet, experience item,
// project, or main custom-section content). Returns the full updated document.
export const improveInline = (lang, doc, target, opts = {}) =>
  fetch("/api/ai/inline", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ lang, doc, target, ...opts }),
  }).then(json);

// AI: stream a cover letter. Calls `onChunk(textSoFar)` as text arrives and
// resolves with the full letter. `job` is { text } or { url }; `opts` may carry
// { tone, extraContext, research, cvSource }.
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

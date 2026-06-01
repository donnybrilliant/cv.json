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

// Avatar: a single shared image file. `dataUrl` is a base64 data URL.
export const uploadAvatar = (dataUrl) =>
  fetch("/api/avatar", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ dataUrl }),
  }).then(json);

export const deleteAvatar = () => fetch("/api/avatar", { method: "DELETE" }).then(json);

// URL for the current avatar; `v` busts the browser cache after a change.
export const avatarUrl = (v) => `/api/avatar?v=${v}`;

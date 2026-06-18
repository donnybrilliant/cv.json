import { create } from "zustand";
import { temporal } from "zundo";
import { immer } from "zustand/middleware/immer";
import * as api from "../api/client";
import { buildCustomTheme, CUSTOM_THEME, DEFAULT_THEME } from "../themes";

// Ensure a loaded doc has the fields newer features rely on, so older files
// (saved before themes/projects/section-hiding existed) don't crash the UI.
// These defaults persist to disk on the first subsequent edit.
function normalizeDoc(doc) {
  if (!doc || typeof doc !== "object") return doc;
  if (!Array.isArray(doc.projects)) doc.projects = [];
  if (!Array.isArray(doc.customSections)) doc.customSections = [];
  if (!Array.isArray(doc.hiddenSections)) doc.hiddenSections = [];
  if (!doc.theme || typeof doc.theme !== "object") doc.theme = { color: DEFAULT_THEME };
  if (!doc.theme.color) doc.theme.color = DEFAULT_THEME;
  if (doc.theme.color === CUSTOM_THEME && !doc.theme.custom) {
    doc.theme.color = DEFAULT_THEME;
  }

  // Contact model: email is a bare dedicated field; phones & locations are
  // lists; everything else (portfolio, profiles, …) lives in a flexible links
  // list. Migrate older shapes (fixed fields, or email/phone-in-links).
  const c = doc.personalInfo?.contact;
  if (c) {
    if (!Array.isArray(c.links)) c.links = [];
    // Pull email/phone back out of links (an earlier format kept them there).
    const mailLink = c.links.find((l) => /^mailto:/i.test(l?.url || ""));
    const telLinks = c.links.filter((l) => /^tel:/i.test(l?.url || ""));
    if (mailLink && c.email == null) c.email = mailLink.url.replace(/^mailto:/i, "").trim();
    c.links = c.links.filter((l) => l !== mailLink && !telLinks.includes(l));
    // Migrate legacy fixed link fields into the list.
    if (c.website) {
      c.links.push({ url: c.website, label: "Portfolio" });
      delete c.website;
    }
    if (c.github) {
      c.links.push({ url: c.github });
      delete c.github;
    }
    if (c.linkedin) {
      c.links.push({ url: c.linkedin });
      delete c.linkedin;
    }
    if (typeof c.email !== "string") c.email = "";
    if (!Array.isArray(c.phones)) c.phones = [];
    if (typeof c.phone === "string" && c.phone.trim()) {
      const num = c.phone.trim();
      if (!c.phones.includes(num)) c.phones.unshift(num);
    }
    for (const link of telLinks) {
      const num = link.url.replace(/^tel:/i, "").trim();
      if (num && !c.phones.includes(num)) c.phones.push(num);
    }
    delete c.phone;
    c.phones = c.phones.map((p) => String(p || ""));
    if (!Array.isArray(c.locations)) c.locations = [];
  }

  return doc;
}

// Walk into a document to the parent of the final path segment.
function parentOf(doc, path) {
  let node = doc;
  for (let i = 0; i < path.length - 1; i++) node = node[path[i]];
  return { parent: node, key: path[path.length - 1] };
}

// Walk into a document to the node at `path` (expected to be an array).
function nodeAt(doc, path) {
  let node = doc;
  for (const p of path) node = node[p];
  return node;
}

const DEBOUNCE_MS = 600;
let saveTimer = null;
let suppressSave = false; // true while loading/replacing the whole doc

export const useCvStore = create()(
  temporal(
    immer((set, get) => ({
      doc: null,
      versionId: null, // the version (named CV) currently being edited
      lang: "no",
      versions: [], // [{ id, name, langs: [code, …] }]
      languages: [], // language label store: [{ code, builtin, labels }]
      editMode: false,
      saveState: "idle", // idle | saving | saved | error
      loading: true,
      avatarVersion: 0, // bumped after avatar upload to bust the image cache (UI-only)
      avatarExists: false,
      aiStatus: "idle", // idle | tailoring | translating | error (UI-only)
      aiError: null,

      clearAiState: () =>
        set((d) => {
          d.aiStatus = "idle";
          d.aiError = null;
        }),

      setSaveState: (s) =>
        set((d) => {
          d.saveState = s;
        }),

      toggleEdit: () =>
        set((d) => {
          d.editMode = !d.editMode;
        }),

      setEditMode: (on) =>
        set((d) => {
          d.editMode = on;
        }),

      // Load a version's document for a language. Not an undoable step.
      load: async (versionId, lang) => {
        set((d) => {
          d.loading = true;
        });
        const doc = normalizeDoc(await api.getCv(versionId, lang));
        suppressSave = true;
        set((d) => {
          d.doc = doc;
          d.versionId = versionId;
          d.lang = lang;
          d.loading = false;
        });
        try {
          const meta = await api.avatarExists();
          set((d) => {
            d.avatarExists = Boolean(meta?.exists);
          });
        } catch {
          set((d) => {
            d.avatarExists = false;
          });
        }
        useCvStore.temporal.getState().clear(); // fresh history per doc
        suppressSave = false;
      },

      // Switch to another version, keeping the current language when that
      // version has it (else falling back to one it does have).
      switchVersion: async (id) => {
        if (id === get().versionId) return;
        const v = get().versions.find((x) => x.id === id);
        const langs = v?.langs || [];
        const lang = langs.includes(get().lang) ? get().lang : langs[0] || "en";
        await get().load(id, lang);
      },

      // Switch language within the current version.
      setLang: (lang) => {
        if (lang === get().lang) return;
        get().load(get().versionId, lang);
      },

      // Load the version list. Not undoable.
      loadVersions: async () => {
        const versions = await api.listVersions();
        set((d) => {
          d.versions = versions;
        });
        return versions;
      },

      // Load the language label store. Not undoable.
      loadLanguages: async () => {
        const langs = await api.listLanguages();
        set((d) => {
          d.languages = langs;
        });
        return langs;
      },

      // --- versions: create / duplicate / rename / delete ---
      createVersion: async (name, fromVersionId = null) => {
        const v = await api.createVersion(name, fromVersionId);
        await get().loadVersions();
        return v;
      },

      // Copy the current version under a new name (the usual way to spin up a
      // sector variant, then tailor the copy and leave the original intact).
      duplicateVersion: async (name) => {
        const v = await api.createVersion(name, get().versionId);
        await get().loadVersions();
        return v;
      },

      renameVersion: async (id, name) => {
        await api.renameVersion(id, name);
        await get().loadVersions();
      },

      deleteVersion: async (id) => {
        await api.deleteVersion(id);
        const versions = await get().loadVersions();
        if (get().versionId === id && versions[0]) {
          await get().load(versions[0].id, versions[0].langs[0] || "en");
        }
      },

      // --- languages within the current version ---
      // Translate the current version into a new language (a copy), then switch
      // to it for review.
      addTranslation: async (targetLang) => {
        set((d) => {
          d.aiStatus = "translating";
          d.aiError = null;
        });
        try {
          const { versionId, lang } = get();
          await api.translate(versionId, lang, targetLang);
          await get().loadVersions();
          await get().loadLanguages();
          await get().load(versionId, targetLang); // force-load the new doc
          set((d) => {
            d.aiStatus = "idle";
          });
        } catch (e) {
          set((d) => {
            d.aiStatus = "error";
            d.aiError = String(e?.message || e);
          });
          throw e;
        }
      },

      // Remove one language's document from the current version (keeps at least
      // one language so the version is never empty).
      removeTranslation: async (lang) => {
        const { versionId, versions } = get();
        const v = versions.find((x) => x.id === versionId);
        if ((v?.langs || []).length <= 1) return;
        await api.deleteCvLang(versionId, lang);
        const next = await get().loadVersions();
        if (get().lang === lang) {
          const cur = next.find((x) => x.id === versionId);
          const fallback = (cur?.langs || []).find((c) => c !== lang) || (cur?.langs || [])[0];
          if (fallback) await get().load(versionId, fallback);
        }
      },

      // --- path-based editing actions (path is an array, e.g. ["personalInfo","bio"]) ---
      setField: (path, value) =>
        set((d) => {
          const { parent, key } = parentOf(d.doc, path);
          parent[key] = value;
        }),

      addItem: (path, item) =>
        set((d) => {
          nodeAt(d.doc, path).push(item);
        }),

      removeItem: (path, index) =>
        set((d) => {
          nodeAt(d.doc, path).splice(index, 1);
        }),

      moveItem: (path, from, to) =>
        set((d) => {
          const node = nodeAt(d.doc, path);
          if (to < 0 || to >= node.length) return;
          const [m] = node.splice(from, 1);
          node.splice(to, 0, m);
        }),

      // Replace the whole doc (import / restore). Recorded so it can be undone.
      replaceDoc: (doc) =>
        set((d) => {
          d.doc = normalizeDoc(doc);
        }),

      // --- section visibility (hidden sections are excluded from Print/PDF) ---
      toggleSection: (key) =>
        set((d) => {
          const hidden = d.doc.hiddenSections;
          const i = hidden.indexOf(key);
          if (i === -1) hidden.push(key);
          else hidden.splice(i, 1);
        }),

      // --- custom sections (flexible, user-defined sections with an editable
      // title, pickable icon, and a flat list of rich entries) ---
      addCustomSection: (placement) =>
        set((d) => {
          d.doc.customSections.push({
            id: `cs-${crypto.randomUUID()}`,
            icon: "link",
            title: "New section",
            placement,
            items: [],
          });
        }),

      // Remove a section and drop any leftover visibility entry for its id.
      removeCustomSection: (index) =>
        set((d) => {
          const [removed] = d.doc.customSections.splice(index, 1);
          if (!removed) return;
          const i = d.doc.hiddenSections.indexOf(removed.id);
          if (i !== -1) d.doc.hiddenSections.splice(i, 1);
        }),

      // --- theme (per-CV, stored in the document) ---
      setTheme: (color) =>
        set((d) => {
          if (!d.doc.theme) d.doc.theme = {};
          d.doc.theme.color = color;
          if (color !== CUSTOM_THEME) delete d.doc.theme.custom;
        }),

      setCustomTheme: (accentHex) =>
        set((d) => {
          if (!d.doc.theme) d.doc.theme = {};
          d.doc.theme.color = CUSTOM_THEME;
          d.doc.theme.custom = buildCustomTheme(accentHex);
        }),

      // --- avatar (a single image file on disk, shared across languages) ---
      uploadAvatar: async (dataUrl) => {
        await api.uploadAvatar(dataUrl);
        set((d) => {
          d.avatarVersion += 1;
          d.avatarExists = true;
        });
      },
      deleteAvatar: async () => {
        await api.deleteAvatar();
        set((d) => {
          d.avatarVersion += 1;
          d.avatarExists = false;
        });
      },

      // --- AI: tailor the whole CV to a job posting ---
      // Applies in place to the current version (per design) and is undoable via
      // ⌘Z. To keep an untouched original, duplicate the version first. `job` is
      // { text } or { url }; `opts` may carry { extraContext, research }.
      aiTailor: async (job, opts = {}) => {
        set((d) => {
          d.aiStatus = "tailoring";
          d.aiError = null;
        });
        try {
          const { versionId, lang, doc } = get();
          const cvSource = `versions/${versionId}/cv.${lang}.json`;
          const tailored = await api.tailorCv(lang, doc, job, { ...opts, cvSource });
          get().replaceDoc(tailored); // undoable + autosaves to disk
          set((d) => {
            d.aiStatus = "idle";
          });
        } catch (e) {
          set((d) => {
            d.aiStatus = "error";
            d.aiError = String(e?.message || e);
          });
          throw e;
        }
      },
    })),
    {
      // Only track the document in history (not lang/editMode/saveState).
      partialize: (state) => ({ doc: state.doc }),
      limit: 100,
      equality: (a, b) => a.doc === b.doc,
    }
  )
);

// Autosave: any change to `doc` (edits, add/remove/move, undo, redo) is debounced
// and written to disk. Suppressed while loading a fresh doc.
useCvStore.subscribe((state, prev) => {
  if (suppressSave) return;
  if (state.doc && prev.doc && state.doc !== prev.doc) {
    useCvStore.getState().setSaveState("saving");
    clearTimeout(saveTimer);
    saveTimer = setTimeout(async () => {
      try {
        const { versionId, lang, doc } = useCvStore.getState();
        await api.putCv(versionId, lang, doc);
        useCvStore.getState().setSaveState("saved");
      } catch {
        useCvStore.getState().setSaveState("error");
      }
    }, DEBOUNCE_MS);
  }
});

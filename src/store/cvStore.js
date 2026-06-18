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
      lang: "no",
      cvSource: null, // debug label: data/cv.{lang}.json or data/versions/{name}.{lang}.json
      editMode: false,
      saveState: "idle", // idle | saving | saved | error
      loading: true,
      avatarVersion: 0, // bumped after avatar upload to bust the image cache (UI-only)
      avatarExists: false,
      aiStatus: "idle", // idle | tailoring | error (UI-only)
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

      // Load a language's doc from disk. Not an undoable step.
      load: async (lang) => {
        set((d) => {
          d.loading = true;
        });
        const doc = normalizeDoc(await api.getCv(lang));
        suppressSave = true;
        set((d) => {
          d.doc = doc;
          d.lang = lang;
          d.cvSource = `data/cv.${lang}.json`;
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

      setLang: (lang) => {
        if (lang === get().lang) return;
        get().load(lang);
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

      // --- versions ---
      saveVersion: async (name) => {
        const { lang, doc } = get();
        return api.createVersion(name, lang, doc);
      },
      restoreVersion: async (name) => {
        const { lang } = get();
        const doc = await api.getVersion(name, lang);
        get().replaceDoc(doc); // undoable
        set((d) => {
          d.cvSource = `data/versions/${name}.${lang}.json`;
        });
      },

      // --- AI: tailor the whole CV to a job posting ---
      // Applies immediately (per design); a safety snapshot is saved first and
      // the change is undoable via ⌘Z. `job` is { text } or { url }; `opts` may
      // carry { extraContext, research }.
      aiTailor: async (job, opts = {}) => {
        set((d) => {
          d.aiStatus = "tailoring";
          d.aiError = null;
        });
        try {
          const { lang, doc, cvSource } = get();
          const stamp = new Date().toISOString().slice(0, 16).replace(/[:T]/g, "-");
          // Best-effort safety net; don't block tailoring if it fails.
          await api.createVersion(`before-tailor-${stamp}`, lang, doc).catch(() => {});
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
        const { lang, doc } = useCvStore.getState();
        await api.putCv(lang, doc);
        useCvStore.getState().setSaveState("saved");
      } catch {
        useCvStore.getState().setSaveState("error");
      }
    }, DEBOUNCE_MS);
  }
});

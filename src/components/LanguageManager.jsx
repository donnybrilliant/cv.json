import { useCallback, useEffect, useState } from "react";
import {
  Languages as LanguagesIcon,
  Plus,
  Check,
  Loader2,
  Trash2,
  RotateCcw,
  AlertTriangle,
  Sparkles,
  X,
  Save,
  History,
} from "lucide-react";
import { useCvStore } from "../store/cvStore";
import * as api from "../api/client";
import { LANGUAGE_CATALOG, nativeName, englishName } from "../i18n/languages";

// Human-friendly labels for revision kinds shown in the history list.
const KIND_LABEL = {
  source: "Source version",
  translation: "AI translation",
  "tailor-before": "Before tailoring",
  "tailor-after": "Tailored to job",
  manual: "Snapshot",
};

function ReviewBadge({ status, stale }) {
  if (stale)
    return (
      <span className="inline-flex items-center gap-1 text-xs text-amber-700 bg-amber-50 rounded px-1.5 py-0.5">
        <AlertTriangle className="w-3 h-3" /> Source changed
      </span>
    );
  if (status === "needs-review")
    return (
      <span className="inline-flex items-center gap-1 text-xs text-blue-700 bg-blue-50 rounded px-1.5 py-0.5">
        Needs review
      </span>
    );
  return (
    <span className="inline-flex items-center gap-1 text-xs text-green-700 bg-green-50 rounded px-1.5 py-0.5">
      <Check className="w-3 h-3" /> Reviewed
    </span>
  );
}

export default function LanguageManager() {
  const [open, setOpen] = useState(false);
  const [sourceLang, setSourceLang] = useState("");
  const [targetLang, setTargetLang] = useState("");
  const [revisions, setRevisions] = useState([]);
  const [error, setError] = useState(null);
  const [pendingCode, setPendingCode] = useState(null); // code being generated/refreshed

  const lang = useCvStore((s) => s.lang);
  const languages = useCvStore((s) => s.languages);
  const setLang = useCvStore((s) => s.setLang);
  const createLanguage = useCvStore((s) => s.createLanguage);
  const markReviewed = useCvStore((s) => s.markReviewed);
  const removeLanguage = useCvStore((s) => s.removeLanguage);
  const saveSourceVersion = useCvStore((s) => s.saveSourceVersion);
  const restoreRevision = useCvStore((s) => s.restoreRevision);
  const aiStatus = useCvStore((s) => s.aiStatus);
  const aiError = useCvStore((s) => s.aiError);

  const translating = aiStatus === "translating";
  const enabled = languages.filter((l) => l.enabled !== false);

  // Languages that can still be added (in the catalog, not already enabled).
  const addable = LANGUAGE_CATALOG.filter(
    (c) => !enabled.some((l) => l.code === c.code)
  );

  const refreshRevisions = useCallback(
    async (code) => {
      try {
        setRevisions(await api.listRevisions(code || lang));
      } catch {
        setRevisions([]);
      }
    },
    [lang]
  );

  // Open the drawer: seed the translation source with the current language and
  // load this language's history. Done in the handler (not an effect) to avoid
  // cascading renders.
  const openDrawer = () => {
    setSourceLang((s) => s || lang);
    setOpen(true);
    refreshRevisions();
  };

  // Close on Escape unless a generation is running.
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !translating) setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, translating]);

  const onGenerate = async () => {
    setError(null);
    if (!sourceLang || !targetLang) {
      setError("Pick a source and a target language.");
      return;
    }
    setPendingCode(targetLang);
    const created = targetLang;
    try {
      await createLanguage(created, sourceLang, false);
      setTargetLang("");
      await refreshRevisions(created);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setPendingCode(null);
    }
  };

  const onRetranslate = async (code, src) => {
    setError(null);
    if (!src) {
      setError("This language has no recorded source to refresh from.");
      return;
    }
    if (
      !window.confirm(
        `Re-translate ${nativeName(code)} from ${nativeName(src)}? ` +
          "The current version is saved to history first and can be restored."
      )
    )
      return;
    setPendingCode(code);
    try {
      await createLanguage(code, src, true);
      await refreshRevisions(code);
    } catch (e) {
      setError(String(e?.message || e));
    } finally {
      setPendingCode(null);
    }
  };

  const onDelete = async (code) => {
    if (!window.confirm(`Delete the ${nativeName(code)} CV and its history?`))
      return;
    setError(null);
    try {
      await removeLanguage(code);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const onSaveSource = async () => {
    setError(null);
    const label = window.prompt(
      "Name this source version (e.g. master-2026):",
      "Source version"
    );
    if (!label) return;
    try {
      await saveSourceVersion(label.trim());
      await refreshRevisions();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const onRestore = async (id) => {
    setError(null);
    try {
      await restoreRevision(id);
      setOpen(false);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const onDeleteRevision = async (id) => {
    try {
      await api.deleteRevision(id);
      await refreshRevisions();
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const shownError = error || (aiStatus === "error" ? aiError : null);

  return (
    <>
      <button
        onClick={openDrawer}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
        title="Manage languages, source versions & history"
      >
        <LanguagesIcon className="w-4 h-4" /> Languages
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden">
          <div className="absolute inset-0 bg-black/30" onClick={() => !translating && setOpen(false)} />
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <LanguagesIcon className="w-5 h-5 text-blue-600" /> Languages
              </h2>
              <button
                onClick={() => !translating && setOpen(false)}
                disabled={translating}
                className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-6">
              {shownError && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="break-words">{shownError}</span>
                </div>
              )}

              {/* Existing languages */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  Your languages
                </h3>
                <ul className="space-y-2">
                  {enabled.map((l) => {
                    const busy = pendingCode === l.code;
                    return (
                      <li
                        key={l.code}
                        className={`rounded border px-3 py-2 ${
                          l.code === lang ? "border-blue-300 bg-blue-50/40" : "border-gray-200"
                        }`}
                      >
                        <div className="flex items-center justify-between gap-2">
                          <button
                            onClick={() => {
                              setLang(l.code);
                              setOpen(false);
                            }}
                            className="flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-blue-700 cursor-pointer"
                            title={`Switch to ${englishName(l.code)}`}
                          >
                            <span className="uppercase text-xs text-gray-400 w-7">{l.code}</span>
                            {nativeName(l.code)}
                          </button>
                          <ReviewBadge status={l.reviewStatus} stale={l.stale} />
                        </div>
                        <div className="mt-2 flex flex-wrap items-center gap-1.5">
                          {l.reviewStatus !== "reviewed" && (
                            <button
                              onClick={() => markReviewed(l.code)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded text-green-700 hover:bg-green-50 cursor-pointer"
                              title="Mark as reviewed"
                            >
                              <Check className="w-3.5 h-3.5" /> Mark reviewed
                            </button>
                          )}
                          {l.sourceLang && (
                            <button
                              onClick={() => onRetranslate(l.code, l.sourceLang)}
                              disabled={busy || translating}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded text-blue-700 hover:bg-blue-50 disabled:opacity-40 cursor-pointer"
                              title={`Re-translate from ${nativeName(l.sourceLang)}`}
                            >
                              {busy ? (
                                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                              ) : (
                                <Sparkles className="w-3.5 h-3.5" />
                              )}
                              Refresh from {l.sourceLang.toUpperCase()}
                            </button>
                          )}
                          {!l.builtin && (
                            <button
                              onClick={() => onDelete(l.code)}
                              className="flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                              title="Delete language"
                            >
                              <Trash2 className="w-3.5 h-3.5" /> Delete
                            </button>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>

              {/* Add a language */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  Add a language
                </h3>
                <p className="text-xs text-gray-500">
                  Generate a new language by AI-translating from an existing one.
                  The result is saved as a draft and marked “Needs review”.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={sourceLang}
                    onChange={(e) => setSourceLang(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    {enabled.map((l) => (
                      <option key={l.code} value={l.code}>
                        From: {nativeName(l.code)}
                      </option>
                    ))}
                  </select>
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">To: choose…</option>
                    {addable.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.nativeName} ({c.englishName})
                      </option>
                    ))}
                  </select>
                </div>
                <button
                  onClick={onGenerate}
                  disabled={translating || !targetLang}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  {translating ? (
                    <Loader2 className="w-4 h-4 animate-spin" />
                  ) : (
                    <Plus className="w-4 h-4" />
                  )}
                  Generate translation
                </button>
              </section>

              {/* Source versions & history for the current language */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  History — {nativeName(lang)}
                </h3>
                <button
                  onClick={onSaveSource}
                  className="w-full flex items-center justify-center gap-2 px-4 py-2 text-sm rounded bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 cursor-pointer"
                  title="Save the current CV as a trusted source version"
                >
                  <Save className="w-4 h-4" /> Save current as source version
                </button>

                {revisions.length === 0 ? (
                  <p className="text-sm text-gray-400 py-2">No history yet.</p>
                ) : (
                  <ul className="space-y-1.5">
                    {revisions.map((r) => (
                      <li
                        key={r.id}
                        className="flex items-center justify-between gap-2 rounded px-2 py-1.5 hover:bg-gray-50"
                      >
                        <div className="min-w-0">
                          <div className="flex items-center gap-1.5 text-sm text-gray-800 truncate">
                            <History className="w-3.5 h-3.5 text-gray-400 shrink-0" />
                            {r.label || KIND_LABEL[r.kind] || "Snapshot"}
                          </div>
                          <div className="text-xs text-gray-400">
                            {KIND_LABEL[r.kind] || r.kind} ·{" "}
                            {new Date(r.createdAt).toLocaleString()}
                          </div>
                        </div>
                        <div className="flex gap-1 shrink-0">
                          <button
                            onClick={() => onRestore(r.id)}
                            className="p-1 rounded text-gray-500 hover:text-blue-700 cursor-pointer"
                            title="Restore this version"
                          >
                            <RotateCcw className="w-4 h-4" />
                          </button>
                          <button
                            onClick={() => onDeleteRevision(r.id)}
                            className="p-1 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                            title="Delete from history"
                          >
                            <Trash2 className="w-4 h-4" />
                          </button>
                        </div>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

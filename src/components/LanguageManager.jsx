import { useEffect, useState } from "react";
import {
  Languages as LanguagesIcon,
  Plus,
  Loader2,
  Trash2,
  AlertTriangle,
  X,
} from "lucide-react";
import { useCvStore } from "../store/cvStore";
import { LANGUAGE_CATALOG, nativeName, englishName } from "../i18n/languages";

// Languages panel, scoped to the current version: switch between the languages
// this version has, remove one, or AI-translate the current language into a new
// one (a copy inside the same version). No source/review/history concepts — a
// translation is just another language of the version you can refresh anytime.
export default function LanguageManager() {
  const [open, setOpen] = useState(false);
  const [targetLang, setTargetLang] = useState("");
  const [error, setError] = useState(null);

  const lang = useCvStore((s) => s.lang);
  const versions = useCvStore((s) => s.versions);
  const versionId = useCvStore((s) => s.versionId);
  const setLang = useCvStore((s) => s.setLang);
  const addTranslation = useCvStore((s) => s.addTranslation);
  const removeTranslation = useCvStore((s) => s.removeTranslation);
  const aiStatus = useCvStore((s) => s.aiStatus);
  const aiError = useCvStore((s) => s.aiError);

  const translating = aiStatus === "translating";
  const current = versions.find((v) => v.id === versionId);
  const versionLangs = current?.langs || [];

  // Catalog languages this version doesn't have yet.
  const addable = LANGUAGE_CATALOG.filter((c) => !versionLangs.includes(c.code));

  // Close on Escape unless a translation is running.
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
    if (!targetLang) {
      setError("Choose a language to translate into.");
      return;
    }
    try {
      await addTranslation(targetLang);
      setTargetLang("");
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const onRetranslate = async (code) => {
    setError(null);
    if (
      !window.confirm(
        `Re-translate ${nativeName(code)} from ${nativeName(lang)}? ` +
          "This replaces the current text for that language."
      )
    )
      return;
    try {
      // addTranslation overwrites an existing language too.
      const src = lang;
      if (src === code) {
        setError("Switch to a different language first, then refresh this one.");
        return;
      }
      await addTranslation(code);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const onDelete = async (code) => {
    if (!window.confirm(`Remove the ${nativeName(code)} version of this CV?`)) return;
    setError(null);
    try {
      await removeTranslation(code);
    } catch (e) {
      setError(String(e?.message || e));
    }
  };

  const shownError = error || (aiStatus === "error" ? aiError : null);

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
        title="Manage this version's languages"
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
                {current && (
                  <span className="text-sm font-normal text-gray-400">· {current.name}</span>
                )}
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

              {/* Languages this version has */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  In this version
                </h3>
                <ul className="space-y-2">
                  {versionLangs.map((code) => (
                    <li
                      key={code}
                      className={`flex items-center justify-between gap-2 rounded border px-3 py-2 ${
                        code === lang ? "border-blue-300 bg-blue-50/40" : "border-gray-200"
                      }`}
                    >
                      <button
                        onClick={() => {
                          setLang(code);
                          setOpen(false);
                        }}
                        className="flex items-center gap-2 text-sm font-medium text-gray-800 hover:text-blue-700 cursor-pointer"
                        title={`Switch to ${englishName(code)}`}
                      >
                        <span className="uppercase text-xs text-gray-400 w-7">{code}</span>
                        {nativeName(code)}
                        {code === lang && (
                          <span className="text-xs font-normal text-gray-400">editing</span>
                        )}
                      </button>
                      <div className="flex items-center gap-1.5">
                        {code !== lang && (
                          <button
                            onClick={() => onRetranslate(code)}
                            disabled={translating}
                            className="px-2 py-1 text-xs rounded text-blue-700 hover:bg-blue-50 disabled:opacity-40 cursor-pointer"
                            title={`Re-translate from ${nativeName(lang)}`}
                          >
                            Refresh from {lang.toUpperCase()}
                          </button>
                        )}
                        {versionLangs.length > 1 && (
                          <button
                            onClick={() => onDelete(code)}
                            className="p-1 rounded text-gray-500 hover:text-red-600 hover:bg-red-50 cursor-pointer"
                            title="Remove this language"
                          >
                            <Trash2 className="w-3.5 h-3.5" />
                          </button>
                        )}
                      </div>
                    </li>
                  ))}
                </ul>
              </section>

              {/* Add a language */}
              <section className="space-y-2">
                <h3 className="text-xs font-semibold uppercase text-gray-400">
                  Translate to another language
                </h3>
                <p className="text-xs text-gray-500">
                  Makes a copy of this version (from {nativeName(lang)}) in the
                  language you pick. Re-run anytime to refresh it.
                </p>
                <div className="flex items-center gap-2">
                  <select
                    value={targetLang}
                    onChange={(e) => setTargetLang(e.target.value)}
                    className="flex-1 rounded border border-gray-300 px-2 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  >
                    <option value="">Choose a language…</option>
                    {addable.map((c) => (
                      <option key={c.code} value={c.code}>
                        {c.nativeName} ({c.englishName})
                      </option>
                    ))}
                  </select>
                  <button
                    onClick={onGenerate}
                    disabled={translating || !targetLang}
                    className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                  >
                    {translating ? (
                      <Loader2 className="w-4 h-4 animate-spin" />
                    ) : (
                      <Plus className="w-4 h-4" />
                    )}
                    Translate
                  </button>
                </div>
              </section>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useCvStore } from "./store/cvStore";
import { themeVars } from "./themes";
import { resolveLabels, isRtl } from "./i18n/languages";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import Experience from "./components/Experience";
import Projects from "./components/Projects";
import CustomSections from "./components/CustomSections";
import Editable from "./components/Editable";
import RowControls from "./components/RowControls";

function Header() {
  const doc = useCvStore((s) => s.doc);
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const aiImproveTarget = useCvStore((s) => s.aiImproveTarget);

  const titles = doc.personalInfo.titles;
  const [idx, setIdx] = useState(0);

  // Rotate the title every 3s in view mode only. `rotating` is derived so it
  // stays correct when titles are edited, without resetting state in the effect.
  useEffect(() => {
    if (editMode) return;
    const id = setInterval(() => setIdx((i) => i + 1), 3000);
    return () => clearInterval(id);
  }, [editMode]);
  const rotating = titles.length ? titles[idx % titles.length] : "";

  return (
    <header className="my-8">
      <div className="flex items-center justify-between gap-2 mb-4 font-bold">
        <Editable
          as="h1"
          className="text-3xl"
          value={doc.personalInfo.name}
          onChange={(v) => setField(["personalInfo", "name"], v)}
        />
        {!editMode && (
          <h2 className="text-2xl transition-all duration-500 ease-in-out">
            {rotating}
          </h2>
        )}
      </div>

      {/* In edit mode, manage the list of rotating titles */}
      {editMode && (
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          {titles.map((t, i) => (
            <span
              key={i}
              className="relative text-sm bg-[var(--cv-chip-bg)] px-2 py-1 rounded flex items-center gap-1"
            >
              <Editable
                inline
                value={t}
                onChange={(v) => setField(["personalInfo", "titles", i], v)}
              />
              <button
                onClick={() => removeItem(["personalInfo", "titles"], i)}
                className="text-gray-400 hover:text-red-600 cursor-pointer"
                aria-label="Remove title"
              >
                ×
              </button>
            </span>
          ))}
          <button
            onClick={() => addItem(["personalInfo", "titles"], "New title")}
            className="flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer"
          >
            <Plus className="w-3.5 h-3.5" /> Add title
          </button>
        </div>
      )}

      <div className="relative group/bio pr-12">
        <Editable
          as="div"
          multiline
          className="text-sm opacity-90 mt-5 whitespace-pre-line w-full"
          value={doc.personalInfo.bio}
          onChange={(v) => setField(["personalInfo", "bio"], v)}
        />
        <RowControls
          group="bio"
          onAi={() => aiImproveTarget({ path: ["personalInfo", "bio"] })}
        />
      </div>
    </header>
  );
}

export default function App() {
  const doc = useCvStore((s) => s.doc);
  const lang = useCvStore((s) => s.lang);
  const languages = useCvStore((s) => s.languages);
  const load = useCvStore((s) => s.load);
  const loadVersions = useCvStore((s) => s.loadVersions);
  const loadLanguages = useCvStore((s) => s.loadLanguages);

  // Initial load: fetch the version list + language labels, then open the first
  // version (preferring the previous "no" default for its language).
  useEffect(() => {
    (async () => {
      try {
        const [versions] = await Promise.all([loadVersions(), loadLanguages()]);
        const v = versions[0];
        if (v) {
          const initial = v.langs.includes("no") ? "no" : v.langs[0] || "en";
          await load(v.id, initial);
        }
      } catch (e) {
        console.error("Failed to load CV:", e);
      }
    })();
  }, [load, loadVersions, loadLanguages]);

  if (!doc) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-100">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600">Loading CV…</p>
        </div>
      </div>
    );
  }

  const langMeta = languages.find((l) => l.code === lang);
  const labels = resolveLabels(langMeta?.labels);

  return (
    <>
      <Toolbar labels={labels} />
      <div
        id="cv-root"
        dir={isRtl(lang) ? "rtl" : "ltr"}
        style={themeVars(doc.theme)}
        className="w-full max-w-4xl mx-auto bg-white shadow-lg font-sans mt-16 print:mt-0"
      >
        <div className="grid grid-cols-3 min-h-[1056px]">
          <Sidebar labels={labels} />
          <div className="col-span-2 p-6">
            <Header />
            <Experience labels={labels} />
            <Projects labels={labels} />
            <CustomSections zone="main" />
          </div>
        </div>
      </div>
    </>
  );
}

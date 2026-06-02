import { useState, useEffect } from "react";
import { Plus } from "lucide-react";
import { useCvStore } from "./store/cvStore";
import { themeVars } from "./themes";
import Toolbar from "./components/Toolbar";
import Sidebar from "./components/Sidebar";
import Experience from "./components/Experience";
import Projects from "./components/Projects";
import Editable from "./components/Editable";

const uiLabels = {
  no: {
    contact: "Kontakt",
    education: "Utdanning",
    skills: "Ferdigheter",
    certifications: "Sertifiseringer",
    languages: "Språk",
    workExperience: "Arbeidserfaring",
    projects: "Prosjekter",
    print: "Skriv ut CV",
    switchTo: { no: "Norsk", en: "Engelsk", es: "Spansk" },
  },
  en: {
    contact: "Contact",
    education: "Education",
    skills: "Skills",
    certifications: "Certifications",
    languages: "Languages",
    workExperience: "Work Experience",
    projects: "Projects",
    print: "Print Resume",
    switchTo: { no: "Norwegian", en: "English", es: "Spanish" },
  },
  es: {
    contact: "Contacto",
    education: "Formación",
    skills: "Habilidades",
    certifications: "Certificaciones",
    languages: "Idiomas",
    workExperience: "Experiencia laboral",
    projects: "Proyectos",
    print: "Imprimir CV",
    switchTo: { no: "Noruego", en: "Inglés", es: "Español" },
  },
};

function Header() {
  const doc = useCvStore((s) => s.doc);
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);

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
          <h2 className="text-2xl transition-all duration-500 ease-in-out">{rotating}</h2>
        )}
      </div>

      {/* In edit mode, manage the list of rotating titles */}
      {editMode && (
        <div className="mb-4 flex flex-wrap gap-2 print:hidden">
          {titles.map((t, i) => (
            <span key={i} className="relative text-sm bg-[var(--cv-chip-bg)] px-2 py-1 rounded flex items-center gap-1">
              <Editable inline value={t} onChange={(v) => setField(["personalInfo", "titles", i], v)} />
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

      <Editable
        as="div"
        multiline
        className="text-sm opacity-90 mt-5 whitespace-pre-line w-full"
        value={doc.personalInfo.bio}
        onChange={(v) => setField(["personalInfo", "bio"], v)}
      />
    </header>
  );
}

export default function App() {
  const doc = useCvStore((s) => s.doc);
  const lang = useCvStore((s) => s.lang);
  const load = useCvStore((s) => s.load);

  // Initial load.
  useEffect(() => {
    load("no").catch((e) => console.error("Failed to load CV:", e));
  }, [load]);

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

  const labels = uiLabels[lang];

  return (
    <>
      <Toolbar labels={labels} />
      <div
        id="cv-root"
        style={themeVars(doc.theme)}
        className="w-full max-w-4xl mx-auto bg-white shadow-lg font-sans mt-16 print:mt-0"
      >
        <div className="grid grid-cols-3 min-h-[1056px]">
          <Sidebar labels={labels} />
          <div className="col-span-2 p-6">
            <Header />
            <Experience labels={labels} />
            <Projects labels={labels} />
          </div>
        </div>
      </div>
    </>
  );
}

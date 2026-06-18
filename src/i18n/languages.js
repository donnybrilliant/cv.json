// Single source of truth for language definitions, shared by the client UI and
// the Node file API (pure data + helpers, no React/DOM/Node deps so it imports
// cleanly on both sides).
//
// Two distinct concepts live here:
//   1. CATALOG  — the static set of languages a user *can* add (code + names).
//   2. BUILTINS — the languages the app ships with, including their translated
//      UI labels. The live, user-extensible set lives on disk in
//      data/languages.json (seeded from BUILTINS on first run).

// English labels, used as the fallback whenever a language is missing a key.
export const DEFAULT_LABELS = {
  contact: "Contact",
  education: "Education",
  skills: "Skills",
  certifications: "Certifications",
  languages: "Languages",
  workExperience: "Work Experience",
  projects: "Projects",
  print: "Print Resume",
};

// Selectable languages. `nativeName` is shown in the language picker; the
// English name helps the AI translate accurately. Extend freely — anything here
// can be generated on demand.
export const LANGUAGE_CATALOG = [
  { code: "en", englishName: "English", nativeName: "English" },
  { code: "no", englishName: "Norwegian", nativeName: "Norsk" },
  { code: "es", englishName: "Spanish", nativeName: "Español" },
  { code: "de", englishName: "German", nativeName: "Deutsch" },
  { code: "fr", englishName: "French", nativeName: "Français" },
  { code: "it", englishName: "Italian", nativeName: "Italiano" },
  { code: "pt", englishName: "Portuguese", nativeName: "Português" },
  { code: "nl", englishName: "Dutch", nativeName: "Nederlands" },
  { code: "sv", englishName: "Swedish", nativeName: "Svenska" },
  { code: "da", englishName: "Danish", nativeName: "Dansk" },
  { code: "fi", englishName: "Finnish", nativeName: "Suomi" },
  { code: "pl", englishName: "Polish", nativeName: "Polski" },
  { code: "cs", englishName: "Czech", nativeName: "Čeština" },
  { code: "ro", englishName: "Romanian", nativeName: "Română" },
  { code: "tr", englishName: "Turkish", nativeName: "Türkçe" },
  { code: "ru", englishName: "Russian", nativeName: "Русский" },
  { code: "uk", englishName: "Ukrainian", nativeName: "Українська" },
  { code: "ja", englishName: "Japanese", nativeName: "日本語" },
  { code: "zh", englishName: "Chinese (Simplified)", nativeName: "中文" },
  { code: "ko", englishName: "Korean", nativeName: "한국어" },
  { code: "ar", englishName: "Arabic", nativeName: "العربية" },
  { code: "hi", englishName: "Hindi", nativeName: "हिन्दी" },
];

// Right-to-left scripts get dir="rtl" applied at the document root.
export const RTL_CODES = new Set(["ar", "he", "fa", "ur"]);

const CATALOG_BY_CODE = Object.fromEntries(
  LANGUAGE_CATALOG.map((l) => [l.code, l])
);

export function catalogEntry(code) {
  return CATALOG_BY_CODE[code] || null;
}

// Display name (native) for a language code, falling back to the raw code.
export function nativeName(code) {
  return CATALOG_BY_CODE[code]?.nativeName || String(code || "").toUpperCase();
}

export function englishName(code) {
  return CATALOG_BY_CODE[code]?.englishName || code;
}

export function isRtl(code) {
  return RTL_CODES.has(code);
}

// Merge a (possibly partial) label set over the English defaults so the UI
// never renders an empty heading.
export function resolveLabels(labels) {
  return { ...DEFAULT_LABELS, ...(labels || {}) };
}

// The languages the app ships with, with human-reviewed labels. Used to seed
// data/languages.json the first time the API runs.
export const BUILTIN_LANGUAGES = [
  {
    code: "no",
    builtin: true,
    labels: {
      contact: "Kontakt",
      education: "Utdanning",
      skills: "Ferdigheter",
      certifications: "Sertifiseringer",
      languages: "Språk",
      workExperience: "Arbeidserfaring",
      projects: "Prosjekter",
      print: "Skriv ut CV",
    },
  },
  {
    code: "en",
    builtin: true,
    labels: { ...DEFAULT_LABELS },
  },
  {
    code: "es",
    builtin: true,
    labels: {
      contact: "Contacto",
      education: "Formación",
      skills: "Habilidades",
      certifications: "Certificaciones",
      languages: "Idiomas",
      workExperience: "Experiencia laboral",
      projects: "Proyectos",
      print: "Imprimir CV",
    },
  },
];

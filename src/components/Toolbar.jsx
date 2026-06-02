import { useEffect, useRef, useState } from "react";
import { useStore } from "zustand";
import {
  Printer,
  Pencil,
  Eye,
  Undo2,
  Redo2,
  Save,
  History,
  Download,
  Upload,
  RotateCcw,
  Trash2,
  Check,
  Loader2,
  FileDown,
  Palette,
  Plus,
} from "lucide-react";
import { useCvStore } from "../store/cvStore";
import * as api from "../api/client";
import { CUSTOM_THEME, THEMES, THEME_KEYS, isLightColor, themeIconColor } from "../themes";
import { exportNodeToPdf } from "../lib/exportPdf";
import JobTailor from "./JobTailor";

const LANGUAGES = ["no", "en", "es"];

// Per-CV color theme picker (edit mode only).
function ThemePicker() {
  const [open, setOpen] = useState(false);
  const theme = useCvStore((s) => s.doc?.theme);
  const color = theme?.color || "blue";
  const setTheme = useCvStore((s) => s.setTheme);
  const setCustomTheme = useCvStore((s) => s.setCustomTheme);
  const ref = useRef(null);
  const colorInputRef = useRef(null);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const swatch = themeIconColor(theme);
  const isCustom = color === CUSTOM_THEME;
  const customHex = theme?.custom?.picked || theme?.custom?.icon || "#2563eb";
  const customPlusClass = isLightColor(customHex) ? "text-gray-700" : "text-white drop-shadow";

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
        title="Theme color"
      >
        <Palette className="w-4 h-4" />
        <span className="w-3.5 h-3.5 rounded-full ring-1 ring-black/10" style={{ background: swatch }} />
      </button>
      {open && (
        <div className="absolute right-0 mt-2 p-2.5 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 z-50 grid grid-cols-4 gap-2 w-[9.5rem]">
          {THEME_KEYS.map((key) => (
            <button
              key={key}
              type="button"
              onClick={() => {
                setTheme(key);
                setOpen(false);
              }}
              title={THEMES[key].label}
              className={`w-7 h-7 rounded-full ring-2 shrink-0 cursor-pointer ${!isCustom && color === key ? "ring-gray-800" : "ring-transparent hover:ring-gray-300"}`}
              style={{ background: THEMES[key].icon }}
              aria-label={THEMES[key].label}
            />
          ))}
          <button
            type="button"
            onClick={() => colorInputRef.current?.click()}
            title="Pick a custom color"
            className={`w-7 h-7 rounded-full ring-2 shrink-0 cursor-pointer flex items-center justify-center bg-gray-50 hover:bg-gray-100 ${isCustom ? "ring-gray-800" : "ring-gray-200 hover:ring-gray-300"}`}
            style={isCustom ? { background: customHex } : undefined}
            aria-label="Custom color"
          >
            <Plus className={`w-4 h-4 ${isCustom ? customPlusClass : "text-gray-500"}`} strokeWidth={2.5} />
          </button>
          <input
            ref={colorInputRef}
            type="color"
            className="sr-only"
            value={customHex}
            onChange={(e) => {
              setCustomTheme(e.target.value);
            }}
          />
        </div>
      )}
    </div>
  );
}

function SaveIndicator() {
  const saveState = useCvStore((s) => s.saveState);
  if (saveState === "saving")
    return (
      <span className="flex items-center gap-1 text-xs text-gray-500">
        <Loader2 className="w-3.5 h-3.5 animate-spin" /> Saving…
      </span>
    );
  if (saveState === "saved")
    return (
      <span className="flex items-center gap-1 text-xs text-green-600">
        <Check className="w-3.5 h-3.5" /> Saved
      </span>
    );
  if (saveState === "error")
    return <span className="text-xs text-red-600">Save failed</span>;
  return null;
}

function VersionsMenu() {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState([]);
  const lang = useCvStore((s) => s.lang);
  const restoreVersion = useCvStore((s) => s.restoreVersion);
  const ref = useRef(null);

  const refresh = async () => {
    const all = await api.listVersions();
    setVersions(all.filter((v) => v.lang === lang));
  };

  // Load the version list whenever the menu opens (or language changes).
  useEffect(() => {
    if (!open) return;
    let active = true;
    api.listVersions().then((all) => {
      if (active) setVersions(all.filter((v) => v.lang === lang));
    });
    return () => {
      active = false;
    };
  }, [open, lang]);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  return (
    <div className="relative" ref={ref}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
        title="Saved versions"
      >
        <History className="w-4 h-4" /> Versions
      </button>
      {open && (
        <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 p-2 z-50">
          <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">
            {lang.toUpperCase()} versions
          </div>
          {versions.length === 0 && (
            <div className="px-2 py-3 text-sm text-gray-400">No saved versions yet.</div>
          )}
          {versions.map((v) => (
            <div
              key={v.file}
              className="flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50"
            >
              <span className="text-sm truncate">{v.name}</span>
              <div className="flex gap-1 shrink-0">
                <button
                  className="p-1 rounded text-gray-500 hover:text-blue-700 cursor-pointer"
                  title="Restore"
                  onClick={async () => {
                    await restoreVersion(v.name);
                    setOpen(false);
                  }}
                >
                  <RotateCcw className="w-4 h-4" />
                </button>
                <button
                  className="p-1 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                  title="Delete"
                  onClick={async () => {
                    await api.deleteVersion(v.name, v.lang);
                    refresh();
                  }}
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function Toolbar({ labels }) {
  const lang = useCvStore((s) => s.lang);
  const setLang = useCvStore((s) => s.setLang);
  const editMode = useCvStore((s) => s.editMode);
  const toggleEdit = useCvStore((s) => s.toggleEdit);
  const saveVersion = useCvStore((s) => s.saveVersion);
  const replaceDoc = useCvStore((s) => s.replaceDoc);
  const setEditMode = useCvStore((s) => s.setEditMode);
  const doc = useCvStore((s) => s.doc);
  const [exporting, setExporting] = useState(false);
  const [maskPdfExport, setMaskPdfExport] = useState(false);

  const { undo, redo, pastStates, futureStates } = useStore(
    useCvStore.temporal,
    (s) => s
  );
  const fileRef = useRef(null);

  // Keyboard: Cmd/Ctrl+Z undo, Cmd/Ctrl+Shift+Z (or Ctrl+Y) redo.
  useEffect(() => {
    const onKey = (e) => {
      const mod = e.metaKey || e.ctrlKey;
      if (!mod) return;
      const tag = document.activeElement?.tagName;
      const inField = tag === "INPUT" || tag === "TEXTAREA";
      if (e.key.toLowerCase() === "z") {
        if (inField) return; // let the field handle its own undo
        e.preventDefault();
        e.shiftKey ? redo() : undo();
      } else if (e.key.toLowerCase() === "y") {
        if (inField) return;
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [undo, redo]);

  const onExport = () => {
    const blob = new Blob([JSON.stringify(doc, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `cv.${lang}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      replaceDoc(JSON.parse(await file.text()));
    } catch {
      alert("That file is not valid JSON.");
    }
    e.target.value = "";
  };

  // Download a cropped, compressed PDF. Capture in view mode so no edit chrome
  // (and no hidden sections) end up in the file, then restore the prior mode.
  // The full-screen overlay (z-50) paints first so the mode switch underneath
  // it is never visible — no toolbar or image flash.
  const onPdf = async () => {
    const node = document.getElementById("cv-root");
    if (!node) return;
    const wasEdit = editMode;

    // Only mask the UI when exporting from edit mode (where mode-switch flashes
    // can happen). View mode exports remain seamless with no overlay.
    setMaskPdfExport(wasEdit);
    setExporting(true);
    if (wasEdit) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    if (wasEdit) setEditMode(false);
    if (wasEdit) {
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    }

    try {
      const name = (doc?.personalInfo?.name || "CV").trim();
      await exportNodeToPdf(node, `CV - ${name} - ${lang.toUpperCase()}.pdf`);
    } catch (err) {
      console.error("PDF export failed:", err);
      alert("PDF export failed — see console for details.");
    } finally {
      if (wasEdit) setEditMode(true);
      setMaskPdfExport(false);
      setExporting(false);
    }
  };

  const onSaveVersion = async () => {
    const name = prompt("Name this version (e.g. frontend-role-2026):");
    if (name && name.trim()) await saveVersion(name.trim());
  };

  const iconBtn =
    "p-2 rounded bg-white text-gray-700 shadow hover:bg-gray-50 disabled:opacity-30 disabled:cursor-default cursor-pointer";

  return (
    <>
    {exporting && maskPdfExport && (
      <div
        className="fixed inset-0 z-50 bg-white flex items-center justify-center print:hidden"
        aria-live="polite"
        aria-label="Generating PDF"
      >
        <div className="flex items-center gap-2 px-4 py-2 bg-white rounded-lg shadow-lg text-sm text-gray-700 ring-1 ring-gray-200">
          <Loader2 className="w-4 h-4 animate-spin" />
          Generating PDF…
        </div>
      </div>
    )}
    <div className="fixed top-4 right-4 left-4 flex flex-wrap items-center justify-end gap-2 print:hidden z-40">
      {/* Left side: edit-only controls. These appear/disappear here so the
          static group on the right (toggle, languages, print) never moves. */}
      {editMode && (
        <>
          <SaveIndicator />

          <div className="flex rounded shadow overflow-hidden">
            <button onClick={() => undo()} disabled={pastStates.length === 0} className={`${iconBtn} rounded-none`} title="Undo (⌘Z)">
              <Undo2 className="w-4 h-4" />
            </button>
            <button onClick={() => redo()} disabled={futureStates.length === 0} className={`${iconBtn} rounded-none`} title="Redo (⌘⇧Z)">
              <Redo2 className="w-4 h-4" />
            </button>
          </div>

          <button onClick={onSaveVersion} className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer" title="Save current as a named version">
            <Save className="w-4 h-4" /> Save version
          </button>

          <VersionsMenu />

          <JobTailor />

          <ThemePicker />

          <button onClick={onExport} className={iconBtn} title="Export JSON">
            <Download className="w-4 h-4" />
          </button>
          <button onClick={() => fileRef.current?.click()} className={iconBtn} title="Import JSON">
            <Upload className="w-4 h-4" />
          </button>
          <input ref={fileRef} type="file" accept="application/json,.json" className="hidden" onChange={onImport} />
        </>
      )}

      {/* Static group (always in the same place, both modes) */}
      {/* Edit / View toggle */}
      <button
        onClick={toggleEdit}
        className={`flex items-center gap-1 px-3 py-2 text-sm rounded shadow cursor-pointer ${
          editMode ? "bg-amber-500 text-white hover:bg-amber-600" : "bg-white text-gray-700 hover:bg-gray-50"
        }`}
        title={editMode ? "Switch to view" : "Edit CV"}
      >
        {editMode ? <Eye className="w-4 h-4" /> : <Pencil className="w-4 h-4" />}
        {editMode ? "View" : "Edit"}
      </button>

      {/* Language switch */}
      <div className="flex rounded shadow overflow-hidden">
        {LANGUAGES.map((l) => (
          <button
            key={l}
            onClick={() => setLang(l)}
            className={`px-3 py-2 text-sm font-medium transition-colors cursor-pointer ${
              lang === l
                ? "bg-blue-600 text-white"
                : "bg-blue-500 text-white/80 hover:bg-blue-600 hover:text-white"
            }`}
            title={labels.switchTo[l]}
            aria-current={lang === l ? "true" : undefined}
          >
            {l.toUpperCase()}
          </button>
        ))}
      </div>

      {/* Download PDF (cropped + compressed) */}
      <button
        onClick={onPdf}
        disabled={exporting}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 disabled:opacity-50 cursor-pointer"
        title="Download as PDF"
      >
        {exporting ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileDown className="w-4 h-4" />}
        PDF
      </button>

      {/* Print */}
      <button
        onClick={() => window.print()}
        className="bg-green-500 hover:bg-green-600 text-white p-2 rounded shadow cursor-pointer"
        title={labels.print}
      >
        <Printer className="w-5 h-5" />
      </button>
    </div>
    </>
  );
}

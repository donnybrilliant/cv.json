import { useCallback, useEffect, useRef, useState } from "react";
import {
  Sparkles,
  X,
  Loader2,
  Copy,
  Download,
  Link2,
  FileText,
  Check,
  AlertTriangle,
} from "lucide-react";
import { useCvStore } from "../store/cvStore";
import * as api from "../api/client";

// "Tailor to job" drawer: paste a job posting (text or URL) and let the AI
// rewrite the CV for it and/or draft a cover letter. The CV is tailored in
// place (undoable with ⌘Z); the cover letter is ephemeral output you copy or
// download — it is not part of the CV document.
export default function JobTailor() {
  const [open, setOpen] = useState(false);
  const [mode, setMode] = useState("text"); // "text" | "url"
  const [text, setText] = useState("");
  const [url, setUrl] = useState("");
  const [tone, setTone] = useState("professional and warm");
  const [extraContext, setExtraContext] = useState("");
  const [research, setResearch] = useState(false);

  const [letter, setLetter] = useState("");
  const [writing, setWriting] = useState(false);
  const [tailored, setTailored] = useState(false); // show "updated — ⌘Z to undo"
  const [copied, setCopied] = useState(false);
  const [localError, setLocalError] = useState(null);
  const letterRef = useRef(null);

  const lang = useCvStore((s) => s.lang);
  const doc = useCvStore((s) => s.doc);
  const cvSource = useCvStore((s) => s.cvSource);
  const aiTailor = useCvStore((s) => s.aiTailor);
  const aiStatus = useCvStore((s) => s.aiStatus);
  const aiError = useCvStore((s) => s.aiError);
  const clearAiState = useCvStore((s) => s.clearAiState);
  const restoreRevision = useCvStore((s) => s.restoreRevision);
  const lastTailorBackup = useCvStore((s) => s.lastTailorBackup);

  const tailoring = aiStatus === "tailoring";
  const busy = tailoring || writing;
  const error = localError || (aiStatus === "error" ? aiError : null);

  const closeDrawer = useCallback(() => {
    if (busy) return;
    setOpen(false);
    setTailored(false);
    setLocalError(null);
    clearAiState();
  }, [busy, clearAiState]);

  // Close on Escape (unless busy).
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape") closeDrawer();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, closeDrawer]);

  // Grow the cover letter field to fit its content; the drawer panel scrolls.
  useEffect(() => {
    const el = letterRef.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [letter, writing]);

  const hasInput = mode === "text" ? text.trim().length > 0 : url.trim().length > 0;
  const job = () => (mode === "text" ? { text } : { url });

  const onTailor = async () => {
    setLocalError(null);
    setTailored(false);
    try {
      await aiTailor(job(), { extraContext, research });
      setTailored(true);
    } catch {
      /* error surfaced via aiError */
    }
  };

  const onWriteLetter = async () => {
    setLocalError(null);
    setWriting(true);
    setLetter("");
    try {
      await api.coverLetter(
        lang,
        doc,
        job(),
        { tone, extraContext, research, cvSource: cvSource || `data/cv.${lang}.json` },
        setLetter,
      );
    } catch (e) {
      setLocalError(String(e?.message || e));
    } finally {
      setWriting(false);
    }
  };

  const onCopy = async () => {
    await navigator.clipboard.writeText(letter);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  const onDownload = () => {
    const name = (doc?.personalInfo?.name || "cover-letter").trim().replace(/\s+/g, "-");
    const blob = new Blob([letter], { type: "text/markdown" });
    const href = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = href;
    a.download = `Cover letter - ${name} - ${lang.toUpperCase()}.md`;
    a.click();
    URL.revokeObjectURL(href);
  };

  const tab = (key, label, Icon) => (
    <button
      type="button"
      onClick={() => setMode(key)}
      className={`flex items-center gap-1.5 px-3 py-1.5 text-sm rounded cursor-pointer ${
        mode === key ? "bg-blue-600 text-white" : "bg-gray-100 text-gray-600 hover:bg-gray-200"
      }`}
    >
      <Icon className="w-4 h-4" /> {label}
    </button>
  );

  return (
    <>
      <button
        onClick={() => setOpen(true)}
        className="flex items-center gap-1 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
        title="Tailor CV to a job + cover letter"
      >
        <Sparkles className="w-4 h-4" /> Tailor
      </button>

      {open && (
        <div className="fixed inset-0 z-50 print:hidden">
          {/* Overlay */}
          <div
            className="absolute inset-0 bg-black/30"
            onClick={closeDrawer}
          />
          {/* Panel */}
          <div className="absolute right-0 top-0 h-full w-full max-w-md bg-white shadow-2xl flex flex-col">
            <div className="flex items-center justify-between px-5 py-4 border-b border-gray-200">
              <h2 className="flex items-center gap-2 text-base font-semibold text-gray-800">
                <Sparkles className="w-5 h-5 text-blue-600" /> Tailor to a job
              </h2>
              <button
                onClick={closeDrawer}
                disabled={busy}
                className="p-1.5 rounded text-gray-500 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                title="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="flex-1 overflow-y-auto px-5 py-4 space-y-4">
              <div className="flex gap-2">
                {tab("text", "Paste text", FileText)}
                {tab("url", "From URL", Link2)}
              </div>

              {mode === "text" ? (
                <textarea
                  value={text}
                  onChange={(e) => setText(e.target.value)}
                  rows={8}
                  placeholder="Paste the full job description here…"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
              ) : (
                <div className="space-y-1.5">
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://company.com/jobs/123"
                    className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                  />
                  <p className="text-xs text-gray-400">
                    Tries a direct fetch first, then a JS-rendering reader so
                    JS-heavy boards (LinkedIn, Workday, Greenhouse) usually work
                    too. If extraction still comes up short, paste the text instead.
                  </p>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">
                  Extra context to emphasize{" "}
                  <span className="font-normal text-gray-400">
                    (used for both CV &amp; cover letter)
                  </span>
                </label>
                <textarea
                  value={extraContext}
                  onChange={(e) => setExtraContext(e.target.value)}
                  rows={3}
                  placeholder="e.g. Lots of hands-on experience with Raspberry Pi, ESP32 and sensors; gardening / outdoor maintenance background — relevant to this role."
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 resize-y"
                />
                <p className="text-xs text-gray-400">
                  Treated as additional true facts about you the AI may weave in.
                </p>
              </div>

              <label className="flex items-start gap-2 text-sm text-gray-700 cursor-pointer">
                <input
                  type="checkbox"
                  checked={research}
                  onChange={(e) => setResearch(e.target.checked)}
                  className="mt-0.5 cursor-pointer"
                />
                <span>
                  Research the company online
                  <span className="block text-xs text-gray-400">
                    Looks up the employer + their website to ground the tailoring
                    and letter. Sends the posting to an external reader; a bit slower.
                  </span>
                </span>
              </label>

              <div className="space-y-1.5">
                <label className="text-xs font-medium text-gray-500">Cover letter tone</label>
                <input
                  type="text"
                  value={tone}
                  onChange={(e) => setTone(e.target.value)}
                  placeholder="professional and warm"
                  className="w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                />
              </div>

              <div className="flex flex-col gap-2">
                <button
                  onClick={onTailor}
                  disabled={!hasInput || busy}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  {tailoring ? <Loader2 className="w-4 h-4 animate-spin" /> : <Sparkles className="w-4 h-4" />}
                  Tailor my CV to this job
                </button>
                <button
                  onClick={onWriteLetter}
                  disabled={!hasInput || busy}
                  className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-medium rounded bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 disabled:cursor-default cursor-pointer"
                >
                  {writing ? <Loader2 className="w-4 h-4 animate-spin" /> : <FileText className="w-4 h-4" />}
                  Write a cover letter
                </button>
              </div>

              {tailored && !tailoring && (
                <div className="space-y-2 text-sm text-green-700 bg-green-50 rounded px-3 py-2">
                  <div className="flex items-center gap-2">
                    <Check className="w-4 h-4 shrink-0" />
                    CV tailored and saved. A restore point was saved first.
                  </div>
                  <div className="text-xs text-green-800/80">
                    Press ⌘Z (Ctrl+Z) to undo, or restore the previous version
                    from Languages → History at any time.
                  </div>
                  {lastTailorBackup && (
                    <button
                      onClick={async () => {
                        await restoreRevision(lastTailorBackup);
                        setTailored(false);
                      }}
                      className="flex items-center gap-1 px-2 py-1 text-xs rounded bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 cursor-pointer"
                    >
                      <Check className="w-3.5 h-3.5" /> Restore previous version
                    </button>
                  )}
                </div>
              )}

              {error && (
                <div className="flex items-start gap-2 text-sm text-red-700 bg-red-50 rounded px-3 py-2">
                  <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5" />
                  <span className="break-words">{error}</span>
                </div>
              )}

              {(letter || writing) && (
                <div className="space-y-2">
                  <div className="flex items-center justify-between">
                    <h3 className="text-sm font-semibold text-gray-700">
                      Cover letter{" "}
                      <span className="font-normal text-gray-400">(editable)</span>
                    </h3>
                    <div className="flex gap-1">
                      <button
                        onClick={onCopy}
                        disabled={!letter || writing}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        title="Copy"
                      >
                        {copied ? <Check className="w-3.5 h-3.5" /> : <Copy className="w-3.5 h-3.5" />}
                        {copied ? "Copied" : "Copy"}
                      </button>
                      <button
                        onClick={onDownload}
                        disabled={!letter || writing}
                        className="flex items-center gap-1 px-2 py-1 text-xs rounded text-gray-600 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
                        title="Download .md"
                      >
                        <Download className="w-3.5 h-3.5" /> .md
                      </button>
                    </div>
                  </div>
                  <textarea
                    ref={letterRef}
                    value={writing ? `${letter}▍` : letter}
                    onChange={(e) => setLetter(e.target.value)}
                    readOnly={writing}
                    spellCheck
                    placeholder="Your cover letter will appear here…"
                    className="w-full min-h-[6rem] whitespace-pre-wrap break-words text-sm text-gray-800 bg-gray-50 rounded p-3 font-sans border border-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none overflow-hidden"
                  />
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}

import { useEffect, useRef, useState } from "react";
import { LinkIcon, ICON_PICKER_KEYS } from "../lib/linkPresets";

const ICON = "text-[var(--cv-icon)]";

// Click the current icon to override it (or reset to auto-detect from URL).
// `onPick(key)` receives the chosen iconKey, or "" to clear the override.
export default function IconPicker({ iconKey, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <span className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change icon"
        className="shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer print:hidden"
      >
        <LinkIcon iconKey={iconKey} className={`w-4 h-4 ${ICON}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 p-2 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 grid grid-cols-6 gap-1 w-44">
          {ICON_PICKER_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              title={k}
              onClick={() => {
                onPick(k);
                setOpen(false);
              }}
              className={`p-1 rounded hover:bg-gray-100 cursor-pointer ${k === iconKey ? "bg-gray-100 text-gray-900" : "text-gray-600"}`}
            >
              <LinkIcon iconKey={k} className="w-4 h-4" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onPick("");
              setOpen(false);
            }}
            className="col-span-6 mt-1 text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            Auto-detect from URL
          </button>
        </div>
      )}
    </span>
  );
}

import { useCallback, useEffect, useRef, useState } from "react";
import { useCvStore } from "../store/cvStore";

// Inline click-to-edit text. In view mode it renders plain text in `as` tag.
// In edit mode it renders a transparent auto-sizing input/textarea that looks
// like the text until focused, commits on blur / Enter, and reverts on Esc.
export default function Editable({
  value,
  onChange,
  multiline = false,
  inline = false,
  as: Tag = "span",
  className = "",
  placeholder = "—",
}) {
  const editMode = useCvStore((s) => s.editMode);
  const [draft, setDraft] = useState(value ?? "");
  const ref = useRef(null);

  // Resync the draft when the external value changes (undo/redo, language
  // switch, version restore) using the "adjust state during render" pattern —
  // no effect, so it can't trigger cascading-render warnings.
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setDraft(value ?? "");
  }

  // Keep textarea height fitted to content.
  const fit = useCallback(
    (el) => {
      if (el && multiline) {
        el.style.height = "auto";
        el.style.height = `${el.scrollHeight}px`;
      }
    },
    [multiline]
  );
  useEffect(() => {
    if (editMode) fit(ref.current);
  }, [editMode, draft, fit]);

  if (!editMode) {
    return <Tag className={className}>{value || ""}</Tag>;
  }

  const commit = () => {
    if (draft !== value) onChange(draft);
  };
  const onKeyDown = (e) => {
    if (e.key === "Enter" && !multiline) {
      e.preventDefault();
      e.currentTarget.blur();
    } else if (e.key === "Escape") {
      setDraft(value ?? "");
      e.currentTarget.blur();
    }
  };

  const baseClass = `${className} bg-transparent rounded px-1 -mx-1 outline-none ring-1 ring-transparent hover:ring-[var(--cv-ring-soft)] focus:ring-2 focus:ring-[var(--cv-ring)] focus:bg-white/70 transition`;
  const shared = {
    value: draft,
    placeholder,
    onChange: (e) => setDraft(e.target.value),
    onInput: (e) => fit(e.target),
    onBlur: commit,
    onKeyDown,
  };

  if (multiline) {
    return (
      <textarea ref={ref} {...shared} rows={1} className={`${baseClass} w-full resize-none block`} />
    );
  }

  // Inline fields auto-grow to fit their text (field-sizing) so the edit layout
  // matches the view layout instead of each input taking its own full-width row.
  if (inline) {
    return (
      <input
        ref={ref}
        {...shared}
        type="text"
        style={{ fieldSizing: "content" }}
        className={`${baseClass} inline-block align-baseline min-w-[2ch] max-w-full`}
      />
    );
  }

  return <input ref={ref} {...shared} type="text" className={`${baseClass} w-full`} />;
}

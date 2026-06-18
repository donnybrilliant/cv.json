import { useEffect, useRef, useState } from "react";
import { X } from "lucide-react";

function DialogShell({ open, busy, onClose, children }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e) => {
      if (e.key === "Escape" && !busy) onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, busy, onClose]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[60] print:hidden flex items-center justify-center p-4">
      <div
        className="absolute inset-0 bg-black/40"
        onClick={() => !busy && onClose()}
        aria-hidden="true"
      />
      <div
        className="relative w-full max-w-sm bg-white rounded-lg shadow-xl ring-1 ring-gray-200"
        role="dialog"
        aria-modal="true"
      >
        {children}
      </div>
    </div>
  );
}

export function AlertDialog({ open, title, description, okLabel = "OK", busy = false, onClose }) {
  const okRef = useRef(null);

  useEffect(() => {
    if (open) okRef.current?.focus();
  }, [open]);

  return (
    <DialogShell open={open} busy={busy} onClose={onClose}>
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
        <div className="mt-5 flex justify-end">
          <button
            ref={okRef}
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 cursor-pointer"
          >
            {okLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel = "Confirm",
  cancelLabel = "Cancel",
  danger = false,
  busy = false,
  onConfirm,
  onClose,
}) {
  const confirmRef = useRef(null);

  useEffect(() => {
    if (open) confirmRef.current?.focus();
  }, [open]);

  return (
    <DialogShell open={open} busy={busy} onClose={onClose}>
      <div className="p-5">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
        <div className="mt-5 flex justify-end gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium rounded bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            type="button"
            disabled={busy}
            onClick={onConfirm}
            className={`px-4 py-2 text-sm font-medium rounded text-white disabled:opacity-40 cursor-pointer ${
              danger ? "bg-red-600 hover:bg-red-700" : "bg-blue-600 hover:bg-blue-700"
            }`}
          >
            {confirmLabel}
          </button>
        </div>
      </div>
    </DialogShell>
  );
}

function PromptDialogForm({
  title,
  description,
  defaultValue,
  confirmLabel,
  cancelLabel,
  placeholder,
  busy,
  onConfirm,
  onClose,
}) {
  const [value, setValue] = useState(defaultValue);
  const inputRef = useRef(null);

  useEffect(() => {
    const t = setTimeout(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    }, 0);
    return () => clearTimeout(t);
  }, []);

  const submit = () => {
    const trimmed = value.trim();
    if (trimmed) onConfirm(trimmed);
  };

  return (
    <div className="p-5">
      <div className="flex items-start justify-between gap-3">
        <h3 className="text-base font-semibold text-gray-900">{title}</h3>
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 disabled:opacity-40 cursor-pointer"
          title="Close"
        >
          <X className="w-4 h-4" />
        </button>
      </div>
      {description && <p className="mt-2 text-sm text-gray-600">{description}</p>}
      <input
        ref={inputRef}
        type="text"
        value={value}
        disabled={busy}
        placeholder={placeholder}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            submit();
          }
        }}
        className="mt-4 w-full rounded border border-gray-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 disabled:opacity-40"
      />
      <div className="mt-5 flex justify-end gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={onClose}
          className="px-4 py-2 text-sm font-medium rounded bg-white text-gray-700 ring-1 ring-gray-300 hover:bg-gray-50 disabled:opacity-40 cursor-pointer"
        >
          {cancelLabel}
        </button>
        <button
          type="button"
          disabled={busy || !value.trim()}
          onClick={submit}
          className="px-4 py-2 text-sm font-medium rounded bg-blue-600 text-white hover:bg-blue-700 disabled:opacity-40 disabled:cursor-default cursor-pointer"
        >
          {confirmLabel}
        </button>
      </div>
    </div>
  );
}

export function PromptDialog({
  open,
  title,
  description,
  defaultValue = "",
  confirmLabel = "Save",
  cancelLabel = "Cancel",
  placeholder,
  busy = false,
  onConfirm,
  onClose,
}) {
  return (
    <DialogShell open={open} busy={busy} onClose={onClose}>
      {open && (
        <PromptDialogForm
          key={defaultValue}
          title={title}
          description={description}
          defaultValue={defaultValue}
          confirmLabel={confirmLabel}
          cancelLabel={cancelLabel}
          placeholder={placeholder}
          busy={busy}
          onConfirm={onConfirm}
          onClose={onClose}
        />
      )}
    </DialogShell>
  );
}

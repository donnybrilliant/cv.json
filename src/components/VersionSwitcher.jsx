import { useEffect, useRef, useState } from "react";
import {
  Files,
  ChevronDown,
  Plus,
  Copy,
  Pencil,
  Trash2,
  Check,
} from "lucide-react";
import { useCvStore } from "../store/cvStore";
import { ConfirmDialog, PromptDialog } from "./Dialog";

// Primary control: pick which named CV ("version") you're editing. Versions are
// independent documents (Frontend, Backend, …) you switch between like files;
// each carries its own language translations. New/Duplicate/Rename/Delete live
// here too — this is the single place versions are managed.
export default function VersionSwitcher() {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState(null);
  const ref = useRef(null);

  const versions = useCvStore((s) => s.versions);
  const versionId = useCvStore((s) => s.versionId);
  const switchVersion = useCvStore((s) => s.switchVersion);
  const createVersion = useCvStore((s) => s.createVersion);
  const duplicateVersion = useCvStore((s) => s.duplicateVersion);
  const renameVersion = useCvStore((s) => s.renameVersion);
  const deleteVersion = useCvStore((s) => s.deleteVersion);

  const current = versions.find((v) => v.id === versionId);

  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);

  const onNew = () => {
    setDialog({ kind: "prompt", action: "new", defaultValue: "New version" });
  };

  const onDuplicate = () => {
    setDialog({
      kind: "prompt",
      action: "duplicate",
      defaultValue: current ? `${current.name} copy` : "Copy",
    });
  };

  const onRename = (v) => {
    setDialog({ kind: "prompt", action: "rename", versionId: v.id, defaultValue: v.name });
  };

  const onDelete = (v) => {
    setDialog({ kind: "confirm", action: "delete", version: v });
  };

  const closeDialog = () => setDialog(null);

  const handlePromptConfirm = async (name) => {
    if (!dialog || dialog.kind !== "prompt") return;
    const { action, versionId: renameId } = dialog;
    closeDialog();
    if (action === "new") {
      const v = await createVersion(name);
      await switchVersion(v.id);
      setOpen(false);
    } else if (action === "duplicate") {
      const v = await duplicateVersion(name);
      await switchVersion(v.id);
      setOpen(false);
    } else if (action === "rename" && renameId && name !== versions.find((v) => v.id === renameId)?.name) {
      await renameVersion(renameId, name);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!dialog || dialog.kind !== "confirm" || dialog.action !== "delete") return;
    const { version } = dialog;
    closeDialog();
    await deleteVersion(version.id);
  };

  const promptCopy =
    dialog?.kind === "prompt"
      ? {
          new: {
            title: "New version",
            description: "Name the new version (e.g. General). It starts from the sample CV.",
            confirmLabel: "Create",
          },
          duplicate: {
            title: "Duplicate version",
            description: "Name the copy (e.g. Acme Corp). All languages are copied.",
            confirmLabel: "Duplicate",
          },
          rename: {
            title: "Rename version",
            description: null,
            confirmLabel: "Rename",
          },
        }[dialog.action]
      : null;

  return (
    <>
      <div className="relative" ref={ref}>
        <button
          onClick={() => setOpen((o) => !o)}
          className="flex items-center gap-1.5 px-3 py-2 text-sm rounded bg-white text-gray-700 shadow hover:bg-gray-50 cursor-pointer"
          title="Switch or manage versions"
        >
          <Files className="w-4 h-4" />
          <span className="max-w-[10rem] truncate">{current?.name || "Versions"}</span>
          <ChevronDown className="w-3.5 h-3.5 text-gray-400" />
        </button>

        {open && (
          <div className="absolute right-0 mt-2 w-72 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 p-2 z-50">
            <div className="px-2 py-1 text-xs font-semibold text-gray-400 uppercase">
              Your versions
            </div>
            {versions.map((v) => (
              <div
                key={v.id}
                className={`group flex items-center justify-between gap-2 px-2 py-1.5 rounded hover:bg-gray-50 ${
                  v.id === versionId ? "bg-blue-50/60" : ""
                }`}
              >
                <button
                  onClick={async () => {
                    await switchVersion(v.id);
                    setOpen(false);
                  }}
                  className="flex items-center gap-2 min-w-0 text-sm text-gray-800 cursor-pointer"
                  title={`Switch to ${v.name}`}
                >
                  {v.id === versionId ? (
                    <Check className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                  ) : (
                    <span className="w-3.5 shrink-0" />
                  )}
                  <span className="truncate">{v.name}</span>
                  <span className="text-xs text-gray-400 uppercase shrink-0">
                    {(v.langs || []).join(" · ")}
                  </span>
                </button>
                <div className="flex gap-1 shrink-0 opacity-0 group-hover:opacity-100">
                  <button
                    onClick={() => onRename(v)}
                    className="p-1 rounded text-gray-500 hover:text-blue-700 cursor-pointer"
                    title="Rename"
                  >
                    <Pencil className="w-3.5 h-3.5" />
                  </button>
                  {versions.length > 1 && (
                    <button
                      onClick={() => onDelete(v)}
                      className="p-1 rounded text-gray-500 hover:text-red-600 cursor-pointer"
                      title="Delete"
                    >
                      <Trash2 className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>
              </div>
            ))}

            <div className="border-t border-gray-100 mt-2 pt-2 flex flex-col">
              <button
                onClick={onDuplicate}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 rounded hover:bg-gray-50 cursor-pointer"
                title="Copy the current version under a new name"
              >
                <Copy className="w-4 h-4" /> Duplicate current
              </button>
              <button
                onClick={onNew}
                className="flex items-center gap-2 px-2 py-1.5 text-sm text-gray-700 rounded hover:bg-gray-50 cursor-pointer"
                title="Start a new version from the sample CV"
              >
                <Plus className="w-4 h-4" /> New version
              </button>
            </div>
          </div>
        )}
      </div>

      <PromptDialog
        open={dialog?.kind === "prompt"}
        title={promptCopy?.title || ""}
        description={promptCopy?.description}
        defaultValue={dialog?.kind === "prompt" ? dialog.defaultValue : ""}
        confirmLabel={promptCopy?.confirmLabel || "Save"}
        onConfirm={handlePromptConfirm}
        onClose={closeDialog}
      />

      <ConfirmDialog
        open={dialog?.kind === "confirm" && dialog.action === "delete"}
        title="Delete version?"
        description={
          dialog?.version
            ? `Delete “${dialog.version.name}” and all its languages? This cannot be undone.`
            : ""
        }
        confirmLabel="Delete"
        danger
        onConfirm={handleDeleteConfirm}
        onClose={closeDialog}
      />
    </>
  );
}

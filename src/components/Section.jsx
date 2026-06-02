import { Eye, EyeOff } from "lucide-react";
import { useCvStore } from "../store/cvStore";

// A section whose visibility can be toggled. When hidden it is excluded from
// view mode (and therefore from Print/PDF), but in edit mode it stays visible
// (dimmed, with a badge) so it can still be edited and toggled back on.
export default function Section({ sectionKey, icon: Icon, title, children }) {
  const editMode = useCvStore((s) => s.editMode);
  const hidden = useCvStore((s) => s.doc.hiddenSections?.includes(sectionKey));
  const toggleSection = useCvStore((s) => s.toggleSection);

  if (!editMode && hidden) return null;

  return (
    <div className={hidden ? "opacity-40 print:hidden" : ""}>
      <div className="flex items-center gap-2 font-bold text-lg mb-4 pb-2 border-b">
        <Icon className="w-5 h-5 text-[var(--cv-icon)]" />
        <span>{title}</span>
        {editMode && (
          <button
            onClick={() => toggleSection(sectionKey)}
            className="ml-auto flex items-center gap-1 text-xs font-normal text-gray-500 hover:text-gray-800 cursor-pointer print:hidden"
            title={hidden ? "Show this section (will appear in PDF)" : "Hide this section from Print/PDF"}
          >
            {hidden ? (
              <>
                <EyeOff className="w-4 h-4" /> Hidden
              </>
            ) : (
              <Eye className="w-4 h-4" />
            )}
          </button>
        )}
      </div>
      {children}
    </div>
  );
}

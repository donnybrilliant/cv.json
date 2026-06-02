import { Plus } from "lucide-react";
import { useCvStore } from "../store/cvStore";
import CustomSection from "./CustomSection";
import { SortableList, SortableItem } from "./Sortable";

// Renders the user-defined flexible sections that belong to a given zone
// ("sidebar" or "main"). Reordering happens within the zone but is translated
// back to real indices in the global doc.customSections array.
export default function CustomSections({ zone }) {
  const editMode = useCvStore((s) => s.editMode);
  const sections = useCvStore((s) => s.doc.customSections) || [];
  const hiddenSections = useCvStore((s) => s.doc.hiddenSections) || [];
  const addCustomSection = useCvStore((s) => s.addCustomSection);
  const moveItem = useCvStore((s) => s.moveItem);

  // Pair each section with its real index, then keep only this zone's sections.
  const entries = sections
    .map((section, index) => ({ section, index }))
    .filter(({ section }) => (section.placement || "main") === zone);

  // In view/print, hidden sections are excluded entirely; in edit mode they
  // stay visible (dimmed) so they can be toggled back on.
  const renderList = editMode
    ? entries
    : entries.filter(({ section }) => !hiddenSections.includes(section.id));

  if (!editMode && renderList.length === 0) return null;

  const ids = renderList.map(({ section }) => section.id);

  // Map a move between zone-local positions to the global array indices.
  const reorder = (fromPos, toPos) => {
    const from = renderList[fromPos]?.index;
    const to = renderList[toPos]?.index;
    if (from == null || to == null) return;
    moveItem(["customSections"], from, to);
  };

  return (
    <div className={zone === "main" ? "mt-8" : ""}>
      <SortableList ids={ids} onReorder={reorder}>
        {renderList.map(({ section, index }, pos) => (
          <SortableItem key={section.id} id={section.id} as="div" className="relative">
            <CustomSection
              index={index}
              pos={pos}
              count={renderList.length}
              section={section}
              compact={zone === "sidebar"}
              onReorder={reorder}
            />
          </SortableItem>
        ))}
      </SortableList>

      {editMode && (
        <button
          onClick={() => addCustomSection(zone)}
          className="flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
        >
          <Plus className="w-3.5 h-3.5" /> Add section
        </button>
      )}
    </div>
  );
}

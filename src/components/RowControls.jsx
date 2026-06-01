/* eslint-disable react-hooks/refs -- dnd-kit's drag handle requires spreading
   its listeners/attributes and passing setActivatorNodeRef during render. */
import { Plus, Trash2, ChevronUp, ChevronDown, GripVertical } from "lucide-react";
import { useCvStore } from "../store/cvStore";
import { useDragHandle } from "./Sortable";

// Visibility per named group. Written as literal class strings so Tailwind's
// scanner picks them up. The matching container must use `group/<name>`.
const VISIBILITY = {
  item: "group-hover/item:opacity-100 group-focus-within/item:opacity-100",
  bullet: "group-hover/bullet:opacity-100 group-focus-within/bullet:opacity-100",
  role: "group-hover/role:opacity-100 group-focus-within/role:opacity-100",
  exp: "group-hover/exp:opacity-100 group-focus-within/exp:opacity-100",
};

// Hover-revealed controls for a single item in an editable list.
// Wrap the item in a `relative group/<group>` container and pass the same
// `group` here so only that item's controls appear (named groups don't cascade
// to sibling items). `onAdd` (optional) inserts a new sibling after this item.
export default function RowControls({
  onUp,
  onDown,
  onRemove,
  onAdd,
  group = "item",
  className = "",
}) {
  const editMode = useCvStore((s) => s.editMode);
  const handle = useDragHandle();
  if (!editMode) return null;

  const btn =
    "p-1 rounded bg-white/90 shadow ring-1 ring-gray-200 text-gray-600 hover:text-blue-700 hover:ring-blue-300 disabled:opacity-30 disabled:cursor-default cursor-pointer";

  return (
    <div
      className={`absolute -top-2 right-0 z-10 flex gap-1 opacity-0 transition print:hidden ${VISIBILITY[group]} ${className}`}
    >
      {handle && (
        <button
          type="button"
          ref={handle.setActivatorNodeRef}
          {...handle.attributes}
          {...handle.listeners}
          className={`${btn} cursor-grab active:cursor-grabbing touch-none`}
          title="Drag to reorder"
          aria-label="Drag to reorder"
        >
          <GripVertical className="w-3.5 h-3.5" />
        </button>
      )}
      <button type="button" className={btn} onClick={onUp} title="Move up" aria-label="Move up">
        <ChevronUp className="w-3.5 h-3.5" />
      </button>
      <button type="button" className={btn} onClick={onDown} title="Move down" aria-label="Move down">
        <ChevronDown className="w-3.5 h-3.5" />
      </button>
      {onAdd && (
        <button type="button" className={btn} onClick={onAdd} title="Add below" aria-label="Add below">
          <Plus className="w-3.5 h-3.5" />
        </button>
      )}
      <button
        type="button"
        className={`${btn} hover:text-red-600 hover:ring-red-300`}
        onClick={onRemove}
        title="Remove"
        aria-label="Remove"
      >
        <Trash2 className="w-3.5 h-3.5" />
      </button>
    </div>
  );
}

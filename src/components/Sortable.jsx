import { createContext, useContext } from "react";
import {
  DndContext,
  closestCenter,
  PointerSensor,
  KeyboardSensor,
  useSensor,
  useSensors,
} from "@dnd-kit/core";
import {
  SortableContext,
  verticalListSortingStrategy,
  rectSortingStrategy,
  sortableKeyboardCoordinates,
  useSortable,
} from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import { useCvStore } from "../store/cvStore";

// Context exposes the active item's drag-handle props to a nested handle button
// (rendered by RowControls), so dragging starts from the grip, not the text.
const HandleContext = createContext(null);
// eslint-disable-next-line react-refresh/only-export-components -- small hook colocated with its components
export const useDragHandle = () => useContext(HandleContext);

// Wrap a list. `ids` are stable per render; `onReorder(from, to)` does the move.
// Drag-and-drop is only active in edit mode. `layout="grid"` for wrapping chips.
export function SortableList({ ids, onReorder, layout = "list", children }) {
  const editMode = useCvStore((s) => s.editMode);
  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 5 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates })
  );

  if (!editMode) return children;

  return (
    <DndContext
      sensors={sensors}
      collisionDetection={closestCenter}
      onDragEnd={({ active, over }) => {
        if (over && active.id !== over.id) {
          onReorder(ids.indexOf(active.id), ids.indexOf(over.id));
        }
      }}
    >
      <SortableContext
        items={ids}
        strategy={layout === "grid" ? rectSortingStrategy : verticalListSortingStrategy}
      >
        {children}
      </SortableContext>
    </DndContext>
  );
}

// A single sortable item. Renders `as` (div/li/span) with the drag transform.
// By default it exposes handle props to a nested grip (via context); with
// `dragWholeItem` the whole element is the drag target (used for small chips).
export function SortableItem({ id, as: Tag = "div", className = "", dragWholeItem = false, children }) {
  const editMode = useCvStore((s) => s.editMode);
  const sortable = useSortable({ id, disabled: !editMode });
  const { attributes, listeners, setNodeRef, setActivatorNodeRef, transform, transition, isDragging } = sortable;

  if (!editMode) return <Tag className={className}>{children}</Tag>;

  const style = {
    transform: CSS.Translate.toString(transform),
    transition,
    zIndex: isDragging ? 30 : undefined,
  };
  const dragging = isDragging ? "opacity-80 shadow-lg ring-1 ring-[var(--cv-ring)] rounded bg-white" : "";

  if (dragWholeItem) {
    return (
      <Tag ref={setNodeRef} style={style} {...attributes} {...listeners} className={`${className} cursor-grab active:cursor-grabbing ${dragging}`}>
        {children}
      </Tag>
    );
  }

  return (
    <Tag ref={setNodeRef} style={style} className={`${className} ${dragging}`}>
      <HandleContext.Provider value={{ attributes, listeners, setActivatorNodeRef }}>
        {children}
      </HandleContext.Provider>
    </Tag>
  );
}

import { Eye, EyeOff, Plus } from "lucide-react";
import { useCvStore } from "../store/cvStore";
import { LinkIcon } from "../lib/linkPresets";
import Editable from "./Editable";
import IconPicker from "./IconPicker";
import RowControls from "./RowControls";
import { SortableList, SortableItem } from "./Sortable";

const ICON = "text-[var(--cv-icon)]";

// Editable, sortable list of bullet points under an entry.
function Bullets({ path, items }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const moveItem = useCvStore((s) => s.moveItem);

  if (!items.length && !editMode) return null;

  const prefix = path.join(".");
  const ids = items.map((_, i) => `${prefix}-${i}`);

  return (
    <>
      <SortableList ids={ids} onReorder={(f, t) => moveItem(path, f, t)}>
        <ul className="list-disc pl-5 space-y-1 mb-1">
          {items.map((b, i) => (
            <SortableItem key={ids[i]} id={ids[i]} as="li" className="relative group/bullet text-sm pr-16">
              <Editable multiline value={b} onChange={(v) => setField([...path, i], v)} />
              <RowControls
                group="bullet"
                onUp={() => moveItem(path, i, i - 1)}
                onDown={() => moveItem(path, i, i + 1)}
                onRemove={() => removeItem(path, i)}
              />
            </SortableItem>
          ))}
        </ul>
      </SortableList>
      {editMode && (
        <button
          onClick={() => addItem(path, "New bullet")}
          className="mb-3 ml-5 flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
        >
          <Plus className="w-3.5 h-3.5" /> Add bullet
        </button>
      )}
    </>
  );
}

// One entry: title (optionally a link) + subtitle + period + bullets.
function Entry({ basePath, index, item, compact }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const moveItem = useCvStore((s) => s.moveItem);
  const removeItem = useCvStore((s) => s.removeItem);

  const path = [...basePath, "items", index];
  const titleCls = compact ? "font-semibold text-sm" : "font-semibold text-lg";
  const metaCls = `opacity-75 mb-1 flex flex-wrap items-center gap-x-2 ${compact ? "text-xs" : "text-sm"}`;
  const hasSubtitle = item.subtitle || editMode;
  const hasPeriod = item.period || editMode;

  return (
    <SortableItem id={`${basePath.join(".")}-item-${index}`} as="div" className="relative mb-4">
      <div className="group/item">
        {editMode ? (
          <Editable as="div" className={titleCls} value={item.title} placeholder="Title" onChange={(v) => setField([...path, "title"], v)} />
        ) : item.url ? (
          <a href={item.url} target="_blank" rel="noreferrer" className={`${titleCls} inline-block`}>
            {item.title}
          </a>
        ) : (
          <div className={titleCls}>{item.title}</div>
        )}

        {(hasSubtitle || hasPeriod) && (
          <div className={metaCls}>
            {hasSubtitle && (
              <Editable inline className="font-medium" value={item.subtitle || ""} placeholder="Subtitle" onChange={(v) => setField([...path, "subtitle"], v)} />
            )}
            {hasPeriod && (
              <>
                {hasSubtitle && <span>|</span>}
                <Editable inline value={item.period || ""} placeholder="Period" onChange={(v) => setField([...path, "period"], v)} />
              </>
            )}
          </div>
        )}

        {editMode && (
          <Editable as="div" className="text-xs opacity-50 mb-1" value={item.url || ""} placeholder="Link URL (optional)" onChange={(v) => setField([...path, "url"], v)} />
        )}

        <RowControls
          group="item"
          onUp={() => moveItem([...basePath, "items"], index, index - 1)}
          onDown={() => moveItem([...basePath, "items"], index, index + 1)}
          onRemove={() => removeItem([...basePath, "items"], index)}
        />
      </div>

      <Bullets path={[...path, "bullets"]} items={item.bullets || []} />
    </SortableItem>
  );
}

// A single flexible, user-defined section. Mirrors the built-in Section header
// (icon + title + hide toggle) but with an editable title and a pickable icon.
// `pos`/`count`/`onReorder` operate on this section's position within its zone
// (sidebar/main); `index` is its real index in doc.customSections.
export default function CustomSection({ index, pos, count, section, compact, onReorder }) {
  const editMode = useCvStore((s) => s.editMode);
  const hidden = useCvStore((s) => s.doc.hiddenSections?.includes(section.id));
  const toggleSection = useCvStore((s) => s.toggleSection);
  const removeCustomSection = useCvStore((s) => s.removeCustomSection);
  const setField = useCvStore((s) => s.setField);
  const moveItem = useCvStore((s) => s.moveItem);
  const addItem = useCvStore((s) => s.addItem);

  const base = ["customSections", index];
  const items = section.items || [];
  const itemIds = items.map((_, i) => `${base.join(".")}-item-${i}`);

  return (
    <div className={`${compact ? "mb-6" : "mb-8"} ${hidden ? "opacity-40 print:hidden" : ""}`}>
      <div className="group/exp relative flex items-center gap-2 font-bold text-lg mb-4 pb-2 border-b pr-2">
        {editMode ? (
          <IconPicker iconKey={section.icon} onPick={(k) => setField([...base, "icon"], k || "link")} />
        ) : (
          <LinkIcon iconKey={section.icon} className={`w-5 h-5 ${ICON}`} />
        )}
        {editMode ? (
          <Editable className="flex-1 min-w-0" value={section.title} placeholder="Section title" onChange={(v) => setField([...base, "title"], v)} />
        ) : (
          <span>{section.title}</span>
        )}
        {editMode && (
          <button
            onClick={() => toggleSection(section.id)}
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
        <RowControls
          group="exp"
          onUp={() => pos > 0 && onReorder(pos, pos - 1)}
          onDown={() => pos < count - 1 && onReorder(pos, pos + 1)}
          onRemove={() => removeCustomSection(index)}
        />
      </div>

      <SortableList ids={itemIds} onReorder={(f, t) => moveItem([...base, "items"], f, t)}>
        {items.map((item, i) => (
          <Entry key={itemIds[i]} basePath={base} index={i} item={item} compact={compact} />
        ))}
      </SortableList>

      {editMode && (
        <button
          onClick={() => addItem([...base, "items"], { title: "Title", subtitle: "", period: "", url: "", bullets: [] })}
          className="flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
        >
          <Plus className="w-3.5 h-3.5" /> Add entry
        </button>
      )}
    </div>
  );
}

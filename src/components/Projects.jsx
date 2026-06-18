import { FolderGit2, Link as LinkIcon, Plus, X } from "lucide-react";
import { useCvStore } from "../store/cvStore";
import Editable from "./Editable";
import RowControls from "./RowControls";
import Section from "./Section";
import { SortableList, SortableItem } from "./Sortable";

function Tags({ projectIndex, tags }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  if (!tags.length && !editMode) return null;

  return (
    <div className="flex flex-wrap gap-1.5 mt-1">
      {tags.map((tag, ti) => (
        <span
          key={ti}
          className="text-xs bg-[var(--cv-chip-bg)] px-2 py-0.5 rounded"
        >
          {editMode ? (
            <Editable
              inline
              value={tag}
              onChange={(v) =>
                setField(["projects", projectIndex, "tags", ti], v)
              }
            />
          ) : (
            tag
          )}
          {editMode && (
            <button
              onClick={() => removeItem(["projects", projectIndex, "tags"], ti)}
              className="ml-1 text-gray-400 hover:text-red-600 cursor-pointer print:hidden"
              aria-label="Remove tag"
            >
              <X className="inline w-3 h-3" />
            </button>
          )}
        </span>
      ))}
      {editMode && (
        <button
          onClick={() => addItem(["projects", projectIndex, "tags"], "tag")}
          className="text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
        >
          + tag
        </button>
      )}
    </div>
  );
}

export default function Projects({ labels }) {
  const doc = useCvStore((s) => s.doc);
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const moveItem = useCvStore((s) => s.moveItem);
  const aiImproveTarget = useCvStore((s) => s.aiImproveTarget);

  const projects = doc.projects || [];
  const ids = projects.map((_, i) => `project-${i}`);

  // Don't render an empty "Projects" heading in view/print; only show the
  // section (with its Add button) while editing.
  if (!editMode && projects.length === 0) return null;

  return (
    <Section sectionKey="projects" icon={FolderGit2} title={labels.projects}>
      <SortableList
        ids={ids}
        onReorder={(from, to) => moveItem(["projects"], from, to)}
      >
        {projects.map((p, i) => (
          <SortableItem
            key={ids[i]}
            id={ids[i]}
            as="div"
            className="relative mb-5"
          >
            <div className="group/exp">
              <div className="flex flex-wrap items-center gap-x-2">
                <Editable
                  className="font-semibold text-lg"
                  value={p.name}
                  onChange={(v) => setField(["projects", i, "name"], v)}
                />
                {(p.period || editMode) && (
                  <span className="text-sm opacity-75">
                    <Editable
                      inline
                      value={p.period || ""}
                      placeholder="Period"
                      onChange={(v) => setField(["projects", i, "period"], v)}
                    />
                  </span>
                )}
                {(p.link || editMode) &&
                  (editMode ? (
                    <span className="text-sm opacity-75 flex items-center gap-1">
                      <LinkIcon className="w-3.5 h-3.5" />
                      <Editable
                        inline
                        value={p.link || ""}
                        placeholder="https://…"
                        onChange={(v) => setField(["projects", i, "link"], v)}
                      />
                    </span>
                  ) : (
                    <a
                      href={p.link}
                      target="_blank"
                      rel="noreferrer"
                      className="text-sm text-[var(--cv-accent)] inline-flex items-center gap-1"
                    >
                      <LinkIcon className="w-3.5 h-3.5" /> Link
                    </a>
                  ))}
              </div>
              <Editable
                as="div"
                multiline
                className="text-sm mt-1"
                value={p.description}
                placeholder="Description"
                onChange={(v) => setField(["projects", i, "description"], v)}
              />
              <Tags projectIndex={i} tags={p.tags || []} />
              <RowControls
                group="exp"
                onAi={() => aiImproveTarget({ path: ["projects", i] })}
                onUp={() => moveItem(["projects"], i, i - 1)}
                onDown={() => moveItem(["projects"], i, i + 1)}
                onRemove={() => removeItem(["projects"], i)}
              />
            </div>
          </SortableItem>
        ))}
      </SortableList>

      {editMode && (
        <button
          onClick={() =>
            addItem(["projects"], {
              name: "Project name",
              description: "",
              link: "",
              tags: [],
              period: "",
            })
          }
          className="flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
        >
          <Plus className="w-3.5 h-3.5" /> Add project
        </button>
      )}
    </Section>
  );
}

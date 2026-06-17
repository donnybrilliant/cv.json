import { Briefcase, Plus } from "lucide-react";
import { useCvStore } from "../store/cvStore";
import Editable from "./Editable";
import RowControls from "./RowControls";
import { SortableList, SortableItem } from "./Sortable";

const ICON = "text-[var(--cv-icon)]";

function AddButton({ onClick, label, className = "" }) {
  const editMode = useCvStore((s) => s.editMode);
  if (!editMode) return null;
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden ${className}`}
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

function newRole() {
  return { title: "Role title", period: "Period", type: "", responsibilities: ["New responsibility"] };
}

function convertExperienceToRoles(exp) {
  const { responsibilities, ...parent } = exp;
  const firstRole = {
    title: exp.position || "Role title",
    period: exp.period || exp.periods?.[0]?.period || "Period",
    type: exp.type || exp.periods?.[0]?.type || "",
    responsibilities: responsibilities?.length ? responsibilities : ["New responsibility"],
  };

  return {
    ...parent,
    position: "Multiple roles",
    roles: [firstRole, newRole()],
  };
}

function hasText(value) {
  return String(value || "").trim().length > 0;
}

// Editable, sortable list of responsibility bullets at the given store path.
function Responsibilities({ path, items }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const moveItem = useCvStore((s) => s.moveItem);

  const prefix = path.join(".");
  const ids = items.map((_, i) => `${prefix}-${i}`);

  return (
    <>
      <SortableList ids={ids} onReorder={(f, t) => moveItem(path, f, t)}>
        <ul className="list-disc pl-5 space-y-1 mb-2">
          {items.map((resp, i) => (
            <SortableItem key={ids[i]} id={ids[i]} as="li" className="relative group/bullet text-sm pr-16">
              <Editable multiline value={resp} onChange={(v) => setField([...path, i], v)} />
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
        <AddButton label="Add bullet" className="mb-3 ml-5" onClick={() => addItem(path, "New responsibility")} />
      )}
    </>
  );
}

export default function Experience({ labels }) {
  const doc = useCvStore((s) => s.doc);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const moveItem = useCvStore((s) => s.moveItem);
  const editMode = useCvStore((s) => s.editMode);

  const experience = doc.experience;
  const expIds = experience.map((_, i) => `exp-${i}`);

  return (
    <section className="mb-8">
      <div className="flex items-center gap-2 font-bold text-lg mb-4 pb-2 border-b">
        <Briefcase className={`w-5 h-5 ${ICON}`} />
        {labels.workExperience}
      </div>

      <SortableList ids={expIds} onReorder={(f, t) => moveItem(["experience"], f, t)}>
        {experience.map((exp, i) => {
          const roleIds = (exp.roles || []).map((_, ri) => `role-${ri}`);
          const showEmptyParentMeta = editMode;
          const showCompany = hasText(exp.company) || showEmptyParentMeta;
          const visiblePeriods = (exp.periods || []).filter((p) => hasText(p.period) || hasText(p.type) || showEmptyParentMeta);
          const showSinglePeriod = !exp.periods && (hasText(exp.period) || showEmptyParentMeta);
          const showSingleType = !exp.periods && (hasText(exp.type) || showEmptyParentMeta);
          const hasParentMeta = showCompany || visiblePeriods.length > 0 || showSinglePeriod || showSingleType;
          return (
            <SortableItem key={expIds[i]} id={expIds[i]} as="div" className="relative mb-6">
              {/* Header (position + meta). Hovering here — not the bullets below —
                  reveals this entry's move/delete/drag controls. */}
              <div className="group/exp">
                <Editable as="div" className="font-semibold text-lg" value={exp.position} onChange={(v) => setField(["experience", i, "position"], v)} />

                {/* Meta line: company | period(s) | type */}
                {hasParentMeta && (
                  <div className="text-sm opacity-75 mb-2 flex flex-wrap items-center gap-x-2">
                    {showCompany && <Editable inline className="font-medium" value={exp.company} onChange={(v) => setField(["experience", i, "company"], v)} />}
                    {visiblePeriods.map((p) => {
                      const pi = exp.periods.indexOf(p);
                      return (
                        <span key={pi} className="flex items-center gap-2">
                          {showCompany || pi > 0 ? <span>|</span> : null}
                        <Editable inline value={p.period} onChange={(v) => setField(["experience", i, "periods", pi, "period"], v)} />
                        {(hasText(p.type) || showEmptyParentMeta) && (
                          <>
                            <span>·</span>
                            <Editable inline value={p.type || ""} onChange={(v) => setField(["experience", i, "periods", pi, "type"], v)} />
                          </>
                        )}
                      </span>
                      );
                    })}
                    {showSinglePeriod && (
                      <>
                        {showCompany ? <span>|</span> : null}
                      <Editable inline value={exp.period || ""} onChange={(v) => setField(["experience", i, "period"], v)} />
                    </>
                    )}
                    {showSingleType && (
                      <>
                        {showCompany || showSinglePeriod ? <span>|</span> : null}
                      <Editable inline value={exp.type || ""} placeholder="Type (optional)" onChange={(v) => setField(["experience", i, "type"], v)} />
                    </>
                    )}
                  </div>
                )}
                <RowControls group="exp" onUp={() => moveItem(["experience"], i, i - 1)} onDown={() => moveItem(["experience"], i, i + 1)} onRemove={() => removeItem(["experience"], i)} />
              </div>

              {/* Roles (nested) or flat responsibilities */}
              {exp.roles ? (
                <div className="pl-2">
                  <SortableList ids={roleIds} onReorder={(f, t) => moveItem(["experience", i, "roles"], f, t)}>
                    {exp.roles.map((role, ri) => (
                      <SortableItem key={roleIds[ri]} id={roleIds[ri]} as="div" className="relative mb-2">
                        <div className="group/role">
                          <Editable as="div" className="font-semibold text-md" value={role.title} onChange={(v) => setField(["experience", i, "roles", ri, "title"], v)} />
                          <div className="text-sm opacity-75 mb-2 flex flex-wrap items-center gap-x-2">
                            <Editable inline value={role.period} onChange={(v) => setField(["experience", i, "roles", ri, "period"], v)} />
                            {(role.type || editMode) && (
                              <>
                                <span>|</span>
                                <Editable inline value={role.type || ""} placeholder="Type" onChange={(v) => setField(["experience", i, "roles", ri, "type"], v)} />
                              </>
                            )}
                          </div>
                          <RowControls group="role" onUp={() => moveItem(["experience", i, "roles"], ri, ri - 1)} onDown={() => moveItem(["experience", i, "roles"], ri, ri + 1)} onRemove={() => removeItem(["experience", i, "roles"], ri)} />
                        </div>
                        <Responsibilities path={["experience", i, "roles", ri, "responsibilities"]} items={role.responsibilities} />
                      </SortableItem>
                    ))}
                  </SortableList>
                  <AddButton
                    label="Add role"
                    onClick={() => addItem(["experience", i, "roles"], newRole())}
                  />
                </div>
              ) : (
                <>
                  <Responsibilities path={["experience", i, "responsibilities"]} items={exp.responsibilities || []} />
                  <AddButton label="Add role" onClick={() => setField(["experience", i], convertExperienceToRoles(exp))} />
                </>
              )}
            </SortableItem>
          );
        })}
      </SortableList>

      <AddButton
        label="Add experience"
        onClick={() => addItem(["experience"], { company: "Company", position: "Position", period: "Period", type: "", responsibilities: ["New responsibility"] })}
      />
    </section>
  );
}

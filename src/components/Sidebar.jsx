import { useEffect, useRef, useState } from "react";
import {
  Mail,
  Phone,
  MapPin,
  Award,
  Briefcase,
  GraduationCap,
  Code,
  Languages,
  House,
  Plus,
  Camera,
  Trash2,
} from "lucide-react";
import avatarFallback from "../assets/avatar.svg";
import { useCvStore } from "../store/cvStore";
import { avatarUrl } from "../api/client";
import { LinkIcon, resolveLink, ICON_PICKER_KEYS } from "../lib/linkPresets";
import Editable from "./Editable";
import RowControls from "./RowControls";
import Section from "./Section";
import { SortableList, SortableItem } from "./Sortable";

const ICON = "text-[var(--cv-icon)]";
const CONTACT = ["personalInfo", "contact"];

// Section header with icon + title (for sections that are always shown).
function SectionTitle({ icon: Icon, children }) {
  return (
    <div className="flex items-center gap-2 font-bold text-lg mb-4 pb-2 border-b">
      <Icon className={`w-5 h-5 ${ICON}`} />
      {children}
    </div>
  );
}

function AddButton({ onClick, label }) {
  const editMode = useCvStore((s) => s.editMode);
  if (!editMode) return null;
  return (
    <button
      onClick={onClick}
      className="mt-2 flex items-center gap-1 text-xs text-[var(--cv-accent)] hover:underline cursor-pointer print:hidden"
    >
      <Plus className="w-3.5 h-3.5" /> {label}
    </button>
  );
}

// Click the current icon to override it (or reset to auto-detect).
function IconPicker({ iconKey, onPick }) {
  const [open, setOpen] = useState(false);
  const ref = useRef(null);
  useEffect(() => {
    const onDoc = (e) => {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    };
    document.addEventListener("mousedown", onDoc);
    return () => document.removeEventListener("mousedown", onDoc);
  }, []);
  return (
    <span className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        title="Change icon"
        className="shrink-0 p-0.5 rounded hover:bg-black/5 cursor-pointer print:hidden"
      >
        <LinkIcon iconKey={iconKey} className={`w-4 h-4 ${ICON}`} />
      </button>
      {open && (
        <div className="absolute left-0 top-7 z-50 p-2 bg-white rounded-lg shadow-xl ring-1 ring-gray-200 grid grid-cols-6 gap-1 w-44">
          {ICON_PICKER_KEYS.map((k) => (
            <button
              key={k}
              type="button"
              title={k}
              onClick={() => {
                onPick(k);
                setOpen(false);
              }}
              className={`p-1 rounded hover:bg-gray-100 cursor-pointer ${k === iconKey ? "bg-gray-100 text-gray-900" : "text-gray-600"}`}
            >
              <LinkIcon iconKey={k} className="w-4 h-4" />
            </button>
          ))}
          <button
            type="button"
            onClick={() => {
              onPick("");
              setOpen(false);
            }}
            className="col-span-6 mt-1 text-xs text-gray-500 hover:text-gray-800 cursor-pointer"
          >
            Auto-detect from URL
          </button>
        </div>
      )}
    </span>
  );
}

// A bare contact field (email / phone). The input holds just the value — the
// scheme (mailto:/tel:) is added only for the link in view mode.
function SimpleField({ icon: Icon, value, placeholder, href, path }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  if (!editMode && !value) return null;
  return (
    <div className="flex items-center gap-2">
      <Icon className={`w-4 h-4 ${ICON} shrink-0`} />
      {editMode ? (
        <Editable inline className="text-sm" value={value} placeholder={placeholder} onChange={(v) => setField(path, v)} />
      ) : (
        <span className="text-sm">
          <a href={href} target="_blank" rel="noreferrer">
            {value}
          </a>
        </span>
      )}
    </div>
  );
}

// One contact link (portfolio, profiles, …). View: icon + auto/overridden
// label, linked. Edit: icon picker + URL input + label, draggable.
function ContactLinkRow({ index, link }) {
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const moveItem = useCvStore((s) => s.moveItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const base = [...CONTACT, "links", index];
  const { iconKey, label, detectedLabel } = resolveLink(link);

  if (!editMode) {
    if (!link.url) return null;
    return (
      <div className="flex items-center gap-2">
        <LinkIcon iconKey={iconKey} className={`w-4 h-4 ${ICON} shrink-0`} />
        <span className="text-sm">
          <a href={link.url} target="_blank" rel="noreferrer">
            {label}
          </a>
        </span>
      </div>
    );
  }

  return (
    <SortableItem id={`link-${index}`} as="div" className="relative group/item pr-14">
      <div className="flex items-start gap-2">
        <span className="mt-0.5">
          <IconPicker iconKey={iconKey} onPick={(k) => setField([...base, "icon"], k)} />
        </span>
        <div className="flex-1 min-w-0">
          <Editable
            className="text-sm"
            value={link.url}
            placeholder="https://… or mailto:…"
            onChange={(v) => setField([...base, "url"], v)}
          />
          <Editable
            className="text-xs opacity-70"
            value={link.label || detectedLabel}
            placeholder="Label"
            onChange={(v) => setField([...base, "label"], v === detectedLabel ? "" : v)}
          />
        </div>
      </div>
      <RowControls
        group="item"
        onUp={() => moveItem([...CONTACT, "links"], index, index - 1)}
        onDown={() => moveItem([...CONTACT, "links"], index, index + 1)}
        onRemove={() => removeItem([...CONTACT, "links"], index)}
      />
    </SortableItem>
  );
}

// Profile photo with upload/remove affordances in edit mode.
function Avatar({ name }) {
  const editMode = useCvStore((s) => s.editMode);
  const avatarVersion = useCvStore((s) => s.avatarVersion);
  const uploadAvatar = useCvStore((s) => s.uploadAvatar);
  const deleteAvatar = useCvStore((s) => s.deleteAvatar);
  const fileRef = useRef(null);

  const onPick = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => uploadAvatar(reader.result);
    reader.readAsDataURL(file);
    e.target.value = "";
  };

  return (
    <div className="max-w-48 mx-auto my-11 relative group/avatar">
      <img
        key={avatarVersion}
        src={avatarUrl(avatarVersion)}
        onError={(e) => {
          if (e.currentTarget.dataset.fallback) return; // avoid loops
          e.currentTarget.dataset.fallback = "1";
          e.currentTarget.src = avatarFallback;
        }}
        className="rounded-full w-full aspect-square object-cover"
        alt={name}
      />
      {editMode && (
        <div className="absolute inset-0 flex items-center justify-center gap-2 rounded-full bg-black/40 opacity-0 group-hover/avatar:opacity-100 transition print:hidden">
          <button onClick={() => fileRef.current?.click()} className="p-2 rounded-full bg-white/90 text-gray-700 hover:bg-white cursor-pointer" title="Upload photo">
            <Camera className="w-5 h-5" />
          </button>
          <button onClick={() => deleteAvatar()} className="p-2 rounded-full bg-white/90 text-gray-700 hover:text-red-600 hover:bg-white cursor-pointer" title="Remove photo">
            <Trash2 className="w-5 h-5" />
          </button>
          <input ref={fileRef} type="file" accept="image/*" className="hidden" onChange={onPick} />
        </div>
      )}
    </div>
  );
}

export default function Sidebar({ labels }) {
  const doc = useCvStore((s) => s.doc);
  const editMode = useCvStore((s) => s.editMode);
  const setField = useCvStore((s) => s.setField);
  const addItem = useCvStore((s) => s.addItem);
  const removeItem = useCvStore((s) => s.removeItem);
  const moveItem = useCvStore((s) => s.moveItem);

  const { personalInfo, education, skills, certifications, languages } = doc;
  const c = personalInfo.contact;
  const links = c.links || [];
  const locations = c.locations || [];

  const linkIds = links.map((_, i) => `link-${i}`);
  const locIds = locations.map((_, i) => `loc-${i}`);
  const eduIds = education.map((_, i) => `edu-${i}`);
  const skillIds = skills.map((_, i) => `skill-${i}`);
  const certIds = certifications.map((_, i) => `cert-${i}`);
  const langIds = languages.map((_, i) => `lang-${i}`);

  return (
    <div className="p-6 bg-[var(--cv-bg)] text-[var(--cv-text)] border-r border-[var(--cv-border)]">
      <Avatar name={personalInfo.name} />

      <div className="space-y-6 mt-6">
        {/* Contact */}
        <div>
          <SectionTitle icon={Briefcase}>{labels.contact}</SectionTitle>
          <div className="space-y-3">
            {/* Email & phone (bare values) */}
            <SimpleField icon={Mail} value={c.email} placeholder="you@example.com" href={`mailto:${c.email}`} path={[...CONTACT, "email"]} />
            <SimpleField icon={Phone} value={c.phone} placeholder="+47 000 00 000" href={`tel:${c.phone}`} path={[...CONTACT, "phone"]} />

            {/* Locations (city / country with a map link) */}
            <SortableList ids={locIds} onReorder={(f, t) => moveItem([...CONTACT, "locations"], f, t)}>
              {locations.map((loc, i) => (
                <SortableItem key={locIds[i]} id={locIds[i]} as="div" className="relative group/item flex items-center gap-2">
                  {i === 0 ? <House className={`w-4 h-4 ${ICON} shrink-0`} /> : <MapPin className={`w-4 h-4 ${ICON} shrink-0`} />}
                  {editMode ? (
                    <span className="flex flex-wrap gap-1 text-sm pr-14">
                      <Editable inline value={loc.city} placeholder="City" onChange={(v) => setField([...CONTACT, "locations", i, "city"], v)} />
                      <Editable inline value={loc.country} placeholder="Country" onChange={(v) => setField([...CONTACT, "locations", i, "country"], v)} />
                    </span>
                  ) : (
                    <span className="text-sm">
                      {loc.mapUrl ? (
                        <a href={loc.mapUrl} target="_blank" rel="noreferrer">
                          {loc.city}, {loc.country}
                        </a>
                      ) : (
                        `${loc.city}, ${loc.country}`
                      )}
                    </span>
                  )}
                  <RowControls
                    group="item"
                    onUp={() => moveItem([...CONTACT, "locations"], i, i - 1)}
                    onDown={() => moveItem([...CONTACT, "locations"], i, i + 1)}
                    onRemove={() => removeItem([...CONTACT, "locations"], i)}
                  />
                </SortableItem>
              ))}
            </SortableList>
            <AddButton label="Add location" onClick={() => addItem([...CONTACT, "locations"], { city: "City", country: "Country", mapUrl: "" })} />

            {/* Links (auto icon + label) */}
            <SortableList ids={linkIds} onReorder={(f, t) => moveItem([...CONTACT, "links"], f, t)}>
              {links.map((link, i) => (
                <ContactLinkRow key={linkIds[i]} index={i} link={link} />
              ))}
            </SortableList>
            <AddButton label="Add link" onClick={() => addItem([...CONTACT, "links"], { url: "" })} />
          </div>
        </div>

        {/* Education */}
        <div>
          <SectionTitle icon={GraduationCap}>{labels.education}</SectionTitle>
          <SortableList ids={eduIds} onReorder={(f, t) => moveItem(["education"], f, t)}>
            {education.map((edu, i) => (
              <SortableItem key={eduIds[i]} id={eduIds[i]} as="div" className="relative group/item mb-4">
                <Editable as="div" className="font-semibold text-sm" value={edu.degree} onChange={(v) => setField(["education", i, "degree"], v)} />
                {(edu.specialization || editMode) && (
                  <Editable as="div" className="text-sm opacity-90" placeholder="Specialization (optional)" value={edu.specialization || ""} onChange={(v) => setField(["education", i, "specialization"], v)} />
                )}
                <Editable as="div" className="text-sm opacity-90" value={edu.institution} onChange={(v) => setField(["education", i, "institution"], v)} />
                <Editable as="div" className="text-sm opacity-50" value={edu.year} onChange={(v) => setField(["education", i, "year"], v)} />
                <RowControls group="item" onUp={() => moveItem(["education"], i, i - 1)} onDown={() => moveItem(["education"], i, i + 1)} onRemove={() => removeItem(["education"], i)} />
              </SortableItem>
            ))}
          </SortableList>
          <AddButton label="Add education" onClick={() => addItem(["education"], { degree: "Degree", institution: "Institution", year: "Year" })} />
        </div>

        {/* Skills (toggleable) */}
        <Section sectionKey="skills" icon={Code} title={labels.skills}>
          <SortableList ids={skillIds} layout="grid" onReorder={(f, t) => moveItem(["skills"], f, t)}>
            <div className="flex flex-wrap gap-2">
              {skills.map((skill, i) => (
                <SortableItem key={skillIds[i]} id={skillIds[i]} as="span" dragWholeItem className="text-sm bg-white/60 px-2 py-1 rounded inline-flex items-center">
                  {editMode ? (
                    <Editable inline value={skill} onChange={(v) => setField(["skills", i], v)} />
                  ) : (
                    skill
                  )}
                  {editMode && (
                    <button onMouseDown={(e) => e.stopPropagation()} onPointerDown={(e) => e.stopPropagation()} onClick={() => removeItem(["skills"], i)} className="ml-1 text-gray-400 hover:text-red-600 cursor-pointer print:hidden" aria-label="Remove skill">
                      ×
                    </button>
                  )}
                </SortableItem>
              ))}
            </div>
          </SortableList>
          <AddButton label="Add skill" onClick={() => addItem(["skills"], "New skill")} />
        </Section>

        {/* Certifications (toggleable) */}
        <Section sectionKey="certifications" icon={Award} title={labels.certifications}>
          <SortableList ids={certIds} onReorder={(f, t) => moveItem(["certifications"], f, t)}>
            <ul className="space-y-2">
              {certifications.map((cert, i) => (
                <SortableItem key={certIds[i]} id={certIds[i]} as="li" className="relative group/item text-sm">
                  {editMode ? (
                    <Editable as="div" className="font-semibold text-sm" value={cert.name} onChange={(v) => setField(["certifications", i, "name"], v)} />
                  ) : (
                    <div className="font-semibold text-sm">
                      {cert.url ? (
                        <a href={cert.url} target="_blank" rel="noreferrer">
                          {cert.name}
                        </a>
                      ) : (
                        cert.name
                      )}
                    </div>
                  )}
                  <Editable as="div" className="text-sm opacity-90" value={cert.provider} onChange={(v) => setField(["certifications", i, "provider"], v)} />
                  <Editable as="div" className="text-sm opacity-50" value={cert.hours} onChange={(v) => setField(["certifications", i, "hours"], v)} />
                  {editMode && (
                    <Editable as="div" className="text-xs opacity-50" placeholder="Certificate URL (optional)" value={cert.url || ""} onChange={(v) => setField(["certifications", i, "url"], v)} />
                  )}
                  <RowControls group="item" onUp={() => moveItem(["certifications"], i, i - 1)} onDown={() => moveItem(["certifications"], i, i + 1)} onRemove={() => removeItem(["certifications"], i)} />
                </SortableItem>
              ))}
            </ul>
          </SortableList>
          <AddButton label="Add certification" onClick={() => addItem(["certifications"], { name: "Name", provider: "Provider", hours: "" })} />
        </Section>

        {/* Languages (toggleable) */}
        <Section sectionKey="languages" icon={Languages} title={labels.languages}>
          <SortableList ids={langIds} onReorder={(f, t) => moveItem(["languages"], f, t)}>
            <ul className="space-y-2">
              {languages.map((lng, i) => (
                <SortableItem key={langIds[i]} id={langIds[i]} as="li" className="relative group/item text-sm flex gap-1 items-center">
                  {editMode ? (
                    <>
                      <Editable inline value={lng.language} onChange={(v) => setField(["languages", i, "language"], v)} />
                      <span>-</span>
                      <Editable inline value={lng.level} onChange={(v) => setField(["languages", i, "level"], v)} />
                    </>
                  ) : (
                    <span>
                      {lng.language} - {lng.level}
                    </span>
                  )}
                  <RowControls group="item" onUp={() => moveItem(["languages"], i, i - 1)} onDown={() => moveItem(["languages"], i, i + 1)} onRemove={() => removeItem(["languages"], i)} />
                </SortableItem>
              ))}
            </ul>
          </SortableList>
          <AddButton label="Add language" onClick={() => addItem(["languages"], { language: "Language", level: "Level" })} />
        </Section>
      </div>
    </div>
  );
}

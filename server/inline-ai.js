import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject } from "ai";
import { englishName } from "../src/i18n/languages.js";

function getModel(env) {
  const apiKey = env.OPENROUTER_API_KEY;
  if (!apiKey) {
    throw new Error(
      "OPENROUTER_API_KEY is not set. Copy .env.example to .env and add your OpenRouter key."
    );
  }
  const modelId = env.OPENROUTER_MODEL || "openai/gpt-4o-mini";
  const openrouter = createOpenRouter({ apiKey });
  return openrouter(modelId);
}

function languageName(lang) {
  return englishName(lang) || "English";
}

function cloneDoc(doc) {
  return JSON.parse(JSON.stringify(doc));
}

function isIndex(value) {
  return Number.isInteger(value) && value >= 0;
}

function pathLabel(path) {
  return Array.isArray(path) ? path.join(".") : "(missing path)";
}

function getAt(doc, path) {
  let node = doc;
  for (const part of path) {
    if (node == null || !(part in Object(node))) {
      throw new Error(`Invalid inline AI target: ${pathLabel(path)}.`);
    }
    node = node[part];
  }
  return node;
}

function setAt(doc, path, value) {
  if (!Array.isArray(path) || path.length === 0) {
    throw new Error("Invalid inline AI target: path must not be empty.");
  }
  let node = doc;
  for (let i = 0; i < path.length - 1; i++) {
    const part = path[i];
    if (node == null || typeof node !== "object" || !(part in node)) {
      throw new Error(`Invalid inline AI target: ${pathLabel(path)}.`);
    }
    node = node[part];
  }
  const key = path[path.length - 1];
  if (node == null || typeof node !== "object" || !(key in node)) {
    throw new Error(`Invalid inline AI target: ${pathLabel(path)}.`);
  }
  node[key] = value;
}

function asObject(value) {
  return value && typeof value === "object" && !Array.isArray(value) ? value : {};
}

function cleanText(value) {
  if (typeof value !== "string") return null;
  const text = value.trim();
  return text ? text : null;
}

function cleanTextArray(value) {
  if (!Array.isArray(value)) return null;
  const out = value.map(cleanText).filter(Boolean);
  return out.length ? out : null;
}

function unwrapResult(result) {
  if (!result || typeof result !== "object" || Array.isArray(result)) return result;
  return result.target || result.rewrite || result.result || result;
}

function resultText(result) {
  const unwrapped = unwrapResult(result);
  if (typeof unwrapped === "string") return cleanText(unwrapped);
  const obj = asObject(unwrapped);
  return cleanText(obj.text) || cleanText(obj.bullet) || cleanText(obj.value) || cleanText(obj.bio);
}

function assertPath(path, length, parts) {
  if (path.length !== length) return false;
  return parts.every((part, i) => part === "*" || path[i] === part);
}

function classifyExperienceTarget(doc, path) {
  if (path.length < 2 || path[0] !== "experience" || !isIndex(path[1])) return null;
  const exp = getAt(doc, ["experience", path[1]]);
  if (!exp || typeof exp !== "object") throw new Error(`Invalid inline AI target: ${pathLabel(path)}.`);

  if (path.length === 2) return { kind: "experience", path };

  if (assertPath(path, 4, ["experience", "*", "responsibilities", "*"]) && isIndex(path[3])) {
    getAt(doc, path);
    return { kind: "bullet", path };
  }

  if (assertPath(path, 4, ["experience", "*", "roles", "*"]) && isIndex(path[3])) {
    getAt(doc, path);
    return { kind: "role", path };
  }

  if (
    assertPath(path, 6, ["experience", "*", "roles", "*", "responsibilities", "*"]) &&
    isIndex(path[3]) &&
    isIndex(path[5])
  ) {
    getAt(doc, path);
    return { kind: "bullet", path };
  }

  return null;
}

function classifyCustomSectionTarget(doc, path) {
  if (path.length < 2 || path[0] !== "customSections" || !isIndex(path[1])) return null;
  const section = getAt(doc, ["customSections", path[1]]);
  if (!section || typeof section !== "object") {
    throw new Error(`Invalid inline AI target: ${pathLabel(path)}.`);
  }
  if ((section.placement || "main") === "sidebar") {
    throw new Error("Inline AI does not apply to sidebar sections.");
  }

  if (path.length === 2) return { kind: "customSection", path };

  if (assertPath(path, 4, ["customSections", "*", "items", "*"]) && isIndex(path[3])) {
    getAt(doc, path);
    return { kind: "customEntry", path };
  }

  if (
    assertPath(path, 6, ["customSections", "*", "items", "*", "bullets", "*"]) &&
    isIndex(path[3]) &&
    isIndex(path[5])
  ) {
    getAt(doc, path);
    return { kind: "bullet", path };
  }

  return null;
}

function classifyInlineAiTarget(doc, target) {
  const path = target?.path;
  if (!Array.isArray(path)) throw new Error("Inline AI target must include a path array.");

  if (assertPath(path, 2, ["personalInfo", "bio"])) {
    getAt(doc, path);
    return { kind: "bio", path };
  }

  const exp = classifyExperienceTarget(doc, path);
  if (exp) return exp;

  if (assertPath(path, 2, ["projects", "*"]) && isIndex(path[1])) {
    getAt(doc, path);
    return { kind: "project", path };
  }

  const custom = classifyCustomSectionTarget(doc, path);
  if (custom) return custom;

  throw new Error("Inline AI targets are limited to main CV prose; sidebar fields are not supported.");
}

export function assertInlineAiTargetAllowed(doc, target) {
  return classifyInlineAiTarget(doc, target);
}

function mergeRole(current, proposed) {
  const p = asObject(proposed);
  const title = cleanText(p.title);
  const responsibilities = cleanTextArray(p.responsibilities);
  return {
    ...current,
    ...(title ? { title } : {}),
    ...(responsibilities ? { responsibilities } : {}),
  };
}

function mergeExperience(current, proposed) {
  const p = asObject(proposed);
  const position = cleanText(p.position);
  const responsibilities = cleanTextArray(p.responsibilities);
  const next = {
    ...current,
    ...(position ? { position } : {}),
    ...(responsibilities ? { responsibilities } : {}),
  };

  if (Array.isArray(current.roles) && Array.isArray(p.roles)) {
    next.roles = current.roles.map((role, i) => mergeRole(role, p.roles[i]));
  }

  return next;
}

function mergeProject(current, proposed) {
  const p = asObject(proposed);
  const name = cleanText(p.name);
  const description = cleanText(p.description) || resultText(proposed);
  const tags = cleanTextArray(p.tags);
  return {
    ...current,
    ...(name ? { name } : {}),
    ...(description ? { description } : {}),
    ...(tags ? { tags } : {}),
  };
}

function mergeCustomEntry(current, proposed) {
  const p = asObject(proposed);
  const title = cleanText(p.title);
  const subtitle = cleanText(p.subtitle);
  const bullets = cleanTextArray(p.bullets);
  return {
    ...current,
    ...(title ? { title } : {}),
    ...(subtitle ? { subtitle } : {}),
    ...(bullets ? { bullets } : {}),
  };
}

function mergeCustomSection(current, proposed) {
  const p = asObject(proposed);
  const title = cleanText(p.title);
  const next = {
    ...current,
    ...(title ? { title } : {}),
  };
  if (Array.isArray(current.items) && Array.isArray(p.items)) {
    next.items = current.items.map((item, i) => mergeCustomEntry(item, p.items[i]));
  }
  return next;
}

function assertNeverKind(info) {
  throw new Error(`Unhandled inline AI target kind: ${info?.kind || "unknown"}.`);
}

export function applyInlineAiResult(doc, target, result) {
  const out = cloneDoc(doc);
  const info = classifyInlineAiTarget(out, target);
  const proposed = unwrapResult(result);

  switch (info.kind) {
    case "bio": {
      const text = resultText(proposed);
      if (text) setAt(out, info.path, text);
      return out;
    }
    case "bullet": {
      const text = resultText(proposed);
      if (text) setAt(out, info.path, text);
      return out;
    }
    case "experience": {
      const current = getAt(out, info.path);
      setAt(out, info.path, mergeExperience(current, proposed));
      return out;
    }
    case "role": {
      const current = getAt(out, info.path);
      setAt(out, info.path, mergeRole(current, proposed));
      return out;
    }
    case "project": {
      const current = getAt(out, info.path);
      setAt(out, info.path, mergeProject(current, proposed));
      return out;
    }
    case "customEntry": {
      const current = getAt(out, info.path);
      setAt(out, info.path, mergeCustomEntry(current, proposed));
      return out;
    }
    case "customSection": {
      const current = getAt(out, info.path);
      setAt(out, info.path, mergeCustomSection(current, proposed));
      return out;
    }
    default:
      assertNeverKind(info);
  }
}

function mainCustomSections(doc) {
  return (doc.customSections || [])
    .filter((section) => (section.placement || "main") !== "sidebar")
    .map(({ id, icon, placement, ...section }) => section);
}

export function buildInlineCvContext(doc) {
  return {
    personalInfo: {
      titles: doc.personalInfo?.titles || [],
      bio: doc.personalInfo?.bio || "",
    },
    skills: doc.skills || [],
    experience: doc.experience || [],
    projects: doc.projects || [],
    customSections: mainCustomSections(doc),
  };
}

function editableTargetForPrompt(doc, info) {
  const node = getAt(doc, info.path);
  if (info.kind === "bio" || info.kind === "bullet") return node;
  if (info.kind === "role") {
    return {
      title: node.title || "",
      protected: { period: node.period || "", type: node.type || "" },
      responsibilities: node.responsibilities || [],
    };
  }
  if (info.kind === "experience") {
    return {
      position: node.position || "",
      protected: {
        company: node.company || "",
        period: node.period || "",
        periods: node.periods || [],
        type: node.type || "",
      },
      responsibilities: node.responsibilities || [],
      roles: (node.roles || []).map((role) => ({
        title: role.title || "",
        protected: { period: role.period || "", type: role.type || "" },
        responsibilities: role.responsibilities || [],
      })),
    };
  }
  if (info.kind === "project") {
    return {
      name: node.name || "",
      description: node.description || "",
      tags: node.tags || [],
      protected: { period: node.period || "", link: node.link || "" },
    };
  }
  if (info.kind === "customEntry") {
    return {
      title: node.title || "",
      subtitle: node.subtitle || "",
      bullets: node.bullets || [],
      protected: { period: node.period || "", url: node.url || "" },
    };
  }
  if (info.kind === "customSection") {
    return {
      title: node.title || "",
      items: (node.items || []).map((item) => ({
        title: item.title || "",
        subtitle: item.subtitle || "",
        bullets: item.bullets || [],
        protected: { period: item.period || "", url: item.url || "" },
      })),
    };
  }
  return node;
}

function outputContract(kind) {
  if (kind === "bio") return `{ "text": "rewritten bio" }`;
  if (kind === "bullet") return `{ "text": "rewritten bullet" }`;
  if (kind === "role") {
    return `{ "title": "rewritten title or current title", "responsibilities": ["rewritten bullet"] }`;
  }
  if (kind === "experience") {
    return `{ "position": "rewritten role title or current title", "responsibilities": ["rewritten bullet"], "roles": [{ "title": "rewritten title", "responsibilities": ["rewritten bullet"] }] }`;
  }
  if (kind === "project") {
    return `{ "name": "rewritten project title or current title", "description": "rewritten description", "tags": ["relevant tag"] }`;
  }
  if (kind === "customEntry") {
    return `{ "title": "rewritten title", "subtitle": "rewritten subtitle", "bullets": ["rewritten bullet"] }`;
  }
  return `{ "title": "rewritten section title", "items": [{ "title": "rewritten item title", "subtitle": "rewritten subtitle", "bullets": ["rewritten bullet"] }] }`;
}

const INLINE_AI_SYSTEM = `You are an expert CV editor. Improve only the requested CV target, using the compact CV context for voice, facts and relevance.

Hard rules:
- Use only facts already present in the CV context. Do not invent employers, projects, education, metrics, dates, tools, achievements or credentials.
- Preserve the output language requested by the user.
- Never change company names, dates, periods, employment type, links, URLs, ids, icons, placement, contact information or sidebar-only content.
- Keep the rewrite concise, specific, truthful and CV-ready.
- Return only valid JSON matching the requested shape.`;

function buildPrompt({ doc, lang, target, info, cvSource }) {
  return (
    `Output language: ${languageName(lang)}.\n` +
    `CV source: ${cvSource || "current in-browser document"}.\n` +
    `Target path: ${pathLabel(target.path)}.\n` +
    `Target kind: ${info.kind}.\n\n` +
    `Return shape:\n${outputContract(info.kind)}\n\n` +
    `=== REQUESTED TARGET ===\n${JSON.stringify(editableTargetForPrompt(doc, info), null, 2)}\n\n` +
    `=== COMPACT CV CONTEXT (for grounding only; do not rewrite this whole object) ===\n` +
    `${JSON.stringify(buildInlineCvContext(doc), null, 2)}`
  );
}

export async function improveInlineTarget({ env, doc, lang, target, cvSource }) {
  const info = classifyInlineAiTarget(doc, target);
  const { object } = await generateObject({
    model: getModel(env),
    output: "no-schema",
    system: INLINE_AI_SYSTEM,
    prompt: buildPrompt({ doc, lang, target, info, cvSource }),
  });
  return applyInlineAiResult(doc, target, object);
}

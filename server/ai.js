// AI helpers for job-tailoring: rewrite the CV for a specific posting and draft
// a cover letter. Provider-agnostic via the Vercel AI SDK, wired to OpenRouter
// (one key, many models). The model is chosen in .env (OPENROUTER_MODEL).
//
// The API key never reaches the browser — these run only in the Node-backed
// Vite middleware (see server/api.js), so the feature works under
// `npm run dev` / `npm run preview`, consistent with this app being local-first.
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import { generateObject, streamText } from "ai";
import { z } from "zod";

const LANG_NAMES = { no: "Norwegian", en: "English", es: "Spanish" };

// Resolve the configured model lazily so a missing key only errors when the
// feature is actually used (not at server boot).
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

// Schema for the *tailorable* content. Only the sections that genuinely benefit
// from tailoring are here: the summary, skills, experience and projects. Factual
// sections (education, certifications, languages) and identity/contact/theme/
// visibility are preserved server-side and intentionally excluded so the model
// can never alter or drop them.
//
// `bio` is required so the model can't quietly leave the summary unchanged — the
// most common "it only changed the bio (or didn't even do that)" complaint.
//
// NOTE: these schemas avoid `.optional()` on purpose. OpenAI's strict
// structured-output mode requires EVERY property to be listed as required, so an
// optional field makes the whole request fail. Use `.nullable()` for "may be
// absent" instead, and treat null as "not provided" in the merge code.
const contactlessPersonalInfo = z.object({
  titles: z.array(z.string()),
  bio: z.string(),
});

// Experience is tailored as a list of DECISIONS keyed by a stable `id` we hand
// the model (one per real entry and per real nested role). The model can only
// reference ids that exist, so it can never invent a job (e.g. the one being
// applied to). Each decision says where the role belongs and supplies rewritten
// bullets:
//   - "primary":    a prominent, full entry (relevant roles — expand them)
//   - "additional": demote into the compact "Additional Experience" block
//   - "remove":     drop entirely (only the truly irrelevant)
const experienceDecisionSchema = z.object({
  id: z.string(),
  placement: z.enum(["primary", "additional", "remove"]),
  bullets: z.array(z.string()).nullable(), // null = keep current bullets
});

// Projects are also tailored by decision keyed by id: keep (and reword) or
// remove the ones irrelevant to this job. Never add a project.
const projectDecisionSchema = z.object({
  id: z.string(),
  placement: z.enum(["keep", "remove"]),
  description: z.string().nullable(), // null = keep current description
  tags: z.array(z.string()).nullable(), // null = keep current tags
});

const cvContentSchema = z.object({
  personalInfo: contactlessPersonalInfo,
  skills: z.array(z.string()),
  experience: z.array(experienceDecisionSchema),
  projects: z.array(projectDecisionSchema),
});

// Tiny schema for the optional "research the company" step: pull the employer's
// name and best-guess official website out of the posting so we can fetch a bit
// of real context about them.
const companySchema = z.object({
  company: z.string().nullable(),
  website: z.string().nullable(),
});

const TAILOR_SYSTEM = `You are an expert career coach and resume editor. You tailor an existing CV to ONE specific job posting, so a busy hiring manager instantly sees the fit.

Facts you may use:
- Everything already in the candidate's CV.
- Any ADDITIONAL CONTEXT the candidate supplies (extra true facts about themselves — e.g. tools, domains or hands-on experience not yet written down). Treat this as factual and weave it in wherever it strengthens the application.
- COMPANY RESEARCH notes, if provided — use these ONLY to understand the employer and silently steer emphasis/keywords. They are background, never content for the CV.

ABSOLUTE rules — breaking any of these makes the output useless:
- NEVER invent experience. You are given a list of EXPERIENCE UNITS, each with a stable "id". You may ONLY reference those ids. Never make up an id, and never add the company or role being applied to as if the candidate already worked there.
- NEVER name, address, or reference the hiring company / employer being applied to anywhere in the CV (not in the bio, skills, bullets, or anywhere else). A CV is a standalone document about the candidate — the employer's name belongs ONLY in the cover letter. Do not write things like "excited to join <Company>" or "a great fit for <Company>". Tailor by emphasising relevant skills and domain language, not by addressing the company.
- Do not fabricate skills or achievements beyond the CV and the candidate's additional context.
- Never change a unit's company, title, dates or employer — only its bullet points.
- Stay strictly in the requested output language.

EXPERIENCE — you are given EXPERIENCE UNITS in two shapes. Decisions are objects { id, placement, bullets }; return them as a flat array (also for the roles inside an employer_group).

1) "job" — a standalone position with its own id. Choose placement:
   - "primary": keep as a full, prominent entry. Use for roles relevant to THIS job, directly OR via strong transferable skills. Anything development-related (web/app/fullstack, UI/UX, technical teaching, technical work) is relevant for a developer role and MUST stay primary. EXPAND these with strong, specific, results-oriented bullets (grounded in the current bullets, the CV and the additional context).
   - "additional": demote into a compact "Additional Experience" one-liner. Use SPARINGLY — only a small handful of genuinely transferable roles (operations, logistics, leadership, hands-on/domain work the posting values). CONDENSE to one tight line.
   - "remove": DROP the role entirely. Be decisive — a tailored CV is short. Old, unrelated jobs (food service, retail, bar/restaurant, warehouse, cleaning, care work, etc. with no real link to this job) should be REMOVED, not demoted.

2) "employer_group" — one employer (a "company") with several "roles", each with its own id. NEVER drop or rename the employer/company. For EACH role return a decision: placement "primary" keeps the role under that employer (rewrite/expand its bullets), placement "remove" drops just that role (e.g. a pure "musician" role for a developer position). Keep the relevant roles, remove clearly irrelevant ones.

Rules of thumb: PREFER "remove" over "additional" for anything not clearly transferable — when in doubt about an old, unrelated job, remove it. Keep the genuinely relevant roles and make them shine. Never change a unit's company, title or dates. "bullets" are the tailored lines (omit to keep current ones); never fabricate. A unit with no decision keeps its current placement.

Other sections:
- Bio/summary: REWRITE it (required) so it speaks directly to THIS kind of role, leading with the most relevant strengths, including anything from the additional context. Do NOT name or address the hiring company — keep it a self-contained statement about the candidate.
- Skills: reorder so the most job-relevant come first; drop clearly irrelevant ones; add skills that genuinely come from the candidate's additional context. Never invent unrelated skills.
- Projects: you are given PROJECT UNITS with ids. Return one decision per id: { id, placement, description, tags } with placement "keep" (relevant — reword the description toward this job) or "remove" (irrelevant to this job). Be decisive: remove projects with no real link to the role. Never add a project. Use null for description/tags to leave them unchanged.

Keep everything truthful, concise and professional. Education, certifications, languages and contact details are handled elsewhere — do not return them.`;

function coverLetterSystem(tone) {
  const t = String(tone || "").trim() || "professional and warm";
  return `You are an expert career coach writing a cover letter for the candidate, based on their CV, any additional context they provide, and the job posting.

TONE — this is critical; follow it closely for the entire letter:
Write in a "${t}" voice. The tone controls formality, warmth, sentence rhythm, and word choice — not just the opening line.
- Friendly / warm / casual: approachable and human; plain words, natural flow; contractions where normal in the target language; no stiff corporate boilerplate ("I am writing to express my keen interest…", "I would be honoured to…").
- Professional / formal: polished and businesslike, but still readable — not archaic or overly ceremonial unless the tone asks for it.
When tone and generic cover-letter conventions conflict, the tone wins.

Hard rules:
- Use ONLY facts present in the CV or in the candidate's ADDITIONAL CONTEXT. Never invent experience, skills, or achievements.
- Write in the requested language.
- Match the "${t}" tone from the first sentence to the sign-off.

Produce a complete, ready-to-send cover letter in Markdown. Keep it to roughly 3–5 short paragraphs. Use concrete details from the posting (and the COMPANY RESEARCH notes, if provided) to show genuine, specific fit. Do not include placeholder brackets like [Company] — use real details, and write naturally around anything genuinely unknown. Do not wrap the whole thing in a code fence.`;
}

function languageName(lang) {
  return LANG_NAMES[lang] || "English";
}

// Human-readable label for debug logs (e.g. data/cv.no.json or a version snapshot).
export function defaultCvSource(lang) {
  return `data/cv.${lang}.json`;
}

function summarizePromptForDebug({ lang, jobText, extraContext, companyInfo, cvSource, promptUnits, projectUnits, docRestJson, prompt }) {
  const lines = [
    `[tailor] ===== PROMPT (debug) =====`,
    `cv used: ${cvSource || defaultCvSource(lang)}`,
    `language: ${languageName(lang)}`,
    `job posting: ${jobText.length} chars`,
  ];
  if (companyInfo?.trim()) lines.push(`company research: ${companyInfo.trim().length} chars`);
  if (extraContext?.trim()) lines.push(`extra context: ${extraContext.trim().length} chars`);
  lines.push(
    `experience units: ${promptUnits.length}`,
    `project units: ${projectUnits.length}`,
    `rest of cv: ${docRestJson.length} chars (omitted)`,
    `total prompt: ${prompt.length} chars`,
    `[tailor] ===== END PROMPT =====`,
  );
  return lines.join("\n");
}

// Verbose diagnostics are opt-in via DEBUG in the env:
//   1 / true / yes / on  → compact summaries (sizes, cv source, cache hit/miss)
//   verbose / full / 2   → compact + full job posting & company research text
export function debugLevel(env) {
  const v = env?.DEBUG;
  if (v == null || v === false || v === "") return 0;
  const s = typeof v === "string" ? v.trim().toLowerCase() : "";
  if (v === true || s === "1" || s === "true" || s === "yes" || s === "on") return 1;
  if (s === "verbose" || s === "full" || s === "2") return 2;
  return 0;
}

export function isDebug(env) {
  return debugLevel(env) >= 1;
}

function logVerboseContext(label, { jobText, companyInfo, extraContext }, env) {
  if (debugLevel(env) < 2) return;
  console.log(`[${label}] --- job posting ---\n${jobText}\n[${label}] --- end job posting ---`);
  if (companyInfo?.trim()) {
    console.log(
      `[${label}] --- company research ---\n${companyInfo.trim()}\n[${label}] --- end company research ---`,
    );
  }
  if (extraContext?.trim()) {
    console.log(
      `[${label}] --- extra context ---\n${extraContext.trim()}\n[${label}] --- end extra context ---`,
    );
  }
}

// Assemble the shared prompt context (job posting + optional company research +
// optional candidate-supplied extra facts) used by both tailoring and letters.
function buildJobContext({ jobText, extraContext, companyInfo }) {
  let s = `=== JOB POSTING ===\n${jobText}\n`;
  if (companyInfo && companyInfo.trim()) {
    s += `\n=== COMPANY RESEARCH (about the employer — not facts about the candidate) ===\n${companyInfo.trim()}\n`;
  }
  if (extraContext && extraContext.trim()) {
    s += `\n=== ADDITIONAL CONTEXT FROM THE CANDIDATE (extra true facts you may use) ===\n${extraContext.trim()}\n`;
  }
  return s;
}

// Drop undefined keys so a merge never blanks a field the model omitted.
function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Describe the CV's experience to the model as addressable "units", preserving
// its structure. There are three shapes:
//   - simple job:       a standalone top-level entry  -> id "eN"
//   - employer_group:   one employer (company) with several roles under it; the
//                       employer is kept, each role is kept/removed -> ids "eNrM"
//   - anonymous bucket: a role-only container with no company (an existing
//                       "Additional Experience" block) -> its roles are free units
// The model can only reference these ids, so it can never invent a job. Returns
// the prompt-facing list and a registry the reconstruction reads back.
function isContainer(entry) {
  return Array.isArray(entry?.roles) && entry.roles.length > 0;
}
function isNamed(entry) {
  return String(entry?.company || "").trim().length > 0;
}

function buildExperienceUnits(experience) {
  const registry = new Map();
  const promptUnits = [];
  if (!Array.isArray(experience)) return { registry, promptUnits };
  experience.forEach((entry, i) => {
    if (isContainer(entry) && isNamed(entry)) {
      const roles = entry.roles.map((role, j) => {
        const id = `e${i}r${j}`;
        registry.set(id, { id, kind: "grouprole" });
        return {
          id,
          title: role.title || "",
          period: role.period || "",
          current_bullets: Array.isArray(role.responsibilities) ? role.responsibilities : [],
        };
      });
      promptUnits.push({
        id: `e${i}`,
        kind: "employer_group",
        company: entry.company || "",
        position: entry.position || "",
        period: entry.period || "",
        roles,
      });
    } else if (isContainer(entry)) {
      entry.roles.forEach((role, j) => {
        const id = `e${i}r${j}`;
        registry.set(id, { id, kind: "bucketrole", defaultPlacement: "additional" });
        promptUnits.push({
          id,
          kind: "job",
          title: role.title || "",
          period: role.period || "",
          currently: "additional",
          current_bullets: Array.isArray(role.responsibilities) ? role.responsibilities : [],
        });
      });
    } else {
      const id = `e${i}`;
      registry.set(id, { id, kind: "simple", defaultPlacement: "primary" });
      promptUnits.push({
        id,
        kind: "job",
        title: entry.position || "",
        company: entry.company || "",
        period: entry.period || entry.periods?.[0]?.period || "",
        currently: "primary",
        current_bullets: Array.isArray(entry.responsibilities) ? entry.responsibilities : [],
      });
    }
  });
  return { registry, promptUnits };
}

// Sort key from a free-text period like "2019 - 2021" or "2026 - Present".
// Most recent first: by end year (Present = open-ended), then start year.
function periodRank(period) {
  const s = String(period || "");
  const open = /present|current|today|nå|pågå|d\.d|i dag/i.test(s);
  const years = (s.match(/\d{4}/g) || []).map(Number);
  const start = years.length ? years[0] : 0;
  const end = open ? 9999 : years.length ? years[years.length - 1] : 0;
  return { start, end };
}
function byPeriodDesc(a, b) {
  const ra = periodRank(a._period);
  const rb = periodRank(b._period);
  return rb.end - ra.end || rb.start - ra.start;
}

// Rebuild the experience array from the model's decisions, anchored to the real
// entries so the structure (employers, companies, periods, custom keys) is kept
// verbatim — only bullet points and placement change. Unknown ids are ignored.
// Primary entries and the demoted "Additional Experience" bucket are each
// time-sorted (most recent first).
function reconstructExperience(original, registry, decisions) {
  if (!Array.isArray(original)) return original;

  const dec = new Map();
  if (Array.isArray(decisions)) {
    for (const d of decisions) if (d && registry.has(d.id)) dec.set(d.id, d);
  }
  const placementOf = (id, fallback) => {
    const p = dec.get(id)?.placement;
    return ["primary", "additional", "remove"].includes(p) ? p : fallback;
  };
  const bulletsOf = (id, node) => {
    const b = dec.get(id)?.bullets;
    return Array.isArray(b) && b.length ? b : node.responsibilities || [];
  };
  const sortPeriod = (entry) => entry.period || entry.periods?.[0]?.period || "";

  const primaries = [];
  const additional = [];

  original.forEach((entry, i) => {
    if (isContainer(entry) && isNamed(entry)) {
      // Employer with sub-roles: keep the employer verbatim, keep/remove each
      // role under it. The company is never dropped or moved.
      const keptRoles = [];
      entry.roles.forEach((role, j) => {
        const id = `e${i}r${j}`;
        if (placementOf(id, "primary") === "remove") return;
        keptRoles.push({ ...role, responsibilities: bulletsOf(id, role) });
      });
      if (keptRoles.length) primaries.push({ ...entry, roles: keptRoles, _period: sortPeriod(entry) });
    } else if (isContainer(entry)) {
      // Anonymous bucket: each role may stay (additional), be promoted (primary)
      // or removed.
      entry.roles.forEach((role, j) => {
        const id = `e${i}r${j}`;
        const p = placementOf(id, "additional");
        if (p === "remove") return;
        if (p === "primary") {
          primaries.push({
            company: "",
            position: role.title || "",
            period: role.period || "",
            type: role.type || "",
            responsibilities: bulletsOf(id, role),
            _period: role.period || "",
          });
        } else {
          additional.push({ ...role, responsibilities: bulletsOf(id, role), _period: role.period || "" });
        }
      });
    } else {
      // Simple standalone job.
      const id = `e${i}`;
      const p = placementOf(id, "primary");
      if (p === "remove") return;
      if (p === "additional") {
        additional.push({
          title: entry.company ? `${entry.position}, ${entry.company}` : entry.position,
          period: sortPeriod(entry),
          type: entry.type || "",
          responsibilities: bulletsOf(id, entry),
          _period: sortPeriod(entry),
        });
      } else {
        primaries.push({ ...entry, responsibilities: bulletsOf(id, entry), _period: sortPeriod(entry) });
      }
    }
  });

  primaries.sort(byPeriodDesc);
  additional.sort(byPeriodDesc);
  const strip = ({ _period, ...rest }) => rest; // drop the sort-only helper field
  const result = primaries.map(strip);
  if (additional.length) {
    result.push({ company: "", position: "Additional Experience", period: "", type: "", roles: additional.map(strip) });
  }
  return result;
}

// Present projects to the model as id-keyed units (so it can only reference real
// ones, never invent), and read decisions back to keep/remove them.
function buildProjectUnits(projects) {
  const ids = new Set();
  const promptUnits = [];
  if (!Array.isArray(projects)) return { ids, promptUnits };
  projects.forEach((p, i) => {
    const id = `p${i}`;
    ids.add(id);
    promptUnits.push({
      id,
      name: p.name || "",
      current_description: p.description || "",
      current_tags: Array.isArray(p.tags) ? p.tags : [],
    });
  });
  return { ids, promptUnits };
}

// Rebuild projects: keep the original order and every field, drop the ones the
// model marked "remove", and adopt reworded description/tags where given.
function reconstructProjects(original, ids, decisions) {
  if (!Array.isArray(original)) return original;
  const dec = new Map();
  if (Array.isArray(decisions)) {
    for (const d of decisions) if (d && ids.has(d.id)) dec.set(d.id, d);
  }
  const result = [];
  original.forEach((proj, i) => {
    const d = dec.get(`p${i}`);
    if (d?.placement === "remove") return;
    const merged = { ...proj };
    if (d && d.description != null) merged.description = d.description;
    if (d && Array.isArray(d.tags)) merged.tags = d.tags;
    result.push(merged);
  });
  return result;
}

// Extract the hiring company's name and best-guess official website from the
// posting, so the caller can fetch a little real context about the employer.
export async function extractCompany({ env, jobText }) {
  const { object } = await generateObject({
    model: getModel(env),
    schema: companySchema,
    system:
      "Extract the hiring company's name and official website URL from this job posting. " +
      "If the website is not explicitly stated, infer the most likely official domain from the company name. " +
      "Leave a field empty if you genuinely cannot tell.",
    prompt: String(jobText).slice(0, 8000),
  });
  return object;
}

// Tailor the CV. Returns a new full document: model-tailored content merged
// over the original, with identity/contact/theme/visibility preserved.
export async function tailorCv({ env, doc, jobText, lang, extraContext, companyInfo, cvSource }) {
  // Flatten experience and projects into addressable units the model can only
  // reference by id (no inventing jobs/projects), and present the rest of the CV
  // without those raw arrays to avoid the model copying them back.
  const { registry, promptUnits } = buildExperienceUnits(doc.experience);
  const { ids: projectIds, promptUnits: projectUnits } = buildProjectUnits(doc.projects);
  const { experience: _omitExp, projects: _omitProj, ...docRest } = doc;

  const docRestJson = JSON.stringify(docRest, null, 2);
  // The job context + addressable units are the interesting, job-specific part;
  // the rest of the CV is large and static, so keep it out of the prompt head
  // we log and append it only to the real prompt.
  const promptHead =
    `Output language: ${languageName(lang)}.\n\n` +
    buildJobContext({ jobText, extraContext, companyInfo }) +
    `\n=== EXPERIENCE UNITS (return a flat array of decisions { id, placement, bullets }; include the roles inside each employer_group) ===\n${JSON.stringify(promptUnits, null, 2)}\n` +
    `\n=== PROJECT UNITS (return one decision per id: { id, placement, description, tags }) ===\n${JSON.stringify(projectUnits, null, 2)}\n`;
  const prompt =
    promptHead +
    `\n=== REST OF CV (JSON; experience and projects are shown above as units) ===\n${docRestJson}`;

  if (isDebug(env)) {
    console.log(
      summarizePromptForDebug({
        lang,
        jobText,
        extraContext,
        companyInfo,
        cvSource,
        promptUnits,
        projectUnits,
        docRestJson,
        prompt,
      }),
    );
    logVerboseContext("tailor", { jobText, companyInfo, extraContext }, env);
  }

  const { object } = await generateObject({
    model: getModel(env),
    schema: cvContentSchema,
    system: TAILOR_SYSTEM,
    // Give the model enough room: a large CV plus a full bio + skills can
    // otherwise truncate (e.g. a cut-off summary) under a low default cap.
    maxOutputTokens: 8000,
    prompt,
  });

  const tailored = definedOnly(object);

  // Preserve the candidate's name and contact block exactly; only titles/bio
  // from the model are allowed onto personalInfo.
  const personalInfo = {
    ...doc.personalInfo,
    ...(tailored.personalInfo ? definedOnly(tailored.personalInfo) : {}),
    name: doc.personalInfo?.name,
    contact: doc.personalInfo?.contact,
  };

  // Everything factual (education, certifications, languages, theme, visibility,
  // custom keys) stays from `doc`. Only summary, skills and the experience
  // placement/bullets are tailored — and experience is rebuilt from real units.
  return {
    ...doc,
    personalInfo,
    skills: Array.isArray(tailored.skills) ? tailored.skills : doc.skills,
    experience: reconstructExperience(doc.experience, registry, tailored.experience),
    projects: reconstructProjects(doc.projects, projectIds, tailored.projects),
    theme: doc.theme,
    hiddenSections: doc.hiddenSections,
  };
}

// Stream a cover letter. Returns the streamText result; the caller pipes
// `.pipeTextStreamToResponse(res)`.
export function streamCoverLetter({ env, doc, jobText, lang, tone, extraContext, companyInfo, cvSource }) {
  const t = String(tone || "").trim() || "professional and warm";
  if (isDebug(env)) {
    console.log(
      `[cover-letter] ===== PROMPT (debug) =====\n` +
        `cv used: ${cvSource || defaultCvSource(lang)}\n` +
        `language: ${languageName(lang)}\n` +
        `tone: ${t}\n` +
        `job posting: ${jobText.length} chars\n` +
        (companyInfo?.trim() ? `company research: ${companyInfo.trim().length} chars\n` : "") +
        (extraContext?.trim() ? `extra context: ${extraContext.trim().length} chars\n` : "") +
        `cv body: ${JSON.stringify(doc).length} chars (omitted)\n` +
        `[cover-letter] ===== END PROMPT =====`,
    );
    logVerboseContext("cover-letter", { jobText, companyInfo, extraContext }, env);
  }
  return streamText({
    model: getModel(env),
    system: coverLetterSystem(t),
    prompt:
      `Output language: ${languageName(lang)}.\n\n` +
      buildJobContext({ jobText, extraContext, companyInfo }) +
      `\n=== CANDIDATE CV (JSON) ===\n${JSON.stringify(doc, null, 2)}`,
  });
}

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
import {
  englishName,
  DEFAULT_LABELS,
  resolveLabels,
} from "../src/i18n/languages.js";

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

// Schema for the *tailorable* content. Contact details, name, theme and
// section visibility are preserved server-side and intentionally excluded so
// the model can never alter them. Most fields are optional: the model returns
// the sections present in the source CV, and we merge only what it provides.
const contactlessPersonalInfo = z.object({
  titles: z.array(z.string()).optional(),
  bio: z.string().optional(),
});

const cvContentSchema = z.object({
  personalInfo: contactlessPersonalInfo.optional(),
  education: z
    .array(z.object({ degree: z.string(), institution: z.string(), year: z.string() }))
    .optional(),
  skills: z.array(z.string()).optional(),
  certifications: z
    .array(
      z.object({
        name: z.string(),
        provider: z.string().optional(),
        hours: z.string().optional(),
        url: z.string().optional(),
      })
    )
    .optional(),
  languages: z
    .array(z.object({ language: z.string(), level: z.string() }))
    .optional(),
  experience: z
    .array(
      z.object({
        company: z.string(),
        position: z.string(),
        period: z.string(),
        type: z.string().optional(),
        responsibilities: z.array(z.string()).optional(),
      })
    )
    .optional(),
  projects: z
    .array(
      z.object({
        name: z.string(),
        description: z.string().optional(),
        url: z.string().optional(),
        period: z.string().optional(),
        tags: z.array(z.string()).optional(),
      })
    )
    .optional(),
});

const TAILOR_SYSTEM = `You are an expert career coach and resume editor. You tailor an existing CV to a specific job posting.

Hard rules — never break these:
- Use ONLY facts already present in the candidate's CV. Never invent employers, job titles, dates, periods, degrees, institutions, certifications, projects, or skills that are not already there.
- Do NOT change any company name, position title, period/date, institution, or degree. These are factual and must be preserved verbatim.
- Stay strictly in the requested output language.

What you SHOULD do to tailor:
- Rewrite the bio/summary so it speaks directly to this role, emphasising the candidate's genuinely relevant strengths.
- Reorder skills so the most relevant-to-the-job ones come first. You may drop clearly irrelevant skills, but never add new ones.
- Reword the responsibility bullet points of each experience to surface the impact and keywords that matter for this job, while keeping them truthful.
- You may reorder experience entries and projects so the most relevant appear first.
- Keep it concise and professional.

Return every section that was present in the source CV.`;

function coverLetterSystem(tone) {
  return `You are an expert career coach writing a cover letter for the candidate, based strictly on their CV and the job posting.

Hard rules:
- Use ONLY facts present in the CV. Never invent experience, skills, or achievements.
- Write in the requested language.
- Tone: ${tone || "professional and warm"}.

Produce a complete, ready-to-send cover letter in Markdown. Keep it to roughly 3–5 short paragraphs. Do not include placeholder brackets like [Company] — use details from the posting where available, and write naturally around anything that is genuinely unknown. Do not wrap the whole thing in a code fence.`;
}

function languageName(lang) {
  return englishName(lang) || "English";
}

// Drop undefined keys so a merge never blanks a field the model omitted.
function definedOnly(obj) {
  return Object.fromEntries(Object.entries(obj).filter(([, v]) => v !== undefined));
}

// Tailor the CV. Returns a new full document: model-tailored content merged
// over the original, with identity/contact/theme/visibility preserved.
export async function tailorCv({ env, doc, jobText, lang }) {
  const { object } = await generateObject({
    model: getModel(env),
    schema: cvContentSchema,
    system: TAILOR_SYSTEM,
    prompt:
      `Output language: ${languageName(lang)}.\n\n` +
      `=== JOB POSTING ===\n${jobText}\n\n` +
      `=== CURRENT CV (JSON) ===\n${JSON.stringify(doc, null, 2)}`,
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

  return {
    ...doc, // keep any custom keys + theme/hiddenSections as a base
    ...tailored, // model-tailored standard sections override
    personalInfo,
    theme: doc.theme, // never let the model touch styling
    hiddenSections: doc.hiddenSections, // or section visibility
  };
}

// === Translation =========================================================
// Translating a CV regenerates a parallel document in a new language. We never
// trust the model with structure or protected facts: it returns a same-shaped
// JSON, but we rebuild the result by walking the ORIGINAL document and taking
// translated *prose* only — identity, contacts, URLs, dates, org names and
// technical terms are always copied verbatim from the source.

// Leaf field names that must never be translated (proper nouns / machine data).
const KEEP_LEAF = new Set([
  "name",
  "company",
  "institution",
  "provider",
  "url",
  "mapUrl",
  "link",
  "email",
  "phone",
  "year",
  "period",
  "icon",
  "id",
  "placement",
  "city",
]);

// Array fields kept verbatim (skills + tech tags are language-neutral).
const KEEP_PARENT = new Set(["skills", "tags"]);

// Merge translated text onto the original structure. Iterating the original
// guarantees the shape, key set, and protected values are preserved no matter
// what the model returns.
function applyTranslation(original, translated, key) {
  if (KEEP_LEAF.has(key)) return original;
  if (typeof original === "string") {
    return typeof translated === "string" && translated.trim()
      ? translated
      : original;
  }
  if (Array.isArray(original)) {
    if (KEEP_PARENT.has(key)) return original;
    if (!Array.isArray(translated)) return original;
    return original.map((item, i) => applyTranslation(item, translated[i], key));
  }
  if (original && typeof original === "object") {
    const out = {};
    const t = translated && typeof translated === "object" ? translated : {};
    for (const k of Object.keys(original)) {
      out[k] = applyTranslation(original[k], t[k], k);
    }
    return out;
  }
  return original;
}

const TRANSLATE_SYSTEM = `You are a professional CV/resume translator. You translate a candidate's CV from one language to another while keeping it natural and idiomatic for a native reader of the target language.

Hard rules — never break these:
- Preserve the JSON structure exactly: same keys, same array lengths, same order.
- Do NOT translate or alter: personal names, company names, institution names, certificate providers, email, phone, URLs, links, map URLs, dates, periods, years, and icon/id fields.
- Keep technical skills and technology tags in their original form (e.g. "JavaScript", "React", "SQL").
- Translate prose naturally: the summary/bio, job titles and positions, responsibility bullet points, project descriptions, degree names, employment types, spoken-language names and proficiency levels, and section headings.
- Never invent, add, or drop content. Translate meaning, not word-for-word.`;

// Translate a full CV document to `targetLang`. Returns the rebuilt document
// plus translated UI section labels. Pure (no disk writes).
export async function translateCv({ env, doc, sourceLang, targetLang }) {
  const { object } = await generateObject({
    model: getModel(env),
    output: "no-schema",
    system: TRANSLATE_SYSTEM,
    prompt:
      `Source language: ${languageName(sourceLang)}\n` +
      `Target language: ${languageName(targetLang)}\n\n` +
      `Return a JSON object with exactly two keys:\n` +
      `  "doc": the input CV with all translatable prose translated to the target language (same structure),\n` +
      `  "labels": the UI section headings below, translated to the target language.\n\n` +
      `=== UI LABELS (English) ===\n${JSON.stringify(DEFAULT_LABELS, null, 2)}\n\n` +
      `=== INPUT CV (JSON) ===\n${JSON.stringify(doc, null, 2)}`,
  });

  const modelDoc = object?.doc && typeof object.doc === "object" ? object.doc : object;
  const translatedDoc = applyTranslation(doc, modelDoc, "");
  const labels = resolveLabels(object?.labels);
  return { doc: translatedDoc, labels };
}

// Stream a cover letter. Returns the streamText result; the caller pipes
// `.pipeTextStreamToResponse(res)`.
export function streamCoverLetter({ env, doc, jobText, lang, tone }) {
  return streamText({
    model: getModel(env),
    system: coverLetterSystem(tone),
    prompt:
      `Output language: ${languageName(lang)}.\n\n` +
      `=== JOB POSTING ===\n${jobText}\n\n` +
      `=== CANDIDATE CV (JSON) ===\n${JSON.stringify(doc, null, 2)}`,
  });
}

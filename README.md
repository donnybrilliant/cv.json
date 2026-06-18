# CV editor

A local-first CV/resume editor: inline click-to-edit, undo/redo, switchable
**versions** (a separate CV per job sector), AI translation, AI job-tailoring,
and print/PDF export. Everything is stored as plain JSON on your machine —
easy to back up, diff, and own.

**Good fit if** you want a resume you control as files, not a template-site
account. **Not a hosted app** — it runs on your computer with a small file API
(Vite middleware); there is no cloud sync or multi-user server.

## Requirements

- [Node.js](https://nodejs.org/) **20+**
- npm (comes with Node)

## Run

```bash
npm install
npm run dev          # app + local file API on http://localhost:5173
```

`npm run dev` starts Vite **and** a file-backed API on one port (see
`server/api.js` and `vite.config.js`) — no second process, no CORS.

After `npm run build`, `npm run preview` serves the production bundle with the
same local API. You still need Node running on your machine; this is not a
static deploy to GitHub Pages / Netlify without adding your own backend.

## How it works

- **Edit** — click _Edit_ to toggle edit mode, then click any text to edit in
  place. Hover a list item (job, bullet, skill, education, …) for its
  add / remove / move / drag controls. Edit chrome never appears when printing.
- **Drag to reorder** — in edit mode, grab the ⠿ handle on any item (or drag a
  skill chip directly) to reorder. Up/down arrows also work.
- **Autosave** — every change is debounced and written to the current version's
  file (`data/versions/<id>/cv.<lang>.json`). A "Saving…/Saved" indicator shows status.
- **Undo / redo** — toolbar buttons or `⌘Z` / `⌘⇧Z` (`Ctrl` on non-Mac).
- **Photo** — default avatar is `src/assets/avatar.svg` (in git). Uploads are
  stored locally as `data/avatar.<ext>` (gitignored), shared across languages.
- **Theme** — the palette button picks a color theme; it's saved per-CV in the
  document (`doc.theme`), so each saved version can look different.
- **Show / hide sections** — Skills, Certifications, Languages and Projects each
  have an eye toggle in edit mode. Hidden sections stay editable but are left out
  of the view, Print, and PDF. (JSON export still includes them — it's a backup.)
- **Projects** — a section with name, description, link, tech tags, and period.
- **Versions** — a **version** is a named CV you switch between like a document
  (e.g. _Frontend_, _Backend_, _Design_). The version switcher in the toolbar
  picks the one you're editing; **Duplicate** copies the current one under a new
  name, **New version** starts from the sample, and you can **Rename** / **Delete**.
  Each version keeps its own language translations. The "Editing: … · …" label
  always shows which version and language you're on.
- **Export / import** — download the current document as JSON, or load a JSON
  file to replace it.
- **PDF** — the _PDF_ button downloads a single-page, content-cropped,
  JPEG-compressed PDF. The printer button (`⌘P`) is the browser-print route.
- **Languages** — each version starts in one language; the language buttons
  switch between the translations it has. Use **Languages** (edit mode) to add
  more: pick a target language and the AI translates the current version into it
  (a copy inside the same version). Translations preserve your name, contacts,
  links, dates, company and institution names, and technical skills/tags
  verbatim — only prose (summary, titles, responsibilities, descriptions, section
  headings) is translated. Re-run **Refresh** anytime to re-translate; remove a
  translation you don't need.
- **Tailor to a job** — in edit mode, the _Tailor_ button opens a panel where you
  paste a job description (text or a URL) and let an AI **rewrite your CV for that
  role** and **draft a cover letter**. Tailoring rewrites your summary, reorders
  skills, and rephrases experience bullets using only facts already in your CV (plus
  any extra context you add) — it never invents employers, dates, or skills, and
  never touches your contact details, theme, or hidden sections. It applies in
  place to the current version and is undoable (`⌘Z`); to keep an untouched
  original, **Duplicate** the version first. The cover letter streams in and can
  be copied or downloaded as `.md` (it is not stored in the CV). See
  [AI setup](#ai-setup) below.

## AI setup

The AI features (job tailoring **and** language translation) are **optional**
and run through the same local Node middleware as the rest of the app, so your
API key stays on your machine and never reaches the browser. They use the
[Vercel AI SDK](https://sdk.vercel.ai/) with [OpenRouter](https://openrouter.ai/)
— one key, many models. For translation quality, a stronger model
(`OPENROUTER_MODEL`) generally helps, especially for less common languages.

```bash
cp .env.example .env
# then edit .env and add your OPENROUTER_API_KEY (and optionally OPENROUTER_MODEL)
```

Restart `npm run dev` after editing `.env`. The model is chosen with
`OPENROUTER_MODEL` (e.g. `openai/gpt-4o-mini`, `anthropic/claude-3.7-sonnet`,
`google/gemini-2.0-flash`). Pasting a job **URL** works for simple, server-rendered
postings; JS-heavy boards (LinkedIn and some Workday/Greenhouse pages) may not
extract cleanly — paste the description text instead.

## Data & backups

Your **real** CV lives in `data/` (gitignored):

```
data/
  versions.json                        # the list of versions (id, name)
  versions/<id>/cv.<lang>.json         # each version's documents, one per language
  languages.json                       # language label store (translated section headings)
  avatar.<ext>                         # profile photo (optional)
```

`versions.json` and `languages.json` are created automatically on first run
(seeded with one "My CV" version in the built-in NO / EN / ES). If you're
upgrading from the old per-language layout, existing `data/cv.<lang>.json` files
are migrated into a "My CV" version automatically (originals are left in place).
The built-in section labels live in [`src/i18n/languages.js`](src/i18n/languages.js).

On first run, missing files are created from the sample seed in
[`public/data/`](public/data/) (e.g. [`data.en.json`](public/data/data.en.json)).
Back up by copying `data/` elsewhere (Dropbox, iCloud, encrypted drive, etc.).

**Fresh clone:** run `npm run dev` once; `data/` is created automatically. Edit
as usual — nothing personal is pushed to GitHub.

## Tech

Vite + React 19 + Tailwind v4. State and undo/redo via `zustand` + `zundo`,
nested edits via `immer`, drag-to-reorder via `@dnd-kit`, and client-side PDF via
`html-to-image` + `jspdf`. Optional AI tailoring and language translation use the
Vercel AI SDK (`ai`) via OpenRouter, with `zod`-validated structured output.
Versions, their documents, and the language label store are plain JSON files
written by the local Node file API (`server/data.js`).

## License

[MIT](LICENSE)

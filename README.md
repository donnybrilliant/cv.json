# CV editor

A local-first CV/resume editor: inline click-to-edit, undo/redo, named
versions, language switching (NO / EN / ES), and print/PDF export. Everything
is stored as plain JSON on your machine — easy to back up, diff, and own.

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
- **Autosave** — every change is debounced and written to `data/cv.<lang>.json`.
  A "Saving…/Saved" indicator shows status.
- **Undo / redo** — toolbar buttons or `⌘Z` / `⌘⇧Z` (`Ctrl` on non-Mac).
- **Photo** — default avatar is `src/assets/avatar.svg` (in git). Uploads are
  stored locally as `data/avatar.<ext>` (gitignored), shared across languages.
- **Theme** — the palette button picks a color theme; it's saved per-CV in the
  document (`doc.theme`), so each saved version can look different.
- **Show / hide sections** — Skills, Certifications, Languages and Projects each
  have an eye toggle in edit mode. Hidden sections stay editable but are left out
  of the view, Print, and PDF. (JSON export still includes them — it's a backup.)
- **Projects** — a section with name, description, link, tech tags, and period.
- **Versions** — _Save version_ writes a named snapshot to
  `data/versions/<name>.<lang>.json`. The _Versions_ menu restores or deletes them.
- **Export / import** — download the current document as JSON, or load a JSON
  file to replace it.
- **PDF** — the _PDF_ button downloads a single-page, content-cropped,
  JPEG-compressed PDF. The printer button (`⌘P`) is the browser-print route.
- **Languages** — NO / EN / ES, each its own file, edited independently.

## Data & backups

Your **real** CV lives in `data/` (gitignored):

```
data/
  cv.no.json  cv.en.json  cv.es.json   # live documents (per language)
  versions/<name>.<lang>.json          # named snapshots
  avatar.<ext>                         # profile photo (optional)
```

On first run, missing files are created from the sample seed in
[`public/data/`](public/data/) (e.g. [`data.en.json`](public/data/data.en.json)).
Back up by copying `data/` elsewhere (Dropbox, iCloud, encrypted drive, etc.).

**Fresh clone:** run `npm run dev` once; `data/` is created automatically. Edit
as usual — nothing personal is pushed to GitHub.

## Tech

Vite + React 19 + Tailwind v4. State and undo/redo via `zustand` + `zundo`,
nested edits via `immer`, file persistence via `lowdb`, drag-to-reorder via
`@dnd-kit`, and client-side PDF via `html-to-image` + `jspdf`.

## License

[MIT](LICENSE)

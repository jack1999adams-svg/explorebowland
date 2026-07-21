# ExploreBowland is managed by NovaPortal — read before editing

This site (repo `explorebowland`, Cloudflare Pages `explorebowland`, branch
`claude/astro-blog-migration-strategy-rzq6pq`) pulls its content from
**NovaPortal** — the instance at `novaportal-explorebowland.collectiq.workers.dev`.
The walks, pages, route info, and media all live in the portal and are pulled at
build time. The layout, components, templates and redirects live in this repo.

## What the portal owns vs what the repo owns

| In the portal (edit there) | In this repo (edit here) |
|---|---|
| Walk posts (title, body, images, **route info**, GPX) | The walk/page templates + all components |
| Static pages (About, area hubs, …) | `RoutePanel`, headers, footers, styling |
| Media library (images) + route GPX files | Legacy redirects (`functions/`) |
| Categories, theme colours, head snippets | The content loaders + route schema |

## The moving parts

| File | Role |
|---|---|
| `src/lib/novaportal-loader.mjs` | Pulls **posts** from the portal at build. Rewrites portal `/media/` URLs to `media.explorebowland.co.uk` (the `IMAGE_BASE` patch). **Don't re-vendor it** — that patch is EB-specific. |
| `src/lib/pages.mjs` | Fetches **portal pages** (`GET /api/v1/content/pages`). |
| `src/content.config.ts` | `posts` collection (incl. the `route` array) + a file-based `pages` fallback. |
| `src/lib/route-schema.mjs` | `ROUTE_SCHEMA` + `buildRoute()` — the canonical route-info fields (mirrors the portal's `ROUTE_SCHEMA`). Blank fields are omitted. |
| `src/components/RoutePanel.astro` | The route-info table (sticky sidebar on desktop, bottom sheet on mobile), including the **Download GPX** row. |
| `src/pages/[...slug].astro` | The walk/page catch-all. Merges portal pages (win) with the file-page fallback. |
| `functions/[[catchall]].js` + `functions/post-redirects.json` | Legacy URL redirects (2,294 legacy + 116 auto post redirects). |
| `.novaportal/instance.jsonc` | Portal instance config: `apps: [redirects, chat]`, `ROUTE_SCHEMA`, `THEME_SCHEMA`, `PAGE_TEMPLATES`. |

## How the build resolves content

- **With `NOVAPORTAL_READ_TOKEN`** (CI / Pages build): posts and pages come from
  the **portal — the portal wins.**
- **Without it** (plain local `astro build`): posts fall back to seed markdown;
  file-based pages (`src/content/pages/*.md`) render. **Don't delete those seed
  files** — they're the offline fallback and import source.

To change live content, edit it in the **portal** and publish (see Deploy).

## Uploading a route GPX (walk downloads)

Walk posts can offer a downloadable GPX file, shown as a **Download** button in
the route table.

**To add one:** open the walk in the portal → editor → **Site fields** → the
**Download GPX** field → **drag a `.gpx` file onto it** (or click to choose) →
**publish**. The route table then shows a "Download GPX" row with a green
Download button that saves the file. A walk with no GPX simply doesn't show the
row.

How it works under the hood:

- **Download GPX** is a `file`-type custom field. The portal uploads the GPX to
  R2 (via `POST /field-file`, which accepts `.gpx`/`.kml`/`.pdf` up to 10 MB) and
  stores the file's URL in the post's `extras.gpx`.
- The content API delivers `extras.gpx`; `buildRoute()` turns it into a route row
  with `type: 'file'`; `RoutePanel` renders that as the download button
  (`<a download>`). Empty → omitted.
- The `route` array's schema in `content.config.ts` includes `type` — **without
  that, Zod strips it and the download arrow won't render** (learned the hard
  way). If you add more `file` route fields, keep `type` in the schema.
- On mobile the GPX row is full-width, and the NovaChat launcher is hidden while
  the route sheet is open so its bubble can't cover the button.

The `file` field type is a general NovaPortal capability — any custom field can
be `type: 'file'` for drag-drop uploads; EB uses it for GPX.

## Route info fields generally

The route table is driven by `ROUTE_SCHEMA` (distance, difficulty, ascent,
postcode, map reference, GPX, …). Each is a portal custom field on the walk post;
`buildRoute()` renders the non-empty ones. To add a field: add it to
`ROUTE_SCHEMA` here **and** to the portal's custom fields (its `.novaportal/
instance.jsonc` `ROUTE_SCHEMA` mirrors this list). `map_reference` renders as a
map link; `file` fields render as a download button.

## Rules for working on this repo

1. **Don't re-vendor `novaportal-loader.mjs`** — EB's copy carries the
   `IMAGE_BASE` rewrite to `media.explorebowland.co.uk`.
2. **Keep the seed markdown** (`src/content/*`) — it's the offline fallback and
   import source, not dead code.
3. **Edit content in the portal**, not the seed files — the portal wins in prod.
4. **Portal pages win over file pages** — a file page with the same path is only
   the fallback.
5. Route info + GPX are portal fields — don't hardcode them into templates.

## Redirects

`functions/[[catchall]].js` serves the legacy → new URL redirects from
`functions/post-redirects.json` (auto, 116) and the curated ones. The 38 curated
redirects are managed in the portal's **Redirects** app; `post-redirects.json` is
build-generated — don't hand-edit it.

## Deploy

- **Push to the branch** → Cloudflare Pages rebuilds (pulling content from the
  portal) and deploys.
- **Publish in the portal** → the portal fires the Pages deploy hook → same
  rebuild. So a content edit in the portal goes live without a push.
- **Heads-up: a parallel session works on this branch.** Pull before you push
  (`git pull --rebase`) and keep commits small.

## Chat widget

The NovaChat assistant is installed (`apps: [chat]`), loaded from
`…/api/c/chat/widget.js`. It answers from the site's own content. Config
(provider, key, prompt) lives in the portal under **Chat**.

## Current state / notes

- Live at `www.explorebowland.co.uk` (+ apex); media at
  `media.explorebowland.co.uk`.
- 116 posts + 48 pages, portal-managed. Some imported walks have blank/auto
  route fields — editable in the portal.
- The homepage greeting has intentional typos Jack wrote ("looking foe a walk?…")
  — leave unless asked.

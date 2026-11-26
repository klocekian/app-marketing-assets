---
name: app-marketing-assets
description: >-
  Generate and refresh a product's marketing images from the real, running app:
  landing-page screenshots, responsive cropped derivatives with a srcset
  manifest, App Store / Google Play / Mac App Store / Chrome Web Store
  screenshots composed with headline and device frame, promo tiles and social
  cards rendered from HTML. Signs in as a seeded demo account, hides dev-only
  UI, scrubs third-party trademarks for store listings, and produces a
  before/after review page. Use when someone wants product screenshots,
  marketing or store images, "refresh the screenshots after the redesign",
  App Store screenshots, OG images, or a repeatable capture pipeline, even if
  they never say "marketing assets".
---

# app-marketing-assets

Every product image should be **captured from the running app by a script**,
signed in as a demo account with fictional content. Nothing is painted by hand
and nothing comes from an old checkout, so after any UI change one command
brings every image up to date, and the images never show a UI that no longer exists.

The skill is a method plus scripts. The scripts read one config file in the
project root, `marketing-assets.config.mjs`. The method is what makes the
output good: which content to show, what to hide, how to crop, how to review.

Scripts live in `scripts/` next to this file (call it `<skill>`). Run them
from the project root:

| Script | Does |
| --- | --- |
| `preflight.mjs` | Checks Node, deps, Chrome, the app, health URL, custom checks; warms routes |
| `capture.mjs [--only=a,b] [--no-crop] [--debug] [--list]` | Captures each `shots` entry to `outDir` |
| `derive.mjs [--only=]` | Crops masters to what pages show; writes responsive WebP widths and a JSON manifest |
| `compose-store.mjs [--only=] [--preset=]` | Store screenshots: headline, line, prompt bubble, capture in a device frame |
| `render-html.mjs [--only=]` | Renders HTML sources (promo tiles, OG cards) to PNG at exact sizes |
| `measure-crops.mjs [/path] [--match=]` | Measures which part of each image a page ever shows, across widths |
| `review-sheet.mjs [ref]` | Before/after HTML page of every changed image |

They need `playwright` and `sharp` in the project (`npm i -D playwright sharp`)
and work best with Google Chrome installed (see Pitfalls).

## Workflow A: set up a project for the first time

1. **Inventory.** Find every product image the project ships and who uses it:
   grep the site for `<img`, `srcset`, `og:image`, store-listing folders,
   `public/`. List them in a table: file, page that shows it, what it should
   show. Keep this table in the project's docs; it becomes the "what to rerun
   when X changes" map. Note which images are photos or illustrations (no UI,
   never recaptured) and which are UI.
2. **Demo content.** The shots need an account full of believable, fictional,
   ordinary content, seeded by code so it is identical on every run. Find the
   project's existing seed or demo sign-in; if there is none, propose one
   before writing it. Rules that matter later:
   - Fixed dates, or dates relative to "now" chosen so sort order is stable.
     A relative date can drift an unwanted item into the top of a list shot.
   - No real people's names, emails, faces, plates or house numbers.
   - If the content names third-party products ("my ChatGPT chat"), the store
     shots will need scrubbing (see Store screenshots).
   - Seeding that wipes the demo account is fine; seeding that can reach a
     production database is not. Add a preflight check that refuses.
3. **Config.** Copy `<skill>/templates/marketing-assets.config.mjs` to the
   project root and fill it in: `baseUrl`, a `login` for each session, the
   `hideCss` list, `placeholderText`, then one `shots` entry per UI image.
   Field reference: `references/config.md`. Worked example:
   `examples/demo-app/marketing-assets.config.mjs` in this skill's repo.
4. **Smoke one shot**, look at it, then add the rest:
   `node <skill>/scripts/capture.mjs --only=<one> --debug`.
5. **Wire it in.** Point the site's `<img srcset>` at `derive.mjs` outputs and
   the manifest. Add npm scripts (`"screenshots": "node <path>/capture.mjs && node <path>/derive.mjs"`)
   so the pipeline is discoverable. If the skill lives outside the repo, vendor
   the `scripts/` folder into the repo so teammates and CI can run it.

## Workflow B: refresh after a change

1. Map the change to shots with the project's inventory table. A logo or
   global chrome change means everything; a change to one screen means its
   shots plus any store story built on them.
2. Start the app against a local database, then
   `node <skill>/scripts/preflight.mjs`. Fix every ✗ before capturing.
3. `capture.mjs --only=<shots>` (or all), then `derive.mjs`,
   `compose-store.mjs`, `render-html.mjs` as they apply.
4. Review (below). Then commit masters, derivatives, the manifest and HTML
   sources. Store composites are uploaded by hand: don't commit them unless
   the project wants them versioned.

A failed shot fails the run (exit 1). Fix it and rerun with `--only=`; never
derive or compose from a partly refreshed set.

## Capture rules

- **Capture at display size, scale up the device, never the image.** Pick the
  viewport the page shows the image at, and `scale` (deviceScaleFactor) 2 to 3,
  so text renders sharp at its real size. Upscaling an old capture is never
  acceptable.
- **Crop to the idea.** One shot shows one thing. Use `selector` for a content
  column, `clip` for a region, `keep` to trim what the page will mask anyway.
  Hide everything else with `css` or `prepare`.
- **Hide the environment.** Dev badges and overlays, cookie banners, sync or
  error banners, admin notices (they often contain a real email), "new
  version" toasts, the pointer. Put selectors in `hideCss`, and add each new
  transient banner the app gains.
- **Wait for the real page.** Skeletons, "loading" text and local-first
  "not synced yet" states get captured as if they were the product. List their
  text in `placeholderText` and the real content's selector in `waitFor`.
- **Neutral account settings.** A demo account with a custom theme or accent
  color tints every shot. Reset it in the seed or check it in preflight.
- **Owner view vs reader view.** Decide per shot which session it is from:
  signed-in owner (`owner`), a signed-out reader (`anon`), the mobile app
  (`phone`, with the app's user agent).

## Derivatives

Serve small cropped files, never the master. `derive.mjs` crops each master to
the aspect ratio the page shows, writes WebP at 480/800/1200/… px (capped at
the crop width: no upscaling), and records `{ width, height, widths, version }`
per image in a manifest. Build `srcset` from `widths` and put `version` in the
URL so caches refetch on change. For images a page masks with
`overflow: hidden` or `object-fit: cover`, run `measure-crops.mjs` on uncropped
files (`capture.mjs --no-crop`) and crop to the union it reports plus a small margin.

## Store screenshots

`compose-store.mjs` puts a headline, an optional line and prompt bubble, and a
capture in a device frame on a color or photo, at the store's exact pixel size.
Presets: `ios-6.9`, `ios-6.5`, `ipad-13`, `android-phone`, `mac-app-store`,
`chrome-web-store`. Sizes and each store's content rules are in
`references/store-specs.md`. **Check that file against the store's current page
before a submission.**

- **Tell the landing page's story.** One section per screenshot, in the same
  order and the same words, so the listing and the site agree.
- **No third-party trademarks.** Apple (Guideline 5.2.1) and Google Play can
  reject listings that show other companies' product names or logos without permission. Set
  `scrub.replace` (whole phrases first, so sentences still read) and
  `scrub.forbid`; set `scrub: true` on the shots a store uses. A shot that
  still shows a forbidden name fails. Check the headline copy too.
- **Google Play: no device frames**, taglines at most 20% of the image, no
  "best", "#1" or "free". The `android-phone` preset defaults to no frame and a
  short copy band.
- **Native-only screens** (camera, voice, widgets) can't be captured from the
  web app. Take a simulator or emulator screenshot and pass its path as the
  story's `screen`; crop the OS status bar if the frame draws its own.
- Output is JPEG with no alpha (stores reject transparency) plus a contact
  sheet for reviewing the set at a glance.

## Review: every image, before it ships

`node <skill>/scripts/review-sheet.mjs` writes `.marketing/review/index.html`
with each changed image beside its committed version, and the store composites.
Open it, or screenshot it for the user. For each image check:

- the right page, not a placeholder, skeleton, error or sign-in screen;
- nothing environmental: dev badge, banner, cursor, browser chrome, real email;
- the brand mark in its neutral color;
- framing: nothing important cut off, fixed bars at the bottom rather than mid-image;
- store shots: no third-party names, copy matches the site, sizes match the preset.

Then load the pages that use the images at desktop and phone widths and look
at them in place. A crop that looks right in a file can be wrong in its frame.

## Pitfalls

`references/pitfalls.md` lists symptoms, causes and fixes. The ones that cost
the most time:

- **Frosted glass renders wrong in Playwright's headless shell**: the
  `backdrop-filter` blur fades toward an element's edges and sharp text shows
  through. Use real Chrome (auto-detected; or `CHROME_PATH`).
- **A cold dev server** compiles each route on first hit, which can outlast a
  sign-in timeout. Preflight warms every shot's route.
- **`position: fixed` bars** sit at the viewport's bottom, so they land
  mid-image in a tall element shot. `capture.mjs` grows the viewport to the
  page for `selector` shots.
- **The demo sign-in re-seeds data.** Run it only against a local or throwaway
  database, and say so in a preflight check.

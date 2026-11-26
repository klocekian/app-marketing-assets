# `marketing-assets.config.mjs` reference

An ES module in the project root that `export default`s one object. It is
JavaScript, so `login`, `prepare` and checks are real functions, and values can
come from `process.env`. Pass `--config=path` to any script to use another file.

## Top level

| Field | Default | Meaning |
| --- | --- | --- |
| `baseUrl` | `http://localhost:3000` | The running app. `BASE_URL` env overrides it. |
| `healthUrl` | none | Path preflight GETs; must return 2xx. |
| `outDir` | `marketing` | Where `capture.mjs` writes masters (relative to the config). |
| `chrome` | `"auto"` | Browser binary path. `CHROME_PATH` env overrides. Auto = installed Chrome, then newest Playwright chromium. |
| `hideCss` | none | CSS injected before every shot. Hide dev badges, banners, toasts. |
| `placeholderText` | none | String or list. While any is visible, the page isn't ready: waited out (6 s), then reloaded (up to 8×), then the shot fails. |
| `defaults` | see below | Per-shot defaults. |
| `sessions` | `{ anon: {} }` | Named browser contexts. |
| `shots` | `[]` | One entry per captured image. |
| `scrub` | none | Trademark rewriting for store shots. |
| `scrubAll` | `false` | Apply `scrub` to every shot, not only those with `scrub: true`. |
| `derive` | none | Responsive derivatives (`derive.mjs`). |
| `store` | none | Store composites (`compose-store.mjs`). |
| `html` | none | HTML → PNG jobs (`render-html.mjs`). |
| `measure` | none | `{ path, match, widths }` for `measure-crops.mjs`. |
| `review` | none | `{ dirs, outDir }` for `review-sheet.mjs`. |
| `preflight` | none | `{ checks, warm, startHint }`. |

`defaults`: `{ viewport: { width: 1280, height: 800 }, scale: 2, format: "webp", quality: 88, settle: 800, waitUntil: "load", timeout: 90000 }`.

## `sessions`

```js
sessions: {
  anon: {},                                      // signed out (always defined)
  owner: {                                       // signs in once, reused by every shot
    async login(page, { baseUrl }) {
      await page.goto(baseUrl + "/");
      await page.getByRole("button", { name: "Try the demo" }).click();
      await page.waitForURL(/\/app/);
    },
  },
  phone: { from: "owner", userAgent: "…", isMobile: true, hasTouch: true,
           viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
}
```

Any other key is passed to Playwright's `browser.newContext()` (`locale`,
`timezoneId`, `colorScheme: "dark"`, `extraHTTPHeaders`, `storageState`…).
`from` copies another session's cookies and storage, so a mobile or app-UA
session shares the sign-in. Prefer signing in through the UI the way a visitor
would (a demo button, a test account form); if the app has a test-only sign-in
route, use that. Never put real credentials in the config: read them from env.

Set `timezoneId` and `locale` when dates or numbers appear in shots, so a run
on another machine produces the same images.

## `shots[]`

| Field | Meaning |
| --- | --- |
| `name` | Required, unique. Used by `--only`, `derive.sets[].from`, `store.stories[].screen`. |
| `url` | Path on `baseUrl`. |
| `session` | Session name (default `anon`). |
| `viewport` | Override `defaults.viewport`. (Scale is per session: set `deviceScaleFactor` on a session; `defaults.scale` is the fallback.) |
| `selector` | Screenshot this element (full height; the viewport is grown so fixed bars sit at the page bottom; `growViewport: false` to disable). |
| `clip` | `{ x, y, width, height }` in CSS px. |
| `fullPage` | Whole scrollable page. |
| *(none of the three)* | The viewport. |
| `waitFor` | Selector or `text=…` (or a list) that must appear. |
| `placeholderText` | Extra placeholders for this shot. |
| `settle` | ms to wait after load (fonts, images, animations). |
| `css` | Extra CSS for this shot. |
| `prepare(page, ctx)` | Open a menu, scroll to a section, type into a field. |
| `scrub` | `true` to apply `config.scrub`. |
| `keep` | Crop fractions `{ left, top, width, height }` (0..1). `--no-crop` skips it. |
| `out` | Output file under `outDir` (default `<name>.<format>`). Extension picks the encoder: `.webp`, `.png`, `.jpg`, `.avif`. |
| `quality` | Number, or `"lossless"` (WebP lossless; best for UI text masters). |
| `after(page, ctx)` | Runs after the file is written, e.g. to measure element positions into a JSON file the site reads. |

Animations are disabled during the screenshot and the pointer is parked off-page.

## `scrub`

```js
scrub: {
  replace: [["ChatGPT's second opinion", "a second opinion"], ["ChatGPT", "the second assistant"], ["Claude", "my assistant"]],
  forbid: /\b(chatgpt|claude|openai|anthropic|gemini|copilot|perplexity)\b/i,
}
```

Rules run in order on every text node in every frame (iframes included), so
put whole phrases before single words. After rewriting, any `forbid` match in
text, `title`, `aria-label`, `alt` or `placeholder` fails the shot. Logos in
images can't be detected: check the review sheet.

## `derive`

```js
derive: {
  outDir: "public/marketing/optimized",
  manifest: "src/marketing-images.json",
  widths: [480, 800, 1200, 1600],
  quality: 86,
  background: "#ffffff",      // pads a master shorter than its crop
  sets: {
    hero: { from: "hero", crop: { ratio: 1.55, top: 0 }, maxWidth: 1840 },
    share: { from: "share", crop: { left: 0, top: 0.55, width: 1, height: 0.3 } },
  },
}
```

`crop.ratio` keeps the full width and takes `width / ratio` of height, starting
`top × width` px down. Fraction crops use the master's own width and height.
`from` is a shot name or a file under `outDir`. The manifest entry is
`{ width, height, widths, version }`; `version` is a hash of the crop.

Example consumer:

```jsx
const m = manifest.hero;
<img src={`/marketing/optimized/hero-${m.widths.at(-1)}.webp?v=${m.version}`}
     srcSet={m.widths.map((w) => `/marketing/optimized/hero-${w}.webp?v=${m.version} ${w}w`).join(", ")}
     sizes="(min-width: 900px) 720px, 100vw" width={m.width} height={m.height} alt="…" />
```

## `store`

```js
store: {
  preset: "ios-6.9",           // or { width, height, scale } in CSS px
  outDir: ".marketing/store",
  format: "jpg",               // or "png" (flattened, no alpha)
  font: { family: "Inter", file: "fonts/Inter.woff2" },
  colors: { background: "#fff", text: "#111", stage: "#e9ece8" },
  frame: "phone",              // phone | tablet | browser | none; defaults per preset
  statusBar: true,             // phone frame draws 9:41 + island
  copyRatio: 0.28,             // portrait: share of height for the headline band
  line: true,                  // false = headline only (the android-phone preset default)
  stories: [
    { name: "save", title: "…", line: "…", screen: "phone-save", background: "photos/x.jpg", position: "50% 30%",
      bubble: "Save that table to my notebook.", bubbleLabel: "You, to your assistant",
      tone: { background: "#10211f", text: "#f4f5ef" }, frame: "phone" },
  ],
  template: (story, { screen, preset, fileUrl, esc }) => "<!doctype html>…",  // optional full override
}
```

`screen` is a shot name or an image path (a simulator screenshot for native
screens). `background` is a color, gradient, or image path. Stories are numbered
in order in the output names.

## `html`

`[{ name, src, out, width, height, scale = 1, transparent = false }]`. The
HTML file is the source: keep it in the repo, reference real captures and the
real icon from it, and re-render after a logo or UI change.

## `preflight`

```js
preflight: {
  startHint: "npm run dev",
  warm: ["/pricing"],          // extra routes to compile before capturing
  checks: [
    async () => ({ ok: !process.env.DATABASE_URL?.includes("prod"), message: "database is not production",
                   fix: "point DATABASE_URL at a local database" }),
    async () => ({ ok: true, message: "demo theme is default", blocker: false }),  // blocker:false = warn only
  ],
}
```

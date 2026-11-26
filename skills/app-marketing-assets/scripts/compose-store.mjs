#!/usr/bin/env node
// Composes app-store screenshots: a headline, an optional line and prompt
// bubble, and a real capture of the app inside a device frame, on a color or
// photo. Rendered from HTML in Chrome at the store's exact pixel size.
//
//   node <skill>/scripts/compose-store.mjs [--only=save,share] [--preset=ios-6.9]
//
// config.store = {
//   preset: "ios-6.9",                    // see PRESETS below; or { width, height, scale }
//   outDir: ".marketing/store",           // not committed: uploaded by hand
//   format: "jpg",                        // App Store rejects alpha: jpg, or png flattened
//   font: { family: "Inter", file: "fonts/inter.woff2" },   // optional
//   colors: { background: "#fff", text: "#111", stage: "#e9ece8" },
//   frame: "phone",                       // phone | tablet | browser | none
//   stories: [
//     { name: "save", title: "Keep the part that matters.", line: "…", screen: "<shot name or image path>",
//       background: "photos/seedpod.jpg" | "#dfe7e2", position: "50% 0%", bubble: "Save that table.",
//       tone: { background: "#10211f", text: "#f4f5ef" } },
//   ],
//   template: (story, ctx) => "<html>…</html>",   // optional: replace the built-in layout entirely
// }
// Output: <outDir>/<n>-<name>.<format> and <outDir>/contact-sheet.png.
import { mkdir, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, loadConfig, loadDeps, launch, rel, log } from "./lib.mjs";

// CSS size × scale = the store's pixel size, with each store's layout rules as
// defaults. Check the store's current spec before a submission
// (references/store-specs.md); stores change these.
export const PRESETS = {
  "ios-6.9": { width: 440, height: 956, scale: 3, orientation: "portrait" },       // 1320×2868
  "ios-6.5": { width: 428, height: 926, scale: 3, orientation: "portrait" },       // 1284×2778
  "ipad-13": { width: 1032, height: 1376, scale: 2, orientation: "portrait", frame: "tablet" }, // 2064×2752
  // Google Play: no device imagery, tagline at most 20% of the image.
  "android-phone": { width: 360, height: 640, scale: 3, orientation: "portrait", frame: "none", copyRatio: 0.18, line: false }, // 1080×1920
  // Chrome Web Store: square corners, no padding. Usually better as a raw capture or render-html.
  "chrome-web-store": { width: 1280, height: 800, scale: 1, orientation: "landscape" },
  "mac-app-store": { width: 1440, height: 900, scale: 2, orientation: "landscape" }, // 2880×1800
};

const { flags, only } = parseArgs();
const config = await loadConfig(flags);
const store = config.store;
if (!store?.stories?.length) { console.error("No `store.stories` in the config."); process.exit(1); }
const presetName = typeof flags.preset === "string" ? flags.preset : store.preset ?? "ios-6.9";
const preset = typeof presetName === "object" ? { orientation: presetName.width > presetName.height ? "landscape" : "portrait", ...presetName } : PRESETS[presetName];
if (!preset) { console.error(`Unknown preset "${presetName}". One of: ${Object.keys(PRESETS).join(", ")}`); process.exit(1); }
const deps = loadDeps(config.root);
const { sharp } = deps;
const outDir = path.resolve(config.root, store.outDir ?? ".marketing/store");
const format = store.format ?? "jpg";
const fileUrl = (p) => pathToFileURL(path.resolve(config.root, p)).href;
const esc = (s = "") => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/"/g, "&quot;");
const isColor = (v) => /^(#|rgb|hsl|linear-gradient|radial-gradient)/.test(v ?? "");

function screenFile(screen) {
  const shot = config.shots.find((s) => s.name === screen);
  return path.resolve(config.root, shot ? path.join(config.outDir ?? "marketing", shot.out ?? `${shot.name}.${config.defaults.format}`) : screen);
}

function builtInTemplate(story, { screen, preset }) {
  const colors = { background: "#ffffff", text: "#111418", stage: "#e9ece8", ...store.colors, ...story.tone };
  const frame = story.frame ?? store.frame ?? preset.frame ?? (preset.orientation === "landscape" ? "browser" : "phone");
  const font = store.font?.file ? `@font-face { font-family: "${store.font.family}"; src: url(${fileUrl(store.font.file)}); font-weight: 100 900; }` : "";
  const family = store.font?.family ? `"${store.font.family}", ` : "";
  const bg = story.background ?? store.stageBackground;
  const stageBg = !bg ? `background: ${colors.stage};` : isColor(bg) ? `background: ${bg};` : "";
  const photo = bg && !isColor(bg) ? `<img class="photo" src="${fileUrl(bg)}" style="object-position:${story.position ?? "50% 50%"}">` : "";
  const bubble = story.bubble ? `<div class="bubble">${story.bubbleLabel ? `<span>${esc(story.bubbleLabel)}</span>` : ""}${esc(story.bubble)}</div>` : "";
  const W = preset.width, H = preset.height, land = preset.orientation === "landscape";
  const device = {
    phone: `<div class="device phone"><div class="screen">${store.statusBar === false ? "" : `<div class="status"><b>9:41</b><i></i></div>`}<img src="${pathToFileURL(screen).href}"></div></div>`,
    tablet: `<div class="device tablet"><div class="screen"><img src="${pathToFileURL(screen).href}"></div></div>`,
    browser: `<div class="device browser"><div class="bar"><i></i><i></i><i></i></div><div class="screen"><img src="${pathToFileURL(screen).href}"></div></div>`,
    none: `<div class="device bare"><img src="${pathToFileURL(screen).href}"></div>`,
  }[frame];
  const copyH = land ? H : Math.round(H * (store.copyRatio ?? preset.copyRatio ?? 0.28));
  return `<!doctype html><html><head><meta charset="utf-8"><style>
    ${font}
    * { box-sizing: border-box; } html, body { margin: 0; width: ${W}px; height: ${H}px; overflow: hidden; }
    body { background: ${colors.background}; color: ${colors.text}; font-family: ${family}system-ui, -apple-system, "Segoe UI", sans-serif; position: relative; }
    .copy { position: absolute; ${land ? `left: 0; top: 0; bottom: 0; width: ${Math.round(W * 0.36)}px; padding: ${Math.round(H * 0.14)}px ${Math.round(W * 0.03)}px 0 ${Math.round(W * 0.045)}px;` : `left: 0; right: 0; top: 0; height: ${copyH}px; padding: ${Math.round(H * 0.06)}px ${Math.round(W * 0.07)}px 0;`} }
    h1 { margin: 0; font-size: ${land ? Math.round(H * 0.06) : Math.round(W * 0.088)}px; line-height: 1.06; font-weight: 650; letter-spacing: -.03em; text-wrap: balance; }
    .line { margin: .7em 0 0; font-size: ${land ? Math.round(H * 0.028) : Math.round(W * 0.043)}px; line-height: 1.3; opacity: .78; text-wrap: balance; }
    .stage { position: absolute; overflow: hidden; ${stageBg} ${land ? `left: ${Math.round(W * 0.38)}px; right: ${Math.round(W * 0.03)}px; top: ${Math.round(H * 0.06)}px; bottom: -40px; border-radius: 18px 18px 0 0;` : `left: ${Math.round(W * 0.032)}px; right: ${Math.round(W * 0.032)}px; top: ${copyH}px; bottom: -40px; border-radius: 20px;`} }
    .photo { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
    .bubble { position: absolute; z-index: 2; top: 5%; left: 5%; right: 5%; padding: 3% 4%; border-radius: 16px; background: #fff; color: #111418; box-shadow: 0 18px 50px rgba(0,0,0,.3); font-size: ${land ? 20 : Math.round(W * 0.039)}px; font-weight: 550; line-height: 1.3; }
    .bubble span { display: block; margin-bottom: 4px; font-size: .74em; font-weight: 500; color: #5a646a; }
    .device { position: absolute; left: 50%; transform: translateX(-50%); box-shadow: 0 26px 70px rgba(0,0,0,.42); }
    .device img { display: block; width: 100%; height: auto; }
    .phone { top: ${story.bubble ? "24%" : "6%"}; width: 75%; padding: 2.3%; border-radius: 13% / 6.2%; background: #0c0e11; box-shadow: 0 26px 70px rgba(0,0,0,.45), inset 0 0 0 1.5px #3a3f46; }
    .phone .screen { overflow: hidden; border-radius: 11% / 5.3%; background: #fff; }
    .status { position: relative; display: flex; align-items: center; height: 44px; padding: 4px 0 0 34px; font: 600 15px/1 -apple-system, system-ui, sans-serif; color: #000; }
    .status i { position: absolute; top: 10px; left: 50%; width: 92px; height: 27px; margin-left: -46px; border-radius: 14px; background: #000; }
    .tablet { top: 6%; width: 86%; padding: 2%; border-radius: 4%; background: #0c0e11; }
    .tablet .screen { overflow: hidden; border-radius: 2.2%; }
    .browser { top: ${story.bubble ? "22%" : "7%"}; width: 92%; border-radius: 12px 12px 0 0; overflow: hidden; background: #fff; }
    .browser .bar { display: flex; gap: 8px; padding: 12px 14px; background: #f1f2f4; border-bottom: 1px solid #e2e4e8; }
    .browser .bar i { width: 12px; height: 12px; border-radius: 50%; background: #ff5f57; } .browser .bar i:nth-child(2) { background: #febc2e; } .browser .bar i:nth-child(3) { background: #28c840; }
    .bare { top: ${story.bubble ? "22%" : "6%"}; width: 86%; border-radius: 14px; overflow: hidden; }
  </style></head><body>
    <div class="copy"><h1>${esc(story.title)}</h1>${story.line && (store.line ?? preset.line) !== false ? `<p class="line">${esc(story.line)}</p>` : ""}</div>
    <div class="stage">${photo}${bubble}${device}</div>
  </body></html>`;
}

await mkdir(path.join(outDir, "frames"), { recursive: true });
const { browser } = await launch(config, deps);
const page = await browser.newPage({ viewport: { width: preset.width, height: preset.height }, deviceScaleFactor: preset.scale });
const made = [];
for (const [i, story] of store.stories.entries()) {
  if (only && !only.includes(story.name)) continue;
  const screen = screenFile(story.screen ?? story.name);
  if (!existsSync(screen)) { log.bad(`${story.name}: screen ${rel(config.root, screen)} missing (capture it first)`); process.exitCode = 1; continue; }
  const html = (store.template ?? builtInTemplate)(story, { screen, preset, config, fileUrl, esc });
  const htmlFile = path.join(outDir, "frames", `${story.name}.html`);
  await writeFile(htmlFile, html);
  await page.goto(pathToFileURL(htmlFile).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const png = await page.screenshot({ type: "png" });
  const file = path.join(outDir, `${i + 1}-${story.name}.${format}`);
  const img = sharp(png).flatten({ background: "#ffffff" });
  await (format === "png" ? img.png() : img.jpeg({ quality: 92, mozjpeg: true })).toFile(file);
  const { width, height } = await sharp(file).metadata();
  made.push(file);
  log.ok(`${rel(config.root, file)} (${width}×${height})`);
}
await browser.close();

if (made.length) {
  const thumbW = preset.orientation === "landscape" ? 480 : 300;
  const thumbs = await Promise.all(made.map((f) => sharp(f).resize({ width: thumbW }).toBuffer({ resolveWithObject: true })));
  const h = Math.max(...thumbs.map((t) => t.info.height));
  await sharp({ create: { width: thumbs.length * (thumbW + 12) + 12, height: h + 24, channels: 3, background: "#8a8f94" } })
    .composite(thumbs.map((t, i) => ({ input: t.data, left: 12 + i * (thumbW + 12), top: 12 })))
    .png().toFile(path.join(outDir, "contact-sheet.png"));
  console.log(`Contact sheet: ${rel(config.root, path.join(outDir, "contact-sheet.png"))}`);
}

#!/usr/bin/env node
// Measures which part of every image on a page is ever visible, across a range
// of viewport widths, so each file can be cropped to what is shown and no
// visitor downloads masked pixels. Applies object-fit: cover, object-position,
// and every clipping ancestor (overflow: hidden stages, windows, phone screens).
//
//   node <skill>/scripts/measure-crops.mjs [/path] [--match=/marketing/] > crops.json
//
// Output, per image path: { x0, x1, y0, y1, shownWidth } as fractions of the
// file (add a small margin before cropping), and the widest it is ever drawn
// in CSS px (so you know the largest file width worth serving at 2×).
// Capture or build images UNCROPPED before measuring (capture.mjs --no-crop).
import { parseArgs, loadConfig, loadDeps, launch } from "./lib.mjs";

const { flags, positional } = parseArgs();
const config = await loadConfig(flags);
const route = positional[0] ?? config.measure?.path ?? "/";
const match = typeof flags.match === "string" ? flags.match : config.measure?.match ?? "";
const widths = config.measure?.widths ?? [360, 390, 430, 600, 768, 900, 1024, 1280, 1440, 1680, 1920, 2560];
const deps = loadDeps(config.root);
const { browser } = await launch(config, deps);
const union = {};
for (const width of widths) {
  const page = await browser.newPage({ viewport: { width, height: 1000 } });
  await page.goto(config.baseUrl + route, { waitUntil: "load", timeout: 90_000 });
  // Lazy images load only near the viewport: walk the page, then wait for all of them.
  const height = await page.evaluate(() => document.documentElement.scrollHeight);
  for (let y = 0; y < height; y += 600) { await page.evaluate((top) => window.scrollTo(0, top), y); await page.waitForTimeout(120); }
  await page.waitForFunction(() => [...document.images].every((img) => img.complete), null, { timeout: 30_000 }).catch(() => {});
  await page.evaluate(() => window.scrollTo(0, 0));
  const seen = await page.evaluate((match) => {
    const out = [];
    for (const img of document.images) {
      const src = new URL(img.currentSrc || img.src, location.href).pathname;
      if ((match && !src.includes(match)) || src.endsWith(".svg") || !img.naturalWidth) continue;
      const box = img.getBoundingClientRect();
      if (!box.width || !box.height) continue;
      const style = getComputedStyle(img);
      let content = { left: box.left, top: box.top, width: box.width, height: box.height };
      if (style.objectFit === "cover") {
        const scale = Math.max(box.width / img.naturalWidth, box.height / img.naturalHeight);
        const w = img.naturalWidth * scale, h = img.naturalHeight * scale;
        const [px, py] = style.objectPosition.split(" ").map((v) => parseFloat(v) / 100);
        content = { left: box.left + (box.width - w) * px, top: box.top + (box.height - h) * py, width: w, height: h };
      }
      const vis = { l: box.left, t: box.top, r: box.right, b: box.bottom };
      for (let el = img.parentElement; el && el !== document.documentElement; el = el.parentElement) {
        const s = getComputedStyle(el), r = el.getBoundingClientRect();
        if (s.overflowX !== "visible") { vis.l = Math.max(vis.l, r.left); vis.r = Math.min(vis.r, r.right); }
        if (s.overflowY !== "visible") { vis.t = Math.max(vis.t, r.top); vis.b = Math.min(vis.b, r.bottom); }
      }
      if (vis.r <= vis.l || vis.b <= vis.t) continue;
      out.push({ src, x0: (vis.l - content.left) / content.width, x1: (vis.r - content.left) / content.width, y0: (vis.t - content.top) / content.height, y1: (vis.b - content.top) / content.height, shownWidth: Math.round(content.width) });
    }
    return out;
  }, match);
  for (const s of seen) {
    const u = (union[s.src] ??= { x0: 1, x1: 0, y0: 1, y1: 0, shownWidth: 0 });
    u.x0 = Math.min(u.x0, s.x0); u.x1 = Math.max(u.x1, s.x1); u.y0 = Math.min(u.y0, s.y0); u.y1 = Math.max(u.y1, s.y1);
    u.shownWidth = Math.max(u.shownWidth, s.shownWidth);
  }
  await page.close();
}
await browser.close();
const round = (v) => Math.round(Math.min(1, Math.max(0, v)) * 1000) / 1000;
console.log(JSON.stringify(Object.fromEntries(Object.entries(union).sort().map(([k, u]) => [k, { x0: round(u.x0), x1: round(u.x1), y0: round(u.y0), y1: round(u.y1), shownWidth: u.shownWidth }])), null, 1));

#!/usr/bin/env node
// Renders hand-built HTML sources to PNG at exact sizes: store promo tiles,
// Open Graph / social cards, extension listing screenshots that composite real
// captures with drawn context (a context menu, a toolbar).
//
//   node <skill>/scripts/render-html.mjs [--only=promo,og]
//
// config.html = [
//   { name: "promo", src: "store-assets/promo.html", out: "store-assets/promo-440x280.png", width: 440, height: 280, scale: 1 },
//   { name: "og", src: "marketing/og.html", out: "public/og.png", width: 1200, height: 630 },
// ]
// Keep the HTML sources in the repo next to their PNGs; they are the source of truth.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import { pathToFileURL } from "node:url";
import { parseArgs, loadConfig, loadDeps, launch, rel, log } from "./lib.mjs";

const { flags, only } = parseArgs();
const config = await loadConfig(flags);
const jobs = (config.html ?? []).filter((j) => !only || only.includes(j.name ?? path.basename(j.src)));
if (!jobs.length) { console.error("No matching `html` jobs in the config."); process.exit(1); }
const deps = loadDeps(config.root);
const { browser } = await launch(config, deps);
for (const job of jobs) {
  const page = await browser.newPage({ viewport: { width: job.width, height: job.height }, deviceScaleFactor: job.scale ?? 1 });
  await page.goto(pathToFileURL(path.resolve(config.root, job.src)).href, { waitUntil: "load" });
  await page.evaluate(() => document.fonts.ready);
  const out = path.resolve(config.root, job.out);
  await mkdir(path.dirname(out), { recursive: true });
  await page.screenshot({ path: out, omitBackground: !!job.transparent });
  await page.close();
  log.ok(`${rel(config.root, job.src)} → ${rel(config.root, out)} (${job.width * (job.scale ?? 1)}×${job.height * (job.scale ?? 1)})`);
}
await browser.close();

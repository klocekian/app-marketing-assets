#!/usr/bin/env node
// Captures every shot in the config from the running app.
//
//   node <skill>/scripts/capture.mjs                    # all shots
//   node <skill>/scripts/capture.mjs --only=hero,share  # some
//   node <skill>/scripts/capture.mjs --no-crop          # skip each shot's `keep` (to re-measure)
//   node <skill>/scripts/capture.mjs --list             # print shot names
//
// Per shot: open the URL in its session, wait for real content, inject the
// hide CSS, run `prepare`, capture (element / clip / viewport / full page),
// crop to `keep`, encode. A failed shot is reported and the run exits 1, so a
// half-refreshed set is never mistaken for a finished one.
import { mkdir } from "node:fs/promises";
import path from "node:path";
import {
  parseArgs, loadConfig, loadDeps, launch, serverError, sessionFactory,
  waitForRealContent, scrubBrands, cropFraction, encode, rel, log,
} from "./lib.mjs";

const { flags, only } = parseArgs();
const config = await loadConfig(flags);
const shots = config.shots.filter((s) => !only || only.includes(s.name));
if (flags.list) { for (const s of config.shots) console.log(s.name); process.exit(0); }
if (only) for (const name of only) if (!config.shots.some((s) => s.name === name)) { console.error(`No shot named "${name}"`); process.exit(1); }

const down = await serverError(config.baseUrl);
if (down) { console.error(`App not reachable at ${config.baseUrl} (${down}). Start it, or set BASE_URL.`); process.exit(1); }

const deps = loadDeps(config.root);
const { sharp } = deps;
const { browser, chrome } = await launch(config, deps);
console.log(`Browser: ${chrome.path ?? "playwright default"}${chrome.real ? "" : "  (not real Chrome: frosted-glass UI may render wrong)"}`);
const sessions = sessionFactory(browser, config);

async function captureOne(shot) {
  const d = config.defaults;
  const context = await sessions.get(shot.session ?? "anon");
  const page = await context.newPage();
  try {
    const viewport = shot.viewport ?? d.viewport;
    await page.setViewportSize(viewport);
    await page.goto(config.baseUrl + shot.url, { waitUntil: shot.waitUntil ?? d.waitUntil, timeout: d.timeout });
    await waitForRealContent(page, shot, config);
    await page.waitForTimeout(shot.settle ?? d.settle);
    const css = [config.hideCss, shot.css].filter(Boolean).join("\n");
    if (css) await page.addStyleTag({ content: css });
    await page.mouse.move(-10, -10).catch(() => {}); // park the pointer: no hover states, no cursor
    if (shot.prepare) await shot.prepare(page, { config, shot });
    if (shot.scrub ?? config.scrubAll) await scrubBrands(page, config.scrub);

    // A fixed-position bar (a dock, a cookie banner) sits at the VIEWPORT's
    // bottom, so in an element taller than the viewport it lands mid-image.
    // Grow the viewport to the page so "bottom" means the page's bottom.
    if (shot.selector && shot.growViewport !== false) {
      const full = await page.evaluate(() => document.documentElement.scrollHeight);
      if (full > viewport.height) { await page.setViewportSize({ width: viewport.width, height: full }); await page.waitForTimeout(400); }
    }
    await page.waitForTimeout(300);

    let png;
    if (shot.selector) png = await page.locator(shot.selector).first().screenshot({ type: "png", animations: "disabled" });
    else if (shot.clip) png = await page.screenshot({ type: "png", clip: shot.clip, animations: "disabled" });
    else png = await page.screenshot({ type: "png", fullPage: !!shot.fullPage, animations: "disabled" });

    if (!flags["no-crop"]) png = await cropFraction(sharp, png, shot.keep);
    const out = path.resolve(config.root, config.outDir ?? "marketing", shot.out ?? `${shot.name}.${d.format}`);
    await mkdir(path.dirname(out), { recursive: true });
    await encode(sharp, png, out, shot.quality ?? d.quality).toFile(out);
    const meta = await sharp(png).metadata();
    log.ok(`${shot.name} → ${rel(config.root, out)} (${meta.width}×${meta.height})`);
    if (shot.after) await shot.after(page, { config, shot, file: out });
    return true;
  } catch (err) {
    log.bad(`${shot.name}: ${String(err.message || err).split("\n")[0]}`);
    if (flags.debug) await page.screenshot({ path: path.resolve(config.root, `.marketing-debug-${shot.name}.png`) }).catch(() => {});
    return false;
  } finally {
    await page.close();
  }
}

console.log(`Capturing ${shots.length} shot(s) from ${config.baseUrl}`);
let ok = 0;
for (const shot of shots) if (await captureOne(shot)) ok++;
await sessions.closeAll();
await browser.close();
console.log(`\n${ok}/${shots.length} captured.`);
if (ok !== shots.length) {
  console.error("Some shots failed. Fix them and rerun with --only= before deriving (add --debug to save what the page showed).");
  process.exit(1);
}

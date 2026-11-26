#!/usr/bin/env node
// Turns big capture masters into the small, cropped, responsive files a page
// actually serves, plus a JSON manifest for <img srcset>.
//
//   node <skill>/scripts/derive.mjs [--only=hero,trip]
//
// config.derive = {
//   outDir: "public/marketing/optimized",
//   manifest: "src/marketing-images.json",
//   widths: [480, 800, 1200, 1600],        // default set; never upscaled past the crop
//   quality: 86,
//   sets: {
//     // name: { from: <shot name or file under outDir>, crop }
//     hero: { from: "hero", crop: { ratio: 1.55, top: 0 }, maxWidth: 1840 },
//     share: { from: "share-menu", crop: { left: 0, top: 0.55, width: 1, height: 0.3 } },
//   },
// }
// crop: either fractions { left, top, width, height } of the master, or
// { ratio, top } = keep the full width, start `top` (fraction of WIDTH) down,
// and take width/ratio of height (padding with `background` if the master is short).
//
// Manifest entry: { width, height, widths, version } where `version` is a hash
// of the crop. Put it in the URL (?v=) so CDNs and browsers refetch on change.
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs, loadConfig, loadDeps, rel, log } from "./lib.mjs";

const { flags, only } = parseArgs();
const config = await loadConfig(flags);
const spec = config.derive;
if (!spec?.sets) { console.error("No `derive.sets` in the config."); process.exit(1); }
const { sharp } = loadDeps(config.root);
const outDir = path.resolve(config.root, spec.outDir ?? path.join(config.outDir ?? "marketing", "optimized"));
const manifestFile = path.resolve(config.root, spec.manifest ?? path.join(outDir, "manifest.json"));
await mkdir(outDir, { recursive: true });

function sourceFor(from) {
  const shot = config.shots.find((s) => s.name === from);
  const file = shot ? (shot.out ?? `${shot.name}.${config.defaults.format}`) : from;
  return path.resolve(config.root, config.outDir ?? "marketing", file);
}

let manifest = {};
if (only && existsSync(manifestFile)) manifest = JSON.parse(await readFile(manifestFile, "utf8"));

for (const [name, set] of Object.entries(spec.sets)) {
  if (only && !only.includes(name)) continue;
  const input = sourceFor(set.from);
  if (!existsSync(input)) { log.bad(`${name}: master ${rel(config.root, input)} missing (capture it first)`); process.exitCode = 1; continue; }
  const meta = await sharp(input).metadata();
  const c = set.crop ?? {};
  let left, top, width, height;
  if (c.ratio) {
    left = 0; width = meta.width; top = Math.round(width * (c.top ?? 0)); height = Math.round(width / c.ratio);
  } else {
    left = Math.round(meta.width * (c.left ?? 0)); top = Math.round(meta.height * (c.top ?? 0));
    width = Math.round(meta.width * (c.width ?? 1)); height = Math.round(meta.height * (c.height ?? 1));
  }
  width = Math.min(width, meta.width - left);
  const available = Math.min(height, meta.height - top);
  const crop = await sharp(input).extract({ left, top, width, height: available })
    .extend({ bottom: height - available, background: set.background ?? spec.background ?? "#ffffff" }).png().toBuffer();
  const maxWidth = Math.min(set.maxWidth ?? Infinity, width);
  const widths = [...new Set([...(set.widths ?? spec.widths ?? [480, 800, 1200, 1600]), maxWidth].filter((w) => w <= maxWidth))].sort((a, b) => a - b);
  const quality = set.quality ?? spec.quality ?? 86;
  for (const w of widths) {
    await sharp(crop).resize({ width: w }).webp({ quality, effort: 6, smartSubsample: true }).toFile(path.join(outDir, `${name}-${w}.webp`));
  }
  manifest[name] = { width, height, widths, version: createHash("sha256").update(crop).digest("hex").slice(0, 12) };
  log.ok(`${name}: ${width}×${height} → ${widths.join(", ")} px`);
}
await mkdir(path.dirname(manifestFile), { recursive: true });
await writeFile(manifestFile, JSON.stringify(manifest, null, 2) + "\n");
console.log(`Manifest: ${rel(config.root, manifestFile)}`);

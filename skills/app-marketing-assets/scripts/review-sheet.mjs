#!/usr/bin/env node
// Before/after review page for every image a run changed.
//
//   node <skill>/scripts/review-sheet.mjs            # uncommitted changes vs HEAD
//   node <skill>/scripts/review-sheet.mjs main       # everything that differs from main
//   → .marketing/review/index.html
//
// Watches config.review.dirs (default: config.outDir and the derive/store dirs)
// and always appends the store composites (untracked, so "after" only).
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import path from "node:path";
import { parseArgs, loadConfig, rel } from "./lib.mjs";

const { flags, positional } = parseArgs();
const config = await loadConfig(flags);
const REF = positional[0] ?? "HEAD";
const OUT = path.resolve(config.root, config.review?.outDir ?? ".marketing/review");
const storeDir = path.resolve(config.root, config.store?.outDir ?? ".marketing/store");
const dirs = config.review?.dirs ?? [config.outDir ?? "marketing", config.derive?.outDir, ...(config.html ?? []).map((j) => path.dirname(j.out))].filter(Boolean);
const IMG = /\.(webp|png|jpe?g|avif|gif|ico|svg)$/i;
const git = (...args) => execFileSync("git", args, { cwd: config.root, maxBuffer: 1 << 28 });
const top = git("rev-parse", "--show-toplevel").toString().trim();

const changed = new Set();
for (const line of git("status", "--porcelain", "--untracked-files=all", "--", ...dirs).toString().split("\n")) {
  const file = line.slice(3).trim();
  if (file && IMG.test(file)) changed.add(file);
}
if (REF !== "HEAD") for (const file of git("diff", "--name-only", REF, "--", ...dirs).toString().split("\n")) if (file && IMG.test(file)) changed.add(file);

rmSync(OUT, { recursive: true, force: true });
mkdirSync(path.join(OUT, "before"), { recursive: true });
const rows = [];
for (const file of [...changed].sort()) {
  const flat = file.replaceAll("/", "__");
  let before = null;
  try { writeFileSync(path.join(OUT, "before", flat), git("show", `${REF}:${file}`)); before = `before/${flat}`; } catch { /* new file */ }
  const abs = path.join(top, file);
  rows.push({ file, before, after: existsSync(abs) ? path.relative(OUT, abs) : null });
}
if (existsSync(storeDir)) for (const f of readdirSync(storeDir).filter((f) => IMG.test(f)).sort()) rows.push({ file: rel(config.root, path.join(storeDir, f)), before: null, after: path.relative(OUT, path.join(storeDir, f)) });

const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const cell = (src, label) => src ? `<figure><figcaption>${label}</figcaption><a href="${src}"><img src="${src}" loading="lazy"></a></figure>` : `<figure class="none"><figcaption>${label}</figcaption>—</figure>`;
writeFileSync(path.join(OUT, "index.html"), `<!doctype html><meta charset="utf-8"><title>Marketing review (${rows.length})</title>
<style>
  body { margin: 24px; font: 14px/1.4 system-ui, sans-serif; background: #f4f4f2; color: #1a1a1a; }
  h1 { font-size: 18px; } section { margin: 0 0 28px; padding: 14px; background: #fff; border-radius: 10px; }
  h2 { margin: 0 0 10px; font: 600 13px ui-monospace, monospace; }
  .pair { display: grid; grid-template-columns: 1fr 1fr; gap: 14px; align-items: start; }
  figure { margin: 0; } figcaption { margin-bottom: 4px; color: #666; font-size: 12px; }
  img { max-width: 100%; max-height: 900px; display: block; background: repeating-conic-gradient(#eee 0 25%, #fff 0 50%) 0 0 / 16px 16px; outline: 1px solid #ddd; }
  .none { color: #999; }
</style>
<h1>${rows.length} image${rows.length === 1 ? "" : "s"} to review (vs ${esc(REF)})</h1>
${rows.map((r) => `<section><h2>${esc(r.file)}</h2><div class="pair">${cell(r.before, `before (${esc(REF)})`)}${cell(r.after, "after")}</div></section>`).join("\n")}
`);
console.log(`${rows.length} image(s) → ${rel(config.root, path.join(OUT, "index.html"))}`);

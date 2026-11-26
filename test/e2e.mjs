// End-to-end: starts the demo app, runs every script against it, and checks
// the outputs exist at the sizes promised. Needs Chrome or a Playwright chromium.
//
//   npm test
import { spawn, spawnSync } from "node:child_process";
import { existsSync, rmSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const DEMO = path.join(ROOT, "examples/demo-app");
const SCRIPTS = path.join(ROOT, "skills/app-marketing-assets/scripts");
const PORT = String(4400 + Math.floor(Math.random() * 400));
const env = { ...process.env, PORT };
let failures = 0;
const check = (ok, msg) => { console.log(`${ok ? "PASS" : "FAIL"}  ${msg}`); if (!ok) failures++; };
const run = (script, args = [], extraEnv = {}) => spawnSync("node", [path.join(SCRIPTS, script), ...args], { cwd: DEMO, env: { ...env, ...extraEnv }, encoding: "utf8" });

rmSync(path.join(DEMO, "out"), { recursive: true, force: true });
const server = spawn("node", ["server.mjs"], { cwd: DEMO, env, stdio: "ignore" });
try {
  for (let i = 0; i < 50; i++) {
    try { if ((await fetch(`http://localhost:${PORT}/api/health`)).ok) break; } catch { /* starting */ }
    await new Promise((r) => setTimeout(r, 100));
  }

  for (const [script, args] of [["preflight.mjs"], ["capture.mjs"], ["derive.mjs"], ["compose-store.mjs"], ["render-html.mjs"], ["measure-crops.mjs", ["/"]]]) {
    const r = run(script, args);
    check(r.status === 0, `${script} exits 0${r.status ? `\n${r.stdout}\n${r.stderr}` : ""}`);
  }

  const size = async (f) => { const m = await sharp(path.join(DEMO, f)).metadata(); return `${m.width}×${m.height}`; };
  check(await size("out/marketing/landing.webp") === "2000×1040", "clip shot is clip × scale");
  check(await size("out/marketing/phone-note.webp") === `1170×${Math.round(844 * 3 * 0.9)}`, "phone shot is 3× and cropped by keep");
  check(await size("out/store/1-plan.jpg") === "1320×2868", "ios-6.9 composite is 1320×2868");
  check(await size("out/store-assets/promo-440x280.png") === "440×280", "promo tile is 440×280");
  check(existsSync(path.join(DEMO, "out/store/contact-sheet.png")), "contact sheet written");
  const manifest = JSON.parse(readFileSync(path.join(DEMO, "out/marketing-images.json"), "utf8"));
  check(manifest.notebook?.widths?.length > 0 && /^[0-9a-f]{12}$/.test(manifest.notebook.version), "manifest has widths and a content hash");
  check(Object.values(manifest).every((m) => Math.max(...m.widths) <= m.width), "no derivative is upscaled");

  // The dev badge is hidden by hideCss; a leftover brand name must fail the shot.
  const leak = run("capture.mjs", ["--only=phone-research"], { SCRUB: "off" });
  check(leak.status === 1 && /forbidden name/.test(leak.stdout), "scrub fails a shot that still names a product");
  const unknown = run("capture.mjs", ["--only=nope"]);
  check(unknown.status === 1, "unknown --only name is an error");
} finally {
  server.kill();
}
console.log(failures ? `\n${failures} failed` : "\nall passed");
process.exit(failures ? 1 : 0);

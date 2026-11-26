#!/usr/bin/env node
// Checks everything a capture run needs and prints the fix for anything
// missing. Exits 1 on a blocker. Also warms the shots' routes, because a dev
// server's first compile of a page can outlast a sign-in timeout.
//
//   node <skill>/scripts/preflight.mjs
//
// Project-specific checks go in config.preflight.checks: async functions that
// return { ok: boolean, message, fix?, blocker? }. Typical ones: "the database
// is local, not production" (a demo sign-in that re-seeds data must never run
// against prod) and "the demo account has the default theme".
import { existsSync } from "node:fs";
import path from "node:path";
import { parseArgs, loadConfig, loadDeps, resolveChrome, serverError, log } from "./lib.mjs";

const { flags } = parseArgs();
let failed = false;
const bad = (msg, fix) => { log.bad(msg); if (fix) console.log(`    → ${fix}`); failed = true; };
const warn = (msg, fix) => { log.warn(msg); if (fix) console.log(`    → ${fix}`); };

let config;
try { config = await loadConfig(flags); log.ok(`config: ${path.relative(process.cwd(), path.join(config.root, "marketing-assets.config.mjs")) || "marketing-assets.config.mjs"}`); }
catch (err) { bad(err.message); process.exit(1); }
console.log(`app: ${config.baseUrl}`);

const [major] = process.versions.node.split(".").map(Number);
if (major >= 18) log.ok(`node ${process.versions.node}`); else bad(`node ${process.versions.node}`, "Node 18+ is required");

try { loadDeps(config.root); log.ok("playwright + sharp"); }
catch (err) { bad(err.message, "npm i -D playwright sharp"); }

const chrome = resolveChrome(config);
if (chrome.real) log.ok(`Chrome: ${chrome.path}`);
else if (chrome.path) warn(`no Google Chrome; using ${chrome.path}`, "install Chrome (or set CHROME_PATH) if the UI uses backdrop-filter / frosted glass");
else warn("no Chrome found; Playwright will use its own headless shell", "install Chrome, or: npx playwright install chromium");

const needsServer = config.shots.length > 0;
if (needsServer) {
  const down = await serverError(config.baseUrl);
  if (down) bad(`app not reachable at ${config.baseUrl} (${down})`, config.preflight?.startHint ?? "start the dev server, or set BASE_URL");
  else {
    log.ok("app is up");
    if (config.healthUrl) {
      try {
        const res = await fetch(config.baseUrl + config.healthUrl, { signal: AbortSignal.timeout(30_000) });
        if (res.ok) log.ok(`${config.healthUrl} → ${res.status}`); else bad(`${config.healthUrl} → ${res.status}`, "the app is up but unhealthy (database?)");
      } catch (err) { bad(`${config.healthUrl}: ${err.message}`); }
    }
    const routes = [...new Set(["/", ...(config.preflight?.warm ?? []), ...config.shots.map((s) => s.url.split("?")[0])])];
    const t0 = Date.now();
    await Promise.all(routes.map((r) => fetch(config.baseUrl + r, { signal: AbortSignal.timeout(180_000) }).catch(() => {})));
    log.ok(`warmed ${routes.length} route(s) in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
  }
}

for (const check of config.preflight?.checks ?? []) {
  try {
    const r = await check({ config });
    if (r.ok) log.ok(r.message);
    else if (r.blocker === false) warn(r.message, r.fix);
    else bad(r.message, r.fix);
  } catch (err) { bad(`${check.name || "check"}: ${err.message}`); }
}

for (const file of [config.store?.font?.file].filter(Boolean)) {
  if (!existsSync(path.resolve(config.root, file))) bad(`font file missing: ${file}`);
}

console.log(failed ? "\nFix the ✗ items, then rerun." : "\nReady to capture.");
process.exit(failed ? 1 : 0);

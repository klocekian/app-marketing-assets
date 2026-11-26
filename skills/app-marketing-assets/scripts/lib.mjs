// Shared helpers for the app-marketing-assets scripts.
//
// The scripts run from the PROJECT's root (the directory holding
// marketing-assets.config.mjs) and load playwright and sharp from the project's
// own node_modules first, so the skill itself needs no install step.
import { createRequire } from "node:module";
import { existsSync, readdirSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export const SKILL_DIR = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

/** `--only=a,b`, `--config=path`, bare `--flags`, and positionals. */
export function parseArgs(argv = process.argv.slice(2)) {
  const flags = {};
  const positional = [];
  for (const arg of argv) {
    if (!arg.startsWith("--")) { positional.push(arg); continue; }
    const [key, ...rest] = arg.slice(2).split("=");
    flags[key] = rest.length ? rest.join("=") : true;
  }
  const only = typeof flags.only === "string" ? flags.only.split(",").map((s) => s.trim()).filter(Boolean) : null;
  return { flags, positional, only };
}

/** Loads the project config (default ./marketing-assets.config.mjs) and fills in defaults. */
export async function loadConfig(flags = {}) {
  const file = path.resolve(typeof flags.config === "string" ? flags.config : "marketing-assets.config.mjs");
  if (!existsSync(file)) {
    throw new Error(`No config at ${file}. Copy ${path.join(SKILL_DIR, "templates/marketing-assets.config.mjs")} to your project root and edit it.`);
  }
  const mod = await import(pathToFileURL(file).href);
  const config = { ...(mod.default ?? mod) };
  config.root = path.dirname(file);
  config.baseUrl = (process.env.BASE_URL || config.baseUrl || "http://localhost:3000").replace(/\/$/, "");
  config.defaults = { viewport: { width: 1280, height: 800 }, scale: 2, format: "webp", quality: 88, settle: 800, waitUntil: "load", timeout: 90_000, ...config.defaults };
  config.sessions = { anon: {}, ...config.sessions };
  config.shots ??= [];
  return config;
}

/** playwright + sharp from the project, then from the skill folder. */
export function loadDeps(root = process.cwd()) {
  const tryFrom = [path.join(root, "package.json"), path.join(SKILL_DIR, "package.json")];
  const load = (name) => {
    for (const from of tryFrom) {
      try { return createRequire(from)(name); } catch { /* next */ }
    }
    throw new Error(`Cannot find "${name}". Install it in your project: npm i -D playwright sharp`);
  };
  return { playwright: load("playwright"), sharp: load("sharp") };
}

/**
 * A real Chrome binary if there is one. Playwright's bundled headless shell
 * renders `backdrop-filter` (frosted glass) badly: the blur fades out toward an
 * element's edges, so sharp text shows through translucent toolbars. Order:
 * CHROME_PATH / PLAYWRIGHT_EXECUTABLE, the config's `chrome`, installed Chrome,
 * then the newest Playwright chromium in the cache, then Playwright's default.
 */
export function resolveChrome(config = {}) {
  const explicit = process.env.CHROME_PATH || process.env.PLAYWRIGHT_EXECUTABLE || (config.chrome && config.chrome !== "auto" ? config.chrome : null);
  if (explicit) return { path: explicit, real: true };
  const candidates = {
    darwin: ["/Applications/Google Chrome.app/Contents/MacOS/Google Chrome"],
    linux: ["/usr/bin/google-chrome", "/usr/bin/google-chrome-stable", "/opt/google/chrome/chrome"],
    win32: [
      path.join(process.env["PROGRAMFILES"] ?? "C:\\Program Files", "Google/Chrome/Application/chrome.exe"),
      path.join(process.env["LOCALAPPDATA"] ?? "", "Google/Chrome/Application/chrome.exe"),
    ],
  }[process.platform] ?? [];
  for (const p of candidates) if (existsSync(p)) return { path: p, real: true };
  const cache = process.platform === "darwin" ? path.join(os.homedir(), "Library/Caches/ms-playwright")
    : process.platform === "win32" ? path.join(process.env.LOCALAPPDATA ?? "", "ms-playwright")
    : path.join(os.homedir(), ".cache/ms-playwright");
  if (existsSync(cache)) {
    const builds = readdirSync(cache).filter((d) => /^chromium-\d+$/.test(d)).sort((a, b) => Number(b.split("-")[1]) - Number(a.split("-")[1]));
    for (const d of builds) {
      for (const rel of [
        "chrome-mac-arm64/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-mac/Google Chrome for Testing.app/Contents/MacOS/Google Chrome for Testing",
        "chrome-linux64/chrome", "chrome-linux/chrome", "chrome-win64/chrome.exe", "chrome-win/chrome.exe",
      ]) {
        const p = path.join(cache, d, rel);
        if (existsSync(p)) return { path: p, real: false };
      }
    }
  }
  return { path: undefined, real: false };
}

export async function launch(config, { playwright }) {
  const chrome = resolveChrome(config);
  const args = process.platform === "darwin" ? ["--use-angle=metal"] : [];
  const browser = await playwright.chromium.launch({ headless: true, executablePath: chrome.path, args });
  return { browser, chrome };
}

/** Is the app server answering? Returns an error string or null. */
export async function serverError(baseUrl) {
  try {
    const res = await fetch(baseUrl + "/", { redirect: "manual", signal: AbortSignal.timeout(180_000) });
    return res.status >= 500 ? `HTTP ${res.status}` : null;
  } catch (err) {
    return err.cause?.code ?? err.message;
  }
}

/**
 * Builds the browser contexts named in config.sessions, lazily:
 *   anon:  {}                                          a clean signed-out context
 *   owner: { login: async (page, ctx) => {...} }       signs in once, reused
 *   app:   { from: "owner", userAgent, isMobile }      another session's cookies with new options
 */
export function sessionFactory(browser, config) {
  const made = new Map();
  const base = { viewport: config.defaults.viewport, deviceScaleFactor: config.defaults.scale };
  async function get(name = "anon") {
    if (made.has(name)) return made.get(name);
    const spec = config.sessions[name];
    if (!spec) throw new Error(`Unknown session "${name}" (define it under sessions in the config)`);
    const { login, from, ...options } = spec;
    const storageState = from ? await (await get(from)).storageState() : undefined;
    const context = await browser.newContext({ ...base, ...options, ...(storageState ? { storageState } : {}) });
    if (login) {
      const page = await context.newPage();
      await login(page, { baseUrl: config.baseUrl, config });
      await page.close();
    }
    made.set(name, context);
    return context;
  }
  return { get, closeAll: async () => { for (const c of made.values()) await c.close(); } };
}

/**
 * Waits until the page shows real content: reloads while any `placeholderText`
 * is visible (a local-first app's "not synced yet" page, a skeleton's label),
 * then waits for the shot's `waitFor` (a selector, or `text=...`).
 */
export async function waitForRealContent(page, shot, config) {
  const placeholders = [].concat(config.placeholderText ?? [], shot.placeholderText ?? []);
  const gone = async () => {
    for (const t of placeholders) {
      // A skeleton clears by itself: give it a few seconds before reloading.
      const ok = await page.getByText(t).first().waitFor({ state: "hidden", timeout: 6000 }).then(() => true, () => false);
      if (!ok) return false;
    }
    return true;
  };
  for (let tries = 0; tries < 8 && placeholders.length; tries++) {
    if (await gone()) break;
    await page.reload({ waitUntil: shot.waitUntil ?? config.defaults.waitUntil });
  }
  for (const t of placeholders) {
    if (await page.getByText(t).count()) throw new Error(`still showing placeholder "${t}"`);
  }
  for (const w of [].concat(shot.waitFor ?? [])) {
    if (w.startsWith("text=")) await page.getByText(w.slice(5)).first().waitFor({ timeout: 30_000 });
    else await page.waitForSelector(w, { timeout: 30_000 });
  }
}

/**
 * Rewrites third-party product names in every frame's text, then fails if any
 * `forbid` match is left. App stores reject listings that show other companies'
 * trademarks (Apple Guideline 5.2.1), and a demo built around "my ChatGPT chat"
 * names them everywhere. Rules apply in order: put whole phrases first.
 */
export async function scrubBrands(page, scrub) {
  if (!scrub) return;
  const rules = scrub.replace ?? [];
  const forbid = scrub.forbid instanceof RegExp ? scrub.forbid.source : scrub.forbid;
  const left = [];
  for (const frame of page.frames()) {
    const hits = await frame.evaluate(([rules, forbid]) => {
      const re = forbid ? new RegExp(forbid, "i") : null;
      const out = [];
      const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n = walker.nextNode(); n; n = walker.nextNode()) {
        let text = n.nodeValue;
        for (const [from, to] of rules) text = text.split(from).join(to);
        if (text !== n.nodeValue) n.nodeValue = text;
        if (re?.test(text)) out.push(text.trim().slice(0, 80));
      }
      for (const el of document.querySelectorAll("[title],[aria-label],img[alt],input[placeholder]")) {
        for (const attr of ["title", "aria-label", "alt", "placeholder"]) {
          const v = el.getAttribute(attr);
          if (v && re?.test(v)) out.push(`${attr}="${v.slice(0, 60)}"`);
        }
      }
      return out;
    }, [rules, forbid]).catch(() => []);
    left.push(...hits);
  }
  if (left.length) throw new Error(`a forbidden name is still on screen: ${[...new Set(left)].join(" | ")}`);
}

/** Crops a PNG buffer to fractions of its size: { left, top, width, height } in 0..1. */
export async function cropFraction(sharp, buf, keep) {
  if (!keep) return buf;
  const { width, height } = await sharp(buf).metadata();
  const left = Math.round(width * (keep.left ?? 0));
  const top = Math.round(height * (keep.top ?? 0));
  const w = Math.min(width - left, Math.round(width * (keep.width ?? 1 - (keep.left ?? 0))));
  const h = Math.min(height - top, Math.round(height * (keep.height ?? 1 - (keep.top ?? 0))));
  return sharp(buf).extract({ left, top, width: w, height: h }).png().toBuffer();
}

/** Encodes to the output format implied by the file extension. quality "lossless" for webp/png text. */
export function encode(sharp, buf, file, quality) {
  const ext = path.extname(file).toLowerCase();
  const img = sharp(buf);
  if (ext === ".webp") return quality === "lossless" ? img.webp({ lossless: true, effort: 6 }) : img.webp({ quality, effort: 6, smartSubsample: true });
  if (ext === ".jpg" || ext === ".jpeg") return img.flatten({ background: "#ffffff" }).jpeg({ quality: quality === "lossless" ? 95 : quality, mozjpeg: true });
  if (ext === ".avif") return img.avif({ quality: quality === "lossless" ? 90 : quality });
  return img.png({ compressionLevel: 9 });
}

export const rel = (root, p) => path.relative(root, p) || ".";
export const log = {
  ok: (msg) => console.log(`  \x1b[32m✓\x1b[0m ${msg}`),
  bad: (msg) => console.log(`  \x1b[31m✗\x1b[0m ${msg}`),
  warn: (msg) => console.log(`  \x1b[33m!\x1b[0m ${msg}`),
  skip: (msg) => console.log(`  - ${msg}`),
};

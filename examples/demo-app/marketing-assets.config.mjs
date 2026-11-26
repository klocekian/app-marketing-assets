// Config for the bundled demo app. Every feature of the skill is used once
// here, so it doubles as a worked example. Run from examples/demo-app/.
const IPHONE_UA = "Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1";

export default {
  baseUrl: `http://localhost:${process.env.PORT || 4321}`,
  healthUrl: "/api/health",
  outDir: "out/marketing",

  // Environment-only UI that must never be in a marketing image.
  hideCss: `#dev-badge { display: none !important; }`,
  // Text that means "not the real page yet". Waited out, then reloaded if it sticks.
  placeholderText: ["Loading your notebook…"],

  sessions: {
    owner: {
      async login(page, { baseUrl }) {
        await page.goto(baseUrl + "/");
        await page.getByRole("button", { name: "Try the demo" }).click();
        await page.waitForURL(/\/app$/);
      },
    },
    // The phone app's look: same account, mobile UA and viewport.
    phone: { from: "owner", userAgent: IPHONE_UA, isMobile: true, hasTouch: true, viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  },

  defaults: { viewport: { width: 1000, height: 900 }, scale: 2, format: "webp", quality: 88 },

  shots: [
    // Signed-out landing page, top of the fold only.
    { name: "landing", url: "/", clip: { x: 0, y: 0, width: 1000, height: 520 } },
    // The content column, full height. The dock is fixed to the viewport; the
    // harness grows the viewport so it lands at the bottom, not over a row.
    { name: "notebook", session: "owner", url: "/app", selector: ".shell", waitFor: ".note-row", quality: "lossless" },
    { name: "note", session: "owner", url: "/note/lisbon", selector: ".shell" },
    // A menu opened before the shot.
    {
      name: "share-menu", session: "owner", url: "/note/recipe",
      async prepare(page) { await page.getByRole("button", { name: "Share" }).click(); await page.waitForTimeout(300); },
    },
    // Phone screens for the store composites. `keep` crops to the top 90%.
    { name: "phone-note", session: "phone", url: "/note/lisbon", viewport: { width: 390, height: 844 }, keep: { height: 0.9 } },
    // This note names ChatGPT and Claude: scrub rewrites them, and fails the shot if any survive.
    { name: "phone-research", session: "phone", url: "/note/research", viewport: { width: 390, height: 844 }, scrub: true },
  ],

  scrub: {
    // SCRUB=off drops the rules, so the e2e test can prove a leftover name fails the shot.
    replace: process.env.SCRUB === "off" ? [] : [["I asked ChatGPT", "I asked one assistant"], ["Claude to check", "another to check"], ["Claude found", "The second one found"]],
    forbid: /\b(chatgpt|claude|openai|anthropic|gemini|copilot)\b/i,
  },

  derive: {
    outDir: "out/marketing/optimized",
    manifest: "out/marketing-images.json",
    widths: [480, 800, 1200],
    sets: {
      notebook: { from: "notebook", crop: { ratio: 1.4, top: 0 } },
      "note-hero": { from: "note", crop: { ratio: 1.2, top: 0.05 }, maxWidth: 1600 },
    },
  },

  store: {
    preset: "ios-6.9",
    outDir: "out/store",
    colors: { background: "#ffffff", text: "#15181c", stage: "#dfe7e2" },
    stories: [
      { name: "plan", title: "Plans that keep evolving.", line: "One page for the whole trip.", screen: "phone-note", background: "linear-gradient(160deg, #cfe3dc, #f1d9b5)" },
      { name: "research", title: "Research you won't redo.", line: "Kept once, found when it matters.", screen: "phone-research", bubble: "Save that comparison to my notebook.", bubbleLabel: "You, to your assistant", tone: { background: "#10211f", text: "#f4f5ef" }, background: "#2f6f5e" },
    ],
  },

  html: [
    { name: "promo", src: "store-assets/promo.html", out: "out/store-assets/promo-440x280.png", width: 440, height: 280 },
  ],

  review: { dirs: ["out"] },

  preflight: {
    startHint: "node server.mjs",
    checks: [
      // Project-specific example: refuse to run against anything but localhost.
      async ({ config }) => ({ ok: /localhost|127\.0\.0\.1/.test(config.baseUrl), message: "baseUrl is local", fix: "never point a re-seeding demo sign-in at production" }),
    ],
  },
};

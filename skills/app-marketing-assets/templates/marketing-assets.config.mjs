// marketing-assets.config.mjs — put this in your project root and edit.
// Field reference: references/config.md in the app-marketing-assets skill.
export default {
  baseUrl: process.env.BASE_URL ?? "http://localhost:3000",
  healthUrl: "/api/health",            // or remove
  outDir: "public/marketing",           // masters

  // Dev-only and account-specific UI that must never be in an image.
  hideCss: `
    nextjs-portal, [data-nextjs-toast], #__next-build-watcher { display: none !important; }
    .cookie-banner, .toast, .announcement-bar { display: none !important; }
  `,
  // Text that means "this isn't the real page yet".
  placeholderText: ["Loading…"],

  sessions: {
    owner: {
      async login(page, { baseUrl }) {
        // Sign in as the seeded demo account the way a visitor would.
        await page.goto(baseUrl + "/");
        await page.getByRole("button", { name: "Try the demo" }).click();
        await page.waitForURL(/\/app/);
      },
      locale: "en-US",
      timezoneId: "America/Los_Angeles",
    },
    // phone: { from: "owner", userAgent: "<your app's UA>", isMobile: true, hasTouch: true,
    //          viewport: { width: 390, height: 844 }, deviceScaleFactor: 3 },
  },

  defaults: { viewport: { width: 1280, height: 800 }, scale: 2, format: "webp", quality: 88 },

  shots: [
    { name: "hero", session: "owner", url: "/app", selector: "main", waitFor: "main h1", quality: "lossless" },
    // { name: "share", session: "owner", url: "/doc/example",
    //   async prepare(page) { await page.getByRole("button", { name: "Share" }).click(); } },
  ],

  derive: {
    outDir: "public/marketing/optimized",
    manifest: "src/marketing-images.json",
    widths: [480, 800, 1200, 1600],
    sets: {
      hero: { from: "hero", crop: { ratio: 1.6, top: 0 } },
    },
  },

  // scrub: { replace: [["ChatGPT", "your assistant"]], forbid: /\b(chatgpt|claude|gemini|copilot)\b/i },

  // store: {
  //   preset: "ios-6.9",
  //   outDir: ".marketing/store",
  //   stories: [{ name: "hero", title: "Your headline.", line: "Your line.", screen: "phone-hero", background: "#e9ece8" }],
  // },

  // html: [{ name: "og", src: "marketing/og.html", out: "public/og.png", width: 1200, height: 630 }],

  preflight: {
    startHint: "npm run dev",
    checks: [
      // A demo sign-in that re-seeds data must never reach production.
      async ({ config }) => ({
        ok: /localhost|127\.0\.0\.1/.test(config.baseUrl),
        message: "capturing from a local app",
        fix: "run the app locally against a local database",
      }),
    ],
  },
};

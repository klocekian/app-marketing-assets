# Pitfalls

Each of these has shipped a bad image or burned an afternoon at least once.

| Symptom | Cause | Fix |
| --- | --- | --- |
| Translucent bars show sharp text through them; blur fades at the edges | Playwright's headless shell composites `backdrop-filter` in software | Install Google Chrome (auto-detected) or set `CHROME_PATH` |
| First run times out at sign-in; second run is fine | Dev server compiles each route on first request | `preflight.mjs` warms every shot route; or run against a production build |
| Shot shows a skeleton, "Loading…", or "not available on this device yet" | Captured before data arrived (local-first apps sync after sign-in) | Add the text to `placeholderText` and a real-content selector to `waitFor` |
| A toolbar or dock appears in the middle of a tall image | `position: fixed` is relative to the viewport, not the element | `selector` shots grow the viewport to the page height (default) |
| Logo and buttons are tinted in every shot | The demo account has a theme/accent color saved | Reset it in the seed; add a preflight check |
| A dev badge, "2 issues" pill, or framework overlay in a shot | Dev-only UI | Add its selector to `hideCss` (Next.js: `nextjs-portal`) |
| An admin or access-request notice with a real email in a shot | Account-specific banner | `hideCss`; audit every new banner |
| A cursor or hover state in a shot | The pointer was over the page | Scripts park the pointer at (-10, -10); avoid `hover()` in `prepare` |
| An unexpected item at the top of a list shot | Seed data with a date relative to "now" drifted | Use fixed dates, or ones that sort below what shots show |
| Dates or numbers differ between machines | Locale and time zone come from the OS | Set `locale` and `timezoneId` on the session |
| Text is soft or blurry | The image was upscaled, or captured at 1× | Capture at display size with `scale` 2 to 3; never resize up |
| An iframe or embedded widget is cut off or blank | Full-page capture doesn't paint off-screen iframe pixels | Use a `selector` shot after the iframe reports its height (`settle`), or capture in two scrolls and join |
| A store listing rejected for a trademark | A third-party product name or logo is visible | `scrub` with `forbid`; check headline copy and images by eye |
| The App Store rejects the upload | Alpha channel or wrong size | `compose-store` writes flattened JPEG at the preset's exact size |
| Shots of a mobile app look like the mobile website | The app adds UI by user agent | Give the session the app's user agent (`userAgent`) and `isMobile` |
| Phone toolbar overlaps a floating button | Viewport narrower than the app supports | Use a real device width (390 or 402 for current iPhones) |
| Clicking into a clipped image in a browser to inspect it changes its crop | Automation scrolls the overflow-hidden container | Inspect through the caption or the review sheet, not the image center |
| `chromium.launch` aborts with a missing binary | Half-downloaded Playwright browser | `npx playwright install chromium`, or `CHROME_PATH` to a complete build |
| The demo sign-in deleted real data | It re-seeds, and pointed at a shared database | Local or throwaway database only, guarded by a preflight check |
| Run fails on one shot and the rest look fine | By design: a partly refreshed set is not shippable | Fix it, `--only=<shot>`, then derive and compose |

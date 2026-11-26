# Store image specs

Checked 2026-11-25 against the stores' own pages (linked). Stores change these:
**open the link and confirm before a submission**, and update this file if it
has moved.

## Apple App Store

[Screenshot specifications](https://developer.apple.com/help/app-store-connect/reference/app-information/screenshot-specifications)

| Display | Pixel sizes (portrait) | Preset | Notes |
| --- | --- | --- | --- |
| iPhone 6.9" | 1320×2868, 1290×2796, 1260×2736 | `ios-6.9` | Scaled down for smaller iPhones if your UI is consistent |
| iPhone 6.5" | 1284×2778, 1242×2688 | `ios-6.5` | Required if you provide no 6.9" set |
| iPad 13" | 2064×2752, 2048×2732 | `ipad-13` | Required if the app runs on iPad |
| Mac | 1280×800, 1440×900, 2560×1600, 2880×1800 | `mac-app-store` | 16:10 |

- JPEG or PNG, **no alpha or transparency**. Up to 10 per size.
- [App Review Guideline 5.2.1](https://developer.apple.com/app-store/review/guidelines/#intellectual-property):
  don't use third-party trademarks or brand names without permission, in
  screenshots, app name, subtitle or keywords.

## Google Play

[Preview assets](https://support.google.com/googleplay/android-developer/answer/9866151)

| Asset | Size | Preset |
| --- | --- | --- |
| Phone screenshots | 2–8; each side 320–3840 px; long side ≤ 2.3× short; 9:16 or 16:9; 1080×1920 recommended | `android-phone` |
| Feature graphic | 1024×500 | use `render-html` |
| App icon | 512×512, 32-bit PNG | from the icon source |

- JPEG or 24-bit PNG, no alpha (screenshots, feature graphic).
- Show the real app; **no device imagery**, no store badges; taglines at most
  20% of the image; no "best", "#1", "free" or price claims; no third-party
  trademarks without permission; a clean status bar (no notifications, no
  carrier). The `android-phone` preset defaults to `frame: "none"` and an 18% copy band.

## Chrome Web Store

[Supplying images](https://developer.chrome.com/docs/webstore/images)

| Asset | Size |
| --- | --- |
| Screenshots | 1280×800 (preferred) or 640×400; 1–5; square corners, no padding |
| Small promo tile | 440×280 |
| Marquee promo tile | 1400×560 |
| Store icon | 128×128 PNG (96×96 artwork + 16 px transparent padding), in the extension zip |

Extension screenshots usually need context the browser can't capture headlessly
(the toolbar, a context menu, a side panel next to a page). Build them as HTML
that composites real captures of your panel/popup with drawn browser context,
and render with `render-html.mjs` at 1×.

## Social cards

| Asset | Size |
| --- | --- |
| Open Graph (`og:image`) | 1200×630 |
| X / Twitter `summary_large_image` | 1200×628 (OG size works) |

Render from HTML with `render-html.mjs`; keep text large, since cards are shown small.

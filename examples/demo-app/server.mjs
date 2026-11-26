// A tiny stand-in app for trying the skill and for its end-to-end test.
// It has the things real apps make hard to capture: a sign-in, a loading
// placeholder, a dev badge, frosted-glass bars, a fixed bottom dock, a menu
// that needs a click, a mobile layout keyed off the user agent, and a note
// that names third-party products.
//
//   node examples/demo-app/server.mjs     # http://localhost:4321  (PORT to change)
import http from "node:http";

const PORT = Number(process.env.PORT || 4321);
const NOTES = {
  lisbon: { title: "Lisbon · our long weekend", date: "15 Sept", body: "<p>One anchor a day, room to wander, and the practical details in one place.</p><h2>Day 1 · Alfama</h2><p>Tram 28 early, before the queues. Lunch at the miradouro, then the castle at golden hour.</p><h2>Day 2 · Belém</h2><p>Pastéis first, monastery second. The river walk back is longer than it looks.</p><h2>Day 3 · Sintra</h2><p>Train from Rossio. Pena before ten, Quinta da Regaleira after lunch.</p>" },
  research: { title: "Heat pump or new furnace?", date: "12 Oct", body: "<p>Four evenings of research, so we never have to redo it when the furnace finally dies.</p><p>I asked ChatGPT for a cost model and Claude to check its assumptions. Claude found the rebate the first answer missed.</p><table><tr><th>Option</th><th>Upfront</th><th>10-yr cost</th></tr><tr><td>Heat pump</td><td>$14,200</td><td>$21,900</td></tr><tr><td>Furnace + AC</td><td>$9,800</td><td>$24,300</td></tr></table>" },
  recipe: { title: "Lemon orzo with roasted tomatoes", date: "12 Sept", body: "<p>Weeknight dinner, twenty-five minutes, one pan.</p><ol><li>Roast the tomatoes hot until they split.</li><li>Toast the orzo in butter, then stock.</li><li>Lemon zest and parmesan off the heat.</li></ol>" },
};

const page = (title, body, { mobile = false } = {}) => `<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${title}</title><style>
  * { box-sizing: border-box; }
  html { min-height: 100%; background: linear-gradient(180deg, #f7f6f2, #eef1ee) fixed; }
  body { margin: 0; font: 16px/1.5 system-ui, -apple-system, sans-serif; color: #15181c; }
  .topbar { position: sticky; top: 0; z-index: 5; display: flex; align-items: center; gap: 10px; padding: 12px 20px; backdrop-filter: blur(14px) saturate(1.4); background: rgba(255,255,255,.62); border-bottom: 1px solid rgba(0,0,0,.06); }
  .mark { width: 26px; height: 26px; border-radius: 7px; background: conic-gradient(#2f6f5e 0 25%, #e0a23b 0 50%, #2f6f5e 0 75%, #15181c 0); }
  .topbar b { font-weight: 650; letter-spacing: -.01em; }
  .shell { max-width: 720px; margin: 0 auto; padding: 24px 20px 120px; }
  .note-row { display: block; padding: 16px 4px; border-bottom: 1px solid #e3e5e2; color: inherit; text-decoration: none; }
  .note-row strong { display: block; font-size: 17px; } .note-row span { color: #69717a; font-size: 14px; }
  h1 { font-size: 30px; letter-spacing: -.02em; line-height: 1.15; margin: 8px 0 4px; } .date { color: #69717a; font-size: 14px; }
  table { border-collapse: collapse; width: 100%; margin: 12px 0; } th, td { text-align: left; padding: 8px; border-bottom: 1px solid #e3e5e2; }
  .dock { position: fixed; left: 50%; bottom: 18px; transform: translateX(-50%); display: flex; gap: 6px; padding: 6px; border-radius: 999px; backdrop-filter: blur(14px); background: rgba(255,255,255,.7); box-shadow: 0 8px 30px rgba(0,0,0,.12); }
  .dock button, .dock a { border: 0; padding: 8px 14px; border-radius: 999px; background: transparent; font: inherit; color: inherit; text-decoration: none; cursor: pointer; }
  .dock .on { background: #2f6f5e; color: #fff; }
  .menu { position: fixed; left: 50%; bottom: 76px; transform: translateX(-50%); width: 280px; padding: 8px; border-radius: 14px; background: #fff; box-shadow: 0 18px 50px rgba(0,0,0,.18); display: none; }
  .menu.open { display: block; } .menu div { padding: 10px 12px; border-radius: 8px; } .menu div:hover { background: #f1f3f1; }
  #dev-badge { position: fixed; left: 12px; bottom: 12px; padding: 4px 10px; border-radius: 999px; background: #000; color: #fff; font-size: 12px; }
  .hero { max-width: 900px; margin: 0 auto; padding: 90px 24px; } .hero h1 { font-size: 52px; }
  .cta { display: inline-block; margin-top: 20px; padding: 12px 22px; border: 0; border-radius: 999px; background: #2f6f5e; color: #fff; font: 600 16px system-ui; cursor: pointer; }
  ${mobile ? ".topbar { padding-top: 14px; } .shell { padding: 16px 16px 120px; } h1 { font-size: 26px; }" : ""}
</style></head><body>${body}<div id="dev-badge">Dev · 2 issues</div></body></html>`;

const topbar = `<div class="topbar"><div class="mark"></div><b>Notebook</b></div>`;
const dock = (share) => `<div class="dock"><a class="on" href="/app">Notes</a><a href="/app">Search</a>${share ? `<button onclick="document.querySelector('.menu').classList.toggle('open')">Share</button>` : ""}</div>${share ? `<div class="menu" role="menu"><div>Copy link</div><div>Share with people…</div><div>Publish to your profile</div></div>` : ""}`;

const server = http.createServer((req, res) => {
  const url = new URL(req.url, `http://${req.headers.host}`);
  const signedIn = /(?:^|;\s*)session=demo/.test(req.headers.cookie ?? "");
  const mobile = /iPhone|Android/.test(req.headers["user-agent"] ?? "");
  const send = (status, html, headers = {}) => { res.writeHead(status, { "content-type": "text/html; charset=utf-8", ...headers }); res.end(html); };

  if (url.pathname === "/api/health") { res.writeHead(200, { "content-type": "application/json" }); return res.end('{"ok":true}'); }
  if (url.pathname === "/demo" && req.method === "POST") return send(303, "", { location: "/app", "set-cookie": "session=demo; Path=/; HttpOnly; SameSite=Lax" });
  if (url.pathname === "/") return send(200, page("Notebook", `${topbar}<section class="hero"><h1>Your best work deserves a place to live.</h1><p>Save what matters from any conversation. Find it, build on it, share the result.</p><form method="post" action="/demo"><button class="cta">Try the demo</button></form></section>`));
  if (!signedIn) return send(303, "", { location: "/" });

  if (url.pathname === "/app") {
    const rows = Object.entries(NOTES).map(([slug, n]) => `<a class="note-row" href="/note/${slug}"><strong>${n.title}</strong><span>${n.date}</span></a>`).join("");
    // Rows arrive after a beat, behind a placeholder, like a local-first app's first sync.
    return send(200, page("Notes", `${topbar}<main class="shell"><p id="loading">Loading your notebook…</p><div id="list"></div></main>${dock(false)}<script>setTimeout(() => { document.getElementById("loading").remove(); document.getElementById("list").innerHTML = ${JSON.stringify(rows)}; }, 1200)</script>`, { mobile }));
  }
  const m = url.pathname.match(/^\/note\/([\w-]+)$/);
  if (m && NOTES[m[1]]) {
    const n = NOTES[m[1]];
    return send(200, page(n.title, `${topbar}<main class="shell"><div class="date">${n.date}</div><h1>${n.title}</h1>${n.body}</main>${dock(true)}`, { mobile }));
  }
  send(404, page("Not found", `${topbar}<main class="shell"><h1>Not found</h1></main>`));
});
server.listen(PORT, () => console.log(`demo app on http://localhost:${PORT}`));

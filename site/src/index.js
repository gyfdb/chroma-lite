// Chroma Lite's site and downloads.
//
//   GET  /               the page, with downloads for the newest version
//   GET  /latest         the newest Windows installer (redirect)
//   GET  /latest/mac     the newest macOS installer (.dmg); /latest/linux the Linux one
//   GET  /latest.json    { version, windows, portable, mac, linux, sizes, published }
//   GET  /download/NAME  a file
//   PUT  /upload/NAME    store a file           (Authorization: Bearer <token>)
//   POST /publish        make a version latest   (Authorization: Bearer <token>)
//                        body: { version, windows, portable?, mac?, linux? }
//
// Static files (the screenshot, the icon) come from public/.

const LATEST = "latest.json";
const NAME = /^[A-Za-z0-9._-]{1,120}$/;
const PLATFORMS = ["windows", "portable", "mac", "linux"];
const REPO = "https://github.com/gyfdb/chroma-lite";

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname;
    const method = request.method;

    if (method === "PUT" && path.startsWith("/upload/")) {
      if (!(await authorized(request, env))) return text("Not allowed", 401);
      const name = decodeURIComponent(path.slice("/upload/".length));
      if (!NAME.test(name)) return text("Bad file name", 400);
      if (!request.body) return text("Empty upload", 400);
      const obj = await env.RELEASES.put(`files/${name}`, request.body, {
        httpMetadata: { contentType: contentType(name) },
      });
      return json({ name, size: obj.size });
    }

    if (method === "POST" && path === "/publish") {
      if (!(await authorized(request, env))) return text("Not allowed", 401);
      let body;
      try {
        body = await request.json();
      } catch {
        return text("Expected JSON", 400);
      }
      const { version } = body ?? {};
      if (typeof version !== "string" || !/^[0-9A-Za-z.+-]{1,40}$/.test(version)) return text("Bad version", 400);
      if (!body.windows) return text("windows is required", 400);
      const latest = { version, sizes: {}, published: new Date().toISOString() };
      for (const p of PLATFORMS) {
        const f = body[p];
        if (f === undefined || f === null) {
          latest[p] = null;
          continue;
        }
        if (typeof f !== "string" || !NAME.test(f)) return text(`Bad file name for ${p}`, 400);
        const head = await env.RELEASES.head(`files/${f}`);
        if (!head) return text(`${f} hasn't been uploaded`, 400);
        latest[p] = f;
        latest.sizes[p] = head.size;
      }
      await env.RELEASES.put(LATEST, JSON.stringify(latest), { httpMetadata: { contentType: "application/json" } });
      return json(latest);
    }

    if (method !== "GET" && method !== "HEAD") return text("Method not allowed", 405);

    if (path === "/latest.json") {
      const latest = await getLatest(env);
      return latest ? json(latest, { "cache-control": "public, max-age=60" }) : text("Nothing published yet", 404);
    }

    if (path === "/latest" || ["/latest/windows", "/latest/mac", "/latest/linux"].includes(path)) {
      const latest = await getLatest(env);
      const file = latest && latest[path.split("/")[2] ?? "windows"];
      if (!file) return text("Nothing published yet", 404);
      return Response.redirect(new URL(`/download/${file}`, url).toString(), 302);
    }

    if (path.startsWith("/download/")) {
      const name = decodeURIComponent(path.slice("/download/".length));
      if (!NAME.test(name)) return text("Not found", 404);
      const obj = await env.RELEASES.get(`files/${name}`);
      if (!obj) return text("Not found", 404);
      const headers = new Headers();
      obj.writeHttpMetadata(headers);
      headers.set("etag", obj.httpEtag);
      headers.set("content-length", String(obj.size));
      headers.set("content-disposition", `attachment; filename="${name}"`);
      headers.set("cache-control", "public, max-age=86400, immutable");
      return new Response(method === "HEAD" ? null : obj.body, { headers });
    }

    if (path === "/" || path === "/index.html") {
      const os = guessOs(request.headers.get("user-agent") ?? "");
      return new Response(page(await getLatest(env), os), {
        headers: { "content-type": "text/html; charset=utf-8", "cache-control": "public, max-age=60", vary: "user-agent" },
      });
    }

    return text("Not found", 404);
  },
};

// The upload token is checked by its SHA-256 (the UPLOAD_TOKEN_SHA256
// secret, hex), so the token itself only lives in the GitHub secret.
async function authorized(request, env) {
  const want = (env.UPLOAD_TOKEN_SHA256 ?? "").toLowerCase();
  const got = request.headers.get("authorization") ?? "";
  if (want.length !== 64 || !got.startsWith("Bearer ")) return false;
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(got.slice(7)));
  const hex = [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
  let diff = 0;
  for (let i = 0; i < 64; i++) diff |= hex.charCodeAt(i) ^ want.charCodeAt(i);
  return diff === 0;
}

async function getLatest(env) {
  const obj = await env.RELEASES.get(LATEST);
  return obj ? obj.json() : null;
}

function guessOs(ua) {
  if (/Windows/i.test(ua)) return "windows";
  if (/Mac OS X|Macintosh/i.test(ua) && !/iPhone|iPad/i.test(ua)) return "mac";
  if (/Linux|X11/i.test(ua) && !/Android/i.test(ua)) return "linux";
  return null;
}

function contentType(name) {
  if (name.endsWith(".exe")) return "application/vnd.microsoft.portable-executable";
  if (name.endsWith(".zip")) return "application/zip";
  if (name.endsWith(".dmg")) return "application/x-apple-diskimage";
  if (name.endsWith(".tar.gz")) return "application/gzip";
  return "application/octet-stream";
}

function json(value, extra = {}) {
  return new Response(JSON.stringify(value, null, 2), { headers: { "content-type": "application/json", ...extra } });
}

function text(body, status = 200) {
  return new Response(body, { status, headers: { "content-type": "text/plain; charset=utf-8" } });
}

function esc(s) {
  return String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
}

function mb(bytes) {
  return `${(bytes / 1048576).toFixed(1)} MB`;
}

const OS_NAME = { windows: "Windows", mac: "macOS", linux: "Linux" };

const FEATURES = [
  ["Stack your effects", "Layer fire, ripples and starlight with blend modes and opacity, and drag them into whatever order you like."],
  ["Lights off when you're away", "The keyboard and mouse go dark when your PC sits idle, and come back the moment you do."],
  ["Next to no CPU", "Simple effects run on the device itself at 0% CPU. Everything else streams at a frame rate you pick."],
  ["Reacts to you", "Keys flare, ripple, frost over or launch fireworks as you type. It only listens while a layer needs it."],
  ["No account, no cloud", "A small tray app. It talks to your devices over USB and nothing else."],
  ["Open source", "MIT licensed, on GitHub. Rust and Tauri underneath."],
];

const EFFECTS = [
  "Fire", "Solid", "Breathing", "Spectrum", "Wave", "Starlight", "Aurora", "Rain", "Lava lamp", "Candle", "Lightning",
  "Time of day", "Reactive", "Ripple", "Comet", "Shockwave", "Fireworks", "Frost", "Click charge",
];

// The page, in the same dark theme as Aalto Shimeji's.
function page(latest, os) {
  const dl = (file, label, primary = false) =>
    file ? `<a class="btn${primary ? " primary" : ""}" href="/download/${encodeURIComponent(file)}">${label}</a>` : "";
  const row = (name, meta, buttons) =>
    `<div class="row"><div><div class="os">${name}</div><div class="meta">${meta}</div></div><div class="btns">${buttons}</div></div>`;

  const mine = latest && os && latest[os];
  const hero = latest
    ? mine
      ? `<a class="btn primary big" href="/download/${encodeURIComponent(mine)}">Download for ${OS_NAME[os]}</a>
         <a class="btn big" href="#download">Other platforms</a>`
      : `<a class="btn primary big" href="#download">Download</a>`
    : `<a class="btn big" href="${REPO}">See it on GitHub</a>`;

  const downloads = latest
    ? `<div class="card">
         <div class="head"><span class="label">Latest version</span> <span class="version">${esc(latest.version)}</span> <span class="meta">released ${esc(latest.published.slice(0, 10))}</span></div>
         ${row("Windows", `10 and 11 · installer ${mb(latest.sizes?.windows ?? 0)}`, dl(latest.windows, "Download installer", os === "windows") + dl(latest.portable, "Portable zip"))}
         ${latest.mac ? row("macOS", `11 or later · Apple silicon and Intel · ${mb(latest.sizes?.mac ?? 0)}`, dl(latest.mac, "Download for Mac", os === "mac")) : ""}
         ${latest.linux ? row("Linux", `x86-64 · ${mb(latest.sizes?.linux ?? 0)}`, dl(latest.linux, "Download for Linux", os === "linux")) : ""}
         <div class="foot"><a href="/latest.json">latest.json</a> · <a href="${REPO}/releases">all releases</a></div>
       </div>
       <p class="note"><b>Windows:</b> the installer needs no admin, and finds and replaces older versions. Windows may warn that it isn't signed yet; choose <b>More info</b>, then <b>Run anyway</b>.</p>
       ${latest.mac ? `<p class="note"><b>macOS:</b> open the disk image and run Chroma Lite Setup. It isn't notarized yet, so the first time, right-click it and choose <b>Open</b>.</p>` : ""}
       ${latest.linux ? `<p class="note"><b>Linux:</b> unpack it and run <b>chroma-lite-setup</b>. It installs to your home folder and asks for your password once, to let the app reach your devices. Needs WebKitGTK 4.1.</p>` : ""}
       <p class="note">Close Razer Synapse before you start Chroma Lite; the two fight over the lights. Idle-off and the reactive effects are Windows-only for now.</p>`
    : `<p class="lead">Nothing's been published here yet. Check back soon, or grab a build from <a href="${REPO}/releases">GitHub</a>.</p>`;

  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Chroma Lite: lighting for Razer gear, without Synapse</title>
<meta name="description" content="A small tray app for the RGB on Razer keyboards and mice: layered effects, lights off when you're idle, and next to no CPU.">
<meta property="og:title" content="Chroma Lite">
<meta property="og:description" content="Lighting for Razer gear, without Synapse.">
<meta property="og:image" content="/screenshot.png">
<link rel="icon" href="/icon.png">
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body { margin: 0; background: #040302; color: #f7f4f3; font: 14px/1.5 Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif; letter-spacing: -0.01em; }
  main { max-width: 880px; margin: 0 auto; padding: 0 24px 72px; }
  nav { display: flex; align-items: center; justify-content: space-between; padding: 22px 0; }
  .brand { display: flex; align-items: center; gap: 10px; font-weight: 600; font-size: 16px; color: #fcf9f8; }
  .brand img { width: 26px; height: 26px; }
  .hero { padding: 40px 0 8px; text-align: center; }
  h1 { font-size: 44px; line-height: 50px; font-weight: 600; letter-spacing: -0.03em; margin: 0 0 14px; color: #fcf9f8; }
  h1 span { color: #f19772; }
  h2 { font-size: 22px; line-height: 28px; font-weight: 600; letter-spacing: -0.02em; margin: 64px 0 18px; color: #fcf9f8; }
  .lead { color: #a8a3a1; font-size: 17px; margin: 0 auto 26px; max-width: 560px; }
  .cta { display: flex; gap: 10px; justify-content: center; flex-wrap: wrap; }
  .stage { margin: 44px auto 0; max-width: 760px; }
  .board { background: #120f0d; border: 1px solid #353230; border-radius: 16px; padding: 22px 22px 14px; }
  canvas { display: block; width: 100%; height: auto; cursor: pointer; border-radius: 10px; }
  .chips { display: flex; gap: 6px; flex-wrap: wrap; justify-content: center; margin-top: 14px; }
  .chip { background: #1b1816; color: #d6d1cf; border: 0; box-shadow: inset 0 0 0 1px #353230; border-radius: 999px; padding: 6px 14px; font: inherit; cursor: pointer; }
  .chip:hover { background: #282524; }
  .chip.on { background: #aa4512; color: #fff; box-shadow: inset 0 0 0 1px #842d00; }
  .hint { color: #7d7876; font-size: 12px; text-align: center; margin-top: 10px; }
  .shot { margin-top: 18px; border-radius: 14px; overflow: hidden; border: 1px solid #353230; }
  .shot img { display: block; width: 100%; height: auto; }
  .grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(250px, 1fr)); gap: 12px; }
  .feature { background: #120f0d; border: 1px solid #282524; border-radius: 12px; padding: 18px 20px; }
  .feature h3 { margin: 0 0 6px; font-size: 15px; font-weight: 600; color: #fcf9f8; }
  .feature p { margin: 0; color: #a8a3a1; }
  .effects { display: flex; flex-wrap: wrap; gap: 6px; }
  .effects span { background: #1b1816; border-radius: 6px; padding: 4px 10px; color: #d6d1cf; font-size: 13px; }
  .card { background: #120f0d; border: 1px solid #353230; border-radius: 12px; overflow: hidden; }
  .head { padding: 16px 20px; border-bottom: 1px solid #282524; display: flex; gap: 10px; align-items: baseline; flex-wrap: wrap; }
  .row { display: flex; gap: 16px; align-items: center; justify-content: space-between; padding: 16px 20px; flex-wrap: wrap; border-bottom: 1px solid #282524; }
  .os { font-weight: 600; color: #fcf9f8; font-size: 15px; }
  .btns { display: flex; gap: 8px; flex-wrap: wrap; }
  .label { color: #a8a3a1; font-size: 12px; font-weight: 500; }
  .version { font: 600 24px/32px "Geist Mono", ui-monospace, monospace; color: #fcf9f8; }
  .meta { color: #a8a3a1; font-size: 13px; }
  .foot { background: #0d0a09; padding: 10px 20px; font-size: 13px; color: #a8a3a1; }
  a { color: #65e4ca; text-decoration: none; }
  a:hover { text-decoration: underline; }
  .btn { display: inline-block; padding: 9px 16px; border-radius: 8px; font-weight: 500; background: #1b1816; color: #f7f4f3; box-shadow: inset 0 0 0 1px #353230; }
  .btn:hover { background: #282524; text-decoration: none; }
  .btn.primary { background: #aa4512; color: #fff; box-shadow: inset 0 0 0 1px #842d00; }
  .btn.primary:hover { background: #bd5321; }
  .btn.big { padding: 12px 22px; font-size: 15px; }
  .note { color: #a8a3a1; font-size: 13px; margin-top: 14px; }
  b { color: #f7f4f3; font-weight: 500; }
  footer { margin-top: 64px; padding-top: 20px; border-top: 1px solid #282524; color: #7d7876; font-size: 13px; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 8px; }
  @media (max-width: 600px) { h1 { font-size: 34px; line-height: 40px; } }
</style></head>
<body><main>
  <nav>
    <div class="brand"><img src="/icon.png" alt="">Chroma Lite</div>
    <a href="${REPO}">GitHub</a>
  </nav>

  <section class="hero">
    <h1>Lighting for Razer gear,<br><span>without Synapse.</span></h1>
    <p class="lead">A small tray app for the RGB on Razer keyboards and mice. Stack effects, turn the lights off when you walk away, and keep your CPU for things that matter.</p>
    <div class="cta">${hero}</div>
    ${latest ? `<p class="meta" style="margin-top:12px">Version ${esc(latest.version)} · Windows, macOS and Linux · free and open source</p>` : ""}
  </section>

  <section class="stage">
    <div class="board">
      <canvas id="kb" width="1320" height="372" aria-label="A keyboard showing a lighting effect"></canvas>
      <div class="chips" id="fx" role="radiogroup" aria-label="Effect"></div>
    </div>
    <p class="hint">Type, or click the keys.</p>
    <div class="shot"><img src="/screenshot.png" alt="Chroma Lite's settings window: a live preview, the layer stack and the fire effect's settings" loading="lazy" width="1100" height="760"></div>
  </section>

  <h2>What it does</h2>
  <div class="grid">${FEATURES.map(([t, d]) => `<div class="feature"><h3>${t}</h3><p>${d}</p></div>`).join("")}</div>

  <h2>${EFFECTS.length} effects to stack</h2>
  <div class="effects">${EFFECTS.map((e) => `<span>${e}</span>`).join("")}</div>
  <p class="note">Built for the BlackWidow V4 X and the Cobra; other Razer devices that speak the same protocol can be added in the app.</p>

  <h2 id="download">Download</h2>
  ${downloads}

  <footer><span>Chroma Lite is made by Zae and isn't affiliated with Razer.</span><span><a href="${REPO}">Source</a> · MIT license</span></footer>
</main>
<script>${KEYBOARD_JS}</script>
</body></html>`;
}

// The live keyboard: a small version of the app's effects on a 6×22 grid.
const KEYBOARD_JS = String.raw`
(() => {
  const ROWS = 6, COLS = 22;
  const cv = document.getElementById("kb"), g = cv.getContext("2d");
  const slow = matchMedia("(prefers-reduced-motion: reduce)").matches;
  const lerp = (a, b, t) => a + (b - a) * t;
  const stops = (s, t) => { t = Math.max(0, Math.min(1, t)) * (s.length - 1); const i = Math.min(s.length - 2, t | 0), f = t - i; return [0, 1, 2].map(k => lerp(s[i][k], s[i + 1][k], f)); };
  const FIRE = [[0,0,0],[130,0,0],[255,45,0],[255,140,0],[255,230,120]];
  const AURORA = [[0,255,140],[0,170,255],[170,60,255]];
  const hash = (x, y, s) => { let h = (x * 374761393 + y * 668265263 + s * 2246822519) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const noise = (x, y, s) => { const xi = Math.floor(x), yi = Math.floor(y), fx = x - xi, fy = y - yi, u = fx * fx * (3 - 2 * fx), v = fy * fy * (3 - 2 * fy);
    const a = hash(xi, yi, s), b = hash(xi + 1, yi, s), c = hash(xi, yi + 1, s), d = hash(xi + 1, yi + 1, s); return lerp(lerp(a, b, u), lerp(c, d, u), v); };

  // a rough US layout, so typing lights the key you pressed
  const KEYS = ["", "\`1234567890-=", "qwertyuiop[]\\", "asdfghjkl;'", "zxcvbnm,./", " "];
  const OFFSET = [0, 0, 1.5, 1.8, 2.3, 10];
  const where = (k) => { k = k.toLowerCase(); for (let r = 1; r < KEYS.length; r++) { const i = KEYS[r].indexOf(k); if (i >= 0) return [r, Math.min(COLS - 1, Math.round(OFFSET[r] + i * (r === 5 ? 0 : 1)))]; } return null; };

  const heat = new Float32Array((ROWS + 2) * COLS);
  const field = new Float32Array(ROWS * COLS);
  let drops = [], rings = [], effect = "fire", t = 0, last = performance.now(), idle = 0;

  const EFFECTS = {
    fire(out) {
      for (let r = ROWS; r < ROWS + 2; r++) for (let c = 0; c < COLS; c++) { const i = r * COLS + c; heat[i] = Math.random() < 0.6 ? 0.75 + 0.25 * Math.random() : heat[i] * 0.55; }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const at = (rr, cc) => heat[Math.min(ROWS + 1, rr) * COLS + Math.max(0, Math.min(COLS - 1, cc))];
        heat[r * COLS + c] = Math.max(0, (at(r + 1, c - 1) + at(r + 1, c) + at(r + 1, c + 1) + at(r + 2, c)) / 4 - 0.16 * (0.4 + Math.random())) * 1.04;
        out(r, c, stops(FIRE, heat[r * COLS + c]), 1);
      }
    },
    aurora(out) {
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) {
        const x = c * 0.18, y = r * 0.35, sway = noise(x + t * 0.15, t * 0.05, 1), bend = (noise(x * 0.8 - t * 0.1, y * 0.6, 4) - 0.5) * 2.4;
        const band = 0.5 + 0.5 * Math.sin(x * 2.2 + t * 0.6 + 3 * sway + bend * y);
        const a = Math.max(0, Math.min(1, (band - 0.35) / 0.65)) ** 2 * (0.6 + 0.4 * noise(x * 3.5 - t * 0.5, y * 0.8 + t * 0.2, 2)) * (1 - 0.4 * r / 5);
        out(r, c, stops(AURORA, Math.max(0, Math.min(1, (noise(x * 0.6 + t * 0.07, y * 0.3 + 3, 3) - 0.25) * 2))), a);
      }
    },
    rain(out, dt) {
      for (let i = 0; i < field.length; i++) field[i] = Math.max(0, field[i] - dt * 11);
      if (Math.random() < dt * 14) drops.push({ c: (Math.random() * COLS) | 0, y: -0.5, v: 10 + 4 * Math.random() });
      for (const d of drops) { d.y += d.v * dt; const r = Math.floor(d.y); if (r >= 0 && r < ROWS) field[r * COLS + d.c] = 1;
        if (d.y >= ROWS) for (let cc = d.c - 1; cc <= d.c + 1; cc++) if (cc >= 0 && cc < COLS) field[(ROWS - 1) * COLS + cc] = Math.max(field[(ROWS - 1) * COLS + cc], cc === d.c ? 1 : 0.55); }
      drops = drops.filter(d => d.y < ROWS);
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out(r, c, [120, 180, 255], field[r * COLS + c] ** 1.3);
    },
    ripple(out) {
      if (idle > 1.2) { rings.push({ r: (Math.random() * ROWS) | 0, c: (Math.random() * COLS) | 0, age: 0 }); idle = 0; }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out(r, c, [120, 200, 255], 0);
    },
    starlight(out, dt) {
      for (let i = 0; i < field.length; i++) { field[i] = Math.max(0, field[i] - dt * 1.1); if (Math.random() < dt * 0.25) field[i] = 1; }
      for (let r = 0; r < ROWS; r++) for (let c = 0; c < COLS; c++) out(r, c, [255, 255, 255], Math.sin(field[r * COLS + c] * Math.PI) ** 2);
    },
  };
  const NAMES = { fire: "Fire", aurora: "Aurora", rain: "Rain", ripple: "Ripple", starlight: "Starlight" };

  const chips = document.getElementById("fx");
  for (const [k, label] of Object.entries(NAMES)) {
    const b = document.createElement("button");
    b.className = "chip" + (k === effect ? " on" : ""); b.textContent = label; b.setAttribute("role", "radio"); b.setAttribute("aria-checked", k === effect);
    b.onclick = () => { effect = k; field.fill(0); drops = []; rings = [];
      for (const o of chips.children) { o.classList.toggle("on", o === b); o.setAttribute("aria-checked", o === b); } };
    chips.appendChild(b);
  }

  // a press: fire flares, rain drops, stars twinkle, and anything else ripples
  const press = (r, c) => {
    idle = 0;
    if (effect === "fire") { for (let cc = c - 1; cc <= c + 1; cc++) if (cc >= 0 && cc < COLS) heat[r * COLS + cc] = 1; heat[(r + 1) * COLS + c] = 1; }
    else if (effect === "rain") drops.push({ c, y: r - 0.5, v: 12 });
    else if (effect === "starlight") field[r * COLS + c] = 1;
    else rings.push({ r, c, age: 0 });
  };
  // ripples sit on top of whatever's running, like a Ripple layer on Screen
  const ring = (r, c) => { let a = 0;
    for (const g of rings) { const d = Math.hypot((r - g.r) * 1.2, c - g.c), rad = g.age * 14; a = Math.max(a, Math.max(0, 1 - Math.abs(d - rad) / 1.4) * Math.max(0, 1 - rad / 26)); }
    return a; };
  addEventListener("keydown", (e) => { if (e.ctrlKey || e.metaKey || e.altKey) return; const p = where(e.key); if (p) press(p[0], p[1]); });
  cv.addEventListener("pointerdown", (e) => { const b = cv.getBoundingClientRect(); press(Math.min(ROWS - 1, ((e.clientY - b.top) / b.height * ROWS) | 0), Math.min(COLS - 1, ((e.clientX - b.left) / b.width * COLS) | 0)); });

  const W = cv.width / COLS, H = cv.height / ROWS, PAD = 5;
  const off = [62, 51, 43];
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000); last = now; t += dt; idle += dt;
    for (const x of rings) x.age += dt; rings = rings.filter(x => x.age * 14 < 26);
    g.clearRect(0, 0, cv.width, cv.height);
    EFFECTS[effect]((r, c, rgb, a) => {
      const w = ring(r, c);
      if (w > a * 0.8) { rgb = [lerp(rgb[0], 120, w), lerp(rgb[1], 200, w), lerp(rgb[2], 255, w)]; a = Math.max(a, w); }
      const k = Math.min(1, a * Math.max(rgb[0], rgb[1], rgb[2]) / 255 * 2.2);
      const col = [0, 1, 2].map(i => Math.round(lerp(off[i], rgb[i] * Math.min(1, a * 1.15), k)));
      g.fillStyle = "rgb(" + col + ")";
      g.shadowColor = "rgba(" + col + "," + (0.9 * k) + ")"; g.shadowBlur = 18 * k;
      g.beginPath(); g.roundRect(c * W + PAD, r * H + PAD, W - PAD * 2, H - PAD * 2, 8); g.fill();
    }, dt);
    g.shadowBlur = 0;
    if (slow) setTimeout(() => requestAnimationFrame(frame), 160); else requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
})();
`;

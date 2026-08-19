/**
 * Capture EN/JA product screenshots and social cards from the real local app.
 *
 * Prerequisite: `npm run cf:dev` is serving the latest `dist/` at 127.0.0.1:8787.
 * The map tiles used for the app screenshot come from the checked-in neutral grade-mode
 * master. Headless Chrome renders the current localized controls and sidebar on top, so
 * captures are deterministic even when third-party CARTO tiles are unavailable in CI.
 */
import { copyFile, mkdir, rm, writeFile } from "node:fs/promises";
import { spawn } from "node:child_process";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(fileURLToPath(new URL("..", import.meta.url)));
const SHOTS = join(ROOT, "public/shots");
const PUBLIC = join(ROOT, "public");
const TEMP = join("/private/tmp", `oneday-localized-images-${process.pid}`);
const CHROME = "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome";
const ORIGIN = "http://127.0.0.1:8787";
const DEBUG_PORT = 9327;
const APP_WIDTH = 2200;
const APP_HEIGHT = 1095;
const MAP_WIDTH = 1820;

const COPY = {
  en: {
    legend: "Best · Normal · Bad — neighborhood grades",
    subtitle:
      "Compare commute time, measured rent, safety, and convenience from your workplace or school.",
  },
  ja: {
    legend: "Best・Normal・Bad — 街の評価",
    subtitle: "勤務先や学校を基準に、通勤時間・実取引家賃・治安・生活利便性を比較。",
  },
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { stdio: "inherit" });
    child.once("error", reject);
    child.once("exit", (code) =>
      code === 0 ? resolve() : reject(new Error(`${command} exited with ${code}`))
    );
  });
}

class CdpClient {
  constructor(url) {
    this.socket = new WebSocket(url);
    this.nextId = 1;
    this.pending = new Map();
  }

  async open() {
    if (this.socket.readyState === WebSocket.OPEN) return;
    await new Promise((resolve, reject) => {
      this.socket.addEventListener("open", resolve, { once: true });
      this.socket.addEventListener("error", reject, { once: true });
    });
    this.socket.addEventListener("message", (event) => {
      const message = JSON.parse(event.data);
      if (!message.id) return;
      const request = this.pending.get(message.id);
      if (!request) return;
      this.pending.delete(message.id);
      if (message.error) request.reject(new Error(message.error.message));
      else request.resolve(message.result);
    });
  }

  send(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }

  close() {
    this.socket.close();
  }
}

async function waitForDebugger() {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    try {
      const response = await fetch(`http://127.0.0.1:${DEBUG_PORT}/json/version`);
      if (response.ok) return;
    } catch {
      // Chrome is still starting.
    }
    await sleep(100);
  }
  throw new Error("Chrome remote-debugging endpoint did not start");
}

async function newPage() {
  const response = await fetch(
    `http://127.0.0.1:${DEBUG_PORT}/json/new?${encodeURIComponent("about:blank")}`,
    { method: "PUT" }
  );
  if (!response.ok) throw new Error(`Chrome target creation failed: ${response.status}`);
  const target = await response.json();
  const client = new CdpClient(target.webSocketDebuggerUrl);
  await client.open();
  await client.send("Page.enable");
  await client.send("Runtime.enable");
  await client.send("Emulation.setEmulatedMedia", {
    features: [{ name: "prefers-color-scheme", value: "dark" }],
  });
  await client.send("Page.addScriptToEvaluateOnNewDocument", {
    source: 'try { localStorage.setItem("oneday.theme", "dark"); } catch {}',
  });
  return client;
}

async function setViewport(client, width, height) {
  await client.send("Emulation.setDeviceMetricsOverride", {
    width,
    height,
    deviceScaleFactor: 1,
    mobile: false,
  });
}

async function evaluate(client, expression, awaitPromise = false) {
  const result = await client.send("Runtime.evaluate", {
    expression,
    awaitPromise,
    returnByValue: true,
  });
  if (result.exceptionDetails) throw new Error(result.exceptionDetails.text);
  return result.result.value;
}

async function waitForApp(client) {
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(
      client,
      "Boolean(document.querySelector('.sidebar') && document.querySelector('.maplibregl-canvas') && document.querySelector('.picks'))"
    );
    if (ready) return;
    await sleep(125);
  }
  throw new Error("Localized app did not finish rendering");
}

async function capturePng(client) {
  const result = await client.send("Page.captureScreenshot", {
    format: "png",
    fromSurface: true,
    captureBeyondViewport: false,
  });
  return Buffer.from(result.data, "base64");
}

async function assertNoVisibleHangul(client, locale, page) {
  const leftovers = await evaluate(
    client,
    `document.body.innerText
      .replaceAll("한국어", "")
      .split("\\n")
      .map((line) => line.trim())
      .filter((line) => /[가-힣]/.test(line))`
  );
  if (leftovers.length > 0) {
    throw new Error(
      `Visible Hangul remains on ${locale} ${page}: ${JSON.stringify(leftovers.slice(0, 8))}`
    );
  }
}

async function validateMobileLanding(client, locale) {
  await setViewport(client, 390, 844);
  await client.send("Page.navigate", { url: `${ORIGIN}/${locale}/` });
  for (let attempt = 0; attempt < 80; attempt += 1) {
    const ready = await evaluate(
      client,
      "Boolean(document.querySelector('.hero-nav .locale-switcher') && document.querySelector('.hero-search .search-input'))"
    );
    if (ready) break;
    if (attempt === 79) throw new Error(`Mobile ${locale} landing did not finish rendering`);
    await sleep(125);
  }
  await sleep(300);
  await assertNoVisibleHangul(client, locale, "landing");

  const layout = await evaluate(
    client,
    `(() => {
      const viewport = document.documentElement.clientWidth;
      const selectors = [
        ".hero-nav",
        ".landing-mark",
        ".hero-actions",
        ".hero-nav .locale-switcher",
        ".hero-theme",
        ".hero-search .search-input"
      ];
      const boxes = selectors.map((selector) => {
        const rect = document.querySelector(selector).getBoundingClientRect();
        return { selector, left: rect.left, right: rect.right, width: rect.width };
      });
      return {
        viewport,
        scrollWidth: document.documentElement.scrollWidth,
        boxes,
        clipped: boxes.filter((box) => box.left < -0.5 || box.right > viewport + 0.5)
      };
    })()`
  );
  if (layout.viewport !== 390 || layout.scrollWidth > 390 || layout.clipped.length > 0) {
    throw new Error(`Mobile ${locale} layout overflow: ${JSON.stringify(layout)}`);
  }
  console.log(
    `[mobile:${locale}] ${layout.viewport}px viewport, ${layout.scrollWidth}px document, controls fit`
  );
}

async function captureLocalizedApp(client, locale) {
  await setViewport(client, APP_WIDTH, APP_HEIGHT);
  const destinationName = locale === "ja" ? "カンナム駅" : "Gangnam Station";
  const destination = encodeURIComponent(`${destinationName}@37.497522,127.027783`);
  await client.send("Page.navigate", { url: `${ORIGIN}/${locale}/?to=${destination}` });
  await waitForApp(client);
  await sleep(1200);
  await assertNoVisibleHangul(client, locale, "app");

  await client.send("Emulation.setDefaultBackgroundColorOverride", {
    color: { r: 0, g: 0, b: 0, a: 0 },
  });
  await evaluate(
    client,
    `(() => {
      const style = document.createElement("style");
      style.textContent = [
        "html, body, #root, .app, .map-wrap, .map { background: transparent !important; }",
        ".maplibregl-canvas { opacity: 0 !important; }"
      ].join("\\n");
      document.head.appendChild(style);
    })()`
  );
  const overlay = await capturePng(client);
  const overlayData = `data:image/png;base64,${overlay.toString("base64")}`;

  const composite = await evaluate(
    client,
    `(async () => {
      const load = (src) => new Promise((resolve, reject) => {
        const image = new Image();
        image.onload = () => resolve(image);
        image.onerror = reject;
        image.src = src;
      });
      const [map, overlay] = await Promise.all([
        load(${JSON.stringify(`${ORIGIN}/shots/mode-grade.webp`)}),
        load(${JSON.stringify(overlayData)})
      ]);
      const canvas = document.createElement("canvas");
      canvas.width = ${APP_WIDTH};
      canvas.height = ${APP_HEIGHT};
      const context = canvas.getContext("2d");
      context.fillStyle = "#111318";
      context.fillRect(0, 0, canvas.width, canvas.height);
      const sourceHeight = map.width * (${APP_HEIGHT} / ${MAP_WIDTH});
      const sourceY = Math.max(0, (map.height - sourceHeight) / 2);
      context.drawImage(map, 0, sourceY, map.width, sourceHeight, 0, 0, ${MAP_WIDTH}, ${APP_HEIGHT});
      context.drawImage(overlay, 0, 0);
      return canvas.toDataURL("image/png").split(",")[1];
    })()`,
    true
  );
  const png = join(TEMP, `app-full-${locale}.png`);
  await writeFile(png, Buffer.from(composite, "base64"));
  return png;
}

async function captureSocialCard(client, locale) {
  await setViewport(client, 1200, 630);
  const copy = COPY[locale];
  const html = `
    <style>
      * { box-sizing: border-box; }
      html, body { width: 1200px; height: 630px; margin: 0; overflow: hidden; background: #111318; }
      body { font-family: -apple-system, BlinkMacSystemFont, "Apple SD Gothic Neo", "Noto Sans", sans-serif; color: white; }
      img, .scrim { position: absolute; inset: 0; width: 100%; height: 100%; object-fit: cover; }
      .scrim { background: linear-gradient(180deg, rgba(10,12,16,.1), rgba(10,12,16,.2) 38%, rgba(10,12,16,.94)); }
      .legend { position: absolute; left: 68px; top: 55px; padding: 10px 18px; border-radius: 999px; background: rgba(12,14,19,.72); font-size: 20px; font-weight: 700; }
      .legend i { display: inline-block; width: 9px; height: 9px; margin: 0 3px 2px 6px; border-radius: 50%; }
      .copy { position: absolute; left: 68px; right: 60px; bottom: 64px; }
      h1 { margin: 0 0 15px; font-size: 62px; line-height: 1.05; letter-spacing: -2.4px; }
      p { max-width: 1020px; margin: 0; font-size: 25px; line-height: 1.45; font-weight: 600; }
    </style>
    <img src="${ORIGIN}/shots/hero-map.jpg" alt="" />
    <div class="scrim"></div>
    <div class="legend"><i style="background:#2e9e5b"></i><i style="background:#e0a52b"></i><i style="background:#c2504a"></i>${copy.legend}</div>
    <div class="copy"><h1>I Don’t Know Seoul</h1><p>${copy.subtitle}</p></div>`;
  await evaluate(
    client,
    `(async () => {
      document.open();
      document.write(${JSON.stringify(html)});
      document.close();
      await Promise.all([...document.images].map((image) => image.decode()));
      await document.fonts.ready;
    })()`,
    true
  );
  const png = join(TEMP, `og-image-${locale}.png`);
  await writeFile(png, await capturePng(client));
  return png;
}

async function writeAppDerivatives(locale, png) {
  await run("cwebp", ["-quiet", "-q", "84", png, "-o", join(SHOTS, `app-full-${locale}.webp`)]);
  await run("cwebp", [
    "-quiet",
    "-q",
    "82",
    "-resize",
    "1200",
    "597",
    png,
    "-o",
    join(SHOTS, `app-full-sm-${locale}.webp`),
  ]);
  await run("sips", [
    "-s",
    "format",
    "jpeg",
    "-s",
    "formatOptions",
    "86",
    "-Z",
    "1400",
    png,
    "--out",
    join(SHOTS, `app-full-${locale}.jpg`),
  ]);
}

async function copyNeutralModeImages(locale) {
  for (const mode of ["grade", "commute"]) {
    for (const suffix of [".webp", "-sm.webp", ".jpg"]) {
      await copyFile(
        join(SHOTS, `mode-${mode}${suffix}`),
        join(SHOTS, `mode-${mode}${suffix.replace(".", `-${locale}.`)}`)
      );
    }
  }
}

async function main() {
  if (!(await fetch(`${ORIGIN}/en/`)).ok) {
    throw new Error("Start `npm run cf:dev` before capturing localized images");
  }
  await mkdir(TEMP, { recursive: true });
  const chrome = spawn(
    CHROME,
    [
      "--headless=new",
      "--no-first-run",
      "--no-default-browser-check",
      "--disable-background-networking",
      "--disable-component-update",
      `--remote-debugging-port=${DEBUG_PORT}`,
      `--user-data-dir=${join(TEMP, "chrome-profile")}`,
      "about:blank",
    ],
    { stdio: "ignore" }
  );

  try {
    await waitForDebugger();
    for (const locale of ["en", "ja"]) {
      const client = await newPage();
      try {
        const appPng = await captureLocalizedApp(client, locale);
        await writeAppDerivatives(locale, appPng);
        await copyNeutralModeImages(locale);
        await validateMobileLanding(client, locale);
        const ogPng = await captureSocialCard(client, locale);
        await run("sips", [
          "-s",
          "format",
          "jpeg",
          "-s",
          "formatOptions",
          "88",
          ogPng,
          "--out",
          join(PUBLIC, `og-image-${locale}.jpg`),
        ]);
      } finally {
        client.close();
      }
    }
  } finally {
    chrome.kill("SIGTERM");
    await rm(TEMP, { recursive: true, force: true });
  }
  console.log("Localized EN/JA screenshots and social cards generated.");
}

await main();

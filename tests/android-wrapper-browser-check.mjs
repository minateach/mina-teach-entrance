import assert from "node:assert/strict";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;

async function navigate(path, ready) {
  await command("Page.navigate", { url: `${origin}${path}` });
  await waitFor(`location.href===${JSON.stringify(origin + path)} && document.readyState==="complete" && (${ready})`);
}

try {
  const manifestResponse = await fetch(`${origin}/manifest.webmanifest`);
  assert.equal(manifestResponse.status, 200);
  const webManifest = await manifestResponse.json();
  assert.equal(webManifest.name, "MINA TEACH AI");
  assert.equal(webManifest.description, "Dhaloota beekumsa omishuudha.");
  for (const icon of webManifest.icons.filter(icon => ["192x192", "512x512"].includes(icon.sizes))) {
    assert.equal((await fetch(new URL(icon.src, origin))).status, 200, `manifest icon ${icon.sizes} loads`);
  }

  const privacy = await fetch(`${origin}/privacy/`);
  assert.equal(privacy.status, 200);
  assert.match(await privacy.text(), /minaseyfufa@gmail\.com/);
  const assetLinks = await fetch(`${origin}/.well-known/assetlinks.json`);
  assert.equal(assetLinks.status, 404, "no unverified signing fingerprint is exposed as a valid association");

  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await command("Emulation.setUserAgentOverride", {
    userAgent: "Mozilla/5.0 (Linux; Android 13; Pixel 7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Mobile Safari/537.36",
  });

  await navigate("/", 'document.querySelector(".site-brand h1")?.textContent==="MINA TEACH AI"');
  assert.equal(await evaluate('document.querySelector("header > p")?.textContent'), "Dhaloota beekumsa omishuudha.");
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "home page fits Android viewport");

  await navigate("/learning/?grade=10&subject=History", 'document.getElementById("subjects")?.children.length>0');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "learning page fits Android viewport");

  await navigate("/assistant/", 'document.getElementById("chatForm")!==null');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "assistant fits Android viewport");

  await navigate("/account/sign-in", 'document.getElementById("root")!==null');
  assert.equal(await evaluate('document.documentElement.scrollWidth<=innerWidth'), true, "account sign-in page fits Android viewport");
  assert.deepEqual(browser.exceptions, [], "no uncaught browser exceptions");
  console.log("PASS: Android-sized Chrome checks for web manifest, icon URLs, privacy page, home, learning, assistant, and account sign-in shell.");
  console.log("LIMITATION: This emulates Android Chrome; no physical device, signed TWA, authorized account, or Play Console test was available.");
} finally {
  await browser.close();
}

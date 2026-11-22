import assert from "node:assert/strict";
import {browserDriver} from "./browser-driver.mjs";

if(!process.env.REPLIT_DEV_DOMAIN)throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin=`https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser=await browserDriver();
const {command,evaluate,waitFor}=browser;

async function open(path,title) {
  await command("Page.navigate",{url:origin+path});
  await waitFor(`location.href===${JSON.stringify(origin+path)} && document.readyState==="complete" && document.querySelector("main h1")?.textContent.includes(${JSON.stringify(title)})`);
}

try {
  await command("Emulation.setDeviceMetricsOverride",{width:390,height:844,deviceScaleFactor:1,mobile:true});
  await open("/privacy/","Privacy Policy");
  assert.equal(await evaluate('document.querySelectorAll("main h1").length'),1);
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Policy pages"] a[aria-current="page"]')?.textContent`),"Privacy Policy");
  assert.equal(await evaluate('document.querySelector(".skip-link").getAttribute("href")'),"#main");
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,"privacy policy fits a mobile viewport");
  await evaluate('document.querySelector(".skip-link").focus()');
  assert.equal(await evaluate('document.activeElement.classList.contains("skip-link")'),true,"keyboard users can focus the skip link");
  assert.equal(await evaluate(`document.querySelector('a[href="/account/"]')?.textContent`),"Account");

  await open("/terms/","Terms of Use");
  assert.equal(await evaluate('document.querySelectorAll("main h1").length'),1);
  assert.equal(await evaluate(`document.querySelector('nav[aria-label="Policy pages"] a[aria-current="page"]')?.textContent`),"Terms of Use");
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,"terms fit a mobile viewport");
  assert.ok(await evaluate(`document.querySelector('a[href="/privacy/"]')`));
  assert.ok(await evaluate(`document.querySelector('a[href="mailto:minaseyfufa@gmail.com"]')`));

  await command("Emulation.setDeviceMetricsOverride",{width:1280,height:900,deviceScaleFactor:1,mobile:false});
  await new Promise(resolve=>setTimeout(resolve,100));
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"),true,"terms fit a desktop viewport");
  await command("Page.navigate",{url:origin+"/"});
  await waitFor(`location.href===${JSON.stringify(origin+"/")} && document.querySelector("footer a[href='/terms/']")`);
  assert.ok(await evaluate(`document.querySelector('footer a[href="/privacy/"]')`));
  assert.ok(await evaluate(`document.querySelector('footer a[href="/terms/"]')`));
  assert.deepEqual(browser.exceptions,[],"public policy routes have no browser exceptions");
  console.log("PASS: public privacy/terms routes, accessible page landmarks, internal links, mail contact, and mobile/desktop layout.");
  console.log("SCOPE: signed-in account controls were source-audited and built; the browser test does not sign in or change user data.");
} finally {
  await browser.stopIntercept().catch(()=>{});
  await browser.close();
}

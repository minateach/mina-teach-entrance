import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const tempDirectory = await mkdtemp(join(tmpdir(), "mina-image-test-"));
const imagePath = join(tempDirectory, "sample.png");
const imageBytes = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 44, g: 113, b: 204 } },
}).png().toBuffer();
await sharp(imageBytes).png().toFile(imagePath);
const imageDataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
const assistantPayloads = [];
const studioPayloads = [];

async function setFile(selector) {
  const { root } = await command("DOM.getDocument", { depth: -1 });
  const { nodeId } = await command("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `Expected file input ${selector}`);
  await command("DOM.setFileInputFiles", { files: [imagePath], nodeId });
}

try {
  await command("DOM.enable");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await browser.intercept(async request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/assistant/status") {
      return { body: { provider: "gemini", configured: true, model: "gemini-3.5-flash-lite" } };
    }
    if (url.pathname === "/api/assistant/chat") {
      const payload = JSON.parse(request.postData || "{}");
      assistantPayloads.push({
        message: payload.message,
        imageDataUrl: payload.imageDataUrl,
        language: payload.language,
      });
      return {
        body: {
          answer: assistantPayloads.length === 1 ? "I can see a blue study image." : "The follow-up image question is understood.",
          imageAnalyzed: Boolean(payload.imageDataUrl),
          webResearch: {
            searched: false,
            sourceCount: 0,
            sources: [],
            notice: payload.imageDataUrl
              ? "The uploaded image was sent for analysis. No web search was performed."
              : "No web search was performed; this answer is from general model knowledge.",
          },
        },
      };
    }
    return { status: 404, body: { error: { message: "Unexpected assistant request" } } };
  }, ["*api/assistant/status", "*api/assistant/chat"]);

  await command("Page.navigate", { url: `${origin}/assistant/` });
  await waitFor('document.readyState==="complete" && document.getElementById("galleryInput")');
  await waitFor('document.getElementById("statusText").textContent==="Gemini key configured"');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "assistant fits a phone viewport");

  await setFile("#galleryInput");
  await waitFor('!document.getElementById("imageAttachmentPreview").hidden');
  assert.equal(await evaluate("document.getElementById('sendButton').disabled"), false, "image-only submission is enabled");
  await evaluate("document.getElementById('chatForm').requestSubmit()");
  await waitFor('Array.from(document.querySelectorAll(".message-content")).some(element=>element.textContent.includes("I can see a blue study image."))');
  await waitFor('document.querySelector(".message-image-preview")');
  assert.match(assistantPayloads[0].imageDataUrl, /^data:image\/jpeg;base64,/);
  assert.equal(assistantPayloads[0].language, "auto");
  assert.equal(await evaluate("localStorage.getItem('mina-teach.assistant.conversations.v1').includes('data:image')"), false, "photo bytes stay out of localStorage");

  await evaluate("document.getElementById('messageInput').value='What details are visible?';document.getElementById('messageInput').dispatchEvent(new Event('input'));document.getElementById('chatForm').requestSubmit()");
  await waitFor('document.querySelectorAll(".message-content").length >= 4');
  assert.match(assistantPayloads[1].imageDataUrl, /^data:image\/jpeg;base64,/, "follow-up sends the same-device image context");
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "chat remains within phone width after the image preview");

  await evaluate("document.getElementById('newConversationAlt').click()");
  await setFile("#galleryInput");
  await waitFor('!document.getElementById("imageAttachmentPreview").hidden');
  await evaluate("document.getElementById('removeSelectedImage').click()");
  assert.equal(await evaluate("document.getElementById('imageAttachmentPreview').hidden"), true, "selected image can be removed before sending");
  assert.equal(await evaluate("document.getElementById('sendButton').disabled"), true, "empty chat cannot send after image removal");
  assert.deepEqual(browser.exceptions, []);
  await browser.stopIntercept();

  await browser.intercept(async request => {
    const url = new URL(request.url);
    if (url.pathname !== "/api/image-studio/process") return { status: 404, body: { error: { message: "Unexpected image request" } } };
    const payload = JSON.parse(request.postData || "{}");
    studioPayloads.push({
      mode: payload.mode,
      prompt: payload.prompt,
      imageDataUrl: payload.imageDataUrl,
    });
    return {
      body: {
        imageDataUrl,
        mimeType: "image/png",
        width: studioPayloads.length === 1 ? 320 : 321,
        height: 240,
        size: "1024x1024",
        model: "MiniMax-H3-Image",
      },
    };
  }, ["*api/image-studio/process"]);
  await command("Page.navigate", { url: `${origin}/image-studio/` });
  await waitFor('document.readyState==="complete" && document.getElementById("runButton")');
  await setFile("#galleryInput");
  await waitFor('!document.getElementById("sourcePreview").hidden');
  await evaluate("document.getElementById('promptInput').value='Improve the lighting while preserving the subject';document.getElementById('promptInput').dispatchEvent(new Event('input'));document.getElementById('runButton').click()");
  await waitFor('!document.getElementById("resultPreview").hidden');
  assert.equal(studioPayloads[0].mode, "edit");
  assert.match(studioPayloads[0].imageDataUrl, /^data:image\/jpeg;base64,/);
  assert.match(studioPayloads[0].prompt, /preserving the subject/);
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "Image Studio fits the phone viewport");

  await evaluate(`window.__downloadedImage = "";const originalAnchorClick = HTMLAnchorElement.prototype.click;HTMLAnchorElement.prototype.click = function(){window.__downloadedImage=this.download;};document.getElementById("downloadButton").click();`);
  assert.equal(await evaluate("window.__downloadedImage"), "mina-teach-edited-image.jpg", "download action creates the expected file");
  await evaluate(`window.__imageShareCount = 0;Object.defineProperty(navigator,"canShare",{configurable:true,value:()=>true});Object.defineProperty(navigator,"share",{configurable:true,value:async()=>{window.__imageShareCount+=1;}});document.getElementById("shareButton").click();`);
  await waitFor("window.__imageShareCount===1");

  await evaluate("document.getElementById('createModeTab').click()");
  assert.equal(await evaluate("document.getElementById('sourcePanel').hidden"), true, "create mode hides the unused source panel");
  await evaluate("document.getElementById('promptInput').value='Create a simple science illustration';document.getElementById('promptInput').dispatchEvent(new Event('input'));document.getElementById('runButton').click()");
  await waitFor('document.getElementById("previewState").textContent.startsWith("321")');
  assert.equal(studioPayloads[1].mode, "generate");
  assert.equal(studioPayloads[1].imageDataUrl, undefined, "generation sends no reference image");
  await command("Emulation.setDeviceMetricsOverride", {
    width: 1440, height: 1000, deviceScaleFactor: 1, mobile: false,
  });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "Image Studio fits desktop width");
  assert.deepEqual(browser.exceptions, []);
  console.log("PASS: Android-sized assistant photo upload, local preview/removal, private local history, follow-up image context, Image Studio editing and generation, download/share actions, and mobile/desktop overflow checks.");
} finally {
  await browser.close();
  await rm(tempDirectory, { recursive: true, force: true });
}

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import sharp from "sharp";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const tempDirectory = await mkdtemp(join(tmpdir(), "mina-image-test-"));
const imagePath = join(tempDirectory, "sample.png");
const videoPath = join(tempDirectory, "sample.webm");
const imageBytes = await sharp({
  create: { width: 320, height: 240, channels: 3, background: { r: 44, g: 113, b: 204 } },
}).png().toBuffer();
await sharp(imageBytes).png().toFile(imagePath);
execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=blue:s=160x90:d=2", "-an", "-c:v", "libvpx", "-crf", "35", "-b:v", "150k", "-y", videoPath]);
const imageDataUrl = `data:image/png;base64,${imageBytes.toString("base64")}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
const assistantPayloads = [];
const studioPayloads = [];

async function setFile(selector, path = imagePath) {
  const { root } = await command("DOM.getDocument", { depth: -1 });
  const { nodeId } = await command("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `Expected file input ${selector}`);
  await command("DOM.setFileInputFiles", { files: [path], nodeId });
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
  await waitFor('document.getElementById("statusText").textContent==="Gemini key saved"');
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
  await command("Network.emulateNetworkConditions", {offline:true,latency:0,downloadThroughput:0,uploadThroughput:0});
  await waitFor("navigator.onLine===false");
  await evaluate("window.__originalCreateImageBitmap=window.createImageBitmap;window.createImageBitmap=undefined");
  await setFile("#galleryInput");
  await waitFor('!document.getElementById("sourcePreview").hidden');
  assert.match(await evaluate("document.getElementById('sourcePreview').src"), /^blob:/, "browser image-decoder fallback previews the selected photo");
  assert.match(await evaluate("document.getElementById('previewState').textContent"), /\.jpg/,"image preparation normalizes a supported photo to JPEG");
  await evaluate("document.getElementById('offline-mode-toggle').checked=true;document.getElementById('offline-mode-toggle').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('rotateLocalImage').click();document.getElementById('grayscaleLocalImage').click();document.getElementById('applyLocalImageEdits').click()");
  await waitFor('document.getElementById("studioStatus").textContent.includes("Offline photo edit is ready")');
  assert.match(await evaluate("document.getElementById('previewState').textContent"),/Edited on this device/);
  assert.equal(studioPayloads.length,0,"basic image edit does not call the AI service while offline");
  await evaluate("window.createImageBitmap=window.__originalCreateImageBitmap");
  await command("Network.emulateNetworkConditions", {offline:false,latency:0,downloadThroughput:10_000_000,uploadThroughput:10_000_000});
  await waitFor("navigator.onLine===true");
  await evaluate("document.getElementById('offline-mode-toggle').checked=false;document.getElementById('offline-mode-toggle').dispatchEvent(new Event('change',{bubbles:true}))");
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

  const videoSupported=await evaluate("Boolean((HTMLMediaElement.prototype.captureStream||HTMLMediaElement.prototype.mozCaptureStream)&&typeof MediaRecorder==='function'&&['video/webm;codecs=vp9,opus','video/webm;codecs=vp8,opus','video/webm'].some(type=>MediaRecorder.isTypeSupported(type)))");
  if(videoSupported){
    await setFile("#videoFile", videoPath);
    await waitFor('(Number.isFinite(document.getElementById("videoPreview").duration) && document.getElementById("videoPreview").duration>0) || document.getElementById("videoStatus").dataset.state==="error"');
    const videoMetadata=await evaluate("JSON.stringify({duration:document.getElementById('videoPreview').duration,error:document.getElementById('videoPreview').error?.message,status:document.getElementById('videoStatus').textContent,source:document.getElementById('videoPreview').src.slice(0,70),currentSource:document.getElementById('videoPreview').currentSrc.slice(0,70),file:document.getElementById('videoFile').files?.[0]?.name,type:document.getElementById('videoFile').files?.[0]?.type,size:document.getElementById('videoFile').files?.[0]?.size})");
    assert.ok(await evaluate('Number.isFinite(document.getElementById("videoPreview").duration) && document.getElementById("videoPreview").duration>0'),`generated test video could not load: ${videoMetadata}`);
    await evaluate("document.getElementById('videoTrimEnd').value='0.5';document.getElementById('videoTrimEnd').dispatchEvent(new Event('input',{bubbles:true}))");
    const trimButton=await evaluate("(()=>{const b=document.getElementById('trimVideo');b.scrollIntoView({block:'center'});const r=b.getBoundingClientRect();return {x:r.x+r.width/2,y:r.y+r.height/2}})()");
    await command("Input.dispatchMouseEvent",{type:"mousePressed",x:trimButton.x,y:trimButton.y,button:"left",clickCount:1});
    await command("Input.dispatchMouseEvent",{type:"mouseReleased",x:trimButton.x,y:trimButton.y,button:"left",clickCount:1});
    await waitFor('!document.getElementById("downloadVideo").hidden || document.getElementById("videoStatus").dataset.state==="error"');
    const trimStatus=await evaluate("document.getElementById('videoStatus').textContent");
    assert.equal(await evaluate('!document.getElementById("downloadVideo").hidden'),true,`offline trim did not export: ${trimStatus}`);
    assert.match(trimStatus,/Trim complete/,"offline video clip is exported in the browser");
  } else {
    assert.match(await evaluate("document.getElementById('videoStatus').textContent"),/does not support offline video trimming/);
  }

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
  console.log(`PASS: Android-sized assistant photo upload, offline local photo edits, ${videoSupported?"offline video trim":"video capability detection"}, private local history, follow-up image context, AI Image Studio editing and generation, download/share actions, and mobile/desktop overflow checks.`);
} finally {
  await browser.close();
  await rm(tempDirectory, { recursive: true, force: true });
}

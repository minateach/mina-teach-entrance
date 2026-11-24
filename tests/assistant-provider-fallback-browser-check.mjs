import assert from "node:assert/strict";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
let statusRequests = 0;
let chatRequests = 0;
const payloads = [];
const question = "What is the latest official study guidance?";

try {
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await browser.intercept(async request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/assistant/status") {
      statusRequests += 1;
      if (statusRequests === 1) {
        return { status: 503, body: { error: { code: "STATUS_UNAVAILABLE", message: "Temporary backend failure." } } };
      }
      return {
        body: {
          configured: true,
          minimaxConfigured: true,
          minimaxModel: "MiniMax-M3.1-Flash",
          geminiConfigured: true,
          geminiConnection: "unavailable",
          geminiAvailable: false,
          geminiLastErrorCode: "GEMINI_TEMPORARILY_UNAVAILABLE",
        },
      };
    }
    if (url.pathname === "/api/assistant/chat") {
      chatRequests += 1;
      payloads.push(JSON.parse(request.postData || "{}"));
      if (chatRequests === 1) {
        await new Promise(resolve => setTimeout(resolve, 200));
        return {
          status: 503,
          body: {
            error: {
              code: "DUAL_PROVIDER_UNAVAILABLE",
              message: "Gemini and MiniMax could not answer this question. Your message is saved; check the provider connection and try again. No answer was generated.",
            },
          },
        };
      }
      return {
        body: {
          answer: "A real provider fallback would be shown here.",
          provider: "minimax",
          providerNotice: "Gemini could not complete a web search. This answer is not web-verified.",
          webResearch: {
            searched: false,
            sourceCount: 0,
            sources: [],
            notice: "No web search was performed; current information is not verified.",
          },
        },
      };
    }
    return { status: 404, body: { error: { message: "Unexpected request" } } };
  }, ["*api/assistant/status", "*api/assistant/chat"]);

  await command("Page.navigate", { url: `${origin}/assistant/` });
  await waitFor('document.readyState==="complete" && document.getElementById("sendButton")');
  await waitFor('document.getElementById("statusText").textContent==="Status unavailable"');
  assert.match(await evaluate('document.getElementById("statusBanner").textContent'), /saved conversations are safe/);
  assert.doesNotMatch(await evaluate('document.getElementById("statusBanner").textContent'), /Failed to fetch/);
  assert.ok(await evaluate('document.querySelector(".status-retry")'), "a failed health check offers Check again");

  await evaluate('document.querySelector(".status-retry").click()');
  await waitFor('document.getElementById("statusText").textContent==="MiniMax connected"');
  assert.equal(statusRequests, 2, "Check again sent another status request");
  assert.match(await evaluate('document.getElementById("statusBanner").textContent'), /Gemini temporarily unavailable/);

  await evaluate(`document.getElementById("messageInput").value=${JSON.stringify(question)};document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()`);
  await waitFor('document.querySelector(".typing-indicator") && document.getElementById("sendButton").disabled');
  await waitFor('document.querySelector(".error-card .retry-button")');
  assert.match(await evaluate('document.querySelector(".message-content").textContent'), /latest official study guidance/);
  assert.match(await evaluate('localStorage.getItem("mina-teach.assistant.conversations.v1")'), /latest official study guidance/);

  await evaluate('document.querySelector(".error-card .retry-button").click()');
  await waitFor('Array.from(document.querySelectorAll(".message-content")).some(node=>node.textContent.includes("A real provider fallback would be shown here."))');
  assert.equal(payloads.length, 2, "Try again made a second backend request");
  assert.equal(payloads[0].message, question);
  assert.equal(payloads[1].message, question);
  assert.equal(await evaluate('document.querySelectorAll(".message-content").length'), 2, "retry does not duplicate the saved user question");
  assert.equal(await evaluate('document.querySelector(".provider-badge").textContent'), "MiniMax fallback");
  assert.match(await evaluate('document.querySelector(".message-research").textContent'), /No web search was performed/);
  assert.equal(await evaluate('document.getElementById("statusText").textContent'), "MiniMax fallback");
  assert.deepEqual(browser.exceptions, []);
  console.log("PASS: status failure is understandable, Check again repeats the request, chat loading/error/success states work, and Try again resends without losing or duplicating the question.");
} finally {
  await browser.stopIntercept().catch(() => {});
  await browser.close();
}

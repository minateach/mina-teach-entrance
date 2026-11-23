import assert from "node:assert/strict";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
let answerIndex = 0;
const requests = [];

try {
  await command("Emulation.setDeviceMetricsOverride", {
    width: 390, height: 844, deviceScaleFactor: 1, mobile: true,
  });
  await browser.intercept(async (request) => {
    const url = new URL(request.url);
    if (url.pathname === "/api/assistant/status") {
      return { body: { provider: "gemini", configured: true, model: "gemini-3.5-flash-lite" } };
    }
    if (url.pathname === "/api/assistant/chat") {
      requests.push(JSON.parse(request.postData || "{}"));
      answerIndex += 1;
      if (answerIndex === 5) {
        return {
          status: 429,
          body: {
            error: {
              code: "GEMINI_GROUNDING_LIMIT",
              message: "Google Search grounding is over its available usage limit. No web answer was returned.",
            },
          },
        };
      }
      return {
        body: [1, 3, 4].includes(answerIndex)
          ? {
              answer: "The current information is summarized here.",
              webResearch: {
                searched: true,
                notice: "Searched the web. This is an AI summary; review the cited sources.",
                sources: [{
                  title: "Official education source",
                  url: "https://example.edu/current-guidance",
                  publicationDate: "2025-10-12",
                  snippet: "Current policy reference returned by the provider.",
                }],
              },
            }
          : {
              answer: "This is general model knowledge.",
              webResearch: {
                searched: false,
                notice: "No web search was performed; this answer is from general model knowledge.",
                sources: [],
              },
            },
      };
    }
    return { status: 404, body: { error: { message: "Unexpected request" } } };
  }, ["*api/assistant/status", "*api/assistant/chat"]);

  await command("Page.navigate", { url: `${origin}/assistant/` });
  await waitFor('document.readyState==="complete" && document.getElementById("sendButton")');
  await waitFor('document.getElementById("statusText").textContent==="Gemini key configured"');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "assistant fits Android-sized viewport");

  await evaluate('document.getElementById("messageInput").value="What is the latest official guidance?";document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".message-research.searched a[href=\\"https://example.edu/current-guidance\\"]")');
  assert.match(await evaluate('document.querySelector(".message-research").textContent'), /Searched the web/);
  assert.equal(await evaluate('document.querySelector(".research-sources a").target'), "_blank");
  assert.match(await evaluate('document.querySelector(".research-sources a").rel'), /noopener/);
  assert.match(await evaluate('document.querySelector(".research-sources li").textContent'), /Published 2025-10-12/);
  assert.match(await evaluate('document.querySelector(".research-source-snippet").textContent'), /returned by the provider/);
  assert.equal(requests[0].language, "auto");

  await evaluate('document.getElementById("newConversationAlt").click()');
  await evaluate('document.getElementById("languageSelect").value="en";document.getElementById("languageSelect").dispatchEvent(new Event("change"))');
  await evaluate('document.getElementById("messageInput").value="Explain a basic concept";document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".message-research:not(.searched)")');
  assert.match(await evaluate('document.querySelector(".message-research").textContent'), /No web search was performed/);

  await evaluate('document.getElementById("newConversationAlt").click()');
  await evaluate('document.getElementById("languageSelect").value="om";document.getElementById("languageSelect").dispatchEvent(new Event("change"))');
  await evaluate('document.getElementById("messageInput").value="Odeeffannoo amma jiru barbaadi.";document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".message-research.searched a[href=\\"https://example.edu/current-guidance\\"]")');
  assert.equal(requests[2].language, "om");

  await evaluate('document.getElementById("newConversationAlt").click()');
  await evaluate('document.getElementById("languageSelect").value="am";document.getElementById("languageSelect").dispatchEvent(new Event("change"))');
  await evaluate('document.getElementById("messageInput").value="አሁን ያለውን መረጃ ፈልግ።";document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".message-research.searched a[href=\\"https://example.edu/current-guidance\\"]")');
  assert.equal(requests[3].language, "am");

  await evaluate('document.getElementById("newConversationAlt").click()');
  await evaluate('document.getElementById("languageSelect").value="en";document.getElementById("languageSelect").dispatchEvent(new Event("change"))');
  await evaluate('document.getElementById("messageInput").value="Search for current information";document.getElementById("messageInput").dispatchEvent(new Event("input"));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".error-card") && document.getElementById("statusText").textContent==="Search limit reached"');
  assert.match(await evaluate('document.querySelector(".error-card").textContent'), /No web answer was returned/);
  assert.equal(requests[4].language, "en");
  assert.deepEqual(browser.exceptions, []);
  console.log("PASS: grounded answers show only returned clickable citations; non-grounded answers are explicitly labeled; search-quota errors are visible; mobile layout has no horizontal overflow.");
} finally {
  await browser.close();
}

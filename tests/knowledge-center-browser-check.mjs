import assert from "node:assert/strict";
import { resolve } from "node:path";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const sharedDocument = {
  id: "d7fae5a0-2a69-4a7e-a943-82e102f11e62",
  filename: "biology.jsonl",
  displayName: "Biology Grade 10",
  category: "Biology",
  mimeType: "application/x-ndjson",
  byteSize: 300,
  processingStatus: "ready",
  pageCount: null,
  extractedCharacters: 1_240,
  processingNotice: "1 structured record was validated and indexed.",
  summary: "Cell membrane notes and one explained question.",
  metadata: { subject: "Biology", grade: 10, language: "en", topics: ["Cell membrane"], records: 1 },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

for (const [path, method] of [
  ["/api/knowledge/shared/documents", "GET"],
  ["/api/knowledge/shared/documents", "POST"],
  ["/api/knowledge/shared/documents/00000000-0000-4000-8000-000000000000", "PATCH"],
  ["/api/knowledge/shared/documents/00000000-0000-4000-8000-000000000000", "DELETE"],
  ["/api/knowledge/shared/documents/00000000-0000-4000-8000-000000000000/file", "GET"],
]) {
  const response = await fetch(`${origin}${path}`, {
    method,
    headers: { "Content-Type": "application/json" },
    ...(method === "GET" ? {} : { body: "{}" }),
  });
  assert.equal(response.status, 401, `${method} ${path} must require a signed-in user`);
}

const templateResponse = await fetch(`${origin}/knowledge/templates/knowledge-record-template.jsonl`);
assert.equal(templateResponse.status, 200, "the JSONL import template must be downloadable");
assert.match(templateResponse.headers.get("content-type") || "", /application\/x-ndjson/);
assert.equal((await templateResponse.text()).trim().split(/\r?\n/).length, 2);

const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
const sharedUploads = [];
const chatRequests = [];
const privateKnowledgePreferenceWrites = [];

async function navigate(path, condition) {
  await command("Page.navigate", { url: `${origin}${path}` });
  await waitFor(`location.href===${JSON.stringify(origin + path)} && document.readyState==="complete" && (${condition})`);
}

async function setFile(selector, path) {
  const { root } = await command("DOM.getDocument", { depth: -1 });
  const { nodeId } = await command("DOM.querySelector", { nodeId: root.nodeId, selector });
  assert.ok(nodeId, `Expected file input ${selector}`);
  await command("DOM.setFileInputFiles", { files: [path], nodeId });
}

async function waitForCondition(check, description) {
  const deadline = Date.now() + 5_000;
  while (!check()) {
    if (Date.now() > deadline) throw new Error(`Timed out waiting for ${description}.`);
    await new Promise(resolve => setTimeout(resolve, 20));
  }
}

try {
  await command("DOM.enable");
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/knowledge/", 'document.getElementById("shared-admin-panel")?.hidden===true');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "signed-out Knowledge Center fits mobile");

  await browser.intercept(async request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/account/status") return { body: { signedIn: true, userId: "user_test_admin", role: "admin" } };
    if (url.pathname === "/api/knowledge/documents") return { body: { documents: [], fileCount: 0, bytes: 0 } };
    if (url.pathname === "/api/knowledge/shared/documents" && request.method === "POST") {
      sharedUploads.push(request);
      return { status: 201, body: { duplicate: false, document: sharedDocument } };
    }
    if (url.pathname === "/api/knowledge/shared/documents") {
      return { body: { documents: [sharedDocument], fileCount: 1, bytes: 300 } };
    }
    return null;
  }, ["*"]);

  await navigate("/knowledge/", 'document.getElementById("shared-admin-panel")?.hidden===false && document.querySelector("#shared-document-list .document-title")?.textContent==="Biology Grade 10"');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "admin Knowledge Center fits mobile");
  assert.match(await evaluate('document.getElementById("shared-document-list").innerText'), /Cell membrane/);
  await setFile("#shared-file-input", resolve("knowledge/templates/knowledge-record-template.jsonl"));
  await evaluate('document.getElementById("shared-upload-form").requestSubmit()');
  await waitFor('document.getElementById("shared-upload-status").textContent.includes("validated and indexed")');
  assert.equal(sharedUploads.length, 1, "shared upload uses the admin shared-library endpoint");

  await browser.stopIntercept();
  await browser.intercept(async request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/account/status") return { body: { signedIn: true, userId: "user_test_student", role: "student" } };
    if (url.pathname === "/api/account/data" && request.method === "GET") return { body: { records: { preferences: {} } } };
    if (url.pathname === "/api/account/data/preferences" && request.method === "PUT") {
      const payload = JSON.parse(request.postData || "{}");
      privateKnowledgePreferenceWrites.push(payload);
      return { body: { saved: true } };
    }
    if (url.pathname === "/api/assistant/status") return {
      body: { provider: "minimax", configured: true, minimaxConfigured: true, geminiConfigured: false },
    };
    if (url.pathname === "/api/assistant/chat") {
      const body = JSON.parse(request.postData || "{}");
      chatRequests.push(body);
      return {
        body: {
          answer: "The cell membrane controls movement.",
          webResearch: { searched: false, notice: "No web search was performed." },
          knowledgeCenter: {
            used: true,
            notice: "This answer may use approved material from the Knowledge Center.",
            sources: [{ id: sharedDocument.id, title: "Biology Grade 10", page: 17, subject: "Biology", grade: 10, topic: "Cell membrane" }],
          },
          ...(body.usePersonalKnowledge ? {
            privateKnowledge: {
              used: true,
              notice: "Your private file was used.",
              sources: [{ id: "d7fae5a0-2a69-4a7e-a943-82e102f11e63", title: "My notes", page: 4 }],
            },
          } : {}),
        },
      };
    }
    return null;
  }, ["*"]);

  await navigate("/assistant/", 'document.getElementById("privateKnowledgeToggle") && document.getElementById("statusText")');
  await waitFor('document.getElementById("privateKnowledgeToggle").disabled===false');
  await waitFor('document.getElementById("privateKnowledgeToggle").checked===true');
  await waitForCondition(() => privateKnowledgePreferenceWrites.some(write => write.expectedUserId === "user_test_student" && write.data.privateKnowledgeEnabled === true), "account-scoped private knowledge default");
  await evaluate('document.getElementById("messageInput").value="What does the cell membrane do?";document.getElementById("messageInput").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelector(".message-knowledge.used .knowledge-sources")?.textContent.includes("Biology Grade 10") && document.querySelector(".message-knowledge.private .knowledge-sources a")?.textContent.includes("My notes")');
  assert.equal(chatRequests[0]?.usePersonalKnowledge, true, "signed-in accounts automatically retrieve their own private knowledge by default");
  assert.equal(privateKnowledgePreferenceWrites[0]?.expectedUserId, "user_test_student", "the default is saved to the active account");
  await evaluate('document.getElementById("privateKnowledgeToggle").click()');
  await evaluate('document.getElementById("messageInput").value="Answer without my private notes.";document.getElementById("messageInput").dispatchEvent(new Event("input",{bubbles:true}));document.getElementById("chatForm").requestSubmit()');
  await waitFor('document.querySelectorAll(".message.assistant").length>=2');
  assert.equal(chatRequests[1]?.usePersonalKnowledge, undefined, "the user can turn off private retrieval");
  console.log("Knowledge preference debug:", await evaluate('JSON.stringify({checked:document.getElementById("privateKnowledgeToggle").checked,disabled:document.getElementById("privateKnowledgeToggle").disabled,saved:localStorage.getItem("mina-teach.assistant.private-knowledge-enabled.v1:user_test_student")})'), privateKnowledgePreferenceWrites.map(write => write.data.privateKnowledgeEnabled));
  await waitForCondition(() => privateKnowledgePreferenceWrites.some(write => write.expectedUserId === "user_test_student" && write.data.privateKnowledgeEnabled === false), "private knowledge opt-out sync");

  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "Assistant source citations fit desktop");
  console.log("PASS: unauthenticated shared-library endpoints return 401; JSONL template downloads; admin shared upload/list UI works on mobile; Assistant automatically retrieves only the signed-in user's own private knowledge, cites it, persists the per-account setting, and honors opt-out.");
} finally {
  await browser.stopIntercept().catch(() => {});
  await browser.close();
}

import test from "node:test";
import assert from "node:assert/strict";
import { readAssistantResearchResponse } from "../assistant/research-response.mjs";

test("research response accepts JSON fallback and preserves provider errors", async () => {
  const result = await readAssistantResearchResponse(new Response(JSON.stringify({
    answer: "General explanation.",
    webResearch: { searched: false, sources: [] },
  }), { headers: { "Content-Type": "application/json" } }));
  assert.equal(result.webResearch.searched, false);

  await assert.rejects(
    readAssistantResearchResponse(new Response(JSON.stringify({
      error: { code: "GEMINI_GROUNDING_LIMIT", message: "No search was run." },
    }), { status: 429, headers: { "Content-Type": "application/json" } })),
    error => error.code === "GEMINI_GROUNDING_LIMIT" && error.statusCode === 0 && error.message === "No search was run.",
  );
});

test("research stream signals web search before returning its sourced answer", async () => {
  const frames = [
    "event: status\ndata: {\"state\":\"searching\",\"message\":\"Search the Web\"}\n\n",
    "event: result\ndata: {\"answer\":\"Current sourced answer.\",\"webResearch\":{\"searched\":true,\"sources\":[{\"title\":\"Official source\",\"url\":\"https://example.gov\"}]}}\n\n",
  ];
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      controller.enqueue(encoder.encode(frames[0].slice(0, 23)));
      controller.enqueue(encoder.encode(frames[0].slice(23) + frames[1]));
      controller.close();
    },
  });
  const response = new Response(stream, { headers: { "Content-Type": "text/event-stream; charset=utf-8" } });
  const progress = [];
  const result = await readAssistantResearchResponse(response, state => progress.push(state.message));
  assert.deepEqual(progress, ["Search the Web"]);
  assert.equal(result.answer, "Current sourced answer.");
  assert.equal(result.webResearch.sources[0].url, "https://example.gov");
});

test("research stream can switch to a non-web fallback and clearly label it", async () => {
  const frames = [
    "event: status\ndata: {\"state\":\"searching\",\"message\":\"Search the Web\"}\n\n",
    "event: status\ndata: {\"state\":\"fallback\",\"message\":\"Gemini unavailable; MiniMax is answering without web search.\"}\n\n",
    "event: result\ndata: {\"answer\":\"A general answer.\",\"provider\":\"minimax\",\"providerNotice\":\"Not web-verified.\",\"webResearch\":{\"searched\":false,\"sources\":[],\"notice\":\"Not web-verified.\"}}\n\n",
  ];
  const stream = new ReadableStream({
    start(controller) {
      const encoder = new TextEncoder();
      frames.forEach(frame => controller.enqueue(encoder.encode(frame)));
      controller.close();
    },
  });
  const progress = [];
  const result = await readAssistantResearchResponse(
    new Response(stream, { headers: { "Content-Type": "text/event-stream" } }),
    state => progress.push(state.state),
  );
  assert.deepEqual(progress, ["searching", "fallback"]);
  assert.equal(result.provider, "minimax");
  assert.equal(result.webResearch.searched, false);
  assert.deepEqual(result.webResearch.sources, []);
  assert.match(result.providerNotice, /Not web-verified/);
});

test("streamed provider failures remain explicit and never become answers", async () => {
  const body = `event: status\ndata: {"state":"searching","message":"Search the Web"}\n\n` +
    `event: error\ndata: {"error":{"code":"GEMINI_GROUNDING_UNAVAILABLE","message":"Google Search is unavailable."}}\n\n`;
  const response = new Response(body, { headers: { "Content-Type": "text/event-stream" } });
  await assert.rejects(
    readAssistantResearchResponse(response),
    error => error.code === "GEMINI_GROUNDING_UNAVAILABLE" && error.message === "Google Search is unavailable.",
  );
});

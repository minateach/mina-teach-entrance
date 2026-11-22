import test from "node:test";
import assert from "node:assert/strict";
import {
  defaultMiniMaxChatModel,
  normalizeMiniMaxChatError,
  normalizeStudentMemory,
  requestMiniMaxChat,
  shouldUseGeminiForRequest,
} from "../server/minimax-chat.mjs";

test("uses a model currently listed by MiniMax", () => {
  assert.equal(defaultMiniMaxChatModel, "MiniMax-M3.1-Flash");
});

test("MiniMax requests stay behind the connector and return the real answer", async () => {
  let requestPath = "";
  let requestBody;
  const result = await requestMiniMaxChat({
    async proxy(connector, path, init) {
      assert.equal(connector, "minimax");
      requestPath = path;
      requestBody = JSON.parse(init.body);
      return Response.json({
        model: "MiniMax-M3.1-Flash",
        choices: [{ message: { content: "Show the inverse operation, then check the result." } }],
        usage: { prompt_tokens: 20, completion_tokens: 12 },
      });
    },
  }, [{ role: "user", content: "How do I solve 2x = 8?" }]);

  assert.equal(requestPath, "/v1/chat/completions");
  assert.equal(requestBody.model, "MiniMax-M3.1-Flash");
  assert.equal(result.answer, "Show the inverse operation, then check the result.");
  assert.deepEqual(result.usage, { inputTokens: 20, outputTokens: 12 });
});

test("connection and balance failures stay explicit and never invent an answer", async () => {
  const credentials = normalizeMiniMaxChatError(new Response(null, { status: 401 }), {});
  const balance = normalizeMiniMaxChatError(new Response(null, { status: 402 }), {
    error: { message: "insufficient balance" },
  });
  assert.equal(credentials.code, "MINIMAX_SETUP_REQUIRED");
  assert.match(credentials.message, /Replit Integrations/);
  assert.equal(balance.code, "MINIMAX_BILLING_REQUIRED");
  assert.match(balance.message, /No credits were added/);

  await assert.rejects(
    requestMiniMaxChat({
      async proxy() {
        return new Response(JSON.stringify({ error: { message: "insufficient balance" } }), { status: 402 });
      },
    }, [{ role: "user", content: "Explain fractions." }]),
    error => error.code === "MINIMAX_BILLING_REQUIRED" && !("answer" in error),
  );
});

test("empty or retired model responses are not represented as answers", async () => {
  await assert.rejects(
    requestMiniMaxChat({
      async proxy() {
        return new Response(JSON.stringify({ error: { code: 2069 } }), { status: 400 });
      },
    }, [{ role: "user", content: "Explain fractions." }]),
    error => error.code === "MINIMAX_MODEL_UNAVAILABLE",
  );
  await assert.rejects(
    requestMiniMaxChat({
      async proxy() {
        return Response.json({ choices: [{ message: { content: " " } }] });
      },
    }, [{ role: "user", content: "Explain fractions." }]),
    error => error.code === "MINIMAX_EMPTY_RESPONSE",
  );
});

test("current-source and image requests use Gemini; ordinary multilingual text uses MiniMax", () => {
  assert.equal(shouldUseGeminiForRequest("What is the latest exchange rate?"), true);
  assert.equal(shouldUseGeminiForRequest("What is the current policy?"), true);
  assert.equal(shouldUseGeminiForRequest("Explain electric current in a wire."), false);
  assert.equal(shouldUseGeminiForRequest("Har'a odeeffannoo haaraa maal jira?"), true);
  assert.equal(shouldUseGeminiForRequest("የዛሬ ዜና ምንድነው?"), true);
  assert.equal(shouldUseGeminiForRequest("Explain a linear equation step by step."), false);
  assert.equal(shouldUseGeminiForRequest("አልጀብራን አስረዳኝ"), false);
  assert.equal(shouldUseGeminiForRequest("Naaf, seera Newton ibsi."), false);
  assert.equal(shouldUseGeminiForRequest("Describe this diagram.", true), true);
});

test("saved memory is size-limited and contains only explicit text notes", () => {
  const memory = normalizeStudentMemory([
    "  Use clear steps   ",
    null,
    "x".repeat(280),
    "Prefer short examples",
  ]);
  assert.equal(memory.length, 3);
  assert.equal(memory[0], "Use clear steps");
  assert.equal(memory[1].length, 240);
  assert.equal(memory[2], "Prefer short examples");
  assert.equal(normalizeStudentMemory("not a list").length, 0);
});

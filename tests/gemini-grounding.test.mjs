import test from "node:test";
import assert from "node:assert/strict";
import {
  monthlyGroundingRequestCap,
  parseGeminiGrounding,
  recordGroundingQueries,
  reserveGroundingRequest,
  utcMonthStart,
} from "../server/gemini-grounding.mjs";

test("grounding parser returns real answer and HTTPS citations only", () => {
  const result = parseGeminiGrounding({
    candidates: [{
      content: { parts: [{ text: "Recent answer." }] },
      groundingMetadata: {
        webSearchQueries: ["latest official update", ""],
        groundingChunks: [
          { web: { uri: "https://example.edu/report", title: "Official report", publishedDate: "2025-07-12", snippet: "A provider-returned source excerpt." } },
          { web: { uri: "javascript:alert(1)", title: "Unsafe" } },
          { web: { uri: "http://example.edu/insecure", title: "Insecure" } },
          { web: { uri: "https://example.edu/report", title: "Duplicate" } },
        ],
      },
    }],
  });
  assert.equal(result.answer, "Recent answer.");
  assert.equal(result.searchedWeb, true);
  assert.equal(result.searchQueryCount, 1);
  assert.deepEqual(result.sources, [{
    title: "Official report",
    url: "https://example.edu/report",
    publicationDate: "2025-07-12",
    snippet: "A provider-returned source excerpt.",
  }]);
});

test("source metadata keeps only provider-supplied valid dates and text", () => {
  const result = parseGeminiGrounding({
    candidates: [{
      content: { parts: [{ text: "A grounded answer." }] },
      groundingMetadata: {
        groundingChunks: [
          { web: { uri: "https://example.edu/a", title: "Source A", date: "2025-13-40", snippet: 42 } },
          { web: { uri: "https://example.edu/b", title: "Source B", publicationDate: "2024" } },
        ],
      },
    }],
  });
  assert.equal(result.searchedWeb, true);
  assert.deepEqual(result.sources, [
    { title: "Source A", url: "https://example.edu/a" },
    { title: "Source B", url: "https://example.edu/b", publicationDate: "2024" },
  ]);
});

test("no grounding metadata is reported as not searched", () => {
  assert.deepEqual(parseGeminiGrounding({
    candidates: [{ content: { parts: [{ text: "General answer." }] } }],
  }), {
    answer: "General answer.",
    searchedWeb: false,
    searchQueryCount: 0,
    sources: [],
  });
});

test("monthly budget uses UTC and remains bounded atomically", async () => {
  assert.equal(utcMonthStart(new Date("2026-11-30T23:59:00Z")), "2026-11-01");
  assert.equal(monthlyGroundingRequestCap, 100);
  let sql = "";
  const pool = { query: async (text) => { sql = text; return { rowCount: 1 }; } };
  assert.equal(await reserveGroundingRequest(pool, "2026-11-01"), true);
  assert.match(sql, /grounded_requests < \$2/);
  assert.equal(await reserveGroundingRequest({ query: async () => ({ rowCount: 0 }) }, "2026-11-01"), false);
});

test("grounded query usage records only positive counts", async () => {
  const calls = [];
  const pool = { query: async (...args) => calls.push(args) };
  await recordGroundingQueries(pool, "2026-11-01", 2);
  await recordGroundingQueries(pool, "2026-11-01", 0);
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1], ["2026-11-01", 2]);
});

import test from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { maxImageUploadBytes, normalizeImageDataUrl } from "../server/image-processing.mjs";
import { monthlyImageRequestCap, recordSuccessfulImage, reserveImageAIRequest, utcImageUsageMonth } from "../server/image-usage.mjs";
import { handleImageStudioRequest } from "../server/image-studio.mjs";

async function pngDataUrl(width = 256, height = 192) {
  const png = await sharp({
    create: {
      width,
      height,
      channels: 3,
      background: { r: 33, g: 100, b: 190 },
    },
  }).png().toBuffer();
  return `data:image/png;base64,${png.toString("base64")}`;
}

test("image validation decodes, normalizes, and constrains supported uploads", async () => {
  const normalized = await normalizeImageDataUrl(await pngDataUrl());
  assert.equal(normalized.mimeType, "image/jpeg");
  assert.equal(normalized.width, 256);
  assert.equal(normalized.height, 192);
  assert.match(normalized.dataUrl, /^data:image\/jpeg;base64,/);
  await assert.rejects(
    normalizeImageDataUrl((await pngDataUrl()).replace("data:image/png", "data:image/jpeg")),
    /contents do not match/,
  );
  await assert.rejects(normalizeImageDataUrl("data:image/png;base64,%%%"), /valid JPG/);
  await assert.rejects(normalizeImageDataUrl(await pngDataUrl(10, 10)), /dimensions/);
  const oversized = `data:image/jpeg;base64,${"A".repeat(Math.ceil(maxImageUploadBytes * 4 / 3) + 10)}`;
  await assert.rejects(normalizeImageDataUrl(oversized), /5 MB or smaller/);
});

test("image usage reservation enforces a single UTC monthly cap per provider", async () => {
  assert.equal(utcImageUsageMonth(new Date("2026-11-30T23:30:00-05:00")), "2026-12-01");
  assert.equal(monthlyImageRequestCap, 20);
  let queryArgs;
  const pool = {
    async query(sql, values) {
      assert.match(sql, /request_count < \$3/);
      queryArgs = values;
      return { rowCount: 1, rows: [{ request_count: 1 }] };
    },
  };
  assert.equal(await reserveImageAIRequest(pool, "gemini_vision", "2026-11-01"), true);
  assert.deepEqual(queryArgs, ["2026-11-01", "gemini_vision", 20]);
  await assert.rejects(reserveImageAIRequest(pool, "other", "2026-11-01"), /Unsupported/);

  let successUpdate = "";
  await recordSuccessfulImage({
    async query(sql, values) {
      successUpdate = sql;
      assert.deepEqual(values, ["2026-11-01", "minimax_image"]);
    },
  }, "minimax_image", "2026-11-01");
  assert.match(successUpdate, /successful_images = successful_images \+ 1/);

  assert.equal(await reserveImageAIRequest({
    async query() { return { rowCount: 0, rows: [] }; },
  }, "minimax_image", "2026-11-01"), false);
});

function fakeResponse() {
  const result = { status: 0, body: null, error: null };
  return {
    result,
    sendJson(_response, status, body) { result.status = status; result.body = body; },
    sendError(_response, status, code, message) { result.status = status; result.error = { code, message }; },
  };
}

test("image studio sends an edited image to MiniMax once and returns the validated output", async () => {
  const imageDataUrl = await pngDataUrl(256, 192);
  const output = await pngDataUrl(160, 160);
  const outputBase64 = output.split(",")[1];
  const received = [];
  const poolQueries = [];
  const handlers = fakeResponse();
  const providerResponse = new Response(JSON.stringify({
    base_resp: { status_code: 0 },
    output_format: "png",
    data: [{ b64_json: outputBase64, size: "1024x1024" }],
  }), { status: 200, headers: { "Content-Type": "application/json" } });
  await handleImageStudioRequest({
    request: {},
    response: {},
    pool: { async query(sql) { poolQueries.push(sql); return { rowCount: 1, rows: [{ request_count: 1 }] }; } },
    connectors: {
      async proxy(provider, path, options) {
        received.push({ provider, path, payload: JSON.parse(options.body) });
        return providerResponse;
      },
    },
    async readJsonBody() { return { mode: "edit", prompt: "Add one small blue dot in the corner.", imageDataUrl }; },
    sendJson: handlers.sendJson,
    sendError: handlers.sendError,
  });
  assert.equal(handlers.result.status, 200);
  assert.equal(handlers.result.body.model, "MiniMax-H3-Image");
  assert.equal(handlers.result.body.mimeType, "image/jpeg");
  assert.equal(handlers.result.body.width, 160);
  assert.equal(received.length, 1);
  assert.equal(received[0].provider, "minimax");
  assert.equal(received[0].path, "/v1/images/edits");
  assert.equal(received[0].payload.model, "MiniMax-H3-Image");
  assert.equal(received[0].payload.size, "1024x1024");
  assert.equal(received[0].payload.n, 1);
  assert.equal(received[0].payload.response_format, "b64_json");
  assert.match(received[0].payload.images[0].image_url, /^data:image\/jpeg;base64,/);
  assert.equal(poolQueries.length, 2);
});

test("image studio refuses a request when its cap cannot be reserved", async () => {
  const handlers = fakeResponse();
  let calls = 0;
  await handleImageStudioRequest({
    request: {},
    response: {},
    pool: { async query() { return { rowCount: 0, rows: [] }; } },
    connectors: { async proxy() { calls += 1; throw new Error("must not call provider"); } },
    async readJsonBody() { return { mode: "generate", prompt: "A blue bird." }; },
    sendJson: handlers.sendJson,
    sendError: handlers.sendError,
  });
  assert.equal(handlers.result.status, 429);
  assert.equal(handlers.result.error.code, "IMAGE_MONTHLY_LIMIT");
  assert.equal(calls, 0);
});

test("image studio reports provider limits and never retries a billable request", async () => {
  const handlers = fakeResponse();
  let calls = 0;
  await handleImageStudioRequest({
    request: {},
    response: {},
    pool: { async query() { return { rowCount: 1, rows: [{ request_count: 1 }] }; } },
    connectors: {
      async proxy() {
        calls += 1;
        return new Response(JSON.stringify({ base_resp: { status_code: 1002, status_msg: "rate limit" } }), { status: 429 });
      },
    },
    async readJsonBody() { return { mode: "generate", prompt: "A blue bird." }; },
    sendJson: handlers.sendJson,
    sendError: handlers.sendError,
  });
  assert.equal(handlers.result.status, 429);
  assert.equal(handlers.result.error.code, "IMAGE_PROVIDER_RATE_LIMIT");
  assert.equal(calls, 1);
});

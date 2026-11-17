import { ImageInputError, normalizeImageDataUrl } from "./image-processing.mjs";
import { monthlyImageRequestCap, recordSuccessfulImage, reserveImageAIRequest, utcImageUsageMonth } from "./image-usage.mjs";

const maxPromptLength = 1_500;
const imageOutputSize = "1024x1024";

function sendFailure(sendError, status, code, message) {
  sendError(status, code, message);
}

function normalizeMiniMaxImageError(response, body) {
  const code = Number(body?.base_resp?.status_code || body?.error?.code || body?.error?.http_code);
  const message = String(body?.error?.message || body?.base_resp?.status_msg || "").toLowerCase();
  if ([401, 403].includes(response.status) || code === 1004 || code === 2049 || message.includes("authentication")) {
    return {
      status: 503,
      code: "IMAGE_PROVIDER_SETUP_REQUIRED",
      message: "The connected MiniMax image service rejected access. Check its connection; no billing settings were changed.",
    };
  }
  if (response.status === 402 || [1008, 2053, 2067, 2068].includes(code) || message.includes("insufficient")) {
    return {
      status: 402,
      code: "IMAGE_PROVIDER_LIMIT",
      message: "MiniMax reports that image usage is unavailable for this account or model. No credits were added and no automatic retry was made.",
    };
  }
  if (response.status === 429 || [1002, 2056].includes(code)) {
    return {
      status: 429,
      code: "IMAGE_PROVIDER_RATE_LIMIT",
      message: "MiniMax reached an image rate or usage limit. No automatic retry was made.",
    };
  }
  if (response.status === 422 || [1026, 1027].includes(code)) {
    return {
      status: 422,
      code: "IMAGE_PROVIDER_SAFETY",
      message: "MiniMax could not process this image or instruction under its safety rules. Try a different image or prompt.",
    };
  }
  return {
    status: 502,
    code: "IMAGE_PROVIDER_ERROR",
    message: "MiniMax could not finish this image request. No automatic retry was made.",
  };
}

function safeFormat(value) {
  const format = String(value || "jpeg").toLowerCase();
  if (format === "jpg" || format === "jpeg") return "image/jpeg";
  if (format === "png") return "image/png";
  if (format === "webp") return "image/webp";
  return "";
}

export async function handleImageStudioRequest({
  request,
  response,
  pool,
  connectors,
  readJsonBody,
  sendJson,
  sendError,
}) {
  let input;
  try {
    input = await readJsonBody(request, 8 * 1024 * 1024);
  } catch (error) {
    sendFailure(
      (status, code, message) => sendError(response, status, code, message),
      error.statusCode || 400,
      error.statusCode === 413 ? "IMAGE_TOO_LARGE" : "INVALID_IMAGE_REQUEST",
      error.statusCode === 413 ? "The image request is too large. Choose a smaller image." : error.message,
    );
    return;
  }

  const mode = input?.mode;
  const prompt = typeof input?.prompt === "string" ? input.prompt.trim().slice(0, maxPromptLength) : "";
  if (!["edit", "generate"].includes(mode)) {
    sendError(response, 400, "INVALID_IMAGE_MODE", "Choose image editing or image generation.");
    return;
  }
  if (!prompt) {
    sendError(response, 400, "EMPTY_IMAGE_PROMPT", "Describe the image change or the image you want to create.");
    return;
  }

  let reference = null;
  if (mode === "edit") {
    try {
      reference = await normalizeImageDataUrl(input.imageDataUrl);
      if (reference.width < 128 || reference.height < 128 || Math.max(reference.width, reference.height) / Math.min(reference.width, reference.height) > 4) {
        throw new ImageInputError("For editing, use an image at least 128 px wide and tall with a shape no wider than 4:1.", "IMAGE_DIMENSIONS_INVALID");
      }
    } catch (error) {
      sendError(
        response,
        error.statusCode || 400,
        error.code || "INVALID_IMAGE",
        error.message || "Choose a valid JPG, PNG, or WEBP image.",
      );
      return;
    }
  }

  const month = utcImageUsageMonth();
  try {
    const withinCap = await reserveImageAIRequest(pool, "minimax_image", month, monthlyImageRequestCap);
    if (!withinCap) {
      sendError(response, 429, "IMAGE_MONTHLY_LIMIT", "The app's monthly image-generation and editing limit has been reached. No image was sent to MiniMax.");
      return;
    }
  } catch (error) {
    console.error("[image-studio] Usage check failed.", { name: error?.name || "Error" });
    sendError(response, 503, "IMAGE_USAGE_UNAVAILABLE", "Image editing is paused because its usage limit could not be confirmed. No image was sent to MiniMax.");
    return;
  }

  const endpoint = mode === "edit" ? "/v1/images/edits" : "/v1/images/generations";
  const payload = {
    model: "MiniMax-H3-Image",
    prompt,
    size: imageOutputSize,
    n: 1,
    response_format: "b64_json",
    ...(reference ? { images: [{ image_url: reference.dataUrl }] } : {}),
  };

  let providerResponse;
  let body;
  try {
    providerResponse = await connectors.proxy("minimax", endpoint, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });
    body = await providerResponse.json().catch(() => null);
  } catch (error) {
    console.error("[image-studio] Provider request failed.", { name: error?.name || "Error" });
    sendError(response, 502, "IMAGE_PROVIDER_UNAVAILABLE", "The image service could not be reached. The request was not retried because image generation can be billable.");
    return;
  }

  const providerCode = Number(body?.base_resp?.status_code || 0);
  if (!providerResponse.ok || body?.error || (providerCode && providerCode !== 0)) {
    const failure = normalizeMiniMaxImageError(providerResponse, body);
    sendError(response, failure.status, failure.code, failure.message);
    return;
  }

  const firstImage = body?.data?.[0];
  if (!firstImage || firstImage.error || typeof firstImage.b64_json !== "string") {
    const failure = firstImage?.error
      ? normalizeMiniMaxImageError(providerResponse, { error: firstImage.error })
      : {
          status: 502,
          code: "IMAGE_RESPONSE_INVALID",
          message: "MiniMax returned no downloadable image. No placeholder was created.",
        };
    sendError(response, failure.status, failure.code, failure.message);
    return;
  }

  const mimeType = safeFormat(body.output_format);
  if (!mimeType) {
    sendError(response, 502, "IMAGE_RESPONSE_INVALID", "MiniMax returned an unsupported image format.");
    return;
  }
  let image;
  try {
    image = await normalizeImageDataUrl(`data:${mimeType};base64,${firstImage.b64_json}`);
  } catch (error) {
    console.error("[image-studio] Provider image failed validation.", { name: error?.name || "Error" });
    sendError(response, 502, "IMAGE_RESPONSE_INVALID", "The generated image could not be decoded safely.");
    return;
  }
  try {
    await recordSuccessfulImage(pool, "minimax_image", month);
  } catch (error) {
    console.error("[image-studio] Success usage record failed.", { name: error?.name || "Error" });
  }

  sendJson(response, 200, {
    imageDataUrl: image.dataUrl,
    mimeType: image.mimeType,
    width: image.width,
    height: image.height,
    size: String(firstImage.size || imageOutputSize),
    revisedPrompt: typeof firstImage.revised_prompt === "string" ? firstImage.revised_prompt.slice(0, maxPromptLength) : "",
    model: "MiniMax-H3-Image",
  });
}

export const defaultMiniMaxChatModel = "MiniMax-M3.1-Flash";

const geminiFallbackCodes = new Set([
  "GEMINI_SETUP_REQUIRED",
  "GEMINI_ACCESS_DENIED",
  "GEMINI_RATE_LIMIT",
  "GEMINI_GROUNDING_LIMIT",
  "GEMINI_GROUNDING_UNAVAILABLE",
  "GEMINI_GROUNDING_REJECTED",
  "GEMINI_MODEL_UNAVAILABLE",
  "GEMINI_TEMPORARILY_UNAVAILABLE",
  "GEMINI_UNAVAILABLE",
  "EMPTY_GEMINI_RESPONSE",
  "TUTOR_TIMEOUT",
  "TUTOR_UNAVAILABLE",
]);

export function shouldFallbackGeminiToMiniMax(errorCode, { hasImage = false, miniMaxAvailable = false } = {}) {
  return !hasImage && miniMaxAvailable && geminiFallbackCodes.has(errorCode);
}

export function createMiniMaxFallbackPayload({ answer, notice, knowledgeCenter, privateKnowledge }) {
  if (typeof answer !== "string" || !answer.trim()) {
    throw new TypeError("A real MiniMax answer is required for fallback.");
  }
  const fallbackNotice = typeof notice === "string" && notice.trim()
    ? notice.trim().slice(0, 400)
    : "Gemini was unavailable. MiniMax answered without web search; current information is not verified.";
  return {
    answer: answer.trim(),
    provider: "minimax",
    providerNotice: fallbackNotice,
    webResearch: {
      searched: false,
      sourceCount: 0,
      sources: [],
      notice: fallbackNotice,
    },
    ...(privateKnowledge ? { privateKnowledge } : {}),
    ...(knowledgeCenter ? { knowledgeCenter } : {}),
  };
}

export function normalizeMiniMaxChatError(response, body) {
  const code = Number(body?.base_resp?.status_code || body?.error?.code);
  const message = String(body?.base_resp?.status_msg || body?.error?.message || "").toLowerCase();

  if ([401, 403].includes(response?.status) || [1004, 2049].includes(code) || message.includes("authentication") || message.includes("api key")) {
    return {
      statusCode: 503,
      code: "MINIMAX_SETUP_REQUIRED",
      message: "The MiniMax connection rejected access. Reconnect or update MiniMax in Replit Integrations. No billing settings were changed.",
    };
  }
  if (response?.status === 402 || code === 1008 || message.includes("insufficient balance")) {
    return {
      statusCode: 402,
      code: "MINIMAX_BILLING_REQUIRED",
      message: "MiniMax reports that no API balance is available. No credits were added and no automatic fallback was used.",
    };
  }
  if (response?.status === 429 || [1002, 2056].includes(code)) {
    return {
      statusCode: 429,
      code: "MINIMAX_RATE_LIMIT",
      message: "MiniMax reached a request or usage limit. No automatic retry was made.",
    };
  }
  if (response?.status === 404 || code === 2069) {
    return {
      statusCode: 503,
      code: "MINIMAX_MODEL_UNAVAILABLE",
      message: "The configured MiniMax chat model is unavailable. No answer was generated.",
    };
  }
  return {
    statusCode: 502,
    code: "MINIMAX_UNAVAILABLE",
    message: "MiniMax could not answer this question. No answer was generated; try again later.",
  };
}

export async function requestMiniMaxChat(connectors, messages, model = defaultMiniMaxChatModel) {
  let response;
  let body;
  try {
    response = await connectors.proxy("minimax", "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        messages,
        temperature: 0.35,
        max_tokens: 1_024,
      }),
    });
    body = await response.json().catch(() => null);
  } catch {
    throw Object.assign(new Error("MiniMax could not be reached. No answer was generated."), {
      statusCode: 502,
      code: "MINIMAX_UNAVAILABLE",
    });
  }

  if (!response.ok || body?.error) {
    const failure = normalizeMiniMaxChatError(response, body);
    throw Object.assign(new Error(failure.message), failure);
  }

  const answer = body?.choices?.[0]?.message?.content;
  if (typeof answer !== "string" || !answer.trim()) {
    throw Object.assign(new Error("MiniMax returned no answer. No placeholder response was created."), {
      statusCode: 502,
      code: "MINIMAX_EMPTY_RESPONSE",
    });
  }
  return {
    answer: answer.trim(),
    model: typeof body?.model === "string" ? body.model : model,
    usage: body?.usage && typeof body.usage === "object"
      ? {
          inputTokens: Number(body.usage.prompt_tokens) || 0,
          outputTokens: Number(body.usage.completion_tokens) || 0,
        }
      : null,
  };
}

export function shouldUseGeminiForRequest(message, hasImage = false) {
  if (hasImage) return true;
  return /\b(search|browse|web|internet|latest|today|recent(?:ly)?|news|weather|price|exchange rate|live|right now|now|currently|as of|up[- ]to[- ]date|this week|this month|this year|202[6-9])\b/i.test(message)
    || /\bcurrent\s+(information|events?|price|rate|policy|president|prime minister|version|weather|guidance|news)\b/i.test(message)
    || /\b(?:who is|who's|who holds)\s+(?:(?:the|ethiopia's|the ethiopian)\s+)?(?:president|prime minister|education minister|head of government)\b/i.test(message)
    || /ዛሬ|አሁን|የቅርብ|ወቅታዊ|ዜና|ዋጋ|መጠን|ሰሞኑን/u.test(message)
    || /\b(ammee|har'a|amma|haaraa|odeeffannoo yeroo ammaa|gatii|guyyaa kana)\b/i.test(message);
}

export function normalizeStudentMemory(value) {
  if (!Array.isArray(value)) return [];
  const entries = [];
  let total = 0;
  for (const item of value.slice(0, 20)) {
    if (typeof item !== "string") continue;
    const text = item.trim().replace(/\s+/g, " ").slice(0, 240);
    if (!text || total + text.length > 4_800) continue;
    entries.push(text);
    total += text.length;
  }
  return entries;
}

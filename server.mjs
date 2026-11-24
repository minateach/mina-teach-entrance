import { readFile } from "node:fs/promises";
import { createHash, randomUUID, timingSafeEqual } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import express from "express";
import multer from "multer";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import { createFirebaseWebConfig, ensureFirebaseIdentitySchema, verifyFirebaseGoogleIdToken } from "./server/firebase-auth.mjs";
import { ReplitConnectors } from "@replit/connectors-sdk";
import pg from "pg";
import { createLearningCatalog, LearningInputError } from "./server/learning-catalog.mjs";
import { createGeneralKnowledgeCenter, GeneralKnowledgeError } from "./server/general-knowledge.mjs";
import { buildTutorInstructions, resolveFounderResponse } from "./server/assistant-guidance.mjs";
import { getExamHistory } from "./server/student-analytics.mjs";
import {materialProblem,materialsProblem} from "./server/lesson-materials.mjs";
import { normalizeImageBuffer, normalizeImageDataUrl } from "./server/image-processing.mjs";
import { monthlyImageRequestCap, reserveImageAIRequest, recordSuccessfulImage, utcImageUsageMonth } from "./server/image-usage.mjs";
import { handleImageStudioRequest } from "./server/image-studio.mjs";
import {
  MAX_STUDY_NOTICE_EVENTS,
  PUBLISHED_STUDY_EVENTS_SQL,
  consumeStudyNoticePoll,
  normalizeStudyNotifications,
  publicStudyNotice,
  updateStudyNotifications,
} from "./server/study-notifications.mjs";
import {
  createMiniMaxFallbackPayload,
  defaultMiniMaxChatModel,
  normalizeMiniMaxChatError,
  normalizeStudentMemory,
  requestMiniMaxChat,
  shouldFallbackGeminiToMiniMax,
  shouldUseGeminiForRequest,
} from "./server/minimax-chat.mjs";
import {
  monthlyGroundingRequestCap,
  parseGeminiGrounding,
  recordGroundingQueries,
  reserveGroundingRequest,
  utcMonthStart,
} from "./server/gemini-grounding.mjs";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./server/middlewares/clerkProxyMiddleware.mjs";
import {
  PrivateKnowledgeError,
  deletePrivateDocument,
  ensurePrivateKnowledgeSchema,
  exportPrivateDocuments,
  extractPrivateDocument,
  listPrivateDocuments,
  loadSelectedPrivateImage,
  openPrivateDocument,
  privateKnowledgeLimits,
  buildPrivateKnowledgePrompt,
  privateKnowledgeSources,
  sharedKnowledgeOwnerId,
  sharedKnowledgeSources,
  retrievePrivateKnowledge,
  savePrivateDocument,
  updatePrivateDocument,
} from "./server/private-knowledge.mjs";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const founderProfile = JSON.parse(await readFile(resolve(projectRoot, "server/founder-profile.json"), "utf8"));
const port = Number(process.env.PORT || 5000);
const host = "0.0.0.0";
const maxBodyBytes = 20 * 1024;
const maxImageRequestBytes = 8 * 1024 * 1024;
const maxHistoryMessages = 10;
const maxMessageLength = 2_000;
const supportedGrades = new Set([9, 10, 11, 12]);
const supportedLanguages = new Set(["auto", "en", "am", "om"]);
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const minimaxConnectors = new ReplitConnectors();
const learningCatalog = createLearningCatalog(pool);
const generalKnowledgeCenter = createGeneralKnowledgeCenter(pool);
const allowedRecordTypes = new Set(["conversations", "learning", "preferences"]);
const chatRateWindows = new Map();
const chatRateWindowMs = 60_000;
const maxChatRequestsPerWindow = 30;
const studyNotificationPolls = new Map();

const geminiModel = "gemini-3.5-flash-lite";
const miniMaxChatModel = process.env.MINIMAX_MODEL?.trim() || defaultMiniMaxChatModel;
const geminiSetupMessage =
  "Gemini is not configured. Add GEMINI_API_KEY in Replit Secrets using a Google AI Studio API key. No API key or paid plan was changed by Mina Teach AI.";
const miniMaxStatusCache = { checkedAt: 0, configured: false, code: "", message: "" };
const geminiStatusCache = { checkedAt: 0, available: null, code: "" };

function recordGeminiStatus(available, code = "") {
  geminiStatusCache.checkedAt = Date.now();
  geminiStatusCache.available = available;
  geminiStatusCache.code = available ? "" : code || "GEMINI_UNAVAILABLE";
}

function publicGeminiConnectionState(configured) {
  if (!configured) return "not_configured";
  if (geminiStatusCache.available === true) return "available";
  if (geminiStatusCache.available === false) return "unavailable";
  return "not_tested";
}

function getLegacyInlineHashes(html) {
  const hash = value => `'sha256-${createHash("sha256").update(value).digest("base64")}'`;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => hash(match[1]));
  const handlers = [...html.matchAll(/\bon\w+\s*=\s*(["'])(.*?)\1/gi)].map(match => hash(match[2]));
  return { scripts: [...new Set(scripts)], handlers: [...new Set(handlers)] };
}

function setSecurityHeaders(response, legacyInlineHashes = null) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(self), microphone=(), geolocation=()");
  const inlineScriptSources = legacyInlineHashes?.scripts.length ? ` ${legacyInlineHashes.scripts.join(" ")}` : "";
  const inlineHandlerSources = legacyInlineHashes?.handlers.length
    ? ` 'unsafe-hashes' ${legacyInlineHashes.handlers.join(" ")}`
    : "";
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; connect-src 'self' https://*.clerk.accounts.dev https://clerk-telemetry.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com https://identitytoolkit.googleapis.com https://securetoken.googleapis.com https://firebaseinstallations.googleapis.com https://firestore.googleapis.com https://fcmregistrations.googleapis.com https://www.google-analytics.com https://region1.analytics.google.com; img-src 'self' data: blob: https:; media-src 'self' blob:; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' https://*.clerk.accounts.dev https://cdn.protect.clerk.com${inlineScriptSources}${inlineHandlerSources}; worker-src 'self' blob:; frame-src https://*.clerk.accounts.dev https://*.firebaseapp.com https://accounts.google.com; font-src 'self' https://fonts.gstatic.com data:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`,
  );
}

function sendJson(response, statusCode, body) {
  setSecurityHeaders(response);
  response.writeHead(statusCode, {
    "Content-Type": "application/json; charset=utf-8",
    "Cache-Control": "no-store",
  });
  response.end(JSON.stringify(body));
}

function sendError(response, statusCode, code, message) {
  sendJson(response, statusCode, { error: { code, message } });
}

function startResearchEventStream(response) {
  setSecurityHeaders(response);
  response.writeHead(200, {
    "Content-Type": "text/event-stream; charset=utf-8",
    "Cache-Control": "no-store, no-transform",
    Connection: "keep-alive",
    "X-Accel-Buffering": "no",
  });
  response.flushHeaders?.();
}

function writeResearchEvent(response, event, payload) {
  if (response.destroyed || response.writableEnded) return;
  response.write(`event: ${event}\ndata: ${JSON.stringify(payload)}\n\n`);
}

function finishResearchError(response, statusCode, code, message, streamStarted) {
  if (streamStarted) {
    writeResearchEvent(response, "error", { error: { statusCode, code, message } });
    if (!response.writableEnded) response.end();
  } else {
    sendError(response, statusCode, code, message);
  }
}

function sendAssistantFallback(response, payload, streamStarted, statusMessage) {
  if (streamStarted) {
    writeResearchEvent(response, "status", { state: "fallback", message: statusMessage });
    writeResearchEvent(response, "result", payload);
    if (!response.writableEnded) response.end();
    return;
  }
  sendJson(response, 200, payload);
}

function dualProviderFailureMessage(error) {
  if (error?.code === "MINIMAX_SETUP_REQUIRED") {
    return "Gemini could not answer, and the MiniMax connection needs attention. Your message is saved; reconnect MiniMax in Replit Integrations and try again. No answer was generated.";
  }
  if (error?.code === "MINIMAX_BILLING_REQUIRED") {
    return "Gemini could not answer, and MiniMax reports no available API balance. No credits were added; your message is saved and no answer was generated.";
  }
  if (error?.code === "MINIMAX_RATE_LIMIT") {
    return "Gemini and MiniMax are currently unavailable or rate-limited. Your message is saved; try again later. No answer was generated.";
  }
  return "Gemini and MiniMax could not answer this question. Your message is saved; check the provider connection and try again. No answer was generated.";
}

async function readJsonBody(request, bodyLimit = maxBodyBytes) {
  if (!request.headers["content-type"]?.toLowerCase().includes("application/json")) {
    const error = new Error("Send the request as JSON.");
    error.statusCode = 415;
    throw error;
  }

  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > bodyLimit) {
      const error = new Error("This upload exceeds the request budget. Submit lesson material as additional numbered sections; content is never shortened automatically.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }

  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("The request could not be read. Please try again.");
    error.statusCode = 400;
    throw error;
  }
}

function cleanHistory(history) {
  if (!Array.isArray(history)) return [];

  return history
    .filter(
      (message) =>
        message &&
        (message.role === "user" || message.role === "assistant") &&
        typeof message.content === "string",
    )
    .slice(-maxHistoryMessages)
    .map((message) => ({
      role: message.role,
      content: message.content.trim().slice(0, 1_600),
    }))
    .filter((message) => message.content.length > 0);
}

function normalizeProviderError(response, providerBody) {
  const providerCode = Number(providerBody?.base_resp?.status_code);
  const providerErrorType = String(providerBody?.error?.type || "").toLowerCase();
  const providerMessage = String(
    providerBody?.base_resp?.status_msg || providerBody?.error?.message || "",
  ).toLowerCase();

  if (
    response.status === 401 ||
    response.status === 403 ||
    providerCode === 1004 ||
    providerCode === 2049 ||
    providerMessage.includes("authentication") ||
    providerMessage.includes("api key")
  ) {
    return {
      statusCode: 503,
      code: "SETUP_REQUIRED",
      message: "MiniMax rejected MINIMAX_API_KEY. Create a Pay-as-you-go API key in MiniMax Global under API Keys > Create new secret key, then replace the Replit Secret MINIMAX_API_KEY and restart the app. An M Plan Subscription Key is not interchangeable.",
    };
  }

  if (response.status === 429 || providerCode === 1002 || providerCode === 2056) {
    return {
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "MiniMax is rate-limiting requests or the account usage limit was reached. Check MiniMax usage and try again later.",
    };
  }

  if (
    response.status === 402 ||
    providerCode === 1008 ||
    providerErrorType.includes("insufficient_balance")
  ) {
    return {
      statusCode: 402,
      code: "BILLING_REQUIRED",
      message: "MiniMax accepted the API key but reports no available balance for this request. No credits were added. Check whether your current MiniMax plan includes API usage; if not, leave the assistant disconnected rather than purchasing credits.",
    };
  }

  if (providerCode === 2013) {
    return {
      statusCode: 502,
      code: "MODEL_CONFIGURATION",
      message: "MiniMax rejected the model or request settings. Check MINIMAX_MODEL in the server environment.",
    };
  }

  return {
    statusCode: 502,
    code: "PROVIDER_ERROR",
    message: "The tutor could not answer right now. Please try again in a moment.",
  };
}

function normalizeGeminiError(response, providerBody, groundingEnabled = false) {
  const providerStatus = String(providerBody?.error?.status || "").toUpperCase();
  const providerMessage = String(providerBody?.error?.message || "").toLowerCase();

  if (
    providerMessage.includes("api key not valid") ||
    providerMessage.includes("invalid api key") ||
    providerStatus === "UNAUTHENTICATED"
  ) {
    return {
      statusCode: 503,
      code: "SETUP_REQUIRED",
      message: "Gemini rejected GEMINI_API_KEY. Check that a valid Google AI Studio API key is saved in Replit Secrets. Mina Teach AI will not change billing settings.",
    };
  }

  if (response.status === 429 || providerStatus === "RESOURCE_EXHAUSTED") {
    return {
      statusCode: 429,
      code: groundingEnabled ? "GEMINI_GROUNDING_LIMIT" : "GEMINI_RATE_LIMIT",
      message: groundingEnabled
        ? "Gemini or Google Search reached an API usage limit. No answer was returned; check Google AI Studio usage and retry only after confirming your limit."
        : "Gemini reached an API usage limit. No answer was returned; check Google AI Studio usage and try again later.",
    };
  }

  if (providerStatus === "PERMISSION_DENIED" || response.status === 403) {
    return {
      statusCode: 403,
      code: groundingEnabled ? "GEMINI_GROUNDING_UNAVAILABLE" : "GEMINI_ACCESS_DENIED",
      message: groundingEnabled
        ? "Google Search grounding is unavailable to this API key, project, or billing tier. No web results were used. Check Google AI Studio access; Mina Teach AI does not change billing settings."
        : "Google denied access to Gemini for this key or model. Check Google AI Studio key and model access.",
    };
  }

  if (response.status === 404) {
    return {
      statusCode: 503,
      code: "GEMINI_MODEL_UNAVAILABLE",
      message: "The configured Gemini model is unavailable to this API key.",
    };
  }

  if (response.status === 503 || providerStatus === "UNAVAILABLE") {
    return {
      statusCode: 503,
      code: "GEMINI_TEMPORARILY_UNAVAILABLE",
      message: "Gemini is temporarily unavailable. No answer was generated; try again later.",
    };
  }

  if (response.status === 400) {
    return {
      statusCode: 502,
      code: groundingEnabled ? "GEMINI_GROUNDING_REJECTED" : "GEMINI_REQUEST_REJECTED",
      message: groundingEnabled
        ? "Gemini rejected the Google Search request. No web answer was generated; check the model's grounding access and retry."
        : "Gemini rejected the request format. No answer was generated.",
    };
  }

  return {
    statusCode: 502,
    code: "GEMINI_UNAVAILABLE",
    message: "Gemini could not complete this request. No answer was generated.",
  };
}

function getGeminiAnswerText(providerBody) {
  const parts = providerBody?.candidates?.[0]?.content?.parts;
  if (!Array.isArray(parts)) return "";
  return parts
    .map((part) => (typeof part?.text === "string" ? part.text : ""))
    .join("")
    .trim();
}

function getAnswerText(providerBody) {
  const content = providerBody?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content
      .map((part) => (typeof part === "string" ? part : part?.text || ""))
      .join("")
      .trim();
  }
  return "";
}

function consumeChatRateLimit(request) {
  const forwardedFor = request.headers["x-forwarded-for"];
  const forwardedAddresses =
    typeof forwardedFor === "string"
      ? forwardedFor.split(",").map((address) => address.trim()).filter(Boolean)
      : [];
  const clientAddress =
    forwardedAddresses.at(-1) || request.socket.remoteAddress || "unknown";
  const now = Date.now();
  let window = chatRateWindows.get(clientAddress);

  if (!window || now - window.startedAt >= chatRateWindowMs) {
    window = { startedAt: now, count: 0 };
    chatRateWindows.set(clientAddress, window);
  }
  window.count += 1;

  if (chatRateWindows.size > 10_000) {
    for (const [address, entry] of chatRateWindows) {
      if (now - entry.startedAt >= chatRateWindowMs) chatRateWindows.delete(address);
    }
  }

  return {
    allowed: window.count <= maxChatRequestsPerWindow,
    retryAfter: Math.max(1, Math.ceil((window.startedAt + chatRateWindowMs - now) / 1_000)),
  };
}

async function requestGeminiTextFallback({ apiKey, grade, language, message, history, studentMemory }) {
  const contents = [
    ...cleanHistory(history).map(item => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),
    { role: "user", parts: [{ text: message }] },
  ];
  let response;
  try {
    response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${geminiModel}:generateContent`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
        body: JSON.stringify({
          systemInstruction: {
            parts: [{
              text: buildTutorInstructions(
                language,
                grade,
                false,
                "MiniMax is unavailable, and no web search was performed for this fallback answer.",
                false,
                studentMemory,
                founderProfile,
              ),
            }],
          },
          contents,
          generationConfig: { temperature: 0.35, maxOutputTokens: 768 },
        }),
        signal: AbortSignal.timeout(45_000),
      },
    );
  } catch (error) {
    recordGeminiStatus(false, error?.name === "TimeoutError" ? "TUTOR_TIMEOUT" : "TUTOR_UNAVAILABLE");
    throw error;
  }
  const body = await response.json().catch(() => null);
  if (!response.ok) {
    const failure = normalizeGeminiError(response, body, false);
    recordGeminiStatus(false, failure.code);
    throw Object.assign(new Error(failure.message), failure);
  }
  if (body?.promptFeedback?.blockReason) {
    recordGeminiStatus(true);
    throw Object.assign(new Error("Gemini could not answer this prompt under its safety rules."), {
      statusCode: 422,
      code: "GEMINI_PROMPT_BLOCKED",
    });
  }
  const answer = getGeminiAnswerText(body);
  if (!answer) {
    recordGeminiStatus(false, "EMPTY_GEMINI_RESPONSE");
    throw Object.assign(new Error("Gemini returned no answer."), {
      statusCode: 502,
      code: "EMPTY_GEMINI_RESPONSE",
    });
  }
  recordGeminiStatus(true);
  return answer;
}

async function handleAssistantChat(request, response) {
  let input;
  try {
    input = await readJsonBody(request, maxImageRequestBytes);
  } catch (error) {
    sendError(
      response,
      error.statusCode || 400,
      error.statusCode === 413 ? "MESSAGE_TOO_LARGE" : "INVALID_REQUEST",
      error.message,
    );
    return;
  }

  const grade = Number(input?.grade);
  const language = input?.language;
  const message =
    typeof input?.message === "string"
      ? input.message.trim().slice(0, maxMessageLength)
      : input?.imageDataUrl
        ? "Please describe this image and help me understand it."
        : "";

  if (!supportedGrades.has(grade)) {
    sendError(response, 400, "INVALID_GRADE", "Choose Grade 9, 10, 11, or 12.");
    return;
  }
  if (!supportedLanguages.has(language)) {
    sendError(response, 400, "INVALID_LANGUAGE", "Choose automatic detection, English, Amharic, or Afaan Oromoo.");
    return;
  }
  if (!message && !input?.imageDataUrl) {
    sendError(response, 400, "EMPTY_MESSAGE", "Type a question before sending.");
    return;
  }
  const researchStreamRequested = input.streamResearch === true &&
    String(request.headers.accept || "").toLowerCase().includes("text/event-stream");

  const founderAnswer = input.imageDataUrl
    ? null
    : resolveFounderResponse(language, message, input.history, founderProfile);
  if (founderAnswer) {
    sendJson(response, 200, { answer: founderAnswer, source: "persistent_app_knowledge" });
    return;
  }

  const selectedDocumentIds = input.knowledgeDocumentIds ?? [];
  if (!Array.isArray(selectedDocumentIds)) {
    sendError(response, 400, "INVALID_DOCUMENT_SELECTION", "Choose private files from the Knowledge Center.");
    return;
  }
  const personalKnowledgeRequested = input.usePersonalKnowledge === true || selectedDocumentIds.length > 0;
  let personalKnowledgeMatches = [];
  let selectedKnowledgeImage = null;
  let personalKnowledgeContext = "";
  let personalKnowledgeResult;
  if (personalKnowledgeRequested) {
    const auth = getAuth(request);
    if (!auth?.userId) {
      sendError(response, 401, "KNOWLEDGE_SIGN_IN_REQUIRED", "Sign in before using private Knowledge Center files in an AI answer.");
      return;
    }
    try {
      personalKnowledgeMatches = await retrievePrivateKnowledge(pool, auth.userId, message, selectedDocumentIds);
      selectedKnowledgeImage = await loadSelectedPrivateImage(pool, auth.userId, selectedDocumentIds);
      personalKnowledgeContext = buildPrivateKnowledgePrompt(personalKnowledgeMatches);
      if (selectedKnowledgeImage) {
        personalKnowledgeContext = [
          personalKnowledgeContext,
          `The user also explicitly selected the private image file ${JSON.stringify(selectedKnowledgeImage.filename)}. Analyze only visible content in that image.`,
        ].filter(Boolean).join("\n");
      }
      const citedMatches = [
        ...personalKnowledgeMatches,
        ...(selectedKnowledgeImage ? [{
          documentId: selectedKnowledgeImage.id,
          filename: selectedKnowledgeImage.filename,
          displayName: selectedKnowledgeImage.filename,
          pageNumber: null,
        }] : []),
      ];
      const sources = privateKnowledgeSources(citedMatches);
      personalKnowledgeResult = {
        used: personalKnowledgeMatches.length > 0 || Boolean(selectedKnowledgeImage),
        sources,
        notice: sources.length
          ? "The answer can use the selected private files. Review the file references below."
          : "No matching text was found in your private files; this answer may rely on general model knowledge.",
      };
    } catch (error) {
      sendPrivateKnowledgeError(response, error, "Your private files could not be retrieved. No AI answer was sent.");
      return;
    }
  }
  let sharedKnowledgeMatches = [];
  let sharedKnowledgeContext = "";
  let sharedKnowledgeInfo = {
    used: false,
    sources: [],
    notice: "No matching approved Knowledge Center material was found; this answer may use general model knowledge.",
  };
  try {
    sharedKnowledgeMatches = await retrievePrivateKnowledge(pool, sharedKnowledgeOwnerId, message);
    sharedKnowledgeContext = buildPrivateKnowledgePrompt(sharedKnowledgeMatches);
    const sources = sharedKnowledgeSources(sharedKnowledgeMatches);
    sharedKnowledgeInfo = {
      used: sources.length > 0,
      sources,
      notice: sources.length
        ? "This answer may use approved material from the MINA TEACH AI Knowledge Center. Sources are listed below."
        : "No matching approved Knowledge Center material was found; this answer may use general model knowledge.",
    };
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The Knowledge Center could not be checked. No AI answer was sent.");
    return;
  }
  const knowledgeContext = [sharedKnowledgeContext, personalKnowledgeContext].filter(Boolean).join("\n\n");
  const messageWithKnowledge = knowledgeContext
    ? `${knowledgeContext}\n\nUser question:\n${message}`
    : message;

  let imageInput = null;
  if (input.imageDataUrl !== undefined) {
    if (selectedKnowledgeImage) {
      sendError(response, 400, "ONE_IMAGE_AT_A_TIME", "Remove the attached photo or the selected Knowledge Center image, then try again.");
      return;
    }
    try {
      imageInput = await normalizeImageDataUrl(input.imageDataUrl);
    } catch (error) {
      sendError(
        response,
        error.statusCode || 400,
        error.code || "INVALID_IMAGE",
        error.message || "Choose a valid JPG, PNG, or WEBP image.",
      );
      return;
    }
  } else if (selectedKnowledgeImage) {
    try {
      imageInput = await normalizeImageBuffer(selectedKnowledgeImage.buffer, selectedKnowledgeImage.mimeType);
    } catch (error) {
      sendError(response, error.statusCode || 400, error.code || "INVALID_IMAGE", error.message || "The selected private image could not be read.");
      return;
    }
  }

  const studentMemory = normalizeStudentMemory(input.studentMemory);
  const useGemini = shouldUseGeminiForRequest(message, Boolean(imageInput));
  const makeMiniMaxMessages = (systemNotice) => [
    {
      role: "system",
      content: buildTutorInstructions(
        language,
        grade,
        false,
        systemNotice,
        false,
        studentMemory,
        founderProfile,
      ),
    },
    ...cleanHistory(input.history).map(item => ({ role: item.role, content: item.content })),
    { role: "user", content: messageWithKnowledge },
  ];
  const tryMiniMaxFallback = async (errorCode, streamStarted = false) => {
    if (!shouldFallbackGeminiToMiniMax(errorCode, {
      hasImage: Boolean(imageInput),
      miniMaxAvailable: true,
    })) return { attempted: false, answered: false };

    const status = await refreshMiniMaxStatus(true);
    if (!status.configured) {
      return {
        attempted: true,
        answered: false,
        error: Object.assign(new Error(status.message || "MiniMax is not connected."), {
          code: status.code || "MINIMAX_SETUP_REQUIRED",
        }),
      };
    }
    try {
      const result = await requestMiniMaxChat(
        minimaxConnectors,
        makeMiniMaxMessages("Gemini could not complete the current-information request. No web search was performed. Say when current facts cannot be verified, and do not invent or cite web sources."),
        miniMaxChatModel,
      );
      miniMaxStatusCache.checkedAt = Date.now();
      miniMaxStatusCache.configured = true;
      miniMaxStatusCache.code = "";
      miniMaxStatusCache.message = "";
      const notice = "Gemini could not complete a web search. MiniMax answered from general model knowledge; this answer is not web-verified and may not reflect current information.";
      const payload = createMiniMaxFallbackPayload({
        answer: result.answer,
        notice,
        knowledgeCenter: sharedKnowledgeInfo,
        privateKnowledge: personalKnowledgeResult,
      });
      payload.model = result.model;
      if (result.usage) payload.usage = result.usage;
      sendAssistantFallback(response, payload, streamStarted, "Gemini is unavailable; MiniMax is answering without web search.");
      return { attempted: true, answered: true };
    } catch (error) {
      return { attempted: true, answered: false, error };
    }
  };
  const settleGeminiFailure = async (failure, streamStarted = false) => {
    const fallback = await tryMiniMaxFallback(failure.code, streamStarted);
    if (fallback.answered) return true;
    if (fallback.attempted) {
      finishResearchError(
        response,
        503,
        "DUAL_PROVIDER_UNAVAILABLE",
        dualProviderFailureMessage(fallback.error),
        streamStarted,
      );
      return true;
    }
    return false;
  };
  if (!useGemini) {
    const messages = makeMiniMaxMessages("No web search was performed. Do not claim to have checked current sources.");
    try {
      const result = await requestMiniMaxChat(minimaxConnectors, messages, miniMaxChatModel);
      miniMaxStatusCache.checkedAt = Date.now();
      miniMaxStatusCache.configured = true;
      miniMaxStatusCache.code = "";
      miniMaxStatusCache.message = "";
      sendJson(response, 200, {
        answer: result.answer,
        provider: "minimax",
        model: result.model,
        ...(result.usage ? { usage: result.usage } : {}),
        ...(personalKnowledgeResult ? { privateKnowledge: personalKnowledgeResult } : {}),
        knowledgeCenter: sharedKnowledgeInfo,
        webResearch: {
          searched: false,
          sourceCount: 0,
          sources: [],
          notice: sharedKnowledgeInfo.used
            ? "No web search was performed; Knowledge Center references are shown separately."
            : "No web search was performed; this answer is from general model knowledge.",
        },
      });
    } catch (error) {
      console.warn("[assistant] MiniMax chat request failed.", {
        code: error?.code || "MINIMAX_UNAVAILABLE",
        httpStatus: Number(error?.statusCode) || null,
      });
      if (
        ["MINIMAX_SETUP_REQUIRED", "MINIMAX_UNAVAILABLE", "MINIMAX_MODEL_UNAVAILABLE", "MINIMAX_RATE_LIMIT", "MINIMAX_EMPTY_RESPONSE"].includes(error?.code) &&
        process.env.GEMINI_API_KEY?.trim()
      ) {
        try {
          const fallbackAnswer = await requestGeminiTextFallback({
            apiKey: process.env.GEMINI_API_KEY.trim(),
            grade,
            language,
            message: messageWithKnowledge,
            history: input.history,
            studentMemory,
          });
          sendJson(response, 200, {
            answer: fallbackAnswer,
            provider: "gemini",
            providerNotice: "MiniMax is unavailable. This real answer was generated by Gemini; no web search was performed.",
            webResearch: {
              searched: false,
              sourceCount: 0,
              sources: [],
              notice: sharedKnowledgeInfo.used
                ? "No web search was performed; Knowledge Center references are shown separately."
                : "No web search was performed; Gemini provided this fallback answer from model knowledge.",
            },
            ...(personalKnowledgeResult ? { privateKnowledge: personalKnowledgeResult } : {}),
            knowledgeCenter: sharedKnowledgeInfo,
          });
          miniMaxStatusCache.checkedAt = Date.now();
          if (error?.code === "MINIMAX_SETUP_REQUIRED" || error?.code === "MINIMAX_UNAVAILABLE") {
            miniMaxStatusCache.configured = false;
            miniMaxStatusCache.code = error.code;
            miniMaxStatusCache.message = error.message;
          }
          return;
        } catch (fallbackError) {
          console.warn("[assistant] Gemini text fallback failed.", {
            code: fallbackError?.code || "GEMINI_UNAVAILABLE",
            httpStatus: Number(fallbackError?.statusCode) || null,
          });
          sendError(
            response,
            502,
            "DUAL_PROVIDER_UNAVAILABLE",
            "MiniMax is unavailable and Gemini could not provide a fallback. No answer was generated.",
          );
          return;
        }
      }
      sendError(
        response,
        Number(error?.statusCode) || 502,
        error?.code || "MINIMAX_UNAVAILABLE",
        error?.message || "MiniMax could not answer this question. No answer was generated.",
      );
    }
    return;
  }

  const apiKey = process.env.GEMINI_API_KEY?.trim();
  if (!apiKey) {
    recordGeminiStatus(false, "GEMINI_SETUP_REQUIRED");
    const fallback = await tryMiniMaxFallback("GEMINI_SETUP_REQUIRED");
    if (fallback.answered) return;
    if (fallback.attempted) {
      sendError(response, 503, "DUAL_PROVIDER_UNAVAILABLE", dualProviderFailureMessage(fallback.error));
      return;
    }
    sendError(
      response,
      503,
      "GEMINI_SETUP_REQUIRED",
      imageInput
        ? "Image analysis needs a working Gemini connection. The image was not sent; your chat remains saved. Reconnect Gemini and try again."
        : geminiSetupMessage,
    );
    return;
  }

  const imageUsageMonth = utcImageUsageMonth();
  if (imageInput) {
    try {
      const withinVisionCap = await reserveImageAIRequest(
        pool,
        "gemini_vision",
        imageUsageMonth,
        monthlyImageRequestCap,
      );
      if (!withinVisionCap) {
        sendError(response, 429, "GEMINI_VISION_LIMIT", "The app's monthly image-analysis limit has been reached. No image was sent to Gemini.");
        return;
      }
    } catch (error) {
      console.error("[assistant] Image-analysis usage check failed.", { name: error?.name || "Error" });
      sendError(response, 503, "IMAGE_USAGE_UNAVAILABLE", "Image analysis is paused because its usage limit could not be confirmed. No image was sent to Gemini.");
      return;
    }
  }

  const groundingMonth = utcMonthStart();
  let groundingEnabled = false;
  let searchNotice = "";
  if (imageInput) {
    searchNotice = "Google Search is not enabled for image-analysis requests.";
  } else {
    try {
      groundingEnabled = await reserveGroundingRequest(
        pool,
        groundingMonth,
        monthlyGroundingRequestCap,
      );
      if (!groundingEnabled) {
        searchNotice = "The app's monthly web-search safeguard has been reached. No web search was run, so the answer may not reflect current information.";
      }
    } catch (error) {
      console.error("[assistant] Google Search budget check failed.", { name: error?.name || "Error" });
      searchNotice = "Web search is unavailable because its usage limit could not be confirmed. No web search was run.";
    }
  }

  const contents = [
    ...cleanHistory(input.history).map((item) => ({
      role: item.role === "assistant" ? "model" : "user",
      parts: [{ text: item.content }],
    })),
    {
      role: "user",
      parts: [
         { text: messageWithKnowledge },
        ...(imageInput ? [{ inline_data: { mime_type: imageInput.mimeType, data: imageInput.data } }] : []),
      ],
    },
  ];
  const model = geminiModel;
  let researchStreamStarted = false;
  if (researchStreamRequested && groundingEnabled) {
    startResearchEventStream(response);
    researchStreamStarted = true;
    writeResearchEvent(response, "status", {
      state: "searching",
      message: "Search the Web · checking current public sources",
    });
  }
  try {
    const providerResponse = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`,
      {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      body: JSON.stringify({
        systemInstruction: {
          parts: [{ text: buildTutorInstructions(language, grade, groundingEnabled, searchNotice, Boolean(imageInput), studentMemory, founderProfile) }],
        },
        contents,
        ...(groundingEnabled ? { tools: [{ google_search: {} }] } : {}),
        generationConfig: {
          temperature: 0.35,
          maxOutputTokens: 768,
        },
      }),
      signal: AbortSignal.timeout(45_000),
      },
    );

    let providerBody = null;
    try {
      providerBody = await providerResponse.json();
    } catch {
      providerBody = null;
    }

    if (!providerResponse.ok) {
      console.warn("[assistant] Gemini chat request rejected.", {
        httpStatus: providerResponse.status,
        providerStatus: providerBody?.error?.status || null,
        model,
      });
      const failure = normalizeGeminiError(providerResponse, providerBody, groundingEnabled);
      recordGeminiStatus(false, failure.code);
      if (await settleGeminiFailure(failure, researchStreamStarted)) return;
      finishResearchError(response, failure.statusCode, failure.code, failure.message, researchStreamStarted);
      return;
    }

    const blockReason = providerBody?.promptFeedback?.blockReason;
    if (blockReason) {
      recordGeminiStatus(true);
      finishResearchError(
        response,
        422,
        "GEMINI_PROMPT_BLOCKED",
        "Gemini could not answer this prompt under its safety rules. Try rephrasing the question.",
        researchStreamStarted,
      );
      return;
    }

    const grounded = parseGeminiGrounding(providerBody);
    const answer = grounded.answer || getGeminiAnswerText(providerBody);
    if (!answer) {
      const failure = {
        statusCode: 502,
        code: "EMPTY_GEMINI_RESPONSE",
        message: "Gemini returned no answer. Please try asking in a different way.",
      };
      recordGeminiStatus(false, failure.code);
      if (await settleGeminiFailure(failure, researchStreamStarted)) return;
      finishResearchError(
        response,
        failure.statusCode,
        failure.code,
        failure.message,
        researchStreamStarted,
      );
      return;
    }
    recordGeminiStatus(true);

    if (grounded.searchQueryCount > 0) {
      try {
        await recordGroundingQueries(pool, groundingMonth, grounded.searchQueryCount);
      } catch (error) {
        console.error("[assistant] Google Search usage record failed.", { name: error?.name || "Error" });
      }
    }
    if (imageInput) {
      try {
        await recordSuccessfulImage(pool, "gemini_vision", imageUsageMonth);
      } catch (error) {
        console.error("[assistant] Image-analysis usage record failed.", { name: error?.name || "Error" });
      }
    }
    const usageMetadata = imageInput && providerBody?.usageMetadata && typeof providerBody.usageMetadata === "object"
      ? {
          inputTokens: Number(providerBody.usageMetadata.promptTokenCount) || 0,
          outputTokens: Number(providerBody.usageMetadata.candidatesTokenCount) || 0,
          totalTokens: Number(providerBody.usageMetadata.totalTokenCount) || 0,
        }
      : null;
    const answerPayload = {
      answer,
      provider: "gemini",
      imageAnalyzed: Boolean(imageInput),
      ...(usageMetadata ? { imageUsage: usageMetadata } : {}),
      webResearch: {
        searched: grounded.searchedWeb,
        sourceCount: grounded.sources.length,
        sources: grounded.sources,
        notice: grounded.searchedWeb
          ? grounded.sources.length
            ? "Searched the web. This is an AI summary; review the cited sources."
            : "A web search ran, but no usable source citations were returned."
          : imageInput
            ? "The uploaded image was sent for analysis. No web search was performed."
            : sharedKnowledgeInfo.used
              ? "No web search was performed; Knowledge Center references are shown separately."
              : searchNotice || "No web search was performed; this answer is from general model knowledge.",
      },
      ...(personalKnowledgeResult ? { privateKnowledge: personalKnowledgeResult } : {}),
      knowledgeCenter: sharedKnowledgeInfo,
    };
    if (researchStreamStarted) {
      writeResearchEvent(response, "result", answerPayload);
      if (!response.writableEnded) response.end();
    } else {
      sendJson(response, 200, answerPayload);
    }
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      const failure = {
        statusCode: 504,
        code: "TUTOR_TIMEOUT",
        message: "Gemini did not respond before the request timed out. No answer was generated; you can retry later.",
      };
      recordGeminiStatus(false, failure.code);
      if (await settleGeminiFailure(failure, researchStreamStarted)) return;
      finishResearchError(
        response,
        failure.statusCode,
        failure.code,
        failure.message,
        researchStreamStarted,
      );
      return;
    }

    console.error("[assistant] Gemini request failed.", { name: error?.name || "Error" });
    const failure = {
      statusCode: 502,
      code: "TUTOR_UNAVAILABLE",
      message: "Gemini could not connect right now. Please try again shortly.",
    };
    recordGeminiStatus(false, failure.code);
    if (await settleGeminiFailure(failure, researchStreamStarted)) return;
    finishResearchError(
      response,
      failure.statusCode,
      failure.code,
      failure.message,
      researchStreamStarted,
    );
  }
}

async function refreshMiniMaxStatus(force = false) {
  const now = Date.now();
  if (force || now - miniMaxStatusCache.checkedAt > 60_000) {
    miniMaxStatusCache.checkedAt = now;
    miniMaxStatusCache.configured = false;
    miniMaxStatusCache.code = "";
    miniMaxStatusCache.message = "";
    try {
      const providerResponse = await minimaxConnectors.proxy("minimax", "/v1/models", { method: "GET" });
      const providerBody = await providerResponse.json().catch(() => null);
      if (providerResponse.ok && Array.isArray(providerBody?.data)) {
        miniMaxStatusCache.configured = true;
      } else {
        const failure = normalizeMiniMaxChatError(providerResponse, providerBody);
        miniMaxStatusCache.code = failure.code;
        miniMaxStatusCache.message = failure.message;
        console.warn("[assistant] MiniMax status check failed.", {
          httpStatus: providerResponse.status,
          code: failure.code,
        });
      }
    } catch {
      miniMaxStatusCache.code = "MINIMAX_UNAVAILABLE";
      miniMaxStatusCache.message = "The MiniMax connection could not be reached. No billing settings were changed.";
    }
  }
  return miniMaxStatusCache;
}

async function handleAssistantStatus(response) {
  await refreshMiniMaxStatus();
  const geminiConfigured = Boolean(process.env.GEMINI_API_KEY?.trim());
  sendJson(response, 200, {
    provider: "minimax",
    configured: miniMaxStatusCache.configured || geminiConfigured,
    ...(!miniMaxStatusCache.configured && !geminiConfigured ? { code: "SETUP_REQUIRED" } : {}),
    minimaxConfigured: miniMaxStatusCache.configured,
    minimaxModel: miniMaxChatModel,
    minimaxErrorCode: miniMaxStatusCache.code || null,
    geminiConfigured,
    geminiModel: geminiConfigured ? geminiModel : null,
    geminiConnection: publicGeminiConnectionState(geminiConfigured),
    geminiAvailable: geminiStatusCache.available,
    geminiLastErrorCode: geminiStatusCache.code || null,
    googleSearchGrounding: "enabled-when-available",
    monthlyGroundedRequestCap: monthlyGroundingRequestCap,
    message: miniMaxStatusCache.configured
      ? geminiStatusCache.available === false
        ? `MiniMax connection verified for ${miniMaxChatModel}. Gemini's last request failed (${geminiStatusCache.code}); current web research and image analysis may be unavailable.`
        : `MiniMax connection verified for ${miniMaxChatModel}. Gemini is ${publicGeminiConnectionState(geminiConfigured)}.`
      : miniMaxStatusCache.message || (geminiConfigured
        ? geminiStatusCache.available === false
          ? `Both configured providers need attention: MiniMax (${miniMaxStatusCache.code || "unavailable"}); Gemini (${geminiStatusCache.code}).`
          : `MiniMax needs attention. Gemini is configured but ${publicGeminiConnectionState(geminiConfigured)}.`
        : geminiSetupMessage),
  });
}

function publicFilePath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "index.html";
  if (pathname === "/offline.html") return "offline.html";
  if (pathname === "/service-worker.js") return "service-worker.js";
  if (pathname === "/offline-status.js") return "offline-status.js";
  if (pathname === "/manifest.webmanifest") return "manifest.webmanifest";
  if (pathname === "/styles/mina-teach-theme.css") return "styles/mina-teach-theme.css";
  if (pathname === "/privacy" || pathname === "/privacy/") return "privacy/index.html";
  if (pathname === "/terms" || pathname === "/terms/") return "terms/index.html";
  if (pathname.startsWith("/images/")) {
    const imageName = pathname.slice("/images/".length);
    return /^[A-Za-z0-9._-]+\.(?:png|jpe?g|webp)$/i.test(imageName)
      ? `public/images/${imageName}`
      : null;
  }
  if (pathname === "/assistant" || pathname === "/assistant/") {
    return "assistant/index.html";
  }
  if (pathname === "/knowledge" || pathname === "/knowledge/") return "knowledge/index.html";
  if (new Set(["/knowledge/app.js", "/knowledge/styles.css"]).has(pathname)) return pathname.slice(1);
  if (pathname === "/knowledge/templates/knowledge-record-template.jsonl") {
    return "knowledge/templates/knowledge-record-template.jsonl";
  }
  if (pathname === "/image-studio" || pathname === "/image-studio/") {
    return "image-studio/index.html";
  }
  if (pathname === "/learning" || pathname === "/learning/") {
    return "learning/index.html";
  }
  if (pathname === "/learning/knowledge" || pathname === "/learning/knowledge/") return "learning/knowledge.html";
  if (pathname === "/exams" || pathname === "/exams/") return "exams/index.html";
  if (new Set(["/exams/app.js", "/exams/styles.css", "/exams/bootstrap.js"]).has(pathname)) return pathname.slice(1);
  if (pathname === "/admin" || pathname === "/admin/") return "admin/index.html";
  if (pathname === "/admin/knowledge" || pathname === "/admin/knowledge/") return "admin/knowledge.html";
  if (new Set(["/admin/app.js", "/admin/styles.css", "/admin/knowledge.js", "/admin/knowledge.css"]).has(pathname)) return pathname.slice(1);
  if (pathname === "/account" || pathname === "/account/" || pathname.startsWith("/account/sign-in") || pathname.startsWith("/account/sign-up")) {
    return "account-dist/index.html";
  }
  if (pathname.startsWith("/account/assets/")) {
    return `account-dist${pathname.slice("/account".length)}`;
  }

  const allowedTopLevelFiles = new Set(["/Index.html", "/Index.HTml"]);
  if (allowedTopLevelFiles.has(pathname)) return pathname.slice(1);
  if (pathname.startsWith("/assistant/")) return pathname.slice(1);
  if (pathname.startsWith("/knowledge/")) return pathname.slice(1);
  if (pathname.startsWith("/image-studio/")) return pathname.slice(1);
  if (new Set(["/learning/app.js", "/learning/styles.css", "/learning/library.css", "/learning/analytics.css", "/learning/analytics.js", "/learning/notifications.css", "/learning/study-notifications.js", "/learning/history-grade10.js", "/learning/dashboard.js", "/learning/learning-state.js", "/learning/lesson-view.js", "/learning/material-reader.js", "/learning/offline-store.js", "/learning/coverage.html", "/learning/coverage.js", "/learning/knowledge.html", "/learning/knowledge.js", "/learning/knowledge.css"]).has(pathname)) {
    return pathname.slice(1);
  }
  return null;
}

async function serveStatic(pathname, request, response) {
  const relativePath = publicFilePath(pathname);
  if (!relativePath) {
    sendError(response, 404, "NOT_FOUND", "Page not found.");
    return;
  }

  const absolutePath = resolve(projectRoot, relativePath);
  if (!absolutePath.startsWith(`${projectRoot}${sep}`)) {
    sendError(response, 404, "NOT_FOUND", "Page not found.");
    return;
  }

  try {
    const content = await readFile(absolutePath);
    const contentTypes = {
      ".css": "text/css; charset=utf-8",
      ".html": "text/html; charset=utf-8",
      ".htm": "text/html; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".mjs": "text/javascript; charset=utf-8",
      ".svg": "image/svg+xml",
      ".webmanifest": "application/manifest+json; charset=utf-8",
      ".jsonl": "application/x-ndjson; charset=utf-8",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webp": "image/webp",
      ".webp": "image/webp",
    };

    const legacyInlineHashes = pathname === "/Index.HTml" || pathname === "/Index.html"
      ? getLegacyInlineHashes(content.toString("utf8"))
      : null;
    setSecurityHeaders(response, legacyInlineHashes);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(absolutePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      ...(pathname === "/service-worker.js" ? { "Service-Worker-Allowed": "/" } : {}),
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    sendError(response, 404, "NOT_FOUND", "Page not found.");
  }
}

async function requireAuth(request, response, next) {
  const auth = getAuth(request);
  if (!auth?.userId) {
    sendError(response, 401, "UNAUTHORIZED", "Sign in to access your saved account data.");
    return;
  }
  request.userId = auth.userId;
  try {
    await ensureStudentRole(request.userId);
    await bootstrapFirstAdmin(request.userId);
  } catch {
    sendError(response, 500, "ACCOUNT_STORAGE_ERROR", "Account data is temporarily unavailable.");
    return;
  }
  next();
}

function requireRole(...roles) {
  return async (request, response, next) => {
    try {
      const result = await pool.query("SELECT role FROM mina_user_roles WHERE user_id = $1", [request.userId]);
      if (!roles.includes(result.rows[0]?.role)) {
        sendError(response, 403, "FORBIDDEN", "This action requires an authorized content-management account.");
        return;
      }
      next();
    } catch {
      sendError(response, 500, "ACCOUNT_STORAGE_ERROR", "Account data is temporarily unavailable.");
    }
  };
}

function isSameOrigin(request) {
  if (!request.headers.origin) return true;
  try {
    return new URL(request.headers.origin).host === request.headers.host;
  } catch {
    return false;
  }
}

function mergeImported(existing, incoming) {
  if (Array.isArray(existing) && Array.isArray(incoming)) {
    const merged = [...existing];
    const signatures = new Set(existing.map(item => JSON.stringify(item)));
    incoming.forEach(item => { const signature = JSON.stringify(item); if (!signatures.has(signature)) { signatures.add(signature); merged.push(item); } });
    return merged;
  }
  if (existing && incoming && typeof existing === "object" && typeof incoming === "object" && !Array.isArray(existing) && !Array.isArray(incoming)) {
    const merged = { ...incoming, ...existing };
    for (const key of Object.keys(incoming)) if (key in existing) merged[key] = mergeImported(existing[key], incoming[key]);
    return merged;
  }
  return existing === undefined ? incoming : existing;
}

async function ensureStudentRole(userId) {
  await pool.query("INSERT INTO mina_user_roles (user_id, role) VALUES ($1, 'student') ON CONFLICT (user_id) DO NOTHING", [userId]);
}

async function bootstrapFirstAdmin(userId) {
  const available = await pool.query(
    "SELECT email_hash FROM mina_admin_bootstrap WHERE id=1 AND used_by IS NULL AND NOT EXISTS (SELECT 1 FROM mina_user_roles WHERE role='admin')",
  );
  if (!available.rowCount) return false;
  const user = await clerkClient.users.getUser(userId);
  const verifiedHashes = (user.emailAddresses || [])
    .filter(address => address.verification?.status === "verified")
    .map(address => createHash("sha256").update(address.emailAddress.trim().toLowerCase()).digest("hex"));
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const config = await client.query("SELECT email_hash,used_by FROM mina_admin_bootstrap WHERE id=1 FOR UPDATE");
    const admins = await client.query("SELECT 1 FROM mina_user_roles WHERE role='admin' LIMIT 1");
    const row = config.rows[0];
    const storedHash = row ? Buffer.from(row.email_hash.trim(), "hex") : Buffer.alloc(0);
    const ownerEmailMatches = storedHash.length === 32 && verifiedHashes.some(hash => {
      const candidate = Buffer.from(hash, "hex");
      return candidate.length === storedHash.length && timingSafeEqual(candidate, storedHash);
    });
    if (!row || row.used_by || admins.rowCount || !ownerEmailMatches) {
      await client.query("ROLLBACK");
      return false;
    }
    await client.query("UPDATE mina_user_roles SET role='admin' WHERE user_id=$1", [userId]);
    await client.query("UPDATE mina_admin_bootstrap SET used_by=$1,used_at=NOW() WHERE id=1", [userId]);
    await client.query("COMMIT");
    return true;
  } catch (error) {
    await client.query("ROLLBACK").catch(() => {});
    throw error;
  } finally {
    client.release();
  }
}

async function getAccountRecords(userId) {
  const result = await pool.query("SELECT record_type, data FROM mina_user_records WHERE user_id = $1", [userId]);
  return Object.fromEntries(result.rows.map(row => [row.record_type, row.data]));
}

const app = express();
const privateDocumentUpload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: privateKnowledgeLimits.fileBytes, files: 1, fields: 0, parts: 1 },
});
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(clerkMiddleware(request => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(request) || "", process.env.CLERK_PUBLISHABLE_KEY),
})));

app.get("/api/firebase/config", requireAuth, (_request, response) => {
  const config = createFirebaseWebConfig(process.env);
  if (!config) {
    sendError(response, 503, "FIREBASE_SETUP_INCOMPLETE", "Firebase web sign-in is not configured yet. Ask the site administrator to finish Firebase setup.");
    return;
  }
  sendJson(response, 200, {
    config,
    capabilities: {
      googleSignInClientImplemented: true,
      firestoreAccountBackupImplemented: true,
      analyticsMeasurementIdConfigured: Boolean(config.measurementId),
      messagingWebValuesConfigured: Boolean(config.messagingSenderId && process.env.FIREBASE_WEB_VAPID_KEY?.trim()),
      crashlyticsSupportedOnWeb: false,
    },
  });
});

app.get("/api/account/firebase-link", requireAuth, async (request, response) => {
  try {
    await ensureFirebaseIdentitySchema(pool);
    const result = await pool.query(
      "SELECT firebase_uid FROM mina_firebase_identity_links WHERE clerk_user_id=$1",
      [request.userId],
    );
    sendJson(response, 200, {
      linked: Boolean(result.rows[0]?.firebase_uid),
      firebaseUid: result.rows[0]?.firebase_uid || null,
    });
  } catch {
    sendError(response, 503, "FIREBASE_LINK_UNAVAILABLE", "Firebase account-link status is temporarily unavailable.");
  }
});

app.post("/api/account/firebase-link", requireAuth, async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  let client;
  try {
    const input = await readJsonBody(request);
    const config = createFirebaseWebConfig(process.env);
    if (!config) {
      sendError(response, 503, "FIREBASE_SETUP_INCOMPLETE", "Firebase web sign-in is not configured yet.");
      return;
    }
    const { uid } = await verifyFirebaseGoogleIdToken(input?.idToken, config.projectId);
    await ensureFirebaseIdentitySchema(pool);
    client = await pool.connect();
    await client.query("BEGIN");
    const byUid = await client.query(
      "SELECT clerk_user_id FROM mina_firebase_identity_links WHERE firebase_uid=$1 FOR UPDATE",
      [uid],
    );
    const byClerk = await client.query(
      "SELECT firebase_uid FROM mina_firebase_identity_links WHERE clerk_user_id=$1 FOR UPDATE",
      [request.userId],
    );
    if ((byUid.rowCount && byUid.rows[0].clerk_user_id !== request.userId)
        || (byClerk.rowCount && byClerk.rows[0].firebase_uid !== uid)) {
      await client.query("ROLLBACK");
      sendError(response, 409, "FIREBASE_ACCOUNT_ALREADY_LINKED", "That Google account is already linked to a different Mina Teach account.");
      return;
    }
    if (!byUid.rowCount && !byClerk.rowCount) {
      await client.query(
        "INSERT INTO mina_firebase_identity_links (firebase_uid,clerk_user_id) VALUES ($1,$2)",
        [uid, request.userId],
      );
    }
    await client.query("COMMIT");
    sendJson(response, 200, { linked: true, firebaseUid: uid });
  } catch (error) {
    if (client) await client.query("ROLLBACK").catch(() => {});
    sendError(
      response,
      error.statusCode || 503,
      error.code || "FIREBASE_LINK_FAILED",
      error.statusCode ? error.message : "Google sign-in could not be linked. Please retry.",
    );
  } finally {
    client?.release();
  }
});

app.delete("/api/account/firebase-link", requireAuth, async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  try {
    await ensureFirebaseIdentitySchema(pool);
    const result = await pool.query(
      "DELETE FROM mina_firebase_identity_links WHERE clerk_user_id=$1 RETURNING firebase_uid",
      [request.userId],
    );
    sendJson(response, 200, { unlinked: true, wasLinked: Boolean(result.rowCount) });
  } catch {
    sendError(response, 503, "FIREBASE_UNLINK_FAILED", "The Firebase link could not be removed. Please retry.");
  }
});

app.get("/api/account/data", requireAuth, async (request, response) => {
  try {
    await ensureStudentRole(request.userId);
    const [records, roleResult] = await Promise.all([
      getAccountRecords(request.userId),
      pool.query("SELECT role FROM mina_user_roles WHERE user_id = $1", [request.userId]),
    ]);
    sendJson(response, 200, { records, role: roleResult.rows[0]?.role || "student" });
  } catch {
    sendError(response, 500, "ACCOUNT_STORAGE_ERROR", "Your account data could not be loaded.");
  }
});

app.get("/api/account/status", async (request, response) => {
  const userId = getAuth(request)?.userId;
  if (!userId) { sendJson(response, 200, { signedIn: false }); return; }
  try {
    await ensureStudentRole(userId);
    await bootstrapFirstAdmin(userId);
    const result = await pool.query("SELECT role FROM mina_user_roles WHERE user_id=$1", [userId]);
    sendJson(response, 200, { signedIn: true, userId, role: result.rows[0]?.role || "student" });
  } catch { sendError(response,503,"ACCOUNT_STATUS_FAILED","Account storage is temporarily unavailable. Please retry."); }
});

function sendPrivateKnowledgeError(response, error, fallback = "The private Knowledge Center is temporarily unavailable.") {
  const statusCode = Number(error?.statusCode) || 503;
  const code = error?.code || "KNOWLEDGE_STORAGE_UNAVAILABLE";
  if (!error?.statusCode) console.error("[knowledge] Private document operation failed.", { name: error?.name || "Error" });
  sendError(response, statusCode, code, error?.message || fallback);
}

function requireSameOrigin(request, response) {
  if (isSameOrigin(request)) return true;
  sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
  return false;
}

app.get("/api/knowledge/documents", requireAuth, async (request, response) => {
  try {
    const result = await listPrivateDocuments(pool, request.userId, request.query.q || "");
    sendJson(response, 200, result);
  } catch (error) {
    sendPrivateKnowledgeError(response, error);
  }
});

app.post("/api/knowledge/documents", requireAuth, (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;
  privateDocumentUpload.single("file")(request, response, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      sendError(response, 413, "FILE_SIZE_LIMIT", "Each file must be no larger than 8 MB.");
      return;
    }
    sendError(response, 400, "UPLOAD_FAILED", "The file upload could not be read. Try again with one file.");
  });
}, async (request, response) => {
  if (!request.file) {
    sendError(response, 400, "FILE_REQUIRED", "Choose a file to upload.");
    return;
  }
  try {
    const extracted = await extractPrivateDocument({
      filename: request.file.originalname,
      buffer: request.file.buffer,
    });
    const saved = await savePrivateDocument(pool, request.userId, {
      ...extracted,
      id: randomUUID(),
      sha256: createHash("sha256").update(extracted.buffer).digest("hex"),
    });
    sendJson(response, saved.duplicate ? 200 : 201, saved);
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The file could not be processed.");
  }
});

app.patch("/api/knowledge/documents/:id", requireAuth, async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  try {
    const input = await readJsonBody(request, 8_000);
    sendJson(response, 200, { document: await updatePrivateDocument(pool, request.userId, request.params.id, input) });
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The file could not be updated.");
  }
});

app.delete("/api/knowledge/documents/:id", requireAuth, async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  try {
    await deletePrivateDocument(pool, request.userId, request.params.id);
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The file could not be deleted.");
  }
});

app.get("/api/knowledge/documents/:id/file", requireAuth, async (request, response) => {
  try {
    const file = await openPrivateDocument(pool, request.userId, request.params.id);
    const fallbackFilename = file.filename.replace(/["\\\r\n]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 150);
    const encodedFilename = encodeURIComponent(file.filename).replace(/['()]/g, value => `%${value.charCodeAt(0).toString(16)}`);
    const previewable = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/markdown", "text/csv"].includes(file.mimeType);
    setSecurityHeaders(response);
    response.writeHead(200, {
      "Content-Type": file.mimeType,
      "Content-Length": file.byteSize,
      "Content-Disposition": `${previewable ? "inline" : "attachment"}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file.buffer);
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The file could not be opened.");
  }
});

app.get("/api/knowledge/export", requireAuth, async (request, response) => {
  try {
    const documents = await exportPrivateDocuments(pool, request.userId);
    sendJson(response, 200, { exportedAt: new Date().toISOString(), documents });
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "Your private Knowledge Center data could not be exported.");
  }
});

app.get("/api/knowledge/shared/documents", requireAuth, requireRole("admin"), async (request, response) => {
  try {
    sendJson(response, 200, await listPrivateDocuments(pool, sharedKnowledgeOwnerId, request.query.q || ""));
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The shared Knowledge Center could not be loaded.");
  }
});

app.post("/api/knowledge/shared/documents", requireAuth, requireRole("admin"), (request, response, next) => {
  if (!requireSameOrigin(request, response)) return;
  privateDocumentUpload.single("file")(request, response, error => {
    if (!error) return next();
    if (error instanceof multer.MulterError && error.code === "LIMIT_FILE_SIZE") {
      sendError(response, 413, "FILE_SIZE_LIMIT", "Each file must be no larger than 8 MB.");
      return;
    }
    sendError(response, 400, "UPLOAD_FAILED", "The file upload could not be read. Try again with one file.");
  });
}, async (request, response) => {
  if (!request.file) {
    sendError(response, 400, "FILE_REQUIRED", "Choose a file to upload.");
    return;
  }
  try {
    const extracted = await extractPrivateDocument({
      filename: request.file.originalname,
      buffer: request.file.buffer,
    });
    const saved = await savePrivateDocument(pool, sharedKnowledgeOwnerId, {
      ...extracted,
      id: randomUUID(),
      sha256: createHash("sha256").update(extracted.buffer).digest("hex"),
    });
    sendJson(response, saved.duplicate ? 200 : 201, saved);
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The file could not be processed.");
  }
});

app.patch("/api/knowledge/shared/documents/:id", requireAuth, requireRole("admin"), async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  try {
    const input = await readJsonBody(request, 8_000);
    sendJson(response, 200, {
      document: await updatePrivateDocument(pool, sharedKnowledgeOwnerId, request.params.id, input),
    });
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The shared file could not be updated.");
  }
});

app.delete("/api/knowledge/shared/documents/:id", requireAuth, requireRole("admin"), async (request, response) => {
  if (!requireSameOrigin(request, response)) return;
  try {
    await deletePrivateDocument(pool, sharedKnowledgeOwnerId, request.params.id);
    sendJson(response, 200, { deleted: true });
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The shared file could not be deleted.");
  }
});

app.get("/api/knowledge/shared/documents/:id/file", requireAuth, requireRole("admin"), async (request, response) => {
  try {
    const file = await openPrivateDocument(pool, sharedKnowledgeOwnerId, request.params.id);
    const fallbackFilename = file.filename.replace(/["\\\r\n]/g, "_").replace(/[^\x20-\x7e]/g, "_").slice(0, 150);
    const encodedFilename = encodeURIComponent(file.filename).replace(/['()]/g, value => `%${value.charCodeAt(0).toString(16)}`);
    const previewable = ["application/pdf", "image/jpeg", "image/png", "image/webp", "text/plain", "text/markdown", "text/csv", "application/x-ndjson"].includes(file.mimeType);
    setSecurityHeaders(response);
    response.writeHead(200, {
      "Content-Type": file.mimeType,
      "Content-Length": file.byteSize,
      "Content-Disposition": `${previewable ? "inline" : "attachment"}; filename="${fallbackFilename}"; filename*=UTF-8''${encodedFilename}`,
      "Cache-Control": "private, no-store",
      "X-Content-Type-Options": "nosniff",
    });
    response.end(file.buffer);
  } catch (error) {
    sendPrivateKnowledgeError(response, error, "The shared source file could not be opened.");
  }
});

app.get("/api/educator/access", requireAuth, requireRole("teacher", "question_reviewer", "educator", "admin"), (_request, response) => {
  sendJson(response, 200, { authorized: true });
});

app.put("/api/account/data/:type", requireAuth, async (request, response) => {
  const type = request.params.type;
  if (!allowedRecordTypes.has(type)) {
    sendError(response, 400, "INVALID_RECORD_TYPE", "That account data category is not supported.");
    return;
  }
  if (!isSameOrigin(request)) {
    sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
    return;
  }
  try {
    const input = await readJsonBody(request, 1_048_576);
    if (input?.expectedUserId !== undefined && input.expectedUserId !== request.userId) {
      sendError(response,409,"ACCOUNT_CHANGED","Your signed-in account changed. Reload before syncing account data."); return;
    }
    const json = JSON.stringify(input?.data);
    if (!input || !input.data || typeof input.data !== "object" || !json || Buffer.byteLength(json) > 900_000) {
      sendError(response, 400, "INVALID_ACCOUNT_DATA", "Send a supported JSON object or list under 900 KB.");
      return;
    }
    await ensureStudentRole(request.userId);
    await pool.query("INSERT INTO mina_user_records (user_id, record_type, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (user_id, record_type) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()", [request.userId, type, json]);
    sendJson(response, 200, { saved: true });
  } catch (error) {
    sendError(response, error.statusCode || 500, error.statusCode ? "INVALID_REQUEST" : "ACCOUNT_STORAGE_ERROR", error.statusCode ? error.message : "Your data could not be saved.");
  }
});

app.post("/api/account/data/learning/offline-results", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) {
    sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
    return;
  }
  let client;
  try {
    const input = await readJsonBody(request, 120_000);
    if (input?.expectedUserId !== request.userId || !Array.isArray(input.results) || input.results.length > 100) {
      sendError(response, 400, "INVALID_OFFLINE_RESULTS", "The signed-in account or offline results could not be confirmed.");
      return;
    }
    const results = input.results.map(item => {
      if (!item || typeof item.id !== "string" || !/^offline-[A-Za-z0-9-]{20,80}$/.test(item.id) ||
          !["practice", "entrance"].includes(item.mode) ||
          !(item.grade === null || [9, 10, 11, 12].includes(Number(item.grade))) ||
          !(item.subject === null || typeof item.subject === "string" && item.subject.length <= 80) ||
          !Number.isInteger(item.score) || !Number.isInteger(item.total) ||
          ![10, 20, 30, 60].includes(item.total) || item.score < 0 || item.score > item.total ||
          typeof item.completedAt !== "string" || !Number.isFinite(Date.parse(item.completedAt))) return null;
      return {
        id: item.id, grade: item.grade === null ? null : Number(item.grade),
        subject: item.subject || (item.mode === "entrance" ? "Mixed entrance practice" : "Offline practice"),
        lesson: item.mode === "entrance" ? "Downloaded entrance practice" : "Downloaded reviewed practice",
        score: item.score, total: item.total, completedAt: item.completedAt, kind: "offline_reviewed_exam",
      };
    });
    if (results.some(item => !item)) {
      sendError(response, 400, "INVALID_OFFLINE_RESULTS", "One or more device-only results are invalid.");
      return;
    }
    await ensureStudentRole(request.userId);
    client = await pool.connect();
    await client.query("BEGIN");
    const current = await client.query(
      "SELECT data FROM mina_user_records WHERE user_id=$1 AND record_type='learning' FOR UPDATE",
      [request.userId],
    );
    const data = current.rows[0]?.data && typeof current.rows[0].data === "object" ? current.rows[0].data : {};
    const practice = Array.isArray(data.practice) ? data.practice : [];
    const merged = [...new Map([...practice, ...results].map(item => [item.id, item])).values()]
      .sort((a, b) => String(b.completedAt).localeCompare(String(a.completedAt))).slice(0, 200);
    const updated = { ...data, practice: merged };
    if (Buffer.byteLength(JSON.stringify(updated)) > 900_000) {
      await client.query("ROLLBACK");
      sendError(response, 413, "ACCOUNT_DATA_LIMIT", "The learning record is too large to safely add these results.");
      return;
    }
    await client.query(
      "INSERT INTO mina_user_records (user_id,record_type,data) VALUES ($1,'learning',$2::jsonb) ON CONFLICT (user_id,record_type) DO UPDATE SET data=EXCLUDED.data,updated_at=NOW()",
      [request.userId, JSON.stringify(updated)],
    );
    await client.query("COMMIT");
    sendJson(response, 200, { saved: true, received: results.length });
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    sendError(response, 503, "OFFLINE_RESULTS_SYNC_FAILED", "Offline results remain on this device; account synchronization can be retried.");
  } finally { client?.release(); }
});

app.post("/api/account/import", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) {
    sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
    return;
  }
  try {
    const input = await readJsonBody(request, 1_048_576);
    const records = input?.records;
    if (!records || typeof records !== "object" || Array.isArray(records) || Object.keys(records).some(type => !["conversations", "learning"].includes(type))) {
      sendError(response, 400, "INVALID_IMPORT", "Choose valid browser study data to import.");
      return;
    }
    await ensureStudentRole(request.userId);
    for (const [type, incoming] of Object.entries(records)) {
      const current = await pool.query("SELECT data FROM mina_user_records WHERE user_id = $1 AND record_type = $2", [request.userId, type]);
      const merged = mergeImported(current.rows[0]?.data, incoming);
      const json = JSON.stringify(merged);
      if (Buffer.byteLength(json) > 900_000) throw Object.assign(new Error("The imported data is too large."), { statusCode: 413 });
      await pool.query("INSERT INTO mina_user_records (user_id, record_type, data) VALUES ($1, $2, $3::jsonb) ON CONFLICT (user_id, record_type) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()", [request.userId, type, json]);
    }
    sendJson(response, 200, { imported: true, records: await getAccountRecords(request.userId) });
  } catch (error) {
    sendError(response, error.statusCode || 500, error.statusCode ? "INVALID_IMPORT" : "ACCOUNT_STORAGE_ERROR", error.statusCode ? error.message : "Browser data could not be imported.");
  }
});

app.delete("/api/account/data", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) {
    sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
    return;
  }
  let client;
  try {
    await ensurePrivateKnowledgeSchema(pool);
    await ensureFirebaseIdentitySchema(pool);
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("DELETE FROM mina_private_documents WHERE user_id=$1", [request.userId]);
    await client.query("DELETE FROM mina_user_records WHERE user_id = $1", [request.userId]);
    await client.query("DELETE FROM mina_exam_attempts WHERE user_id=$1", [request.userId]);
    await client.query("DELETE FROM mina_question_bookmarks WHERE user_id=$1", [request.userId]);
    await client.query("DELETE FROM mina_firebase_identity_links WHERE clerk_user_id=$1", [request.userId]);
    await client.query("DELETE FROM mina_user_roles WHERE user_id=$1", [request.userId]);
    await client.query("COMMIT");
    try {
      await clerkClient.users.deleteUser(request.userId);
    } catch {
      sendJson(response, 503, {
        error: {
          code: "SIGN_IN_IDENTITY_DELETE_FAILED",
          message: "Saved account data was deleted, but the sign-in identity could not be removed. Contact the site administrator to finish deletion.",
        },
        dataDeleted: true,
      });
      return;
    }
    sendJson(response, 200, { deleted: true, signInIdentityDeleted: true });
  } catch {
    if (client) await client.query("ROLLBACK").catch(() => {});
    sendError(response, 500, "ACCOUNT_STORAGE_ERROR", "Your saved data could not be deleted.");
  } finally {
    client?.release();
  }
});

const questionStreams = new Set(["natural", "social", "common"]);
const difficulties = new Set(["easy", "medium", "hard"]);
const sourceKinds = new Set(["textbook", "teacher_authored", "open_resource", "ai_generated", "legacy"]);
const appRoles = new Set(["student", "teacher", "question_reviewer", "educator", "admin"]);
const contentRoles = ["teacher", "question_reviewer", "educator", "admin"];
const reviewRoles = ["question_reviewer", "admin"];
function isValidQuestionInput(input) {
  if (!input || ![9,10,11,12].includes(Number(input.grade)) || !questionStreams.has(input.stream) ||
      !difficulties.has(input.difficulty) || !sourceKinds.has(input.sourceKind || "teacher_authored") ||
      typeof input.subject !== "string" || !input.subject.trim() ||
      typeof input.chapter !== "string" || !input.chapter.trim() ||
      typeof input.prompt !== "string" || !input.prompt.trim() ||
      typeof input.explanation !== "string" || !input.explanation.trim() ||
      typeof input.sourceLabel !== "string" || !input.sourceLabel.trim() ||
      !Array.isArray(input.choices) || input.choices.length !== 4 ||
      input.choices.some(choice => typeof choice !== "string" || !choice.trim()) ||
      !Number.isInteger(input.correctIndex) || input.correctIndex < 0 || input.correctIndex > 3) return false;
  if (input.sourceUrl) {
    try { if (!["http:", "https:"].includes(new URL(input.sourceUrl).protocol)) return false; }
    catch { return false; }
  }
  return true;
}
function questionFilters(query, approvedOnly = true) {
  const clauses = approvedOnly ? ["review_status = 'approved'", "source_kind <> 'ai_generated'"] : [];
  const params = [];
  const add = (column, value) => { params.push(value); clauses.push(`${column} = $${params.length}`); };
  if (query.grade !== undefined) {
    const grade = Number(query.grade);
    if (![9, 10, 11, 12].includes(grade)) throw new Error("Choose Grade 9, 10, 11, or 12.");
    add("grade", grade);
  }
  if (query.stream) {
    if (!questionStreams.has(query.stream)) throw new Error("Choose Natural Science or Social Science.");
    if (query.stream === "common") add("stream",query.stream);
    else { params.push(query.stream); clauses.push(`stream IN ($${params.length},'common')`); }
  }
  if (query.subject) add("subject", String(query.subject).slice(0, 80));
  if (query.topic) {
    params.push(String(query.topic).trim().slice(0, 120));
    clauses.push(`LOWER(chapter) = LOWER($${params.length})`);
  }
  if (query.difficulty) {
    if (!difficulties.has(query.difficulty)) throw new Error("Choose an available difficulty.");
    add("difficulty", query.difficulty);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}
function publicQuestion(row) {
  return { id: String(row.id), grade: row.grade, stream: row.stream, subject: row.subject, chapter: row.chapter, prompt: row.prompt, choices: row.choices, difficulty: row.difficulty, sourceLabel: row.source_label, sourceKind: row.source_kind || "teacher_authored" };
}

function publicLesson(row) {
  return {
    id: String(row.id), grade: row.grade, stream: row.stream, subject: row.subject,
    chapter: row.chapter, title: row.title, language: row.language, content: row.content,
    examples: row.examples || [], keyPoints: row.key_points || [],
    materials:row.materials,
    materialEndpoint:`/api/learning/content/db-${row.id}/materials`,
    sourceLabel: row.source_label, sourceUrl: row.source_url || null,
  };
}
function validLesson(input) {
  if (!input || ![9, 10, 11, 12].includes(Number(input.grade)) ||
      !questionStreams.has(input.stream) || !["en", "om", "am"].includes(input.language) ||
      !String(input.subject || "").trim() || !String(input.chapter || "").trim() ||
      !String(input.title || "").trim() || !String(input.content || "").trim() ||
      !String(input.sourceLabel || "").trim()) return false;
  if (![input.subject, input.chapter, input.title, input.content, input.sourceLabel].every(value => typeof value === "string")) return false;
  if (input.subject.length > 80 || input.chapter.length > 120 || input.title.length > 180 ||
      input.sourceLabel.length > 300) return false;
  if (!Array.isArray(input.examples || []) || !Array.isArray(input.keyPoints || [])) return false;
  if (![...(input.examples || []), ...(input.keyPoints || [])].every(value => typeof value === "string")) return false;
  if(input.materials!==undefined && materialsProblem(input.materials))return false;
  if (input.sourceUrl) {
    try { if (!["http:", "https:"].includes(new URL(input.sourceUrl).protocol)) return false; }
    catch { return false; }
  }
  return true;
}
function lessonValues(input, userId) {
  return [Number(input.grade), input.stream, input.subject.trim(), input.chapter.trim(), input.title.trim(),
    input.language, input.content, JSON.stringify(input.examples || []), JSON.stringify(input.keyPoints || []),
    input.sourceLabel.trim(), input.sourceUrl || null, userId,input.materials===undefined?null:JSON.stringify(input.materials)];
}

for (const [path, handler] of [["catalog","catalog"],["course","course"],["audit","audit"]]) {
  app.get(`/api/learning/${path}`, async (request,response)=>{
    try { sendJson(response,200,await learningCatalog[handler](request.query)); }
    catch(error) { sendError(response,error instanceof LearningInputError?400:503,"LEARNING_LOAD_FAILED",error instanceof LearningInputError?error.message:"Learning content could not be loaded. Please retry."); }
  });
}
app.get("/api/learning/content/:id",async(request,response)=>{
  try {
    const lesson=await learningCatalog.lesson(request.params.id);
    if (!lesson) { sendError(response,404,"LESSON_NOT_FOUND","This lesson is unavailable or has not been published."); return; }
    sendJson(response,200,{lesson});
  } catch(error) { sendError(response,error instanceof LearningInputError?400:503,"LESSON_LOAD_FAILED",error instanceof LearningInputError?error.message:"The lesson could not be loaded. Please retry."); }
});
app.get("/api/learning/content/:id/materials",async(request,response)=>{
  try {
    const page=await learningCatalog.materials(request.params.id,request.query);
    if(!page){sendError(response,404,"LESSON_NOT_FOUND","This lesson is unavailable or has not been published.");return;}
    sendJson(response,200,page);
  }catch(error){sendError(response,error instanceof LearningInputError?400:503,"MATERIAL_LOAD_FAILED",error instanceof LearningInputError?error.message:"Material could not be loaded. Retry; no sections have been removed.");}
});
app.get("/api/learning/lessons", async (request, response) => {
  try {
    const clauses = ["review_status='published'"], params = [];
    for (const [key, column] of [["grade", "grade"], ["stream", "stream"], ["subject", "subject"], ["language", "language"]]) {
      const value = request.query[key];
      if (value === undefined || value === "") continue;
      if (key === "grade" && ![9, 10, 11, 12].includes(Number(value))) throw new LearningInputError("Choose Grade 9, 10, 11, or 12.");
      if (key === "stream" && !questionStreams.has(value)) throw new LearningInputError("Choose a valid stream.");
      if (key === "language" && !["en", "om", "am"].includes(value)) throw new LearningInputError("Choose English, Afaan Oromoo, or Amharic.");
      params.push(key === "grade" ? Number(value) : String(value).slice(0, 120));
      clauses.push(key === "stream" && value !== "common" ? `${column} IN ($${params.length},'common')` : `${column}=$${params.length}`);
    }
    if (request.query.search) {
      params.push(`%${String(request.query.search).trim().slice(0, 120)}%`);
      clauses.push(`(title ILIKE $${params.length} OR chapter ILIKE $${params.length} OR subject ILIKE $${params.length} OR content ILIKE $${params.length})`);
    }
    const summary = request.query.summary === "1";
    if (summary) clauses.push("length(trim(content))>=80 AND length(trim(source_label))>0");
    const offset = Math.max(0,Math.min(100000,Number(request.query.offset)||0));
    if (!Number.isInteger(offset)) throw new LearningInputError("Choose a valid page.");
    const fields = summary ? "id,grade,stream,subject,chapter,title,language,source_label,source_url" : "id,grade,stream,subject,chapter,title,language,content,examples,key_points,source_label,source_url";
    const limit = summary?20:200;
    const result = await pool.query(`SELECT ${fields} FROM mina_learning_lessons WHERE ${clauses.join(" AND ")} ORDER BY subject,chapter,title,id LIMIT ${limit+1} OFFSET ${offset}`, params);
    sendJson(response, 200, { lessons: result.rows.slice(0,limit).map(publicLesson),nextOffset:result.rows.length>limit?offset+limit:null });
  } catch (error) { sendError(response, error instanceof LearningInputError ?400:503, "LESSON_LOAD_FAILED",error instanceof LearningInputError ?error.message:"Lessons could not be loaded. Please retry."); }
});
app.get("/api/learning/lessons/manage", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    const offset=Number(request.query.offset ?? 0);
    if(!Number.isSafeInteger(offset) || offset<0){sendError(response,400,"INVALID_PAGE","Choose a valid lesson page.");return;}
    const result = await pool.query("SELECT id,grade,stream,subject,chapter,title,language,source_label,source_url,review_status FROM mina_learning_lessons ORDER BY id LIMIT 21 OFFSET $1",[offset]);
    sendJson(response, 200, { lessons: result.rows.slice(0,20).map(row => ({ ...publicLesson(row), reviewStatus: row.review_status })),nextOffset:result.rows.length>20?offset+20:null });
  } catch { sendError(response, 500, "LESSON_LOAD_FAILED", "Lesson drafts could not be loaded."); }
});
app.get("/api/learning/lessons/manage/:id",requireAuth,requireRole(...contentRoles),async(request,response)=>{
  try {
    if(!/^[1-9]\d{0,17}$/.test(request.params.id)){sendError(response,400,"INVALID_LESSON","Choose a valid lesson.");return;}
    const result=await pool.query("SELECT * FROM mina_learning_lessons WHERE id=$1",[request.params.id]);
    if(!result.rows.length){sendError(response,404,"LESSON_NOT_FOUND","Lesson not found.");return;}
    sendJson(response,200,{lesson:{...publicLesson(result.rows[0]),reviewStatus:result.rows[0].review_status}});
  }catch{sendError(response,503,"LESSON_LOAD_FAILED","The full lesson could not be loaded. Retry before editing.");}
});
app.post("/api/learning/lessons", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request,2_097_152);
    if (!validLesson(input)) { sendError(response, 400, "INVALID_LESSON", input.materials!==undefined && materialsProblem(input.materials) || "Complete the lesson fields and include a source label."); return; }
    const result = await pool.query("INSERT INTO mina_learning_lessons (grade,stream,subject,chapter,title,language,content,examples,key_points,source_label,source_url,created_by,updated_by,materials) VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9::jsonb,$10,$11,$12,$12,COALESCE($13::jsonb,'[]'::jsonb)) RETURNING id,review_status", lessonValues(input, request.userId));
    sendJson(response, 201, { id: String(result.rows[0].id), reviewStatus: result.rows[0].review_status });
  } catch (error) {
    sendError(response, error.statusCode || (error.code === "23505" ? 409 : 400), "LESSON_SAVE_FAILED", error.statusCode?error.message:error.code === "23505" ? "A lesson with this grade, subject, chapter, title, and language already exists." : "The lesson could not be saved.");
  }
});
app.put("/api/learning/lessons/:id", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request,2_097_152);
    if (!validLesson(input)) { sendError(response, 400, "INVALID_LESSON", input.materials!==undefined && materialsProblem(input.materials) || "Complete the lesson fields and include a source label."); return; }
    const values = lessonValues(input, request.userId);
    const result = await pool.query("UPDATE mina_learning_lessons SET grade=$1,stream=$2,subject=$3,chapter=$4,title=$5,language=$6,content=$7,examples=$8::jsonb,key_points=$9::jsonb,source_label=$10,source_url=$11,updated_by=$12,materials=COALESCE($13::jsonb,materials),content_version=content_version+1,review_status='draft',reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW() WHERE id=$14 RETURNING id", [...values,request.params.id]);
    if (!result.rowCount) { sendError(response, 404, "LESSON_NOT_FOUND", "Lesson not found."); return; }
    sendJson(response, 200, { updated: true, reviewStatus: "draft" });
  } catch(error) { sendError(response, error.statusCode || 400, "LESSON_UPDATE_FAILED",error.statusCode?error.message:"The lesson could not be updated."); }
});
app.post("/api/learning/lessons/:id/materials",requireAuth,requireRole(...contentRoles),async(request,response)=>{
  try {
    if(!isSameOrigin(request)){sendError(response,403,"CROSS_ORIGIN_BLOCKED","This request is not allowed.");return;}
    if(!/^[1-9]\d{0,17}$/.test(request.params.id)){sendError(response,400,"INVALID_LESSON","Choose a valid lesson.");return;}
    const material=await readJsonBody(request,2_097_152);
    const problem=materialProblem(material);
    if(problem){sendError(response,400,"INVALID_MATERIAL",problem);return;}
    const result=await pool.query(`UPDATE mina_learning_lessons SET materials=materials || $2::jsonb,content_version=content_version+1,
      review_status='draft',reviewed_by=NULL,reviewed_at=NULL,updated_by=$3,updated_at=NOW()
      WHERE id=$1 AND NOT EXISTS (SELECT 1 FROM jsonb_array_elements(materials) AS section WHERE section->>'id'=$4) RETURNING id`,
      [request.params.id,JSON.stringify([material]),request.userId,material.id]);
    if(!result.rowCount){sendError(response,409,"MATERIAL_NOT_APPENDED","The lesson is missing or that material ID already exists. Existing content was not replaced.");return;}
    sendJson(response,201,{saved:true,reviewStatus:"draft"});
  }catch(error){sendError(response,error.statusCode || 503,"MATERIAL_SAVE_FAILED",error.statusCode?error.message:"The material could not be saved. No section was shortened.");}
});
app.post("/api/learning/lessons/:id/review", requireAuth, requireRole(...reviewRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    if (!["published", "rejected"].includes(input.status)) { sendError(response, 400, "INVALID_REVIEW", "Choose publish or reject."); return; }
    const result = await pool.query("UPDATE mina_learning_lessons SET review_status=$1,reviewed_by=$2,reviewed_at=NOW(),updated_at=NOW() WHERE id=$3 RETURNING id", [input.status, request.userId, request.params.id]);
    if (!result.rowCount) { sendError(response, 404, "LESSON_NOT_FOUND", "Lesson not found."); return; }
    sendJson(response, 200, { status: input.status });
  } catch { sendError(response, 500, "LESSON_REVIEW_FAILED", "The lesson review could not be saved."); }
});

app.get("/api/general-knowledge/categories", async (request, response) => {
  try {
    sendJson(response, 200, await generalKnowledgeCenter.categories(request.query.language || "en"));
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_LOAD_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "General Knowledge categories could not be loaded.");
  }
});

app.get("/api/general-knowledge/lessons", async (request, response) => {
  try {
    sendJson(response, 200, await generalKnowledgeCenter.lessons(request.query));
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_LOAD_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "General Knowledge lessons could not be loaded.");
  }
});

app.get("/api/general-knowledge/lessons/:slug", async (request, response) => {
  try {
    const lesson = await generalKnowledgeCenter.lesson(request.params.slug, request.query.language || "en");
    if (!lesson) {
      sendError(response, 404, "GENERAL_KNOWLEDGE_NOT_FOUND", "This lesson is not available or has not been reviewed and published.");
      return;
    }
    sendJson(response, 200, { lesson });
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_LOAD_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "The lesson could not be loaded.");
  }
});

app.get("/api/general-knowledge/manage", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    sendJson(response, 200, await generalKnowledgeCenter.manageList(request.query));
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_REVIEW_LOAD_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "The review queue could not be loaded.");
  }
});

app.get("/api/general-knowledge/manage/:slug", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    const lesson = await generalKnowledgeCenter.manageLesson(request.params.slug, request.query.language || "en");
    if (!lesson) {
      sendError(response, 404, "GENERAL_KNOWLEDGE_NOT_FOUND", "This draft was not found.");
      return;
    }
    sendJson(response, 200, { lesson });
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_REVIEW_LOAD_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "The draft could not be loaded.");
  }
});

app.post("/api/general-knowledge/manage", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request, 2_097_152);
    sendJson(response, 201, await generalKnowledgeCenter.save(input, request.userId));
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : error.statusCode || 503, "GENERAL_KNOWLEDGE_SAVE_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : error.message || "The lesson draft could not be saved.");
  }
});

app.put("/api/general-knowledge/manage/:slug", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request, 2_097_152);
    sendJson(response, 200, await generalKnowledgeCenter.save(input, request.userId, request.params.slug));
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : error.statusCode || 503, "GENERAL_KNOWLEDGE_SAVE_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : error.message || "The lesson draft could not be saved.");
  }
});

app.post("/api/general-knowledge/manage/:slug/review", requireAuth, requireRole(...reviewRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    const result = await generalKnowledgeCenter.review(
      request.params.slug, input.language || request.query.language || "en", input.status, request.userId,
    );
    if (!result) { sendError(response, 404, "GENERAL_KNOWLEDGE_NOT_FOUND", "This lesson draft was not found."); return; }
    sendJson(response, 200, result);
  } catch (error) {
    sendError(response, error instanceof GeneralKnowledgeError ? error.status : 503, "GENERAL_KNOWLEDGE_REVIEW_FAILED",
      error instanceof GeneralKnowledgeError ? error.message : "The lesson review could not be saved.");
  }
});

app.get("/api/questions", async (request, response) => {
  try {
    const { where, params } = questionFilters(request.query);
    const [count, result] = await Promise.all([
      pool.query(`SELECT COUNT(*)::int AS count FROM mina_questions ${where}`, params),
      pool.query(`SELECT id,grade,stream,subject,chapter,prompt,choices,difficulty,source_label,source_kind FROM mina_questions ${where} ORDER BY id LIMIT 200`, params),
    ]);
    sendJson(response, 200, { count: count.rows[0].count, questions: result.rows.map(publicQuestion), official: false });
  } catch (error) {
    sendError(response, 400, "INVALID_FILTER", error.message);
  }
});

app.get("/api/questions/offline-download", async (request, response) => {
  try {
    const mode = request.query.mode === "entrance" ? "entrance" : "practice";
    const limit = Number(request.query.limit);
    if (![10, 20, 30, 60].includes(limit)) {
      sendError(response, 400, "INVALID_OFFLINE_QUESTION_COUNT", "Download 10, 20, 30, or 60 questions.");
      return;
    }
    const { where, params } = questionFilters(mode === "entrance" ? {} : request.query);
    const sql = mode === "entrance"
      ? `SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind FROM (SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind,ROW_NUMBER() OVER (PARTITION BY grade,subject ORDER BY random()) AS mix_rank FROM mina_questions ${where}) mixed ORDER BY mix_rank,random() LIMIT $${params.length + 1}`
      : `SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind FROM mina_questions ${where} ORDER BY id LIMIT $${params.length + 1}`;
    const result = await pool.query(sql, [...params, limit]);
    if (result.rows.length < limit) {
      sendError(response, 409, "OFFLINE_QUESTION_SET_INSUFFICIENT", `This download needs ${limit} reviewed questions; only ${result.rows.length} match the selection.`);
      return;
    }
    sendJson(response, 200, {
      count: result.rows.length,
      questions: result.rows.map(row => ({
        ...publicQuestion(row),
        correctIndex: row.correct_index,
        explanation: row.explanation,
      })),
      official: false,
      use: "Downloaded review questions for local practice. Offline scores are saved on this device and are not official exam results.",
    });
  } catch (error) {
    sendError(response, 400, "INVALID_FILTER", error.message);
  }
});

app.get("/api/questions/manage", requireAuth, requireRole(...contentRoles), async (_request, response) => {
  try {
    const result = await pool.query("SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_url,source_kind,review_status FROM mina_questions ORDER BY created_at DESC LIMIT 300");
    sendJson(response, 200, { questions: result.rows });
  } catch { sendError(response, 500, "QUESTION_MANAGEMENT_FAILED", "Questions could not be loaded."); }
});

app.get("/api/admin/status", requireAuth, requireRole(...reviewRoles), async (_request, response) => {
  try {
    const result = await pool.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER (WHERE review_status='draft')::int AS drafts,COUNT(*) FILTER (WHERE review_status='approved')::int AS approved,COUNT(*) FILTER (WHERE review_status='rejected')::int AS rejected,COUNT(*) FILTER (WHERE review_status='approved' AND source_kind<>'ai_generated')::int AS exam_eligible FROM mina_questions");
    sendJson(response, 200, result.rows[0]);
  } catch { sendError(response, 500, "ADMIN_DASHBOARD_FAILED", "Question summary could not be loaded."); }
});

app.get("/api/admin/users", requireAuth, requireRole("admin"), async (_request, response) => {
  try {
    const result = await pool.query("SELECT user_id,role FROM mina_user_roles ORDER BY role,user_id LIMIT 500");
    sendJson(response, 200, { users: result.rows });
  } catch { sendError(response, 500, "ROLE_LIST_FAILED", "Account roles could not be loaded."); }
});

app.put("/api/admin/users/:userId/role", requireAuth, requireRole("admin"), async (request, response) => {
  if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
  const userId = String(request.params.userId || "");
  if (!/^user_[A-Za-z0-9_-]{4,80}$/.test(userId)) { sendError(response, 400, "INVALID_USER_ID", "Choose a valid account."); return; }
  let client;
  try {
    const input = await readJsonBody(request);
    if (!appRoles.has(input?.role)) { sendError(response, 400, "INVALID_ROLE", "Choose an available account role."); return; }
    client = await pool.connect();
    await client.query("BEGIN");
    await client.query("SELECT id FROM mina_admin_bootstrap WHERE id=1 FOR UPDATE");
    const target = await client.query("SELECT role FROM mina_user_roles WHERE user_id=$1 FOR UPDATE", [userId]);
    if (!target.rowCount) { await client.query("ROLLBACK"); sendError(response, 404, "USER_NOT_FOUND", "The account must sign in once before its role can be changed."); return; }
    const admins = await client.query("SELECT COUNT(*)::int AS count FROM mina_user_roles WHERE role='admin'");
    if (target.rows[0].role === "admin" && input.role !== "admin" && admins.rows[0].count <= 1) {
      await client.query("ROLLBACK"); sendError(response, 409, "LAST_ADMIN", "The last administrator cannot be removed."); return;
    }
    await client.query("UPDATE mina_user_roles SET role=$1 WHERE user_id=$2", [input.role,userId]);
    await client.query("COMMIT");
    sendJson(response, 200, { updated: true, role: input.role });
  } catch {
    if (client) await client.query("ROLLBACK").catch(()=>{});
    sendError(response, 500, "ROLE_UPDATE_FAILED", "The account role could not be changed.");
  } finally { client?.release(); }
});

app.post("/api/exams", requireAuth, async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    if (input?.mode && !["practice", "entrance"].includes(input.mode)) { sendError(response, 400, "INVALID_EXAM_MODE", "Choose practice or entrance exam mode."); return; }
    const mode = input?.mode === "entrance" ? "entrance" : "practice";
    const questionCount = mode === "entrance" ? 60 : Number(input?.questionCount || 60);
    if (![10, 20, 30, 60].includes(questionCount)) { sendError(response, 400, "INVALID_QUESTION_COUNT", "Choose 10, 20, 30, or 60 questions."); return; }
    const { where, params } = questionFilters(mode === "entrance" ? {} : input || {});
    const available = await pool.query(`SELECT COUNT(*)::int AS count FROM mina_questions ${where}`, params);
    const count = available.rows[0].count;
    if (count < questionCount) { sendError(response, 409, "QUESTION_BANK_INSUFFICIENT", `This session requires ${questionCount} approved matches; only ${count} are available.`); return; }
    const total = questionCount;
    const selectionSql = mode === "entrance"
      ? `SELECT id,grade,stream,subject,chapter,prompt,choices,difficulty,source_label,source_kind FROM (SELECT id,grade,stream,subject,chapter,prompt,choices,difficulty,source_label,source_kind,ROW_NUMBER() OVER (PARTITION BY grade,subject ORDER BY random()) AS mix_rank FROM mina_questions ${where}) mixed ORDER BY mix_rank,random() LIMIT $${params.length + 1}`
      : `SELECT id,grade,stream,subject,chapter,prompt,choices,difficulty,source_label,source_kind FROM mina_questions ${where} ORDER BY random() LIMIT $${params.length + 1}`;
    const selected = await pool.query(selectionSql, [...params, total]);
    const ids = selected.rows.map(row => String(row.id));
    const grade = mode === "entrance" ? null : Number(input.grade);
    const stream = mode === "entrance" ? null : input.stream;
    const attempt = await pool.query("INSERT INTO mina_exam_attempts (user_id,mode,grade,stream,subject,difficulty,question_ids,total,score) VALUES ($1,$2,$3,$4,$5,$6,$7::bigint[],$8,0) RETURNING id,started_at", [request.userId, mode, grade, stream, mode === "entrance" ? null : input.subject || null, mode === "entrance" ? null : input.difficulty || null, ids, total]);
    sendJson(response, 201, { attemptId: String(attempt.rows[0].id), startedAt: attempt.rows[0].started_at, mode, total, availableCount: count, questions: selected.rows.map(publicQuestion), timerSeconds: mode === "entrance" ? 60 : null });
  } catch (error) {
    sendError(response, error.statusCode || 400, "EXAM_START_FAILED", error.message || "The practice exam could not be started.");
  }
});

app.post("/api/exams/:id/answer", requireAuth, async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const attempt = await pool.query("SELECT mode,question_ids,answers,submitted_at FROM mina_exam_attempts WHERE id=$1 AND user_id=$2", [request.params.id, request.userId]);
    if (!attempt.rowCount) { sendError(response, 404, "ATTEMPT_NOT_FOUND", "This practice session was not found."); return; }
    if (attempt.rows[0].mode !== "practice") { sendError(response, 409, "NOT_PRACTICE_MODE", "Immediate feedback is only available in practice mode."); return; }
    if (attempt.rows[0].submitted_at) { sendError(response, 409, "ATTEMPT_SUBMITTED", "This practice session is already complete."); return; }
    const input = await readJsonBody(request);
    const id = String(input?.questionId || "");
    if (!attempt.rows[0].question_ids.map(String).includes(id) || !Number.isInteger(input?.choice) || input.choice < 0 || input.choice > 3) {
      sendError(response, 400, "INVALID_ANSWER", "Choose one of the four options for a question in this session."); return;
    }
    const result = await pool.query("SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind FROM mina_questions WHERE id=$1 AND review_status='approved' AND source_kind<>'ai_generated'", [id]);
    if (!result.rowCount) { sendError(response, 404, "QUESTION_NOT_AVAILABLE", "This reviewed question is no longer available."); return; }
    const question = result.rows[0], answers = { ...(attempt.rows[0].answers || {}), [id]: input.choice };
    const all = await pool.query("SELECT id,correct_index FROM mina_questions WHERE id=ANY($1::bigint[]) AND review_status='approved' AND source_kind<>'ai_generated'", [attempt.rows[0].question_ids]);
    const score = all.rows.filter(row => Number.isInteger(answers[String(row.id)]) && answers[String(row.id)] === row.correct_index).length;
    const saved = await pool.query("UPDATE mina_exam_attempts SET answers=$1::jsonb,score=$2 WHERE id=$3 AND user_id=$4 AND submitted_at IS NULL", [JSON.stringify(answers), score, request.params.id, request.userId]);
    if (!saved.rowCount) { sendError(response, 409, "ATTEMPT_SUBMITTED", "This practice session is already complete."); return; }
    sendJson(response, 200, { questionId: id, selectedIndex: input.choice, correctIndex: question.correct_index, correctAnswer: question.choices[question.correct_index], explanation: question.explanation, isCorrect: input.choice === question.correct_index, score });
  } catch { sendError(response, 500, "PRACTICE_ANSWER_FAILED", "The answer could not be saved."); }
});

app.post("/api/exams/:id/submit", requireAuth, async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const attempt = await pool.query("SELECT * FROM mina_exam_attempts WHERE id = $1 AND user_id = $2", [request.params.id, request.userId]);
    if (!attempt.rowCount) { sendError(response, 404, "ATTEMPT_NOT_FOUND", "This exam attempt was not found."); return; }
    const ids = attempt.rows[0].question_ids.map(String);
    const rows = await pool.query("SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind FROM mina_questions WHERE id = ANY($1::bigint[])", [ids]);
    const byId = new Map(rows.rows.map(row => [String(row.id), row]));
    const makeReview = answers => ids.map(id => {
      const question = byId.get(id);
      const choice = Number.isInteger(answers[id]) && answers[id] >= 0 && answers[id] < 4 ? answers[id] : null;
      return { ...publicQuestion(question), selectedIndex: choice, correctIndex: question.correct_index, explanation: question.explanation, isCorrect: choice === question.correct_index };
    });
    if (attempt.rows[0].submitted_at) {
      const savedAnswers = attempt.rows[0].answers || {};
      const savedScore = Number(attempt.rows[0].score) || 0;
      sendJson(response, 200, { score: savedScore, total: ids.length, percentage: Math.round(savedScore / ids.length * 100), review: makeReview(savedAnswers) });
      return;
    }
    const input = await readJsonBody(request);
    const answers = input?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) { sendError(response, 400, "INVALID_ANSWERS", "Submit a choice for each question."); return; }
    const review = makeReview(answers);
    const score = review.filter(question => question.isCorrect).length;
    const saved = await pool.query("UPDATE mina_exam_attempts SET answers=$1::jsonb,score=$2,submitted_at=NOW() WHERE id=$3 AND user_id=$4 AND submitted_at IS NULL RETURNING id", [JSON.stringify(answers), score, request.params.id, request.userId]);
    if (!saved.rowCount) {
      const completed = await pool.query("SELECT answers,score,submitted_at FROM mina_exam_attempts WHERE id=$1 AND user_id=$2", [request.params.id, request.userId]);
      if (!completed.rowCount || !completed.rows[0].submitted_at) { sendError(response, 409, "ALREADY_SUBMITTED", "This exam attempt has already been submitted."); return; }
      const savedScore = Number(completed.rows[0].score) || 0;
      sendJson(response, 200, { score: savedScore, total: ids.length, percentage: Math.round(savedScore / ids.length * 100), review: makeReview(completed.rows[0].answers || {}) });
      return;
    }
    sendJson(response, 200, { score, total: ids.length, percentage: Math.round(score / ids.length * 100), review });
  } catch {
    sendError(response, 500, "EXAM_SUBMIT_FAILED", "The result could not be saved.");
  }
});

app.get("/api/exams/history", requireAuth, async (request, response) => {
  try {
    sendJson(response, 200, await getExamHistory(pool,request.userId));
  } catch { sendError(response, 500, "EXAM_HISTORY_FAILED", "Exam history could not be loaded."); }
});

app.post("/api/questions", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    if (!isValidQuestionInput(input)) {
      sendError(response, 400, "INVALID_QUESTION", "Provide grade, stream, subject, chapter, four choices, answer, explanation, difficulty, and source.");
      return;
    }
    const result = await pool.query("INSERT INTO mina_questions (grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_url,source_kind,review_status,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,'draft',$13,$13) RETURNING id,review_status", [Number(input.grade), input.stream, String(input.subject).slice(0,80), String(input.chapter).slice(0,120), String(input.prompt).slice(0,1000), JSON.stringify(input.choices.map(value=>String(value).slice(0,300))), input.correctIndex, String(input.explanation).slice(0,2000), input.difficulty, String(input.sourceLabel).slice(0,300), input.sourceUrl ? String(input.sourceUrl).slice(0,500) : null, input.sourceKind || "teacher_authored", request.userId]);
    sendJson(response, 201, { questionId: String(result.rows[0].id), reviewStatus: "draft" });
  } catch { sendError(response, 500, "QUESTION_SAVE_FAILED", "The question could not be saved."); }
});

app.post("/api/questions/import", requireAuth, requireRole(...contentRoles), async (request, response) => {
  if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
  let client;
  try {
    const input = await readJsonBody(request, 1_500_000);
    const questions = Array.isArray(input) ? input : input?.questions;
    if (!Array.isArray(questions) || questions.length < 1 || questions.length > 200 || !questions.every(isValidQuestionInput)) {
      sendError(response, 400, "INVALID_QUESTION_BATCH", "Upload 1–200 complete questions with four choices, explanations, difficulty, and source labels.");
      return;
    }
    client = await pool.connect();
    await client.query("BEGIN");
    const ids = [];
    for (const question of questions) {
      const result = await client.query(
        "INSERT INTO mina_questions (grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_url,source_kind,review_status,created_by,updated_by) VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7,$8,$9,$10,$11,$12,'draft',$13,$13) RETURNING id",
        [Number(question.grade),question.stream,question.subject.trim().slice(0,80),question.chapter.trim().slice(0,120),question.prompt.trim().slice(0,1000),JSON.stringify(question.choices.map(choice=>choice.trim().slice(0,300))),question.correctIndex,question.explanation.trim().slice(0,2000),question.difficulty,question.sourceLabel.trim().slice(0,300),question.sourceUrl?.trim().slice(0,500)||null,question.sourceKind||"teacher_authored",request.userId],
      );
      ids.push(String(result.rows[0].id));
    }
    await client.query("COMMIT");
    sendJson(response, 201, { imported: ids.length, reviewStatus: "draft" });
  } catch {
    if (client) await client.query("ROLLBACK").catch(()=>{});
    sendError(response, 500, "QUESTION_IMPORT_FAILED", "The question batch could not be imported.");
  } finally { client?.release(); }
});

app.put("/api/questions/:id", requireAuth, requireRole(...contentRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    if (!isValidQuestionInput(input)) {
      sendError(response, 400, "INVALID_QUESTION", "Question fields are incomplete or invalid."); return;
    }
    const result = await pool.query("UPDATE mina_questions SET grade=$1,stream=$2,subject=$3,chapter=$4,prompt=$5,choices=$6::jsonb,correct_index=$7,explanation=$8,difficulty=$9,source_label=$10,source_url=$11,source_kind=$12,review_status='draft',reviewed_by=NULL,reviewed_at=NULL,updated_by=$13,updated_at=NOW() WHERE id=$14 RETURNING id", [Number(input.grade),input.stream,String(input.subject).slice(0,80),String(input.chapter).slice(0,120),String(input.prompt).slice(0,1000),JSON.stringify(input.choices.map(value=>String(value).slice(0,300))),input.correctIndex,String(input.explanation).slice(0,2000),input.difficulty,String(input.sourceLabel).slice(0,300),input.sourceUrl?String(input.sourceUrl).slice(0,500):null,input.sourceKind || "teacher_authored",request.userId,request.params.id]);
    if (!result.rowCount) { sendError(response,404,"QUESTION_NOT_FOUND","Question not found."); return; }
    sendJson(response,200,{updated:true,reviewStatus:"draft"});
  } catch { sendError(response,500,"QUESTION_UPDATE_FAILED","The question could not be updated."); }
});

app.post("/api/questions/:id/review", requireAuth, requireRole(...reviewRoles), async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const input = await readJsonBody(request);
    if (!["approved", "rejected"].includes(input.status)) { sendError(response, 400, "INVALID_REVIEW", "Choose approved or rejected."); return; }
    const result = await pool.query("UPDATE mina_questions SET review_status=$1,reviewed_by=$2,reviewed_at=NOW(),updated_by=$2,updated_at=NOW() WHERE id=$3 RETURNING id", [input.status, request.userId, request.params.id]);
    if (!result.rowCount) { sendError(response, 404, "QUESTION_NOT_FOUND", "Question not found."); return; }
    sendJson(response, 200, { reviewed: true, status: input.status });
  } catch { sendError(response, 500, "REVIEW_FAILED", "The review status could not be saved."); }
});

app.get("/api/questions/bookmarks", requireAuth, async (request, response) => {
  try {
    const result = await pool.query("SELECT q.id,q.grade,q.stream,q.subject,q.chapter,q.prompt,q.choices,q.difficulty,q.source_label FROM mina_question_bookmarks b JOIN mina_questions q ON q.id=b.question_id WHERE b.user_id=$1 ORDER BY b.created_at DESC LIMIT 200", [request.userId]);
    sendJson(response, 200, { questions: result.rows.map(publicQuestion) });
  } catch { sendError(response, 500, "BOOKMARKS_FAILED", "Saved questions could not be loaded."); }
});

app.put("/api/questions/:id/bookmark", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
  try {
    const result = await pool.query(
      "WITH eligible AS (SELECT id FROM mina_questions WHERE id=$2 AND review_status='approved'), saved AS (INSERT INTO mina_question_bookmarks (user_id,question_id) SELECT $1,id FROM eligible ON CONFLICT DO NOTHING RETURNING question_id) SELECT EXISTS(SELECT 1 FROM eligible) AS eligible",
      [request.userId, request.params.id],
    );
    if (!result.rows[0]?.eligible) { sendError(response, 404, "QUESTION_NOT_AVAILABLE", "Only approved questions can be saved."); return; }
    sendJson(response, 200, { saved: true });
  } catch { sendError(response, 400, "BOOKMARK_FAILED", "This question could not be saved."); }
});

app.delete("/api/questions/:id/bookmark", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
  try { await pool.query("DELETE FROM mina_question_bookmarks WHERE user_id=$1 AND question_id=$2", [request.userId, request.params.id]); sendJson(response, 200, { deleted: true }); }
  catch { sendError(response, 500, "BOOKMARK_FAILED", "This saved question could not be removed."); }
});

async function lockStudyNotificationPreferences(client, userId) {
  await client.query(
    "INSERT INTO mina_user_records (user_id,record_type,data) VALUES ($1,'preferences','{}'::jsonb) ON CONFLICT (user_id,record_type) DO NOTHING",
    [userId],
  );
  const result=await client.query(
    "SELECT data FROM mina_user_records WHERE user_id=$1 AND record_type='preferences' FOR UPDATE",
    [userId],
  );
  const data=result.rows[0]?.data;
  return data&&typeof data==="object"&&!Array.isArray(data)?data:{};
}

app.get("/api/study-notifications/preferences",requireAuth,async(request,response)=>{
  if(!isSameOrigin(request)){sendError(response,403,"CROSS_ORIGIN_BLOCKED","This request is not allowed.");return;}
  try {
    const result=await pool.query(
      "SELECT data FROM mina_user_records WHERE user_id=$1 AND record_type='preferences'",
      [request.userId],
    );
    sendJson(response,200,{notifications:normalizeStudyNotifications(result.rows[0]?.data?.studyNotifications)});
  } catch {sendError(response,503,"NOTIFICATION_PREFERENCES_UNAVAILABLE","Your notification preferences could not be loaded.");}
});

app.put("/api/study-notifications/preferences",requireAuth,async(request,response)=>{
  if(!isSameOrigin(request)){sendError(response,403,"CROSS_ORIGIN_BLOCKED","This request is not allowed.");return;}
  let client;
  try {
    const input=await readJsonBody(request);
    client=await pool.connect();
    await client.query("BEGIN");
    const data=await lockStudyNotificationPreferences(client,request.userId);
    const notifications=updateStudyNotifications(data.studyNotifications,input);
    const updated={...data,studyNotifications:notifications};
    const serialized=JSON.stringify(updated);
    if(Buffer.byteLength(serialized)>900_000) {
      await client.query("ROLLBACK");
      sendError(response,413,"ACCOUNT_DATA_LIMIT","Your notification preferences could not be saved because the account preferences are too large.");
      return;
    }
    await client.query(
      "UPDATE mina_user_records SET data=$2::jsonb,updated_at=NOW() WHERE user_id=$1 AND record_type='preferences'",
      [request.userId,serialized],
    );
    await client.query("COMMIT");
    sendJson(response,200,{saved:true,notifications});
  } catch(error) {
    if(client)await client.query("ROLLBACK").catch(()=>{});
    sendError(response,error instanceof TypeError?400:503,
      error instanceof TypeError?"INVALID_NOTIFICATION_PREFERENCES":"NOTIFICATION_PREFERENCES_UNAVAILABLE",
      error instanceof TypeError?error.message:"Your notification preferences could not be saved.");
  } finally {client?.release();}
});

app.get("/api/study-notifications/events",requireAuth,async(request,response)=>{
  if(!isSameOrigin(request)){sendError(response,403,"CROSS_ORIGIN_BLOCKED","This request is not allowed.");return;}
  const throttle=consumeStudyNoticePoll(studyNotificationPolls,request.userId);
  if(!throttle.allowed) {
    response.setHeader("Retry-After",String(throttle.retryAfterSeconds));
    sendError(response,429,"NOTIFICATION_POLL_LIMIT","New-content checks are limited to once per minute.");
    return;
  }
  let client;
  try {
    client=await pool.connect();
    await client.query("BEGIN");
    const data=await lockStudyNotificationPreferences(client,request.userId);
    const notifications=normalizeStudyNotifications(data.studyNotifications);
    if(!notifications.contentNoticesEnabled||!notifications.contentNoticesSince) {
      await client.query("COMMIT");
      sendJson(response,200,{events:[],limit:MAX_STUDY_NOTICE_EVENTS});
      return;
    }
    const result=await client.query(PUBLISHED_STUDY_EVENTS_SQL,[
      notifications.contentNoticesSince,
      notifications.contentCursor?.at||null,
      notifications.contentCursor?.key||"",
    ]);
    const events=result.rows.map(publicStudyNotice);
    let updatedNotifications=notifications;
    if(events.length) {
      const lastEvent=events.at(-1);
      updatedNotifications={...notifications,contentCursor:{at:lastEvent.publishedAt,key:lastEvent.eventKey}};
      await client.query(
        "UPDATE mina_user_records SET data=$2::jsonb,updated_at=NOW() WHERE user_id=$1 AND record_type='preferences'",
        [request.userId,JSON.stringify({...data,studyNotifications:updatedNotifications})],
      );
    }
    await client.query("COMMIT");
    sendJson(response,200,{events,limit:MAX_STUDY_NOTICE_EVENTS});
  } catch {
    if(client)await client.query("ROLLBACK").catch(()=>{});
    sendError(response,503,"STUDY_NOTICES_UNAVAILABLE","New published content could not be checked. Your preferences remain saved.");
  } finally {client?.release();}
});

app.use(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/api/assistant/status") {
    await handleAssistantStatus(response);
    return;
  }

  if (pathname === "/api/image-studio/process") {
    if (request.method !== "POST") {
      sendError(response, 405, "METHOD_NOT_ALLOWED", "Use POST to edit or generate an image.");
      return;
    }
    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
          return;
        }
      } catch {
        sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
        return;
      }
    }
    const rateLimit = consumeChatRateLimit(request);
    if (!rateLimit.allowed) {
      response.setHeader("Retry-After", String(rateLimit.retryAfter));
      sendError(response, 429, "RATE_LIMITED", "Too many image requests from this connection. Please wait and try again.");
      return;
    }
    await handleImageStudioRequest({
      request,
      response,
      pool,
      connectors: minimaxConnectors,
      readJsonBody,
      sendJson,
      sendError,
    });
    return;
  }

  if (pathname === "/api/assistant/chat") {
    if (request.method !== "POST") {
      sendError(response, 405, "METHOD_NOT_ALLOWED", "Use POST to send a tutor question.");
      return;
    }

    const origin = request.headers.origin;
    if (origin) {
      try {
        if (new URL(origin).host !== request.headers.host) {
          sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
          return;
        }
      } catch {
        sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed.");
        return;
      }
    }

    const rateLimit = consumeChatRateLimit(request);
    if (!rateLimit.allowed) {
      response.setHeader("Retry-After", String(rateLimit.retryAfter));
      sendError(
        response,
        429,
        "RATE_LIMITED",
        "Too many tutor requests from this connection. Please wait a minute and try again.",
      );
      return;
    }

    await handleAssistantChat(request, response);
    return;
  }

  if (pathname === "/.well-known/assetlinks.json") {
    try {
      const assetLinksPath = resolve(projectRoot, "android/assetlinks.json");
      const content = await readFile(assetLinksPath);
      setSecurityHeaders(response);
      response.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "public, max-age=300",
        "Content-Length": content.length,
      });
      response.end(request.method === "HEAD" ? undefined : content);
    } catch {
      sendError(response, 404, "ASSET_LINKS_NOT_CONFIGURED", "Android app signing fingerprints have not been configured.");
    }
    return;
  }

  if (request.method !== "GET" && request.method !== "HEAD") {
    sendError(response, 405, "METHOD_NOT_ALLOWED", "This request method is not supported.");
    return;
  }

  try {
    await serveStatic(decodeURIComponent(pathname), request, response);
  } catch {
    sendError(response, 400, "INVALID_PATH", "This page address is not valid.");
  }
});

app.listen(port, host, () => {
  console.log(`Mina Teach is listening on ${host}:${port}`);
});

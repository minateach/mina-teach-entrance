import { readFile } from "node:fs/promises";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ReplitConnectors } from "@replit/connectors-sdk";
import express from "express";
import { clerkMiddleware, getAuth } from "@clerk/express";
import { publishableKeyFromHost } from "@clerk/shared/keys";
import pg from "pg";
import { CLERK_PROXY_PATH, clerkProxyMiddleware, getClerkProxyHost } from "./server/middlewares/clerkProxyMiddleware.mjs";

const projectRoot = resolve(fileURLToPath(new URL(".", import.meta.url)));
const port = Number(process.env.PORT || 5000);
const host = "0.0.0.0";
const maxBodyBytes = 20 * 1024;
const maxHistoryMessages = 10;
const maxMessageLength = 2_000;
const supportedGrades = new Set([9, 10, 11, 12]);
const supportedLanguages = new Set(["en", "am", "om"]);
const connectors = new ReplitConnectors();
const { Pool } = pg;
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const allowedRecordTypes = new Set(["conversations", "learning", "preferences"]);
const chatRateWindows = new Map();
const chatRateWindowMs = 60_000;
const maxChatRequestsPerWindow = 30;

const languageNames = {
  en: "English",
  am: "Amharic",
  om: "Afaan Oromoo",
};

const setupMessage =
  "The AI tutor is not connected yet. Connect or update MiniMax in Replit Integrations, then restart the app. Your conversation stays in this browser.";

function setSecurityHeaders(response) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  response.setHeader(
    "Content-Security-Policy",
    "default-src 'self'; connect-src 'self' https://*.clerk.accounts.dev https://clerk-telemetry.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com; img-src 'self' data: https://*.clerk.accounts.dev https://img.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' https://*.clerk.accounts.dev https://cdn.protect.clerk.com; worker-src 'self' blob:; frame-src https://*.clerk.accounts.dev; font-src 'self' https://fonts.gstatic.com data:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'",
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
      const error = new Error("This message is too large. Shorten it and try again.");
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

function buildTutorInstructions(language, grade) {
  return [
    "You are MINA TEACH AI's patient educational tutor for Ethiopian students preparing for the National University Entrance Examination.",
    'MINA TEACH AI\'s mission is: "Dhaloota beekumsa omishuudha."',
    `The student is in Grade ${grade}. Write your answer in ${languageNames[language]}.`,
    "Support English, Mathematics, Physics, Chemistry, Biology, Geography, History, Economics, and Civics, along with related entrance-exam study questions.",
    "Explain difficult ideas in clear, numbered steps. For calculations, show the method, units, and a brief check of the answer.",
    "When the student asks to explain an English question in Afaan Oromoo, translate the question and choices into Afaan Oromoo, explain key English words, and then reason through the answer in Afaan Oromoo.",
    "When asked to create practice, write a Grade-appropriate multiple-choice question with four options, identify the correct answer, and give a concise explanation. Label generated material as practice, not as an official past exam.",
    "Do not claim that a question comes from an official Ethiopian exam unless the student provided a verifiable source. Do not invent curriculum facts; say when you are unsure and encourage checking the student's textbook or official syllabus.",
    "Be encouraging and concise. Ask one clarifying question when the student's request is too broad to answer accurately.",
  ].join(" ");
}

function normalizeProviderError(response, providerBody) {
  const providerCode = Number(providerBody?.base_resp?.status_code);
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
      message: setupMessage,
    };
  }

  if (response.status === 429 || providerCode === 1002 || providerCode === 2056) {
    return {
      statusCode: 429,
      code: "RATE_LIMITED",
      message: "The tutor is receiving many requests right now. Please wait a moment and try again.",
    };
  }

  return {
    statusCode: 502,
    code: "PROVIDER_ERROR",
    message: "The tutor could not answer right now. Please try again in a moment.",
  };
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

async function handleAssistantChat(request, response) {
  let input;
  try {
    input = await readJsonBody(request);
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
    typeof input?.message === "string" ? input.message.trim().slice(0, maxMessageLength) : "";

  if (!supportedGrades.has(grade)) {
    sendError(response, 400, "INVALID_GRADE", "Choose Grade 9, 10, 11, or 12.");
    return;
  }
  if (!supportedLanguages.has(language)) {
    sendError(response, 400, "INVALID_LANGUAGE", "Choose English, Amharic, or Afaan Oromoo.");
    return;
  }
  if (!message) {
    sendError(response, 400, "EMPTY_MESSAGE", "Type a question before sending.");
    return;
  }

  const messages = [
    { role: "system", content: buildTutorInstructions(language, grade) },
    ...cleanHistory(input.history),
    { role: "user", content: message },
  ];

  try {
    const providerResponse = await connectors.proxy("minimax", "/v1/chat/completions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: process.env.MINIMAX_MODEL || "MiniMax-M3",
        messages,
        temperature: 0.35,
        max_tokens: 1_000,
      }),
      signal: AbortSignal.timeout(45_000),
    });

    let providerBody = null;
    try {
      providerBody = await providerResponse.json();
    } catch {
      providerBody = null;
    }

    const providerCode = Number(providerBody?.base_resp?.status_code);
    if (!providerResponse.ok || (Number.isFinite(providerCode) && providerCode !== 0)) {
      const failure = normalizeProviderError(providerResponse, providerBody);
      sendError(response, failure.statusCode, failure.code, failure.message);
      return;
    }

    const answer = getAnswerText(providerBody);
    if (!answer) {
      sendError(
        response,
        502,
        "EMPTY_PROVIDER_RESPONSE",
        "The tutor returned an empty answer. Please try asking in a different way.",
      );
      return;
    }

    sendJson(response, 200, { answer });
  } catch (error) {
    if (error?.name === "TimeoutError" || error?.name === "AbortError") {
      sendError(
        response,
        504,
        "TUTOR_TIMEOUT",
        "The tutor is taking longer than expected. Please try again.",
      );
      return;
    }

    const details = String(error?.message || "").toLowerCase();
    if (
      details.includes("not connected") ||
      details.includes("unauthorized") ||
      details.includes("credential") ||
      details.includes("authentication")
    ) {
      sendError(response, 503, "SETUP_REQUIRED", setupMessage);
      return;
    }

    console.error("[assistant] MiniMax request failed.");
    sendError(
      response,
      502,
      "TUTOR_UNAVAILABLE",
      "The tutor could not connect right now. Please try again shortly.",
    );
  }
}

async function handleAssistantStatus(response) {
  try {
    const providerResponse = await connectors.proxy("minimax", "/v1/models", {
      method: "GET",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(10_000),
    });

    let providerBody = null;
    try {
      providerBody = await providerResponse.json();
    } catch {
      providerBody = null;
    }

    const providerCode = Number(providerBody?.base_resp?.status_code);
    if (!providerResponse.ok || (Number.isFinite(providerCode) && providerCode !== 0)) {
      const failure = normalizeProviderError(providerResponse, providerBody);
      const unavailableMessage =
        failure.code === "SETUP_REQUIRED"
          ? failure.message
          : "MiniMax could not be reached right now. Refresh this page and try again.";
      sendJson(response, 200, {
        provider: "minimax",
        configured: false,
        code: failure.code,
        message: unavailableMessage,
      });
      return;
    }

    sendJson(response, 200, {
      provider: "minimax",
      configured: true,
      message: "MiniMax is ready through Replit Integrations.",
    });
  } catch (error) {
    const details = String(error?.message || "").toLowerCase();
    const message =
      details.includes("not connected") ||
      details.includes("unauthorized") ||
      details.includes("credential") ||
      details.includes("authentication")
        ? setupMessage
        : "MiniMax could not be reached right now. Refresh this page and try again.";
    sendJson(response, 200, {
      provider: "minimax",
      configured: false,
      code:
        message === setupMessage ? "SETUP_REQUIRED" : "PROVIDER_UNAVAILABLE",
      message,
    });
  }
}

function publicFilePath(pathname) {
  if (pathname === "/" || pathname === "/index.html") return "index.html";
  if (pathname === "/assistant" || pathname === "/assistant/") {
    return "assistant/index.html";
  }
  if (pathname === "/learning" || pathname === "/learning/") {
    return "learning/index.html";
  }
  if (pathname === "/account" || pathname === "/account/" || pathname.startsWith("/account/sign-in") || pathname.startsWith("/account/sign-up")) {
    return "account-dist/index.html";
  }
  if (pathname.startsWith("/account/assets/")) {
    return `account-dist${pathname.slice("/account".length)}`;
  }

  const allowedTopLevelFiles = new Set(["/Index.html", "/Index.HTml"]);
  if (allowedTopLevelFiles.has(pathname)) return pathname.slice(1);
  if (pathname.startsWith("/assistant/")) return pathname.slice(1);
  if (new Set(["/learning/app.js", "/learning/styles.css"]).has(pathname)) {
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
      ".svg": "image/svg+xml",
      ".png": "image/png",
      ".jpg": "image/jpeg",
      ".webp": "image/webp",
    };

    setSecurityHeaders(response);
    response.writeHead(200, {
      "Content-Type": contentTypes[extname(absolutePath).toLowerCase()] || "application/octet-stream",
      "Cache-Control": "no-store",
      "Content-Length": content.length,
    });
    response.end(request.method === "HEAD" ? undefined : content);
  } catch {
    sendError(response, 404, "NOT_FOUND", "Page not found.");
  }
}

function requireAuth(request, response, next) {
  const auth = getAuth(request);
  if (!auth?.userId) {
    sendError(response, 401, "UNAUTHORIZED", "Sign in to access your saved account data.");
    return;
  }
  request.userId = auth.userId;
  next();
}

function requireRole(...roles) {
  return async (request, response, next) => {
    try {
      const result = await pool.query("SELECT role FROM mina_user_roles WHERE user_id = $1", [request.userId]);
      if (!roles.includes(result.rows[0]?.role)) {
        sendError(response, 403, "FORBIDDEN", "This action requires an authorized educator account.");
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

async function getAccountRecords(userId) {
  const result = await pool.query("SELECT record_type, data FROM mina_user_records WHERE user_id = $1", [userId]);
  return Object.fromEntries(result.rows.map(row => [row.record_type, row.data]));
}

const app = express();
app.use(CLERK_PROXY_PATH, clerkProxyMiddleware());
app.use(clerkMiddleware(request => ({
  publishableKey: publishableKeyFromHost(getClerkProxyHost(request) || "", process.env.CLERK_PUBLISHABLE_KEY),
})));

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

app.get("/api/educator/access", requireAuth, requireRole("educator", "admin"), (_request, response) => {
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
  try {
    await pool.query("DELETE FROM mina_user_records WHERE user_id = $1", [request.userId]);
    sendJson(response, 200, { deleted: true });
  } catch {
    sendError(response, 500, "ACCOUNT_STORAGE_ERROR", "Your saved data could not be deleted.");
  }
});

app.use(async (request, response) => {
  const requestUrl = new URL(request.url || "/", "http://localhost");
  const pathname = requestUrl.pathname;

  if (request.method === "GET" && pathname === "/api/assistant/status") {
    await handleAssistantStatus(response);
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

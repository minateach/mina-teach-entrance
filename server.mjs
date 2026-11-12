import { readFile } from "node:fs/promises";
import { createHash, timingSafeEqual } from "node:crypto";
import { extname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { ReplitConnectors } from "@replit/connectors-sdk";
import express from "express";
import { clerkClient, clerkMiddleware, getAuth } from "@clerk/express";
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

function getLegacyInlineHashes(html) {
  const hash = value => `'sha256-${createHash("sha256").update(value).digest("base64")}'`;
  const scripts = [...html.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script\s*>/gi)].map(match => hash(match[1]));
  const handlers = [...html.matchAll(/\bon\w+\s*=\s*(["'])(.*?)\1/gi)].map(match => hash(match[2]));
  return { scripts: [...new Set(scripts)], handlers: [...new Set(handlers)] };
}

function setSecurityHeaders(response, legacyInlineHashes = null) {
  response.setHeader("X-Content-Type-Options", "nosniff");
  response.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  response.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=()");
  const inlineScriptSources = legacyInlineHashes?.scripts.length ? ` ${legacyInlineHashes.scripts.join(" ")}` : "";
  const inlineHandlerSources = legacyInlineHashes?.handlers.length
    ? ` 'unsafe-hashes' ${legacyInlineHashes.handlers.join(" ")}`
    : "";
  response.setHeader(
    "Content-Security-Policy",
    `default-src 'self'; connect-src 'self' https://*.clerk.accounts.dev https://clerk-telemetry.com https://cdn.protect.clerk.com https://*.client.protect.clerk.com; img-src 'self' data: https://*.clerk.accounts.dev https://img.clerk.com; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; script-src 'self' https://*.clerk.accounts.dev https://cdn.protect.clerk.com${inlineScriptSources}${inlineHandlerSources}; worker-src 'self' blob:; frame-src https://*.clerk.accounts.dev; font-src 'self' https://fonts.gstatic.com data:; base-uri 'self'; form-action 'self'; frame-ancestors 'self'`,
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
  if (pathname === "/exams" || pathname === "/exams/") return "exams/index.html";
  if (new Set(["/exams/app.js", "/exams/styles.css"]).has(pathname)) return pathname.slice(1);
  if (pathname === "/admin" || pathname === "/admin/") return "admin/index.html";
  if (new Set(["/admin/app.js", "/admin/styles.css"]).has(pathname)) return pathname.slice(1);
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

    const legacyInlineHashes = pathname === "/Index.HTml" || pathname === "/Index.html"
      ? getLegacyInlineHashes(content.toString("utf8"))
      : null;
    setSecurityHeaders(response, legacyInlineHashes);
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

app.get("/api/account/status", async (request, response) => {
  const userId = getAuth(request)?.userId;
  if (!userId) { sendJson(response, 200, { signedIn: false }); return; }
  try {
    await ensureStudentRole(userId);
    await bootstrapFirstAdmin(userId);
    const result = await pool.query("SELECT role FROM mina_user_roles WHERE user_id=$1", [userId]);
    sendJson(response, 200, { signedIn: true, role: result.rows[0]?.role || "student" });
  } catch { sendJson(response, 200, { signedIn: true, role: "student" }); }
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
    add("stream", query.stream);
  }
  if (query.subject) add("subject", String(query.subject).slice(0, 80));
  if (query.difficulty) {
    if (!difficulties.has(query.difficulty)) throw new Error("Choose an available difficulty.");
    add("difficulty", query.difficulty);
  }
  return { where: clauses.length ? `WHERE ${clauses.join(" AND ")}` : "", params };
}
function publicQuestion(row) {
  return { id: String(row.id), grade: row.grade, stream: row.stream, subject: row.subject, chapter: row.chapter, prompt: row.prompt, choices: row.choices, difficulty: row.difficulty, sourceLabel: row.source_label, sourceKind: row.source_kind || "teacher_authored" };
}

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
    const { where, params } = questionFilters(input || {});
    const available = await pool.query(`SELECT COUNT(*)::int AS count FROM mina_questions ${where}`, params);
    const count = available.rows[0].count;
    if (!count) { sendError(response, 409, "QUESTION_BANK_EMPTY", "No reviewed questions match these choices yet."); return; }
    const total = Math.min(60, count);
    const selected = await pool.query(`SELECT id,grade,stream,subject,chapter,prompt,choices,difficulty,source_label,source_kind FROM mina_questions ${where} ORDER BY random() LIMIT $${params.length + 1}`, [...params, total]);
    const ids = selected.rows.map(row => String(row.id));
    const attempt = await pool.query("INSERT INTO mina_exam_attempts (user_id,grade,stream,subject,difficulty,question_ids,total,score) VALUES ($1,$2,$3,$4,$5,$6::bigint[],$7,0) RETURNING id,started_at", [request.userId, Number(input.grade), input.stream, input.subject || null, input.difficulty || null, ids, total]);
    sendJson(response, 201, { attemptId: String(attempt.rows[0].id), startedAt: attempt.rows[0].started_at, total, availableCount: count, questions: selected.rows.map(publicQuestion), timerSeconds: 60 });
  } catch (error) {
    sendError(response, error.statusCode || 400, "EXAM_START_FAILED", error.message || "The practice exam could not be started.");
  }
});

app.post("/api/exams/:id/submit", requireAuth, async (request, response) => {
  try {
    if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
    const attempt = await pool.query("SELECT * FROM mina_exam_attempts WHERE id = $1 AND user_id = $2", [request.params.id, request.userId]);
    if (!attempt.rowCount) { sendError(response, 404, "ATTEMPT_NOT_FOUND", "This exam attempt was not found."); return; }
    if (attempt.rows[0].submitted_at) { sendError(response, 409, "ALREADY_SUBMITTED", "This exam attempt has already been submitted."); return; }
    const input = await readJsonBody(request);
    const answers = input?.answers;
    if (!answers || typeof answers !== "object" || Array.isArray(answers)) { sendError(response, 400, "INVALID_ANSWERS", "Submit a choice for each question."); return; }
    const ids = attempt.rows[0].question_ids.map(String);
    const rows = await pool.query("SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_kind FROM mina_questions WHERE id = ANY($1::bigint[])", [ids]);
    const byId = new Map(rows.rows.map(row => [String(row.id), row]));
    let score = 0;
    const review = ids.map(id => {
      const question = byId.get(id);
      const choice = Number.isInteger(answers[id]) && answers[id] >= 0 && answers[id] < 4 ? answers[id] : null;
      const correct = choice === question.correct_index;
      if (correct) score += 1;
      return { ...publicQuestion(question), selectedIndex: choice, correctIndex: question.correct_index, explanation: question.explanation, isCorrect: correct };
    });
    await pool.query("UPDATE mina_exam_attempts SET answers=$1::jsonb,score=$2,submitted_at=NOW() WHERE id=$3 AND user_id=$4", [JSON.stringify(answers), score, request.params.id, request.userId]);
    sendJson(response, 200, { score, total: ids.length, percentage: Math.round(score / ids.length * 100), review });
  } catch {
    sendError(response, 500, "EXAM_SUBMIT_FAILED", "The result could not be saved.");
  }
});

app.get("/api/exams/history", requireAuth, async (request, response) => {
  try {
    const result = await pool.query("SELECT id,grade,stream,subject,difficulty,score,total,started_at,submitted_at FROM mina_exam_attempts WHERE user_id=$1 ORDER BY started_at DESC LIMIT 100", [request.userId]);
    sendJson(response, 200, { attempts: result.rows });
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
    await pool.query("INSERT INTO mina_question_bookmarks (user_id,question_id) SELECT $1,id FROM mina_questions WHERE id=$2 AND review_status='approved' ON CONFLICT DO NOTHING", [request.userId, request.params.id]);
    sendJson(response, 200, { saved: true });
  } catch { sendError(response, 400, "BOOKMARK_FAILED", "This question could not be saved."); }
});

app.delete("/api/questions/:id/bookmark", requireAuth, async (request, response) => {
  if (!isSameOrigin(request)) { sendError(response, 403, "CROSS_ORIGIN_BLOCKED", "This request is not allowed."); return; }
  try { await pool.query("DELETE FROM mina_question_bookmarks WHERE user_id=$1 AND question_id=$2", [request.userId, request.params.id]); sendJson(response, 200, { deleted: true }); }
  catch { sendError(response, 500, "BOOKMARK_FAILED", "This saved question could not be removed."); }
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

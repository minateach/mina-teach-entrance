import { getAuth } from "firebase-admin/auth";
import { getApps, initializeApp } from "firebase-admin/app";

const projectIdPattern = /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/;

function value(env, name) {
  return typeof env?.[name] === "string" ? env[name].trim() : "";
}

export function createFirebaseWebConfig(env = process.env) {
  const projectId = value(env, "FIREBASE_PROJECT_ID");
  const apiKey = value(env, "FIREBASE_WEB_API_KEY");
  const authDomain = value(env, "FIREBASE_AUTH_DOMAIN");
  const appId = value(env, "FIREBASE_APP_ID");

  if (
    !projectIdPattern.test(projectId) ||
    !apiKey ||
    !/^[a-z0-9.-]+$/i.test(authDomain) ||
    !/^1:\d+:web:[A-Za-z0-9]+$/.test(appId)
  ) {
    return null;
  }

  const config = { apiKey, authDomain, projectId, appId };
  const messagingSenderId = value(env, "FIREBASE_MESSAGING_SENDER_ID");
  if (/^\d{6,20}$/.test(messagingSenderId)) config.messagingSenderId = messagingSenderId;

  const measurementId = value(env, "FIREBASE_MEASUREMENT_ID");
  if (/^G-[A-Z0-9]{5,}$/i.test(measurementId)) config.measurementId = measurementId;

  return config;
}

function firebaseAdminAuth(projectId) {
  if (!projectIdPattern.test(projectId || "")) {
    throw new Error("Firebase project ID is not configured.");
  }
  const appName = `mina-teach-firebase-${projectId}`;
  const app = getApps().find((candidate) => candidate.name === appName)
    || initializeApp({ projectId }, appName);
  return getAuth(app);
}

export async function verifyFirebaseGoogleIdToken(idToken, projectId) {
  if (typeof idToken !== "string" || idToken.length < 100 || idToken.length > 12_000) {
    const error = new Error("The Google sign-in token is invalid.");
    error.statusCode = 401;
    error.code = "FIREBASE_TOKEN_INVALID";
    throw error;
  }

  let decoded;
  try {
    decoded = await firebaseAdminAuth(projectId).verifyIdToken(idToken);
  } catch {
    const error = new Error("Google sign-in could not be verified. Sign in again and retry.");
    error.statusCode = 401;
    error.code = "FIREBASE_TOKEN_INVALID";
    throw error;
  }

  if (!decoded?.uid || decoded.firebase?.sign_in_provider !== "google.com") {
    const error = new Error("Use a verified Google account to link Firebase.");
    error.statusCode = 401;
    error.code = "FIREBASE_GOOGLE_REQUIRED";
    throw error;
  }
  return { uid: decoded.uid };
}

export async function ensureFirebaseIdentitySchema(pool) {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS mina_firebase_identity_links (
      firebase_uid TEXT PRIMARY KEY,
      clerk_user_id TEXT NOT NULL UNIQUE,
      linked_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
    )
  `);
}

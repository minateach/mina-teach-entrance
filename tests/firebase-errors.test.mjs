import test from "node:test";
import assert from "node:assert/strict";
import {
  firebaseGoogleErrorMessage,
  shouldUseFirebaseRedirectFallback,
} from "../account/src/firebase-errors.mjs";

test("Firebase internal errors point to provider and current-domain checks without changing Clerk data", () => {
  const message = firebaseGoogleErrorMessage({ code: "auth/internal-error" }, "mina-teach-entrance.replit.app");
  assert.match(message, /Google provider is enabled/);
  assert.match(message, /mina-teach-entrance\.replit\.app/);
  assert.match(message, /Clerk sign-in and PostgreSQL data are unchanged/);
});

test("known Firebase setup errors explain the exact fix without exposing credential details", () => {
  assert.match(
    firebaseGoogleErrorMessage({ code: "auth/operation-not-allowed" }),
    /Enable Google in Firebase Console/,
  );
  assert.match(
    firebaseGoogleErrorMessage({ code: "auth/unauthorized-domain" }, "preview.example.replit.dev"),
    /preview\.example\.replit\.dev/,
  );
  const message = firebaseGoogleErrorMessage({ code: "auth/invalid-api-key" });
  assert.match(message, /Web app config/);
  assert.doesNotMatch(message, /AIza/);
});

test("Firebase API-key restriction errors explain that the key is project config, not OAuth login", () => {
  const message = firebaseGoogleErrorMessage({ code: "auth/api-keys-are-not-supported-by-this-api" });
  assert.match(message, /Firebase Authentication/);
  assert.match(message, /Identity Toolkit API/);
  assert.match(message, /OAuth client ID/);
  assert.match(message, /Clerk sign-in and PostgreSQL data are unchanged/);
  assert.doesNotMatch(message, /AIza/);
});

test("redirect fallback is limited to popup transport failures", () => {
  assert.equal(shouldUseFirebaseRedirectFallback({ code: "auth/internal-error" }), true);
  assert.equal(shouldUseFirebaseRedirectFallback({ code: "auth/popup-blocked" }), true);
  assert.equal(shouldUseFirebaseRedirectFallback({ code: "auth/operation-not-allowed" }), false);
  assert.equal(shouldUseFirebaseRedirectFallback({ code: "auth/unauthorized-domain" }), false);
});

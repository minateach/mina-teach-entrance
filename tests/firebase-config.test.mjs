import test from "node:test";
import assert from "node:assert/strict";
import { createFirebaseWebConfig, verifyFirebaseGoogleIdToken } from "../server/firebase-auth.mjs";

const validConfig = {
  FIREBASE_PROJECT_ID: "mina-teach-ai",
  FIREBASE_WEB_API_KEY: "AIzaSyExampleKeyForUnitTestsOnly000000000",
  FIREBASE_AUTH_DOMAIN: "mina-teach-ai.firebaseapp.com",
  FIREBASE_APP_ID: "1:123456789012:web:0123456789abcdef",
  FIREBASE_MESSAGING_SENDER_ID: "123456789012",
  FIREBASE_MEASUREMENT_ID: "G-ABC1234567",
  FIREBASE_WEB_VAPID_KEY: "never-return-this-value",
};

test("Firebase public config includes only valid browser settings", () => {
  assert.deepEqual(createFirebaseWebConfig(validConfig), {
    apiKey: validConfig.FIREBASE_WEB_API_KEY,
    authDomain: validConfig.FIREBASE_AUTH_DOMAIN,
    projectId: validConfig.FIREBASE_PROJECT_ID,
    appId: validConfig.FIREBASE_APP_ID,
    messagingSenderId: validConfig.FIREBASE_MESSAGING_SENDER_ID,
    measurementId: validConfig.FIREBASE_MEASUREMENT_ID,
  });
});

test("Firebase config omits malformed optional Analytics and Messaging IDs", () => {
  const config = createFirebaseWebConfig({
    ...validConfig,
    FIREBASE_MESSAGING_SENDER_ID: "not-a-sender-id",
    FIREBASE_MEASUREMENT_ID: "not-a-measurement-id",
  });
  assert.ok(config);
  assert.equal("messagingSenderId" in config, false);
  assert.equal("measurementId" in config, false);
});

test("Firebase config fails closed when required values are missing or malformed", () => {
  assert.equal(createFirebaseWebConfig({ ...validConfig, FIREBASE_WEB_API_KEY: "" }), null);
  assert.equal(createFirebaseWebConfig({ ...validConfig, FIREBASE_PROJECT_ID: "Mina Teach" }), null);
  assert.equal(createFirebaseWebConfig({ ...validConfig, FIREBASE_APP_ID: "wrong-app-id" }), null);
});

test("Firebase web configuration rejects a project/auth-domain or app/sender mismatch", () => {
  assert.equal(
    createFirebaseWebConfig({ ...validConfig, FIREBASE_AUTH_DOMAIN: "another-project.firebaseapp.com" }),
    null,
  );
  assert.equal(
    createFirebaseWebConfig({ ...validConfig, FIREBASE_MESSAGING_SENDER_ID: "987654321098" }),
    null,
  );
});

test("Firebase link verification rejects missing tokens before making a provider request", async () => {
  await assert.rejects(
    verifyFirebaseGoogleIdToken("", "mina-teach-ai"),
    error => error.code === "FIREBASE_TOKEN_INVALID" && error.statusCode === 401,
  );
});

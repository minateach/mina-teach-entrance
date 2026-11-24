const existingAccountNotice = "Your existing Clerk sign-in and PostgreSQL data are unchanged.";

function safeHostname(hostname) {
  return typeof hostname === "string" && /^[a-z0-9.-]+$/i.test(hostname)
    ? hostname
    : "this app domain";
}

export function firebaseGoogleErrorMessage(error, hostname = "this app domain") {
  const code = typeof error?.code === "string" ? error.code : "";
  const host = safeHostname(hostname);
  const messages = {
    "auth/operation-not-allowed": "Google is not enabled as a Firebase Authentication provider. Enable Google in Firebase Console → Authentication → Sign-in method, then retry.",
    "auth/unauthorized-domain": `Firebase does not authorize ${host}. Add this exact hostname under Firebase Console → Authentication → Settings → Authorized domains.`,
    "auth/invalid-api-key": "Firebase rejected the web API key for this project. Check the Web app config in Firebase Project settings; do not send the key in chat.",
    "auth/api-key-not-valid": "Firebase rejected the web API key for this project. Check the Web app config in Firebase Project settings; do not send the key in chat.",
    "auth/api-keys-are-not-supported-by-this-api": "Firebase Authentication rejected the configured web API key. Confirm FIREBASE_WEB_API_KEY is the Web API key from this same Firebase project, then check Google Cloud Console → APIs & Services → Credentials: the key must not be restricted away from Firebase Authentication (Identity Toolkit API). Do not use an OAuth client ID or service-account credential as this key.",
    "auth/network-request-failed": "Google Sign-In could not reach Firebase. Check the internet connection and that the browser allows requests to Firebase Authentication.",
    "auth/popup-blocked": "The browser blocked the Google sign-in popup. Open Mina Teach directly in a browser tab and try again.",
    "auth/popup-closed-by-user": "Google Sign-In was cancelled before it finished. Your existing account was not changed.",
    "auth/cancelled-popup-request": "Another Google sign-in window was already open. Close it and retry once.",
  };
  if (messages[code]) return `${messages[code]} ${existingAccountNotice}`;
  if (code === "auth/internal-error") {
    return `Firebase could not complete Google Sign-In. Verify that the Google provider is enabled and ${host} is listed in Authorized domains. If this app is inside an embedded preview, open it directly in a browser tab and retry. ${existingAccountNotice}`;
  }
  if (code.startsWith("auth/")) {
    return `Google Sign-In failed (${code}). Check the Firebase Google provider and Authorized domains, then retry. ${existingAccountNotice}`;
  }
  return typeof error?.message === "string" && error.message.trim()
    ? error.message
    : `Google Sign-In could not be linked. ${existingAccountNotice}`;
}

export function shouldUseFirebaseRedirectFallback(error) {
  return ["auth/internal-error", "auth/popup-blocked"].includes(error?.code);
}

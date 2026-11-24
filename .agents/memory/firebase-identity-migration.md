---
name: Firebase identity migration safety
description: Keep Firebase services additive while the existing MINA TEACH AI identity and data stores remain authoritative.
---

Until a migration is tested and explicitly approved, keep Clerk as the app sign-in provider and PostgreSQL as the source of truth. Link Firebase identities only after an authenticated, user-initiated flow that verifies the Firebase UID. Never merge accounts by matching email. Treat Firestore as an opt-in copy, not an automatic migration or synchronization source.

**Why:** The project must preserve existing accounts, educator permissions, and learning records while following a free-first Firebase plan.

**How to apply:** For Firebase work, add isolated linking and owner-scoped backup paths first. Do not replace sign-in, move authoritative data, or enable paid backend services without explicit approval and verified rollback planning.

Firebase Web API keys are public client configuration used by the Firebase SDK; they are not Google OAuth credentials. Keep Google sign-in on `GoogleAuthProvider` and verify the Web API key belongs to the same Firebase project and is allowed to call Firebase Authentication APIs.

**Why:** An API-key restriction or project mismatch can make Firebase Auth fail even when the OAuth popup/redirect code is correct.

**How to apply:** When Auth reports an API-key/API compatibility error, inspect the Firebase Web app key and its Google Cloud API restrictions; never substitute an API key for an OAuth client credential or expose privileged service-account credentials.

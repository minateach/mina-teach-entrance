---
name: Firebase identity migration safety
description: Keep Firebase services additive while the existing MINA TEACH AI identity and data stores remain authoritative.
---

Until a migration is tested and explicitly approved, keep Clerk as the app sign-in provider and PostgreSQL as the source of truth. Link Firebase identities only after an authenticated, user-initiated flow that verifies the Firebase UID. Never merge accounts by matching email. Treat Firestore as an opt-in copy, not an automatic migration or synchronization source.

**Why:** The project must preserve existing accounts, educator permissions, and learning records while following a free-first Firebase plan.

**How to apply:** For Firebase work, add isolated linking and owner-scoped backup paths first. Do not replace sign-in, move authoritative data, or enable paid backend services without explicit approval and verified rollback planning.

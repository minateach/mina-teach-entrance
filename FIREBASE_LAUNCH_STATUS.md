# MINA TEACH AI — Free-First Firebase Readiness

**Status: not ready for a full Firebase launch.** This report separates code and emulator checks from services that still require setup in the owner's Firebase project. No paid billing or Firebase Hosting change was made.

## Scope and existing app

- Firebase project configured in the repository: `mina-teach-ai`.
- Target: web app. The owner chose to keep hosting on Replit, so Firebase Hosting is intentionally not configured.
- Existing Clerk authentication and PostgreSQL account records remain the primary account system. Firebase is an optional linked Google identity and private backup; accounts are not merged by email.

## Service status

| Service | Status | Evidence / remaining work |
| --- | --- | --- |
| GitHub backup | **Verified** | The existing `minateach/mina-teach-entrance` repository was updated through Replit's secure GitHub proxy. The update was a fast-forward; no force-push was used, the local working tree is clean, and local `main` matches remote `main`. |
| Firebase Authentication / Google Sign-In | **Implemented, live test blocked** | The account app uses Firebase's Google OAuth provider flow and links its verified Firebase UID to the signed-in Clerk account. Automated config and error-handling tests pass. A real sign-in was not completed; enable Google in Firebase Authentication, add the deployed app domain to Authorized domains, and confirm the Firebase web API key permits Firebase Authentication / Identity Toolkit. |
| Firestore | **Rules verified in emulator; live deployment unverified** | Rules allow a signed-in student to access only their own `accountData/backup` document and reject all other paths. All three emulator rule tests passed. The rules were not deployed to the owner's live project; create/enable Firestore and publish `firestore.rules` there before using backups. |
| Hosting | **Replit, by owner choice** | Firebase Hosting is not configured. Keep the existing Replit-hosted app and API. |
| Firebase Analytics | **Not active** | A measurement ID can be supplied in the web configuration, but the application currently sends no Firebase Analytics events. The privacy policy accurately states that analytics is inactive. |
| Crashlytics | **Unsupported for this target** | The app is a web application in an Android Trusted Web Activity, not a native Android/iOS Firebase app. No Crashlytics integration is claimed. |
| Firebase Cloud Messaging | **Not implemented or tested** | A VAPID setting is available, but there is no Firebase Messaging client/service-worker registration or verified test delivery. The current in-page reminders are not background FCM push notifications. |
| Secure AI | **Implemented in the existing backend** | AI provider requests remain server-side; credentials are not included in browser code. Automated provider-fallback tests pass. Actual provider availability is separate from Firebase setup. |
| Privacy and account deletion | **Implemented; owner review remains** | The privacy page describes current data handling and flags its owner-review status. Account deletion covers app records, linked Firebase identity, and the Firestore backup, with explicit errors when deletion cannot be confirmed. Automated privacy/deletion checks pass. |

## Verification run

- `npm test`: **101 passed, 0 failed, 3 skipped**. The skipped tests are the Firestore rules tests when no emulator is active in the general suite.
- `npm run test:firebase:rules`: **3 passed, 0 failed** using the Firestore emulator and demo project; this does not prove the live Firebase project's rules are deployed.
- No production Firebase sign-in, live Firestore write, Analytics event, or FCM delivery was claimed or tested.
- No user records were changed and no paid billing was enabled.

## Required before calling Firebase launch ready

1. In Firebase Console for `mina-teach-ai`, enable Google as an Authentication provider, authorize the current Replit app domain, and correct any Firebase API-key restriction that blocks Identity Toolkit.
2. Create/enable Cloud Firestore and deploy the reviewed rules. Then test a student's own backup and denied cross-account access against the live project.
3. If Analytics is wanted, implement an explicit, privacy-documented consent path before sending events.
4. If background push is wanted, implement and test the Firebase Messaging client and server delivery path; a saved VAPID value alone does not provide FCM.
5. Review the privacy policy and provider retention disclosures before public launch.

Do not enable paid billing to complete these steps. If any required service is unavailable on Spark, leave it disabled and report that limitation rather than upgrading automatically.

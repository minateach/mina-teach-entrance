# Google Play Data safety worksheet — owner review

This is a code-based draft, not a submitted declaration or legal determination. Recheck it against the exact production build and each provider's current terms before submission.

## Data the current app handles

| Data category | App behavior observed | Purpose |
|---|---|---|
| Personal information | Clerk account email, chosen profile name, internal account ID | Sign-in, profile, account-scoped records |
| App activity | Learning progress, preferences, question bookmarks, exam attempts, and saved conversation history | Study features and account synchronization |
| User content | AI prompts, conversation text, and images a user explicitly submits | AI tutoring, web-grounded answers, image analysis/editing |
| Device/local data | Offline lessons, locally saved progress and image attachments | Offline study and same-device continuity |

## Sharing and processing

- Clerk handles account sign-in and profile identity.
- The configured MiniMax provider receives general AI requests and requested AI image edits/generations.
- Google Gemini may receive requests for current web research or submitted-image analysis. Google Search grounding handles searches when Gemini actually uses grounding.
- Replit hosts the application and its PostgreSQL-backed account records.
- The app currently has no Google Analytics or Firebase Crashlytics integration.

## Security and deletion notes

- Authenticated API requests are checked by the server and account records are scoped to the signed-in user.
- Requests use the published HTTPS origin.
- Current in-app deletion removes saved `mina_user_records`; it does not delete the Clerk sign-in identity or separately stored exam attempts and bookmarks. Full account/data deletion coverage must be completed and retested before claiming complete deletion.
- Do not select “data is not collected” or “data is not shared” for AI prompts, images, or signed-in study records.

## Still requires owner verification

1. Verify the final production app and database retention behavior.
2. Review provider retention and processing terms; do not infer them from the app code.
3. Complete full account deletion and validate deletion across records before answering Play's account-deletion questions.
4. Submit the questionnaire in Play Console and confirm the required privacy-policy URL is public.

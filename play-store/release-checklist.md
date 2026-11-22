# MINA TEACH AI Android release checklist

## Build

1. Confirm the published site at `https://mina-teach-entrance.replit.app` is the intended production origin.
2. Run `npm ci`, `npm run android:prepare`, then `npm run android:doctor`.
3. Use Android Studio or an Android SDK installation with the current Play-required target API and accepted licenses. The generated `android` project is in this repository.
4. Run `npm run android:build` for an unsigned local build. This command does not create or expose a release key and is not an upload-ready Play bundle.
5. Test the signed app on supported Android phones, including sign-in, account data, offline lessons, practice exams, image picker/camera, back navigation, and external links.

## Signing and domain verification

1. Keep the upload keystore and passwords outside Git and out of chat. Use a secure local or CI secrets store.
2. Enable Play App Signing in Play Console. Keep the upload key and Play app-signing key distinct as directed by Play Console.
3. Add the Play app-signing certificate's SHA-256 fingerprint to `android/twa-manifest.json`; regenerate with `npx bubblewrap fingerprint add <fingerprint>` from `android/`.
4. Generate the Digital Asset Links JSON and publish it at `https://mina-teach-entrance.replit.app/.well-known/assetlinks.json`. Until this is configured for the final Play signing certificate, the TWA may fall back to a browser Custom Tab rather than verified fullscreen.
5. Build the signed Android App Bundle with the owner-controlled upload key. Never commit `.jks`, `.keystore`, passwords, or Play service-account credentials.

## Before Play Console submission

- Complete and owner-approve the privacy policy at `/privacy/`.
- Implement and test full account and associated-data deletion; current saved-record deletion does not remove the Clerk account, exam attempts, or bookmarks.
- Verify Play Console's current target API requirement, app signing, content rating, target audience, Data safety, store listing, and required testing track.
- Capture final phone screenshots from the exact candidate build; add a reviewed 1024×500 feature graphic.
- Confirm all required production database schema is present after publishing, and test signed-in data flows without temporary auth bypasses.
- Submit through the owner's Play Console. This repository work does not submit the app or represent Google approval.

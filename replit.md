# Running Mina Teach Entrance on Replit

## Start the web app

Start the Replit web workflow with:

```bash
npm start
```

The Node server listens on `0.0.0.0:5000`, serves the existing HTML pages, and
provides the AI tutor API. Install project packages with `npm install`.

## AI tutor connection

The tutor calls MiniMax only from the server through the Replit Connectors SDK.
Provider credentials are not sent to the browser. If the MiniMax connection or
credential is unavailable, the tutor displays a setup message instead of
pretending to answer.

This connection uses MiniMax's Global API endpoint. If the tutor reports an
authentication problem, update the MiniMax credential in Replit Integrations
with a Global-platform key; a Mainland China platform key will not work here.
Restart the app after updating the connection.

## Existing project files

- `index.html` is the home page served at `/`.
- `Index.HTml` contains the exam-practice prototype and a learning-dashboard
  snippet.
- `Index.html` contains the study-planner prototype.

Keep these files when extending the project. The prototypes are not yet joined
to the home page; integrate them carefully rather than deleting or replacing
existing work.

## Student accounts and saved data

- `/account/` provides MINA TEACH AI sign-in, account settings, browser-data
  import, download, and deletion controls.
- Clerk sessions are checked by the server before account data is read or
  changed. Do not add bearer tokens to browser requests.
- Signed-in conversations, learning records, and preferences are stored in the
  Replit PostgreSQL development database and scoped to the Clerk user ID.
- Existing browser data remains local until the student explicitly imports it.
  Deleting saved Mina Teach data removes the account copy and the two supported
  browser copies; it does not delete the Clerk sign-in account.
- All users receive the `student` role by default. The one-time development
  first-admin claim is restricted to the owner's verified email, stored only as
  a SHA-256 digest, and consumed atomically. Never add public self-service role
  elevation, hardcode the owner's email, or bypass verified-email checks.
- Supported application roles are `student`, `teacher`, `question_reviewer`,
  and `admin`; keep `educator` accepted for existing accounts. Only an
  administrator can assign roles. Preserve at least one administrator.
- The first admin can create and edit question drafts and approve or reject
  questions. Teachers can author drafts; reviewers can manage and approve
  sourced questions. Student exams may only use approved, source-labeled
  curriculum questions; AI-generated practice stays separate from that bank.

## Education system checks

- `npm test`: builds the account page, checks JavaScript syntax, and runs unit and
  database tests. Database material fixtures are rolled back.
- `npm run test:navigation:desktop`: individually clicks the home subject links,
  every catalog subject for Grades 9–12, available chapters/topics, practice
  routes, and navigation controls in desktop Chrome.
- `npm run test:navigation:android`: runs the same matrix with an Android user
  agent, phone viewport, and touchscreen input. This is Android emulation, not a
  physical-device test.
- `npm run test:learning-browser`: checks existing lesson scoring/retry, saves,
  bookmarks, progress, planner, error recovery, and related public pages.
- `npm run test:materials-browser`: checks long-form and structured material
  rendering, pagination, retry and completion gates, including browser-only
  technical fixtures that are not published to students.
- `npm run audit:materials`: compares available stored/bundled material with the
  API and reports missing curriculum coverage separately.

Browser checks require the running workflow and `REPLIT_DEV_DOMAIN`. They do not
bypass authentication. Successful guest navigation does not verify signed-in exam
creation, account synchronization, or educator publishing.

## Android / Google Play preparation

- The Android wrapper is a Trusted Web Activity that opens the existing published
  app at `https://mina-teach-entrance.replit.app`; it is not a replacement app.
- The owner-approved package ID is `com.minateach.minateachai`. TWA source and
  version metadata live under `android/`; generated build outputs and signing
  keys are ignored by Git.
- `npm run android:prepare` regenerates the wrapper project from
  `android/twa-manifest.json`, including a splash with the exact Mina Teach
  slogan. `npm run android:build` creates an unsigned local build only; Android
  Studio/SDK and owner-controlled signing are required for a Play upload.
- Before publishing a TWA, add the Play App Signing SHA-256 fingerprint and
  deploy Bubblewrap's Digital Asset Links file at
  `/.well-known/assetlinks.json`. No fingerprint or signing credential is
  currently stored in this repository.
- The public privacy-policy draft is at `/privacy/`; store listing, Data safety,
  content-rating notes, screenshots, and the release checklist are in
  `play-store/`. These are owner-review materials, not proof of Play compliance.

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
- New signed-in conversations and learning changes can synchronize to account
  records. Guest/browser history is not automatically imported; the student
  must use the explicit Account import control.
- Account export contains the profile name/email and the `conversations`,
  `learning`, and `preferences` records. Online exam attempts and saved exam
  question bookmarks are stored separately and are not included in that export.
- Account deletion removes `mina_user_records` and supported Mina Teach browser
  data, including account-owned offline downloads, device-only results, local
  notification preferences/feed, and browser image attachments. It does not
  delete the Clerk sign-in identity or separately stored online exam attempts
  and question bookmarks. Students can remove individual saved questions in
  Exams, but there is no current bulk-delete control for those separate rows;
  the Privacy Policy gives the contact address for help.
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

## PostgreSQL recovery guidance

- The app uses Replit PostgreSQL through `DATABASE_URL`. Replit keeps development
  and production databases separate.
- **Development data:** Replit documents no separate development-database backup.
  Development data is recovered by rolling the whole project back to an Agent
  checkpoint. A checkpoint rollback affects project files as well as database
  state; review the checkpoint and its consequences before restoring.
- **Production data:** Replit documents point-in-time recovery (PITR) as enabled
  by default, with a 7-day recovery window that can extend to 28 days on Pro and
  Enterprise plans. Optional scheduled daily snapshots are configured in the
  production Database tool’s **Settings** tab; retention depends on the plan
  and may be 7–28 days.
- The app cannot see whether production snapshots are enabled or which recovery
  window is active. Before relying on recovery, open the Database tool, select
  the production database, and verify the current Settings and restore points.
  Replit warns that restoring production replaces live data with the selected
  point and is irreversible; changes made after that point are lost. Confirm
  the target and exact timestamp before restoring, then verify the app.
- Do not add application-level database dumps, shadow tables, or unapproved data
  copies. Follow Replit’s current guidance:
  - [Data recovery](https://docs.replit.com/features/data-and-storage/data-recovery)
  - [Development and production databases](https://docs.replit.com/features/data-and-storage/development-and-production)

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
- `npm run test:privacy-browser`: checks public privacy/terms routes, navigation,
  accessibility landmarks, and phone/desktop layout without signing in.
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
- The public privacy-policy and Terms of Use drafts are at `/privacy/` and
  `/terms/`. Store listing, Data safety, content-rating notes, screenshots, and
  the release checklist are in `play-store/`. These are owner-review materials,
  not proof of Play compliance.

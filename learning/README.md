# Learning Dashboard

`index.html` loads the modular controller `dashboard.js`, with rendering in
`lesson-view.js` and storage/synchronization in `learning-state.js`. The original
`app.js` file is retained because the project must not delete existing files; it
is no longer the dashboard entry point.

The server catalog combines **published, usable database lessons** with the
existing AI-authored Grade 10 History Unit 1. Drafts are never published or
converted automatically. The catalog lists all requested subjects and retained
additional subjects even when content is missing. Empty courses show an
availability notice, not fabricated chapters or empty lesson pages.

- `/api/learning/catalog`: grade/language counts and available progress keys.
- `/api/learning/course`: ordered chapter and lesson metadata.
- `/api/learning/content/:id`: one actual lesson. IDs are `db-<id>` or
  `history10-<section>`; the original numeric History deep links still work.
- Additional Learning uses paginated `summary=1` requests, not full lesson prose.

Natural numeric chapter/lesson titles determine database ordering. Existing
History numbered sections retain their textbook sequence. Source-verified
curriculum expansion remains a separate content task.

Old local completion keys and saved entries are preserved, but unavailable
legacy completions do not inflate counts. Counts describe available lessons in
the selected grade and language, not full curriculum coverage. Guest data is
kept under the original browser key. Signed-in caches are account-scoped; guest
import remains the explicit Account-page action. Failed account reads cannot
trigger a replacement write. New sync writes include the expected signed-in ID
to reject stale-session account switches. Multi-device concurrent updates still
use the existing whole-record account API.

## Checks

`npm test` runs syntax, content, catalog and storage tests.
`npm run test:learning-browser` starts a temporary installed Chromium, tests the
running preview through `REPLIT_DEV_DOMAIN`, then closes it. Tests exercise
public/device journeys and rejection of unauthenticated protected requests.
They do not bypass authentication or claim to verify a real signed-in session.

## Separate General Knowledge Center

`/learning/knowledge/` is a separate library built from the twenty-category
taxonomy in the user's uploaded requirements. It does not use a grade, stream,
or curriculum chapter. Public search and lesson routes return only database
entries reviewed and published in the requested language. The page uses the
existing learning store for saves, topic bookmarks, and completion keys.

`/admin/knowledge/` uses the existing server-side content roles. Editors can
save drafts; only question reviewers and administrators can publish or reject.
Publishing requires complete lesson sections, traceable references marked
verified by the reviewer, and a verified translation for Afaan Oromoo or
Amharic. English starter drafts remain drafts until a reviewer checks their
source details. Draft records are never returned to students.

The initial authoring batch contains eleven English drafts based only on the
uploaded Grade 9 Biology, Grade 9 History, Grade 10 Mathematics, and Grade 10
Geography Teacher Guide PDFs. The Geography source is explicitly identified as
a teacher guide. Nine requested categories have no local source-backed lesson
yet; their empty states report the gap rather than showing placeholder content.
No unreviewed Afaan Oromoo or Amharic version is claimed. This is a starting
batch, not complete coverage of all twenty categories or every material that
may exist elsewhere.

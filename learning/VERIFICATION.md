# Dashboard repair verification — 13 November 2026

## Passed

- `node --test tests/*.test.mjs`: 26 passing content/catalog/storage/link/material tests.
- `npm test`: account build and JavaScript syntax checks also passed.
- `npm run test:learning-browser`: real Chromium checks through the running preview.
- `npm run test:materials-browser`: long-note, typed-material, pagination, failure,
  practice and coverage-page browser checks.
- `npm run audit:materials`: direct storage-versus-API integrity checks across
  English, Afaan Oromoo and Amharic, including every currently accessible topic.
- All 36 Grade 9–12 routes for Mathematics, Physics, Chemistry, Biology, English,
  Geography, History, Economics, and Civics; the original additional subjects remain.
- Available History chapters and six lesson journeys; all 60 MCQs rendered and
  answered; correct/incorrect explanations, 10/10 and 9/10 scoring, and retry.
- Subject/card, chapter, lesson, previous/next and dashboard navigation.
- Saving/removing/reopening lessons and topic bookmarks; reload persistence of
  actual completions, scores, saved items and the existing planner.
- Legacy organizer completions do not inflate available-lesson counts.
- Summary-only dashboard/course requests and on-demand lesson content.
- Invalid IDs, mismatched grade/subject/language, missing content, error recovery,
  and completion controls absent on failed/unavailable lessons.
- Phone and desktop layout; existing exam, AI Assistant, and account sign-in pages.
- Home-page Start Learning opens the dashboard; all nine requested home subject tiles
  are actual course links. Existing additional subjects remain.
- Grade 10 History's dashboard practice action opens its actual AI-authored lesson
  quiz, not the empty reviewed History bank. These are explicitly separate sources.
- Reviewed-bank availability is loaded with a grouped count query. Grade 9 English's
  actual 60-question bank is reachable from its card; attempting an exam without
  signing in is rejected rather than pretending a session started.
- Topic-only completion persists across reloads without completing the whole lesson.
  Completing a lesson counts its actual topics as studied. Dashboard topic totals and
  subject topic summaries are derived from catalog IDs, not fabricated topic titles.
- Unauthenticated account, lesson-management, publishing and exam-history requests
  rejected. Account state segregation, failed reads/writes and retry behavior were
  tested separately with mocked HTTP responses, not real signed-in accounts.
- Published database lesson rendering and practice links exercised with browser-only
  API fixtures. These fixtures never changed actual database records.
- All fourteen additional material types were exercised with browser-only fixtures:
  notes, subtopics, definitions, concepts, examples, formulas, diagrams, tables,
  activities, exercises with answers, revision with answers, MCQs, resources and timelines.
- A real PostgreSQL transaction stored notes over 20,000 characters unchanged and
  retrieved every material through paginated reads. Its technical fixture rows were
  rolled back; they were never committed or visible to students.
- Introductions and separate full notes both render. Numbered long-text parts rejoin
  exactly, preserving whitespace, Afaan Oromoo, Amharic and Unicode boundary characters.
- Material Previous/Next, retry, image loading, table cells, answers, inline published-
  lesson practice, bookmark compatibility and mobile overflow checks passed.
- Real storage/API checks found no inaccessible published records and no shortened
  stored notes, examples, key points, bundled topic notes, questions or worked responses.

### Individual desktop and Android-emulated click matrices

Both `npm run test:navigation:desktop` and
`npm run test:navigation:android` passed against the running application. Each ran:

- 10 home subject links, all 72 English catalog subject/grade combinations, and the
  additional populated Afaan Oromoo Grade 9 English subject page.
- 12 grade/language dashboard pages: four grades in each of English, Afaan Oromoo,
  and Amharic.
- All seven currently available chapter pages across those languages, with chapter
  navigation and chapter Start Learning actions.
- All 25 available topics: 50 individual topic-link clicks across chapter lists and
  lesson tables of contents, plus 26 Previous/Next Topic transitions.
- 36 Previous/Next Lesson transitions.
- 110 practice routes from subjects, lessons and topics. Of these, 69 subject
  contexts had no matching questions and correctly showed unavailable/disabled
  practice rather than an unrelated bank. Those are data gaps, not successful
  practice sessions.
- Actual available inline quizzes and reviewed-bank filter/count checks. Anonymous
  Start Practice requests correctly required sign-in; authenticated exam creation
  is not certified by these tests.
- Returning from an inline quiz preserves its answered question without allowing
  that question to be scored twice.
- Invalid topic/material/chapter links, mismatched saved sessions, explicit resume,
  corrupt saved-question metadata, invalid filters, question-count mismatches,
  safe local return links, and delayed stale count responses.

The saved-session and response-timing edge cases used isolated browser-only
technical fixtures, not published educational records. Android checks used an
Android user agent and actual touchscreen input in Chrome emulation; no physical
Android device was tested. Both matrices finished with zero uncaught browser
exceptions and zero application-server 5xx responses.

## Actual educational content

The final live audit observed **six published Grade 9 English lesson versions**:
three English and three Afaan Oromoo. Their publication state changed during the
work; this repair did not publish, replace or delete existing lessons.

The existing bundled Grade 10 History Unit 1 supplies six English learning pages
and 60 original AI-authored questions. Its review-pending label and source link
are preserved. It is not described as Ministry-approved or part of the reviewed
exam bank.
All 18 original exercises and 23 revision questions in these six pages now have
original worked responses, explicitly covered by the AI-authored/review-pending label.

The final integrity audit checked **12 lesson versions and 25 available topics**:
22 English topics across nine pages and three Afaan Oromoo topics across three pages.
No published Amharic learning pages were available. Of the 36 primary grade/subject
combinations, 34 still lack English lessons, 35 lack Afaan Oromoo lessons and all 36
lack Amharic lessons. History Grade 10 Units 2–9 remain missing.

The eligible reviewed exam bank still contains **75 questions**: 60 for Grade 9
English and 15 for Grade 12 Mathematics. The original initial target of 100
reviewed questions is not met. The separate 60 AI-authored History practice
questions are not counted toward that reviewed-bank target.

The new structured-material column currently contains no published extra sections;
its fourteen rich renderers were tested with technical fixtures, not represented as
newly populated textbook content. Supplied PDFs and external textbooks have not all
been mapped or imported. No course is certified as complete textbook coverage.

`/learning/coverage.html` reports all 72 catalog combinations (18 existing subjects,
four grades) in the selected language. Missing source mapping and unpublished content
are distinguished from usable lessons; summaries and functioning URLs are not counted
as full curriculum content.

## Storage and setup

The non-destructive development migration removes the old 20,000-character note cap,
adds structured material storage and records content revisions. Authoring retains a
2 MiB request budget, with an atomic append endpoint for additional numbered sections;
there is no application-level cap on total section count. Oversized uploads are
explicitly rejected, never silently shortened. Content revisions preserve old saved
records but do not inherit completion of newly added material.

The development post-merge setup runs the migration before the account build.
Production schema migration has not been applied or tested; use the publishing
schema workflow before publishing this change.

## Not verified

No real authenticated student or authorized educator session was available to
complete login-to-learning synchronization, cross-account isolation in a signed-in
browser, or content publishing. Authentication remains enabled; no bypass was added.
Existing separate tasks cover signed-in account checks and source-verified content
expansion. The code still uses the existing whole-record account write API, so
conflicting edits from different devices need a separate concurrency improvement.

The repair is application functionality, not a full curriculum-content completion
claim. No production deployment, paid service, billing upgrade, or AI-provider call
was performed.

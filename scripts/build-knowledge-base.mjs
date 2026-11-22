import { createHash } from "node:crypto";
import { execFileSync } from "node:child_process";
import { createRequire } from "node:module";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { basename, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";
import { makeRecord, validateRecord } from "../knowledge-base/records.mjs";
import { historyAnswers } from "../server/history-grade10-answers.mjs";
import { allPrimaryCurriculumSources } from "../server/curriculum-sources.mjs";

const root = resolve(fileURLToPath(new URL("..", import.meta.url)));
const assetsDir = join(root, "attached_assets");
const outputDir = resolve(process.argv[2] || join(root, "generated-artifacts/knowledge-base"));
const requiredSubjects = ["Mathematics", "Physics", "Chemistry", "Biology", "English", "Geography", "History", "Economics", "Civics"];
const grades = [9, 10, 11, 12];
const languages = ["en", "om", "am"];
const knownSources = [
  { match: /geography_grade_10_teacher_guide/i, subject: "Geography", grade: 10, kind: "teacher_guide_page", include: true },
  { match: /history_grade_9_student_textbook/i, subject: "History", grade: 9, kind: "textbook_page", include: true },
  { match: /mathematics_grade_10/i, subject: "Mathematics", grade: 10, kind: "textbook_page", include: true },
  { match: /mathsbg9/i, subject: "Mathematics", grade: 9, kind: "textbook_page", include: true },
  { match: /biology_grade_9/i, subject: "Biology", grade: 9, kind: "textbook_page", include: true },
  { match: /2017_history_first_round/i, subject: "History", grade: null, kind: "practice_exam_page", include: true },
  { match: /question_and_answer_for_remedial/i, subject: null, grade: null, kind: "question_answer_page", include: true },
  { match: /logic_&_ct_exam_practice/i, subject: "Logic and Critical Thinking", grade: null, kind: "practice_exam_page", include: true },
  { match: /phd-student-handbook/i, subject: null, grade: null, kind: "source_page", include: false, exclusion: "Unrelated doctoral theology handbook; not Mina Teach secondary curriculum." },
  { match: /my_exam_result_pdf/i, subject: null, grade: null, kind: "source_page", include: false, exclusion: "Personal exam-result document; excluded to avoid indexing private learner data." },
  { match: /geography_module_final/i, subject: "Geography", grade: null, kind: "lesson_notes_page", include: true },
  { match: /geo_chapter_4_question_bank/i, subject: "Geography", grade: null, kind: "question_bank_page", include: true },
  { match: /english_model_exam/i, subject: "English", grade: 12, kind: "practice_exam_page", include: true },
];
const require = createRequire(import.meta.url);
const bundledHistory = require(join(root, "learning/history-grade10.js"));
const records = [];
const sources = [];
const issues = [];

function sha256(buffer) {
  return createHash("sha256").update(buffer).digest("hex");
}

function decodePdfInfo(text) {
  const metadata = {};
  for (const line of text.split(/\r?\n/)) {
    const match = line.match(/^([^:]+):\s*(.*)$/);
    if (match && match[1].trim() !== "Metadata Stream") metadata[match[1].trim()] = match[2].trim() || null;
  }
  return metadata;
}

function inferLanguage(text) {
  const letters = text.match(/\p{L}/gu) || [];
  if (!letters.length) return null;
  const amharic = (text.match(/[\u1200-\u137f]/gu) || []).length;
  if (amharic / letters.length > 0.05) return "am";
  return "en";
}

function getPageFromSource(sourcePages, sourceLabel = "") {
  const value = sourcePages || sourceLabel;
  if (typeof value !== "string") return null;
  const match = value.match(/\b(?:pp?(?:age)?s?\.?\s*)(\d+)\b/i);
  return match ? Number(match[1]) : null;
}

function sourceMatch(file) {
  return knownSources.find(source => source.match.test(file)) || {
    subject: null, grade: null, kind: "source_page", include: false,
    exclusion: "Document type was not confidently classified; review before curriculum use.",
  };
}

function record(input) {
  records.push(makeRecord(input));
}

function pageRecords(source, details, pageTexts) {
  const blankPages = [];
  const lowTextPages = [];
  for (let index = 0; index < pageTexts.length; index++) {
    const text = pageTexts[index].replace(/\u0000/g, "").trim();
    const page = index + 1;
    const empty = !text;
    if (empty) blankPages.push(page);
    else if (text.replace(/\s/g, "").length < 80) lowTextPages.push(page);
    record({
      id: `pdf:${source.id}:page:${page}`,
      subject: details.subject,
      grade: details.grade,
      chapter: null,
      topic: null,
      language: empty ? null : inferLanguage(text),
      content_type: empty ? "empty_page" : details.kind,
      source,
      page,
      content: text,
      retrieval_eligible: details.include && !empty,
      review_status: "source-unreviewed",
      metadata: {
        source_page: page,
        extraction: "pdftotext-layout",
        needs_ocr: empty,
        likely_cover_or_sparse: !empty && text.replace(/\s/g, "").length < 80,
      },
    });
  }
  return { pageCount: pageTexts.length, blankPages, lowTextPages };
}

async function ingestPdfs() {
  const names = (await readdir(assetsDir)).filter(name => /\.pdf$/i.test(name)).sort();
  const seen = new Map();
  for (const file of names) {
    const path = join(assetsDir, file);
    const bytes = await readFile(path);
    const hash = sha256(bytes);
    const details = sourceMatch(file);
    const duplicateOf = seen.get(hash) || null;
    if (!duplicateOf) seen.set(hash, file);
    let pdfMetadata = {};
    let extraction = null;
    let problem = null;
    try {
      const info = execFileSync("pdfinfo", [path], { encoding: "utf8", maxBuffer: 2 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
      pdfMetadata = decodePdfInfo(info);
      if (!duplicateOf && details.include) {
        const raw = execFileSync("pdftotext", ["-layout", "-enc", "UTF-8", path, "-"], { encoding: "utf8", maxBuffer: 150 * 1024 * 1024, stdio: ["ignore", "pipe", "pipe"] });
        const pageTexts = raw.split("\f");
        if (pageTexts.at(-1)?.trim() === "") pageTexts.pop();
        const source = {
          id: `pdf-${hash.slice(0, 20)}`,
          file,
          title: pdfMetadata.Title || file.replace(/^\d+_/, "").replace(/_[0-9]+\.pdf$/i, "").replaceAll("_", " "),
          author: pdfMetadata.Author || null,
          publisher: null,
          publication_date: null,
          url: null,
          label: pdfMetadata.Title || file,
          kind: details.kind,
          metadata: { pdf_info: pdfMetadata, sha256: hash, bytes: bytes.length, first_page_text: pageTexts[0]?.trim().slice(0, 1400) || null },
        };
        extraction = pageRecords(source, details, pageTexts);
        const expectedPages = Number(pdfMetadata.Pages);
        if (Number.isFinite(expectedPages) && expectedPages !== extraction.pageCount) {
          problem = `PDF metadata reports ${expectedPages} pages; extracted ${extraction.pageCount} text pages.`;
        }
        if (extraction.blankPages.length / Math.max(1, extraction.pageCount) > 0.1) {
          problem = [problem, `${extraction.blankPages.length} pages have no extractable text; OCR/visual review may be required.`].filter(Boolean).join(" ");
        } else if (extraction.blankPages.length) {
          problem = [problem, `${extraction.blankPages.length} pages have no extractable text.`].filter(Boolean).join(" ");
        }
        if (extraction.lowTextPages.length) {
          problem = [problem, `${extraction.lowTextPages.length} sparse pages should be spot-checked.`].filter(Boolean).join(" ");
        }
      }
    } catch (error) {
      problem = `${error.code || "PDF_TOOL_ERROR"}: ${String(error.message).slice(0, 180)}`;
      issues.push({ file, severity: "error", message: problem });
    }
    const sourceEntry = {
      file, sha256: hash, bytes: bytes.length, duplicate_of: duplicateOf,
      subject: details.subject, grade: details.grade, content_type: details.kind,
      included: !duplicateOf && details.include && extraction !== null,
      excluded_reason: duplicateOf ? `Exact SHA-256 duplicate of ${duplicateOf}; source file retained, duplicate pages are not indexed.` : details.include ? null : details.exclusion,
      pdf_metadata: pdfMetadata,
      extracted_pages: extraction?.pageCount || 0,
      blank_pages: extraction?.blankPages || [],
      sparse_pages: extraction?.lowTextPages || [],
      quality_note: problem,
    };
    sources.push(sourceEntry);
    if (problem && !problem.startsWith("ENOENT")) issues.push({ file, severity: "warning", message: problem });
    if (!duplicateOf && details.include && !pdfMetadata.Pages && !problem) {
      sourceEntry.included = false;
      sourceEntry.excluded_reason = "PDF page metadata was unavailable; extraction was not certified.";
    }
  }
}

function bundleHistory() {
  const source = {
    id: "bundle:grade10-history-2023",
    file: "learning/history-grade10.js",
    title: bundledHistory.source.title,
    author: "MINA TEACH AI original lesson authorship",
    publisher: bundledHistory.source.publisher || "Federal Democratic Republic of Ethiopia, Ministry of Education (curriculum reference)",
    publication_date: "2023",
    url: bundledHistory.source.url,
    label: bundledHistory.source.note,
    kind: "ai-authored-curriculum-reference",
    metadata: { source_note: bundledHistory.source.note, independent_review: "pending" },
  };
  for (const lesson of bundledHistory.completeLessons) {
    const lessonSource = { ...source, label: `${source.label} Section ${lesson.number}` };
    record({
      id: `bundle:history10:${lesson.number}:lesson`,
      subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
      topic: lesson.title, language: "en", content_type: "lesson", source: lessonSource, page: null,
      content: lesson.introduction || "",
      objectives: lesson.objectives || [], summary: lesson.summary || "",
      review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
      metadata: { lesson_number: lesson.number, unit_number: lesson.unit, origin: "bundled original explanatory content" },
    });
    for (const [topicIndex, topic] of (lesson.topics || []).entries()) {
      record({
        id: `bundle:history10:${lesson.number}:topic:${topicIndex + 1}`,
        subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
        topic: topic.title, language: "en", content_type: "lesson_notes", source: lessonSource, page: null,
        content: topic.notes || "",
        definitions: (topic.terms || []).map(([term, definition]) => ({ term, definition })),
        examples: topic.example ? [topic.example] : [],
        review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
        metadata: { lesson_number: lesson.number, topic_number: topicIndex + 1 },
      });
      for (const [termIndex, [term, definition]] of (topic.terms || []).entries()) {
        record({
          id: `bundle:history10:${lesson.number}:topic:${topicIndex + 1}:definition:${termIndex + 1}`,
          subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
          topic: topic.title, language: "en", content_type: "definition", source: lessonSource, page: null,
          content: `${term}: ${definition}`, term, definition,
          review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
          metadata: { lesson_number: lesson.number },
        });
      }
    }
    for (const [exerciseIndex, exercise] of (lesson.exercises || []).entries()) {
      const answer = historyAnswers[lesson.number]?.exerciseAnswers?.[exerciseIndex] ?? null;
      record({
        id: `bundle:history10:${lesson.number}:exercise:${exerciseIndex + 1}`,
        subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
        topic: lesson.title, language: "en", content_type: "exercise", question: exercise,
        correct_answer: answer, source: lessonSource, page: null, content: exercise,
        review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
        metadata: { lesson_number: lesson.number, answer_status: answer === null ? "not supplied" : "provided" },
      });
    }
    for (const [revisionIndex, question] of (lesson.revision || []).entries()) {
      const answer = historyAnswers[lesson.number]?.revisionAnswers?.[revisionIndex] ?? null;
      record({
        id: `bundle:history10:${lesson.number}:revision:${revisionIndex + 1}`,
        subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
        topic: lesson.title, language: "en", content_type: "review_question", question,
        correct_answer: answer, source: lessonSource, page: null, content: question,
        review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
        metadata: { lesson_number: lesson.number, answer_status: answer === null ? "not supplied" : "provided" },
      });
    }
    for (const [questionIndex, question] of (lesson.questions || []).entries()) {
      const options = (question.choices || []).map(choice => String(choice).replace(/^[A-D]\.\s*/, ""));
      const answerIndex = question.answer;
      record({
        id: `bundle:history10:${lesson.number}:mcq:${questionIndex + 1}`,
        subject: "History", grade: 10, chapter: `${lesson.unit}. ${lesson.unitTitle}`,
        topic: lesson.title, language: "en", content_type: "mcq", question: question.prompt,
        options, correct_answer: options[answerIndex] ?? null, explanation: question.explanation || null,
        source: lessonSource, page: null, content: question.prompt,
        review_status: "ai_authored-pending-independent-review", retrieval_eligible: true,
        metadata: { lesson_number: lesson.number, question_number: questionIndex + 1, correct_index: answerIndex },
      });
    }
  }
}

function databaseSource(row, kind) {
  return {
    id: `database:${kind}:${row.id}`,
    file: null,
    title: row.title || row.prompt || row.source_label || `${row.subject} ${kind}`,
    author: null,
    publisher: null,
    publication_date: null,
    url: row.source_url || null,
    label: row.source_label || null,
    kind,
    metadata: { author_metadata: "Not stored as a display name in the source record." },
  };
}

function includeLesson(row) {
  const source = databaseSource(row, "database-lesson");
  const eligible = row.review_status === "published" && String(row.content || "").trim().length >= 80;
  record({
    id: `db:lesson:${row.id}`,
    subject: row.subject, grade: row.grade, chapter: row.chapter, topic: row.title, language: row.language,
    content_type: "lesson", question: null, source, page: null, content: row.content || "",
    examples: row.examples || [], key_points: row.key_points || [],
    review_status: row.review_status, retrieval_eligible: eligible,
    metadata: { stream: row.stream, created_at: row.created_at, updated_at: row.updated_at },
  });
  for (const [index, material] of (row.materials || []).entries()) {
    const sourcePages = material.sourcePages || null;
    const contentType = material.type || "lesson_notes";
    const materialSource = {
      ...source,
      title: material.sourceTitle || material.sourceLabel || source.title,
      file: material.sourceFile || source.file,
      label: material.sourceLabel || source.label,
      url: material.sourceUrl || source.url,
      author: material.sourceAuthor || source.author,
      publisher: material.sourcePublisher || source.publisher,
      publication_date: material.sourcePublicationDate || source.publication_date,
      metadata: {
        ...source.metadata,
        source_pages: sourcePages,
        edition: material.sourceEdition || null,
        source_file: material.sourceFile || null,
      },
    };
    const content = [
      material.text, material.definition, material.expression, material.explanation,
      material.caption, material.alt, material.term && `${material.term}: ${material.definition}`,
      ...(material.items || []), ...(material.steps || []), ...(material.events || []).map(event => JSON.stringify(event)),
      material.type === "table" ? JSON.stringify({ headers: material.headers, rows: material.rows }) : "",
    ].filter(Boolean).join("\n");
    record({
      id: `db:lesson:${row.id}:material:${material.id || index + 1}`,
      subject: row.subject, grade: row.grade, chapter: row.chapter,
      topic: material.topicTitle || material.topicId || row.title, language: row.language,
      content_type: contentType, question: material.question || null,
      options: material.choices || null,
      correct_answer: material.type === "mcq" && Number.isInteger(material.correctIndex) ? material.choices?.[material.correctIndex] ?? null : material.answer ?? null,
      explanation: material.explanation || null,
      source: materialSource,
      page: getPageFromSource(sourcePages, row.source_label), content,
      review_status: row.review_status, retrieval_eligible: eligible,
      metadata: {
        material_id: material.id || null,
        source_pages: sourcePages,
        source_author: material.sourceAuthor || null,
        source_publisher: material.sourcePublisher || null,
        source_publication_date: material.sourcePublicationDate || null,
        source_edition: material.sourceEdition || null,
        material_title: material.title || null,
        term: material.term || null,
        definition: material.definition || null,
        material_type: material.type || null,
        position: index + 1,
      },
    });
  }
}

async function ingestDatabase() {
  if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not configured; knowledge export stopped instead of emitting a partial database snapshot.");
  const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL, max: 2 });
  try {
    const [lessons, questions] = await Promise.all([
      pool.query("SELECT id,grade,stream,subject,chapter,title,language,content,examples,key_points,source_label,source_url,review_status,created_at,updated_at,materials FROM mina_learning_lessons ORDER BY id"),
      pool.query("SELECT id,grade,stream,subject,chapter,prompt,choices,correct_index,explanation,difficulty,source_label,source_url,source_kind,review_status,created_at,updated_at FROM mina_questions ORDER BY id"),
    ]);
    for (const row of lessons.rows) includeLesson(row);
    for (const row of questions.rows) {
      const choices = Array.isArray(row.choices) ? row.choices : [];
      const source = databaseSource({ ...row, title: row.prompt }, "database-question");
      const answer = choices[row.correct_index] ?? null;
      record({
        id: `db:question:${row.id}`, subject: row.subject, grade: row.grade,
        chapter: row.chapter, topic: row.chapter, language: inferLanguage(`${row.prompt} ${choices.join(" ")}`),
        content_type: "mcq", question: row.prompt, options: choices,
        correct_answer: answer, explanation: row.explanation || null, source,
        page: getPageFromSource(row.source_label), content: row.prompt,
        review_status: row.review_status,
        retrieval_eligible: row.review_status === "approved" && row.source_kind !== "ai_generated",
        metadata: {
          stream: row.stream, difficulty: row.difficulty, source_kind: row.source_kind,
          created_at: row.created_at, updated_at: row.updated_at,
          correct_index: row.correct_index,
          source_pages: row.source_label?.match(/\bpp?\.?\s*\d+(?:\s*[-–]\s*\d+)?/i)?.[0] || null,
        },
      });
    }
    return {
      database: {
        lesson_records: lessons.rowCount,
        question_records: questions.rowCount,
        published_lessons: lessons.rows.filter(row => row.review_status === "published").length,
        approved_non_ai_questions: questions.rows.filter(row => row.review_status === "approved" && row.source_kind !== "ai_generated").length,
        lesson_status_counts: Object.fromEntries([...new Set(lessons.rows.map(row => row.review_status))].sort().map(status => [status, lessons.rows.filter(row => row.review_status === status).length])),
        question_status_counts: Object.fromEntries([...new Set(questions.rows.map(row => row.review_status))].sort().map(status => [status, questions.rows.filter(row => row.review_status === status).length])),
        languages_in_lessons: [...new Set(lessons.rows.map(row => row.language))].sort(),
      },
    };
  } finally {
    await pool.end();
  }
}

function detectExactRecordDuplicates(items) {
  const seen = new Map();
  const duplicates = [];
  for (const item of items) {
    const canonical = JSON.stringify([
      item.subject, item.grade, item.chapter, item.topic, item.language, item.content_type,
      item.question, item.options, item.correct_answer, item.explanation, item.content,
    ]);
    const hash = sha256(Buffer.from(canonical));
    if (seen.has(hash)) duplicates.push({ duplicate_id: item.id, original_id: seen.get(hash), hash });
    else seen.set(hash, item.id);
  }
  return duplicates;
}

function makeCoverage(dbInfo) {
  const relevant = records.filter(item => item.retrieval_eligible);
  const matrix = [];
  for (const grade of grades) {
    for (const subject of requiredSubjects) {
      const inScope = relevant.filter(item => item.grade === grade && item.subject === subject);
      matrix.push({ grade, subject, records: inScope.length, has_material: inScope.length > 0 });
    }
  }
  const languageCoverage = languages.map(language => ({
    language,
    records: relevant.filter(item => item.language === language).length,
    subjects: [...new Set(relevant.filter(item => item.language === language).map(item => item.subject).filter(Boolean))].sort(),
  }));
  return { matrix, languageCoverage, database: dbInfo };
}

function reportText(data) {
  const { metrics } = data;
  const absent = metrics.coverage.matrix.filter(row => !row.has_material);
  const duplicates = data.sources.filter(source => source.duplicate_of);
  const excluded = data.sources.filter(source => source.excluded_reason && !source.duplicate_of);
  const issueRows = data.sources.filter(source => source.quality_note);
  const typeCounts = Object.entries(metrics.content_types).sort(([a], [b]) => a.localeCompare(b));
  const sourceMap = allPrimaryCurriculumSources();
  const outlineText = item => item.units.map(unit => `${unit.number}. ${unit.title}${unit.sections?.length ? ` — ${unit.sections.join(", ")}` : ""}`).join("; ") || "None";
  const sourceDetails = item => item.source ? [
    item.source.title,
    item.source.publisher,
    item.source.authors?.length ? `Authors: ${item.source.authors.join(", ")}` : null,
    item.source.publicationDate ? `Publication: ${item.source.publicationDate}` : null,
    item.source.pageCount ? `PDF pages: ${item.source.pageCount}` : null,
    item.source.url ? `[Open recorded source](${item.source.url})` : item.source.file ? `File: \`${item.source.file}\`` : null,
  ].filter(Boolean).join("; ") : "No grade-specific source registered";
  return `# MINA TEACH AI Knowledge Base Audit

Generated: ${new Date().toISOString()}

## What was exported

- ${metrics.pdf_files_total} uploaded PDF files inventoried; ${metrics.pdf_files_unique} unique files by SHA-256.
- ${metrics.pdf_pages_indexed} source pages retained in the page-level JSONL export.
- ${metrics.database.lesson_records} database lesson records and their material sections were exported without changing review status.
- ${metrics.database.question_records} database question records were exported with options, answer, explanation, source label, and status.
- ${metrics.database.approved_non_ai_questions} of those are approved non-AI exam-bank records; other statuses remain labeled and unapproved.
- Question review statuses: ${Object.entries(metrics.database.question_status_counts).map(([status, count]) => `${status}=${count}`).join(", ") || "none"}.
- ${metrics.incomplete_mcq_records} structured MCQ records are missing a prompt, four choices, answer, or explanation.
- The existing initial question-bank target is 100 approved items; the database currently has ${metrics.database.approved_non_ai_questions}, so it is short by ${Math.max(0, 100 - metrics.database.approved_non_ai_questions)}.
- ${metrics.bundled_history_lessons} bundled Grade 10 History lessons were split into lessons, topic notes/definitions, exercises, review questions, and MCQs.
- ${metrics.total_records} total structured records; ${metrics.retrieval_eligible_records} are marked retrieval-eligible under the status rules.
- ${metrics.exact_duplicate_records} exact duplicate structured records were flagged, not silently deleted.

The export prepares data for retrieval. **No AI model was trained, fine-tuned, or modified.** The current Mina Teach AI assistant does not automatically consume this local index.

## Coverage by requested subject and grade

| Grade | Subject | Records | Status |
|---|---|---:|---|
${metrics.coverage.matrix.map(row => `| ${row.grade} | ${row.subject} | ${row.records} | ${row.has_material ? "Material present; completeness not verified" : "No matching grade-tagged retrieval material"} |`).join("\n")}

There are ${absent.length} empty subject-grade combinations out of ${metrics.coverage.matrix.length}. A record count is not a curriculum-completeness claim.

## Textbook and syllabus source mapping

| Grade | Subject | Mapping status | Recorded source | Unit and section titles transcribed |
|---:|---|---|---|---|
${sourceMap.map(item => `| ${item.grade} | ${item.subject} | ${item.statusLabel} | ${sourceDetails(item)} | ${outlineText(item)} |`).join("\n")}

This source map distinguishes uploaded textbook outlines, partial lesson sets, a teacher-guide-only reference, and missing sources. Unit headings are not complete lessons; no course is certified complete by this map.

## Language coverage

| Language | Retrieval records | Subjects represented |
|---|---:|---|
${metrics.coverage.languageCoverage.map(row => `| ${row.language} | ${row.records} | ${row.subjects.join(", ") || "None"} |`).join("\n")}

Source pages are language-tagged only when a simple script check identifies Amharic or Latin text; English vs Afaan Oromoo is not reliably inferable from Latin characters alone. Database lesson language tags are preserved. Unknown language remains null.

## Content types

| Type | Records |
|---|---:|
${typeCounts.map(([type, count]) => `| ${type} | ${count} |`).join("\n")}

## Duplicate files

${duplicates.length ? duplicates.map(item => `- \`${item.file}\` is byte-identical to \`${item.duplicate_of}\` (${item.sha256}). It was omitted from the page records; both originals remain untouched.`).join("\n") : "- No exact duplicate PDFs found."}

## Excluded or uncertain files

${excluded.length ? excluded.map(item => `- \`${item.file}\`: ${item.excluded_reason}`).join("\n") : "- No excluded files."}

## Extraction quality flags

${issueRows.length ? issueRows.map(item => `- \`${item.file}\`: ${item.quality_note}`).join("\n") : "- No extraction errors or blank/sparse-page flags detected."}

These flags describe text extraction only. They do not establish textbook accuracy or curriculum approval. Files with blank or sparse pages may need visual review/OCR before they are searchable.

## Source inventory

| File | Subject | Grade | Type | Pages extracted | PDF Author field (unverified) | Notes |
|---|---|---:|---|---:|---|---|
${data.sources.map(item => `| \`${item.file}\` | ${item.subject || "Unassigned"} | ${item.grade ?? "Unassigned"} | ${item.content_type} | ${item.extracted_pages} | ${item.pdf_metadata?.Author || "Not in PDF metadata"} | ${item.duplicate_of ? `Duplicate of ${item.duplicate_of}` : item.excluded_reason || item.quality_note || "Indexed"} |`).join("\n")}

## Readiness and remaining work

- **Structured export:** ready for downstream indexing; records use the declared schema and preserve source/page/review metadata where available.
- **Lexical retrieval:** available through the local search command; this is not yet connected to the AI Tutor.
- **Textbook ingestion:** ${metrics.pdf_pages_indexed} pages were extracted from eligible PDFs, but chapter/topic mapping is not complete and uploaded sources are not proof of complete textbook coverage.
- **Question quality:** database answers and explanations are preserved as stored. Draft/rejected/AI-generated questions remain marked and are excluded from student retrieval.
- **Missing curriculum:** ${absent.length} requested grade-subject combinations have no grade-tagged eligible records. Grade coverage should not be inferred for source documents where the PDF did not establish a grade.
- **Translation:** the corpus is not fully available in English, Afaan Oromoo, and Amharic. No translation was generated during export.
- **Authorship/provenance:** database author names and textbook page references were not stored for all records; missing values remain null instead of being guessed.
- **Review status:** uploaded PDF pages are marked \`source-unreviewed\`; bundled lessons are original authored material pending independent review; only published lessons and approved non-AI questions qualify under database retrieval rules.
- **PDF author metadata:** embedded PDF Author fields are preserved as-is, but may identify a PDF creator rather than textbook authors; they were not treated as verified authorship.

## Files

- \`records.jsonl\`: one validated record per line; no page truncation.
- \`schema.json\`: JSON Schema contract for the records.
- \`README.md\`: build/search instructions and data-handling boundaries.
- \`sources.json\`: file hashes, metadata, duplicate relationships, extraction counts and quality flags.
- \`metrics.json\`: machine-readable coverage and validation summary.
- \`duplicates.json\`: exact duplicate record IDs and duplicate source-file relationships.
- \`report.md\`: this audit.
- \`report.html\`: a standalone readable audit report.
`;
}

function htmlReport(metrics, sources) {
  const escape = value => String(value ?? "").replace(/[&<>"']/g, character => ({
    "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
  })[character]);
  const curriculumSources = allPrimaryCurriculumSources();
  const rows = metrics.coverage.matrix.map(row => `<tr><td>${row.grade}</td><td>${escape(row.subject)}</td><td>${row.records}</td><td>${row.has_material ? "Present; completeness not verified" : "Missing"}</td></tr>`).join("");
  const curriculumRows = curriculumSources.map(item => {
    const source = item.source ? [
      item.source.url ? `<a href="${escape(item.source.url)}" target="_blank" rel="noopener noreferrer">${escape(item.source.title)}</a>` : escape(item.source.title || ""),
      item.source.publisher ? escape(item.source.publisher) : "",
      item.source.authors?.length ? `Authors: ${escape(item.source.authors.join(", "))}` : "",
      item.source.publicationDate ? `Publication: ${escape(item.source.publicationDate)}` : "",
      item.source.pageCount ? `PDF pages: ${item.source.pageCount}` : "",
      item.source.file ? `File: ${escape(item.source.file)}` : "",
    ].filter(Boolean).join("<br>") : "No grade-specific source registered";
    const outline = item.units.map(unit => `${unit.number}. ${unit.title}${unit.sections?.length ? ` — ${unit.sections.join(", ")}` : ""}`).join("; ") || "None";
    return `<tr><td>${item.grade}</td><td>${escape(item.subject)}</td><td>${escape(item.statusLabel)}</td><td>${source}</td><td>${escape(outline)}</td></tr>`;
  }).join("");
  const languageRows = metrics.coverage.languageCoverage.map(row => `<tr><td>${escape(row.language)}</td><td>${row.records}</td><td>${escape(row.subjects.join(", ") || "None")}</td></tr>`).join("");
  const sourceRows = sources.map(item => `<tr><td>${escape(item.file)}</td><td>${escape(item.subject || "Unassigned")}</td><td>${escape(item.grade ?? "Unassigned")}</td><td>${escape(item.content_type)}</td><td>${item.extracted_pages}</td><td>${escape(item.pdf_metadata?.Author || "Not in PDF metadata")}</td><td>${escape(item.duplicate_of ? `Duplicate of ${item.duplicate_of}` : item.excluded_reason || item.quality_note || "Indexed")}</td></tr>`).join("");
  const warnings = sources.filter(item => item.quality_note).map(item => `<li><strong>${escape(item.file)}</strong>: ${escape(item.quality_note)}${item.blank_pages.length ? ` Blank pages: ${item.blank_pages.join(", ")}.` : ""}${item.sparse_pages.length ? ` Sparse pages: ${item.sparse_pages.join(", ")}.` : ""}</li>`).join("") || "<li>No extraction warnings.</li>";
  const duplicates = sources.filter(item => item.duplicate_of).map(item => `<li><strong>${escape(item.file)}</strong> is byte-identical to <strong>${escape(item.duplicate_of)}</strong>. Duplicate pages were omitted; originals remain untouched.</li>`).join("") || "<li>No exact duplicate files found.</li>";
  const excluded = sources.filter(item => item.excluded_reason && !item.duplicate_of).map(item => `<li><strong>${escape(item.file)}</strong>: ${escape(item.excluded_reason)}</li>`).join("") || "<li>No excluded files.</li>";
  return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>MINA TEACH AI Knowledge Base Audit</title>
<style>
:root{color-scheme:light;--navy:#102a56;--blue:#1768c4;--pale:#e9f3ff;--ink:#18263b;--muted:#607087;--line:#dce5f0;--warn:#8a4b08}
*{box-sizing:border-box}body{margin:0;background:#f4f7fb;color:var(--ink);font:16px/1.55 system-ui,-apple-system,"Segoe UI",sans-serif}
header{background:linear-gradient(115deg,#102a56,#1768c4);color:#fff;padding:38px max(24px,calc((100vw - 1160px)/2)) 34px}
header p{opacity:.82;margin:0 0 6px}h1{font-size:clamp(28px,4vw,42px);line-height:1.15;margin:0}main{max-width:1160px;margin:24px auto;padding:0 20px 50px}
h2{font-size:22px;margin:0 0 14px;color:var(--navy)}section,.disclosure{background:#fff;border:1px solid var(--line);border-radius:16px;padding:22px;margin:16px 0;box-shadow:0 4px 16px #102a560a}
.cards{display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:12px}.card{padding:17px;border:1px solid var(--line);background:var(--pale);border-radius:12px}.card strong{display:block;font-size:27px;color:var(--navy)}.card span{color:var(--muted);font-size:14px}
.notice{border-left:4px solid var(--blue);background:#edf6ff;padding:14px 16px;border-radius:8px}.warning{border-left-color:#d2811a;background:#fff7e9}
.table-wrap{overflow:auto}table{width:100%;border-collapse:collapse;font-size:14px}th,td{text-align:left;vertical-align:top;border-bottom:1px solid var(--line);padding:9px 10px}th{color:var(--navy);background:#f2f7fd;position:sticky;top:0}td{overflow-wrap:anywhere}
ul{padding-left:22px}li{margin:6px 0}.badge{display:inline-block;background:#eef3f8;border-radius:20px;padding:2px 9px;font-size:13px}
footer{color:var(--muted);font-size:13px;margin:20px 4px}@media(max-width:640px){header{padding:28px 20px}section{padding:16px}.table-wrap{margin:0 -8px}}
</style></head><body>
<header><p>MINA TEACH AI · KNOWLEDGE COLLECTION</p><h1>Knowledge Base Audit</h1><p>Generated ${escape(metrics.generated_at)} · Structured export and source-readiness review</p></header>
<main>
<section><h2>Export snapshot</h2><div class="cards">
<div class="card"><strong>${metrics.pdf_files_total}</strong><span>Uploaded PDF files</span></div>
<div class="card"><strong>${metrics.pdf_files_unique}</strong><span>Unique files after hash deduplication</span></div>
<div class="card"><strong>${metrics.pdf_pages_indexed}</strong><span>Page records extracted</span></div>
<div class="card"><strong>${metrics.total_records}</strong><span>Total structured records</span></div>
<div class="card"><strong>${metrics.database.approved_non_ai_questions}</strong><span>Approved non-AI question records</span></div>
<div class="card"><strong>${metrics.exact_duplicate_records}</strong><span>Exact duplicate records flagged</span></div>
</div><p class="notice">This prepares records for retrieval. No AI model was trained, fine-tuned, or modified. The current AI Tutor is not yet connected to this local index.</p></section>
<section><h2>Requested subject and grade coverage</h2><p>${metrics.coverage.matrix.filter(row => !row.has_material).length} of ${metrics.coverage.matrix.length} combinations have no grade-tagged eligible record. Existing records do not prove complete curriculum coverage.</p><div class="table-wrap"><table><thead><tr><th>Grade</th><th>Subject</th><th>Records</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div></section>
<section><h2>Textbook and syllabus source mapping</h2><p>The 36 requested course combinations are mapped to available references or explicitly marked as missing. A table of contents or partial lesson set is not complete course coverage; no course is certified complete.</p><div class="table-wrap"><table><thead><tr><th>Grade</th><th>Subject</th><th>Mapping status</th><th>Recorded source</th><th>Unit and section titles transcribed</th></tr></thead><tbody>${curriculumRows}</tbody></table></div></section>
<section><h2>Language coverage</h2><div class="table-wrap"><table><thead><tr><th>Language</th><th>Records</th><th>Subjects represented</th></tr></thead><tbody>${languageRows}</tbody></table></div><p>Uploaded pages are tagged by a simple script check; Latin text cannot reliably distinguish English from Afaan Oromoo. Database language tags are preserved. Unknown values stay null.</p></section>
<section><h2>Duplicate files</h2><ul>${duplicates}</ul><h2>Excluded files</h2><ul>${excluded}</ul></section>
<section><h2>Extraction quality flags</h2><ul>${warnings}</ul><p>Blank or sparse extracted pages may need OCR or visual review. Extraction checks do not certify source accuracy.</p></section>
<section><h2>Source inventory</h2><div class="table-wrap"><table><thead><tr><th>File</th><th>Subject</th><th>Grade</th><th>Type</th><th>Pages</th><th>PDF Author field (unverified)</th><th>Notes</th></tr></thead><tbody>${sourceRows}</tbody></table></div><p>The embedded PDF Author field may identify a document creator, not the textbook author. Cover text remains available in page records.</p></section>
<section><h2>Integration readiness</h2><ul>
<li>JSONL records follow the accompanying JSON Schema, retain available provenance and answer/status fields, and passed record validation.</li>
<li>Local keyword retrieval works; production AI Tutor integration and semantic/vector indexing are not included.</li>
<li>Question records preserve the existing review state; only approved non-AI questions are eligible as exam-bank material. ${metrics.incomplete_mcq_records} structured MCQs failed none of the prompt/options/answer/explanation completeness checks. The approved database bank has ${metrics.database.approved_non_ai_questions} items versus the existing 100-item initial target.</li>
<li>Uploaded textbook pages are source-unreviewed, and chapter/topic mapping remains incomplete.</li>
<li>English, Afaan Oromoo, and Amharic coverage is not complete. No translations were generated.</li>
<li>Missing authors, page references, publication details, grades, or topics remain null rather than guessed.</li>
</ul></section>
<footer>Source PDFs and database records were read without alteration. Personal exam-result pages and unrelated doctoral handbook content were not exported.</footer>
</main></body></html>`;
}

async function main() {
  await mkdir(outputDir, { recursive: true });
  await ingestPdfs();
  bundleHistory();
  const dbResult = await ingestDatabase();
  const duplicates = detectExactRecordDuplicates(records);
  const validationErrors = records.flatMap(item => validateRecord(item).map(message => ({ id: item.id, message })));
  if (validationErrors.length) throw new Error(`Knowledge records failed schema validation: ${JSON.stringify(validationErrors.slice(0, 10))}`);
  const recordIds = new Set();
  for (const item of records) {
    if (recordIds.has(item.id)) throw new Error(`Duplicate record ID: ${item.id}`);
    recordIds.add(item.id);
  }
  const dbInfo = dbResult.database;
  const coverage = makeCoverage(dbInfo);
  const metrics = {
    generated_at: new Date().toISOString(),
    schema: "knowledge-base/schema.json",
    pdf_files_total: sources.length,
    pdf_files_unique: sources.filter(source => !source.duplicate_of).length,
    pdf_pages_indexed: records.filter(item => item.id.startsWith("pdf:")).length,
    total_records: records.length,
    retrieval_eligible_records: records.filter(item => item.retrieval_eligible).length,
    exact_duplicate_records: duplicates.length,
    bundled_history_lessons: bundledHistory.completeLessons.length,
    database: dbInfo,
    content_types: Object.fromEntries([...new Set(records.map(item => item.content_type))].sort().map(type => [type, records.filter(item => item.content_type === type).length])),
    incomplete_mcq_records: records.filter(item => item.content_type === "mcq" && (!item.question || item.options?.length !== 4 || item.options.some(option => !option.trim()) || item.correct_answer === null || !item.explanation)).length,
    coverage,
    validation_errors: validationErrors.length,
    source_warnings: issues,
  };
  const lines = records.map(item => JSON.stringify(item)).join("\n") + "\n";
  await writeFile(join(outputDir, "records.jsonl"), lines);
  await writeFile(join(outputDir, "schema.json"), await readFile(join(root, "knowledge-base/schema.json")));
  await writeFile(join(outputDir, "README.md"), await readFile(join(root, "knowledge-base/README.md")));
  await writeFile(join(outputDir, "sources.json"), JSON.stringify({ generated_at: metrics.generated_at, sources }, null, 2) + "\n");
  await writeFile(join(outputDir, "metrics.json"), JSON.stringify(metrics, null, 2) + "\n");
  await writeFile(join(outputDir, "duplicates.json"), JSON.stringify({
    exact_duplicate_records: duplicates,
    duplicate_pdf_files: sources.filter(source => source.duplicate_of).map(source => ({
      file: source.file, duplicate_of: source.duplicate_of, sha256: source.sha256,
    })),
  }, null, 2) + "\n");
  await writeFile(join(outputDir, "report.md"), reportText({ metrics, sources, records, duplicates }));
  await writeFile(join(outputDir, "report.html"), htmlReport(metrics, sources));
  console.log(JSON.stringify({
    outputDir,
    records: metrics.total_records,
    pdfPages: metrics.pdf_pages_indexed,
    databaseLessons: dbInfo.lesson_records,
    databaseQuestions: dbInfo.question_records,
    retrievalEligible: metrics.retrieval_eligible_records,
    duplicateFiles: sources.filter(source => source.duplicate_of).map(source => ({ file: source.file, duplicateOf: source.duplicate_of })),
    warnings: issues.length,
  }, null, 2));
}

main().catch(error => {
  console.error(`Knowledge export failed: ${error.message}`);
  process.exitCode = 1;
});

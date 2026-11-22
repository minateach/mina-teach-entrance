import test from "node:test";
import assert from "node:assert/strict";
import { makeRecord, scoreRecord, searchableText, validateRecord } from "../knowledge-base/records.mjs";

const source = { id: "src-1", file: "book.pdf", title: "Math textbook", author: null, publisher: null, publication_date: null, url: null, label: "uploaded", kind: "textbook_page" };

test("knowledge records always carry required null-aware schema fields", () => {
  const record = makeRecord({ id: "page:1", content_type: "textbook_page", source, content: "A complete page.", retrieval_eligible: true });
  assert.equal(record.grade, null);
  assert.equal(record.subject, null);
  assert.equal(record.page, null);
  assert.deepEqual(validateRecord(record), []);
});

test("schema validation rejects invalid grade, language, page and question options", () => {
  const record = makeRecord({ id: "lesson:1", content_type: "lesson", source, content: "Question", retrieval_eligible: true });
  assert.ok(validateRecord({ ...record, grade: 8 }).some(error => error.includes("grade")));
  assert.ok(validateRecord({ ...record, language: "fr" }).some(error => error.includes("language")));
  assert.ok(validateRecord({ ...record, page: 0 }).some(error => error.includes("page")));
  assert.ok(validateRecord({ ...record, options: "one" }).some(error => error.includes("options")));
  assert.throws(() => makeRecord({ id: "question:1", content_type: "mcq", source, content: "Question", options: ["A"], retrieval_eligible: true }), /exactly four/);
});

test("local search ranks matching eligible records and excludes drafts", () => {
  const lesson = makeRecord({ id: "lesson:1", subject: "History", grade: 10, topic: "Industrialization", content_type: "lesson_notes", source, content: "Industrialization increased machine-based production.", retrieval_eligible: true });
  const draft = makeRecord({ id: "lesson:2", content_type: "lesson", source, content: "Industrialization notes.", review_status: "draft", retrieval_eligible: false });
  assert.ok(scoreRecord(lesson, "industrialization machine") > 0);
  assert.equal(scoreRecord(draft, "industrialization"), 0);
  assert.match(searchableText(lesson), /machine-based production/);
});

test("question records preserve four choices, answer text and explanation", () => {
  const question = makeRecord({
    id: "question:2", content_type: "mcq", source, content: "What is capital?",
    question: "What is capital?", options: ["A", "B", "C", "D"], correct_answer: "B",
    explanation: "B is the invested wealth.", retrieval_eligible: true,
  });
  assert.equal(question.options.length, 4);
  assert.equal(question.correct_answer, "B");
  assert.match(question.explanation, /invested wealth/);
});

import test from "node:test";
import assert from "node:assert/strict";
import {
  extractPrivateDocument,
  inspectPrivateUpload,
  parseKnowledgeJsonl,
  retrievePrivateKnowledge,
  sharedKnowledgeOwnerId,
  splitPrivateDocument,
} from "../server/private-knowledge.mjs";

function knowledgeRows() {
  return [
    {
      subject: "Biology",
      grade: 10,
      chapter: "Cells",
      topic: "Cell membrane",
      language: "en",
      content_type: "mcq",
      source: "Example reference",
      page: 17,
      content: "The membrane controls movement into and out of a cell.",
      question: "What does the cell membrane do?",
      options: ["Controls movement", "Stores genetic material", "Makes light", "Digests food"],
      correct_answer: "Controls movement",
      explanation: "The membrane regulates exchange between the cell and its surroundings.",
    },
  ];
}

test("JSONL knowledge upload preserves structured source details and MCQ explanations", () => {
  const buffer = Buffer.from(knowledgeRows().map(row => JSON.stringify(row)).join("\n"));
  const inspected = inspectPrivateUpload({ filename: "biology.jsonl", buffer });
  assert.equal(inspected.mimeType, "application/x-ndjson");
  const parsed = parseKnowledgeJsonl(buffer);
  assert.equal(parsed.records.length, 1);
  assert.equal(parsed.metadata.subject, "Biology");
  assert.equal(parsed.metadata.grade, 10);
  assert.equal(parsed.records[0].pageNumber, 17);
  assert.match(parsed.records[0].text, /Correct answer: Controls movement/);
  assert.match(parsed.records[0].text, /Explanation: The membrane regulates exchange/);
  assert.equal(parsed.records[0].metadata.source, "Example reference");

  const chunks = splitPrivateDocument(parsed.records);
  assert.equal(chunks[0].metadata.topic, "Cell membrane");
  assert.match(chunks[0].content, /Question: What does the cell membrane do/);
});

test("JSONL fails the whole file when a line is invalid or an MCQ is incomplete", () => {
  const valid = knowledgeRows()[0];
  assert.throws(
    () => parseKnowledgeJsonl(Buffer.from(`${JSON.stringify(valid)}\n{not-json}`)),
    error => error.code === "JSONL_INVALID_LINE" && /line 2/.test(error.message),
  );
  assert.throws(
    () => parseKnowledgeJsonl(Buffer.from(JSON.stringify({ ...valid, options: ["only one"] }))),
    error => error.code === "JSONL_MCQ_INCOMPLETE",
  );
});

test("text extraction indexes the entire document and labels inferred metadata as a preview", async () => {
  const text = [
    "CHAPTER 1: Historical change",
    "History studies evidence about people and societies over time.",
    "A source can be an object, a written record, or an oral account.",
    "Researchers compare sources before drawing conclusions.",
  ].join("\n\n");
  const result = await extractPrivateDocument({
    filename: "Grade 10 History.txt",
    buffer: Buffer.from(text),
  });
  assert.equal(result.status, "ready");
  assert.equal(result.extractedCharacters, text.length);
  assert.match(result.pages[0].text, /Researchers compare sources/);
  assert.equal(result.metadata.subject, "History");
  assert.equal(result.metadata.grade, 10);
  assert.equal(result.metadata.language, "en");
  assert.equal(result.metadata.summaryType, "extractive_preview");
  assert.match(result.notice, /original file is preserved/i);
});

test("shared retrieval remains owner-scoped and returns file/page metadata for citations", async () => {
  const calls = [];
  const pool = {
    async query(sql, params = []) {
      calls.push({ sql: String(sql), params });
      if (String(sql).includes("FROM mina_private_document_chunks c") && String(sql).includes("ts_rank")) {
        return {
          rows: [{
            document_id: "d7fae5a0-2a69-4a7e-a943-82e102f11e62",
            filename: "biology.jsonl",
            display_name: "Biology grade 10",
            page_number: 17,
            content: "Cell membrane controls movement.",
            chunk_metadata: { subject: "Biology", grade: 10, topic: "Cell membrane", language: "en" },
            document_metadata: { format: "jsonl" },
          }],
          rowCount: 1,
        };
      }
      return { rows: [], rowCount: 0 };
    },
  };
  const matches = await retrievePrivateKnowledge(pool, sharedKnowledgeOwnerId, "cell membrane");
  assert.equal(matches.length, 1);
  assert.equal(matches[0].metadata.subject, "Biology");
  assert.equal(matches[0].pageNumber, 17);
  assert.equal(calls[1].params[0], sharedKnowledgeOwnerId);
  assert.match(calls[1].sql, /c\.user_id=\$1/);
});

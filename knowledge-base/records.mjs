export const requiredFields = [
  "id", "subject", "grade", "chapter", "topic", "language", "content_type",
  "question", "options", "correct_answer", "explanation", "source", "page",
  "content", "review_status", "retrieval_eligible",
];

export function makeRecord(input) {
  const record = {
    id: input.id,
    subject: input.subject ?? null,
    grade: input.grade ?? null,
    chapter: input.chapter ?? null,
    topic: input.topic ?? null,
    language: input.language ?? null,
    content_type: input.content_type,
    question: input.question ?? null,
    options: input.options ?? null,
    correct_answer: input.correct_answer ?? null,
    explanation: input.explanation ?? null,
    source: input.source,
    page: input.page ?? null,
    content: input.content ?? "",
    review_status: input.review_status ?? null,
    retrieval_eligible: input.retrieval_eligible === true,
    metadata: input.metadata ?? {},
  };
  for (const [key, value] of Object.entries(input)) {
    if (!(key in record)) record[key] = value;
  }
  const errors = validateRecord(record);
  if (errors.length) throw new TypeError(`Invalid knowledge record ${record.id || "(missing id)"}: ${errors.join("; ")}`);
  return record;
}

export function validateRecord(record) {
  const errors = [];
  for (const field of requiredFields) {
    if (!Object.hasOwn(record || {}, field)) errors.push(`missing ${field}`);
  }
  if (typeof record?.id !== "string" || !record.id.trim()) errors.push("id must be non-empty text");
  if (typeof record?.content_type !== "string" || !record.content_type.trim()) errors.push("content_type must be non-empty text");
  if (typeof record?.content !== "string") errors.push("content must be text");
  if (record?.grade !== null && record?.grade !== undefined && ![9, 10, 11, 12].includes(record.grade)) errors.push("grade must be 9–12 or null");
  if (record?.language !== null && record?.language !== undefined && !["en", "om", "am"].includes(record.language)) errors.push("language must be en, om, am, or null");
  if (record?.page !== null && record?.page !== undefined && (!Number.isInteger(record.page) || record.page < 1)) errors.push("page must be a positive one-based integer or null");
  if (record?.options !== null && record?.options !== undefined && (!Array.isArray(record.options) || !record.options.every(option => typeof option === "string"))) errors.push("options must be an array of text or null");
  if (record?.content_type === "mcq" && (!Array.isArray(record.options) || record.options.length !== 4 || record.options.some(option => !option.trim()))) errors.push("MCQs must contain exactly four non-empty options");
  if (typeof record?.retrieval_eligible !== "boolean") errors.push("retrieval_eligible must be boolean");
  if (!record?.source || typeof record.source !== "object" || typeof record.source.id !== "string") errors.push("source must include a stable id");
  return errors;
}

const tokens = value => String(value || "").toLocaleLowerCase()
  .normalize("NFKC")
  .match(/[\p{L}\p{N}]+/gu) || [];

export function searchableText(record) {
  return [
    record.subject, record.chapter, record.topic, record.content_type,
    record.question, record.explanation, record.content, record.source?.label,
    record.source?.title, record.source?.author,
  ].filter(Boolean).join(" ");
}

export function scoreRecord(record, query) {
  if (!record?.retrieval_eligible) return 0;
  const queryTokens = tokens(query);
  if (!queryTokens.length) return 0;
  const text = searchableText(record).toLocaleLowerCase();
  const title = [record.topic, record.chapter, record.question, record.source?.title]
    .filter(Boolean).join(" ").toLocaleLowerCase();
  let score = 0;
  for (const token of new Set(queryTokens)) {
    const matches = text.match(new RegExp(`(^|[^\\p{L}\\p{N}])${escapeRegExp(token)}(?=$|[^\\p{L}\\p{N}])`, "gu"));
    if (matches) score += Math.min(matches.length, 8) + (title.includes(token) ? 3 : 0);
  }
  if (text.includes(String(query).trim().toLocaleLowerCase())) score += 5;
  return score;
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

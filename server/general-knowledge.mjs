import { generalKnowledgeCategories } from "../knowledge-base/general-categories.mjs";
import { generalKnowledgeEnglishDrafts } from "../knowledge-base/general-lessons.en.mjs";

const supportedLanguages = new Set(["en", "om", "am"]);
const categoryBySlug = new Map(generalKnowledgeCategories.map(category => [category.slug, category]));
const slugPattern = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const list = value => Array.isArray(value) ? value : [];
const cleanString = value => typeof value === "string" ? value.trim() : "";

export class GeneralKnowledgeError extends Error {
  constructor(message, status = 400) {
    super(message);
    this.status = status;
  }
}

function validHttpsUrl(value) {
  if (!value) return false;
  try { return new URL(value).protocol === "https:"; }
  catch { return false; }
}

function isSourceFile(value) {
  return typeof value === "string" && /^[A-Za-z0-9._() -]+\.pdf$/i.test(value) && !value.includes("..");
}

function validSourceRef(ref) {
  if (!ref || typeof ref !== "object" || Array.isArray(ref) || !cleanString(ref.title)) return false;
  const hasUrl = validHttpsUrl(ref.url);
  const hasLocalFile = isSourceFile(ref.sourceFile);
  if (!hasUrl && !hasLocalFile) return false;
  const hasLocation = hasUrl || Number.isInteger(ref.pageStart) && ref.pageStart > 0 ||
    Number.isInteger(ref.page) && ref.page > 0;
  if (!hasLocation) return false;
  if (ref.pageEnd !== undefined && (!Number.isInteger(ref.pageEnd) || ref.pageEnd < (ref.pageStart || ref.page))) return false;
  return true;
}

function validTopic(topic) {
  return topic && typeof topic === "object" && !Array.isArray(topic) &&
    cleanString(topic.title).length >= 3 && cleanString(topic.explanation).length >= 40 &&
    Array.isArray(topic.subtopics) && topic.subtopics.length > 0 &&
    topic.subtopics.every(subtopic => subtopic && cleanString(subtopic.title).length >= 3 && cleanString(subtopic.explanation).length >= 30);
}

function validPromptItem(item, { answerRequired = true } = {}) {
  return item && typeof item === "object" && !Array.isArray(item) &&
    cleanString(item.prompt ?? item.question).length >= 12 &&
    (!answerRequired || cleanString(item.answer).length >= 2) &&
    (!answerRequired || cleanString(item.explanation).length >= 20);
}

export function validateGeneralKnowledgeLesson(input, { forPublish = false } = {}) {
  const errors = [];
  if (!input || typeof input !== "object" || Array.isArray(input)) return ["Lesson data is required."];
  if (typeof input.slug !== "string" || !slugPattern.test(input.slug) || input.slug.length > 100) errors.push("Use a stable lowercase lesson slug.");
  if (!categoryBySlug.has(input.categorySlug)) errors.push("Choose one of the listed General Knowledge categories.");
  if (cleanString(input.title).length < 4 || input.title.length > 180) errors.push("Add a lesson title between 4 and 180 characters.");
  if (!supportedLanguages.has(input.language)) errors.push("Choose English, Afaan Oromoo, or Amharic.");
  if (input.language === "en" && input.languageReviewStatus !== "not_applicable") errors.push("English lessons must use not_applicable for translation review.");
  if (input.language !== "en" && !["pending", "verified"].includes(input.languageReviewStatus)) errors.push("Record whether this translation has been reviewed.");

  if (cleanString(input.introduction).length < 100 || input.introduction.length > 20000) errors.push("Write a substantive introduction (100–20,000 characters).");
  if (!Array.isArray(input.objectives) || input.objectives.length < 2 || input.objectives.length > 20 ||
      input.objectives.some(value => cleanString(value).length < 12)) errors.push("Add at least two specific learning objectives.");
  if (!Array.isArray(input.topics) || input.topics.length < 2 || input.topics.length > 40 ||
      input.topics.some(topic => !validTopic(topic))) errors.push("Every lesson needs at least two explained topics with explained subtopics.");
  if (!Array.isArray(input.definitions) || input.definitions.length < 1 || input.definitions.length > 80 ||
      input.definitions.some(item => !item || cleanString(item.term).length < 2 || cleanString(item.definition).length < 20)) errors.push("Add clear definitions for important terms.");
  if (!Array.isArray(input.examples) || input.examples.length < 1 || input.examples.length > 60 ||
      input.examples.some(item => !item || cleanString(item.title).length < 3 || cleanString(item.explanation).length < 30)) errors.push("Add at least one explained example.");
  if (!Array.isArray(input.exercises) || input.exercises.length < 1 || input.exercises.length > 80 ||
      input.exercises.some(item => !validPromptItem(item))) errors.push("Add exercises with answers and explanations.");
  if (cleanString(input.summary).length < 60 || input.summary.length > 12000) errors.push("Write a substantive lesson summary.");
  if (!Array.isArray(input.revisionQuestions) || input.revisionQuestions.length < 2 || input.revisionQuestions.length > 80 ||
      input.revisionQuestions.some(item => !validPromptItem(item))) errors.push("Add at least two answered revision questions.");

  if (!Array.isArray(input.sources) || input.sources.length < 1 || input.sources.length > 20 ||
      input.sources.some(ref => !validSourceRef(ref))) errors.push("Every lesson needs traceable source references with valid locations.");
  if (!Array.isArray(input.relatedSlugs) || input.relatedSlugs.length > 30 ||
      input.relatedSlugs.some(slug => !slugPattern.test(slug) || slug === input.slug)) errors.push("Related lessons must use valid, different lesson slugs.");
  if (forPublish && Array.isArray(input.sources) && input.sources.some(ref => ref.verificationStatus !== "verified")) {
    errors.push("A reviewer must verify every cited source before publishing.");
  }
  if (forPublish && input.language !== "en" && input.languageReviewStatus !== "verified") {
    errors.push("A reviewer must verify the Afaan Oromoo or Amharic translation before publishing it.");
  }
  if (forPublish && list(input.topics).some(topic => topic.completionStatus === "incomplete")) {
    errors.push("Resolve incomplete topic sections before publishing.");
  }
  return errors;
}

function rowKey(record) {
  return `${record.slug}:${record.language}`;
}

function fromRow(row) {
  return {
    id: String(row.id),
    slug: row.slug,
    categorySlug: row.category_slug,
    title: row.title,
    language: row.language,
    languageReviewStatus: row.language_review_status,
    ...row.content,
    sources: row.source_refs || [],
    relatedSlugs: row.related_slugs || [],
    reviewStatus: row.review_status,
    isSeed: false,
  };
}

function publicSources(sources) {
  return list(sources).map(ref => ({
    title: ref.title,
    author: ref.author || null,
    publisher: ref.publisher || null,
    publicationDate: ref.publicationDate || null,
    edition: ref.edition || null,
    pageStart: ref.pageStart || ref.page || null,
    pageEnd: ref.pageEnd || null,
    sourceFile: isSourceFile(ref.sourceFile) ? ref.sourceFile : null,
    sourceUrl: validHttpsUrl(ref.url) ? ref.url : null,
    sourceKind: ref.sourceKind || null,
    verificationStatus: ref.verificationStatus || "unreported",
    note: ref.note || null,
  }));
}

function publicSummary(record) {
  return {
    id: record.id,
    slug: record.slug,
    categorySlug: record.categorySlug,
    categoryTitle: categoryBySlug.get(record.categorySlug)?.title || record.categorySlug,
    title: record.title,
    language: record.language,
    topicTitles: list(record.topics).map(topic => topic.title),
    sourceCount: list(record.sources).length,
    relatedSlugs: list(record.relatedSlugs),
  };
}

function publicLesson(record, related = []) {
  const { reviewStatus, isSeed, id, ...content } = record;
  return {
    ...content,
    id,
    categoryTitle: categoryBySlug.get(record.categorySlug)?.title || record.categorySlug,
    sources: publicSources(record.sources),
    relatedLessons: related.map(publicSummary),
    contentVersion: record.contentVersion || 1,
    reviewStatus: "published",
  };
}

function draftRecord(seed) {
  return { ...seed, id: `seed:${seed.slug}:${seed.language}`, reviewStatus: "draft", isSeed: true, contentVersion: 1 };
}

function rowValues(input, userId) {
  const content = {
    introduction: input.introduction,
    objectives: input.objectives,
    topics: input.topics,
    definitions: input.definitions,
    examples: input.examples,
    exercises: input.exercises,
    summary: input.summary,
    revisionQuestions: input.revisionQuestions,
  };
  return [
    input.slug, input.categorySlug, input.title, input.language, input.languageReviewStatus,
    JSON.stringify(content), JSON.stringify(input.sources), input.relatedSlugs, userId,
  ];
}

function normalizedListQuery(query = {}) {
  const language = query.language || "en";
  if (!supportedLanguages.has(language)) throw new GeneralKnowledgeError("Choose English, Afaan Oromoo, or Amharic.");
  const categorySlug = query.category || "";
  if (categorySlug && !categoryBySlug.has(categorySlug)) throw new GeneralKnowledgeError("Choose a valid General Knowledge category.");
  const search = cleanString(query.search).slice(0, 120);
  const offset = Number(query.offset || 0);
  const limit = Number(query.limit || 20);
  if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
    throw new GeneralKnowledgeError("Choose a valid result page.");
  }
  return { language, categorySlug, search, offset, limit };
}

export function createGeneralKnowledgeCenter(pool, seeds = generalKnowledgeEnglishDrafts) {
  const seedsByKey = new Map(seeds.map(seed => [rowKey(seed), draftRecord(seed)]));

  async function databaseRecord(slug, language) {
    const result = await pool.query("SELECT * FROM mina_general_knowledge_lessons WHERE slug=$1 AND language=$2", [slug, language]);
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async function categories(language = "en") {
    if (!supportedLanguages.has(language)) throw new GeneralKnowledgeError("Choose English, Afaan Oromoo, or Amharic.");
    const result = await pool.query(
      "SELECT category_slug,COUNT(*)::int AS lesson_count FROM mina_general_knowledge_lessons WHERE language=$1 AND review_status='published' GROUP BY category_slug",
      [language],
    );
    const counts = new Map(result.rows.map(row => [row.category_slug, Number(row.lesson_count)]));
    return {
      language,
      categories: generalKnowledgeCategories.map(category => ({ ...category, publishedLessonCount: counts.get(category.slug) || 0 })),
    };
  }

  async function lessons(query = {}) {
    const { language, categorySlug, search, offset, limit } = normalizedListQuery(query);
    const params = [language];
    const conditions = ["language=$1", "review_status='published'"];
    if (categorySlug) {
      params.push(categorySlug);
      conditions.push(`category_slug=$${params.length}`);
    }
    if (search) {
      params.push(`%${search}%`);
      const param = `$${params.length}`;
      conditions.push(`(title ILIKE ${param} OR content::text ILIKE ${param} OR category_slug ILIKE ${param})`);
    }
    const result = await pool.query(
      `SELECT * FROM mina_general_knowledge_lessons WHERE ${conditions.join(" AND ")} ORDER BY category_slug,title,slug LIMIT $${params.length + 1} OFFSET $${params.length + 2}`,
      [...params, limit + 1, offset],
    );
    const records = result.rows.slice(0, limit).map(fromRow);
    return { lessons: records.map(publicSummary), nextOffset: result.rows.length > limit ? offset + limit : null, language };
  }

  async function lesson(slug, language = "en") {
    if (!slugPattern.test(slug || "")) throw new GeneralKnowledgeError("Choose a valid lesson.");
    if (!supportedLanguages.has(language)) throw new GeneralKnowledgeError("Choose English, Afaan Oromoo, or Amharic.");
    const record = await databaseRecord(slug, language);
    if (!record || record.reviewStatus !== "published") return null;
    let related = [];
    if (record.relatedSlugs.length) {
      const result = await pool.query(
        "SELECT * FROM mina_general_knowledge_lessons WHERE slug=ANY($1::text[]) AND language=$2 AND review_status='published' ORDER BY title",
        [record.relatedSlugs, language],
      );
      related = result.rows.map(fromRow);
    }
    return publicLesson(record, related);
  }

  async function manageList(query = {}) {
    const offset = Number(query.offset || 0);
    const limit = Number(query.limit || 30);
    const status = query.status || "all";
    if (!Number.isSafeInteger(offset) || offset < 0 || !Number.isInteger(limit) || limit < 1 || limit > 50) {
      throw new GeneralKnowledgeError("Choose a valid review queue page.");
    }
    if (!["all", "draft", "published", "rejected"].includes(status)) throw new GeneralKnowledgeError("Choose a valid review status.");
    const result = await pool.query("SELECT * FROM mina_general_knowledge_lessons ORDER BY updated_at DESC LIMIT 1000");
    const database = result.rows.map(fromRow);
    const overridden = new Set(database.map(rowKey));
    const records = [...database, ...[...seedsByKey.entries()].filter(([key]) => !overridden.has(key)).map(([, value]) => value)]
      .filter(record => status === "all" || record.reviewStatus === status)
      .sort((a, b) => generalKnowledgeCategories.findIndex(item => item.slug === a.categorySlug) -
        generalKnowledgeCategories.findIndex(item => item.slug === b.categorySlug) || a.title.localeCompare(b.title) || a.language.localeCompare(b.language));
    return { lessons: records.slice(offset, offset + limit).map(publicSummary).map((summary, index) => ({
      ...summary,
      reviewStatus: records[offset + index].reviewStatus,
      isSeed: records[offset + index].isSeed,
      languageReviewStatus: records[offset + index].languageReviewStatus,
      sourceStatuses: list(records[offset + index].sources).map(ref => ref.verificationStatus || "unreported"),
    })), nextOffset: offset + limit < records.length ? offset + limit : null, total: records.length };
  }

  async function manageLesson(slug, language = "en") {
    if (!slugPattern.test(slug || "")) throw new GeneralKnowledgeError("Choose a valid lesson.");
    if (!supportedLanguages.has(language)) throw new GeneralKnowledgeError("Choose English, Afaan Oromoo, or Amharic.");
    return await databaseRecord(slug, language) || seedsByKey.get(`${slug}:${language}`) || null;
  }

  async function save(input, userId, expectedSlug = null) {
    const errors = validateGeneralKnowledgeLesson(input);
    if (errors.length) throw new GeneralKnowledgeError(errors.join(" "));
    if (expectedSlug && input.slug !== expectedSlug) throw new GeneralKnowledgeError("Keep the lesson slug unchanged while editing.");
    const values = rowValues(input, userId);
    const result = await pool.query(
      `INSERT INTO mina_general_knowledge_lessons
       (slug,category_slug,title,language,language_review_status,content,source_refs,related_slugs,review_status,created_by,updated_by)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,'draft',$9,$9)
       ON CONFLICT (slug,language) DO UPDATE SET
         category_slug=EXCLUDED.category_slug,title=EXCLUDED.title,language_review_status=EXCLUDED.language_review_status,
         content=EXCLUDED.content,source_refs=EXCLUDED.source_refs,related_slugs=EXCLUDED.related_slugs,
         review_status='draft',content_version=mina_general_knowledge_lessons.content_version+1,
         updated_by=EXCLUDED.updated_by,reviewed_by=NULL,reviewed_at=NULL,updated_at=NOW()
       RETURNING id,review_status`,
      values,
    );
    return { id: String(result.rows[0].id), slug: input.slug, language: input.language, reviewStatus: result.rows[0].review_status };
  }

  async function review(slug, language, status, userId) {
    if (!["published", "rejected"].includes(status)) throw new GeneralKnowledgeError("Choose publish or reject.");
    const record = await manageLesson(slug, language);
    if (!record) return null;
    if (status === "published") {
      const errors = validateGeneralKnowledgeLesson(record, { forPublish: true });
      if (errors.length) throw new GeneralKnowledgeError(errors.join(" "));
    }
    const values = rowValues(record, record.updatedBy || userId);
    const result = await pool.query(
      `INSERT INTO mina_general_knowledge_lessons
       (slug,category_slug,title,language,language_review_status,content,source_refs,related_slugs,review_status,created_by,updated_by,reviewed_by,reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8,$10,$9,$9,$11,NOW())
       ON CONFLICT (slug,language) DO UPDATE SET
         category_slug=EXCLUDED.category_slug,title=EXCLUDED.title,language_review_status=EXCLUDED.language_review_status,
         content=EXCLUDED.content,source_refs=EXCLUDED.source_refs,related_slugs=EXCLUDED.related_slugs,
         review_status=EXCLUDED.review_status,reviewed_by=EXCLUDED.reviewed_by,reviewed_at=NOW(),updated_at=NOW()
       RETURNING id,review_status`,
      [...values.slice(0, 8), userId, status, userId],
    );
    return { id: String(result.rows[0].id), slug, language, reviewStatus: result.rows[0].review_status };
  }

  return { categories, lessons, lesson, manageList, manageLesson, save, review };
}

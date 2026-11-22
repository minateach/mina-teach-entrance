import test from "node:test";
import assert from "node:assert/strict";
import { generalKnowledgeCategories } from "../knowledge-base/general-categories.mjs";
import { generalKnowledgeEnglishDrafts } from "../knowledge-base/general-lessons.en.mjs";
import { createGeneralKnowledgeCenter, validateGeneralKnowledgeLesson } from "../server/general-knowledge.mjs";

function databaseRow(record, id = 1, reviewStatus = "published") {
  return {
    id,
    slug: record.slug,
    category_slug: record.categorySlug,
    title: record.title,
    language: record.language,
    language_review_status: record.languageReviewStatus,
    content: {
      introduction: record.introduction,
      objectives: record.objectives,
      topics: record.topics,
      definitions: record.definitions,
      examples: record.examples,
      exercises: record.exercises,
      summary: record.summary,
      revisionQuestions: record.revisionQuestions,
    },
    source_refs: record.sources,
    related_slugs: record.relatedSlugs,
    review_status: reviewStatus,
    content_version: 1,
  };
}

test("the requested twenty categories are distinct and starter drafts map to them", () => {
  assert.equal(generalKnowledgeCategories.length, 20);
  assert.equal(new Set(generalKnowledgeCategories.map(item => item.slug)).size, 20);
  assert.equal(generalKnowledgeEnglishDrafts.length, 11);
  assert.equal(new Set(generalKnowledgeEnglishDrafts.map(item => item.slug)).size, generalKnowledgeEnglishDrafts.length);
  for (const lesson of generalKnowledgeEnglishDrafts) {
    assert.ok(generalKnowledgeCategories.some(category => category.slug === lesson.categorySlug));
    assert.equal(lesson.language, "en");
    assert.deepEqual(validateGeneralKnowledgeLesson(lesson), [], `${lesson.slug} has complete source-backed sections`);
    assert.doesNotMatch(JSON.stringify(lesson).toLowerCase(), /study prompt|no reviewed lesson source/);
  }
});

test("publishing requires verified references and reviewed non-English translations", () => {
  const lesson = structuredClone(generalKnowledgeEnglishDrafts[0]);
  assert.ok(validateGeneralKnowledgeLesson(lesson, { forPublish: true }).some(error => /verify every cited source/i.test(error)));
  lesson.sources = lesson.sources.map(source => ({ ...source, verificationStatus: "verified" }));
  assert.deepEqual(validateGeneralKnowledgeLesson(lesson, { forPublish: true }), []);
  lesson.language = "om";
  lesson.languageReviewStatus = "pending";
  assert.ok(validateGeneralKnowledgeLesson(lesson, { forPublish: true }).some(error => /translation/i.test(error)));
  lesson.languageReviewStatus = "verified";
  assert.deepEqual(validateGeneralKnowledgeLesson(lesson, { forPublish: true }), []);
});

test("drafts stay out of public categories, search, and lesson pages", async () => {
  const seed = generalKnowledgeEnglishDrafts[0];
  const rows = [databaseRow(seed, 1, "draft")];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes("SELECT category_slug,COUNT(*)")) return { rows: [] };
      if (sql.includes("SELECT * FROM mina_general_knowledge_lessons WHERE slug=$1")) return { rows: rows.filter(row => row.slug === params[0] && row.language === params[1]) };
      if (sql.includes("SELECT * FROM mina_general_knowledge_lessons WHERE language=$1")) return { rows: [] };
      if (sql.includes("SELECT * FROM mina_general_knowledge_lessons ORDER BY updated_at")) return { rows };
      return { rows: [] };
    },
  };
  const center = createGeneralKnowledgeCenter(pool);
  const categories = await center.categories("en");
  assert.equal(categories.categories.length, 20);
  assert.equal(categories.categories.find(item => item.slug === seed.categorySlug).publishedLessonCount, 0);
  assert.equal((await center.lessons({ category: seed.categorySlug, language: "en" })).lessons.length, 0);
  assert.equal(await center.lesson(seed.slug, "en"), null);
  const queue = await center.manageList({ status: "all" });
  assert.ok(queue.lessons.some(item => item.slug === seed.slug && item.reviewStatus === "draft"));
});

test("a published lesson exposes complete source citations and only published related lessons", async () => {
  const first = generalKnowledgeEnglishDrafts.find(item => item.slug === "ancient-civilizations");
  const related = generalKnowledgeEnglishDrafts.find(item => item.slug === "culture-through-material-evidence");
  const rows = [databaseRow(first), databaseRow(related, 2)];
  const pool = {
    async query(sql, params = []) {
      if (sql.includes("SELECT * FROM mina_general_knowledge_lessons WHERE slug=$1")) {
        return { rows: rows.filter(row => row.slug === params[0] && row.language === params[1]) };
      }
      if (sql.includes("slug=ANY")) return { rows: rows.filter(row => params[0].includes(row.slug) && row.review_status === "published") };
      if (sql.includes("SELECT * FROM mina_general_knowledge_lessons WHERE language=$1")) {
        return { rows: rows.filter(row => row.language === params[0] && row.review_status === "published" && row.category_slug === params[1]) };
      }
      return { rows: [] };
    },
  };
  const lesson = await createGeneralKnowledgeCenter(pool).lesson(first.slug, "en");
  assert.equal(lesson.reviewStatus, "published");
  assert.equal(lesson.topics.length, 2);
  assert.ok(lesson.topics.every(topic => topic.subtopics.length > 0));
  assert.ok(lesson.sources[0].sourceFile.endsWith(".pdf"));
  assert.equal(lesson.sources[0].pageStart, 29);
  assert.ok(lesson.relatedLessons.some(item => item.slug === related.slug));
});

test("missing or shallow content cannot be saved or published as a lesson", () => {
  const lesson = structuredClone(generalKnowledgeEnglishDrafts[0]);
  lesson.topics = [{ title: "A title only", explanation: "", subtopics: [] }];
  lesson.sources = [];
  const errors = validateGeneralKnowledgeLesson(lesson);
  assert.ok(errors.some(error => /topics/i.test(error)));
  assert.ok(errors.some(error => /source references/i.test(error)));
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";

const context = {window: {}};
vm.runInNewContext(readFileSync(new URL("../learning/history-grade10.js", import.meta.url), "utf8"), context);
const curriculum = context.window.MINA_G10_HISTORY;

test("Unit 1 follows the 2023 reference's numbered section order", () => {
  assert.equal(Array.from(curriculum.completeLessons, lesson => lesson.number).join(","), "1.1,1.2,1.2.1,1.2.2,1.2.3,1.2.4");
  assert.match(curriculum.source.url, /^https:\/\/anrseb\.gov\.et\//);
  assert.match(curriculum.source.note, /AI-authored/);
  assert.match(curriculum.source.note, /review is pending/);
});

test("Each published local learning page contains actual explanatory material", () => {
  for (const lesson of curriculum.completeLessons) {
    assert.ok(lesson.objectives.length >= 3, lesson.number);
    assert.ok(lesson.introduction.length >= 120, lesson.number);
    assert.ok(lesson.topics.length >= 3, lesson.number);
    for (const topic of lesson.topics) {
      assert.ok(topic.notes.length >= 250, `${lesson.number}: ${topic.title}`);
      assert.ok(topic.terms.length >= 1);
      assert.ok(topic.example.length >= 60);
    }
    assert.ok(lesson.exercises.length >= 3);
    assert.ok(lesson.summary.length >= 150);
    assert.ok(lesson.revision.length >= 3);
    assert.doesNotMatch(JSON.stringify(lesson), /study prompt|lorem ipsum|no reviewed lesson source/i);
  }
});

test("Every lesson has 10 unique four-option MCQs with answers and explanations", () => {
  const prompts = new Set();
  let count = 0;
  for (const lesson of curriculum.completeLessons) {
    assert.ok(lesson.questions.length >= 10, lesson.number);
    for (const question of lesson.questions) {
      assert.equal(question.choices.length, 4);
      assert.equal(new Set(question.choices.map(choice => choice.toLowerCase().replace(/^[a-d]\.\s*/, ""))).size, 4);
      assert.ok(Number.isInteger(question.answer) && question.answer >= 0 && question.answer <= 3);
      assert.ok(question.explanation.length >= 50);
      assert.ok(!prompts.has(question.prompt.toLowerCase()), question.prompt);
      prompts.add(question.prompt.toLowerCase());
      count++;
    }
  }
  assert.equal(count, 60);
});

import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  buildTutorInstructions,
  isFounderQuestion,
  resolveFounderResponse,
} from "../server/assistant-guidance.mjs";

const founderProfile = JSON.parse(await readFile(new URL("../server/founder-profile.json", import.meta.url), "utf8"));

test("founder answers use only the owner-provided English, Afaan Oromoo, and Amharic text", () => {
  const cases = [
    ["en", "Who founded Mina Teach AI?", founderProfile.responses.en],
    ["om", "Eenyutu Mina Teach AI uume?", founderProfile.responses.om],
    ["am", "ሚና ቲች AI መስራች ማን ነው?", founderProfile.responses.am],
  ];

  for (const [language, message, expected] of cases) {
    assert.equal(resolveFounderResponse(language, message, [], founderProfile), expected);
    assert.ok(expected.trim().length > 0);
  }
});

test("automatic founder replies detect Amharic and Afaan Oromoo without adding biography", () => {
  assert.equal(
    resolveFounderResponse("auto", "Eenyutu Mina Teach AI uume?", [], founderProfile),
    founderProfile.responses.om,
  );
  assert.equal(
    resolveFounderResponse("auto", "ሚና ቲች AI መስራች ማን ነው?", [], founderProfile),
    founderProfile.responses.am,
  );
  assert.equal(isFounderQuestion("Who founded you?", [{ role: "user", content: "Tell me about Mina Teach AI." }]), true);
  assert.equal(resolveFounderResponse("en", "Who founded a different company?", [], founderProfile), null);
});

test("tutor guidance is respectful, balanced, and factual in every supported reply language", () => {
  for (const language of ["en", "om", "am", "auto"]) {
    const instructions = buildTutorInstructions(language, 10, false, "", false, [], founderProfile);
    assert.match(instructions, /MINA TEACH AI/);
    assert.match(instructions, /Grade 10/);
    assert.match(instructions, /nonjudgmental/i);
    assert.match(instructions, /consent, privacy, boundaries/i);
    assert.match(instructions, /trusted mediation/i);
    assert.match(instructions, /education and career/i);
    assert.match(instructions, /religious questions/i);
    assert.match(instructions, /historical evidence|history questions/i);
    assert.match(instructions, /explicit translation requests across English, Afaan Oromoo, and Amharic/i);
    assert.match(instructions, /interpretation/i);
    assert.match(instructions, /state uncertainty/i);
    assert.match(instructions, /do not claim to browse, search, or cite current sources/i);
  }
});

test("grounded research and consented study memory remain explicitly bounded", () => {
  const withoutMemory = buildTutorInstructions("en", 11, true, "", false, [], founderProfile);
  assert.match(withoutMemory, /Google Search grounding is available/);
  assert.doesNotMatch(withoutMemory, /explicitly chose to share these study preferences/);

  const withMemory = buildTutorInstructions("om", 11, false, "No search.", false, ["Show each algebra step"], founderProfile);
  assert.match(withMemory, /student's requested language/);
  assert.match(withMemory, /explicitly chose to share these study preferences for this answer/);
  assert.match(withMemory, /Show each algebra step/);
  assert.match(withMemory, /Treat them as limited preferences only/);
});

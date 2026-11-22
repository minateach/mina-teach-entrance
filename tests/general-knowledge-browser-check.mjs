import assert from "node:assert/strict";
import { browserDriver } from "./browser-driver.mjs";

if (!process.env.REPLIT_DEV_DOMAIN) throw new Error("REPLIT_DEV_DOMAIN is required.");
const origin = `https://${process.env.REPLIT_DEV_DOMAIN}`;
const browser = await browserDriver();
const { command, evaluate, waitFor } = browser;
const categoriesResponse = await fetch(`${origin}/api/general-knowledge/categories?language=en`);
assert.equal(categoriesResponse.status, 200);
const { categories } = await categoriesResponse.json();
assert.equal(categories.length, 20);
assert.equal(new Set(categories.map(item => item.slug)).size, 20);
for (const language of ["om", "am"]) {
  const translatedCategories = await fetch(`${origin}/api/general-knowledge/categories?language=${language}`);
  assert.equal(translatedCategories.status, 200);
  assert.equal((await translatedCategories.json()).categories.length, 20);
}
const publicDraft = await fetch(`${origin}/api/general-knowledge/lessons/scientific-method?language=en`);
assert.equal(publicDraft.status, 404, "unreviewed starter drafts stay hidden from students");
for (const [path, method] of [
  ["/api/general-knowledge/manage", "GET"],
  ["/api/general-knowledge/manage", "POST"],
  ["/api/general-knowledge/manage/scientific-method/review", "POST"],
]) {
  const response = await fetch(`${origin}${path}`, { method, headers: { "Content-Type": "application/json" }, ...(method === "GET" ? {} : { body: "{}" }) });
  assert.equal(response.status, 401, `${method} ${path} requires authentication`);
}

async function navigate(path, condition) {
  await command("Page.navigate", { url: `${origin}${path}` });
  await waitFor(`location.href===${JSON.stringify(origin + path)} && document.readyState==="complete" && (${condition})`);
}

const fixture = {
  id: "fixture:sample",
  slug: "sample-lesson",
  categorySlug: "science-discoveries",
  categoryTitle: "Science and discoveries",
  title: "A test-only science lesson",
  language: "en",
  introduction: "This fixture verifies that the page displays a full published lesson, its topics, exercises, explanations, and traceable references. It is injected only in this browser test and is never saved as application content.",
  objectives: ["Identify the test lesson objective.", "Explain how a test fixture is isolated from student content."],
  topics: [{ title: "Test topic", explanation: "A test-only explanation verifies the reading layout and language metadata.", subtopics: [{ title: "Subtopic", explanation: "A test-only subtopic confirms that nested notes are visible to the reader." }] }],
  definitions: [{ term: "Fixture", definition: "Temporary test data that is not stored or published as educational content." }],
  examples: [{ title: "Example", explanation: "The browser renders this test-only example and keeps it isolated from database records." }],
  exercises: [{ prompt: "What is this fixture used for?", answer: "To test display and progress controls.", explanation: "It is not real student learning material." }],
  summary: "This test-only summary verifies that the summary section is visible in the lesson reader.",
  revisionQuestions: [{ question: "Is this test content a published lesson?", answer: "No.", explanation: "The response is intercepted by the browser test and is never stored." }, { question: "What feature is checked?", answer: "Lesson display and progress controls.", explanation: "This test checks the browser behavior only." }],
  sources: [{ title: "Test fixture reference", sourceFile: "fixture.pdf", pageStart: 1, pageEnd: 1, sourceKind: "test", verificationStatus: "verified" }],
  relatedLessons: [],
  relatedSlugs: [],
  contentVersion: 1,
  reviewStatus: "published",
};
const summary = { slug: fixture.slug, categorySlug: fixture.categorySlug, categoryTitle: fixture.categoryTitle, title: fixture.title, language: "en", topicTitles: ["Test topic"], sourceCount: 1, relatedSlugs: [] };

try {
  await command("Emulation.setDeviceMetricsOverride", { width: 390, height: 844, deviceScaleFactor: 1, mobile: true });
  await navigate("/learning/knowledge/", 'document.querySelectorAll(".knowledge-card").length===20');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "mobile category grid fits viewport");
  for (const category of categories) {
    const path = `/learning/knowledge/?category=${encodeURIComponent(category.slug)}&language=en`;
    await navigate(path, `document.querySelector("#knowledge-category-view h2")?.textContent===${JSON.stringify(category.title)}`);
    assert.match(await evaluate('document.getElementById("knowledge-category-view").textContent'), /No reviewed lessons are published|published lesson/);
    assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, `${category.title} fits mobile`);
  }
  await command("Page.navigate", { url: `${origin}/learning/?grade=9&subject=General%20Knowledge&language=en` });
  await waitFor('location.pathname==="/learning/knowledge/" && document.querySelectorAll(".knowledge-card").length===20');
  await navigate("/admin/knowledge/", 'document.querySelector(".gate")?.innerText.includes("Sign in to continue")');
  await navigate("/learning/knowledge/?language=en", 'document.querySelectorAll(".knowledge-card").length===20');
  await evaluate('document.getElementById("knowledge-search").value="World history";document.getElementById("knowledge-search").dispatchEvent(new Event("input",{bubbles:true}))');
  await waitFor('document.getElementById("knowledge-search-results").textContent.includes("World history")');
  assert.match(await evaluate('document.getElementById("knowledge-search-results").textContent'), /Matching categories/);
  for (const [language, label] of [["om", "Afaan Oromoo"], ["am", "Amharic"]]) {
    await navigate(`/learning/knowledge/?category=science-discoveries&language=${language}`, 'document.getElementById("knowledge-category-view").textContent.includes("No reviewed lessons are published")');
    assert.ok((await evaluate('document.getElementById("knowledge-category-view").textContent')).includes(`in ${label}`));
  }

  await browser.intercept(request => {
    const url = new URL(request.url);
    if (url.pathname === "/api/general-knowledge/lessons/sample-lesson") return { body: { lesson: fixture } };
    if (url.pathname === "/api/general-knowledge/lessons" && url.searchParams.get("category") === fixture.categorySlug) {
      return { body: { lessons: [summary], nextOffset: null, language: "en" } };
    }
    return null;
  }, ["*api/general-knowledge/*"]);
  const lessonPath = `/learning/knowledge/?lesson=${fixture.slug}&language=en`;
  await navigate(lessonPath, 'document.querySelector(".knowledge-lesson-header h1")?.textContent==="A test-only science lesson"');
  const lessonText = await evaluate('document.getElementById("knowledge-lesson-view").innerText');
  for (const phrase of ["Learning objectives", "Topics and explanations", "Important terms", "Examples", "Practice exercises with answers", "Lesson summary", "Revision questions with answers", "Traceable references"]) {
    assert.ok(lessonText.includes(phrase), `lesson shows ${phrase}`);
  }
  assert.match(lessonText, /PDF pages 1/);
  await evaluate('document.querySelector(".knowledge-actions button").click()');
  await evaluate('document.querySelector(".knowledge-actions button:nth-child(2)").click()');
  await evaluate('document.querySelector(".knowledge-topic-bookmark").click()');
  assert.equal(await evaluate('document.getElementById("knowledge-lesson-view").textContent.includes("Completed ✓")'), true);
  await navigate("/learning/?grade=9&language=en", 'document.querySelector("#saved-lessons .saved-chip")');
  assert.match(await evaluate('document.getElementById("saved-lessons").textContent'), /A test-only science lesson/);
  await evaluate('document.querySelector("#saved-lessons button").click()');
  await waitFor('location.pathname==="/learning/knowledge/" && document.querySelector(".knowledge-lesson-header h1")?.textContent==="A test-only science lesson"');
  await navigate("/learning/?grade=9&language=en", 'document.querySelector("#bookmarked-topics .saved-chip")');
  await evaluate('document.querySelector("#bookmarked-topics button").click()');
  await waitFor('location.pathname==="/learning/knowledge/" && location.hash==="#topic-0"');
  await browser.stopIntercept();
  await command("Emulation.setDeviceMetricsOverride", { width: 1280, height: 800, deviceScaleFactor: 1, mobile: false });
  await navigate("/learning/knowledge/", 'document.querySelectorAll(".knowledge-card").length===20');
  assert.equal(await evaluate("document.documentElement.scrollWidth<=innerWidth"), true, "desktop center fits viewport");
  console.log("PASS: all 20 category routes, English/Oromo/Amharic honest empty states, desktop/mobile layout, search, hidden drafts, protected reviewer APIs, full lesson reading, saves, bookmarks, completion, and saved-item reopening.");
} finally {
  await browser.stopIntercept().catch(() => {});
  await browser.close();
}

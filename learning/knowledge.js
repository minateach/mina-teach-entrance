import { api, createStore } from "./learning-state.js";

const $ = id => document.getElementById(id);
const languageNames = { en: "English", om: "Afaan Oromoo", am: "Amharic" };
const store = createStore(message => { $("knowledge-progress").textContent = message; });
let categories = [];
let currentLessons = [];
let searchTimer = null;

function node(tag, text = "", className = "") {
  const element = document.createElement(tag);
  if (text) element.textContent = text;
  if (className) element.className = className;
  return element;
}

function link(text, href, className = "") {
  const element = node("a", text, className);
  element.href = href;
  return element;
}

function language() {
  return $("knowledge-language").value;
}

function pageUrl(changes = {}) {
  const params = new URLSearchParams(location.search);
  params.set("language", language());
  for (const [key, value] of Object.entries(changes)) {
    if (value === null || value === "") params.delete(key);
    else params.set(key, value);
  }
  return `/learning/knowledge/?${params}`;
}

function categoryBySlug(slug) {
  return categories.find(item => item.slug === slug);
}

function hideViews() {
  $("knowledge-search-results").hidden = true;
  $("knowledge-category-view").hidden = true;
  $("knowledge-lesson-view").hidden = true;
  $("knowledge-category-grid").hidden = true;
}

function renderCategoryCard(category) {
  const card = node("article", "", "knowledge-card");
  const top = node("div", "", "knowledge-card-top");
  top.append(node("span", String(categories.indexOf(category) + 1).padStart(2, "0"), "knowledge-card-icon"));
  top.append(node("h2", category.title));
  card.append(top, node("p", category.description));
  card.append(node("p", `${category.publishedLessonCount} reviewed lesson${category.publishedLessonCount === 1 ? "" : "s"} in ${languageNames[language()]}.`, "knowledge-count"));
  card.append(link("Browse category →", pageUrl({ category: category.slug, lesson: null }), ""));
  return card;
}

function renderCategoryGrid(searchText = "") {
  const grid = $("knowledge-category-grid");
  grid.replaceChildren();
  const term = searchText.trim().toLocaleLowerCase();
  const filtered = categories.filter(category => !term ||
    `${category.title} ${category.description}`.toLocaleLowerCase().includes(term));
  filtered.forEach(category => grid.append(renderCategoryCard(category)));
  grid.hidden = false;
  if (term && !filtered.length) grid.append(node("p", "No category name matches this search.", "knowledge-empty"));
}

function renderLessonCard(lesson) {
  const card = node("article", "", "knowledge-result-card");
  const title = link(lesson.title, pageUrl({ lesson: lesson.slug, category: lesson.categorySlug }), "");
  card.append(node("p", lesson.categoryTitle, "eyebrow"), title);
  if (lesson.topicTitles?.length) {
    const tags = node("div", "", "knowledge-tags");
    lesson.topicTitles.slice(0, 6).forEach(topic => tags.append(node("span", topic)));
    card.append(tags);
  }
  card.append(node("p", `${lesson.sourceCount} traceable source reference${lesson.sourceCount === 1 ? "" : "s"} · ${languageNames[lesson.language]}`));
  return card;
}

async function renderSearch(term) {
  hideViews();
  const box = $("knowledge-search-results");
  box.replaceChildren();
  box.hidden = false;
  box.append(node("h2", `Search results for “${term}”`));

  const matchingCategories = categories.filter(category =>
    `${category.title} ${category.description}`.toLocaleLowerCase().includes(term.toLocaleLowerCase()));
  if (matchingCategories.length) {
    box.append(node("h3", "Matching categories"));
    const categoryGrid = node("div", "", "knowledge-category-grid");
    matchingCategories.forEach(category => categoryGrid.append(renderCategoryCard(category)));
    box.append(categoryGrid);
  }

  try {
    const params = new URLSearchParams({ language: language(), search: term, limit: "30" });
    const result = await api(`/api/general-knowledge/lessons?${params}`);
    const list = node("div", "", "knowledge-results-list");
    result.lessons.forEach(lesson => list.append(renderLessonCard(lesson)));
    if (result.lessons.length) {
      box.append(node("h3", "Published lessons"));
      box.append(list);
    }
    if (!matchingCategories.length && !result.lessons.length) {
      box.append(node("p", `No reviewed ${languageNames[language()]} lessons match this search. Drafts are not shown to students.`, "knowledge-empty"));
    }
    $("knowledge-status").textContent = `${matchingCategories.length} matching categor${matchingCategories.length === 1 ? "y" : "ies"} · ${result.lessons.length} published lesson${result.lessons.length === 1 ? "" : "s"}.`;
  } catch (error) {
    box.append(node("p", error.message, "knowledge-empty"));
    $("knowledge-status").textContent = "Search could not be completed.";
  }
}

async function renderCategory(slug) {
  hideViews();
  const box = $("knowledge-category-view");
  box.replaceChildren();
  box.hidden = false;
  const category = categoryBySlug(slug);
  if (!category) {
    box.append(node("h2", "Category not found"), node("p", "Choose a category from the General Knowledge Center.", "knowledge-empty"));
    return;
  }
  box.append(link("← All categories", pageUrl({ category: null, lesson: null, search: null }), "knowledge-back"));
  box.append(node("p", "GENERAL KNOWLEDGE · NOT AN OFFICIAL CURRICULUM UNIT", "eyebrow"));
  box.append(node("h2", category.title), node("p", category.description));
  try {
    const params = new URLSearchParams({ language: language(), category: slug, limit: "50" });
    const result = await api(`/api/general-knowledge/lessons?${params}`);
    currentLessons = result.lessons;
    const list = node("div", "", "knowledge-results-list");
    currentLessons.forEach(lesson => list.append(renderLessonCard(lesson)));
    if (currentLessons.length) box.append(list);
    else box.append(node("p", `No reviewed lessons are published in ${languageNames[language()]} for this category yet. Drafts and unreviewed translations are not shown to students.`, "knowledge-empty"));
    $("knowledge-status").textContent = `${currentLessons.length} published lesson${currentLessons.length === 1 ? "" : "s"} in ${category.title}.`;
  } catch (error) {
    box.append(node("p", error.message, "knowledge-empty"));
    $("knowledge-status").textContent = "This category could not be loaded.";
  }
}

function appendListSection(parent, title, items, renderItem) {
  const section = node("section", "", "knowledge-section");
  section.append(node("h2", title));
  const listElement = node("ul");
  items.forEach(item => listElement.append(renderItem(item)));
  section.append(listElement);
  parent.append(section);
}

function showCompletion(lesson, progressKey, completed) {
  const progress = node("p", completed ? "Completed on this device and in your learning account when signed in." : "This lesson is not marked complete yet.", "knowledge-progress");
  const actions = node("div", "", "knowledge-actions");
  const save = node("button", store.state.saved.some(item => item.key === progressKey) ? "★ Saved lesson" : "☆ Save lesson");
  save.type = "button";
  save.addEventListener("click", () => {
    store.toggle("saved", {
      key: progressKey, id: progressKey, title: lesson.title,
      subject: "General Knowledge", language: lesson.language,
    });
    save.textContent = store.state.saved.some(item => item.key === progressKey) ? "★ Saved lesson" : "☆ Save lesson";
  });
  const mark = node("button", completed ? "Completed ✓" : "Mark lesson complete");
  mark.type = "button";
  mark.disabled = completed;
  mark.addEventListener("click", () => {
    if (!store.state.completed.includes(progressKey)) {
      store.state.completed.push(progressKey);
      store.save();
    }
    progress.textContent = "Completed on this device and in your learning account when signed in.";
    mark.textContent = "Completed ✓";
    mark.disabled = true;
  });
  actions.append(save, mark);
  return { actions, progress };
}

async function renderLesson(slug) {
  hideViews();
  const box = $("knowledge-lesson-view");
  box.replaceChildren();
  box.hidden = false;
  try {
    const response = await api(`/api/general-knowledge/lessons/${encodeURIComponent(slug)}?language=${encodeURIComponent(language())}`);
    const lesson = response.lesson;
    const header = node("header", "", "knowledge-lesson-header");
    header.append(link("← Back to category", pageUrl({ category: lesson.categorySlug, lesson: null }), "knowledge-back"));
    header.append(node("p", `GENERAL KNOWLEDGE · ${lesson.categoryTitle} · ${languageNames[lesson.language]} · REVIEWED AND PUBLISHED`, "knowledge-meta"));
    header.append(node("h1", lesson.title), node("p", lesson.introduction));

    const progressKey = `knowledge:${lesson.language}:${lesson.slug}`;
    const { actions, progress } = showCompletion(lesson, progressKey, store.state.completed.includes(progressKey));
    header.append(actions, progress);
    box.append(header);

    const content = node("div", "", "knowledge-lesson-content");
    appendListSection(content, "Learning objectives", lesson.objectives, item => node("li", item));

    const topicSection = node("section", "", "knowledge-section");
    topicSection.append(node("h2", "Topics and explanations"));
    lesson.topics.forEach((topic, index) => {
      const topicBox = node("div", "", "knowledge-topic");
      topicBox.id = `topic-${index}`;
      topicBox.append(node("h3", topic.title), node("p", topic.explanation));
      if (topic.subtopics?.length) {
        const subtopics = node("ul");
        topic.subtopics.forEach(item => subtopics.append(node("li", `${item.title}: ${item.explanation}`)));
        topicBox.append(subtopics);
      }
      const bookmarkKey = `${progressKey}:topic:${index}`;
      const isBookmarked = store.state.bookmarks.some(item => item.key === bookmarkKey);
      const bookmark = node("button", isBookmarked ? "★ Topic bookmarked" : "☆ Bookmark topic", "knowledge-topic-bookmark");
      bookmark.type = "button";
      bookmark.addEventListener("click", () => {
        store.toggle("bookmarks", {
          key: bookmarkKey, id: progressKey, title: topic.title,
          subject: "General Knowledge", language: lesson.language,
        });
        bookmark.textContent = store.state.bookmarks.some(item => item.key === bookmarkKey) ? "★ Topic bookmarked" : "☆ Bookmark topic";
      });
      topicBox.append(bookmark);
      topicSection.append(topicBox);
    });
    content.append(topicSection);

    const definitions = node("section", "", "knowledge-section");
    definitions.append(node("h2", "Important terms"));
    const termGrid = node("dl", "", "knowledge-definitions");
    lesson.definitions.forEach(item => {
      const entry = node("div", "", "knowledge-definition");
      entry.append(node("dt", item.term), node("dd", item.definition));
      termGrid.append(entry);
    });
    definitions.append(termGrid);
    content.append(definitions);

    appendListSection(content, "Examples", lesson.examples, item => {
      const li = node("li");
      li.append(node("strong", `${item.title}: `), document.createTextNode(item.explanation));
      return li;
    });
    appendListSection(content, "Practice exercises with answers", lesson.exercises, item => {
      const li = node("li");
      li.append(node("strong", `${item.prompt} `), node("p", `Answer: ${item.answer}`), node("p", `Explanation: ${item.explanation}`));
      return li;
    });
    const summary = node("section", "", "knowledge-section");
    summary.append(node("h2", "Lesson summary"), node("p", lesson.summary));
    content.append(summary);
    appendListSection(content, "Revision questions with answers", lesson.revisionQuestions, item => {
      const li = node("li");
      li.append(node("strong", `${item.question} `), node("p", `Answer: ${item.answer}`), node("p", `Explanation: ${item.explanation}`));
      return li;
    });

    const sourceSection = node("section", "", "knowledge-section");
    sourceSection.append(node("h2", "Traceable references"));
    sourceSection.append(node("p", "Original explanations are written for Mina Teach AI. Each reference identifies the source material used; this library is not an official curriculum unit."));
    const sourceList = node("ol", "", "knowledge-source-list");
    lesson.sources.forEach(source => {
      const item = node("li");
      const pages = source.pageStart
        ? ` · PDF pages ${source.pageStart}${source.pageEnd && source.pageEnd !== source.pageStart ? `–${source.pageEnd}` : ""}`
        : "";
      const details = [source.author, source.publisher, source.publicationDate, source.edition].filter(Boolean).join(" · ");
      item.append(node("strong", source.title), document.createTextNode(`${pages}${details ? ` · ${details}` : ""}`));
      if (source.sourceFile) item.append(node("p", `Project source file: ${source.sourceFile}`));
      if (source.note) item.append(node("p", source.note));
      if (source.sourceUrl) {
        const anchor = link("Open reference", source.sourceUrl);
        anchor.target = "_blank"; anchor.rel = "noopener noreferrer";
        item.append(anchor);
      }
      sourceList.append(item);
    });
    sourceSection.append(sourceList);
    content.append(sourceSection);

    if (lesson.relatedLessons?.length) {
      const related = node("section", "", "knowledge-section");
      related.append(node("h2", "Related lessons"));
      const links = node("div", "", "knowledge-related");
      lesson.relatedLessons.forEach(item => links.append(link(item.title, pageUrl({ lesson: item.slug, category: item.categorySlug }))));
      related.append(links);content.append(related);
    }
    box.append(content);
    const listParams = new URLSearchParams({ language: lesson.language, category: lesson.categorySlug, limit: "50" });
    const listResult = await api(`/api/general-knowledge/lessons?${listParams}`);
    currentLessons = listResult.lessons;
    const index = currentLessons.findIndex(item => item.slug === lesson.slug);
    if (index >= 0) {
      const nav = node("nav", "", "knowledge-actions");
      nav.setAttribute("aria-label", "Lesson navigation");
      for (const [target, label] of [[currentLessons[index - 1], "Previous lesson"], [currentLessons[index + 1], "Next lesson"]]) {
        if (target) nav.append(link(label, pageUrl({ lesson: target.slug, category: lesson.categorySlug })));
        else {
          const disabled = node("button", label);disabled.type = "button";disabled.disabled = true;nav.append(disabled);
        }
      }
      box.append(nav);
    }
    if (location.hash.startsWith("#topic-")) box.querySelector(location.hash)?.scrollIntoView({block: "start"});
    $("knowledge-status").textContent = "Published lesson loaded with all available sections and references.";
  } catch (error) {
    box.append(node("p", error.message, "knowledge-empty"));
    $("knowledge-status").textContent = "This lesson could not be opened.";
  }
}

async function loadPage() {
  const params = new URLSearchParams(location.search);
  const selectedLanguage = params.get("language") || "en";
  $("knowledge-language").value = ["en", "om", "am"].includes(selectedLanguage) ? selectedLanguage : "en";
  try {
    await store.initialize();
    const result = await api(`/api/general-knowledge/categories?language=${encodeURIComponent(language())}`);
    categories = result.categories;
    const search = params.get("search") || "";
    $("knowledge-search").value = search;
    if (params.get("lesson")) {
      await renderLesson(params.get("lesson"));
      return;
    }
    if (params.get("category")) {
      await renderCategory(params.get("category"));
      return;
    }
    if (search) {
      await renderSearch(search);
      return;
    }
    hideViews();
    $("knowledge-category-grid").hidden = false;
    renderCategoryGrid();
    $("knowledge-status").textContent = `${categories.length} General Knowledge categories. Lesson counts include published material only.`;
  } catch (error) {
    $("knowledge-status").textContent = error.message;
    $("knowledge-category-grid").replaceChildren(node("p", "The category list could not be loaded. No content has been assumed or substituted.", "knowledge-empty"));
  }
}

$("knowledge-search").addEventListener("input", () => {
  clearTimeout(searchTimer);
  searchTimer = setTimeout(() => {
    const value = $("knowledge-search").value.trim();
    history.pushState({}, "", pageUrl({ search: value || null, category: null, lesson: null }));
    if (value) renderSearch(value);
    else { hideViews();renderCategoryGrid();$("knowledge-status").textContent = `${categories.length} General Knowledge categories.`; }
  }, 220);
});

$("knowledge-language").addEventListener("change", () => {
  history.pushState({}, "", pageUrl({}));
  loadPage();
});

window.addEventListener("popstate", loadPage);
await loadPage();

(() => {
  const $ = id => document.getElementById(id);
  const editableRoles = new Set(["teacher", "question_reviewer", "educator", "admin"]);
  const reviewerRoles = new Set(["question_reviewer", "admin"]);
  let role = "";
  let editingSlug = null;
  let nextOffset = null;
  let queueItems = [];

  async function api(url, options = {}) {
    const response = await fetch(url, {
      credentials: "same-origin",
      ...options,
      headers: { "Content-Type": "application/json", ...(options.headers || {}) },
    });
    let data;
    try { data = await response.json(); }
    catch { throw new Error("The server returned an unreadable response."); }
    if (!response.ok) {
      const error = new Error(data?.error?.message || "The request failed.");
      error.status = response.status;
      throw error;
    }
    return data;
  }

  function gate(message, signIn = false) {
    $("knowledge-gate").querySelector("h1").textContent = signIn ? "Sign in to continue" : "Reviewer access required";
    $("knowledge-gate-message").textContent = message;
    $("knowledge-gate").querySelector(".button").hidden = !signIn;
  }

  function setLanguageReviewDefault() {
    const field = $("knowledge-form").elements.languageReviewStatus;
    if (!field) return;
    if ($("knowledge-form-language").value === "en") field.value = "not_applicable";
    else if (field.value === "not_applicable") field.value = "pending";
  }

  function jsonField(form, key, value) {
    form.elements[key].value = JSON.stringify(value ?? [], null, 2);
  }

  function setForm(lesson) {
    const form = $("knowledge-form");
    editingSlug = lesson?.slug || null;
    form.reset();
    if (!lesson) {
      form.elements.categorySlug.value = $("knowledge-category").options[0]?.value || "";
      form.elements.language.value = "en";
      form.elements.languageReviewStatus.value = "not_applicable";
      form.elements.slug.disabled = false;
      $("knowledge-form-title").textContent = "Add a lesson draft";
      form.querySelector('button[type="submit"]').textContent = "Save as draft";
      $("knowledge-cancel-edit").hidden = true;
      return;
    }
    for (const key of ["categorySlug", "slug", "title", "language", "languageReviewStatus", "introduction", "summary"]) {
      if (form.elements[key]) form.elements[key].value = lesson[key] ?? "";
    }
    for (const key of ["objectives", "topics", "definitions", "examples", "exercises", "revisionQuestions", "sources"]) {
      jsonField(form, key, lesson[key]);
    }
    form.elements.relatedSlugs.value = (lesson.relatedSlugs || []).join("\n");
    form.elements.slug.disabled = true;
    $("knowledge-form-title").textContent = `Edit ${lesson.title} (saves as draft)`;
    form.querySelector('button[type="submit"]').textContent = "Save draft changes";
    $("knowledge-cancel-edit").hidden = false;
    form.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  function makeButton(text, action, className = "secondary") {
    const button = document.createElement("button");
    button.type = "button";
    button.textContent = text;
    button.className = className;
    button.addEventListener("click", action);
    return button;
  }

  function renderQueue(append = false) {
    const root = $("knowledge-queue");
    if (!append) root.replaceChildren();
    if (!queueItems.length && !append) {
      $("knowledge-queue-status").textContent = "No General Knowledge drafts or published lessons are in the review queue.";
      return;
    }
    for (const lesson of queueItems) {
      const card = document.createElement("article");
      card.className = "knowledge-queue-card";
      const meta = document.createElement("p");
      const status = document.createElement("span");
      status.className = `knowledge-status-tag ${lesson.reviewStatus}`;
      status.textContent = lesson.reviewStatus;
      meta.append(status, document.createTextNode(`${lesson.categoryTitle} · ${lesson.language.toUpperCase()} · ${lesson.sourceCount} reference${lesson.sourceCount === 1 ? "" : "s"} · ${lesson.isSeed ? "Starter draft" : "Saved draft"}`));
      const title = document.createElement("h3");
      title.textContent = lesson.title;
      const sourceStatuses = [...new Set(lesson.sourceStatuses || [])];
      const detail = document.createElement("p");
      detail.textContent = `Source status: ${sourceStatuses.length ? sourceStatuses.join(", ") : "not reported"} · Translation review: ${lesson.languageReviewStatus}`;
      const actions = document.createElement("div");
      actions.className = "knowledge-review-actions";
      actions.append(makeButton("Edit", () => editLesson(lesson)));
      if (reviewerRoles.has(role)) {
        if (lesson.reviewStatus !== "published") {
          actions.append(makeButton("Publish after review", () => reviewLesson(lesson, "published"), ""));
        }
        if (lesson.reviewStatus !== "rejected") {
          actions.append(makeButton("Reject", () => reviewLesson(lesson, "rejected"), "reject"));
        }
      }
      card.append(meta, title, detail, actions);
      root.append(card);
    }
    $("knowledge-queue-status").textContent = `${root.children.length} General Knowledge lesson${root.children.length === 1 ? "" : "s"} loaded. Drafts are not student-visible.`;
  }

  async function loadQueue(append = false) {
    const status = $("knowledge-status-filter").value;
    const offset = append ? nextOffset : 0;
    $("knowledge-queue-status").textContent = "Loading General Knowledge review queue…";
    try {
      const params = new URLSearchParams({ status, offset: String(offset ?? 0), limit: "30" });
      const result = await api(`/api/general-knowledge/manage?${params}`);
      nextOffset = result.nextOffset;
      $("knowledge-load-more").hidden = nextOffset === null;
      queueItems = append ? [...queueItems, ...result.lessons] : result.lessons;
      renderQueue();
    } catch (error) {
      $("knowledge-queue-status").textContent = error.message;
    }
  }

  async function editLesson(summary) {
    try {
      const result = await api(`/api/general-knowledge/manage/${encodeURIComponent(summary.slug)}?language=${encodeURIComponent(summary.language)}`);
      setForm(result.lesson);
      $("knowledge-form-status").textContent = result.lesson.isSeed
        ? "This starter draft is stored with the app. Saving creates a reviewable database copy."
        : "Editing a saved entry will return it to draft.";
    } catch (error) {
      $("knowledge-queue-status").textContent = error.message;
    }
  }

  async function reviewLesson(lesson, status) {
    const endpoint = `/api/general-knowledge/manage/${encodeURIComponent(lesson.slug)}/review?language=${encodeURIComponent(lesson.language)}`;
    try {
      await api(endpoint, { method: "POST", body: JSON.stringify({ status, language: lesson.language }) });
      $("knowledge-queue-status").textContent = status === "published" ? "Reviewed lesson published." : "Lesson rejected; it remains hidden from students.";
      await loadQueue();
    } catch (error) {
      $("knowledge-queue-status").textContent = error.message;
    }
  }

  async function populateCategories() {
    const result = await api("/api/general-knowledge/categories?language=en");
    const select = $("knowledge-category");
    select.replaceChildren();
    result.categories.forEach(category => {
      const option = document.createElement("option");
      option.value = category.slug;
      option.textContent = category.title;
      select.append(option);
    });
  }

  function parseJson(form, name) {
    try {
      return JSON.parse(form.elements[name].value || "[]");
    } catch {
      throw new Error(`${name} must contain valid JSON.`);
    }
  }

  $("knowledge-form").addEventListener("submit", async event => {
    event.preventDefault();
    const form = event.currentTarget;
    const payload = {
      categorySlug: form.elements.categorySlug.value,
      slug: form.elements.slug.value.trim(),
      title: form.elements.title.value.trim(),
      language: form.elements.language.value,
      languageReviewStatus: form.elements.languageReviewStatus.value,
      introduction: form.elements.introduction.value.trim(),
      summary: form.elements.summary.value.trim(),
      relatedSlugs: form.elements.relatedSlugs.value.split(/\r?\n/).map(value => value.trim()).filter(Boolean),
    };
    try {
      for (const key of ["objectives", "topics", "definitions", "examples", "exercises", "revisionQuestions", "sources"]) {
        payload[key] = parseJson(form, key);
      }
      const endpoint = editingSlug
        ? `/api/general-knowledge/manage/${encodeURIComponent(editingSlug)}`
        : "/api/general-knowledge/manage";
      const result = await api(endpoint, { method: editingSlug ? "PUT" : "POST", body: JSON.stringify(payload) });
      $("knowledge-form-status").textContent = `Saved as a draft (${result.language.toUpperCase()}). Reviewer approval is required before students can see it.`;
      setForm(null);
      await loadQueue();
    } catch (error) {
      $("knowledge-form-status").textContent = error.message;
    }
  });

  $("knowledge-cancel-edit").addEventListener("click", () => setForm(null));
  $("knowledge-load-more").addEventListener("click", () => loadQueue(true));
  $("knowledge-status-filter").addEventListener("change", () => loadQueue());
  $("knowledge-form-language").addEventListener("change", setLanguageReviewDefault);

  (async () => {
    try {
      const status = await api("/api/account/status");
      if (!status.signedIn) {
        gate("Sign in with an authorized content or reviewer account to continue.", true);
        return;
      }
      role = status.role || "student";
      if (!editableRoles.has(role)) {
        gate("This account does not have General Knowledge content access.");
        return;
      }
      await populateCategories();
      $("knowledge-role").textContent = role.replaceAll("_", " ");
      $("knowledge-gate").hidden = true;
      $("knowledge-admin-dashboard").hidden = false;
      if (!reviewerRoles.has(role)) {
        $("knowledge-queue-status").textContent = "You may create and edit drafts. Publishing and rejection are restricted to reviewers.";
      }
      await loadQueue();
    } catch (error) {
      gate(error.status === 401 ? "Sign in with an authorized content or reviewer account to continue." : error.message, error.status === 401);
    }
  })();
})();

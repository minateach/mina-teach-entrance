const elements = {
  editModeTab: document.getElementById("editModeTab"),
  createModeTab: document.getElementById("createModeTab"),
  editControls: document.getElementById("editControls"),
  galleryButton: document.getElementById("galleryButton"),
  cameraButton: document.getElementById("cameraButton"),
  galleryInput: document.getElementById("galleryInput"),
  cameraInput: document.getElementById("cameraInput"),
  promptInput: document.getElementById("promptInput"),
  promptCount: document.getElementById("promptCount"),
  runButton: document.getElementById("runButton"),
  resetButton: document.getElementById("resetButton"),
  studioStatus: document.getElementById("studioStatus"),
  previewState: document.getElementById("previewState"),
  sourcePreview: document.getElementById("sourcePreview"),
  sourcePlaceholder: document.getElementById("sourcePlaceholder"),
  sourcePanel: document.getElementById("sourcePanel"),
  resultPreview: document.getElementById("resultPreview"),
  resultPlaceholder: document.getElementById("resultPlaceholder"),
  resultActions: document.getElementById("resultActions"),
  previewGrid: document.getElementById("previewGrid"),
  downloadButton: document.getElementById("downloadButton"),
  shareButton: document.getElementById("shareButton"),
};

let mode = "edit";
let sourceFile = null;
let sourceUrl = "";
let resultUrl = "";
let resultBlob = null;
let isProcessing = false;

function setStatus(message, state = "ready") {
  elements.studioStatus.textContent = message;
  elements.studioStatus.dataset.state = state;
}

function setMode(nextMode) {
  mode = nextMode;
  const editing = mode === "edit";
  elements.editModeTab.classList.toggle("active", editing);
  elements.editModeTab.setAttribute("aria-selected", String(editing));
  elements.createModeTab.classList.toggle("active", !editing);
  elements.createModeTab.setAttribute("aria-selected", String(!editing));
  elements.editControls.hidden = !editing;
  elements.sourcePanel.hidden = !editing;
  elements.previewGrid.classList.toggle("generation-mode", !editing);
  elements.runButton.textContent = editing ? "Edit photo" : "Create image";
  elements.previewState.textContent = editing
    ? sourceFile ? "Original ready" : "Choose a photo to begin"
    : "Text-to-image";
  updateRunButton();
}

function updateRunButton() {
  elements.runButton.disabled = isProcessing ||
    !elements.promptInput.value.trim() ||
    (mode === "edit" && !sourceFile);
}

function clearUrl(value) {
  if (value) URL.revokeObjectURL(value);
}

function updateCount() {
  elements.promptCount.textContent = `${elements.promptInput.value.length} / 1500`;
  updateRunButton();
}

async function prepareFile(file) {
  if (!file || !["image/jpeg", "image/png", "image/webp"].includes(file.type)) {
    throw new Error("Choose a JPG, PNG, or WEBP image.");
  }
  if (file.size > 12 * 1024 * 1024) throw new Error("Choose an image smaller than 12 MB.");
  if (typeof createImageBitmap !== "function") {
    if (file.size > 5 * 1024 * 1024) throw new Error("This browser cannot resize the image. Choose one under 5 MB.");
    return file;
  }
  let bitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width < 128 || bitmap.height < 128 || bitmap.width * bitmap.height > 50_000_000) {
      throw new Error("Choose a still image at least 128 px wide and tall.");
    }
    const ratio = Math.max(bitmap.width, bitmap.height) / Math.min(bitmap.width, bitmap.height);
    if (ratio > 4) throw new Error("Choose an image with a shape no wider than 4:1.");
    const scale = Math.min(1, 2_048 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(128, Math.round(bitmap.width * scale));
    canvas.height = Math.max(128, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d", { alpha: false });
    if (!context) throw new Error("This browser cannot prepare the image.");
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    const blob = await new Promise((resolve, reject) => {
      canvas.toBlob(result => result ? resolve(result) : reject(new Error("The image could not be prepared.")), "image/jpeg", 0.86);
    });
    const name = `${String(file.name || "image").replace(/\.[^.]*$/, "").slice(0, 100) || "image"}.jpg`;
    return new File([blob], name, { type: "image/jpeg", lastModified: Date.now() });
  } finally {
    bitmap?.close?.();
  }
}

async function selectFile(file) {
  try {
    const prepared = await prepareFile(file);
    clearUrl(sourceUrl);
    sourceFile = prepared;
    sourceUrl = URL.createObjectURL(prepared);
    elements.sourcePreview.src = sourceUrl;
    elements.sourcePreview.hidden = false;
    elements.sourcePlaceholder.hidden = true;
    elements.previewState.textContent = `${prepared.name} · ${(prepared.size / (1024 * 1024)).toFixed(1)} MB`;
    clearResult();
    setStatus("Photo prepared on this device. Enter an edit instruction.", "ready");
    updateRunButton();
  } catch (error) {
    setStatus(error.message || "This image could not be prepared.", "error");
  }
}

function clearResult() {
  clearUrl(resultUrl);
  resultUrl = "";
  resultBlob = null;
  elements.resultPreview.removeAttribute("src");
  elements.resultPreview.hidden = true;
  elements.resultPlaceholder.hidden = false;
  elements.resultActions.hidden = true;
}

function resetStudio() {
  clearUrl(sourceUrl);
  sourceUrl = "";
  sourceFile = null;
  elements.galleryInput.value = "";
  elements.cameraInput.value = "";
  elements.sourcePreview.removeAttribute("src");
  elements.sourcePreview.hidden = true;
  elements.sourcePlaceholder.hidden = false;
  elements.promptInput.value = "";
  updateCount();
  clearResult();
  elements.previewState.textContent = mode === "edit" ? "Choose a photo to begin" : "Text-to-image";
  setStatus(mode === "edit" ? "Choose a photo or switch to create mode." : "Describe the image you want to create.", "ready");
}

function dataUrlToBlob(dataUrl) {
  const match = /^data:(image\/(?:jpeg|png|webp));base64,([A-Za-z0-9+/]+={0,2})$/i.exec(dataUrl);
  if (!match) throw new Error("The image service returned an invalid image.");
  const binary = atob(match[2]);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) bytes[index] = binary.charCodeAt(index);
  return new Blob([bytes], { type: match[1].toLowerCase() });
}

async function runImageRequest() {
  if (isProcessing) return;
  const prompt = elements.promptInput.value.trim();
  if (!prompt || (mode === "edit" && !sourceFile)) return;

  isProcessing = true;
  updateRunButton();
  setStatus(mode === "edit" ? "Sending your photo securely to MiniMax H3-Image…" : "Sending your prompt to MiniMax H3-Image…");
  try {
    const request = { mode, prompt };
    if (mode === "edit") {
      setStatus("Preparing the photo locally…");
      request.imageDataUrl = await new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => typeof reader.result === "string" ? resolve(reader.result) : reject(new Error("The photo could not be read."));
        reader.onerror = () => reject(new Error("The photo could not be read from this device."));
        reader.readAsDataURL(sourceFile);
      });
      setStatus("MiniMax is creating one 1K result. This may take a few minutes…");
    } else {
      setStatus("MiniMax is creating one 1K image. This may take a few minutes…");
    }
    const response = await fetch("/api/image-studio/process", {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify(request),
    });
    const result = await response.json();
    if (!response.ok) throw new Error(result?.error?.message || "The image could not be processed.");
    if (typeof result.imageDataUrl !== "string") throw new Error("The image service returned no result; no placeholder was created.");
    const blob = dataUrlToBlob(result.imageDataUrl);
    clearUrl(resultUrl);
    resultBlob = blob;
    resultUrl = URL.createObjectURL(blob);
    elements.resultPreview.src = resultUrl;
    elements.resultPreview.hidden = false;
    elements.resultPlaceholder.hidden = true;
    elements.resultActions.hidden = false;
    elements.previewState.textContent = `${result.width} × ${result.height} · MiniMax H3-Image`;
    setStatus("Your AI result is ready. The original image is unchanged.", "success");
  } catch (error) {
    setStatus(error.message || "The image request failed. No automatic retry was made.", "error");
  } finally {
    isProcessing = false;
    updateRunButton();
  }
}

function downloadResult() {
  if (!resultUrl) return;
  const link = document.createElement("a");
  link.href = resultUrl;
  link.download = `mina-teach-${mode === "edit" ? "edited" : "created"}-image.jpg`;
  document.body.append(link);
  link.click();
  link.remove();
  setStatus("Image download started.", "success");
}

async function shareResult() {
  if (!resultUrl || !resultBlob) return;
  const blob = resultBlob;
  const file = new File([blob], `mina-teach-${mode === "edit" ? "edited" : "created"}-image.jpg`, { type: blob.type || "image/jpeg" });
  if (navigator.canShare?.({ files: [file] }) && navigator.share) {
    try {
      await navigator.share({ title: "MINA TEACH AI image", files: [file] });
      setStatus("Image shared.", "success");
      return;
    } catch (error) {
      if (error?.name === "AbortError") return;
    }
  }
  downloadResult();
  setStatus("Direct sharing is not supported here; the image was downloaded instead.", "success");
}

elements.editModeTab.addEventListener("click", () => setMode("edit"));
elements.createModeTab.addEventListener("click", () => setMode("generate"));
elements.galleryButton.addEventListener("click", () => elements.galleryInput.click());
elements.cameraButton.addEventListener("click", () => elements.cameraInput.click());
elements.galleryInput.addEventListener("change", () => {
  const file = elements.galleryInput.files?.[0];
  if (file) void selectFile(file);
});
elements.cameraInput.addEventListener("change", () => {
  const file = elements.cameraInput.files?.[0];
  if (file) void selectFile(file);
});
elements.promptInput.addEventListener("input", updateCount);
elements.runButton.addEventListener("click", runImageRequest);
elements.resetButton.addEventListener("click", resetStudio);
elements.downloadButton.addEventListener("click", downloadResult);
elements.shareButton.addEventListener("click", () => void shareResult());
document.querySelectorAll("[data-prompt]").forEach(button => {
  button.addEventListener("click", () => {
    elements.promptInput.value = button.dataset.prompt || "";
    updateCount();
    elements.promptInput.focus();
  });
});

updateCount();
setMode("edit");

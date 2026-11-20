const unavailable = () => {
  const error = new Error("No on-device AI model is installed. Your message is saved here; reconnect to use the online AI Tutor.");
  error.code = "OFFLINE_MODEL_NOT_CONFIGURED";
  return error;
};

export function hasOfflineTutor(provider = globalThis.MinaLocalAI) {
  return Boolean(provider && typeof provider.generate === "function");
}

export async function generateOfflineTutorAnswer(request, provider = globalThis.MinaLocalAI) {
  if (!hasOfflineTutor(provider)) throw unavailable();
  const answer = await provider.generate({
    grade: Number(request?.grade) || 9,
    language: ["en", "om", "am"].includes(request?.language) ? request.language : "en",
    message: String(request?.message || ""),
    history: Array.isArray(request?.history) ? request.history : [],
    ...(typeof request?.imageDataUrl === "string" ? { imageDataUrl: request.imageDataUrl } : {}),
  });
  if (typeof answer !== "string" || !answer.trim()) {
    const error = new Error("The on-device AI model returned no answer. Your message remains saved on this device.");
    error.code = "OFFLINE_MODEL_EMPTY_RESPONSE";
    throw error;
  }
  return answer.trim();
}

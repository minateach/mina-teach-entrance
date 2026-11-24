function responseError(body, fallback = "Your question could not be answered.") {
  const detail = body?.error;
  const error = new Error(typeof detail?.message === "string" ? detail.message : fallback);
  error.code = typeof detail?.code === "string" ? detail.code : "";
  error.statusCode = Number(detail?.statusCode) || 0;
  return error;
}

function dispatchFrame(frame, { onResearch, state }) {
  const lines = frame.split("\n");
  const event = lines.find(line => line.startsWith("event:"))?.slice(6).trim() || "message";
  const data = lines.filter(line => line.startsWith("data:")).map(line => line.slice(5).trimStart()).join("\n");
  if (!data) return;
  let payload;
  try { payload = JSON.parse(data); }
  catch { return; }
  if (event === "status" && ["searching", "fallback"].includes(payload.state)) {
    if (payload.state === "searching") state.researchStarted = true;
    onResearch?.(payload);
  } else if (event === "result") {
    state.result = payload;
  } else if (event === "error") {
    state.error = responseError(payload);
  }
}

export async function readAssistantResearchResponse(response, onResearch) {
  const contentType = response.headers?.get?.("content-type") || "";
  if (!contentType.includes("text/event-stream")) {
    let body;
    try { body = await response.json(); }
    catch { throw new Error("The tutor returned an unreadable response."); }
    if (!response.ok) throw responseError(body);
    return body;
  }

  if (!response.ok) throw new Error("The web research request failed before sources could be checked.");
  if (!response.body?.getReader) throw new Error("This browser cannot read the live research response.");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const state = { result: null, error: null, researchStarted: false };
  let buffer = "";
  try {
    while (true) {
      const { value, done } = await reader.read();
      buffer += decoder.decode(value || new Uint8Array(), { stream: !done }).replace(/\r\n/g, "\n");
      let boundary = buffer.indexOf("\n\n");
      while (boundary >= 0) {
        dispatchFrame(buffer.slice(0, boundary), { onResearch, state });
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf("\n\n");
      }
      if (done) break;
    }
  } finally {
    reader.releaseLock?.();
  }
  if (buffer.trim()) dispatchFrame(buffer, { onResearch, state });
  if (state.error) throw state.error;
  if (!state.result || typeof state.result.answer !== "string") {
    throw new Error(state.researchStarted
      ? "The web research stream ended before a complete answer arrived."
      : "The tutor returned an incomplete research response.");
  }
  return state.result;
}

export const monthlyGroundingRequestCap = 100;

function availablePublicationDate(web) {
  const value = [web?.publicationDate, web?.publishedDate, web?.published_date, web?.date]
    .find(item => typeof item === "string" && item.trim());
  if (!value) return null;
  const date = value.trim().slice(0, 40);
  if (!/^\d{4}(?:-\d{2})?(?:-\d{2})?$/.test(date) || !Number.isFinite(Date.parse(date))) return null;
  return date;
}

export function utcMonthStart(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export function parseGeminiGrounding(providerBody) {
  const candidate = providerBody?.candidates?.[0];
  const answer = Array.isArray(candidate?.content?.parts)
    ? candidate.content.parts
        .map((part) => (typeof part?.text === "string" ? part.text : ""))
        .join("")
        .trim()
    : "";
  const metadata = candidate?.groundingMetadata || {};
  const searchQueryCount = Array.isArray(metadata.webSearchQueries)
    ? metadata.webSearchQueries.filter((query) => typeof query === "string" && query.trim()).length
    : 0;
  const seen = new Set();
  const sources = [];

  for (const chunk of Array.isArray(metadata.groundingChunks) ? metadata.groundingChunks : []) {
    const web = chunk?.web;
    if (typeof web?.uri !== "string") continue;
    try {
      const url = new URL(web.uri);
      if (url.protocol !== "https:" || url.username || url.password || seen.has(url.href)) continue;
      seen.add(url.href);
      const source = {
        title: String(web.title || url.hostname).trim().slice(0, 180) || url.hostname,
        url: url.href,
      };
      const publicationDate = availablePublicationDate(web);
      if (publicationDate) source.publicationDate = publicationDate;
      const snippet = typeof web.snippet === "string" ? web.snippet : typeof web.description === "string" ? web.description : "";
      if (snippet.trim()) source.snippet = snippet.trim().slice(0, 500);
      sources.push(source);
      if (sources.length >= 12) break;
    } catch {
      // Ignore malformed provider citations; never render them as links.
    }
  }

  return {
    answer,
    searchedWeb: searchQueryCount > 0 || sources.length > 0,
    searchQueryCount,
    sources,
  };
}

export async function reserveGroundingRequest(pool, monthStart, cap = monthlyGroundingRequestCap) {
  const result = await pool.query(
    `INSERT INTO mina_gemini_grounding_usage (usage_month, grounded_requests, search_queries, updated_at)
     VALUES ($1::date, 1, 0, NOW())
     ON CONFLICT (usage_month) DO UPDATE
       SET grounded_requests = mina_gemini_grounding_usage.grounded_requests + 1,
           updated_at = NOW()
       WHERE mina_gemini_grounding_usage.grounded_requests < $2
     RETURNING grounded_requests`,
    [monthStart, cap],
  );
  return result.rowCount > 0;
}

export async function recordGroundingQueries(pool, monthStart, count) {
  const safeCount = Number.isSafeInteger(count) && count > 0 ? count : 0;
  if (!safeCount) return;
  await pool.query(
    `UPDATE mina_gemini_grounding_usage
     SET search_queries = search_queries + $2, updated_at = NOW()
     WHERE usage_month = $1::date`,
    [monthStart, safeCount],
  );
}

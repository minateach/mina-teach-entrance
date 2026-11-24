export const dailyGroundingRequestCap = 100;
export const monthlyGroundingRequestCap = 1_000;

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

export function utcDayStart(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-${String(date.getUTCDate()).padStart(2, "0")}`;
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

export async function reserveGroundingRequest(
  pool,
  monthStart,
  dayStart,
  dailyCap = dailyGroundingRequestCap,
  monthlyCap = monthlyGroundingRequestCap,
) {
  const result = await pool.query(
    `INSERT INTO mina_gemini_grounding_usage (
       usage_month, grounded_requests, search_queries, usage_day, daily_grounded_requests, updated_at
     )
     VALUES ($1::date, 1, 0, $2::date, 1, NOW())
     ON CONFLICT (usage_month) DO UPDATE
       SET grounded_requests = mina_gemini_grounding_usage.grounded_requests + 1,
           daily_grounded_requests = CASE
             WHEN mina_gemini_grounding_usage.usage_day = EXCLUDED.usage_day
               THEN mina_gemini_grounding_usage.daily_grounded_requests + 1
             ELSE 1
           END,
           usage_day = EXCLUDED.usage_day,
           updated_at = NOW()
       WHERE mina_gemini_grounding_usage.grounded_requests < $4
         AND CASE
           WHEN mina_gemini_grounding_usage.usage_day = EXCLUDED.usage_day
             THEN mina_gemini_grounding_usage.daily_grounded_requests
           ELSE 0
         END < $3
     RETURNING grounded_requests, daily_grounded_requests`,
    [monthStart, dayStart, dailyCap, monthlyCap],
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

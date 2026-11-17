export const monthlyImageRequestCap = 20;

export function utcImageUsageMonth(date = new Date()) {
  return `${date.getUTCFullYear()}-${String(date.getUTCMonth() + 1).padStart(2, "0")}-01`;
}

export async function reserveImageAIRequest(pool, provider, monthStart, cap = monthlyImageRequestCap) {
  if (!["gemini_vision", "minimax_image"].includes(provider)) {
    throw new Error("Unsupported image AI provider.");
  }
  const result = await pool.query(
    `INSERT INTO mina_image_ai_usage (usage_month, provider, request_count, successful_images, updated_at)
     VALUES ($1::date, $2, 1, 0, NOW())
     ON CONFLICT (usage_month, provider) DO UPDATE
       SET request_count = mina_image_ai_usage.request_count + 1,
           updated_at = NOW()
       WHERE mina_image_ai_usage.request_count < $3
     RETURNING request_count`,
    [monthStart, provider, cap],
  );
  return result.rowCount > 0;
}

export async function recordSuccessfulImage(pool, provider, monthStart) {
  await pool.query(
    `UPDATE mina_image_ai_usage
     SET successful_images = successful_images + 1, updated_at = NOW()
     WHERE usage_month = $1::date AND provider = $2`,
    [monthStart, provider],
  );
}


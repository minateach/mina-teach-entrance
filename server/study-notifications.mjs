export const MAX_STUDY_NOTICE_EVENTS = 20;
export const MAX_SYSTEM_NOTICES_PER_POLL = 3;
export const STUDY_NOTICE_POLL_MS = 5 * 60_000;
export const STUDY_NOTICE_RATE_LIMIT_MS = 60_000;

export const DEFAULT_STUDY_NOTIFICATIONS = Object.freeze({
  dailyReminderEnabled: false,
  dailyReminderTime: "18:00",
  contentNoticesEnabled: false,
  contentNoticesSince: null,
  contentCursor: null,
});

export function isReminderTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}

export function normalizeStudyNotifications(value) {
  const current = value && typeof value === "object" && !Array.isArray(value) ? value : {};
  const cursor = current.contentCursor && typeof current.contentCursor === "object" &&
    typeof current.contentCursor.at === "string" && Number.isFinite(Date.parse(current.contentCursor.at)) &&
    typeof current.contentCursor.key === "string" && current.contentCursor.key.length <= 240
    ? { at: current.contentCursor.at, key: current.contentCursor.key }
    : null;
  return {
    dailyReminderEnabled: current.dailyReminderEnabled === true,
    dailyReminderTime: isReminderTime(current.dailyReminderTime)
      ? current.dailyReminderTime
      : DEFAULT_STUDY_NOTIFICATIONS.dailyReminderTime,
    contentNoticesEnabled: current.contentNoticesEnabled === true,
    contentNoticesSince: typeof current.contentNoticesSince === "string" &&
      Number.isFinite(Date.parse(current.contentNoticesSince))
      ? current.contentNoticesSince
      : null,
    contentCursor: cursor,
  };
}

export function updateStudyNotifications(currentValue, input, now = new Date()) {
  const current = normalizeStudyNotifications(currentValue);
  if (!input || typeof input !== "object" || Array.isArray(input) ||
      typeof input.dailyReminderEnabled !== "boolean" ||
      !isReminderTime(input.dailyReminderTime) ||
      typeof input.contentNoticesEnabled !== "boolean") {
    throw new TypeError("Choose valid reminder and content-notice settings.");
  }
  const contentEnabledAt = input.contentNoticesEnabled
    ? current.contentNoticesEnabled
      ? current.contentNoticesSince || now.toISOString()
      : now.toISOString()
    : null;
  return {
    dailyReminderEnabled: input.dailyReminderEnabled,
    dailyReminderTime: input.dailyReminderTime,
    contentNoticesEnabled: input.contentNoticesEnabled,
    contentNoticesSince: contentEnabledAt,
    contentCursor: input.contentNoticesEnabled && current.contentNoticesEnabled
      ? current.contentCursor
      : null,
  };
}

export function consumeStudyNoticePoll(polls, userId, now = Date.now()) {
  const previous = polls.get(userId);
  if (previous !== undefined && now - previous < STUDY_NOTICE_RATE_LIMIT_MS) {
    return {
      allowed: false,
      retryAfterSeconds: Math.ceil((STUDY_NOTICE_RATE_LIMIT_MS - (now - previous)) / 1000),
    };
  }
  polls.set(userId, now);
  if (polls.size > 10_000) {
    for (const [id, polledAt] of polls) {
      if (now - polledAt >= STUDY_NOTICE_RATE_LIMIT_MS) polls.delete(id);
    }
  }
  return { allowed: true, retryAfterSeconds: 0 };
}

export const PUBLISHED_STUDY_EVENTS_SQL = `
  WITH events AS (
    SELECT
      'lesson'::text AS event_type,
      id::text AS source_id,
      grade,
      stream,
      subject,
      chapter,
      title,
      reviewed_at AS event_at,
      'lesson:' || id::text || ':' ||
        to_char(reviewed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS event_key
    FROM mina_learning_lessons
    WHERE review_status='published' AND reviewed_at IS NOT NULL AND reviewed_at > $1::timestamptz
    UNION ALL
    SELECT
      'exam'::text AS event_type,
      NULL::text AS source_id,
      grade,
      stream,
      subject,
      ''::text AS chapter,
      'New reviewed practice questions'::text AS title,
      latest_review AS event_at,
      'exam:' || grade::text || ':' || subject || ':' ||
        to_char(latest_review AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS event_key
    FROM (
      SELECT grade, stream, subject, MAX(reviewed_at) AS latest_review
      FROM mina_questions
      WHERE review_status='approved' AND source_kind<>'ai_generated'
        AND reviewed_at IS NOT NULL AND reviewed_at > $1::timestamptz
      GROUP BY grade, stream, subject
    ) approved_banks
  )
  SELECT event_type, source_id, grade, stream, subject, chapter, title, event_key,
    to_char(event_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"') AS cursor_at
  FROM events
  WHERE $2::timestamptz IS NULL
     OR event_at > $2::timestamptz
     OR (event_at = $2::timestamptz AND event_key > $3::text)
  ORDER BY event_at, event_key
  LIMIT ${MAX_STUDY_NOTICE_EVENTS}
`;

export function publicStudyNotice(row) {
  const grade = Number(row.grade);
  const subject = String(row.subject || "").slice(0, 80);
  const stream = ["natural", "social", "common"].includes(row.stream) ? row.stream : "common";
  const eventType = row.event_type === "lesson" ? "lesson" : "exam";
  const params = new URLSearchParams({
    grade: String(grade),
    stream: stream === "common" ? "natural" : stream,
    ...(subject ? { subject } : {}),
  });
  return {
    eventKey: String(row.event_key),
    type: eventType,
    grade,
    subject,
    chapter: String(row.chapter || ""),
    title: String(row.title || "").slice(0, 180),
    publishedAt: String(row.cursor_at),
    url: eventType === "lesson" ? `/learning/?${params}` : `/exams/?${params}`,
  };
}

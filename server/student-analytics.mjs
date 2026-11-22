export async function getExamHistory(pool,userId) {
  if(typeof userId!=="string"||!userId.trim())throw new TypeError("A confirmed account is required.");
  const result=await pool.query(
    "SELECT id,mode,grade,stream,subject,difficulty,score,total,started_at,submitted_at FROM mina_exam_attempts WHERE user_id=$1 ORDER BY started_at DESC LIMIT 100",
    [userId],
  );
  const attempts=result.rows;
  const submittedIds=attempts.filter(row=>row.submitted_at).map(row=>String(row.id));
  if(!submittedIds.length)return {attempts,topicOutcomes:[]};
  const topics=await pool.query(
    `SELECT a.id AS "attemptId",a.grade,q.subject,q.chapter,a.submitted_at AS "submittedAt",
      COUNT(*)::int AS "questionCount",
      COUNT(*) FILTER (WHERE (a.answers ->> q.id::text)::int=q.correct_index)::int AS "correctCount"
    FROM mina_exam_attempts a
    CROSS JOIN LATERAL unnest(a.question_ids) AS selected(question_id)
    JOIN mina_questions q ON q.id=selected.question_id
    WHERE a.user_id=$1 AND a.id=ANY($2::bigint[]) AND a.submitted_at IS NOT NULL
    GROUP BY a.id,a.grade,q.subject,q.chapter,a.submitted_at
    ORDER BY a.submitted_at DESC,q.subject,q.chapter`,
    [userId,submittedIds],
  );
  return {attempts,topicOutcomes:topics.rows};
}

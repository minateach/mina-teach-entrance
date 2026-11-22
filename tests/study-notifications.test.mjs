import test from "node:test";
import assert from "node:assert/strict";
import {
  DEFAULT_STUDY_NOTIFICATIONS,
  MAX_STUDY_NOTICE_EVENTS,
  MAX_SYSTEM_NOTICES_PER_POLL,
  PUBLISHED_STUDY_EVENTS_SQL,
  STUDY_NOTICE_RATE_LIMIT_MS,
  consumeStudyNoticePoll,
  isReminderTime,
  normalizeStudyNotifications,
  publicStudyNotice,
  updateStudyNotifications,
} from "../server/study-notifications.mjs";

test("reminder times use valid local 24-hour values and reject malformed input",()=>{
  for(const time of ["00:00","09:05","18:30","23:59"])assert.equal(isReminderTime(time),true);
  for(const time of ["24:00","12:60","9:05","18:5","noon",null])assert.equal(isReminderTime(time),false);
  assert.throws(()=>updateStudyNotifications({},{
    dailyReminderEnabled:true,dailyReminderTime:"25:00",contentNoticesEnabled:false,
  }),/valid reminder/);
});

test("content notice opt-in starts a fresh publication window and preserves the cursor only while enabled",()=>{
  const now=new Date("2026-11-22T10:15:00.000Z");
  const initial=updateStudyNotifications(DEFAULT_STUDY_NOTIFICATIONS,{
    dailyReminderEnabled:true,dailyReminderTime:"07:30",contentNoticesEnabled:true,
  },now);
  assert.equal(initial.contentNoticesSince,"2026-11-22T10:15:00.000Z");
  assert.equal(initial.contentCursor,null);
  const cursor={at:"2026-11-22T10:16:00.000Z",key:"lesson:12:published"};
  const later=normalizeStudyNotifications({...initial,contentCursor:cursor});
  const updated=updateStudyNotifications(later,{
    dailyReminderEnabled:false,dailyReminderTime:"08:00",contentNoticesEnabled:true,
  },new Date("2026-11-22T11:00:00.000Z"));
  assert.deepEqual(updated.contentCursor,cursor);
  assert.equal(updated.contentNoticesSince,initial.contentNoticesSince);
  const disabled=updateStudyNotifications(updated,{
    dailyReminderEnabled:false,dailyReminderTime:"08:00",contentNoticesEnabled:false,
  },new Date("2026-11-22T11:01:00.000Z"));
  assert.equal(disabled.contentNoticesSince,null);
  assert.equal(disabled.contentCursor,null);
  const reenabled=updateStudyNotifications(disabled,{
    dailyReminderEnabled:false,dailyReminderTime:"08:00",contentNoticesEnabled:true,
  },new Date("2026-11-22T11:02:00.000Z"));
  assert.equal(reenabled.contentNoticesSince,"2026-11-22T11:02:00.000Z");
});

test("published notice query excludes drafts and AI exam questions and bounds each poll",()=>{
  assert.match(PUBLISHED_STUDY_EVENTS_SQL,/review_status='published'/);
  assert.match(PUBLISHED_STUDY_EVENTS_SQL,/review_status='approved'/);
  assert.match(PUBLISHED_STUDY_EVENTS_SQL,/source_kind<>'ai_generated'/);
  assert.match(PUBLISHED_STUDY_EVENTS_SQL,/reviewed_at > \$1::timestamptz/);
  assert.match(PUBLISHED_STUDY_EVENTS_SQL,/LIMIT 20/);
  assert.equal(MAX_STUDY_NOTICE_EVENTS,20);
  assert.equal(MAX_SYSTEM_NOTICES_PER_POLL,3);
});

test("each account is limited to one content poll per minute",()=>{
  const polls=new Map();
  assert.deepEqual(consumeStudyNoticePoll(polls,"user-a",1_000),{allowed:true,retryAfterSeconds:0});
  assert.deepEqual(consumeStudyNoticePoll(polls,"user-a",2_000),{
    allowed:false,retryAfterSeconds:Math.ceil((STUDY_NOTICE_RATE_LIMIT_MS-1_000)/1000),
  });
  assert.deepEqual(consumeStudyNoticePoll(polls,"user-b",2_000),{allowed:true,retryAfterSeconds:0});
  assert.deepEqual(consumeStudyNoticePoll(polls,"user-a",61_000),{allowed:true,retryAfterSeconds:0});
});

test("notice links stay on the app and include the real grade/subject route",()=>{
  const lesson=publicStudyNotice({
    event_type:"lesson",grade:10,stream:"social",subject:"History",chapter:"Unit 1",
    title:"Lesson one",event_key:"lesson:4:2026-11-22T10:00:00.000000Z",
    cursor_at:"2026-11-22T10:00:00.000000Z",
  });
  assert.equal(lesson.url,"/learning/?grade=10&stream=social&subject=History");
  assert.equal(lesson.type,"lesson");
  const exam=publicStudyNotice({
    event_type:"exam",grade:9,stream:"common",subject:"English",title:"New reviewed practice questions",
    event_key:"exam:9:English:2026-11-22T10:00:00.000000Z",
    cursor_at:"2026-11-22T10:00:00.000000Z",
  });
  assert.equal(exam.url,"/exams/?grade=9&stream=natural&subject=English");
  assert.ok(lesson.url.startsWith("/")&&exam.url.startsWith("/"));
});


import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
const source=readFileSync(new URL("../learning/analytics.js",import.meta.url),"utf8");
const {buildStudentAnalytics}=await import(`data:text/javascript;base64,${Buffer.from(source).toString("base64")}`);
import {getExamHistory} from "../server/student-analytics.mjs";

const now=Date.parse("2026-11-22T12:00:00.000Z");
const daysAgo=days=>new Date(now-days*24*60*60*1000).toISOString();

test("period summaries group dated lessons and completed practice by grade and subject",()=>{
  const result=buildStudentAnalytics({
    now,
    completionEvents:[
      {key:"g10-h1",grade:10,subject:"History",completedAt:daysAgo(2)},
      {key:"g10-h1",grade:10,subject:"History",completedAt:daysAgo(2)},
      {key:"g9-m1",grade:9,subject:"Mathematics",completedAt:daysAgo(10)},
      {key:"old",grade:9,subject:"Biology",completedAt:daysAgo(40)},
    ],
    completedLessons:["g10-h1","g9-m1"],
    practiceResults:[{id:"p1",grade:10,subject:"History",score:8,total:10,completedAt:daysAgo(1)}],
    examAttempts:[
      {id:"e1",grade:10,subject:"History",score:6,total:10,submitted_at:daysAgo(3)},
      {id:"pending",grade:10,subject:"History",score:7,total:10,submitted_at:null,started_at:daysAgo(1)},
    ],
  });
  assert.deepEqual(result.periods.weekly,[{
    grade:10,subject:"History",lessonCount:1,attemptCount:2,questionCount:20,correctCount:14,accuracy:0.7,
  }]);
  assert.deepEqual(result.periods.monthly.map(row=>[row.grade,row.subject,row.lessonCount,row.attemptCount]),[
    [9,"Mathematics",1,0],[10,"History",1,2],
  ]);
});

test("completed exam attempts drive recent subject and chapter signals only with evidence",()=>{
  const result=buildStudentAnalytics({
    now,
    practiceResults:[
      {id:"a",grade:10,subject:"Physics",score:9,total:10,completedAt:daysAgo(2)},
      {id:"b",grade:10,subject:"Physics",score:9,total:10,completedAt:daysAgo(2)},
      {id:"c",grade:10,subject:"Physics",score:9,total:10,completedAt:daysAgo(2)},
    ],
    examAttempts:[{id:"1",grade:10,subject:"History",score:1,total:5,submitted_at:daysAgo(1)}],
    topicOutcomes:[
      {attemptId:"1",grade:10,subject:"History",chapter:"Unit 2: State Formation",correctCount:1,questionCount:5,submittedAt:daysAgo(1)},
      {attemptId:"old",grade:10,subject:"History",chapter:"Old unit",correctCount:0,questionCount:5,submittedAt:daysAgo(40)},
    ],
  });
  assert.equal(result.strongSubjects.length,1);
  assert.equal(result.strongSubjects[0].subject,"Physics");
  assert.equal(result.topicsNeedingPractice.length,1);
  assert.equal(result.topicsNeedingPractice[0].chapter,"Unit 2: State Formation");
  assert.equal(result.topicsNeedingPractice[0].accuracy,0.2);
});

test("empty or malformed and undated records do not fabricate analytics or badges",()=>{
  const result=buildStudentAnalytics({
    now,completedLessons:[],
    completionEvents:[{key:"bad",grade:10,subject:"History",completedAt:"not-a-date"}],
    practiceResults:[{id:"bad",score:5,total:5},{id:"bad-score",score:9,total:5,completedAt:daysAgo(1)}],
    examAttempts:[{id:"unfinished",grade:10,subject:"History",score:0,total:10,started_at:daysAgo(1)}],
  });
  assert.deepEqual(result.periods.weekly,[]);
  assert.equal(result.attemptCount,0);
  assert.ok(result.badges.every(badge=>!badge.earned));
});

test("achievement progress uses unique saved lesson keys and recorded study days",()=>{
  const result=buildStudentAnalytics({
    now,
    completedLessons:["one","one","two","three","four","five"],
    completionEvents:[
      {key:"one",grade:9,subject:"English",completedAt:daysAgo(6)},
      {key:"two",grade:9,subject:"English",completedAt:daysAgo(4)},
      {key:"three",grade:9,subject:"English",completedAt:daysAgo(2)},
    ],
    practiceResults:[
      {id:"p1",grade:9,subject:"English",score:1,total:1,completedAt:daysAgo(1)},
      {id:"p2",grade:9,subject:"English",score:1,total:1,completedAt:daysAgo(0)},
    ],
  });
  assert.equal(result.lessonCount,5);
  assert.equal(result.attemptCount,2);
  assert.equal(result.studyDayCount,5);
  assert.equal(result.badges.find(item=>item.id==="five-lessons").earned,true);
  assert.equal(result.badges.find(item=>item.id==="five-study-days").earned,true);
});

test("weak-topic and strong-subject cards do not use records outside their evidence thresholds",()=>{
  const result=buildStudentAnalytics({
    now,
    practiceResults:[
      {id:"a",grade:11,subject:"Chemistry",score:4,total:5,completedAt:daysAgo(2)},
      {id:"b",grade:11,subject:"Chemistry",score:4,total:5,completedAt:daysAgo(2)},
    ],
    topicOutcomes:[
      {grade:11,subject:"Chemistry",chapter:"One question only",correctCount:0,questionCount:1,submittedAt:daysAgo(1)},
      {grade:11,subject:"Chemistry",chapter:"Recent weak chapter",correctCount:1,questionCount:4,submittedAt:daysAgo(1)},
      {grade:11,subject:"Chemistry",chapter:"Old weak chapter",correctCount:0,questionCount:5,submittedAt:daysAgo(45)},
    ],
  });
  assert.equal(result.strongSubjects.length,0,"fewer than three attempts cannot earn a strong-subject label");
  assert.deepEqual(result.topicsNeedingPractice.map(item=>item.chapter),["Recent weak chapter"]);
});

test("exam analytics queries only the confirmed account and only adds topics from submitted attempts",async()=>{
  const calls=[];
  const pool={query:async(sql,params)=>{
    calls.push({sql,params});
    if(calls.length===1)return {rows:[
      {id:"41",grade:10,subject:"History",score:4,total:10,submitted_at:"2026-11-21T10:00:00Z"},
      {id:"42",grade:10,subject:"History",score:0,total:10,submitted_at:null},
    ]};
    return {rows:[{attemptId:"41",grade:10,subject:"History",chapter:"Unit 1",correctCount:4,questionCount:10}]};
  }};
  const history=await getExamHistory(pool,"student_A");
  assert.equal(calls.length,2);
  assert.deepEqual(calls[0].params,["student_A"]);
  assert.match(calls[0].sql,/WHERE user_id=\$1/);
  assert.deepEqual(calls[1].params,["student_A",["41"]]);
  assert.match(calls[1].sql,/a\.user_id=\$1/);
  assert.match(calls[1].sql,/a\.id=ANY\(\$2::bigint\[\]\)/);
  assert.match(calls[1].sql,/a\.submitted_at IS NOT NULL/);
  assert.deepEqual(history.topicOutcomes[0],{attemptId:"41",grade:10,subject:"History",chapter:"Unit 1",correctCount:4,questionCount:10});
  await assert.rejects(getExamHistory(pool,""),/confirmed account/);
});

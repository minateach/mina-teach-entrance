const DAY_MS=24*60*60*1000;
const dateValue=value=>{
  const time=Date.parse(value);
  return Number.isFinite(time)?time:null;
};
const gradeValue=value=>{
  const grade=Number(value);
  return [9,10,11,12].includes(grade)?grade:null;
};

function normalizedAttempts(practiceResults,examAttempts) {
  const attempts=new Map();
  for(const item of practiceResults || []) {
    const completedAt=dateValue(item?.completedAt);
    const score=Number(item?.score),total=Number(item?.total);
    if(!item || typeof item.id!=="string" || completedAt===null ||
      !Number.isInteger(score) || !Number.isInteger(total) || total<1 || score<0 || score>total)continue;
    attempts.set(item.id,{
      id:item.id,grade:gradeValue(item.grade),subject:typeof item.subject==="string"&&item.subject.trim()?item.subject.trim():"Unspecified subject",
      completedAt,score,total,
    });
  }
  for(const item of examAttempts || []) {
    const completedAt=dateValue(item?.submitted_at ?? item?.submittedAt);
    const score=Number(item?.score),total=Number(item?.total);
    if(!item || item.submitted_at==null&&item.submittedAt==null || completedAt===null ||
      !Number.isInteger(score) || !Number.isInteger(total) || total<1 || score<0 || score>total)continue;
    const id=String(item.id ?? "");
    if(!id)continue;
    const serverItem={
      id,grade:gradeValue(item.grade),subject:typeof item.subject==="string"&&item.subject.trim()?item.subject.trim():"Mixed entrance practice",
      completedAt,score,total,
    };
    // Prefer the account exam record if the same attempt is also present in local learning data.
    attempts.set(id,serverItem);
  }
  return [...attempts.values()];
}

function normalizedCompletions(completionEvents) {
  const byKey=new Map();
  for(const item of completionEvents || []) {
    const completedAt=dateValue(item?.completedAt);
    const grade=gradeValue(item?.grade);
    if(!item || typeof item.key!=="string" || !item.key || !item.subject?.trim?.() || completedAt===null)continue;
    const event={key:item.key,grade,subject:item.subject.trim(),completedAt};
    const previous=byKey.get(event.key);
    if(!previous || event.completedAt<previous.completedAt)byKey.set(event.key,event);
  }
  return [...byKey.values()];
}

function groupPeriod(start,now,attempts,completions) {
  const groups=new Map();
  const getGroup=(grade,subject)=>{
    const key=`${grade??"all"}\u0000${subject}`;
    if(!groups.has(key))groups.set(key,{grade,subject,lessonCount:0,attemptCount:0,questionCount:0,correctCount:0});
    return groups.get(key);
  };
  for(const event of completions)if(event.completedAt>=start&&event.completedAt<=now)
    getGroup(event.grade,event.subject).lessonCount++;
  for(const attempt of attempts)if(attempt.completedAt>=start&&attempt.completedAt<=now) {
    const group=getGroup(attempt.grade,attempt.subject);
    group.attemptCount++;
    group.questionCount+=attempt.total;
    group.correctCount+=attempt.score;
  }
  return [...groups.values()]
    .map(group=>({...group,accuracy:group.questionCount?group.correctCount/group.questionCount:null}))
    .sort((a,b)=>(a.grade??99)-(b.grade??99)||a.subject.localeCompare(b.subject));
}

export function buildStudentAnalytics({
  now=Date.now(),completionEvents=[],practiceResults=[],examAttempts=[],topicOutcomes=[],completedLessons=[],completedTopics=[],
}={}) {
  const nowTime=typeof now==="number"?now:dateValue(now);
  const safeNow=Number.isFinite(nowTime)?nowTime:Date.now();
  const attempts=normalizedAttempts(practiceResults,examAttempts);
  const completions=normalizedCompletions(completionEvents);
  const periods={};
  for(const days of [7,30]) {
    const start=safeNow-days*DAY_MS;
    periods[days===7?"weekly":"monthly"]=groupPeriod(start,safeNow,attempts,completions);
  }

  const recentSubjects=new Map();
  for(const attempt of attempts)if(attempt.completedAt>=safeNow-30*DAY_MS&&attempt.completedAt<=safeNow) {
    const key=`${attempt.grade??"all"}\u0000${attempt.subject}`;
    const aggregate=recentSubjects.get(key)||{grade:attempt.grade,subject:attempt.subject,attemptCount:0,questionCount:0,correctCount:0};
    aggregate.attemptCount++;aggregate.questionCount+=attempt.total;aggregate.correctCount+=attempt.score;recentSubjects.set(key,aggregate);
  }
  const strongSubjects=[...recentSubjects.values()]
    .filter(item=>item.attemptCount>=3&&item.correctCount/item.questionCount>=0.8)
    .map(item=>({...item,accuracy:item.correctCount/item.questionCount}))
    .sort((a,b)=>b.accuracy-a.accuracy||b.attemptCount-a.attemptCount);

  const topicGroups=new Map();
  for(const item of topicOutcomes || []) {
    const submittedAt=dateValue(item?.submittedAt ?? item?.submitted_at);
    const grade=gradeValue(item?.grade),subject=typeof item?.subject==="string"?item.subject.trim():"",chapter=typeof item?.chapter==="string"?item.chapter.trim():"";
    const correctCount=Number(item?.correctCount ?? item?.correct_count),questionCount=Number(item?.questionCount ?? item?.question_count);
    if(submittedAt===null||submittedAt<safeNow-30*DAY_MS||submittedAt>safeNow||!subject||!chapter||
      !Number.isInteger(correctCount)||!Number.isInteger(questionCount)||questionCount<1||correctCount<0||correctCount>questionCount)continue;
    const key=`${grade??"all"}\u0000${subject}\u0000${chapter}`;
    const aggregate=topicGroups.get(key)||{grade,subject,chapter,correctCount:0,questionCount:0,attemptIds:new Set()};
    aggregate.correctCount+=correctCount;aggregate.questionCount+=questionCount;
    if(item.attemptId!=null)aggregate.attemptIds.add(String(item.attemptId));
    topicGroups.set(key,aggregate);
  }
  const topicsNeedingPractice=[...topicGroups.values()]
    .filter(item=>item.questionCount>=3&&item.correctCount/item.questionCount<0.6)
    .map(({attemptIds,...item})=>({...item,attemptCount:attemptIds.size,accuracy:item.correctCount/item.questionCount}))
    .sort((a,b)=>a.accuracy-b.accuracy||b.questionCount-a.questionCount);

  const studyDays=new Set();
  for(const event of completions)studyDays.add(new Date(event.completedAt).toISOString().slice(0,10));
  for(const attempt of attempts)studyDays.add(new Date(attempt.completedAt).toISOString().slice(0,10));
  const lessonCount=new Set((completedLessons||[]).filter(key=>typeof key==="string")).size;
  const topicCount=new Set((completedTopics||[]).filter(key=>typeof key==="string")).size;
  const practiceCount=attempts.length;
  const dayCount=studyDays.size;
  const badges=[
    {id:"first-lesson",title:"First lesson",description:"Mark one complete lesson as studied.",value:lessonCount,target:1},
    {id:"five-lessons",title:"Five lessons",description:"Complete five distinct lessons.",value:lessonCount,target:5},
    {id:"topic-explorer",title:"Topic explorer",description:"Mark ten distinct learning topics complete.",value:topicCount,target:10},
    {id:"practice-starter",title:"Practice starter",description:"Finish one saved practice or exam.",value:practiceCount,target:1},
    {id:"five-practice",title:"Practice builder",description:"Finish five saved practice or exam results.",value:practiceCount,target:5},
    {id:"five-study-days",title:"Steady learner",description:"Study on five distinct recorded days.",value:dayCount,target:5},
  ].map(badge=>({...badge,earned:badge.value>=badge.target}));

  return {periods,strongSubjects,topicsNeedingPractice,badges,attemptCount:practiceCount,lessonCount,topicCount,studyDayCount:dayCount};
}

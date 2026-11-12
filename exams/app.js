(() => {
  const $ = id => document.getElementById(id);
  const filters = () => ({ grade: Number($("grade").value), stream: $("stream").value, subject: $("subject").value, topic: $("topic").value.trim(), difficulty: $("difficulty").value });
  let available = 0, attempt = null, position = 0, answers = {}, chosen = null, timerId = null, remaining = 60, editingQuestionId = null, submitting = false, transitioning = false;
  let remainingByQuestion = {}, deadlinesByQuestion = {}, correctByQuestion = {}, practiceFeedback = {};
  const examStorageKey="mina-teach-active-exam-v1";
  async function api(url, options={}) {
    const response = await fetch(url, { credentials:"same-origin", ...options, headers:{"Content-Type":"application/json",...(options.headers||{})} });
    const body = await response.json();
    if (!response.ok) { const error = new Error(body?.error?.message || "Request failed."); error.status=response.status; throw error; }
    return body;
  }
  function query() { const params = new URLSearchParams(Object.entries(filters()).filter(([,v])=>v!==""&&v!=null)); return params.toString(); }
  async function updateCount() {
    $("start-exam").disabled=true; $("bank-status").textContent="Checking reviewed question count…";
    try {
      const entrance=$("mode").value==="entrance",required=entrance?60:Number($("question-count").value);
      const result=await api(`/api/questions?${entrance?"":query()}`); available=result.count;
      $("bank-status").textContent=available>=required ? `${available} reviewed questions available. This session will contain ${required} questions.` : `${required} reviewed questions are required to start. ${available} currently match this selection.`;
      $("start-exam").disabled=available<required;
    } catch(e) { $("bank-status").textContent=e.message; }
  }
  function saveAttemptState(){
    if(!attempt)return;
    try{sessionStorage.setItem(examStorageKey,JSON.stringify({attempt,position,answers,remainingByQuestion,deadlinesByQuestion,correctByQuestion,practiceFeedback}));}catch{}
  }
  function clearSavedAttempt(){try{sessionStorage.removeItem(examStorageKey);}catch{}}
  function restoreAttemptState(){
    try{
      const state=JSON.parse(sessionStorage.getItem(examStorageKey)||"null");
      if(!state?.attempt?.attemptId||!Array.isArray(state.attempt.questions)||!state.attempt.questions.length)return false;
      attempt=state.attempt;attempt.mode=attempt.mode||"entrance";position=Math.max(0,Math.min(Number(state.position)||0,attempt.questions.length-1));
      answers=state.answers&&typeof state.answers==="object"?state.answers:{};
      remainingByQuestion=state.remainingByQuestion&&typeof state.remainingByQuestion==="object"?state.remainingByQuestion:{};
      deadlinesByQuestion=state.deadlinesByQuestion&&typeof state.deadlinesByQuestion==="object"?state.deadlinesByQuestion:{};
      correctByQuestion=state.correctByQuestion&&typeof state.correctByQuestion==="object"?state.correctByQuestion:{};
      practiceFeedback=state.practiceFeedback&&typeof state.practiceFeedback==="object"?state.practiceFeedback:{};
      return true;
    }catch{try{sessionStorage.removeItem(examStorageKey);}catch{}return false;}
  }
  function questionId(){return String(attempt.questions[position].id);}
  function remainingFor(id){
    if(Number.isFinite(deadlinesByQuestion[id]))return Math.max(0,Math.ceil((deadlinesByQuestion[id]-Date.now())/1000));
    return Number.isInteger(remainingByQuestion[id])?Math.max(0,remainingByQuestion[id]):Number(attempt?.timerSeconds)||60;
  }
  function pauseTimer(){
    clearInterval(timerId);timerId=null;
    if(!attempt)return;
    const id=questionId();remaining=remainingFor(id);remainingByQuestion[id]=remaining;delete deadlinesByQuestion[id];saveAttemptState();
  }
  function clockText(seconds){const minutes=Math.floor(seconds/60),rest=seconds%60;return `${String(minutes).padStart(2,"0")}:${String(rest).padStart(2,"0")}`;}
  function startTimer(){
    clearInterval(timerId);timerId=null;
    if(attempt.mode==="practice"){$("timer-meta").hidden=true;$("exam-time-meta").hidden=true;return;}
    $("timer-meta").hidden=false;$("exam-time-meta").hidden=false;
    if(!Number.isFinite(attempt.overallDeadlineAt)){
      const started=Date.parse(attempt.startedAt),duration=attempt.total*(Number(attempt.timerSeconds)||60)*1000;
      attempt.overallDeadlineAt=Number.isFinite(started)?started+duration:Date.now()+duration;
    }
    const id=questionId();
    if(!Number.isFinite(deadlinesByQuestion[id])){
      remaining=Number.isInteger(remainingByQuestion[id])?remainingByQuestion[id]:60;
      deadlinesByQuestion[id]=Date.now()+remaining*1000;saveAttemptState();
    }
    let lastDisplayed=-1;
    const tick=()=>{
      if(!attempt||questionId()!==id)return;
      const overall=Math.max(0,Math.ceil((attempt.overallDeadlineAt-Date.now())/1000));
      $("exam-timer").textContent=clockText(overall);
      if(overall<=0){
        clearInterval(timerId);timerId=null;answers[id]=chosen;saveAttemptState();
        $("choices").querySelectorAll("button").forEach(button=>button.disabled=true);submitExam();return;
      }
      remaining=remainingFor(id);$("timer").textContent=remaining;
      if(remaining<=0){
        clearInterval(timerId);timerId=null;remainingByQuestion[id]=0;delete deadlinesByQuestion[id];
        $("choices").querySelectorAll("button").forEach(button=>button.disabled=true);
        answers[id]=chosen;saveAttemptState();advanceQuestion(true);return;
      }
      if(remaining!==lastDisplayed){lastDisplayed=remaining;saveAttemptState();}
    };
    tick();if(attempt&&questionId()===id&&Number.isFinite(deadlinesByQuestion[id])&&remaining>0)timerId=setInterval(tick,250);
  }
  function renderQuestionNav(){
    const root=$("question-nav");root.replaceChildren();
    attempt.questions.forEach((q,index)=>{
      const id=String(q.id),button=document.createElement("button");
      button.type="button";button.textContent=String(index+1);
      button.className=`question-number${index===position?" current":""}${Number.isInteger(answers[id])?" answered":""}${correctByQuestion[id]===false?" incorrect":""}`;
      button.setAttribute("aria-label",`Question ${index+1}, ${Number.isInteger(answers[id])?"answered":"unanswered"}${index===position?", current":""}`);
      button.setAttribute("aria-current",String(index===position));
      button.onclick=()=>goToQuestion(index);root.append(button);
    });
  }
  function renderQuestion() {
    const q=attempt.questions[position]; chosen=Number.isInteger(answers[q.id])?answers[q.id]:null;
    $("progress").textContent=`Question ${position+1} of ${attempt.total}`;
    $("question").textContent=q.prompt;
    $("question-source").textContent=`Grade ${q.grade} · ${q.subject} · ${q.chapter} · Source: ${q.sourceLabel} · ${q.sourceKind.replaceAll("_"," ")}`;
    $("choices").replaceChildren();
    const feedback=$("answer-feedback");feedback.hidden=true;feedback.textContent="";
    if(attempt.mode==="practice"&&practiceFeedback[String(q.id)])showPracticeFeedback(practiceFeedback[String(q.id)]);
    q.choices.forEach((value,index)=>{const button=document.createElement("button");button.className="choice";button.textContent=`${String.fromCharCode(65+index)}. ${value}`;button.setAttribute("aria-pressed",String(chosen===index));button.onclick=()=>{if(submitting||transitioning)return;if(attempt.mode==="practice"){submitPracticeAnswer(q,index);return;}if(remainingFor(String(q.id))<=0)return;chosen=index;answers[String(q.id)]=chosen;document.querySelectorAll(".choice").forEach(el=>el.setAttribute("aria-pressed","false"));button.setAttribute("aria-pressed","true");renderQuestionNav();saveAttemptState();};$("choices").append(button);});
    $("bookmark").onclick=async()=>{try{await api(`/api/questions/${q.id}/bookmark`,{method:"PUT"});$("bookmark").textContent="★ Saved";}catch(e){$("bookmark").textContent=e.status===401?"Sign in to save":"Could not save";}};
    $("previous").disabled=position===0;
    $("next").hidden=position===attempt.total-1;
    $("submit-exam").hidden=position!==attempt.total-1;
    $("retry-wrong").hidden=attempt.mode!=="practice"||!Object.values(correctByQuestion).includes(false);
    renderQuestionNav();
    startTimer();
  }
  function showPracticeFeedback(result){
    const feedback=$("answer-feedback"),letter=String.fromCharCode(65+result.correctIndex);
    feedback.hidden=false;feedback.textContent=`${result.isCorrect?"Correct.":"Incorrect."} Correct answer: ${letter}. ${result.correctAnswer} Explanation: ${result.explanation}`;
  }
  async function submitPracticeAnswer(question,index){
    const feedback=$("answer-feedback");feedback.hidden=false;feedback.textContent="Checking and saving your answer…";
    $("choices").querySelectorAll("button").forEach(button=>button.disabled=true);
    try{
      const result=await api(`/api/exams/${attempt.attemptId}/answer`,{method:"POST",body:JSON.stringify({questionId:question.id,choice:index})});
      chosen=index;answers[String(question.id)]=index;correctByQuestion[String(question.id)]=result.isCorrect;practiceFeedback[String(question.id)]=result;
      $("choices").querySelectorAll(".choice").forEach((button,i)=>{button.disabled=false;button.setAttribute("aria-pressed",String(i===index));});
      showPracticeFeedback(result);renderQuestionNav();$("retry-wrong").hidden=!Object.values(correctByQuestion).includes(false);saveAttemptState();loadHistory();
    }catch(error){feedback.textContent=error.message;$("choices").querySelectorAll("button").forEach(button=>button.disabled=false);}
  }
  async function advanceQuestion(expired=false) {
    if(!attempt||submitting||transitioning)return;
    transitioning=true;
    const id=questionId();answers[id]=chosen;
    if(expired){clearInterval(timerId);timerId=null;remainingByQuestion[id]=0;delete deadlinesByQuestion[id];saveAttemptState();}
    else pauseTimer();
    if(position===attempt.total-1){transitioning=false;await submitExam();return;}
    position++;chosen=null;renderQuestion();transitioning=false;saveAttemptState();
  }
  const nextQuestion=()=>advanceQuestion(false);
  function previousQuestion(){if(!attempt||position===0||submitting||transitioning)return;answers[questionId()]=chosen;pauseTimer();position--;chosen=null;renderQuestion();saveAttemptState();}
  function goToQuestion(index){if(!attempt||index===position||index<0||index>=attempt.total||submitting||transitioning)return;answers[questionId()]=chosen;pauseTimer();position=index;chosen=null;renderQuestion();saveAttemptState();}
  async function submitExam() {
    if(!attempt||submitting)return;
    submitting=true;clearInterval(timerId);timerId=null;answers[questionId()]=chosen;
    const currentId=questionId();remaining=remainingFor(currentId);remainingByQuestion[currentId]=remaining;delete deadlinesByQuestion[currentId];saveAttemptState();
    $("submit-exam").disabled=true;$("exam").hidden=true;$("results").hidden=false;$("results").innerHTML="<h2>Saving your result…</h2>";
    try{
      const result=await api(`/api/exams/${attempt.attemptId}/submit`,{method:"POST",body:JSON.stringify({answers})});
      const box=$("results");box.replaceChildren();
      const title=document.createElement("h2");title.textContent=`Result: ${result.score} / ${result.total} (${result.percentage}%)`;box.append(title);
      const unanswered=result.review.filter(q=>q.selectedIndex===null).length,wrong=result.total-result.score-unanswered;
      const summary=document.createElement("p");summary.textContent=`Questions: ${result.total} · Correct: ${result.score} · Incorrect: ${wrong} · Unanswered: ${unanswered} · Total marks: ${result.total} · ${result.percentage}% · ${result.percentage>=50?"Pass":"Fail"} (50% pass mark)`;box.append(summary);
      const weakSubjects=[...new Set(result.review.filter(q=>!q.isCorrect).map(q=>q.subject))];
      if(weakSubjects.length){const weak=document.createElement("p");weak.textContent=`Subjects to practice more: ${weakSubjects.join(", ")}`;box.append(weak);}
      clearSavedAttempt();attempt=null;
      const again=document.createElement("button");again.textContent="Try again";again.onclick=()=>{submitting=false;remainingByQuestion={};deadlinesByQuestion={};answers={};position=0;$("submit-exam").disabled=false;$("results").hidden=true;$("setup").hidden=false;updateCount();};box.append(again);
      result.review.forEach((q,i)=>{const section=document.createElement("article");section.className="review";const h=document.createElement("h3");h.textContent=`${i+1}. Grade ${q.grade} · ${q.subject}: ${q.prompt}`;const p=document.createElement("p");p.className=q.isCorrect?"correct":"incorrect";p.textContent=`${q.isCorrect?"Correct":"Review"} · Correct answer: ${String.fromCharCode(65+q.correctIndex)}. ${q.choices[q.correctIndex]}`;const exp=document.createElement("p");exp.textContent=q.explanation;section.append(h,p,exp);box.append(section);});
      await loadHistory();
    }catch(e){$("results").replaceChildren();const message=document.createElement("p");message.textContent=`Could not save the result: ${e.message}`;const retry=document.createElement("button");retry.textContent="Retry submission";retry.onclick=submitExam;$("results").append(message,retry);$("results").hidden=false;$("exam").hidden=false;$("choices").querySelectorAll("button").forEach(button=>button.disabled=true);submitting=false;$("submit-exam").disabled=false;}
  }
  async function loadHistory(){
    const root=$("history-list");root.replaceChildren();
    try{const result=await api("/api/exams/history");if(!result.attempts.length){root.textContent="No completed exams yet.";return;}result.attempts.forEach(item=>{const row=document.createElement("div");row.className="attempt";row.textContent=`${item.mode==="entrance"?"Entrance mock":`Grade ${item.grade} ${item.subject||"practice"}`} · ${item.score}/${item.total} · ${item.submitted_at?"Completed":"In progress"}`;root.append(row);});}
    catch{root.textContent="Sign in to save and view exam history.";}
  }
  async function loadEducator(){
    try{const account=await api("/api/account/data");if(!["teacher","question_reviewer","educator","admin"].includes(account.role))return;
      $("educator").hidden=false;
      $("educator").querySelector(".eyebrow").textContent=["admin","question_reviewer"].includes(account.role)?"AUTHORIZED QUESTION REVIEWER":"AUTHORIZED EDUCATOR";
      $("educator").querySelector(".muted").textContent=["admin","question_reviewer"].includes(account.role)?"You can review sourced questions. Only approved curriculum questions appear in student exams.":"New questions start as drafts. A question reviewer must review them before they appear in student exams.";
      const manage=await api("/api/questions/manage");
      $("draft-list").replaceChildren();
      manage.questions.forEach(q=>{
        const row=document.createElement("p");row.textContent=`${q.subject}: ${q.prompt} — ${q.source_label} (${q.review_status}) `;
        const edit=document.createElement("button");edit.textContent="Edit";edit.onclick=()=>{
          editingQuestionId=String(q.id);const f=$("question-form");
          for(const [name,value] of Object.entries({grade:q.grade,stream:q.stream,subject:q.subject,chapter:q.chapter,difficulty:q.difficulty,sourceKind:q.source_kind,prompt:q.prompt,correctIndex:q.correct_index,sourceLabel:q.source_label,sourceUrl:q.source_url,explanation:q.explanation})) if(f.elements[name])f.elements[name].value=value??"";
          (q.choices||[]).forEach((value,i)=>f.elements[`choice${i}`].value=value);
          f.querySelector("button[type=submit]").textContent="Save changes as draft";
        };row.append(edit);
        if(["admin","question_reviewer"].includes(account.role)){
          for(const status of ["approved","rejected"]){
            if(status===q.review_status)continue;
            const review=document.createElement("button");review.textContent=status==="approved"?"Approve":"Reject";
            review.onclick=async()=>{try{await api(`/api/questions/${q.id}/review`,{method:"POST",body:JSON.stringify({status})});loadEducator();updateCount();}catch(e){$("educator-status").textContent=e.message;}};
            row.append(review);
          }
        }
        $("draft-list").append(row);
      });
    }catch{}
  }
  $("question-form").addEventListener("submit",async event=>{
    event.preventDefault();const f=new FormData(event.currentTarget);const payload=Object.fromEntries(f.entries());
    payload.grade=Number(payload.grade);payload.correctIndex=Number(payload.correctIndex);payload.choices=[0,1,2,3].map(i=>payload[`choice${i}`]);delete payload.choice0;delete payload.choice1;delete payload.choice2;delete payload.choice3;
    try{const result=await api(editingQuestionId?`/api/questions/${editingQuestionId}`:"/api/questions",{method:editingQuestionId?"PUT":"POST",body:JSON.stringify(payload)});$("educator-status").textContent=`${editingQuestionId?"Updated":"Saved"} as a draft; an administrator must review it.`;editingQuestionId=null;event.currentTarget.reset();event.currentTarget.querySelector("button[type=submit]").textContent="Save as draft";loadEducator();}
    catch(e){$("educator-status").textContent=e.status===401?"Sign in required.":e.status===403?"Educator access has not been assigned to this account.":e.message;}
  });
  $("question-import").addEventListener("submit",async event=>{
    event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file)return;
    if(file.size>1_400_000){$("import-status").textContent="Choose a JSON file smaller than 1.4 MB.";return;}
    try{
      const payload=JSON.parse(await file.text());
      const result=await api("/api/questions/import",{method:"POST",body:JSON.stringify(payload)});
      $("import-status").textContent=`Imported ${result.imported} questions as drafts; administrator review is still required.`;
      event.currentTarget.reset();await loadEducator();
    }catch(e){$("import-status").textContent=e.message==="Unexpected end of JSON input"?"The selected file is not valid JSON.":e.status===403?"Educator access has not been assigned to this account.":e.message;}
  });
  const initialFilters=new URLSearchParams(location.search);
  for(const id of ["grade","stream","subject","topic"]){const value=initialFilters.get(id);if(value&&$(id)&&[...$(id).options||[]].some(option=>option.value===value)||id==="topic"&&value)$(id).value=value;}
  function configureMode(){
    const entrance=$("mode").value==="entrance";
    $("subject-filters").hidden=entrance;$("question-count-wrap").hidden=entrance;
    $("start-exam").textContent=entrance?"Start entrance mock":"Start practice";
    $("count-guidance").textContent=entrance?"Entrance mock exams mix 60 approved questions from Grades 9–12 and relevant subjects.":"Practice sessions give answer feedback and support retrying incorrect questions.";
    updateCount();
  }
  ["grade","stream","subject","difficulty","question-count"].forEach(id=>$(id).addEventListener("change",updateCount));
  $("mode").addEventListener("change",configureMode);
  $("topic").addEventListener("input",()=>{clearTimeout(window.topicFilterTimer);window.topicFilterTimer=setTimeout(updateCount,250);});
  $("start-exam").onclick=async()=>{
    try{
      const mode=$("mode").value,count=mode==="entrance"?60:Number($("question-count").value);
      const fresh=await api("/api/exams",{method:"POST",body:JSON.stringify({...filters(),mode,questionCount:count})});
      if(fresh.total!==count)throw new Error(`This session requires exactly ${count} questions.`);
      attempt=fresh;answers={};position=0;remainingByQuestion={};deadlinesByQuestion={};correctByQuestion={};practiceFeedback={};submitting=false;transitioning=false;
      clearSavedAttempt();$("submit-exam").disabled=false;$("setup").hidden=true;$("exam").hidden=false;renderQuestion();saveAttemptState();
    }
    catch(e){$("bank-status").textContent=e.status===401?"Sign in before starting an exam.":e.message;}
  };
  $("next").onclick=nextQuestion;
  $("previous").onclick=previousQuestion;
  $("submit-exam").onclick=submitExam;
  $("retry-wrong").onclick=()=>{const index=attempt?.questions.findIndex(q=>correctByQuestion[String(q.id)]===false)??-1;if(index>=0)goToQuestion(index);};
  if(restoreAttemptState()){$("mode").value=attempt.mode;$("setup").hidden=true;$("exam").hidden=false;renderQuestion();}
  configureMode();
  async function initializeAccount(){try{const status=await api("/api/account/status");if(!status.signedIn){$("history-list").textContent="Sign in to save exam results."; $("saved-questions").textContent="Sign in to view saved questions."; return;}await Promise.all([loadHistory(),loadBookmarks(),loadEducator()]);}catch{}}
  initializeAccount();
  async function loadBookmarks(){try{const result=await api("/api/questions/bookmarks");const root=$("saved-questions");root.replaceChildren();result.questions.forEach(q=>{const item=document.createElement("p");item.textContent=`${q.subject}: ${q.prompt}`;root.append(item);});if(!result.questions.length)root.textContent="No saved questions yet.";}catch{}}
})();

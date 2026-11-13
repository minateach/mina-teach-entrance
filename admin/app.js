(() => {
  const $ = id => document.getElementById(id);
  let editingId = null, editingLessonId = null, questions = [];
  let nextLessonOffset=null;
  async function api(url, options={}) {
    const response = await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...(options.headers||{})}});
    const data=await response.json();
    if(!response.ok){const error=new Error(data?.error?.message||"Request failed.");error.status=response.status;throw error;}
    return data;
  }
  function accessMessage(message,showSignIn=false){
    $("gate-message").textContent=message;
    $("gate").querySelector("h1").textContent=showSignIn?"Sign in to continue":"Admin access required";
    $("gate").querySelector(".button").hidden=!showSignIn;
  }
  function renderQuestions(){
    const list=$("question-list"), filter=$("status-filter").value;list.replaceChildren();
    const rows=questions.filter(q=>filter==="all"||q.review_status===filter);
    if(!rows.length){$("list-status").textContent=filter==="all"?"No questions have been added yet.":"No questions with this status.";return;}
    $("list-status").textContent=`Showing ${rows.length} question${rows.length===1?"":"s"}.`;
    rows.forEach(q=>{
      const card=document.createElement("article");card.className="question-card";
      const meta=document.createElement("div");
      for(const text of [`Grade ${q.grade}`,q.stream==="natural"?"Natural Science":q.stream==="social"?"Social Science":"Common",q.subject,q.chapter,q.review_status]){
        const tag=document.createElement("span");tag.className=`tag ${q.review_status}`;tag.textContent=text;meta.append(tag);
      }
      const title=document.createElement("h3");title.textContent=q.prompt;
      const source=document.createElement("p");source.textContent=`Source: ${q.source_label} · ${String(q.source_kind||"teacher_authored").replaceAll("_"," ")}`;
      const actions=document.createElement("div");actions.className="question-actions";
      const edit=document.createElement("button");edit.className="secondary";edit.textContent="Edit";edit.onclick=()=>editQuestion(q);actions.append(edit);
      for(const status of ["approved","rejected"]){if(q.review_status===status)continue;const button=document.createElement("button");button.textContent=status==="approved"?"Approve":"Reject";if(status==="rejected")button.className="reject";button.onclick=()=>reviewQuestion(q.id,status);actions.append(button);}
      card.append(meta,title,source,actions);list.append(card);
    });
  }
  async function loadLessons(append=false){
    const root=$("lesson-admin-list");if(!append)root.replaceChildren();
    try{
      const result=await api(`/api/learning/lessons/manage?offset=${append?nextLessonOffset:0}`);
      nextLessonOffset=result.nextOffset;$("load-more-lessons").hidden=nextLessonOffset===null;
      if(!result.lessons.length){$("lesson-admin-status").textContent="No lesson drafts or published lessons yet.";return;}
      $("lesson-admin-status").textContent=`${result.lessons.length} lessons loaded.`;
      result.lessons.forEach(lesson=>{
        const card=document.createElement("article");card.className="question-card";
        const title=document.createElement("h3");title.textContent=`Grade ${lesson.grade} · ${lesson.subject} · ${lesson.title}`;
        const detail=document.createElement("p");detail.textContent=`${lesson.chapter} · ${lesson.language} · ${lesson.reviewStatus} · Source: ${lesson.sourceLabel}`;
        const actions=document.createElement("div");actions.className="question-actions";
        const edit=document.createElement("button");edit.className="secondary";edit.textContent="Edit";edit.onclick=()=>editLesson(lesson);actions.append(edit);
        if(["admin","question_reviewer"].includes(window.minaRole)){
          for(const status of ["published","rejected"]){if(status===lesson.reviewStatus)continue;const button=document.createElement("button");button.textContent=status==="published"?"Publish":"Reject";if(status==="rejected")button.className="reject";button.onclick=async()=>{try{await api(`/api/learning/lessons/${lesson.id}/review`,{method:"POST",body:JSON.stringify({status})});await loadLessons();}catch(e){$("lesson-admin-status").textContent=e.message;}};actions.append(button);}
        }
        card.append(title,detail,actions);root.append(card);
      });
    }catch(e){$("lesson-admin-status").textContent=e.message;}
  }
  async function editLesson(summary){
    try {
      const {lesson}=await api(`/api/learning/lessons/manage/${summary.id}`);
      editingLessonId=lesson.id;const f=$("lesson-form");
      for(const [key,value] of Object.entries({grade:lesson.grade,stream:lesson.stream,subject:lesson.subject,chapter:lesson.chapter,title:lesson.title,language:lesson.language,content:lesson.content,examples:(lesson.examples||[]).join("\n"),keyPoints:(lesson.keyPoints||[]).join("\n"),materialsJson:JSON.stringify(lesson.materials || [],null,2),sourceLabel:lesson.sourceLabel,sourceUrl:lesson.sourceUrl||""}))if(f.elements[key])f.elements[key].value=value;
      f.querySelector("button[type=submit]").textContent="Save lesson draft";$("cancel-lesson-edit").hidden=false;f.scrollIntoView({behavior:"smooth",block:"start"});
    }catch(error){$("lesson-admin-status").textContent=error.message;}
  }
  function resetLessonForm(){editingLessonId=null;$("lesson-form").reset();$("lesson-form").querySelector("button[type=submit]").textContent="Save lesson draft";$("cancel-lesson-edit").hidden=true;}
  function editQuestion(q){
    editingId=String(q.id);const form=$("question-form");
    for(const [key,value] of Object.entries({grade:q.grade,stream:q.stream,subject:q.subject,chapter:q.chapter,difficulty:q.difficulty,sourceKind:q.source_kind,prompt:q.prompt,correctIndex:q.correct_index,choice0:q.choices?.[0],choice1:q.choices?.[1],choice2:q.choices?.[2],choice3:q.choices?.[3],sourceLabel:q.source_label,sourceUrl:q.source_url,explanation:q.explanation}))if(form.elements[key])form.elements[key].value=value??"";
    $("form-title").textContent="Edit question (saves as draft)";
    form.querySelector("button[type=submit]").textContent="Save changes";
    $("cancel-edit").hidden=false;form.scrollIntoView({behavior:"smooth",block:"start"});
  }
  function resetForm(){
    editingId=null;$("question-form").reset();$("form-title").textContent="Add a question draft";
    $("question-form").querySelector("button[type=submit]").textContent="Save as draft";$("cancel-edit").hidden=true;
  }
  async function reviewQuestion(id,status){
    try{await api(`/api/questions/${id}/review`,{method:"POST",body:JSON.stringify({status})});$("list-status").textContent=`Question ${status}.`;await loadData();}
    catch(e){$("list-status").textContent=e.message;}
  }
  async function loadData(){
    try{
      const [summary,bank]=await Promise.all([api("/api/admin/status"),api("/api/questions/manage")]);
      for(const [id,key] of [["total-count","total"],["draft-count","drafts"],["approved-count","approved"],["eligible-count","exam_eligible"]])$(id).textContent=summary[key];
      questions=bank.questions;renderQuestions();
    }catch(e){accessMessage(e.status===403?"Your signed-in account does not have the administrator role.":e.message,e.status===401);}
  }
  async function loadRoles(){
    if($("roles-panel").hidden)return;
    try{
      const result=await api("/api/admin/users"),root=$("role-list");root.replaceChildren();
      result.users.forEach(user=>{
        const row=document.createElement("div");row.className="role-row";
        const id=document.createElement("code");id.className="role-id";id.textContent=user.user_id;
        const select=document.createElement("select");select.className="role-select";
        for(const role of ["student","teacher","question_reviewer","educator","admin"]){const option=document.createElement("option");option.value=role;option.textContent=role.replaceAll("_"," ");option.selected=role===user.role;select.append(option);}
        const save=document.createElement("button");save.textContent="Save role";
        save.onclick=async()=>{try{await api(`/api/admin/users/${encodeURIComponent(user.user_id)}/role`,{method:"PUT",body:JSON.stringify({role:select.value})});$("roles-status").textContent="Role updated.";await loadRoles();}catch(e){$("roles-status").textContent=e.message;}};
        row.append(id,select,save);root.append(row);
      });
      if(!result.users.length)root.textContent="No signed-in accounts yet.";
    }catch(e){$("roles-status").textContent=e.message;}
  }
  $("question-form").addEventListener("submit",async event=>{
    event.preventDefault();const f=new FormData(event.currentTarget),payload=Object.fromEntries(f.entries());
    payload.grade=Number(payload.grade);payload.correctIndex=Number(payload.correctIndex);
    payload.choices=[0,1,2,3].map(i=>payload[`choice${i}`]);for(let i=0;i<4;i++)delete payload[`choice${i}`];
    try{
      await api(editingId?`/api/questions/${editingId}`:"/api/questions",{method:editingId?"PUT":"POST",body:JSON.stringify(payload)});
      $("form-status").textContent=editingId?"Updated; it returned to draft for review.":"Saved as a draft.";
      resetForm();await loadData();
    }catch(e){$("form-status").textContent=e.status===401?"Please sign in.":e.status===403?"Administrator access is required.":e.message;}
  });
  $("cancel-edit").addEventListener("click",resetForm);
  $("cancel-lesson-edit").addEventListener("click",resetLessonForm);
  $("lesson-form").addEventListener("submit",async event=>{
    event.preventDefault();const f=new FormData(event.currentTarget),payload=Object.fromEntries(f.entries());
    payload.grade=Number(payload.grade);payload.examples=payload.examples.split("\n").map(x=>x.trim()).filter(Boolean);payload.keyPoints=payload.keyPoints.split("\n").map(x=>x.trim()).filter(Boolean);
    try{payload.materials=JSON.parse(payload.materialsJson || "[]");delete payload.materialsJson;await api(editingLessonId?`/api/learning/lessons/${editingLessonId}`:"/api/learning/lessons",{method:editingLessonId?"PUT":"POST",body:JSON.stringify(payload)});$("lesson-form-status").textContent="Saved as a draft; reviewer approval is required before students can see it.";resetLessonForm();await loadLessons();}
    catch(e){$("lesson-form-status").textContent=e.message;}
  });
  $("load-more-lessons").onclick=()=>loadLessons(true);
  $("material-form").addEventListener("submit",async event=>{
    event.preventDefault();
    const form=event.currentTarget;
    if(!editingLessonId){$("material-form-status").textContent="Edit an existing lesson first.";return;}
    try {
      const material=JSON.parse(form.elements.material.value);
      await api(`/api/learning/lessons/${editingLessonId}/materials`,{method:"POST",body:JSON.stringify(material)});
      $("material-form-status").textContent="Full section appended as draft. Existing sections were preserved.";
      form.reset();await editLesson({id:editingLessonId});await loadLessons();
    }catch(error){$("material-form-status").textContent=error.message;}
  });
  $("status-filter").addEventListener("change",renderQuestions);
  $("import-form").addEventListener("submit",async event=>{
    event.preventDefault();const file=event.currentTarget.elements.file.files[0];if(!file)return;
    if(file.size>1_400_000){$("import-status").textContent="Choose a JSON file smaller than 1.4 MB.";return;}
    try{const payload=JSON.parse(await file.text());const result=await api("/api/questions/import",{method:"POST",body:JSON.stringify(payload)});$("import-status").textContent=`Imported ${result.imported} draft questions.`;event.currentTarget.reset();await loadData();}
    catch(e){$("import-status").textContent=e.message;}
  });
  (async()=>{
    try{
      const status=await api("/api/account/status");
      if(!status.signedIn){accessMessage("Sign in with the project owner account to open question review.",true);return;}
      if(!["admin","question_reviewer"].includes(status.role)){accessMessage("This signed-in account does not have the administrator or question-reviewer role.");return;}
      const account=await api("/api/account/data");
      if(!["admin","question_reviewer"].includes(account.role)){accessMessage("This signed-in account does not have question-review access.");return;}
      $("gate").hidden=true;$("dashboard").hidden=false;
      $("dashboard").querySelector(".role-badge").textContent=account.role==="admin"?"Administrator":"Question Reviewer";
      if(account.role==="admin")$("roles-panel").hidden=false;
      window.minaRole=account.role;await loadData();if(account.role==="admin")await loadRoles();await loadLessons();
    }catch(e){accessMessage(e.message,e.status===401);}
  })();
})();

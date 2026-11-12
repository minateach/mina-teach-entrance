(() => {
  const $ = id => document.getElementById(id);
  let editingId = null, questions = [];
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
      if(status.role!=="admin"){accessMessage("This signed-in account does not have the administrator role.");return;}
      const account=await api("/api/account/data");
      if(account.role!=="admin"){accessMessage(account.role==="student"?"This account is signed in but does not have the administrator role.":"Question review access is not enabled for this account.");return;}
      $("gate").hidden=true;$("dashboard").hidden=false;await loadData();
    }catch(e){accessMessage(e.message,e.status===401);}
  })();
})();

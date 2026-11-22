import {api} from "./learning-state.js";

const element=(tag,text)=>{const node=document.createElement(tag);if(text!==undefined)node.textContent=text;return node;};
export function textParts(text,size=12000) {
  if(!Number.isInteger(size) || size<2)throw new Error("Text sections require at least two characters.");
  const parts=[];
  for(let start=0;start<text.length;) {
    let end=Math.min(start+size,text.length);
    const last=text.charCodeAt(end-1);
    if(end<text.length && last>=0xD800 && last<=0xDBFF)end--;
    parts.push(text.slice(start,end));start=end;
  }
  return parts.length?parts:[""];
}
export function appendFullText(parent,text) {
  const parts=textParts(String(text));
  const body=element("div",parts[0]);body.className="lesson-prose";parent.append(body);
  if(parts.length===1)return;
  const nav=element("nav");nav.className="material-pagination";nav.setAttribute("aria-label","Text section navigation");
  const previous=element("button","Previous section"),next=element("button","Next section"),status=element("span");
  previous.type=next.type="button";previous.dataset.partAction="previous";next.dataset.partAction="next";
  let index=0;
  function show(){body.textContent=parts[index];status.textContent=`Section ${index+1} of ${parts.length} · all ${String(text).length.toLocaleString()} characters available`;previous.disabled=index===0;next.disabled=index===parts.length-1;}
  previous.onclick=()=>{index--;show();};next.onclick=()=>{index++;show();};nav.append(previous,status,next);parent.append(nav);show();
}
export function appendValue(parent,value) {
  if(Array.isArray(value)) {
    const list=element("ul");
    for(const entry of value){const item=element("li");appendValue(item,entry);list.append(item);}
    parent.append(list);
  } else if(value!==null && typeof value==="object") {
    const list=element("dl");
    for(const [key,entry] of Object.entries(value)){list.append(element("dt",key));const description=element("dd");appendValue(description,entry);list.append(description);}
    parent.append(list);
  } else appendFullText(parent,value===null?"":String(value));
}
function resource(parent,url,text) {
  const link=element("a",text);
  try {
    const parsed=new URL(url,location.origin);
    if(!["http:","https:"].includes(parsed.protocol))throw new Error();
    link.href=parsed.href;link.target="_blank";link.rel="noopener noreferrer";parent.append(link);
  }catch{parent.append(element("p","The recorded resource address is invalid."));}
}
export async function renderMaterial(parent,material) {
  parent.replaceChildren(element("h3",material.title));
  const used=new Set(["id","topicId","topicTitle","title","type","sourceLabel","sourceUrl","sourcePages","sourceAuthor","sourcePublisher","sourcePublicationDate","sourceEdition","sourceFile","sourceTitle","offlineImageDataUrl"]);
  let imageReady=null;
  if(material.type==="table") {
    const wrap=element("div");wrap.className="material-table";const table=element("table");
    if(material.caption){table.append(element("caption",material.caption));used.add("caption");}
    const head=element("thead"),row=element("tr");
    for(const label of material.headers){const th=element("th",label);th.scope="col";row.append(th);}
    head.append(row);table.append(head);const body=element("tbody");
    for(const cells of material.rows){const tr=element("tr");for(const cell of cells){const td=element("td");appendFullText(td,cell);tr.append(td);}body.append(tr);}
    table.append(body);wrap.append(table);parent.append(wrap);used.add("headers");used.add("rows");
  }
  if(material.type==="diagram") {
    const figure=element("figure"),image=element("img");image.alt=material.alt;image.className="material-diagram";image.referrerPolicy="no-referrer";
    imageReady=new Promise((resolve,reject)=>{
      const timer=setTimeout(()=>reject(new Error("The diagram did not load in time. Its source link remains available; retry this material.")),15000);
      image.onload=()=>{clearTimeout(timer);resolve();};
      image.onerror=()=>{clearTimeout(timer);reject(new Error("The diagram could not load. Its source link remains available; retry before marking this material accessed."));};
    });
    figure.append(image);if(material.caption){figure.append(element("figcaption",material.caption));used.add("caption");}
    parent.append(figure);resource(parent,material.url,"Open diagram source");image.src=material.offlineImageDataUrl || material.url;used.add("url");used.add("alt");
  }
  if(material.type==="resource"){resource(parent,material.url,material.title);used.add("url");}
  if(material.type==="mcq") {
    appendFullText(parent,material.question);
    const list=element("ol");list.type="A";
    for(const choice of material.choices){const li=element("li");appendFullText(li,choice);list.append(li);}
    parent.append(list);
    const answer=element("details");answer.append(element("summary","Correct answer and explanation"));
    appendFullText(answer,`${String.fromCharCode(65+material.correctIndex)}. ${material.choices[material.correctIndex]}`);
    appendFullText(answer,material.explanation);parent.append(answer);
    ["question","choices","correctIndex","explanation"].forEach(key=>used.add(key));
  }
  if(["objective","summary"].includes(material.type)) {
    appendValue(parent,material.text ?? material.items);
    used.add("text");used.add("items");
  }
  // Render every remaining stored content field, not a selected subset.
  for(const [key,value] of Object.entries(material))if(!used.has(key)) {
    parent.append(element("h4",key.replace(/([a-z])([A-Z])/g,"$1 $2")));
    appendValue(parent,value);
  }
  if(material.sourceLabel || material.sourceUrl || material.sourcePages || material.sourceAuthor || material.sourcePublisher || material.sourcePublicationDate || material.sourceEdition || material.sourceFile || material.sourceTitle) {
    const citation=[
      material.sourceTitle,
      material.sourceLabel || "See lesson reference",
      material.sourceAuthor?`Author: ${material.sourceAuthor}`:null,
      material.sourcePublisher?`Publisher: ${material.sourcePublisher}`:null,
      material.sourceEdition?`Edition: ${material.sourceEdition}`:null,
      material.sourcePublicationDate?`Published: ${material.sourcePublicationDate}`:null,
      material.sourcePages?`Pages: ${material.sourcePages}`:null,
      material.sourceFile?`File: ${material.sourceFile}`:null,
    ].filter(Boolean).join(" · ");
    const source=element("p",`Source: ${citation}. `);
    if(material.sourceUrl)resource(source,material.sourceUrl,"Open material reference");parent.append(source);
  }
  if(imageReady)await imageReady;
}
export function mountMaterialReader(parent,lesson,onAccess=()=>{}) {
  const outline=lesson.materialOutline || [];
  if(!outline.length)return null;
  const root=element("section");root.id="topic-materials";root.className="history-lesson-section material-reader";
  root.append(element("h3","All additional topic materials"));
  const select=element("select");select.setAttribute("aria-label","Material section");
  outline.forEach((item,index)=>{const option=element("option",`${index+1}. ${item.topicTitle || "Topic "+item.topicId} — ${item.title}`);option.value=String(index);select.append(option);});
  const previous=element("button","Previous material"),next=element("button","Next material"),retry=element("button","Retry material"),status=element("p"),body=element("div");
  previous.type=next.type=retry.type="button";previous.dataset.materialAction="previous";next.dataset.materialAction="next";retry.hidden=true;
  status.setAttribute("role","status");body.className="material-content";
  const nav=element("nav");nav.className="material-pagination";nav.append(previous,next,retry);
  root.append(select,status,nav,body);parent.append(root);
  let position=0,loading=false;const cache=new Map(),accessed=new Set();
  function controls(){previous.disabled=loading || position===0;next.disabled=loading || position===outline.length-1;select.disabled=loading;}
  async function show(index) {
    if(loading || index<0 || index>=outline.length)return;
    loading=true;retry.hidden=true;status.textContent=`Loading material ${index+1} of ${outline.length}…`;controls();
    try {
      let material=cache.get(index);
      if(!material) {
        const page=await api(`/api/learning/content/${encodeURIComponent(lesson.id)}/materials?offset=${index}&limit=1`);
        if(page.total!==outline.length || page.materials.length!==1 || page.materials[0].id!==outline[index].id)throw new Error("The material outline changed. Refresh the lesson to retrieve its current complete outline.");
        material=page.materials[0];cache.set(index,material);
      }
      await renderMaterial(body,material);position=index;select.value=String(index);
      accessed.add(material.id);onAccess(material.id);
      status.textContent=`Material ${index+1} of ${outline.length} · ${accessed.size} accessed. No sections omitted.`;
      const url=new URL(location.href);url.searchParams.set("material",material.id);history.replaceState({},"",url);
    }catch(error){status.textContent=error.message;retry.hidden=false;retry.onclick=()=>show(index);}
    finally{loading=false;controls();}
  }
  previous.onclick=()=>show(position-1);next.onclick=()=>show(position+1);select.onchange=()=>show(Number(select.value));
  const requested=new URLSearchParams(location.search).get("material");
  const initial=outline.findIndex(item=>item.id===requested);
  show(initial<0?0:initial);
  return {open:index=>show(index),root};
}

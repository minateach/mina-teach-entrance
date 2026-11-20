import {cachedApiResponse,getOfflineOwner,listOfflineExamResults,setOfflineOwner} from "./offline-store.js";

export const STORAGE_KEY = "minaTeach.learning.v1";
export async function api(url, options={}) {
  const method=String(options.method || "GET").toUpperCase();
  let response;
  try {
    response=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...options.headers}});
  } catch(error) {
    if(method==="GET") {
      try {
        const target=new URL(url,location.origin);
        const cached=await cachedApiResponse(target.pathname+target.search);
        if(cached!==null)return cached;
      } catch {}
    }
    throw error;
  }
  let data;
  try { data=await response.json(); } catch { throw new Error("The server returned an unreadable response. Please retry."); }
  if (!response.ok) {
    if(method==="GET" && response.status>=500) {
      try {
        const target=new URL(url,location.origin);
        const cached=await cachedApiResponse(target.pathname+target.search);
        if(cached!==null)return cached;
      } catch {}
    }
    const error=new Error(data?.error?.message || "The request failed. Please retry."); error.status=response.status; throw error;
  }
  return data;
}
const list = value => Array.isArray(value)?value:[];
export function normalizeState(value={}) {
  if(!value || typeof value!=="object" || Array.isArray(value))value={};
  // Unfinished quizzes belong only to this browser, never to account sync/import.
  const {_lessonPracticeDrafts,...shared}=value;
  value=shared;
  return {...value,settings:{grade:"9",stream:"natural",language:"en",...value.settings},
    completed:[...new Set(list(value.completed).filter(item=>typeof item==="string"))],
    completedTopics:[...new Set(list(value.completedTopics).filter(item=>typeof item==="string"))],
    saved:list(value.saved).filter(item=>item && typeof item.key==="string"),
    bookmarks:list(value.bookmarks).filter(item=>item && typeof item.key==="string"),
    tasks:list(value.tasks).filter(item=>item && typeof item.text==="string"),
    practice:list(value.practice).filter(item=>item && typeof item.id==="string"),
    removedSaved:list(value.removedSaved),removedBookmarks:list(value.removedBookmarks),removedTasks:list(value.removedTasks)};
}
export function mergeLearning(remote,local) {
  const a=normalizeState(remote),b=normalizeState(local);
  const merge=(first,second,key)=>[...new Map([...first,...second].map(item=>[item[key],item])).values()];
  const removedSaved=[...new Set([...a.removedSaved,...b.removedSaved])];
  const removedBookmarks=[...new Set([...a.removedBookmarks,...b.removedBookmarks])];
  const removedTasks=[...new Set([...a.removedTasks,...b.removedTasks])];
  const tasks=[...new Map([...a.tasks,...b.tasks].map(item=>[item.id || `legacy:${item.text}`,item])).values()]
    .filter(item=>!removedTasks.includes(item.id || `legacy:${item.text}`));
  return normalizeState({...a,...b,settings:{...a.settings,...b.settings},
    completed:[...new Set([...a.completed,...b.completed])],
    completedTopics:[...new Set([...a.completedTopics,...b.completedTopics])],
    saved:merge(a.saved,b.saved,"key").filter(item=>!removedSaved.includes(item.key)),
    bookmarks:merge(a.bookmarks,b.bookmarks,"key").filter(item=>!removedBookmarks.includes(item.key)),
    tasks,
    practice:merge(a.practice,b.practice,"id").sort((x,y)=>String(y.completedAt).localeCompare(String(x.completedAt))).slice(0,50),
    removedSaved,removedBookmarks,removedTasks});
}
export function topicIsComplete(state, key) {
  const split = key.lastIndexOf(":topic:");
  return list(state.completedTopics).includes(key) ||
    split >= 0 && list(state.completed).includes(key.slice(0,split));
}
export function practiceContentVersion(lesson) {
  return JSON.stringify([lesson.id,lesson.grade,lesson.subject,lesson.language,
    lesson.questions.map(q=>[q.prompt,q.choices,q.answer,q.explanation])]);
}
export function validPracticeDraft(draft,lesson) {
  if(!draft || draft.version!==1 || typeof draft.id!=="string" || !draft.id ||
    draft.contentVersion!==practiceContentVersion(lesson) ||
    !Number.isInteger(draft.index) || draft.index<0 || draft.index>=lesson.questions.length ||
    !Array.isArray(draft.answers) || draft.answers.length!==lesson.questions.length)return false;
  return draft.answers.every((answer,index)=>index<draft.index
    ? Number.isInteger(answer) && answer>=0 && answer<lesson.questions[index].choices.length
    : index===draft.index
      ? answer===null || Number.isInteger(answer) && answer>=0 && answer<lesson.questions[index].choices.length
      : answer===null);
}
export function createStore(statusChanged=()=>{}) {
  let key=STORAGE_KEY, state=normalizeState(), signedIn=false, readyForSync=false,identity=null;
  let identityConfirmed=false;
  let revision=0,queue=Promise.resolve(),offlineLocal=false;
  function read(storageKey) {
    try { return normalizeState(JSON.parse(localStorage.getItem(storageKey)||"{}")); }
    catch { statusChanged("Stored learning data could not be read. Existing browser data has not been deleted."); return normalizeState(); }
  }
  function localSave() {
    try {
      const drafts=JSON.parse(localStorage.getItem(key)||"{}")._lessonPracticeDrafts;
      localStorage.setItem(key,JSON.stringify({...state,...(drafts?{_lessonPracticeDrafts:drafts}:{})})); return true;
    }
    catch { statusChanged("Browser storage is unavailable or full. Changes may be lost on reload. Download your data from Account or free storage."); return false; }
  }
  function sync() {
    if (!signedIn || !readyForSync) return queue;
    const snapshot=JSON.stringify(state),version=revision,expectedUserId=identity;
    queue=queue.catch(()=>{}).then(async()=>{
      try {
        await api("/api/account/data/learning",{method:"PUT",body:JSON.stringify({data:JSON.parse(snapshot),expectedUserId})});
        if(version===revision) { state._pendingSync=false; localSave(); statusChanged("Learning changes saved to your account."); }
      } catch(error) { statusChanged(`${error.message} Changes remain on this device; use Retry sync.`); }
    });
    return queue;
  }
  async function attachOfflineResults(owner) {
    const results=await listOfflineExamResults(owner).catch(()=>[]);
    if(!results.length)return false;
    const known=new Set(state.practice.map(item=>item.id));
    let added=false;
    for(const result of results) {
      if(known.has(result.id))continue;
      state.practice.push({
        id:result.id,grade:result.grade,subject:result.subject || "Offline practice",
        lesson:result.mode==="entrance"?"Downloaded entrance practice":"Downloaded reviewed practice",
        score:result.score,total:result.total,completedAt:result.completedAt,kind:"offline_reviewed_exam",
      });
      known.add(result.id);added=true;
    }
    return added;
  }
  return {
    get state(){return state;},get signedIn(){return signedIn;},
    async confirmPracticeIdentity() {
      if(offlineLocal)return;
      const status=await api("/api/account/status");
      if(!identityConfirmed || !!status.signedIn!==!!signedIn || (signedIn && status.userId!==identity))
        throw new Error("Your account changed or could not be confirmed. Reload before continuing lesson practice.");
    },
    readPracticeDraft(lessonId) {
      if(!identityConfirmed)throw new Error("Reload to confirm your account before opening saved practice.");
      try { return JSON.parse(localStorage.getItem(key)||"{}")._lessonPracticeDrafts?.[lessonId] || null; }
      catch { throw new Error("Saved lesson practice could not be read. Browser storage may be unavailable."); }
    },
    writePracticeDraft(lessonId,draft,result=null) {
      if(!identityConfirmed)throw new Error("Reload to confirm your account before saving practice.");
      try {
        const cached=JSON.parse(localStorage.getItem(key)||"{}");
        const drafts={...cached._lessonPracticeDrafts};
        if(draft)drafts[lessonId]=draft;else delete drafts[lessonId];
        if(result)state.practice=[...new Map([...state.practice,...list(cached.practice),result].map(item=>[item.id,item])).values()]
          .sort((a,b)=>String(b.completedAt).localeCompare(String(a.completedAt))).slice(0,50);
        // Completion and draft removal share one storage write. The attempt ID
        // survives restoration, so re-entering completion cannot add another score.
        localStorage.setItem(key,JSON.stringify({...state,_lessonPracticeDrafts:drafts}));
      } catch {
        throw new Error("Lesson practice could not be saved. Browser storage is unavailable or full; keep this page open and retry.");
      }
      if(result)this.save();
    },
    async initialize() {
      key=STORAGE_KEY;signedIn=false;readyForSync=false;identity=null;identityConfirmed=false;offlineLocal=false;
      state=read(STORAGE_KEY);
      try {
        const status=await api("/api/account/status");
        signedIn=status.signedIn;
        if(!signedIn) {
          setOfflineOwner("guest");identityConfirmed=true;state=read(STORAGE_KEY);
          if(await attachOfflineResults("guest"))localSave();
          statusChanged("Learning is saved on this device. Sign in to use your private account data."); return;
        }
        if(!status.userId) throw new Error("Your account identity could not be confirmed. Please reload.");
        identity=status.userId;
        setOfflineOwner(`account:${identity}`);
        identityConfirmed=true;
        key=`${STORAGE_KEY}:account:${status.userId}`;
        const cached=read(key); state=cached;
        const data=await api("/api/account/data");
        // Guest data is only imported through the existing explicit Account import flow.
        state=cached._pendingSync?mergeLearning(data.records?.learning,cached):normalizeState(data.records?.learning);
        const offlineResults=await listOfflineExamResults(`account:${identity}`).catch(()=>[]);
        await attachOfflineResults(`account:${identity}`);
        readyForSync=true; localSave();
        let offlineResultsPending=false;
        if(offlineResults.length) {
          try {
            await api("/api/account/data/learning/offline-results",{
              method:"POST",
              body:JSON.stringify({expectedUserId:identity,results:offlineResults}),
            });
          } catch {offlineResultsPending=true;}
        }
        statusChanged(offlineResultsPending
          ? "Your private account learning data is loaded. Device-only exam results remain saved here and will retry account sync."
          : "Your private account learning data is loaded.");
        if(state._pendingSync) await sync();
      } catch(error) {
        readyForSync=false;offlineLocal=true;
        const owner=getOfflineOwner();
        if(owner.startsWith("account:")) {
          identity=owner.slice("account:".length);signedIn=true;key=`${STORAGE_KEY}:account:${identity}`;state=read(key);
          identityConfirmed=true;
          statusChanged("Offline mode: saved account progress is available on this device. Changes will sync only after your account is confirmed online.");
        } else {
          signedIn=false;key=STORAGE_KEY;state=read(STORAGE_KEY);identityConfirmed=true;
          statusChanged("Offline mode: guest learning progress and downloaded lessons are available on this device. Account data and sync require internet.");
        }
      }
    },
    save() {
      revision++; state._pendingSync=!!signedIn;
      const stored=localSave();
      if(!signedIn && stored) statusChanged("Learning changes saved on this device.");
      sync(); return stored;
    },
    toggle(collection,item) {
      const index=state[collection].findIndex(entry=>entry.key===item.key);
      const tombstones=collection==="saved"?"removedSaved":"removedBookmarks";
      if(index>=0) { state[collection].splice(index,1); state[tombstones]=[...new Set([...state[tombstones],item.key])]; }
      else { state[collection].unshift(item); state[tombstones]=state[tombstones].filter(key=>key!==item.key); }
      this.save(); return index<0;
    },
    async retry() { await this.initialize(); },
  };
}

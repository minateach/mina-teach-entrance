export const STORAGE_KEY = "minaTeach.learning.v1";
export async function api(url, options={}) {
  const response=await fetch(url,{credentials:"same-origin",...options,headers:{"Content-Type":"application/json",...options.headers}});
  let data;
  try { data=await response.json(); } catch { throw new Error("The server returned an unreadable response. Please retry."); }
  if (!response.ok) { const error=new Error(data?.error?.message || "The request failed. Please retry."); error.status=response.status; throw error; }
  return data;
}
const list = value => Array.isArray(value)?value:[];
export function normalizeState(value={}) {
  if(!value || typeof value!=="object" || Array.isArray(value))value={};
  return {...value,settings:{grade:"9",stream:"natural",language:"en",...value.settings},
    completed:[...new Set(list(value.completed).filter(item=>typeof item==="string"))],
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
    saved:merge(a.saved,b.saved,"key").filter(item=>!removedSaved.includes(item.key)),
    bookmarks:merge(a.bookmarks,b.bookmarks,"key").filter(item=>!removedBookmarks.includes(item.key)),
    tasks,
    practice:merge(a.practice,b.practice,"id").sort((x,y)=>String(y.completedAt).localeCompare(String(x.completedAt))).slice(0,50),
    removedSaved,removedBookmarks,removedTasks});
}
export function createStore(statusChanged=()=>{}) {
  let key=STORAGE_KEY, state=normalizeState(), signedIn=false, readyForSync=false,identity=null;
  let revision=0,queue=Promise.resolve();
  function read(storageKey) {
    try { return normalizeState(JSON.parse(localStorage.getItem(storageKey)||"{}")); }
    catch { statusChanged("Stored learning data could not be read. Existing browser data has not been deleted."); return normalizeState(); }
  }
  function localSave() {
    try { localStorage.setItem(key,JSON.stringify(state)); return true; }
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
  return {
    get state(){return state;},get signedIn(){return signedIn;},
    async initialize() {
      key=STORAGE_KEY;signedIn=false;readyForSync=false;identity=null;
      state=read(STORAGE_KEY);
      try {
        const status=await api("/api/account/status");
        signedIn=status.signedIn;
        if(!signedIn) { state=read(STORAGE_KEY); statusChanged("Learning is saved on this device. Sign in to use your private account data."); return; }
        if(!status.userId) throw new Error("Your account identity could not be confirmed. Please reload.");
        identity=status.userId;
        key=`${STORAGE_KEY}:account:${status.userId}`;
        const cached=read(key); state=cached;
        const data=await api("/api/account/data");
        // Guest data is only imported through the existing explicit Account import flow.
        state=cached._pendingSync?mergeLearning(data.records?.learning,cached):normalizeState(data.records?.learning);
        readyForSync=true; localSave();
        statusChanged("Your private account learning data is loaded.");
        if(cached._pendingSync) await sync();
      } catch(error) { readyForSync=false; statusChanged(`${error.message} Account sync is unavailable; no account data has been overwritten.`); }
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
    async retry() { if(!readyForSync) await this.initialize(); else await sync(); },
  };
}

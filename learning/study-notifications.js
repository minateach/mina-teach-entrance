const LOCAL_PREFERENCES_KEY="minaTeach.studyNotifications.v1";
const LOCAL_FEED_KEY="minaTeach.studyNoticeFeed.v1";
const DAILY_REMINDER_INTERVAL_MS=15_000;
const CONTENT_NOTICE_POLL_MS=5*60_000;
const MAX_LOCAL_NOTICES=20;
const MAX_SYSTEM_NOTICES_PER_POLL=3;

const DEFAULTS={
  dailyReminderEnabled:false,
  dailyReminderTime:"18:00",
  contentNoticesEnabled:false,
  contentNoticesSince:null,
  contentCursor:null,
};

function safeSettings(value) {
  const candidate=value&&typeof value==="object"&&!Array.isArray(value)?value:{};
  return {
    dailyReminderEnabled:candidate.dailyReminderEnabled===true,
    dailyReminderTime:/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(candidate.dailyReminderTime||"")
      ? candidate.dailyReminderTime : DEFAULTS.dailyReminderTime,
    contentNoticesEnabled:candidate.contentNoticesEnabled===true,
    contentNoticesSince:typeof candidate.contentNoticesSince==="string"?candidate.contentNoticesSince:null,
    contentCursor:candidate.contentCursor&&typeof candidate.contentCursor==="object"?candidate.contentCursor:null,
  };
}

function localDay(date) {
  return `${date.getFullYear()}-${String(date.getMonth()+1).padStart(2,"0")}-${String(date.getDate()).padStart(2,"0")}`;
}

export function dailyReminderDue(time, now=new Date(), lastSentDay=null) {
  if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(time||""))return false;
  const [hour,minute]=time.split(":").map(Number);
  const scheduled=new Date(now);
  scheduled.setHours(hour,minute,0,0);
  return localDay(now)!==lastSentDay && now>=scheduled && now<scheduled.getTime()+5*60_000;
}

function safeNoticeUrl(value) {
  try {
    const url=new URL(value,location.origin);
    return url.origin===location.origin && ["/learning/","/exams/"].includes(url.pathname)
      ? url.pathname+url.search : "/learning/";
  } catch {return "/learning/";}
}

function localKey(base,owner) {
  return `${base}:${encodeURIComponent(owner||"guest")}`;
}

function readJson(key,fallback) {
  try {
    const value=JSON.parse(localStorage.getItem(key)||"null");
    return value??fallback;
  } catch {return fallback;}
}

function iosBrowserNeedsInstallHint() {
  const ios=/iPhone|iPad|iPod/.test(navigator.userAgent)||
    navigator.platform==="MacIntel"&&navigator.maxTouchPoints>1;
  const standalone=typeof matchMedia==="function"&&matchMedia("(display-mode: standalone)").matches;
  return ios&&!standalone;
}

async function sendSystemNotification(title,options) {
  if(!window.isSecureContext||!("Notification" in window)||Notification.permission!=="granted")return false;
  try {
    const registration=await navigator.serviceWorker?.getRegistration();
    if(registration?.showNotification) {
      await registration.showNotification(title,options);
      return true;
    }
    new Notification(title,options);
    return true;
  } catch {return false;}
}

export function initStudyNotifications({api,signedIn,owner="guest"}) {
  const $=id=>document.getElementById(id);
  const dailyEnabled=$("daily-reminder-enabled");
  const dailyTime=$("daily-reminder-time");
  const contentEnabled=$("content-notices-enabled");
  const permissionButton=$("notification-permission");
  const status=$("notifications-status");
  const reminderStatus=$("daily-reminder-status");
  const feed=$("content-notice-list");
  if(!dailyEnabled||!dailyTime||!contentEnabled||!permissionButton||!status||!reminderStatus||!feed)
    return {destroy(){}};

  const preferenceKey=localKey(LOCAL_PREFERENCES_KEY,owner);
  const feedKey=localKey(LOCAL_FEED_KEY,owner);
  let preferences=safeSettings(readJson(preferenceKey,DEFAULTS));
  let noticeFeed=Array.isArray(readJson(feedKey,[]))?readJson(feedKey,[]):[];
  let destroyed=false,contentPollInFlight=false;
  let dailyTimer=null,contentTimer=null;

  function saveLocal() {
    try{localStorage.setItem(preferenceKey,JSON.stringify(preferences));}
    catch {status.textContent="Browser storage is unavailable. Your account settings will still be saved if signed in.";}
  }

  function renderFeed() {
    feed.replaceChildren();
    if(!noticeFeed.length) {
      feed.append(Object.assign(document.createElement("li"),{textContent:
        preferences.contentNoticesEnabled
          ? "No new published lessons or reviewed practice have arrived since you enabled notices."
          : "Turn on new-content notices to see newly published lessons and reviewed practice here."}));
      return;
    }
    for(const item of noticeFeed) {
      const row=document.createElement("li");
      const anchor=document.createElement("a");
      anchor.href=safeNoticeUrl(item.url);
      anchor.textContent=`${item.title} · Grade ${item.grade}${item.subject?` · ${item.subject}`:""}`;
      const date=Number.isFinite(Date.parse(item.publishedAt))
        ? new Date(item.publishedAt).toLocaleString() : "recently";
      row.append(anchor,document.createTextNode(` · ${date}`));
      feed.append(row);
    }
  }

  function renderControls() {
    dailyEnabled.checked=preferences.dailyReminderEnabled;
    dailyTime.value=preferences.dailyReminderTime;
    dailyTime.disabled=!preferences.dailyReminderEnabled;
    contentEnabled.checked=preferences.contentNoticesEnabled;
    contentEnabled.disabled=!signedIn;
    const supported=window.isSecureContext&&"Notification" in window;
    if(!supported) {
      permissionButton.disabled=true;
      permissionButton.textContent="Browser alerts unavailable";
    } else if(Notification.permission==="granted") {
      permissionButton.disabled=true;
      permissionButton.textContent="Browser alerts enabled";
    } else if(Notification.permission==="denied") {
      permissionButton.disabled=true;
      permissionButton.textContent="Change browser permission";
    } else {
      permissionButton.disabled=false;
      permissionButton.textContent="Enable browser notifications";
    }
    renderFeed();
  }

  function platformNotice() {
    if(!window.isSecureContext)return "Browser alerts require a secure HTTPS connection.";
    if(!("Notification" in window))return "This browser does not support system notifications. Daily reminders and new-content notices appear inside Mina Teach AI while it is open.";
    if(iosBrowserNeedsInstallHint())return "On iPhone or iPad, browser notifications may require adding Mina Teach AI to the Home Screen.";
    return "";
  }

  function updateStatus(message) {
    const limitation=platformNotice();
    status.textContent=limitation?`${message} ${limitation}`:message;
  }

  async function persistPreferences() {
    saveLocal();
    if(!signedIn) {
      updateStatus("Daily reminder preferences are saved on this device. Sign in to enable account-saved new-content notices.");
      return;
    }
    try {
      const result=await api("/api/study-notifications/preferences",{
        method:"PUT",
        body:JSON.stringify({
          dailyReminderEnabled:preferences.dailyReminderEnabled,
          dailyReminderTime:preferences.dailyReminderTime,
          contentNoticesEnabled:preferences.contentNoticesEnabled,
        }),
      });
      preferences=safeSettings(result.notifications);
      saveLocal();
      updateStatus("Notification preferences saved to your account.");
      renderControls();
      if(preferences.contentNoticesEnabled)void pollContentNotices();
    } catch(error) {
      updateStatus(`Preferences remain on this device but could not be saved to your account: ${error.message}`);
    }
  }

  async function loadPreferences() {
    if(signedIn&&navigator.onLine&&!window.MinaOfflineMode?.enabled?.()) {
      try {
        const result=await api("/api/study-notifications/preferences");
        preferences=safeSettings(result.notifications);
        saveLocal();
        updateStatus("Notification preferences loaded from your account.");
      } catch(error) {
        updateStatus(`Account preferences could not be loaded. This device’s saved reminder settings are shown: ${error.message}`);
      }
    } else if(signedIn) {
      updateStatus("Offline: account notification preferences cannot be refreshed. Saved device reminders remain available.");
    } else {
      updateStatus("Daily reminder settings are saved on this device. Sign in to enable account-wide new-content notices.");
    }
    renderControls();
  }

  function showReminder() {
    const today=localDay(new Date());
    const key=localKey("minaTeach.studyReminder.lastDay",owner);
    if(readJson(key,null)===today)return;
    try{localStorage.setItem(key,JSON.stringify(today));}
    catch {reminderStatus.textContent="Reminder time. Browser storage is unavailable, so duplicate prevention may not persist after reload.";}
    reminderStatus.textContent=`Study reminder · ${preferences.dailyReminderTime}. Open your planner and choose one task to study.`;
    void sendSystemNotification("MINA TEACH AI study reminder",{
      body:"Your study time is here. Open Mina Teach AI and choose one task from your planner.",
      tag:`mina-study-reminder-${today}`,
      renotify:false,
      data:{url:"/learning/"},
    });
  }

  function checkDailyReminder() {
    if(!preferences.dailyReminderEnabled)return;
    if(dailyReminderDue(preferences.dailyReminderTime,new Date(),readJson(localKey("minaTeach.studyReminder.lastDay",owner),null)))
      showReminder();
  }

  function showEvents(events) {
    const existing=new Set(noticeFeed.map(item=>item.eventKey));
    const fresh=events.filter(item=>item&&typeof item.eventKey==="string"&&!existing.has(item.eventKey));
    if(!fresh.length)return;
    noticeFeed=[...fresh,...noticeFeed].slice(0,MAX_LOCAL_NOTICES);
    try{localStorage.setItem(feedKey,JSON.stringify(noticeFeed));}catch{}
    renderFeed();
    updateStatus(`${fresh.length} new published learning update${fresh.length===1?"":"s"} available.`);
    fresh.slice(0,MAX_SYSTEM_NOTICES_PER_POLL).forEach(item=>{
      void sendSystemNotification(item.title,{
        body:`Grade ${item.grade}${item.subject?` · ${item.subject}`:""}${item.chapter?` · ${item.chapter}`:""}`,
        tag:`mina-content-${item.eventKey}`,
        renotify:false,
        data:{url:safeNoticeUrl(item.url)},
      });
    });
  }

  async function pollContentNotices() {
    if(destroyed||contentPollInFlight||!signedIn||!preferences.contentNoticesEnabled||
       !navigator.onLine||window.MinaOfflineMode?.enabled?.())return;
    contentPollInFlight=true;
    try {
      const result=await api("/api/study-notifications/events");
      if(Array.isArray(result.events)&&result.events.length)showEvents(result.events);
      else updateStatus("No new published lessons or reviewed practice.");
    } catch(error) {
      updateStatus(`New-content notices could not be checked: ${error.message}`);
    } finally {contentPollInFlight=false;}
  }

  dailyEnabled.addEventListener("change",()=>{
    preferences.dailyReminderEnabled=dailyEnabled.checked;
    dailyTime.disabled=!dailyEnabled.checked;
    reminderStatus.textContent=dailyEnabled.checked
      ? `Daily reminder set for ${preferences.dailyReminderTime}. It will run while this page is open.`
      : "Daily study reminder is off.";
    void persistPreferences();
  });
  dailyTime.addEventListener("change",()=>{
    if(!/^(?:[01]\d|2[0-3]):[0-5]\d$/.test(dailyTime.value)) {
      reminderStatus.textContent="Choose a valid local time.";
      return;
    }
    preferences.dailyReminderTime=dailyTime.value;
    reminderStatus.textContent=`Daily reminder time changed to ${dailyTime.value}.`;
    void persistPreferences();
  });
  contentEnabled.addEventListener("change",()=>{
    if(!signedIn) {
      contentEnabled.checked=false;
      updateStatus("Sign in to save account-wide new-content notice preferences.");
      return;
    }
    preferences.contentNoticesEnabled=contentEnabled.checked;
    void persistPreferences();
  });
  permissionButton.addEventListener("click",async()=>{
    if(!window.isSecureContext||!("Notification" in window)) {
      updateStatus("This browser cannot show system notifications. In-app notices remain available.");
      return;
    }
    if(Notification.permission==="denied") {
      updateStatus("Browser notifications are blocked. Change this site’s permission in browser settings; no new prompt was requested.");
      renderControls();
      return;
    }
    if(Notification.permission==="granted") {
      updateStatus("Browser notifications are already enabled.");
      renderControls();
      return;
    }
    try {
      const permission=await Notification.requestPermission();
      updateStatus(permission==="granted"
        ? "Browser notifications enabled. Preferences still control which notices are sent."
        : permission==="denied"
          ? "Browser permission was denied. In-app notices remain available; change permission in browser settings to enable system alerts."
          : "Browser permission was not granted. In-app notices remain available.");
    } catch {updateStatus("The browser could not request notification permission. In-app notices remain available.");}
    renderControls();
  });

  window.addEventListener("online",()=>void pollContentNotices());
  window.addEventListener("mina:offline-mode-change",event=>{
    if(!event.detail?.enabled)void pollContentNotices();
  });
  dailyTimer=setInterval(checkDailyReminder,DAILY_REMINDER_INTERVAL_MS);
  contentTimer=setInterval(()=>void pollContentNotices(),CONTENT_NOTICE_POLL_MS);

  loadPreferences().then(()=>{
    checkDailyReminder();
    if(preferences.contentNoticesEnabled)void pollContentNotices();
  });

  return {
    destroy() {
      destroyed=true;
      clearInterval(dailyTimer);
      clearInterval(contentTimer);
    },
  };
}

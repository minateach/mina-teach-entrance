(() => {
  const existing = document.getElementById("offline-connection-status");
  if (existing) return;
  const MODE_KEY = "minaTeach.offlineMode.v1";
  const status = document.createElement("div");
  status.id = "offline-connection-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, {
    display: "flex", flexWrap: "wrap", alignItems: "center", justifyContent: "center", gap: "8px 18px",
    padding: "8px 14px", font: "600 13px/1.4 system-ui,sans-serif",
    borderBottom: "1px solid #dbe5f1", background: "#eef8f1", color: "#17633a",
  });
  const message = document.createElement("span");
  const label = document.createElement("label");
  label.style.cssText = "display:inline-flex;align-items:center;gap:7px;cursor:pointer;color:#10234f;font-weight:700";
  const toggle = document.createElement("input");
  toggle.type = "checkbox";
  toggle.id = "offline-mode-toggle";
  toggle.setAttribute("role", "switch");
  toggle.setAttribute("aria-label", "Offline Mode");
  toggle.style.cssText = "width:18px;height:18px;accent-color:#2563eb";
  const toggleText = document.createElement("span");
  toggleText.textContent = "Offline Mode";
  label.append(toggle, toggleText);
  status.append(message, label);
  const enabled = () => {
    try { return localStorage.getItem(MODE_KEY) === "on"; }
    catch { return false; }
  };
  const setEnabled = value => {
    const next = Boolean(value);
    try {
      if (next) localStorage.setItem(MODE_KEY, "on");
      else localStorage.removeItem(MODE_KEY);
    } catch {
      message.textContent = "Offline Mode could not be saved in this browser.";
      return false;
    }
    toggle.checked = next;
    window.dispatchEvent(new CustomEvent("mina:offline-mode-change", { detail: { enabled: next } }));
    update();
    return true;
  };
  const update = () => {
    toggle.checked = enabled();
    if (navigator.onLine) {
      message.textContent = enabled()
        ? "Offline Mode is on · Learning uses downloaded content only. AI tutoring still uses internet."
        : "Online · Download lessons and question sets to study without internet.";
      status.style.background = enabled() ? "#eaf2ff" : "#eef8f1";
      status.style.color = enabled() ? "#17449a" : "#17633a";
    } else {
      message.textContent = "Offline · Downloaded lessons and practice sets work here. AI tutoring, sign-in, and account sync need internet.";
      status.style.background = "#fff4df";
      status.style.color = "#7a4a00";
    }
  };
  toggle.addEventListener("change", () => setEnabled(toggle.checked));
  window.MinaOfflineMode = Object.freeze({ enabled, setEnabled });
  update();
  document.body.prepend(status);
  window.addEventListener("online", update);
  window.addEventListener("offline", update);
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/service-worker.js").catch(() => {
      status.title = "Offline shell could not be installed. Downloaded lesson data may still be available in this browser.";
    }), { once: true });
  }
})();

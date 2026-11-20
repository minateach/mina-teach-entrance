(() => {
  const existing = document.getElementById("offline-connection-status");
  if (existing) return;
  const status = document.createElement("div");
  status.id = "offline-connection-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  Object.assign(status.style, {
    display: "block", padding: "7px 14px", font: "600 13px/1.4 system-ui,sans-serif",
    textAlign: "center", borderBottom: "1px solid #dbe5f1", background: "#eef8f1",
    color: "#17633a",
  });
  const update = () => {
    if (navigator.onLine) {
      status.textContent = "Online · Download lessons and question sets to study without internet.";
      status.style.background = "#eef8f1";
      status.style.color = "#17633a";
    } else {
      status.textContent = "Offline · Downloaded lessons and practice sets work here. AI tutoring, sign-in, and account sync need internet.";
      status.style.background = "#fff4df";
      status.style.color = "#7a4a00";
    }
  };
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

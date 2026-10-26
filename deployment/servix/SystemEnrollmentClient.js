(() => {
  const marker = document.querySelector("meta[name=setup-token]"),
    token = marker.content;
  marker.remove();
  history.replaceState(null, "", "/");
  const el = (id) => document.getElementById(id);
  let requestPending = false;
  let defaultsLoaded = false,
    edited = false,
    localError;
  el("form").addEventListener("input", () => {
    edited = true;
    localError = undefined;
  });
  async function call(route, body) {
    const r = await fetch(route, {
      method: "POST",
      headers: { "content-type": "application/json", "x-devsetu-setup": token },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(25000),
    });
    const value = await r.json();
    if (!r.ok) throw Error(value.error || "setup-unavailable");
    return value;
  }
  async function update() {
    try {
      const s = await call("/status", {});
      if (!defaultsLoaded) {
        defaultsLoaded = true;
        if (s.defaults && !edited) {
          el("server").value = s.defaults.server;
          el("username").value = s.defaults.username;
          el("activity").checked = s.defaults.fileActivity;
        }
      }
      document.querySelector("main").setAttribute("aria-busy", String(s.busy));
      el("message").textContent = localError || s.message;
      el("connect").disabled = s.busy || s.online || requestPending;
      el("connect").textContent = ["failed", "waiting"].includes(s.phase)
        ? "Retry connection"
        : "Connect this computer";
      el("recheck").hidden = !s.online;
      el("form").hidden = s.online;
      for (const input of el("form").querySelectorAll("input")) input.disabled = s.busy;
      if (s.server) {
        el("discovery").href = s.server + "/systems/discovery";
        el("projects").href = s.server + "/projects/components";
        el("discovery").hidden = false;
        el("projects").hidden = false;
      }
    } catch {
      el("message").textContent =
        "Local setup connection is unavailable. Keep the launcher open and retry.";
    }
  }
  el("form").onsubmit = async (event) => {
    event.preventDefault();
    if (requestPending) return;
    requestPending = true;
    localError = undefined;
    el("connect").disabled = true;
    try {
      await call("/connect", {
        server: el("server").value.trim(),
        username: el("username").value.trim(),
        password: el("password").value,
        fileActivity: el("activity").checked,
      });
      el("password").value = "";
    } catch (e) {
      localError = e.message;
    } finally {
      requestPending = false;
      await update();
    }
  };
  el("recheck").onclick = () => void update();
  void update();
  setInterval(() => void update(), 1500);
})();

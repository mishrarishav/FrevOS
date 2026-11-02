(() => {
  const marker = document.querySelector('meta[name="setup-token"]'),
    token = marker.content;
  marker.remove();
  history.replaceState(null, "", "/");
  const el = (id) => document.getElementById(id);
  let loaded = false,
    edited = false,
    error,
    pending = false,
    timer;
  el("form").oninput = () => {
    edited = true;
    error = undefined;
  };
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
      if (!loaded) {
        loaded = true;
        if (s.defaults && !edited) {
          el("server").value = s.defaults.server;
          el("activity").checked = s.defaults.fileActivity;
          el("notifications").checked = s.defaults.notifications === true;
        }
      }
      el("message").textContent = error || s.message;
      el("form").hidden = s.online;
      el("connect").disabled = s.busy || pending;
      el("connect").textContent = ["failed", "waiting"].includes(s.phase)
        ? "Retry connection"
        : "Connect this computer";
      for (const input of el("form").querySelectorAll("input")) input.disabled = s.busy;
      if (s.notificationsSupported === false) {
        el("notifications").checked = false;
        el("notifications").disabled = true;
        el("notifications").parentElement.hidden = true;
      }
      el("approval").hidden = s.phase !== "approval";
      if (s.code) {
        el("code").textContent = s.code;
        el("device").textContent =
          "Computer: " +
          s.deviceName +
          " · valid until " +
          new Date(s.expiresAt).toLocaleTimeString();
      }
      if (s.server) {
        el("approve").href = s.server + "/systems/discovery";
        el("discovery").href = s.server + "/systems/discovery";
        el("projects").href = s.server + "/projects/components";
        el("discovery").hidden = !s.online;
        el("projects").hidden = !s.online;
      }
      if (s.online) clearInterval(timer);
    } catch {
      el("message").textContent = "Local setup is unavailable. Keep the launcher open and retry.";
    }
  }
  el("form").onsubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    pending = true;
    error = undefined;
    el("connect").disabled = true;
    try {
      await call("/connect", {
        server: el("server").value.trim(),
        joinCode: el("join-code").value.trim(),
        fileActivity: el("activity").checked,
        notifications: el("notifications").checked,
      });
    } catch (e) {
      error = e.message;
    } finally {
      pending = false;
      await update();
    }
  };
  el("copy").onclick = async () => {
    try {
      await navigator.clipboard.writeText(el("code").textContent);
      el("copy").textContent = "Copied";
    } catch {
      el("message").textContent = "Select and copy the code shown above.";
    }
  };
  timer = setInterval(() => void update(), 1500);
  void update();
})();

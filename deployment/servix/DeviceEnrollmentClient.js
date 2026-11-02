(() => {
  const marker = document.querySelector('meta[name="setup-token"]'),
    token = marker.content;
  marker.remove();
  history.replaceState(null, "", "/");
  const el = (id) => document.getElementById(id);
  let loaded = false,
    edited = false,
    error,
    correctedAccount,
    pending = false,
    timer;
  el("form").oninput = () => {
    edited = true;
    error = undefined;
  };
  const accountMode = () => el("request-mode").value !== "legacy";
  el("request-mode").onchange = () => {
    el("account-fields").hidden = !accountMode();
    el("legacy-fields").hidden = accountMode();
    el("new-name").hidden = el("request-mode").value !== "new";
    el("join-password").autocomplete =
      el("request-mode").value === "new" ? "new-password" : "current-password";
    el("connect").textContent = accountMode() ? "Request access" : "Connect this computer";
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
      if (s.existingAccountRequired && correctedAccount !== s.account) {
        el("request-mode").value = "existing";
        el("request-mode").onchange();
        correctedAccount = s.account;
      }
      if (!loaded) {
        loaded = true;
        if (s.defaults && !edited) {
          el("server").value = s.defaults.server;
          el("activity").checked = s.defaults.fileActivity;
          el("notifications").checked = s.defaults.notifications === true;
        }
      }
      el("message").textContent = error || s.message;
      const installed = ["connected", "offline"].includes(s.phase);
      el("form").hidden = installed;
      el("connection-result").hidden = !installed;
      el("connection-result").textContent = s.online ? "Connected ✓" : "Offline";
      el("connect").disabled = s.online || s.busy || pending;
      el("connect").textContent = s.online
        ? "Connected ✓"
        : ["failed", "waiting"].includes(s.phase)
          ? "Retry connection"
          : accountMode()
            ? "Request access"
            : "Connect this computer";
      for (const input of el("form").querySelectorAll("input")) input.disabled = s.busy;
      if (s.notificationsSupported === false) {
        el("notifications").checked = false;
        el("notifications").disabled = true;
        el("notifications").parentElement.hidden = true;
      }
      el("approval").hidden = s.phase !== "approval" || !s.code;
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
        el("projects").hidden = true;
      }
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
      const body = {
        server: el("server").value.trim(),
        fileActivity: el("activity").checked,
        notifications: el("notifications").checked,
      };
      if (accountMode()) {
        body.account = {
          mode: el("request-mode").value,
          username: el("join-username").value.trim().toLowerCase(),
          password: el("join-password").value,
          displayName: el("join-name").value.trim(),
        };
      } else body.joinCode = el("join-code").value.trim();
      await call("/connect", body);
    } catch (e) {
      error = e.message;
    } finally {
      el("join-password").value = "";
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

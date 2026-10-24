(() => {
  history.replaceState(null, "", "/");
  const marker = document.querySelector('meta[name="devsetu-setup-csrf"]');
  const token = marker.content;
  marker.remove();
  let report = null;
  let busy = false;
  const el = (id) => document.getElementById(id);
  const text = (tag, value) => {
    const element = document.createElement(tag);
    element.textContent = value;
    return element;
  };
  async function call(route, body) {
    const response = await fetch(location.origin + route, {
      method: "POST",
      headers: { "content-type": "application/json", "x-devsetu-setup": token },
      body: JSON.stringify(body),
    });
    const value = await response.json();
    if (!response.ok) throw Error(value.error || "System check unavailable");
    return value;
  }
  function update() {
    el("check").disabled = busy;
    el("install").disabled = busy || !document.querySelector("input[data-tool]:checked");
    el("finish").disabled =
      busy ||
      !report ||
      report.blocked.length > 0 ||
      report.tools.some((tool) => tool.status !== "ready");
  }
  function render(value) {
    report = value;
    el("system").textContent = `${value.system.name} · ${value.system.architecture}`;
    el("folder").textContent = `Project folder: ${value.repository}`;
    el("tools").replaceChildren();
    for (const tool of value.tools) {
      const article = document.createElement("article"),
        label = document.createElement("label"),
        checkbox = document.createElement("input");
      checkbox.type = "checkbox";
      checkbox.dataset.tool = `${tool.id}:${tool.required}`;
      checkbox.disabled = tool.status === "ready" || !tool.install.available;
      checkbox.onchange = update;
      label.append(
        checkbox,
        document.createTextNode(` ${tool.id} · required ${tool.required} · ${tool.status}`),
      );
      article.append(
        label,
        text("small", `Detected: ${tool.detected || "Missing"} · Manifest: ${tool.source}`),
      );
      if (tool.status !== "ready") {
        article.append(
          text(
            "p",
            `Install source: ${tool.install.source} · Privilege: ${tool.install.privilege}`,
          ),
        );
        if (tool.install.reason) article.append(text("p", tool.install.reason));
        if (tool.install.actions.length) {
          const details = document.createElement("details");
          details.append(
            text("summary", "Installation details"),
            text(
              "pre",
              tool.install.actions
                .map((action) => `${action.file} ${action.arguments.join(" ")}`)
                .join("\n"),
            ),
          );
          article.append(details);
        }
      }
      el("tools").append(article);
    }
    for (const reason of value.blocked) el("tools").append(text("p", reason));
    update();
  }
  async function action(operation) {
    if (busy) return;
    busy = true;
    update();
    try {
      await operation();
    } catch (error) {
      el("message").textContent = error.message;
    } finally {
      busy = false;
      update();
    }
  }
  el("check").onclick = () =>
    action(async () => {
      render(await call("/check", {}));
      el("message").textContent = "System check refreshed.";
    });
  el("install").onclick = () =>
    action(async () => {
      const selected = [...document.querySelectorAll("input[data-tool]:checked")].map(
        (input) => input.dataset.tool,
      );
      el("message").textContent =
        "Installing selected tools. Complete the OS prompt or check the launcher terminal if prompted…";
      const result = await call("/install", {
        operationId: crypto.randomUUID(),
        preview: report.fingerprint,
        selected,
      });
      render(result.report);
      el("message").textContent =
        `${result.receipts.map((receipt) => `${receipt.id}: ${receipt.outcome}`).join("\n")}\nSystem checked again. Review any remaining requirement.`;
    });
  el("finish").onclick = () =>
    action(async () => {
      await call("/finish", {
        preview: report.fingerprint,
        discoveryConsent: el("consent").checked,
      });
      el("message").textContent =
        "System check complete. Close this window and continue enrollment.";
      el("finish").textContent = "Completed";
      report = null;
    });
  void action(async () => render(await call("/check", {})));
})();

const $ = (id) => document.getElementById(id);
const base = window.APP_CONFIG.API_BASE.replace(/\/$/, "");
let token = localStorage.getItem("superset_control_token") || "";

async function api(path, options = {}) {
  const response = await fetch(base + path, {
    ...options,
    headers: {
      "content-type": "application/json",
      authorization: "Bearer " + token,
      ...options.headers,
    },
  });

  let data;
  try {
    data = await response.json();
  } catch {
    throw new Error("Respons server tidak valid (" + response.status + ")");
  }
  if (!response.ok) throw new Error(data.error || "API error");
  return data;
}

function renderRuns(runs) {
  const container = $("runs");
  container.replaceChildren();
  if (!runs.length) {
    container.textContent = "Belum ada run";
    return;
  }

  for (const run of runs) {
    const item = document.createElement("div");
    item.className = "run";
    const title = document.createElement("b");
    title.textContent = run.status || "unknown";
    item.append(title, document.createTextNode(" · " + (run.conclusion || "aktif")));

    if (run.html_url && /^https:\/\/github\.com\//.test(run.html_url)) {
      const link = document.createElement("a");
      link.href = run.html_url;
      link.target = "_blank";
      link.rel = "noopener noreferrer";
      link.textContent = "Lihat workflow";
      item.append(document.createElement("br"), link);
    }
    container.append(item);
  }
}

async function refresh() {
  const data = await api("/api/status");
  $("state").textContent = data.active
    ? "RUNNING · " + data.active.status
    : "STOPPED";
  renderRuns(data.runs || []);
}

function show() {
  $("auth").hidden = true;
  $("app").hidden = false;
  refresh().catch((error) => {
    $("message").textContent = error.message;
  });
}

$("connect").onclick = async () => {
  token = $("token").value.trim();
  if (!token) {
    $("authmsg").textContent = "Token wajib diisi.";
    return;
  }
  try {
    await api("/api/status");
    localStorage.setItem("superset_control_token", token);
    show();
  } catch (error) {
    $("authmsg").textContent = error.message;
  }
};

$("refresh").onclick = () =>
  refresh().catch((error) => {
    $("message").textContent = error.message;
  });

$("start").onclick = async () => {
  const button = $("start");
  button.disabled = true;
  try {
    const data = await api("/api/start", {
      method: "POST",
      body: JSON.stringify({
        email: $("email").value,
        minutes: $("minutes").value,
      }),
    });
    $("message").textContent = data.message;
    await refresh();
  } catch (error) {
    $("message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

$("stop").onclick = async () => {
  if (!confirm("Hentikan sesi aktif?")) return;
  const button = $("stop");
  button.disabled = true;
  try {
    const data = await api("/api/stop", {
      method: "POST",
      body: "{}",
    });
    $("message").textContent = data.message;
    await refresh();
  } catch (error) {
    $("message").textContent = error.message;
  } finally {
    button.disabled = false;
  }
};

if (token) show();

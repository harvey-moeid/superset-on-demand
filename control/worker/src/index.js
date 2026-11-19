const JSON_HEADERS = {
  "content-type": "application/json; charset=utf-8",
  "cache-control": "no-store",
  "x-content-type-options": "nosniff",
};

const reply = (body, status, cors = {}) =>
  new Response(JSON.stringify(body), { status, headers: { ...JSON_HEADERS, ...cors } });

function corsHeaders(origin, allowedOrigins) {
  if (!origin || !allowedOrigins.includes(origin)) return {};
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "GET, POST, OPTIONS",
    "access-control-allow-headers": "Authorization, Content-Type",
    "access-control-max-age": "86400",
    vary: "Origin",
  };
}

class GithubError extends Error {
  constructor(message, status) {
    super(message);
    this.name = "GithubError";
    this.status = status;
  }
}

// Pesan aman (tanpa detail token) untuk ditampilkan di panel setelah login dashboard.
function githubErrorMessage(error) {
  if (error.message === "GitHub token is not configured") {
    return "GITHUB_TOKEN belum diset di worker. Set secret SUPERSET_GITHUB_TOKEN lalu deploy ulang control plane.";
  }
  if (error.message === "Worker repository configuration is invalid") {
    return "GITHUB_REPOSITORY di wrangler.toml tidak valid (format owner/repo).";
  }
  switch (error.status) {
    case 401:
      return "GitHub menolak token (401): token salah atau kedaluwarsa. Perbarui SUPERSET_GITHUB_TOKEN.";
    case 403:
      return "GitHub menolak akses (403): token butuh izin Actions Read & Write, atau kena rate limit.";
    case 404:
      return "GitHub 404: repo/workflow tidak ditemukan atau token tidak mencakup repo ini.";
    case 422:
      return "GitHub 422: workflow tidak bisa dijalankan di branch main (cek file workflow).";
    default:
      return `GitHub API gagal (${error.status || "tanpa respons"}).`;
  }
}

async function github(env, path, init = {}) {
  if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(env.GITHUB_REPOSITORY || "")) {
    throw new Error("Worker repository configuration is invalid");
  }
  if (!env.GITHUB_TOKEN) throw new Error("GitHub token is not configured");
  let response;
  try {
    response = await fetch(`https://api.github.com/repos/${env.GITHUB_REPOSITORY}/${path}`, {
      ...init,
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${env.GITHUB_TOKEN}`,
        "x-github-api-version": "2022-11-28",
        "user-agent": "superset-control-worker",
        "content-type": "application/json",
        ...init.headers,
      },
    });
  } catch (error) {
    console.error("GitHub API network error", error);
    throw new GithubError("GitHub API unreachable", 0);
  }
  if (!response.ok) {
    const detail = await response.text();
    console.error("GitHub API request failed", response.status, detail.slice(0, 500));
    throw new GithubError("GitHub API request failed", response.status);
  }
  return response.status === 204 ? null : response.json();
}

async function readJson(request) {
  const contentType = request.headers.get("content-type") || "";
  if (!contentType.toLowerCase().includes("application/json")) {
    throw new Error("Content-Type harus application/json");
  }
  const length = Number(request.headers.get("content-length") || 0);
  if (length > 2048) throw new Error("Request terlalu besar");
  const raw = await request.text();
  if (raw.length > 2048) throw new Error("Request terlalu besar");
  try { return JSON.parse(raw || "{}"); }
  catch { throw new Error("JSON tidak valid"); }
}

export default {
  async fetch(request, env) {
    const origin = request.headers.get("Origin") || "";
    const allowedOrigins = (env.ALLOWED_ORIGINS || "").split(",").map((v) => v.trim()).filter(Boolean);
    const cors = corsHeaders(origin, allowedOrigins);
    const send = (body, status) => reply(body, status, cors);
    const url = new URL(request.url);

    if (request.method === "OPTIONS") {
      if (origin && !allowedOrigins.includes(origin)) return reply({ error: "Origin tidak diizinkan" }, 403);
      return new Response(null, { status: 204, headers: cors });
    }
    if (url.pathname === "/health") {
      return request.method === "GET" ? send({ ok: true }, 200) : send({ error: "Method not allowed" }, 405);
    }
    if (url.pathname === "/" && request.method === "GET") {
      return send({ service: "superset-control", ok: true, note: "API ini dipakai oleh panel kontrol Pages; endpoint /api/* butuh bearer token." }, 200);
    }
    if (origin && !allowedOrigins.includes(origin)) return send({ error: "Origin tidak diizinkan" }, 403);

    const authorization = request.headers.get("Authorization") || "";
    const suppliedToken = authorization.match(/^Bearer\s+(.+)$/i)?.[1] || "";
    if (!env.DASHBOARD_TOKEN || suppliedToken !== env.DASHBOARD_TOKEN) return send({ error: "Unauthorized" }, 401);

    try {
      if (url.pathname === "/api/status" && request.method === "GET") {
        const data = await github(env, "actions/workflows/superset-on-demand.yml/runs?per_page=10");
        const runs = (data.workflow_runs || []).map((run) => ({
          id: run.id, status: run.status, conclusion: run.conclusion, created_at: run.created_at,
          html_url: /^https:\/\/github\.com\//.test(run.html_url || "") ? run.html_url : "",
        }));
        return send({ active: runs.find((run) => ["queued", "in_progress"].includes(run.status)) || null, runs }, 200);
      }

      if (url.pathname === "/api/start" && request.method === "POST") {
        const body = await readJson(request);
        const minutes = String(body.minutes || "60");
        if (!["30", "60", "120", "180"].includes(minutes)) {
          return send({ error: "Durasi sesi tidak valid" }, 400);
        }
        const current = await github(env, "actions/workflows/superset-on-demand.yml/runs?per_page=10");
        if ((current.workflow_runs || []).some((run) => ["queued", "in_progress"].includes(run.status))) {
          return send({ error: "Sesi Superset sedang berjalan atau antre" }, 409);
        }
        await github(env, "actions/workflows/superset-on-demand.yml/dispatches", {
          method: "POST",
          body: JSON.stringify({ ref: "main", inputs: { session_minutes: minutes } }),
        });
        return send({ ok: true, message: "Start dikirim ke GitHub Actions." }, 202);
      }

      if (url.pathname === "/api/stop" && request.method === "POST") {
        await readJson(request);
        await github(env, "actions/workflows/stop-superset.yml/dispatches", {
          method: "POST", body: JSON.stringify({ ref: "main" }),
        });
        return send({ ok: true, message: "Permintaan stop dikirim." }, 202);
      }
      return send({ error: "Not found" }, 404);
    } catch (error) {
      console.error("Control API error", error);
      if (["Content-Type harus application/json", "Request terlalu besar", "JSON tidak valid"].includes(error.message)) {
        return send({ error: error.message }, 400);
      }
      if (error instanceof GithubError || ["GitHub token is not configured", "Worker repository configuration is invalid"].includes(error.message)) {
        return send({ error: githubErrorMessage(error) }, 502);
      }
      return send({ error: "Layanan sementara tidak tersedia" }, 502);
    }
  },
};

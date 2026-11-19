import test from "node:test";
import assert from "node:assert/strict";
import worker from "../src/index.js";

const env = {
  DASHBOARD_TOKEN: "test-dashboard-token",
  GITHUB_TOKEN: "test-github-token",
  GITHUB_REPOSITORY: "owner/repo",
  ALLOWED_ORIGINS: "https://panel.example.com",
};
const authorized = {
  Authorization: "Bearer test-dashboard-token",
  Origin: "https://panel.example.com",
};

test("health endpoint is public and read-only", async () => {
  const response = await worker.fetch(new Request("https://worker.example/health"), env);
  assert.equal(response.status, 200);
  assert.deepEqual(await response.json(), { ok: true });
});

test("rejects requests without a valid dashboard token", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/status", { headers: { Origin: authorized.Origin } }),
    env,
  );
  assert.equal(response.status, 401);
});

test("rejects browser origins outside the allowlist", async () => {
  const response = await worker.fetch(
    new Request("https://worker.example/api/status", {
      headers: { ...authorized, Origin: "https://attacker.example" },
    }),
    env,
  );
  assert.equal(response.status, 403);
});

test("rejects malformed and oversized start payloads before GitHub dispatch", async () => {
  const malformed = await worker.fetch(
    new Request("https://worker.example/api/start", {
      method: "POST",
      headers: { ...authorized, "content-type": "application/json" },
      body: "{",
    }),
    env,
  );
  assert.equal(malformed.status, 400);

  const invalidEmail = await worker.fetch(
    new Request("https://worker.example/api/start", {
      method: "POST",
      headers: { ...authorized, "content-type": "application/json" },
      body: JSON.stringify({ email: "not-an-email", minutes: "60" }),
    }),
    env,
  );
  assert.equal(invalidEmail.status, 400);
});

test("status endpoint returns normalized workflow data", async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async () => new Response(JSON.stringify({
    workflow_runs: [{
      id: 123,
      status: "in_progress",
      conclusion: null,
      created_at: "2026-11-19T00:00:00Z",
      html_url: "https://github.com/owner/repo/actions/runs/123",
    }],
  }), { status: 200, headers: { "content-type": "application/json" } });

  try {
    const response = await worker.fetch(
      new Request("https://worker.example/api/status", { headers: authorized }),
      env,
    );
    assert.equal(response.status, 200);
    const data = await response.json();
    assert.equal(data.active.id, 123);
    assert.equal(data.runs[0].html_url, "https://github.com/owner/repo/actions/runs/123");
  } finally {
    globalThis.fetch = originalFetch;
  }
});

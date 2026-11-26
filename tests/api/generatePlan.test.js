import { existsSync } from "node:fs";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corsHeaders } from "../../api/_utils.js";

const endpointUrl = new URL("../../api/generatePlan.js", import.meta.url).href;
let endpointModule = null;

beforeAll(async () => {
  try {
    endpointModule = await import(/* @vite-ignore */ endpointUrl);
  } catch {
    endpointModule = null;
  }
});

function getEndpoint() {
  expect(endpointModule, "api/generatePlan.js must exist").not.toBeNull();
  return endpointModule;
}

const toBase64Url = (str) =>
  Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeJwt = (payload) =>
  `${toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${toBase64Url(JSON.stringify(payload))}.sig_test`;

const VALID_TOKEN = makeJwt({ sub: "uid-123", email: "user@example.com", firebase: { sign_in_provider: "password" } });
const VALID_TOKEN_USER_2 = makeJwt({ sub: "uid-999", email: "other@example.com", firebase: { sign_in_provider: "password" } });
const ANON_TOKEN = makeJwt({ sub: "anon-1", firebase: { sign_in_provider: "anonymous" } });
const UPSTASH_URL = "https://upstash.test";
const UPSTASH_TOKEN = "upstash-secret-token-plan";
const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "PROVIDER_API_KEY",
  "API_URL",
  "MODEL",
  "MODEL_FALLBACK_1",
  "MODEL_FALLBACK_2",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_GENERATE_PLAN_MAX",
  "RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC",
  "RATE_LIMIT_TIMEOUT_MS",
];

const validPayload = (overrides = {}) => ({
  goal: "build muscle", level: "intermediate", selectedDays: ["Monday", "Wednesday", "Friday"],
  equipment: "full gym", duration: 60, weeks: 6, exclusions: "", priorities: "back", ...overrides,
});

const makePlanJson = (overrides = {}) => ({
  programName: "Hypertrophy Foundation", description: "6-week muscle builder", totalWeeks: 6,
  weeks: [{
    weekNumber: 1, description: "Intro week", coachNotes: "Control tempo",
    schedule: [{
      dayNumber: 1, dayName: "Monday", focus: "Upper Push",
      exercises: [{
        name: "Bench Press", sets: "3-4", reps: "8-12", rest: "2-3m",
        notes: "Pause on chest", alternatives: ["Bench Press", "DB Press", "db press", "Machine Press"],
      }],
    }],
  }],
  ...overrides,
});

function makeRequest({ method = "POST", token = VALID_TOKEN, body, rawBody, headers = {} } = {}) {
  const reqHeaders = { ...headers };
  if (token !== null && !("Authorization" in reqHeaders)) reqHeaders.Authorization = `Bearer ${token}`;
  const init = { method, headers: reqHeaders };
  if (rawBody !== undefined) init.body = rawBody;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    reqHeaders["Content-Type"] = "application/json";
  }
  return new Request("https://example.test/api/generatePlan", init);
}

const jsonResponse = (data, status = 200) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data), { status, headers: { "Content-Type": "application/json" } });

const authOkResponse = (uid = "uid-123", email = "user@example.com") =>
  jsonResponse({ users: [{ localId: uid, email, providerUserInfo: [{ providerId: "password" }] }] });

const rateLimitAllowResponse = (count = 1, ttlMs = 3_600_000) =>
  jsonResponse({ result: [1, count, ttlMs] });

const rateLimitDenyResponse = (count = 10, ttlMs = 1_842_150) =>
  jsonResponse({ result: [0, count, ttlMs] });

const aiChoiceResponse = (content, status = 200) => jsonResponse({ choices: [{ message: { content } }] }, status);

function expectRateLimitHeaders(res, limit = "10", remaining = "9") {
  expect(res.headers.get("X-RateLimit-Limit")).toBe(limit);
  expect(res.headers.get("X-RateLimit-Remaining")).toBe(remaining);
  expect(res.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
  expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-RateLimit-Limit");
}

function assertNoUndefined(value, path = "plan") {
  expect(value, `${path} must not be undefined`).not.toBeUndefined();
  if (Array.isArray(value)) value.forEach((item, idx) => assertNoUndefined(item, `${path}[${idx}]`));
  else if (value !== null && typeof value === "object") {
    for (const key of Object.keys(value)) assertNoUndefined(value[key], `${path}.${key}`);
  }
}

describe("POST /api/generatePlan", () => {
  const savedEnv = {};
  const originalFetch = globalThis.fetch;
  let fetchMock;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.VITE_FIREBASE_API_KEY = "test-fb-key";
    process.env.PROVIDER_API_KEY = "secret-provider-key-xyz";
    process.env.API_URL = "https://provider.test/v1/chat/completions";
    process.env.MODEL = "primary-model";
    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
    delete process.env.MODEL_FALLBACK_1;
    delete process.env.MODEL_FALLBACK_2;
    delete process.env.RATE_LIMIT_GENERATE_PLAN_MAX;
    delete process.env.RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC;
    delete process.env.RATE_LIMIT_TIMEOUT_MS;

    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    for (const key of ENV_KEYS) {
      if (savedEnv[key] === undefined) delete process.env[key];
      else process.env[key] = savedEnv[key];
    }
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("removes legacy api/callModel.js and configures edge runtime", () => {
    expect(existsSync(new URL("../../api/callModel.js", import.meta.url))).toBe(false);
    const { config, default: handler } = getEndpoint();
    expect(config).toEqual({ runtime: "edge" });
    expect(handler).toBeTypeOf("function");
  });

  it("enforces withAuth CORS, method, token, anonymous, and JSON guards", async () => {
    const { default: handler } = getEndpoint();

    const optRes = await handler(makeRequest({ method: "OPTIONS", token: null }));
    expect(optRes.status).toBe(200);
    expect(optRes.headers.get("Access-Control-Allow-Origin")).toBe(corsHeaders["Access-Control-Allow-Origin"]);

    const getRes = await handler(makeRequest({ method: "GET", token: null }));
    expect(getRes.status).toBe(405);

    const noAuthRes = await handler(makeRequest({ token: null, body: validPayload() }));
    expect(noAuthRes.status).toBe(401);

    const anonRes = await handler(makeRequest({ token: ANON_TOKEN, body: validPayload() }));
    expect(anonRes.status).toBe(403);

    fetchMock.mockResolvedValueOnce(authOkResponse());
    const badJsonRes = await handler(makeRequest({ rawBody: "{bad json" }));
    expect(badJsonRes.status).toBe(400);
    await expect(badJsonRes.json()).resolves.toEqual({ error: "Invalid JSON body" });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "missing required fields", body: {} },
    { label: "invalid weekday", body: validPayload({ selectedDays: ["Monday", "Funday"] }) },
    { label: "prototype key in selectedDays", body: validPayload({ selectedDays: ["constructor"] }) },
    { label: "out-of-range duration", body: validPayload({ duration: 5 }) },
    { label: "boolean duration", body: validPayload({ duration: true }) },
    { label: "float weeks", body: validPayload({ weeks: 2.5 }) },
    { label: "out-of-range weeks", body: validPayload({ weeks: 60 }) },
    { label: "invalid exclusions type", body: validPayload({ exclusions: 123 }) },
    { label: "invalid priorities array item", body: validPayload({ priorities: [42] }) },
  ])("returns 400 INVALID_REQUEST on $label without calling AI provider", async ({ body }) => {
    const { default: handler } = getEndpoint();
    fetchMock.mockResolvedValueOnce(authOkResponse());

    const res = await handler(makeRequest({ body }));
    expect(res.status).toBe(400);
    const data = await res.json();
    expect(data.code).toBe("INVALID_REQUEST");
    expect(Array.isArray(data.details) && data.details.length > 0).toBe(true);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("returns 200 with sanitized plan from fenced JSON, rate-limit headers, and zero undefined values", async () => {
    const { default: handler } = getEndpoint();
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(1, 3_600_000))
      .mockResolvedValueOnce(aiChoiceResponse(`Here is your plan:\n\`\`\`json\n${JSON.stringify(makePlanJson())}\n\`\`\``));

    const res = await handler(
      makeRequest({ body: validPayload({ selectedDays: ["mon", "WED", "fri", "Monday"], duration: "60", weeks: "6" }) })
    );
    expect(res.status).toBe(200);
    expect(res.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expectRateLimitHeaders(res, "10", "9");

    const { plan } = await res.json();
    expect(plan.programName).toBe("Hypertrophy Foundation");
    expect(plan.totalWeeks).toBe(6);
    expect(plan.weeks[0].schedule[0].exercises[0]).toMatchObject({
      sets: 4,
      reps: "8-12",
      restSeconds: 180,
      rest: "180s",
      alternatives: ["DB Press", "Machine Press"],
    });
    assertNoUndefined(plan);

    const [rlUrl, rlInit] = fetchMock.mock.calls[1];
    expect(rlUrl).toBe(UPSTASH_URL);
    expect(JSON.parse(rlInit.body).slice(3, 5)).toEqual(["fitgen:rl:v1:generatePlan:uid-123", "10"]);

    const [aiUrl, aiInit] = fetchMock.mock.calls[2];
    expect(aiUrl).toBe("https://provider.test/v1/chat/completions");
    expect(aiInit.headers.Authorization).toBe("Bearer secret-provider-key-xyz");
    expect(JSON.parse(aiInit.body).model).toBe("primary-model");
  });

  it("falls back to MODEL_FALLBACK_1 when primary MODEL fails with 503", async () => {
    vi.spyOn(console, "warn").mockImplementation(() => {});
    vi.spyOn(console, "error").mockImplementation(() => {});
    process.env.MODEL_FALLBACK_1 = "fallback-model-1";

    const { default: handler } = getEndpoint();
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "overloaded" }, 503))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(makePlanJson())));

    const res = await handler(makeRequest({ body: validPayload() }));
    expect(res.status).toBe(200);
    expectRateLimitHeaders(res);
    expect(fetchMock).toHaveBeenCalledTimes(4);
    expect(JSON.parse(fetchMock.mock.calls[2][1].body).model).toBe("primary-model");
    expect(JSON.parse(fetchMock.mock.calls[3][1].body).model).toBe("fallback-model-1");
  });

  it("returns 422 with rate-limit headers on unparseable AI output or plan validation failure", async () => {
    const { default: handler } = getEndpoint();

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(2))
      .mockResolvedValueOnce(aiChoiceResponse("Sorry, I cannot provide JSON right now."));
    const unparseable = await handler(makeRequest({ body: validPayload() }));
    expect(unparseable.status).toBe(422);
    expectRateLimitHeaders(unparseable, "10", "8");
    await expect(unparseable.json()).resolves.toEqual({
      error: "AI response could not be parsed as valid JSON",
      code: "INVALID_AI_OUTPUT",
    });

    const badPlan = makePlanJson({
      weeks: [
        {
          weekNumber: 2,
          schedule: [
            { dayNumber: 1, dayName: "Tuesday", focus: "Push", exercises: [{ name: "Bench", sets: 3, reps: "10" }] },
          ],
        },
      ],
    });
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(3))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(badPlan)));
    const invalidPlan = await handler(makeRequest({ body: validPayload() }));
    expect(invalidPlan.status).toBe(422);
    expectRateLimitHeaders(invalidPlan, "10", "7");
    const body = await invalidPlan.json();
    expect(body.code).toBe("PLAN_VALIDATION_FAILED");
    expect(Array.isArray(body.details) && body.details.length >= 2).toBe(true);
  });

  it("maps missing env to 500, upstream/envelope errors to 502, and timeouts to 504 with rate-limit headers", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: handler } = getEndpoint();

    // 500 missing config
    delete process.env.PROVIDER_API_KEY;
    fetchMock.mockResolvedValueOnce(authOkResponse()).mockResolvedValueOnce(rateLimitAllowResponse());
    const cfgRes = await handler(makeRequest({ body: validPayload() }));
    expect(cfgRes.status).toBe(500);
    expectRateLimitHeaders(cfgRes);
    expect((await cfgRes.json()).code).toBe("CONFIG_ERROR");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // 502 upstream HTTP error
    process.env.PROVIDER_API_KEY = "secret-provider-key-xyz";
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockResolvedValueOnce(jsonResponse({ rawUpstream: "secret-provider-key-xyz stacktrace" }, 500));
    const upRes = await handler(makeRequest({ body: validPayload() }));
    expect(upRes.status).toBe(502);
    expectRateLimitHeaders(upRes);
    const upText = await upRes.text();
    expect(JSON.parse(upText).code).toBe("UPSTREAM_ERROR");
    expect(upText).not.toContain("secret-provider-key-xyz");
    expect(upText).not.toContain("stacktrace");

    // 502 invalid provider envelope
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockResolvedValueOnce(jsonResponse({ choices: [] }, 200));
    const envRes = await handler(makeRequest({ body: validPayload() }));
    expect(envRes.status).toBe(502);
    expectRateLimitHeaders(envRes);
    expect((await envRes.json()).code).toBe("UPSTREAM_INVALID_RESPONSE");

    // 504 timeout does not burn fallback models
    process.env.MODEL_FALLBACK_1 = "fallback-should-not-run";
    const abortErr = Object.assign(new Error("The operation was aborted"), { name: "AbortError" });
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockRejectedValueOnce(abortErr);
    const timeoutRes = await handler(makeRequest({ body: validPayload() }));
    expect(timeoutRes.status).toBe(504);
    expectRateLimitHeaders(timeoutRes);
    expect((await timeoutRes.json()).code).toBe("UPSTREAM_TIMEOUT");
    expect(fetchMock).toHaveBeenCalledTimes(3);

    const logged = [...errSpy.mock.calls, ...warnSpy.mock.calls].flat().map(String).join(" ");
    expect(logged).not.toContain("secret-provider-key-xyz");
  });

  it("enforces 429 before AI call and isolates per-user Redis keys ignoring body uid (AC-10, AC-11, AC-14)", async () => {
    const { default: handler } = getEndpoint();
    fetchMock
      .mockResolvedValueOnce(authOkResponse("uid-123"))
      .mockResolvedValueOnce(rateLimitDenyResponse(10, 1_842_150));

    const denied = await handler(makeRequest({ body: validPayload({ uid: "spoofed-uid" }) }));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toBe("1843");
    expectRateLimitHeaders(denied, "10", "0");
    expect(await denied.json()).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds: 1843,
      limit: 10,
      windowSeconds: 3600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slice(3, 5)).toEqual([
      "fitgen:rl:v1:generatePlan:uid-123",
      "10",
    ]);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(authOkResponse("uid-999", "other@example.com"))
      .mockResolvedValueOnce(rateLimitAllowResponse(1))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(makePlanJson())));

    const user2Res = await handler(makeRequest({ token: VALID_TOKEN_USER_2, body: validPayload() }));
    expect(user2Res.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slice(3, 5)).toEqual([
      "fitgen:rl:v1:generatePlan:uid-999",
      "10",
    ]);
  });

  it("fails closed with 503 RATE_LIMIT_UNAVAILABLE without calling AI or leaking Upstash secrets (AC-12)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: handler } = getEndpoint();

    delete process.env.UPSTASH_REDIS_REST_URL;
    fetchMock.mockResolvedValueOnce(authOkResponse());
    const missingCfg = await handler(makeRequest({ body: validPayload() }));
    expect(missingCfg.status).toBe(503);
    expect(missingCfg.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(missingCfg.headers.get("X-RateLimit-Limit")).toBeNull();
    expect((await missingCfg.json()).code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(jsonResponse({ error: `ERR ${UPSTASH_TOKEN}` }, 500));
    const upstashFail = await handler(makeRequest({ body: validPayload() }));
    expect(upstashFail.status).toBe(503);
    expect(upstashFail.headers.get("Access-Control-Allow-Origin")).toBe("*");
    const failText = await upstashFail.text();
    expect(JSON.parse(failText).code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(2);

    const logged = errSpy.mock.calls.flat().map(String).join(" ");
    for (const surface of [failText, logged]) {
      expect(surface).not.toContain(UPSTASH_TOKEN);
      expect(surface).not.toContain(UPSTASH_URL);
    }
  });
});

import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { corsHeaders } from "../../api/_utils.js";

const endpointUrl = new URL("../../api/generateWeek.js", import.meta.url).href;
let endpointModule = null;

beforeAll(async () => {
  try {
    endpointModule = await import(/* @vite-ignore */ endpointUrl);
  } catch {
    endpointModule = null;
  }
});

function getEndpoint() {
  expect(endpointModule, "api/generateWeek.js must exist").not.toBeNull();
  return endpointModule;
}

const toBase64Url = (str) =>
  Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeJwt = (payload) =>
  `${toBase64Url(JSON.stringify({ alg: "RS256", typ: "JWT" }))}.${toBase64Url(JSON.stringify(payload))}.sig_test`;

const VALID_TOKEN = makeJwt({
  sub: "uid-456",
  email: "athlete@example.com",
  firebase: { sign_in_provider: "password" },
});
const VALID_TOKEN_USER_2 = makeJwt({
  sub: "uid-789",
  email: "other@example.com",
  firebase: { sign_in_provider: "password" },
});
const ANON_TOKEN = makeJwt({
  sub: "anon-2",
  firebase: { sign_in_provider: "anonymous" },
});
const UPSTASH_URL = "https://upstash.test";
const UPSTASH_TOKEN = "upstash-secret-token-week";

const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "PROVIDER_API_KEY",
  "API_URL",
  "MODEL",
  "MODEL_FALLBACK_1",
  "MODEL_FALLBACK_2",
  "UPSTASH_REDIS_REST_URL",
  "UPSTASH_REDIS_REST_TOKEN",
  "RATE_LIMIT_GENERATE_WEEK_MAX",
  "RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC",
  "RATE_LIMIT_TIMEOUT_MS",
];

function validBody(overrides = {}) {
  return {
    profile: {
      goal: "build muscle",
      level: "intermediate",
      equipment: "full gym",
      selectedDays: ["Monday", "Wednesday", "Friday"],
      duration: 50,
      exclusions: "None",
      priorities: "legs",
    },
    programName: "Hypertrophy Protocol",
    lastWeek: {
      weekNumber: 1,
      schedule: [
        {
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          exercises: [{ name: "Bench Press" }],
        },
      ],
    },
    recentWorkouts: [{ focus: "Push", logs: [{ name: "Bench Press" }], duration: 2700 }],
    feedback: "Felt strong, ready for more volume",
    ...overrides,
  };
}

function makeWeekPayload(weekNumber = 2, dayName = "Monday") {
  return {
    weekNumber,
    description: `Week ${weekNumber} progression`,
    coachNotes: "Added 1 set to main lifts",
    schedule: [
      {
        dayNumber: 1,
        dayName,
        focus: "Upper Push",
        exercises: [
          {
            name: "Bench Press",
            sets: 4,
            reps: "8-10",
            rest: "90s",
            notes: "Control eccentric",
            alternatives: ["DB Bench", "Machine Press", "Push-Up"],
          },
        ],
      },
    ],
  };
}

function makeRequest({ method = "POST", token = VALID_TOKEN, body } = {}) {
  const headers = {};
  if (token !== null) headers.Authorization = `Bearer ${token}`;
  const init = { method, headers };
  if (body !== undefined) {
    init.body = JSON.stringify(body);
    headers["Content-Type"] = "application/json";
  }
  return new Request("https://example.test/api/generateWeek", init);
}

const jsonResponse = (data, status = 200) =>
  new Response(typeof data === "string" ? data : JSON.stringify(data), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const authOkResponse = (uid = "uid-456", email = "athlete@example.com") =>
  jsonResponse({
    users: [{ localId: uid, email, providerUserInfo: [{ providerId: "password" }] }],
  });

const rateLimitAllowResponse = (count = 1, ttlMs = 3_600_000) =>
  jsonResponse({ result: [1, count, ttlMs] });

const rateLimitDenyResponse = (count = 20, ttlMs = 900_500) =>
  jsonResponse({ result: [0, count, ttlMs] });

const aiChoiceResponse = (content, status = 200) =>
  jsonResponse({ choices: [{ message: { content } }] }, status);

function expectRateLimitHeaders(res, limit = "20", remaining = "19") {
  expect(res.headers.get("X-RateLimit-Limit")).toBe(limit);
  expect(res.headers.get("X-RateLimit-Remaining")).toBe(remaining);
  expect(res.headers.get("X-RateLimit-Reset")).toMatch(/^\d+$/);
  expect(res.headers.get("Access-Control-Expose-Headers")).toContain("X-RateLimit-Limit");
}

describe("POST /api/generateWeek", () => {
  const savedEnv = {};
  const originalFetch = globalThis.fetch;
  let fetchMock;

  beforeEach(() => {
    for (const key of ENV_KEYS) savedEnv[key] = process.env[key];
    process.env.VITE_FIREBASE_API_KEY = "test-fb-key";
    process.env.PROVIDER_API_KEY = "secret-week-key";
    process.env.API_URL = "https://provider.test/v1/chat/completions";
    process.env.MODEL = "primary-model";
    process.env.UPSTASH_REDIS_REST_URL = UPSTASH_URL;
    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
    delete process.env.MODEL_FALLBACK_1;
    delete process.env.MODEL_FALLBACK_2;
    delete process.env.RATE_LIMIT_GENERATE_WEEK_MAX;
    delete process.env.RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC;
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

  it("configures edge runtime and enforces withAuth guards (OPTIONS, 405, 401, 403)", async () => {
    const { config, default: handler } = getEndpoint();
    expect(config).toEqual({ runtime: "edge" });

    const optRes = await handler(makeRequest({ method: "OPTIONS", token: null }));
    expect(optRes.status).toBe(200);
    expect(optRes.headers.get("Access-Control-Allow-Origin")).toBe(corsHeaders["Access-Control-Allow-Origin"]);

    expect((await handler(makeRequest({ method: "GET", token: null }))).status).toBe(405);
    expect((await handler(makeRequest({ token: null, body: validBody() }))).status).toBe(401);
    expect((await handler(makeRequest({ token: ANON_TOKEN, body: validBody() }))).status).toBe(403);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each([
    { label: "missing profile", body: validBody({ profile: undefined }) },
    { label: "missing lastWeek", body: validBody({ lastWeek: undefined }) },
    { label: "invalid weekNumber 0", body: validBody({ lastWeek: { ...validBody().lastWeek, weekNumber: 0 } }) },
    { label: "float weekNumber", body: validBody({ lastWeek: { ...validBody().lastWeek, weekNumber: 1.5 } }) },
    { label: "empty schedule", body: validBody({ lastWeek: { weekNumber: 1, schedule: [] } }) },
    {
      label: "invalid exercises entry",
      body: validBody({
        lastWeek: {
          weekNumber: 1,
          schedule: [{ dayName: "Monday", focus: "Push", exercises: [{ name: "  " }] }],
        },
      }),
    },
    { label: "non-array recentWorkouts", body: validBody({ recentWorkouts: "bad" }) },
    { label: "non-object recentWorkouts item", body: validBody({ recentWorkouts: ["bad"] }) },
    { label: "non-string feedback", body: validBody({ feedback: 123 }) },
    { label: "overlong feedback", body: validBody({ feedback: "a".repeat(1001) }) },
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

  it("returns 200 with rate-limit headers for wrapped week response with expectedWeekNumber = lastWeek.weekNumber + 1", async () => {
    const { default: handler } = getEndpoint();
    const wrapped = {
      programName: "Hypertrophy Protocol",
      description: "Week 2 block",
      weeks: [makeWeekPayload(2, "Monday")],
    };
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(1))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(wrapped)));

    const res = await handler(makeRequest({ body: validBody() }));
    expect(res.status).toBe(200);
    expectRateLimitHeaders(res, "20", "19");
    const { plan } = await res.json();
    expect(plan.programName).toBe("Hypertrophy Protocol");
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].weekNumber).toBe(2);
    expect(plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: 90, rest: "90s" });
    expect(fetchMock.mock.calls[1][0]).toBe(UPSTASH_URL);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slice(3, 5)).toEqual([
      "fitgen:rl:v1:generateWeek:uid-456",
      "20",
    ]);
  });

  it("supports bare week output, omitted optional fields, and ignores legacy sessionDuration (60m fallback)", async () => {
    const { default: handler } = getEndpoint();
    const legacyKey = ["session", "Duration"].join("");
    const body = validBody({
      programName: undefined,
      recentWorkouts: undefined,
      feedback: undefined,
      lastWeek: { ...validBody().lastWeek, weekNumber: 2 },
    });
    delete body.profile.duration;
    body.profile[legacyKey] = 30;

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(1))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(makeWeekPayload(3, "Wednesday"))));

    const res = await handler(makeRequest({ body }));
    expect(res.status).toBe(200);
    expectRateLimitHeaders(res);
    const { plan } = await res.json();
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].weekNumber).toBe(3);

    const sentBody = JSON.parse(fetchMock.mock.calls[2][1].body);
    expect(sentBody.messages[0].content).toContain("Adjust volume to fit 60 minutes.");
  });

  it("returns 422 with rate-limit headers on unparseable output, mismatched weekNumber, or day outside selectedDays", async () => {
    const { default: handler } = getEndpoint();

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(2))
      .mockResolvedValueOnce(aiChoiceResponse("no json here"));
    const unparseable = await handler(makeRequest({ body: validBody() }));
    expect(unparseable.status).toBe(422);
    expectRateLimitHeaders(unparseable, "20", "18");
    expect((await unparseable.json()).code).toBe("INVALID_AI_OUTPUT");

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(3))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify({ weeks: [makeWeekPayload(1, "Monday")] })));
    const wrongWeek = await handler(makeRequest({ body: validBody() }));
    expect(wrongWeek.status).toBe(422);
    expectRateLimitHeaders(wrongWeek, "20", "17");
    expect((await wrongWeek.json()).code).toBe("PLAN_VALIDATION_FAILED");

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse(4))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify({ weeks: [makeWeekPayload(2, "Sunday")] })));
    const badDay = await handler(makeRequest({ body: validBody() }));
    expect(badDay.status).toBe(422);
    expectRateLimitHeaders(badDay, "20", "16");
    const badDayData = await badDay.json();
    expect(badDayData.code).toBe("PLAN_VALIDATION_FAILED");
    expect(Array.isArray(badDayData.details) && badDayData.details.length > 0).toBe(true);
  });

  it("maps missing env to 500, upstream failures to 502, and timeouts to 504 with rate-limit headers", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: handler } = getEndpoint();

    delete process.env.MODEL;
    fetchMock.mockResolvedValueOnce(authOkResponse()).mockResolvedValueOnce(rateLimitAllowResponse());
    const cfgRes = await handler(makeRequest({ body: validBody() }));
    expect(cfgRes.status).toBe(500);
    expectRateLimitHeaders(cfgRes);
    expect((await cfgRes.json()).code).toBe("CONFIG_ERROR");

    process.env.MODEL = "primary-model";
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "bad gateway" }, 502));
    const upRes = await handler(makeRequest({ body: validBody() }));
    expect(upRes.status).toBe(502);
    expectRateLimitHeaders(upRes);
    expect((await upRes.json()).code).toBe("UPSTREAM_ERROR");

    const abortErr = Object.assign(new Error("Aborted"), { name: "AbortError" });
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(rateLimitAllowResponse())
      .mockRejectedValueOnce(abortErr);
    const timeoutRes = await handler(makeRequest({ body: validBody() }));
    expect(timeoutRes.status).toBe(504);
    expectRateLimitHeaders(timeoutRes);
    expect((await timeoutRes.json()).code).toBe("UPSTREAM_TIMEOUT");
  });

  it("enforces 429 before AI call and isolates per-user Redis keys ignoring body uid (AC-10, AC-11, AC-14)", async () => {
    const { default: handler } = getEndpoint();
    fetchMock
      .mockResolvedValueOnce(authOkResponse("uid-456"))
      .mockResolvedValueOnce(rateLimitDenyResponse(20, 900_500));

    const denied = await handler(makeRequest({ body: validBody({ uid: "spoofed-uid" }) }));
    expect(denied.status).toBe(429);
    expect(denied.headers.get("Retry-After")).toBe("901");
    expectRateLimitHeaders(denied, "20", "0");
    expect(await denied.json()).toMatchObject({
      code: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds: 901,
      limit: 20,
      windowSeconds: 3600,
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slice(3, 5)).toEqual([
      "fitgen:rl:v1:generateWeek:uid-456",
      "20",
    ]);

    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(authOkResponse("uid-789", "other@example.com"))
      .mockResolvedValueOnce(rateLimitAllowResponse(1))
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(makeWeekPayload(2, "Monday"))));

    const user2Res = await handler(makeRequest({ token: VALID_TOKEN_USER_2, body: validBody() }));
    expect(user2Res.status).toBe(200);
    expect(JSON.parse(fetchMock.mock.calls[1][1].body).slice(3, 5)).toEqual([
      "fitgen:rl:v1:generateWeek:uid-789",
      "20",
    ]);
  });

  it("fails closed with 503 RATE_LIMIT_UNAVAILABLE without calling AI or leaking Upstash secrets (AC-12)", async () => {
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const { default: handler } = getEndpoint();

    delete process.env.UPSTASH_REDIS_REST_TOKEN;
    fetchMock.mockResolvedValueOnce(authOkResponse());
    const missingCfg = await handler(makeRequest({ body: validBody() }));
    expect(missingCfg.status).toBe(503);
    expect(missingCfg.headers.get("Access-Control-Allow-Origin")).toBe("*");
    expect(missingCfg.headers.get("X-RateLimit-Limit")).toBeNull();
    expect((await missingCfg.json()).code).toBe("RATE_LIMIT_UNAVAILABLE");
    expect(fetchMock).toHaveBeenCalledTimes(1);

    process.env.UPSTASH_REDIS_REST_TOKEN = UPSTASH_TOKEN;
    fetchMock.mockReset();
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockRejectedValueOnce(new TypeError(`network fail ${UPSTASH_URL} ${UPSTASH_TOKEN}`));
    const upstashFail = await handler(makeRequest({ body: validBody() }));
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

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
const ANON_TOKEN = makeJwt({
  sub: "anon-2",
  firebase: { sign_in_provider: "anonymous" },
});

const ENV_KEYS = [
  "VITE_FIREBASE_API_KEY",
  "PROVIDER_API_KEY",
  "API_URL",
  "MODEL",
  "MODEL_FALLBACK_1",
  "MODEL_FALLBACK_2",
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

const authOkResponse = () =>
  jsonResponse({
    users: [{ localId: "uid-456", email: "athlete@example.com", providerUserInfo: [{ providerId: "password" }] }],
  });

const aiChoiceResponse = (content, status = 200) =>
  jsonResponse({ choices: [{ message: { content } }] }, status);

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
    delete process.env.MODEL_FALLBACK_1;
    delete process.env.MODEL_FALLBACK_2;

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

  it("returns 200 for wrapped week response with expectedWeekNumber = lastWeek.weekNumber + 1", async () => {
    const { default: handler } = getEndpoint();
    const wrapped = {
      programName: "Hypertrophy Protocol",
      description: "Week 2 block",
      weeks: [makeWeekPayload(2, "Monday")],
    };
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(wrapped)));

    const res = await handler(makeRequest({ body: validBody() }));
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.programName).toBe("Hypertrophy Protocol");
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].weekNumber).toBe(2);
    expect(plan.weeks[0].schedule[0].exercises[0]).toMatchObject({ restSeconds: 90, rest: "90s" });
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
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify(makeWeekPayload(3, "Wednesday"))));

    const res = await handler(makeRequest({ body }));
    expect(res.status).toBe(200);
    const { plan } = await res.json();
    expect(plan.weeks).toHaveLength(1);
    expect(plan.weeks[0].weekNumber).toBe(3);

    const sentBody = JSON.parse(fetchMock.mock.calls[1][1].body);
    expect(sentBody.messages[0].content).toContain("Adjust volume to fit 60 minutes.");
  });

  it("returns 422 on unparseable output, mismatched weekNumber, or day outside selectedDays", async () => {
    const { default: handler } = getEndpoint();

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(aiChoiceResponse("no json here"));
    const unparseable = await handler(makeRequest({ body: validBody() }));
    expect(unparseable.status).toBe(422);
    expect((await unparseable.json()).code).toBe("INVALID_AI_OUTPUT");

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify({ weeks: [makeWeekPayload(1, "Monday")] })));
    const wrongWeek = await handler(makeRequest({ body: validBody() }));
    expect(wrongWeek.status).toBe(422);
    expect((await wrongWeek.json()).code).toBe("PLAN_VALIDATION_FAILED");

    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(aiChoiceResponse(JSON.stringify({ weeks: [makeWeekPayload(2, "Sunday")] })));
    const badDay = await handler(makeRequest({ body: validBody() }));
    expect(badDay.status).toBe(422);
    const badDayData = await badDay.json();
    expect(badDayData.code).toBe("PLAN_VALIDATION_FAILED");
    expect(Array.isArray(badDayData.details) && badDayData.details.length > 0).toBe(true);
  });

  it("maps missing env to 500, upstream failures to 502, and timeouts to 504", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    vi.spyOn(console, "warn").mockImplementation(() => {});
    const { default: handler } = getEndpoint();

    delete process.env.MODEL;
    fetchMock.mockResolvedValueOnce(authOkResponse());
    const cfgRes = await handler(makeRequest({ body: validBody() }));
    expect(cfgRes.status).toBe(500);
    expect((await cfgRes.json()).code).toBe("CONFIG_ERROR");

    process.env.MODEL = "primary-model";
    fetchMock
      .mockResolvedValueOnce(authOkResponse())
      .mockResolvedValueOnce(jsonResponse({ error: "bad gateway" }, 502));
    const upRes = await handler(makeRequest({ body: validBody() }));
    expect(upRes.status).toBe(502);
    expect((await upRes.json()).code).toBe("UPSTREAM_ERROR");

    const abortErr = Object.assign(new Error("Aborted"), { name: "AbortError" });
    fetchMock.mockResolvedValueOnce(authOkResponse()).mockRejectedValueOnce(abortErr);
    const timeoutRes = await handler(makeRequest({ body: validBody() }));
    expect(timeoutRes.status).toBe(504);
    expect((await timeoutRes.json()).code).toBe("UPSTREAM_TIMEOUT");
  });
});

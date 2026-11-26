import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { corsHeaders } from "../../api/_utils.js";

const rateLimitUrl = new URL("../../api/_rateLimit.js", import.meta.url).href;
let rateLimitModule = null;

beforeAll(async () => {
  try {
    rateLimitModule = await import(/* @vite-ignore */ rateLimitUrl);
  } catch {
    rateLimitModule = null;
  }
});

function getRateLimit() {
  expect(rateLimitModule, "api/_rateLimit.js must exist").not.toBeNull();
  return rateLimitModule;
}

const TEST_URL = "https://upstash-secret-host.test";
const TEST_TOKEN = "upstash-super-secret-token-999";
const VALID_ENV = {
  UPSTASH_REDIS_REST_URL: TEST_URL,
  UPSTASH_REDIS_REST_TOKEN: TEST_TOKEN,
};
const FIXED_NOW = () => 1_700_000_000_000;

const jsonRes = (body, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe("api/_rateLimit — contract, headers & responses (AC-1..AC-3)", () => {
  it("sends a single atomic Upstash REST EVAL request and URI-encodes uid (AC-1)", async () => {
    const mod = getRateLimit();
    expect(mod.RATE_LIMIT_KEY_PREFIX).toBe("fitgen:rl:v1");
    expect(mod.DEFAULT_RATE_LIMIT_TIMEOUT_MS).toBe(3000);
    expect(Object.isFrozen(mod.RATE_LIMIT_POLICIES)).toBe(true);
    expect(mod.RATE_LIMIT_LUA_SCRIPT).toContain("INCR");
    expect(mod.RATE_LIMIT_LUA_SCRIPT).toContain("PEXPIRE");
    expect(mod.RATE_LIMIT_LUA_SCRIPT).toContain("PTTL");

    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonRes({ result: [1, 1, 3_600_000] }));
    await mod.checkRateLimit("uid-123", "generatePlan", {
      fetchImpl,
      env: { UPSTASH_REDIS_REST_URL: `${TEST_URL}///`, UPSTASH_REDIS_REST_TOKEN: `  ${TEST_TOKEN}  ` },
      now: FIXED_NOW,
    });

    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe(TEST_URL);
    expect(init.method).toBe("POST");
    expect(init.headers).toEqual({
      Authorization: `Bearer ${TEST_TOKEN}`,
      "Content-Type": "application/json",
    });
    expect(init.signal).toBeInstanceOf(AbortSignal);
    expect(JSON.parse(init.body)).toEqual([
      "EVAL",
      mod.RATE_LIMIT_LUA_SCRIPT,
      "1",
      "fitgen:rl:v1:generatePlan:uid-123",
      "10",
      "3600000",
    ]);

    expect(mod.buildRateLimitKey("generatePlan", "  uid:a/b c?d  ")).toBe(
      "fitgen:rl:v1:generatePlan:uid%3Aa%2Fb%20c%3Fd"
    );
    fetchImpl.mockResolvedValueOnce(jsonRes({ result: [1, 1, 3_600_000] }));
    await mod.checkRateLimit("uid:a/b c", "generateWeek", { fetchImpl, env: VALID_ENV, now: FIXED_NOW });
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body)[3]).toBe("fitgen:rl:v1:generateWeek:uid%3Aa%2Fb%20c");
  });

  it("returns allowed metadata and builds X-RateLimit-* headers without Retry-After (AC-2)", async () => {
    const mod = getRateLimit();
    const fetchImpl = vi.fn().mockResolvedValueOnce(jsonRes({ result: [1, 3, 2_500_000] }));

    const result = await mod.checkRateLimit("uid-123", "generatePlan", {
      fetchImpl,
      env: VALID_ENV,
      now: FIXED_NOW,
    });
    expect(result).toEqual({
      allowed: true,
      limit: 10,
      remaining: 7,
      count: 3,
      windowSeconds: 3600,
      resetAtEpochSeconds: 1_700_002_500,
    });

    const headers = mod.buildRateLimitHeaders(result);
    expect(headers).toEqual({
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "7",
      "X-RateLimit-Reset": "1700002500",
    });
    expect("Retry-After" in headers).toBe(false);
  });

  it("returns 429 exceeded result, clamps 0ms TTL to 1s, formats wait text, and builds 429 Response (AC-3)", async () => {
    const mod = getRateLimit();
    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ result: [0, 10, 1_842_150] }))
      .mockResolvedValueOnce(jsonRes({ result: [0, 10, 0] }));

    const denied = await mod.checkRateLimit("uid-123", "generatePlan", {
      fetchImpl,
      env: VALID_ENV,
      now: FIXED_NOW,
    });
    expect(denied).toEqual({
      allowed: false,
      status: 429,
      code: "RATE_LIMIT_EXCEEDED",
      limit: 10,
      remaining: 0,
      count: 10,
      windowSeconds: 3600,
      retryAfterSeconds: 1843,
      resetAtEpochSeconds: 1_700_001_843,
    });

    const zeroTtl = await mod.checkRateLimit("uid-123", "generatePlan", {
      fetchImpl,
      env: VALID_ENV,
      now: FIXED_NOW,
    });
    expect(zeroTtl.retryAfterSeconds).toBe(1);

    expect(mod.formatRetryWait(1)).toBe("1 second");
    expect(mod.formatRetryWait(45)).toBe("45 seconds");
    expect(mod.formatRetryWait(60)).toBe("1 minute");
    expect(mod.formatRetryWait(61)).toBe("2 minutes");
    expect(mod.formatRetryWait(1843)).toBe("31 minutes");

    const res = mod.createRateLimitErrorResponse(denied);
    expect(res.status).toBe(429);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    for (const [k, v] of Object.entries(corsHeaders)) expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get("Retry-After")).toBe("1843");
    expect(res.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(res.headers.get("X-RateLimit-Remaining")).toBe("0");
    expect(res.headers.get("X-RateLimit-Reset")).toBe("1700001843");
    await expect(res.json()).resolves.toEqual({
      error: "Too many requests. Please wait 31 minutes before trying again.",
      code: "RATE_LIMIT_EXCEEDED",
      retryAfterSeconds: 1843,
      limit: 10,
      windowSeconds: 3600,
    });
  });
});

describe("api/_rateLimit — config & env overrides (AC-4)", () => {
  it("resolves scope defaults and honors valid env overrides silently", () => {
    const mod = getRateLimit();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(mod.resolveRateLimitConfig("generatePlan", {})).toEqual({
      scope: "generatePlan",
      limit: 10,
      windowSeconds: 3600,
      timeoutMs: 3000,
    });
    expect(mod.resolveRateLimitConfig("generateWeek", { RATE_LIMIT_GENERATE_WEEK_MAX: "   " })).toEqual({
      scope: "generateWeek",
      limit: 20,
      windowSeconds: 3600,
      timeoutMs: 3000,
    });
    expect(
      mod.resolveRateLimitConfig("generatePlan", {
        RATE_LIMIT_GENERATE_PLAN_MAX: "25",
        RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC: "600",
        RATE_LIMIT_TIMEOUT_MS: "5000",
      })
    ).toEqual({ scope: "generatePlan", limit: 25, windowSeconds: 600, timeoutMs: 5000 });
    expect(
      mod.resolveRateLimitConfig("generateWeek", {
        RATE_LIMIT_GENERATE_WEEK_MAX: "40",
        RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC: "120",
      })
    ).toEqual({ scope: "generateWeek", limit: 40, windowSeconds: 120, timeoutMs: 3000 });
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it.each([
    { envName: "RATE_LIMIT_GENERATE_PLAN_MAX", raw: "0", fallback: 10, min: 1, max: 1000 },
    { envName: "RATE_LIMIT_GENERATE_PLAN_MAX", raw: "-5", fallback: 10, min: 1, max: 1000 },
    { envName: "RATE_LIMIT_GENERATE_PLAN_MAX", raw: "abc-secret-val", fallback: 10, min: 1, max: 1000 },
    { envName: "RATE_LIMIT_GENERATE_PLAN_MAX", raw: "2.5", fallback: 10, min: 1, max: 1000 },
    { envName: "RATE_LIMIT_GENERATE_PLAN_MAX", raw: "999999", fallback: 10, min: 1, max: 1000 },
    { envName: "RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC", raw: "5", fallback: 3600, min: 10, max: 86400 },
    { envName: "RATE_LIMIT_TIMEOUT_MS", raw: "50", fallback: 3000, min: 100, max: 10000 },
  ])("falls back safely for invalid $envName=$raw without echoing raw value", ({ envName, raw, fallback, min, max }) => {
    const mod = getRateLimit();
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});

    expect(mod.parsePositiveIntEnv(raw, fallback, { min, max, envName })).toBe(fallback);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    const logged = warnSpy.mock.calls.flat().map(String).join(" ");
    expect(logged).toContain(envName);
    expect(logged).toContain(String(fallback));
    expect(logged.replaceAll(String(fallback), "")).not.toContain(raw);
  });
});

describe("api/_rateLimit — strict fail-closed behavior & secret hygiene (AC-5..AC-8)", () => {
  it.each([
    { label: "missing URL", env: { UPSTASH_REDIS_REST_TOKEN: TEST_TOKEN }, reason: "missing_config" },
    { label: "blank URL", env: { UPSTASH_REDIS_REST_URL: "   ", UPSTASH_REDIS_REST_TOKEN: TEST_TOKEN }, reason: "missing_config" },
    { label: "missing token", env: { UPSTASH_REDIS_REST_URL: TEST_URL }, reason: "missing_config" },
    { label: "blank token", env: { UPSTASH_REDIS_REST_URL: TEST_URL, UPSTASH_REDIS_REST_TOKEN: "  " }, reason: "missing_config" },
    { label: "malformed URL", env: { UPSTASH_REDIS_REST_URL: "not-a-url", UPSTASH_REDIS_REST_TOKEN: TEST_TOKEN }, reason: "invalid_config" },
    { label: "non-HTTP(S) URL", env: { UPSTASH_REDIS_REST_URL: "ftp://redis.test", UPSTASH_REDIS_REST_TOKEN: TEST_TOKEN }, reason: "invalid_config" },
  ])("fails closed with 503 and 0 fetch calls on $label (AC-5)", async ({ env, reason }) => {
    const mod = getRateLimit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn();

    const result = await mod.checkRateLimit("uid-123", "generatePlan", { fetchImpl, env });
    expect(result).toEqual({
      allowed: false,
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      reason,
    });
    expect(fetchImpl).not.toHaveBeenCalled();

    const res = mod.createRateLimitErrorResponse(result);
    expect(res.status).toBe(503);
    for (const [k, v] of Object.entries(corsHeaders)) expect(res.headers.get(k)).toBe(v);
    expect(res.headers.get("Retry-After")).toBeNull();
    expect(res.headers.get("X-RateLimit-Limit")).toBeNull();
    await expect(res.json()).resolves.toEqual({
      error: "Rate limiting service is temporarily unavailable. Please try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    });
  });

  it("fails closed on network error and timeout with timer cleanup (AC-6)", async () => {
    const mod = getRateLimit();
    vi.spyOn(console, "error").mockImplementation(() => {});

    const netFetch = vi.fn().mockRejectedValueOnce(new TypeError("connect ECONNREFUSED"));
    await expect(
      mod.checkRateLimit("uid-123", "generatePlan", { fetchImpl: netFetch, env: VALID_ENV })
    ).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      reason: "network_error",
    });

    vi.useFakeTimers();
    const hangFetch = vi.fn(
      (_url, { signal }) =>
        new Promise((_resolve, reject) => {
          signal.addEventListener("abort", () =>
            reject(Object.assign(new Error("Aborted"), { name: "AbortError" }))
          );
        })
    );
    const pending = mod.checkRateLimit("uid-123", "generatePlan", {
      fetchImpl: hangFetch,
      env: { ...VALID_ENV, RATE_LIMIT_TIMEOUT_MS: "250" },
    });
    await vi.advanceTimersByTimeAsync(250);
    await expect(pending).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      reason: "timeout",
    });
    expect(vi.getTimerCount()).toBe(0);
  });

  it.each([
    { label: "HTTP 401", res: () => jsonRes({ error: "Unauthorized" }, 401), reason: "upstream_http_error" },
    { label: "HTTP 429", res: () => jsonRes({ error: "Upstash quota" }, 429), reason: "upstream_http_error" },
    { label: "HTTP 500", res: () => jsonRes("boom", 500), reason: "upstream_http_error" },
    { label: "HTTP 503", res: () => jsonRes("down", 503), reason: "upstream_http_error" },
    { label: "non-JSON body", res: () => jsonRes("not-json{", 200), reason: "invalid_json" },
    { label: "Upstash error field", res: () => jsonRes({ error: "ERR script failed" }, 200), reason: "invalid_response" },
    { label: "result null", res: () => jsonRes({ result: null }, 200), reason: "invalid_response" },
    { label: "result object", res: () => jsonRes({ result: {} }, 200), reason: "invalid_response" },
    { label: "result string", res: () => jsonRes({ result: "OK" }, 200), reason: "invalid_response" },
    { label: "result length 2", res: () => jsonRes({ result: [1, 2] }, 200), reason: "invalid_response" },
    { label: "invalid flag 2", res: () => jsonRes({ result: [2, 1, 1000] }, 200), reason: "invalid_response" },
    { label: "negative count", res: () => jsonRes({ result: [1, -1, 1000] }, 200), reason: "invalid_response" },
    { label: "negative ttl", res: () => jsonRes({ result: [1, 1, -1] }, 200), reason: "invalid_response" },
    { label: "float count", res: () => jsonRes({ result: [1, 1.5, 1000] }, 200), reason: "invalid_response" },
  ])("fails closed with 503 on $label (AC-6)", async ({ res, reason }) => {
    const mod = getRateLimit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn().mockResolvedValueOnce(res());

    await expect(
      mod.checkRateLimit("uid-123", "generatePlan", { fetchImpl, env: VALID_ENV })
    ).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      reason,
    });
  });

  it.each([
    { label: "empty uid", uid: "", scope: "generatePlan", reason: "invalid_uid" },
    { label: "whitespace uid", uid: "   ", scope: "generatePlan", reason: "invalid_uid" },
    { label: "non-string uid", uid: 42, scope: "generatePlan", reason: "invalid_uid" },
    { label: "prototype scope __proto__", uid: "uid-1", scope: "__proto__", reason: "invalid_scope" },
    { label: "prototype scope constructor", uid: "uid-1", scope: "constructor", reason: "invalid_scope" },
    { label: "unknown scope", uid: "uid-1", scope: "other", reason: "invalid_scope" },
  ])("fails closed with 503 and 0 fetch calls on $label (AC-7)", async ({ uid, scope, reason }) => {
    const mod = getRateLimit();
    vi.spyOn(console, "error").mockImplementation(() => {});
    const fetchImpl = vi.fn();

    if (reason === "invalid_scope") {
      expect(mod.resolveRateLimitConfig(scope, VALID_ENV)).toBeNull();
    }
    await expect(mod.checkRateLimit(uid, scope, { fetchImpl, env: VALID_ENV })).resolves.toEqual({
      allowed: false,
      status: 503,
      code: "RATE_LIMIT_UNAVAILABLE",
      reason,
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("never leaks Upstash credentials or raw upstream errors in logs or response bodies (AC-8)", async () => {
    const mod = getRateLimit();
    const errSpy = vi.spyOn(console, "error").mockImplementation(() => {});
    const warnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
    const rawUpstream = "ERR raw-upstash-detail-secret-xyz";

    const fetchImpl = vi
      .fn()
      .mockResolvedValueOnce(jsonRes({ error: `${rawUpstream} ${TEST_TOKEN}` }, 200))
      .mockRejectedValueOnce(new Error(`failed ${TEST_URL} Bearer ${TEST_TOKEN}`));

    const r1 = await mod.checkRateLimit("uid-123", "generatePlan", { fetchImpl, env: VALID_ENV });
    const r2 = await mod.checkRateLimit("uid-123", "generatePlan", { fetchImpl, env: VALID_ENV });

    const body1 = await mod.createRateLimitErrorResponse(r1).text();
    const body2 = await mod.createRateLimitErrorResponse(r2).text();
    const logged = [...errSpy.mock.calls, ...warnSpy.mock.calls].flat().map(String).join(" ");

    for (const surface of [body1, body2, logged]) {
      expect(surface).not.toContain(TEST_TOKEN);
      expect(surface).not.toContain(TEST_URL);
      expect(surface).not.toContain(rawUpstream);
    }
  });
});

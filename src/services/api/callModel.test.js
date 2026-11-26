import { existsSync, readFileSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import * as callModelModule from "./callModel";

const jsonResponse = (body, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" },
  });

const VALID_PLAN = {
  programName: "Strength Block",
  totalWeeks: 4,
  weeks: [{ weekNumber: 1, schedule: [] }],
};

describe("src/services/api/callModel", () => {
  const originalFetch = globalThis.fetch;
  let fetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    globalThis.fetch = fetchMock;
    vi.spyOn(console, "warn").mockImplementation(() => {});
  });

  afterEach(() => {
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("removes src/utils/extractJsonFromText.js and keeps callModel free of prompt/extraction logic", () => {
    expect(existsSync(new URL("../../utils/extractJsonFromText.js", import.meta.url))).toBe(false);
    const source = readFileSync(new URL("./callModel.js", import.meta.url), "utf8");
    expect(source).not.toContain("extractJsonFromText");
    expect(source).not.toContain("You are an expert fitness coach");
    expect(source).not.toContain("OUTPUT FORMAT");
  });

  it.each([
    ["/api/generatePlan", "", "/api/generatePlan"],
    ["/api/generatePlan", "   ", "/api/generatePlan"],
    ["/api/generatePlan", "/api/callModel", "/api/generatePlan"],
    ["/api/generatePlan", "/api/callModel/", "/api/generatePlan"],
    ["/api/generatePlan", "https://app.example.com", "https://app.example.com/api/generatePlan"],
    ["/api/generatePlan", "https://app.example.com/", "https://app.example.com/api/generatePlan"],
    ["/api/generatePlan", "https://app.example.com/api", "https://app.example.com/api/generatePlan"],
    ["/api/generatePlan", "https://app.example.com/api/", "https://app.example.com/api/generatePlan"],
    ["/api/generateWeek", "https://app.example.com/api/callModel", "https://app.example.com/api/generateWeek"],
    ["/api/generateWeek", "https://app.example.com/API/CALLMODEL/", "https://app.example.com/api/generateWeek"],
  ])("resolveEndpointUrl(%j, %j) -> %j", (endpoint, base, expected) => {
    expect(callModelModule.resolveEndpointUrl).toBeTypeOf("function");
    expect(callModelModule.resolveEndpointUrl(endpoint, base)).toBe(expected);
  });

  it("classifies retryable HTTP statuses strictly (422 and 5xx only)", () => {
    expect(callModelModule.isRetryableStatus).toBeTypeOf("function");
    for (const status of [422, 500, 502, 503, 504]) {
      expect(callModelModule.isRetryableStatus(status)).toBe(true);
    }
    for (const status of [200, 301, 400, 401, 403, 404, 405, 429, null, undefined, "500"]) {
      expect(callModelModule.isRetryableStatus(status)).toBe(false);
    }
  });

  it("posts structured payloads with Bearer auth and unwraps { plan } for initial and next-week endpoints", async () => {
    expect(callModelModule.requestInitialPlan).toBeTypeOf("function");
    expect(callModelModule.requestNextWeekPlan).toBeTypeOf("function");

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ plan: VALID_PLAN }, 200))
      .mockResolvedValueOnce(jsonResponse({ plan: { weeks: [{ weekNumber: 2, schedule: [] }] } }, 200));

    const initialPayload = { goal: "build muscle", weeks: 4 };
    const initialPlan = await callModelModule.requestInitialPlan(initialPayload, "  tok-1  ", { baseUrl: "" });
    expect(initialPlan).toEqual(VALID_PLAN);
    expect(fetchMock).toHaveBeenNthCalledWith(
      1,
      "/api/generatePlan",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok-1" },
        body: JSON.stringify(initialPayload),
        signal: expect.any(AbortSignal),
      })
    );

    const weekPayload = { profile: { goal: "build muscle" }, lastWeek: { weekNumber: 1, schedule: [] } };
    const nextWeekPlan = await callModelModule.requestNextWeekPlan(weekPayload, "tok-2", {
      baseUrl: "https://api.example.com/api/callModel",
    });
    expect(nextWeekPlan).toEqual({ weeks: [{ weekNumber: 2, schedule: [] }] });
    expect(fetchMock).toHaveBeenNthCalledWith(
      2,
      "https://api.example.com/api/generateWeek",
      expect.objectContaining({
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: "Bearer tok-2" },
        body: JSON.stringify(weekPayload),
      })
    );
  });

  it.each(["", "   ", null, undefined])(
    "immediately rejects missing token %j with 401 ApiError and 0 fetch calls",
    async (badToken) => {
      expect(callModelModule.ApiError).toBeTypeOf("function");
      expect(callModelModule.requestInitialPlan).toBeTypeOf("function");

      await expect(
        callModelModule.requestInitialPlan({ goal: "build muscle" }, badToken, { sleep: vi.fn() })
      ).rejects.toMatchObject({
        name: "ApiError",
        status: 401,
        code: "MISSING_TOKEN",
        retryable: false,
      });
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([400, 401, 403, 405, 429])(
    "never retries non-retryable HTTP %i (exactly 1 fetch) and preserves ApiError metadata",
    async (status) => {
      expect(callModelModule.ApiError).toBeTypeOf("function");
      expect(callModelModule.requestInitialPlan).toBeTypeOf("function");
      const sleep = vi.fn(async () => {});

      fetchMock.mockResolvedValueOnce(
        jsonResponse({ error: `Rejected ${status}`, code: `ERR_${status}`, details: ["bad field"] }, status)
      );

      let caught;
      try {
        await callModelModule.requestInitialPlan({ goal: "build muscle" }, "tok-1", { sleep, baseUrl: "" });
      } catch (err) {
        caught = err;
      }

      expect(caught).toBeInstanceOf(callModelModule.ApiError);
      expect(caught).toMatchObject({
        message: `Rejected ${status}`,
        status,
        code: `ERR_${status}`,
        details: ["bad field"],
        retryable: false,
      });
      expect(fetchMock).toHaveBeenCalledTimes(1);
      expect(sleep).not.toHaveBeenCalled();
    }
  );

  it("retries on 422 and 5xx up to 3 attempts with exponential backoff and recovers on 200", async () => {
    expect(callModelModule.requestInitialPlan).toBeTypeOf("function");
    const sleep = vi.fn(async () => {});

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "Invalid AI output", code: "INVALID_AI_OUTPUT" }, 422))
      .mockResolvedValueOnce(jsonResponse({ error: "Upstream error", code: "UPSTREAM_ERROR" }, 503))
      .mockResolvedValueOnce(jsonResponse({ plan: VALID_PLAN }, 200));

    const result = await callModelModule.requestInitialPlan({ goal: "build muscle" }, "tok-1", {
      sleep,
      baseDelayMs: 300,
      baseUrl: "",
    });
    expect(result).toEqual(VALID_PLAN);
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep.mock.calls.map((c) => c[0])).toEqual([300, 600]);
  });

  it("throws retryable ApiError after 3 failed 5xx attempts", async () => {
    expect(callModelModule.ApiError).toBeTypeOf("function");
    expect(callModelModule.requestNextWeekPlan).toBeTypeOf("function");
    const sleep = vi.fn(async () => {});

    fetchMock
      .mockResolvedValueOnce(jsonResponse({ error: "Upstream 1", code: "UPSTREAM_ERROR" }, 502))
      .mockResolvedValueOnce(jsonResponse({ error: "Upstream 2", code: "UPSTREAM_ERROR" }, 500))
      .mockResolvedValueOnce(jsonResponse({ error: "Upstream 3", code: "UPSTREAM_TIMEOUT" }, 504));

    await expect(
      callModelModule.requestNextWeekPlan({ lastWeek: { weekNumber: 1, schedule: [] } }, "tok-1", {
        sleep,
        baseDelayMs: 100,
        baseUrl: "",
      })
    ).rejects.toMatchObject({
      name: "ApiError",
      message: "Upstream 3",
      status: 504,
      code: "UPSTREAM_TIMEOUT",
      retryable: true,
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
    expect(sleep).toHaveBeenCalledTimes(2);
  });

  it("retries network errors, per-attempt timeouts, and malformed 200 envelopes", async () => {
    expect(callModelModule.requestInitialPlan).toBeTypeOf("function");
    const sleep = vi.fn(async () => {});

    // Network error -> AbortError timeout -> recovery
    fetchMock
      .mockRejectedValueOnce(new TypeError("Failed to fetch"))
      .mockImplementationOnce(
        (_url, { signal }) =>
          new Promise((_resolve, reject) => {
            signal.addEventListener("abort", () =>
              reject(Object.assign(new Error("Aborted"), { name: "AbortError" }))
            );
          })
      )
      .mockResolvedValueOnce(jsonResponse({ plan: VALID_PLAN }, 200));

    const recovered = await callModelModule.requestInitialPlan({ goal: "build muscle" }, "tok-1", {
      sleep,
      timeoutMs: 15,
      baseUrl: "",
    });
    expect(recovered).toEqual(VALID_PLAN);
    expect(fetchMock).toHaveBeenCalledTimes(3);

    // Timeout exhaustion -> TIMEOUT ApiError
    fetchMock.mockReset();
    const abortErr = Object.assign(new Error("Aborted"), { name: "AbortError" });
    fetchMock.mockRejectedValue(abortErr);
    await expect(
      callModelModule.requestInitialPlan({ goal: "build muscle" }, "tok-1", {
        maxAttempts: 2,
        sleep,
        baseUrl: "",
      })
    ).rejects.toMatchObject({ name: "ApiError", code: "TIMEOUT", retryable: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    // Malformed 200 envelopes are rejected instead of reaching callers
    for (const badBody of ["not-json{", { error: "server error" }, { plan: {} }, { plan: { weeks: [] } }]) {
      fetchMock.mockReset();
      fetchMock.mockResolvedValue(jsonResponse(badBody, 200));
      await expect(
        callModelModule.requestInitialPlan({ goal: "build muscle" }, "tok-1", {
          maxAttempts: 2,
          sleep,
          baseUrl: "",
        })
      ).rejects.toMatchObject({ name: "ApiError", retryable: true });
      expect(fetchMock).toHaveBeenCalledTimes(2);
    }
  });
});

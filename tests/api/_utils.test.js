import { existsSync } from "node:fs";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  corsHeaders,
  createJsonResponse,
  decodeJwtPayload,
  verifyFirebaseToken,
  withAuth,
} from "../../api/_utils.js";

const toBase64Url = (str) =>
  Buffer.from(str, "utf8").toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

const makeJwt = (payload, header = { alg: "RS256", typ: "JWT" }, sig = "sig_test-123") =>
  `${toBase64Url(JSON.stringify(header))}.${toBase64Url(JSON.stringify(payload))}.${sig}`;

function makeRequest({ method = "POST", headers = {}, body, rawBody } = {}) {
  const init = { method, headers: { ...headers } };
  if (rawBody !== undefined) init.body = rawBody;
  else if (body !== undefined) {
    init.body = JSON.stringify(body);
    if (!("Content-Type" in init.headers)) init.headers["Content-Type"] = "application/json";
  }
  return new Request("https://example.test/api/callModel", init);
}

function expectCors(res) {
  for (const [key, value] of Object.entries(corsHeaders)) expect(res.headers.get(key)).toBe(value);
}

const VALID_TOKEN = makeJwt({ sub: "uid-123", email: "user@example.com", firebase: { sign_in_provider: "password" } });
const INVALID_TOKEN_RES = { valid: false, status: 401, code: "INVALID_TOKEN", error: "Unauthorized: Invalid token" };
const ANON_RES = { valid: false, status: 403, code: "ANONYMOUS_NOT_ALLOWED", error: "Forbidden: Anonymous accounts are not allowed" };
const authedReq = (opts = {}) =>
  makeRequest({ headers: { Authorization: `Bearer ${VALID_TOKEN}` }, body: { a: 1 }, ...opts });

describe("api/_utils cleanup & response helpers", () => {
  it("removes api/debug.js so server model env vars are not exposed", () => {
    expect(existsSync(new URL("../../api/debug.js", import.meta.url))).toBe(false);
  });

  it("exports CORS headers (including exposed rate-limit headers) and builds JSON responses", async () => {
    expect(corsHeaders).toEqual({
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type, Authorization",
      "Access-Control-Expose-Headers":
        "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
    });
    const res = createJsonResponse({ ok: true, count: 2 }, 201);
    expect(res.status).toBe(201);
    expect(res.headers.get("Content-Type")).toBe("application/json");
    expectCors(res);
    await expect(res.json()).resolves.toEqual({ ok: true, count: 2 });

    const withExtra = createJsonResponse({ ok: true }, 200, {
      "X-RateLimit-Limit": "10",
      "X-RateLimit-Remaining": "9",
      "X-RateLimit-Reset": "1700003600",
      "Content-Type": "text/plain",
    });
    expect(withExtra.headers.get("X-RateLimit-Limit")).toBe("10");
    expect(withExtra.headers.get("X-RateLimit-Remaining")).toBe("9");
    expect(withExtra.headers.get("X-RateLimit-Reset")).toBe("1700003600");
    expect(withExtra.headers.get("Content-Type")).toBe("application/json");
    expectCors(withExtra);

    const withBadExtra = createJsonResponse({ ok: true }, 200, ["ignored"]);
    expect(withBadExtra.headers.get("Content-Type")).toBe("application/json");
    expectCors(withBadExtra);
  });
});

describe("decodeJwtPayload", () => {
  it("decodes standard and UTF-8 / base64url (-, _) payloads without padding", () => {
    const payload = { sub: "uid_special??>>", name: "José 🏋️‍♂️", note: ">>>???___---", firebase: { sign_in_provider: "google.com" } };
    const token = makeJwt(payload);
    const seg = token.split(".")[1];
    expect(seg).not.toContain("=");
    expect(seg).toMatch(/[-_]/);
    expect(decodeJwtPayload(token)).toEqual(payload);
  });

  it.each([
    null, undefined, 12345, "", "   ", "two.segments", "a.b.c.d",
    "eyJhbGciOiJSUzI1NiJ9..sig", " eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0.sig",
    "eyJhbGciOiJSUzI1NiJ9.eyJzdWI+OiIxIn0.sig", "eyJhbGciOiJSUzI1NiJ9.eyJzdWIiOiIxIn0=.sig",
    "eyJhbGciOiJSUzI1NiJ9.a.sig",
  ])("returns null for malformed token %j", (input) => {
    expect(decodeJwtPayload(input)).toBeNull();
  });

  it.each(["not-json{", "null", "[1,2,3]", '"hello"', "42", "true"])(
    "returns null when payload decodes to non-object JSON (%s)",
    (rawJson) => {
      const token = `${toBase64Url('{"alg":"RS256"}')}.${toBase64Url(rawJson)}.sig`;
      expect(decodeJwtPayload(token)).toBeNull();
    }
  );
});

describe("verifyFirebaseToken & withAuth", () => {
  const originalApiKey = process.env.VITE_FIREBASE_API_KEY;
  const originalFetch = globalThis.fetch;
  let fetchMock;

  const mockLookup = (body, status = 200) => {
    const raw = typeof body === "string" ? body : JSON.stringify(body);
    fetchMock.mockResolvedValueOnce(new Response(raw, { status, headers: { "Content-Type": "application/json" } }));
  };

  const mockValidUser = (uid = "uid-123", email = "user@example.com", provider = "password") =>
    mockLookup({ users: [{ localId: uid, ...(email ? { email } : {}), providerUserInfo: [{ providerId: provider }] }] });

  beforeEach(() => {
    process.env.VITE_FIREBASE_API_KEY = "test-firebase-api-key";
    fetchMock = vi.fn(async () => new Response(JSON.stringify({ users: [] }), { status: 200 }));
    globalThis.fetch = fetchMock;
  });

  afterEach(() => {
    if (originalApiKey === undefined) delete process.env.VITE_FIREBASE_API_KEY;
    else process.env.VITE_FIREBASE_API_KEY = originalApiKey;
    globalThis.fetch = originalFetch;
    vi.restoreAllMocks();
  });

  it("throws without calling fetch when VITE_FIREBASE_API_KEY is unset", async () => {
    delete process.env.VITE_FIREBASE_API_KEY;
    await expect(verifyFirebaseToken(VALID_TOKEN)).rejects.toThrow("Server configuration error: Missing Firebase API key");
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["not-a-jwt", "", null])("rejects malformed token %j with 401 before fetch", async (badToken) => {
    await expect(verifyFirebaseToken(badToken)).resolves.toEqual(INVALID_TOKEN_RES);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it.each(["anonymous", "ANONYMOUS", "  Anonymous  "])(
    "rejects anonymous sign_in_provider=%j with 403 before fetch",
    async (provider) => {
      const token = makeJwt({ sub: "anon-1", firebase: { sign_in_provider: provider } });
      await expect(verifyFirebaseToken(token)).resolves.toEqual(ANON_RES);
      expect(fetchMock).not.toHaveBeenCalled();
    }
  );

  it.each([
    { sub: "uid-1" },
    { sub: "uid-1", firebase: {} },
    { sub: "uid-1", firebase: { sign_in_provider: "   " } },
    { sub: "uid-1", firebase: { sign_in_provider: 123 } },
  ])("rejects missing/invalid sign_in_provider %j with 401 before fetch", async (payload) => {
    await expect(verifyFirebaseToken(makeJwt(payload))).resolves.toEqual(INVALID_TOKEN_RES);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("verifies password, OAuth, and email-only users via accounts:lookup", async () => {
    mockValidUser("uid-123", "user@example.com", "password");
    const res = await verifyFirebaseToken(VALID_TOKEN);
    expect(fetchMock).toHaveBeenCalledWith(
      "https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=test-firebase-api-key",
      { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ idToken: VALID_TOKEN }) }
    );
    expect(res).toEqual({ valid: true, uid: "uid-123", email: "user@example.com", signInProvider: "password" });

    const oauthToken = makeJwt({ user_id: "uid-oauth", firebase: { sign_in_provider: "google.com" } });
    mockValidUser("uid-oauth", null, "google.com");
    await expect(verifyFirebaseToken(oauthToken)).resolves.toEqual({
      valid: true, uid: "uid-oauth", email: null, signInProvider: "google.com",
    });

    mockLookup({ users: [{ localId: "uid-123", email: "user@example.com", providerUserInfo: [] }] });
    await expect(verifyFirebaseToken(VALID_TOKEN)).resolves.toEqual({
      valid: true, uid: "uid-123", email: "user@example.com", signInProvider: "password",
    });
  });

  it.each([
    { label: "400 error", body: { error: { message: "INVALID_ID_TOKEN" } }, status: 400 },
    { label: "empty users", body: { users: [] }, status: 200 },
    { label: "invalid JSON", body: "not-json", status: 200 },
    { label: "missing localId", body: { users: [{ providerUserInfo: [{ providerId: "password" }] }] }, status: 200 },
    { label: "empty localId", body: { users: [{ localId: "", providerUserInfo: [{ providerId: "password" }] }] }, status: 200 },
    { label: "mismatched localId", body: { users: [{ localId: "uid-other", providerUserInfo: [{ providerId: "password" }] }] }, status: 200 },
  ])("returns 401 INVALID_TOKEN when accounts:lookup returns $label", async ({ body, status }) => {
    mockLookup(body, status);
    await expect(verifyFirebaseToken(VALID_TOKEN)).resolves.toEqual(INVALID_TOKEN_RES);
  });

  it.each([500, 503])("throws retryable error on accounts:lookup %i", async (status) => {
    mockLookup("upstream error", status);
    await expect(verifyFirebaseToken(VALID_TOKEN)).rejects.toThrow("Auth verification service unavailable");
  });

  it("returns 403 for disabled or provider-less/anonymous lookup records", async () => {
    mockLookup({ users: [{ localId: "uid-123", disabled: true, providerUserInfo: [{ providerId: "password" }] }] });
    await expect(verifyFirebaseToken(VALID_TOKEN)).resolves.toEqual({
      valid: false, status: 403, code: "USER_DISABLED", error: "Forbidden: Account is disabled",
    });

    for (const userRecord of [
      { localId: "uid-123", providerUserInfo: [] },
      { localId: "uid-123" },
      { localId: "uid-123", providerUserInfo: [{ providerId: "anonymous" }] },
    ]) {
      mockLookup({ users: [userRecord] });
      await expect(verifyFirebaseToken(VALID_TOKEN)).resolves.toEqual(ANON_RES);
    }
  });

  it("withAuth handles OPTIONS, non-POST (405 + CORS), auth rejections, and invalid JSON bodies", async () => {
    const handler = vi.fn();
    const wrapped = withAuth(handler);

    const preflight = await wrapped(makeRequest({ method: "OPTIONS" }));
    expect(preflight.status).toBe(200);
    expectCors(preflight);

    for (const method of ["GET", "PUT", "DELETE"]) {
      const res = await wrapped(makeRequest({ method }));
      expect(res.status).toBe(405);
      expectCors(res);
      await expect(res.json()).resolves.toEqual({ error: "Method not allowed" });
    }

    for (const headers of [{}, { Authorization: "Basic dXNlcjpwYXNz" }, { Authorization: "Bearer   " }]) {
      const res = await wrapped(makeRequest({ headers, body: { a: 1 } }));
      expect(res.status).toBe(401);
      await expect(res.json()).resolves.toEqual({ error: "Missing authorization header" });
    }

    const badRes = await wrapped(authedReq({ headers: { Authorization: "Bearer bad-token" } }));
    expect(badRes.status).toBe(401);
    await expect(badRes.json()).resolves.toEqual({ error: "Unauthorized: Invalid token" });

    const anonToken = makeJwt({ sub: "anon-1", firebase: { sign_in_provider: "anonymous" } });
    const anonRes = await wrapped(authedReq({ headers: { Authorization: `Bearer ${anonToken}` } }));
    expect(anonRes.status).toBe(403);
    await expect(anonRes.json()).resolves.toEqual({ error: "Forbidden: Anonymous accounts are not allowed" });

    mockLookup({ users: [{ localId: "uid-123", disabled: true, providerUserInfo: [{ providerId: "password" }] }] });
    const disRes = await wrapped(authedReq());
    expect(disRes.status).toBe(403);
    await expect(disRes.json()).resolves.toEqual({ error: "Forbidden: Account is disabled" });

    for (const rawBody of ["{bad json", "null", "[1, 2]", '"str"', "42", "true"]) {
      mockValidUser();
      const res = await wrapped(authedReq({ rawBody }));
      expect(res.status).toBe(400);
      await expect(res.json()).resolves.toEqual({ error: "Invalid JSON body" });
    }
    expect(handler).not.toHaveBeenCalled();
  });

  it("withAuth invokes handler(body, auth) for Bearer/bearer and maps failures to 500 + CORS", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});

    for (const scheme of ["Bearer", "bearer"]) {
      mockValidUser("uid-123", "user@example.com", "password");
      const handler = vi.fn(async (body, auth) => createJsonResponse({ body, auth }, 200));
      const res = await withAuth(handler)(
        authedReq({ headers: { Authorization: `${scheme} ${VALID_TOKEN}` }, body: { prompt: "hi" } })
      );
      expect(res.status).toBe(200);
      expect(handler).toHaveBeenCalledWith(
        { prompt: "hi" },
        { uid: "uid-123", email: "user@example.com", signInProvider: "password" }
      );
    }

    const failureCases = [
      {
        setup: () => delete process.env.VITE_FIREBASE_API_KEY,
        cleanup: () => { process.env.VITE_FIREBASE_API_KEY = "test-firebase-api-key"; },
        handler: vi.fn(),
        expectedError: "Server configuration error: Missing Firebase API key",
      },
      { setup: () => mockLookup("Service Unavailable", 503), handler: vi.fn(), expectedError: "Auth verification service unavailable" },
      { setup: () => fetchMock.mockRejectedValueOnce(new Error("Network failure")), handler: vi.fn(), expectedError: "Network failure" },
      { setup: () => mockValidUser(), handler: async () => { throw new Error("Upstream model failed"); }, expectedError: "Upstream model failed" },
      { setup: () => mockValidUser(), handler: async () => { throw "non-error"; }, expectedError: "Internal server error" },
    ];

    for (const { setup, cleanup, handler, expectedError } of failureCases) {
      setup();
      const res = await withAuth(handler)(authedReq());
      cleanup?.();
      expect(res.status).toBe(500);
      expectCors(res);
      await expect(res.json()).resolves.toEqual({ error: expectedError });
    }
  });
});

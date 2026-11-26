import { createJsonResponse } from "./_utils.js";

export const RATE_LIMIT_KEY_PREFIX = "fitgen:rl:v1";
export const DEFAULT_RATE_LIMIT_TIMEOUT_MS = 3000;

export const RATE_LIMIT_POLICIES = Object.freeze({
  generatePlan: Object.freeze({
    scope: "generatePlan",
    maxEnvVar: "RATE_LIMIT_GENERATE_PLAN_MAX",
    windowSecEnvVar: "RATE_LIMIT_GENERATE_PLAN_WINDOW_SEC",
    defaultMax: 10,
    defaultWindowSeconds: 3600,
  }),
  generateWeek: Object.freeze({
    scope: "generateWeek",
    maxEnvVar: "RATE_LIMIT_GENERATE_WEEK_MAX",
    windowSecEnvVar: "RATE_LIMIT_GENERATE_WEEK_WINDOW_SEC",
    defaultMax: 20,
    defaultWindowSeconds: 3600,
  }),
});

export const RATE_LIMIT_LUA_SCRIPT = [
  "local limit = tonumber(ARGV[1])",
  "local windowMs = tonumber(ARGV[2])",
  'local current = tonumber(redis.call("GET", KEYS[1])) or 0',
  "if current >= limit then",
  '  local pttl = redis.call("PTTL", KEYS[1])',
  "  if pttl < 0 then",
  '    redis.call("PEXPIRE", KEYS[1], windowMs)',
  "    pttl = windowMs",
  "  end",
  "  return {0, current, pttl}",
  "end",
  'current = redis.call("INCR", KEYS[1])',
  'local pttl = redis.call("PTTL", KEYS[1])',
  "if current == 1 or pttl < 0 then",
  '  redis.call("PEXPIRE", KEYS[1], windowMs)',
  "  pttl = windowMs",
  "end",
  "return {1, current, pttl}",
].join("\n");

const LIMIT_MIN = 1;
const LIMIT_MAX = 1000;
const WINDOW_SEC_MIN = 10;
const WINDOW_SEC_MAX = 86400;
const TIMEOUT_MS_MIN = 100;
const TIMEOUT_MS_MAX = 10000;

/**
 * Parses a positive base-10 integer environment variable within bounds.
 * Returns fallback silently for unset/blank values, or logs a sanitized warning
 * (never echoing the raw value) when invalid or out of range.
 *
 * @param {unknown} rawValue
 * @param {number} fallback
 * @param {{ min?: number, max?: number, envName?: string }} [options]
 * @returns {number}
 */
export function parsePositiveIntEnv(
  rawValue,
  fallback,
  { min = 1, max = Number.MAX_SAFE_INTEGER, envName } = {}
) {
  if (rawValue === undefined || rawValue === null) {
    return fallback;
  }

  if (typeof rawValue === "string") {
    const trimmed = rawValue.trim();
    if (trimmed.length === 0) {
      return fallback;
    }

    if (/^\d+$/.test(trimmed)) {
      const parsed = Number.parseInt(trimmed, 10);
      if (Number.isSafeInteger(parsed) && parsed >= min && parsed <= max) {
        return parsed;
      }
    }
  }

  const label = envName || "rate limit environment variable";
  console.warn(`Invalid ${label}; falling back to default ${fallback}`);
  return fallback;
}

/**
 * Resolves rate-limit policy and timeout configuration for a known endpoint scope.
 *
 * @param {string} scope
 * @param {Record<string, string | undefined>} [env=process.env]
 * @returns {{ scope: string, limit: number, windowSeconds: number, timeoutMs: number } | null}
 */
export function resolveRateLimitConfig(scope, env = process.env) {
  if (typeof scope !== "string" || !Object.hasOwn(RATE_LIMIT_POLICIES, scope)) {
    return null;
  }

  const safeEnv = env && typeof env === "object" ? env : {};
  const policy = RATE_LIMIT_POLICIES[scope];

  const limit = parsePositiveIntEnv(
    safeEnv[policy.maxEnvVar],
    policy.defaultMax,
    {
      min: LIMIT_MIN,
      max: LIMIT_MAX,
      envName: policy.maxEnvVar,
    }
  );

  const windowSeconds = parsePositiveIntEnv(
    safeEnv[policy.windowSecEnvVar],
    policy.defaultWindowSeconds,
    {
      min: WINDOW_SEC_MIN,
      max: WINDOW_SEC_MAX,
      envName: policy.windowSecEnvVar,
    }
  );

  const timeoutMs = parsePositiveIntEnv(
    safeEnv.RATE_LIMIT_TIMEOUT_MS,
    DEFAULT_RATE_LIMIT_TIMEOUT_MS,
    {
      min: TIMEOUT_MS_MIN,
      max: TIMEOUT_MS_MAX,
      envName: "RATE_LIMIT_TIMEOUT_MS",
    }
  );

  return {
    scope: policy.scope,
    limit,
    windowSeconds,
    timeoutMs,
  };
}

/**
 * Builds the namespaced Redis key for a verified user and endpoint scope.
 *
 * @param {string} scope
 * @param {string} uid
 * @returns {string}
 */
export function buildRateLimitKey(scope, uid) {
  return `${RATE_LIMIT_KEY_PREFIX}:${scope}:${encodeURIComponent(uid.trim())}`;
}

/**
 * Formats retry wait seconds into human-readable seconds or minutes.
 *
 * @param {number} retryAfterSeconds
 * @returns {string}
 */
export function formatRetryWait(retryAfterSeconds) {
  if (retryAfterSeconds < 60) {
    return retryAfterSeconds === 1
      ? "1 second"
      : `${retryAfterSeconds} seconds`;
  }
  const mins = Math.ceil(retryAfterSeconds / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

/**
 * Builds standard rate-limit response headers from a rate-limit decision.
 *
 * @param {{ allowed: boolean, limit: number, remaining: number, resetAtEpochSeconds: number, retryAfterSeconds?: number }} result
 * @returns {Record<string, string>}
 */
export function buildRateLimitHeaders(result) {
  return {
    "X-RateLimit-Limit": String(result.limit),
    "X-RateLimit-Remaining": String(result.remaining),
    "X-RateLimit-Reset": String(result.resetAtEpochSeconds),
    ...(!result.allowed && Number.isInteger(result.retryAfterSeconds)
      ? { "Retry-After": String(result.retryAfterSeconds) }
      : {}),
  };
}

/**
 * Creates a standardized 429 or 503 JSON Response for a denied or unavailable rate-limit result.
 *
 * @param {object} result
 * @returns {Response}
 */
export function createRateLimitErrorResponse(result) {
  if (result?.status === 429) {
    const waitText = formatRetryWait(result.retryAfterSeconds);
    return createJsonResponse(
      {
        error: `Too many requests. Please wait ${waitText} before trying again.`,
        code: "RATE_LIMIT_EXCEEDED",
        retryAfterSeconds: result.retryAfterSeconds,
        limit: result.limit,
        windowSeconds: result.windowSeconds,
      },
      429,
      buildRateLimitHeaders(result)
    );
  }

  return createJsonResponse(
    {
      error:
        "Rate limiting service is temporarily unavailable. Please try again shortly.",
      code: "RATE_LIMIT_UNAVAILABLE",
    },
    503
  );
}

function buildUnavailableResult(scopeLabel, reason, detail = "") {
  const suffix = detail ? ` (${detail})` : "";
  console.error(
    `Rate limit check failed closed for scope "${scopeLabel}": ${reason}${suffix}`
  );
  return {
    allowed: false,
    status: 503,
    code: "RATE_LIMIT_UNAVAILABLE",
    reason,
  };
}

/**
 * Enforces an atomic per-user fixed-window rate limit via Upstash Redis REST EVAL.
 * Strictly fails closed (503 RATE_LIMIT_UNAVAILABLE) on any config, network,
 * timeout, HTTP, or protocol error.
 *
 * @param {string} uid
 * @param {string} scope
 * @param {{ fetchImpl?: typeof fetch, env?: Record<string, string | undefined>, now?: () => number }} [options]
 * @returns {Promise<
 *   | { allowed: true, limit: number, remaining: number, count: number, windowSeconds: number, resetAtEpochSeconds: number }
 *   | { allowed: false, status: 429, code: "RATE_LIMIT_EXCEEDED", limit: number, remaining: 0, count: number, windowSeconds: number, retryAfterSeconds: number, resetAtEpochSeconds: number }
 *   | { allowed: false, status: 503, code: "RATE_LIMIT_UNAVAILABLE", reason: string }
 * >}
 */
export async function checkRateLimit(uid, scope, options = {}) {
  const {
    fetchImpl = globalThis.fetch,
    env = process.env,
    now = Date.now,
  } = options;

  const safeScopeLabel = typeof scope === "string" ? scope : "unknown";

  if (typeof uid !== "string" || uid.trim().length === 0) {
    return buildUnavailableResult(safeScopeLabel, "invalid_uid");
  }

  const safeEnv = env && typeof env === "object" ? env : {};
  const config = resolveRateLimitConfig(scope, safeEnv);
  if (!config) {
    return buildUnavailableResult(safeScopeLabel, "invalid_scope");
  }

  const rawUrl =
    typeof safeEnv.UPSTASH_REDIS_REST_URL === "string"
      ? safeEnv.UPSTASH_REDIS_REST_URL.trim()
      : "";
  const token =
    typeof safeEnv.UPSTASH_REDIS_REST_TOKEN === "string"
      ? safeEnv.UPSTASH_REDIS_REST_TOKEN.trim()
      : "";

  if (!rawUrl || !token) {
    return buildUnavailableResult(config.scope, "missing_config");
  }

  let parsedUrl;
  try {
    parsedUrl = new URL(rawUrl);
  } catch {
    return buildUnavailableResult(config.scope, "invalid_config");
  }

  if (parsedUrl.protocol !== "https:" && parsedUrl.protocol !== "http:") {
    return buildUnavailableResult(config.scope, "invalid_config");
  }

  if (typeof fetchImpl !== "function") {
    return buildUnavailableResult(config.scope, "network_error");
  }

  const endpointUrl = rawUrl.replace(/\/+$/, "");
  const key = buildRateLimitKey(config.scope, uid);
  const windowMs = config.windowSeconds * 1000;

  const controller = new AbortController();
  const timerId = setTimeout(() => controller.abort(), config.timeoutMs);

  let data;
  try {
    let response;
    try {
      response = await fetchImpl(endpointUrl, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify([
          "EVAL",
          RATE_LIMIT_LUA_SCRIPT,
          "1",
          key,
          String(config.limit),
          String(windowMs),
        ]),
        signal: controller.signal,
      });
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return buildUnavailableResult(config.scope, "timeout");
      }
      return buildUnavailableResult(config.scope, "network_error");
    }

    if (!response.ok) {
      return buildUnavailableResult(
        config.scope,
        "upstream_http_error",
        `HTTP ${response.status}`
      );
    }

    try {
      data = await response.json();
    } catch (err) {
      if (err?.name === "AbortError" || controller.signal.aborted) {
        return buildUnavailableResult(config.scope, "timeout");
      }
      return buildUnavailableResult(config.scope, "invalid_json");
    }
  } finally {
    clearTimeout(timerId);
  }

  if (data === null || typeof data !== "object" || Array.isArray(data)) {
    return buildUnavailableResult(config.scope, "invalid_response");
  }

  if ("error" in data && data.error !== null && data.error !== undefined) {
    return buildUnavailableResult(config.scope, "invalid_response");
  }

  if (!Array.isArray(data.result) || data.result.length !== 3) {
    return buildUnavailableResult(config.scope, "invalid_response");
  }

  const [allowedFlag, count, ttlMs] = data.result;
  if (
    (allowedFlag !== 0 && allowedFlag !== 1) ||
    !Number.isSafeInteger(count) ||
    count < 0 ||
    !Number.isSafeInteger(ttlMs) ||
    ttlMs < 0
  ) {
    return buildUnavailableResult(config.scope, "invalid_response");
  }

  const retryAfterSeconds = Math.max(1, Math.ceil(ttlMs / 1000));
  const resetAtEpochSeconds = Math.ceil((now() + ttlMs) / 1000);
  const remaining =
    allowedFlag === 1 ? Math.max(0, config.limit - count) : 0;

  if (allowedFlag === 1) {
    return {
      allowed: true,
      limit: config.limit,
      remaining,
      count,
      windowSeconds: config.windowSeconds,
      resetAtEpochSeconds,
    };
  }

  return {
    allowed: false,
    status: 429,
    code: "RATE_LIMIT_EXCEEDED",
    limit: config.limit,
    remaining: 0,
    count,
    windowSeconds: config.windowSeconds,
    retryAfterSeconds,
    resetAtEpochSeconds,
  };
}

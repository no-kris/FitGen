export class ApiError extends Error {
  constructor(
    message,
    {
      status = null,
      code = null,
      details = null,
      retryable = false,
      retryAfterSeconds = null,
    } = {}
  ) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
    this.retryable = retryable;
    this.retryAfterSeconds = retryAfterSeconds;
  }
}

export function parseRetryAfterSeconds(headerValue, nowMs = Date.now()) {
  if (typeof headerValue !== "string") {
    return null;
  }

  const trimmed = headerValue.trim();
  if (trimmed.length === 0) {
    return null;
  }

  if (/^\d+$/.test(trimmed)) {
    const parsed = Number.parseInt(trimmed, 10);
    return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
  }

  if (/^[+-]?\d+(?:\.\d+)?$/.test(trimmed)) {
    return null;
  }

  const timestampMs = Date.parse(trimmed);
  if (Number.isFinite(timestampMs)) {
    const deltaSeconds = Math.ceil((timestampMs - nowMs) / 1000);
    return deltaSeconds >= 1 ? deltaSeconds : null;
  }

  return null;
}

export function isRetryableStatus(status) {
  return (
    typeof status === "number" &&
    (status === 422 || (status >= 500 && status < 600))
  );
}

export function isRetryableResponse(status, code = null) {
  if (code === "RATE_LIMIT_UNAVAILABLE") {
    return false;
  }
  return isRetryableStatus(status);
}

function formatRetryWait(retryAfterSeconds) {
  if (retryAfterSeconds < 60) {
    return retryAfterSeconds === 1
      ? "1 second"
      : `${retryAfterSeconds} seconds`;
  }
  const mins = Math.ceil(retryAfterSeconds / 60);
  return mins === 1 ? "1 minute" : `${mins} minutes`;
}

export function resolveEndpointUrl(
  endpointPath,
  configuredBase = import.meta.env.VITE_API_BASE_URL ||
    import.meta.env.VITE_BACKEND_URL ||
    ""
) {
  let normalizedPath = String(endpointPath || "").trim();
  if (!normalizedPath.startsWith("/")) {
    normalizedPath = `/${normalizedPath}`;
  }
  if (!normalizedPath.startsWith("/api/")) {
    normalizedPath = `/api${normalizedPath}`;
  }

  if (typeof configuredBase !== "string" || configuredBase.trim() === "") {
    return normalizedPath;
  }

  let base = configuredBase.trim().replace(/\/+$/, "");
  if (/\/api\/callmodel$/i.test(base)) {
    base = base.replace(/\/api\/callmodel$/i, "");
  } else if (/\/api$/i.test(base)) {
    base = base.replace(/\/api$/i, "");
  }
  base = base.replace(/\/+$/, "");

  return `${base}${normalizedPath}`;
}

function defaultSleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isValidPlanEnvelope(plan) {
  return (
    plan !== null &&
    typeof plan === "object" &&
    !Array.isArray(plan) &&
    Array.isArray(plan.weeks) &&
    plan.weeks.length > 0
  );
}

export async function requestAiEndpoint(
  endpointPath,
  payload,
  token,
  options = {}
) {
  const {
    maxAttempts = 3,
    baseDelayMs = 300,
    timeoutMs = 30000,
    sleep = defaultSleep,
    baseUrl,
  } = options;

  if (typeof token !== "string" || token.trim().length === 0) {
    throw new ApiError("Missing authorization token", {
      status: 401,
      code: "MISSING_TOKEN",
      retryable: false,
    });
  }

  const trimmedToken = token.trim();
  const url =
    baseUrl !== undefined
      ? resolveEndpointUrl(endpointPath, baseUrl)
      : resolveEndpointUrl(endpointPath);

  let lastError = null;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      try {
        const response = await fetch(url, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${trimmedToken}`,
          },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (!response.ok) {
          let errData = null;
          try {
            errData = await response.json();
          } catch {
            // Non-JSON error body; fall back to default error message.
          }

          const code =
            errData?.code ??
            (response.status === 429 ? "RATE_LIMIT_EXCEEDED" : null);
          const retryAfterSeconds =
            typeof errData?.retryAfterSeconds === "number" &&
            Number.isSafeInteger(errData.retryAfterSeconds) &&
            errData.retryAfterSeconds >= 1
              ? errData.retryAfterSeconds
              : parseRetryAfterSeconds(response.headers?.get?.("Retry-After"));

          let message;
          if (
            typeof errData?.error === "string" &&
            errData.error.trim().length > 0
          ) {
            message = errData.error;
          } else if (response.status === 429) {
            message =
              retryAfterSeconds !== null
                ? `Too many requests. Please wait ${formatRetryWait(retryAfterSeconds)} before trying again.`
                : "Too many requests. Please try again shortly.";
          } else {
            message = "Failed to call backend API";
          }

          throw new ApiError(message, {
            status: response.status,
            code,
            details: errData?.details ?? null,
            retryable: isRetryableResponse(response.status, code),
            retryAfterSeconds,
          });
        }

        let data;
        try {
          data = await response.json();
        } catch {
          throw new ApiError("Invalid JSON response from server", {
            status: 502,
            code: "INVALID_RESPONSE",
            retryable: true,
          });
        }

        if (data?.error) {
          throw new ApiError(String(data.error), {
            status: 500,
            code: data?.code ?? null,
            retryable: true,
          });
        }

        if (!isValidPlanEnvelope(data?.plan)) {
          throw new ApiError("Invalid plan response from server", {
            status: 502,
            code: "INVALID_RESPONSE",
            retryable: true,
          });
        }

        return data.plan;
      } finally {
        clearTimeout(timerId);
      }
    } catch (error) {
      if (error instanceof ApiError && !error.retryable) {
        throw error;
      }

      let normalizedError;
      if (error instanceof ApiError) {
        normalizedError = error;
      } else if (error?.name === "AbortError" || controller.signal.aborted) {
        normalizedError = new ApiError("Request timed out. Please try again.", {
          status: null,
          code: "TIMEOUT",
          retryable: true,
        });
      } else {
        normalizedError = new ApiError(error?.message || "Network error", {
          status: null,
          code: "NETWORK_ERROR",
          retryable: true,
        });
      }

      lastError = normalizedError;
      console.warn(`Attempt ${attempt + 1} failed:`, normalizedError.message);

      if (attempt < maxAttempts - 1) {
        const delayMs = baseDelayMs * Math.pow(2, attempt);
        if (delayMs > 0) {
          await sleep(delayMs);
        }
      }
    }
  }

  throw lastError;
}

export function requestInitialPlan(profileData, token, options) {
  return requestAiEndpoint("/api/generatePlan", profileData, token, options);
}

export function requestNextWeekPlan(payload, token, options) {
  return requestAiEndpoint("/api/generateWeek", payload, token, options);
}

export default requestAiEndpoint;

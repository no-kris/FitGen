// CORS headers for Capacitor (Mobile) and Localhost (Dev)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
  "Access-Control-Expose-Headers":
    "Retry-After, X-RateLimit-Limit, X-RateLimit-Remaining, X-RateLimit-Reset",
};

const BASE64URL_SEGMENT_PATTERN = /^[A-Za-z0-9_-]+$/;

const INVALID_TOKEN_RESULT = {
  valid: false,
  status: 401,
  code: "INVALID_TOKEN",
  error: "Unauthorized: Invalid token",
};

const ANONYMOUS_NOT_ALLOWED_RESULT = {
  valid: false,
  status: 403,
  code: "ANONYMOUS_NOT_ALLOWED",
  error: "Forbidden: Anonymous accounts are not allowed",
};

const USER_DISABLED_RESULT = {
  valid: false,
  status: 403,
  code: "USER_DISABLED",
  error: "Forbidden: Account is disabled",
};

/**
 * Creates a standard JSON Response object with the appropriate CORS headers.
 * @param {any} body - The data to be sent in the response body (will be stringified).
 * @param {number} status - The HTTP status code (e.g., 200, 400, 500).
 * @param {Record<string, string>} [extraHeaders={}] - Optional additional response headers.
 * @returns {Response} A standard Web API Response object.
 */
export function createJsonResponse(body, status, extraHeaders = {}) {
  const safeExtra =
    extraHeaders &&
    typeof extraHeaders === "object" &&
    !Array.isArray(extraHeaders)
      ? extraHeaders
      : {};
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...corsHeaders,
      ...safeExtra,
      "Content-Type": "application/json",
    },
  });
}

/**
 * Decodes the payload segment of a JWT using Web Standard APIs only (Edge-safe).
 * Does not verify cryptographic signatures; Firebase accounts:lookup performs signature verification.
 *
 * @param {unknown} token
 * @returns {Record<string, unknown> | null}
 */
export function decodeJwtPayload(token) {
  if (typeof token !== "string" || token.length === 0 || /\s/.test(token)) {
    return null;
  }

  const segments = token.split(".");
  if (segments.length !== 3) {
    return null;
  }

  for (const segment of segments) {
    if (!BASE64URL_SEGMENT_PATTERN.test(segment)) {
      return null;
    }
  }

  const payloadSegment = segments[1];
  if (payloadSegment.length % 4 === 1) {
    return null;
  }

  const base64 = payloadSegment.replace(/-/g, "+").replace(/_/g, "/");
  const padLength = (4 - (base64.length % 4)) % 4;
  const padded = base64 + "=".repeat(padLength);

  try {
    const binary = atob(padded);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i += 1) {
      bytes[i] = binary.charCodeAt(i);
    }
    const decoded = new TextDecoder().decode(bytes);
    const parsed = JSON.parse(decoded);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Verifies a Firebase ID token using the Firebase Auth REST API and enforces
 * non-anonymous, active account policy.
 *
 * @param {unknown} token
 * @returns {Promise<
 *   | { valid: true, uid: string, email: string | null, signInProvider: string }
 *   | { valid: false, status: number, code: string, error: string }
 * >}
 */
export async function verifyFirebaseToken(token) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey) {
    throw new Error("Server configuration error: Missing Firebase API key");
  }

  const payload = decodeJwtPayload(token);
  if (!payload) {
    return { ...INVALID_TOKEN_RESULT };
  }

  const rawProvider = payload?.firebase?.sign_in_provider;
  if (
    typeof rawProvider === "string" &&
    rawProvider.trim().toLowerCase() === "anonymous"
  ) {
    return { ...ANONYMOUS_NOT_ALLOWED_RESULT };
  }

  if (typeof rawProvider !== "string" || rawProvider.trim().length === 0) {
    return { ...INVALID_TOKEN_RESULT };
  }

  const signInProvider = rawProvider.trim();

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (response.status >= 500) {
    throw new Error("Auth verification service unavailable");
  }

  if (!response.ok) {
    return { ...INVALID_TOKEN_RESULT };
  }

  let data;
  try {
    data = await response.json();
  } catch {
    return { ...INVALID_TOKEN_RESULT };
  }

  if (!Array.isArray(data?.users) || data.users.length === 0) {
    return { ...INVALID_TOKEN_RESULT };
  }

  const user = data.users[0];
  if (!user || typeof user.localId !== "string" || user.localId.length === 0) {
    return { ...INVALID_TOKEN_RESULT };
  }

  const tokenUid =
    typeof payload.sub === "string" && payload.sub.length > 0
      ? payload.sub
      : typeof payload.user_id === "string" && payload.user_id.length > 0
        ? payload.user_id
        : null;

  if (tokenUid && tokenUid !== user.localId) {
    return { ...INVALID_TOKEN_RESULT };
  }

  if (user.disabled === true) {
    return { ...USER_DISABLED_RESULT };
  }

  const hasLinkedProvider =
    Array.isArray(user.providerUserInfo) &&
    user.providerUserInfo.some(
      (provider) =>
        provider &&
        typeof provider.providerId === "string" &&
        provider.providerId.trim().length > 0 &&
        provider.providerId.trim().toLowerCase() !== "anonymous"
    );
  const hasEmail =
    typeof user.email === "string" && user.email.trim().length > 0;

  if (!hasLinkedProvider && !hasEmail) {
    return { ...ANONYMOUS_NOT_ALLOWED_RESULT };
  }

  return {
    valid: true,
    uid: user.localId,
    email: typeof user.email === "string" ? user.email : null,
    signInProvider,
  };
}

/**
 * Higher-order wrapper that handles CORS, Method checking,
 * Token Verification, JSON body validation, and Error Handling.
 *
 * @param {Function} handler - The specific logic function to run.
 */
export function withAuth(handler) {
  return async function (req) {
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 200, headers: corsHeaders });
    }

    // Enforce POST
    if (req.method !== "POST") {
      return createJsonResponse({ error: "Method not allowed" }, 405);
    }

    try {
      // Verify Authorization
      const authHeader = req.headers.get("Authorization");
      const match = authHeader?.match(/^Bearer\s+(.+)$/i);
      const idToken = match ? match[1].trim() : "";

      if (!idToken) {
        return createJsonResponse(
          { error: "Missing authorization header" },
          401
        );
      }

      const authResult = await verifyFirebaseToken(idToken);
      if (!authResult.valid) {
        return createJsonResponse(
          { error: authResult.error },
          authResult.status
        );
      }

      // Parse JSON body safely
      let body;
      try {
        body = await req.json();
      } catch {
        return createJsonResponse({ error: "Invalid JSON body" }, 400);
      }

      if (!body || typeof body !== "object" || Array.isArray(body)) {
        return createJsonResponse({ error: "Invalid JSON body" }, 400);
      }

      return await handler(body, {
        uid: authResult.uid,
        email: authResult.email,
        signInProvider: authResult.signInProvider,
      });
    } catch (error) {
      console.error("Server Error:", error);
      const errorMessage =
        error instanceof Error && error.message
          ? error.message
          : "Internal server error";
      return createJsonResponse({ error: errorMessage }, 500);
    }
  };
}

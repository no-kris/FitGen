// CORS headers for Capacitor (Mobile) and Localhost (Dev)
export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization",
};

/**
 * Creates a standard JSON Response object with the appropriate CORS headers.
 * @param {any} body - The data to be sent in the response body (will be stringified).
 * @param {number} status - The HTTP status code (e.g., 200, 400, 500).
 * @returns {Response} A standard Web API Response object.
 */
export function createJsonResponse(body, status) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

/**
 * Verifies a Firebase ID token using the Firebase Auth REST API.
 */
export async function verifyFirebaseToken(token) {
  const apiKey = process.env.VITE_FIREBASE_API_KEY;
  if (!apiKey)
    throw new Error("Server configuration error: Missing Firebase API key");

  const response = await fetch(
    `https://identitytoolkit.googleapis.com/v1/accounts:lookup?key=${apiKey}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ idToken: token }),
    }
  );

  if (!response.ok) {
    return false;
  }

  const data = await response.json();
  // If we get user data back, the token is valid
  return data.users && data.users.length > 0;
}

/**
 * Higher-order wrapper that handles CORS, Method checking,
 * Token Verification, and Error Handling.
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
      if (!authHeader || !authHeader.startsWith("Bearer ")) {
        return createJsonResponse(
          { error: "Missing authorization header" },
          401
        );
      }

      const idToken = authHeader.split("Bearer ")[1];
      const isValid = await verifyFirebaseToken(idToken);
      if (!isValid) {
        return createJsonResponse(
          { error: "Unauthorized: Invalid token" },
          401
        );
      }

      // Parse JSON body safely
      let body;
      try {
        body = await req.json();
      } catch {
        return createJsonResponse({ error: "Invalid JSON body" }, 400);
      }

      return await handler(body);
    } catch (error) {
      console.error("Server Error:", error);
      const errorMessage =
        error instanceof Error ? error.message : "Internal server error";
      return createJsonResponse({ error: errorMessage }, 500);
    }
  };
}

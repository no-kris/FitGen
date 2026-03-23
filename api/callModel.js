import { withAuth, createJsonResponse } from "./_utils.js";

export const config = {
  runtime: "edge",
};

/**
 * Handles the actual communication with the OpenRouter AI model.
 *
 * @param {string} prompt - The user's input prompt for the AI.
 * @returns {Promise<string>} The generated text response from the AI.
 * @throws {Error} If the API key is missing, the fetch fails, or the response is invalid.
 */
async function fetchAIResponse(prompt) {
  const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY;
  const API_URL = process.env.API_URL;

  const response = await fetch(API_URL, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${OPENROUTER_API_KEY}`,
    },
    body: JSON.stringify({
      models: [
        process.env.MODEL,
        process.env.MODEL_FALLBACK_1,
        process.env.MODEL_FALLBACK_2,
      ].filter(Boolean),
      messages: [{ role: "user", content: prompt }],
      route: "fallback",
    }),
  });

  if (!response.ok) throw new Error(await response.text());
  const data = await response.json();
  return data.choices[0].message.content;
}

// The handler only cares about the prompt and calling the AI
export default withAuth(async (body) => {
  if (!body.prompt) {
    return createJsonResponse({ error: "Prompt is required" }, 400);
  }

  const aiText = await fetchAIResponse(body.prompt);
  return createJsonResponse({ result: aiText }, 200);
});

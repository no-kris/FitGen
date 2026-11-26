import { withAuth, createJsonResponse } from "./_utils.js";
import { validateGenerateWeekBody } from "./_requestValidation.js";
import {
  checkRateLimit,
  buildRateLimitHeaders,
  createRateLimitErrorResponse,
} from "./_rateLimit.js";
import { buildNextWeekPrompt } from "./_prompts.js";
import { callAIProvider, AIProviderError } from "./_aiClient.js";
import { extractJsonFromText } from "./_extractJsonFromText.js";
import { validatePlan } from "./_validatePlan.js";

export const config = {
  runtime: "edge",
};

export default withAuth(async (body, auth) => {
  const reqCheck = validateGenerateWeekBody(body);
  if (!reqCheck.ok) {
    return createJsonResponse(
      {
        error: "Invalid request payload",
        code: "INVALID_REQUEST",
        details: reqCheck.errors,
      },
      400
    );
  }

  const rateLimit = await checkRateLimit(auth?.uid, "generateWeek");
  if (!rateLimit.allowed) {
    return createRateLimitErrorResponse(rateLimit);
  }
  const rateLimitHeaders = buildRateLimitHeaders(rateLimit);

  const { profile, programName, lastWeek, recentWorkouts, feedback } =
    reqCheck.data;
  const expectedWeekNumber = lastWeek.weekNumber + 1;

  const prompt = buildNextWeekPrompt({
    profile,
    programName,
    lastWeek,
    recentWorkouts,
    feedback,
  });

  let aiText;
  try {
    aiText = await callAIProvider(prompt);
  } catch (err) {
    if (err instanceof AIProviderError) {
      return createJsonResponse(
        { error: err.message, code: err.code },
        err.status,
        rateLimitHeaders
      );
    }
    throw err;
  }

  const parsed = extractJsonFromText(aiText);
  if (parsed === null) {
    return createJsonResponse(
      {
        error: "AI response could not be parsed as valid JSON",
        code: "INVALID_AI_OUTPUT",
      },
      422,
      rateLimitHeaders
    );
  }

  const planCheck = validatePlan(parsed, {
    mode: "week",
    selectedDays: profile.selectedDays,
    expectedWeekNumber,
  });

  if (!planCheck.ok) {
    return createJsonResponse(
      {
        error: "AI response failed plan validation",
        code: "PLAN_VALIDATION_FAILED",
        details: planCheck.errors,
      },
      422,
      rateLimitHeaders
    );
  }

  return createJsonResponse({ plan: planCheck.plan }, 200, rateLimitHeaders);
});

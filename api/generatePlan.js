import { withAuth, createJsonResponse } from "./_utils.js";
import { validateGeneratePlanBody } from "./_requestValidation.js";
import { buildInitialPlanPrompt } from "./_prompts.js";
import { callAIProvider, AIProviderError } from "./_aiClient.js";
import { extractJsonFromText } from "./_extractJsonFromText.js";
import { validatePlan } from "./_validatePlan.js";

export const config = {
  runtime: "edge",
};

export default withAuth(async (body) => {
  const reqCheck = validateGeneratePlanBody(body);
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

  const prompt = buildInitialPlanPrompt(reqCheck.data);

  let aiText;
  try {
    aiText = await callAIProvider(prompt);
  } catch (err) {
    if (err instanceof AIProviderError) {
      return createJsonResponse(
        { error: err.message, code: err.code },
        err.status
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
      422
    );
  }

  const planCheck = validatePlan(parsed, {
    mode: "initial",
    selectedDays: reqCheck.data.selectedDays,
    expectedWeekNumber: 1,
    expectedTotalWeeks: reqCheck.data.weeks,
  });

  if (!planCheck.ok) {
    return createJsonResponse(
      {
        error: "AI response failed plan validation",
        code: "PLAN_VALIDATION_FAILED",
        details: planCheck.errors,
      },
      422
    );
  }

  return createJsonResponse({ plan: planCheck.plan }, 200);
});

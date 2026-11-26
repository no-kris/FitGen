export class AIProviderError extends Error {
  constructor(message, { status = 502, code = "UPSTREAM_ERROR" } = {}) {
    super(message);
    this.name = "AIProviderError";
    this.status = status;
    this.code = code;
  }
}

function getTrimmedEnv(key) {
  const value = process.env[key];
  return typeof value === "string" ? value.trim() : "";
}

function getCandidateModels(primaryModel) {
  const rawModels = [
    primaryModel,
    getTrimmedEnv("MODEL_FALLBACK_1"),
    getTrimmedEnv("MODEL_FALLBACK_2"),
  ];
  const models = [];
  for (const model of rawModels) {
    if (model && !models.includes(model)) {
      models.push(model);
    }
  }
  return models;
}

/**
 * Calls the configured AI model provider with timeout protection and optional
 * fallback model chain. Never logs API keys, upstream error bodies, or prompts.
 *
 * @param {string} prompt
 * @param {Object} [options]
 * @param {number} [options.timeoutMs=25000]
 * @param {typeof fetch} [options.fetchImpl=globalThis.fetch]
 * @returns {Promise<string>}
 */
export async function callAIProvider(prompt, options = {}) {
  const { timeoutMs = 25000, fetchImpl = globalThis.fetch } = options;

  const apiKey = getTrimmedEnv("PROVIDER_API_KEY");
  const apiUrl = getTrimmedEnv("API_URL");
  const primaryModel = getTrimmedEnv("MODEL");

  if (!apiKey || !apiUrl || !primaryModel) {
    throw new AIProviderError(
      "Server configuration error: Missing AI provider configuration",
      { status: 500, code: "CONFIG_ERROR" }
    );
  }

  const candidateModels = getCandidateModels(primaryModel);
  let lastError = null;

  for (const model of candidateModels) {
    const controller = new AbortController();
    const timerId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      let response;
      try {
        response = await fetchImpl(apiUrl, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify({
            model,
            messages: [{ role: "user", content: prompt }],
          }),
          signal: controller.signal,
        });
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          console.warn(`AI provider request timed out for model "${model}"`);
          throw new AIProviderError("AI provider request timed out", {
            status: 504,
            code: "UPSTREAM_TIMEOUT",
          });
        }

        console.warn(
          `AI provider network error for model "${model}": ${err?.name || "Error"}`
        );
        lastError = new AIProviderError("AI provider request failed", {
          status: 502,
          code: "UPSTREAM_ERROR",
        });
        continue;
      }

      if (!response.ok) {
        console.warn(
          `AI provider returned HTTP ${response.status} for model "${model}"`
        );
        lastError = new AIProviderError("AI provider request failed", {
          status: 502,
          code: "UPSTREAM_ERROR",
        });
        continue;
      }

      let data;
      try {
        data = await response.json();
      } catch (err) {
        if (err?.name === "AbortError" || controller.signal.aborted) {
          console.warn(`AI provider response timed out for model "${model}"`);
          throw new AIProviderError("AI provider request timed out", {
            status: 504,
            code: "UPSTREAM_TIMEOUT",
          });
        }

        console.warn(`AI provider returned non-JSON body for model "${model}"`);
        lastError = new AIProviderError("Invalid response from AI provider", {
          status: 502,
          code: "UPSTREAM_INVALID_RESPONSE",
        });
        continue;
      }

      if (
        !Array.isArray(data?.choices) ||
        data.choices.length === 0 ||
        !data.choices[0]?.message
      ) {
        console.warn(
          `AI provider returned invalid envelope for model "${model}"`
        );
        lastError = new AIProviderError("Invalid response from AI provider", {
          status: 502,
          code: "UPSTREAM_INVALID_RESPONSE",
        });
        continue;
      }

      const content = data.choices[0].message.content;
      return typeof content === "string" ? content : "";
    } finally {
      clearTimeout(timerId);
    }
  }

  throw (
    lastError ||
    new AIProviderError("AI provider request failed", {
      status: 502,
      code: "UPSTREAM_ERROR",
    })
  );
}

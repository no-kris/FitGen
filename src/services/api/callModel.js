import extractJsonFromText from "../../utils/extractJsonFromText";

const BACKEND_URL = import.meta.env.VITE_BACKEND_URL || "/api/callModel";

const callModel = async (prompt) => {
  let lastError = null;

  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const response = await fetch(BACKEND_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ prompt }),
      });

      if (!response.ok) {
        throw new Error("Failed to call backend API");
      }

      const data = await response.json();

      if (data.error) {
        throw new Error(data.error);
      }

      if (!data.result) {
        throw new Error("No text received from backend");
      }

      const cleanedJson = extractJsonFromText(data.result);

      return cleanedJson;
    } catch (error) {
      lastError = error;
      console.warn(`Attempt ${attempt + 1} failed:`, error);
    }
  }

  throw lastError;
};

export default callModel;

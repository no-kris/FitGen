const extractJsonFromText = (text) => {
  if (!text) return null;

  try {
    return JSON.parse(text);
  } catch (e) {
    console.error("Failed to parse extracted JSON block:", e);
  }

  // Try to extract JSON from markdown code blocks (e.g., ```json ... ```)
  const match = text.match(/```(?:json)?\s*([\s\S]*?)\s*```/i);
  if (match && match[1]) {
    try {
      return JSON.parse(match[1]);
    } catch (e) {
      console.error("Failed to parse extracted JSON block:", e);
    }
  }

  // Fallback: Find the first '{' and the last '}'
  try {
    const start = text.indexOf("{");
    const end = text.lastIndexOf("}");
    if (start !== -1 && end !== -1 && end > start) {
      const jsonText = text.substring(start, end + 1);
      return JSON.parse(jsonText);
    }
  } catch (e) {
    console.error("Failed to parse extracted JSON block:", e);
  }

  console.error("Could not extract any valid JSON from the AI response.");
  return null;
};

export default extractJsonFromText;

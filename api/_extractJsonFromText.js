const CODE_FENCE_PATTERN = /```(?:json)?\s*([\s\S]*?)```/gi;
const MAX_CANDIDATE_STARTS = 100;
const MAX_SCAN_STEPS = 2_000_000;

function tryParseJsonContainer(candidate) {
  try {
    const parsed = JSON.parse(candidate);
    if (parsed !== null && typeof parsed === "object") {
      return parsed;
    }
  } catch {
    // Non-JSON candidate; caller will continue scanning fallbacks.
  }
  return null;
}

function extractBalancedJson(text) {
  let candidateAttempts = 0;
  let totalSteps = 0;

  for (let start = 0; start < text.length; start += 1) {
    const openChar = text[start];
    if (openChar !== "{" && openChar !== "[") {
      continue;
    }

    if (candidateAttempts >= MAX_CANDIDATE_STARTS || totalSteps >= MAX_SCAN_STEPS) {
      break;
    }
    candidateAttempts += 1;

    const stack = [openChar === "{" ? "}" : "]"];
    let inString = false;
    let escaped = false;

    for (let i = start + 1; i < text.length; i += 1) {
      totalSteps += 1;
      if (totalSteps > MAX_SCAN_STEPS) {
        return null;
      }

      const ch = text[i];
      if (inString) {
        if (escaped) {
          escaped = false;
        } else if (ch === "\\") {
          escaped = true;
        } else if (ch === '"') {
          inString = false;
        }
        continue;
      }

      if (ch === '"') {
        inString = true;
        continue;
      }

      if (ch === "{") {
        stack.push("}");
      } else if (ch === "[") {
        stack.push("]");
      } else if (ch === "}" || ch === "]") {
        if (stack[stack.length - 1] !== ch) {
          break;
        }
        stack.pop();
        if (stack.length === 0) {
          const parsed = tryParseJsonContainer(text.slice(start, i + 1));
          if (parsed !== null) {
            return parsed;
          }
          break;
        }
      }
    }
  }

  return null;
}

/**
 * Extracts and parses a JSON object or array from untrusted LLM text output.
 * Pure, side-effect-free, and Edge Runtime compatible.
 *
 * @param {unknown} text
 * @returns {Object | Array | null}
 */
export function extractJsonFromText(text) {
  if (typeof text !== "string") {
    return null;
  }

  const trimmed = text.trim();
  if (!trimmed) {
    return null;
  }

  const direct = tryParseJsonContainer(trimmed);
  if (direct !== null) {
    return direct;
  }

  for (const match of trimmed.matchAll(CODE_FENCE_PATTERN)) {
    const inner = (match[1] ?? "").trim();
    if (!inner) {
      continue;
    }

    const fencedDirect = tryParseJsonContainer(inner);
    if (fencedDirect !== null) {
      return fencedDirect;
    }

    const fencedBalanced = extractBalancedJson(inner);
    if (fencedBalanced !== null) {
      return fencedBalanced;
    }
  }

  return extractBalancedJson(trimmed);
}

export default extractJsonFromText;

const DEFAULT_REST_SECONDS = 90;

const COMPOUND_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)$/;
const CLOCK_PATTERN = /^(\d+):([0-5]\d)$/;
const RANGE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?\s*(?:[-\u2013\u2014]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/;
const SINGLE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/;

const unitMultiplier = (unit) => (unit.startsWith("m") ? 60 : 1);

const parseRestSeconds = (input) => {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) {
      return DEFAULT_REST_SECONDS;
    }
    const rounded = Math.round(input);
    return rounded > 0 ? rounded : DEFAULT_REST_SECONDS;
  }

  if (typeof input !== "string") {
    return DEFAULT_REST_SECONDS;
  }

  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_REST_SECONDS;
  }

  const compoundMatch = normalized.match(COMPOUND_PATTERN);
  if (compoundMatch) {
    const total = Math.round(
      Number(compoundMatch[1]) * 60 + Number(compoundMatch[2])
    );
    return Number.isFinite(total) && total > 0 ? total : DEFAULT_REST_SECONDS;
  }

  const clockMatch = normalized.match(CLOCK_PATTERN);
  if (clockMatch) {
    const total = Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
    return Number.isFinite(total) && total > 0 ? total : DEFAULT_REST_SECONDS;
  }

  const rangeMatch = normalized.match(RANGE_PATTERN);
  if (rangeMatch) {
    const lowUnit = rangeMatch[2] || rangeMatch[4] || "";
    const highUnit = rangeMatch[4] || rangeMatch[2] || "";
    const lowSeconds = Number(rangeMatch[1]) * unitMultiplier(lowUnit);
    const highSeconds = Number(rangeMatch[3]) * unitMultiplier(highUnit);
    const total = Math.round(Math.max(lowSeconds, highSeconds));
    return Number.isFinite(total) && total > 0 ? total : DEFAULT_REST_SECONDS;
  }

  const singleMatch = normalized.match(SINGLE_PATTERN);
  if (singleMatch) {
    const total = Math.round(
      Number(singleMatch[1]) * unitMultiplier(singleMatch[2] || "")
    );
    return Number.isFinite(total) && total > 0 ? total : DEFAULT_REST_SECONDS;
  }

  return DEFAULT_REST_SECONDS;
};

export default parseRestSeconds;

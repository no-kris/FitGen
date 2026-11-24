const DEFAULT_SETS_COUNT = 3;

const RANGE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(?:sets?)?\s*(?:[-\u2013\u2014]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(?:sets?)?$/;
const SINGLE_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:sets?)?$/;

const parseSetsCount = (input) => {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) {
      return DEFAULT_SETS_COUNT;
    }
    const count = Math.floor(input);
    return count >= 1 ? count : DEFAULT_SETS_COUNT;
  }

  if (typeof input !== "string") {
    return DEFAULT_SETS_COUNT;
  }

  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return DEFAULT_SETS_COUNT;
  }

  const rangeMatch = normalized.match(RANGE_PATTERN);
  if (rangeMatch) {
    const count = Math.floor(
      Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]))
    );
    return Number.isFinite(count) && count >= 1 ? count : DEFAULT_SETS_COUNT;
  }

  const singleMatch = normalized.match(SINGLE_PATTERN);
  if (singleMatch) {
    const count = Math.floor(Number(singleMatch[1]));
    return Number.isFinite(count) && count >= 1 ? count : DEFAULT_SETS_COUNT;
  }

  return DEFAULT_SETS_COUNT;
};

export default parseSetsCount;

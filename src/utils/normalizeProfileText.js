const DEFAULT_EMPTY_VALUE = "None";

const isEmptyOrNone = (text) => {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.toLowerCase() === "none";
};

const normalizeProfileText = (value) => {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return isEmptyOrNone(trimmed) ? DEFAULT_EMPTY_VALUE : trimmed;
  }

  if (Array.isArray(value)) {
    const items = value
      .filter((item) => typeof item === "string")
      .map((item) => item.trim())
      .filter((item) => !isEmptyOrNone(item));
    return items.length > 0 ? items.join(", ") : DEFAULT_EMPTY_VALUE;
  }

  return DEFAULT_EMPTY_VALUE;
};

export default normalizeProfileText;

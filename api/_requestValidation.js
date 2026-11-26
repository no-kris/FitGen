import { normalizeProfileText, resolveDurationMinutes } from "./_prompts.js";

const WEEKDAY_MAP = {
  mon: "Monday",
  monday: "Monday",
  tue: "Tuesday",
  tues: "Tuesday",
  tuesday: "Tuesday",
  wed: "Wednesday",
  weds: "Wednesday",
  wednesday: "Wednesday",
  thu: "Thursday",
  thur: "Thursday",
  thurs: "Thursday",
  thursday: "Thursday",
  fri: "Friday",
  friday: "Friday",
  sat: "Saturday",
  saturday: "Saturday",
  sun: "Sunday",
  sunday: "Sunday",
};

const DURATION_STRING_PATTERN = /^\s*\d+(?:\.\d+)?\s*$/;
const INTEGER_STRING_PATTERN = /^\s*\d+\s*$/;

function isPlainObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function normalizeWeekday(value) {
  if (typeof value !== "string") {
    return null;
  }
  const key = value.trim().replace(/\.$/, "").toLowerCase();
  return Object.hasOwn(WEEKDAY_MAP, key) ? WEEKDAY_MAP[key] : null;
}

function validateRequiredString(value, fieldPath, maxLength, errors) {
  if (typeof value !== "string") {
    errors.push(`${fieldPath}: must be a non-empty string`);
    return "";
  }
  const trimmed = value.trim();
  if (trimmed.length === 0 || trimmed.length > maxLength) {
    errors.push(
      `${fieldPath}: must be between 1 and ${maxLength} characters`
    );
    return "";
  }
  return trimmed;
}

function validateSelectedDays(value, fieldPath, errors) {
  if (!Array.isArray(value) || value.length < 1 || value.length > 7) {
    errors.push(`${fieldPath}: must be an array with 1 to 7 weekday entries`);
    return [];
  }

  const seen = new Set();
  const canonicalDays = [];

  value.forEach((entry, index) => {
    const canonical = normalizeWeekday(entry);
    if (!canonical) {
      errors.push(`${fieldPath}[${index}]: must be a valid weekday name`);
      return;
    }
    if (!seen.has(canonical)) {
      seen.add(canonical);
      canonicalDays.push(canonical);
    }
  });

  return canonicalDays;
}

function validateDuration(value, errors) {
  let parsed = Number.NaN;
  if (typeof value === "number") {
    if (Number.isFinite(value)) {
      parsed = value;
    }
  } else if (typeof value === "string" && DURATION_STRING_PATTERN.test(value)) {
    parsed = Number(value);
  }

  const rounded = Math.round(parsed);
  if (
    !Number.isFinite(parsed) ||
    !Number.isInteger(rounded) ||
    rounded < 10 ||
    rounded > 240
  ) {
    errors.push("duration: must be a number between 10 and 240");
    return 0;
  }
  return rounded;
}

function validateWeeks(value, errors) {
  let parsed = Number.NaN;
  if (typeof value === "number") {
    if (Number.isSafeInteger(value)) {
      parsed = value;
    }
  } else if (typeof value === "string" && INTEGER_STRING_PATTERN.test(value)) {
    parsed = Number(value.trim());
  }

  if (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 52) {
    errors.push("weeks: must be an integer between 1 and 52");
    return 0;
  }
  return parsed;
}

function validateStrictOptionalProfileText(value, fieldPath, errors) {
  if (value === undefined || value === null) {
    return "None";
  }

  if (typeof value === "string") {
    if (value.length > 500) {
      errors.push(`${fieldPath}: must be at most 500 characters`);
      return "None";
    }
    return normalizeProfileText(value);
  }

  if (Array.isArray(value)) {
    if (value.length > 20) {
      errors.push(`${fieldPath}: must contain at most 20 items`);
      return "None";
    }
    let hasInvalidItem = false;
    value.forEach((item, index) => {
      if (typeof item !== "string" || item.length > 100) {
        hasInvalidItem = true;
        errors.push(
          `${fieldPath}[${index}]: must be a string of at most 100 characters`
        );
      }
    });
    return hasInvalidItem ? "None" : normalizeProfileText(value);
  }

  errors.push(`${fieldPath}: must be a string or an array of strings`);
  return "None";
}

function validateLenientOptionalProfileText(value, fieldPath, errors) {
  if (typeof value === "string" && value.length > 500) {
    errors.push(`${fieldPath}: must be at most 500 characters`);
    return "None";
  }
  return normalizeProfileText(value);
}

/**
 * Validates and normalizes the request payload for POST /api/generatePlan.
 *
 * @param {unknown} body
 * @returns {{ ok: true, data: Object } | { ok: false, errors: string[] }}
 */
export function validateGeneratePlanBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ["body: must be a plain object"] };
  }

  const errors = [];

  const goal = validateRequiredString(body.goal, "goal", 100, errors);
  const level = validateRequiredString(body.level, "level", 100, errors);
  const equipment = validateRequiredString(
    body.equipment,
    "equipment",
    150,
    errors
  );
  const selectedDays = validateSelectedDays(
    body.selectedDays,
    "selectedDays",
    errors
  );
  const duration = validateDuration(body.duration, errors);
  const weeks = validateWeeks(body.weeks, errors);
  const exclusions = validateStrictOptionalProfileText(
    body.exclusions,
    "exclusions",
    errors
  );
  const priorities = validateStrictOptionalProfileText(
    body.priorities,
    "priorities",
    errors
  );

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      goal,
      level,
      selectedDays,
      equipment,
      duration,
      weeks,
      exclusions,
      priorities,
    },
  };
}

/**
 * Validates and normalizes the request payload for POST /api/generateWeek.
 *
 * @param {unknown} body
 * @returns {{ ok: true, data: Object } | { ok: false, errors: string[] }}
 */
export function validateGenerateWeekBody(body) {
  if (!isPlainObject(body)) {
    return { ok: false, errors: ["body: must be a plain object"] };
  }

  const errors = [];

  let normalizedProfile = null;
  if (!isPlainObject(body.profile)) {
    errors.push("profile: must be a plain object");
  } else {
    const rawProfile = body.profile;
    const goal = validateRequiredString(
      rawProfile.goal,
      "profile.goal",
      100,
      errors
    );
    const level = validateRequiredString(
      rawProfile.level,
      "profile.level",
      100,
      errors
    );
    const equipment = validateRequiredString(
      rawProfile.equipment,
      "profile.equipment",
      150,
      errors
    );
    const selectedDays = validateSelectedDays(
      rawProfile.selectedDays,
      "profile.selectedDays",
      errors
    );
    const duration = resolveDurationMinutes(rawProfile.duration);
    const exclusions = validateLenientOptionalProfileText(
      rawProfile.exclusions,
      "profile.exclusions",
      errors
    );
    const priorities = validateLenientOptionalProfileText(
      rawProfile.priorities,
      "profile.priorities",
      errors
    );

    normalizedProfile = {
      goal,
      level,
      equipment,
      selectedDays,
      duration,
      exclusions,
      priorities,
    };
  }

  let programName = "";
  if (body.programName !== undefined && body.programName !== null) {
    if (typeof body.programName !== "string" || body.programName.length > 200) {
      errors.push("programName: must be a string of at most 200 characters");
    } else {
      programName = body.programName.trim();
    }
  }

  let normalizedLastWeek = null;
  if (!isPlainObject(body.lastWeek)) {
    errors.push("lastWeek: must be a plain object");
  } else {
    const rawLastWeek = body.lastWeek;
    const weekNumber = rawLastWeek.weekNumber;
    if (
      typeof weekNumber !== "number" ||
      !Number.isSafeInteger(weekNumber) ||
      weekNumber < 1 ||
      weekNumber > 100
    ) {
      errors.push("lastWeek.weekNumber: must be an integer between 1 and 100");
    }

    const normalizedSchedule = [];
    if (
      !Array.isArray(rawLastWeek.schedule) ||
      rawLastWeek.schedule.length < 1 ||
      rawLastWeek.schedule.length > 7
    ) {
      errors.push(
        "lastWeek.schedule: must be an array with 1 to 7 day entries"
      );
    } else {
      rawLastWeek.schedule.forEach((rawDay, dayIndex) => {
        const dayPath = `lastWeek.schedule[${dayIndex}]`;
        if (!isPlainObject(rawDay)) {
          errors.push(`${dayPath}: must be a plain object`);
          return;
        }

        const dayName = validateRequiredString(
          rawDay.dayName,
          `${dayPath}.dayName`,
          50,
          errors
        );
        const focus = validateRequiredString(
          rawDay.focus,
          `${dayPath}.focus`,
          150,
          errors
        );

        const normalizedExercises = [];
        if (
          !Array.isArray(rawDay.exercises) ||
          rawDay.exercises.length < 1 ||
          rawDay.exercises.length > 30
        ) {
          errors.push(
            `${dayPath}.exercises: must be an array with 1 to 30 exercises`
          );
        } else {
          rawDay.exercises.forEach((rawEx, exIndex) => {
            const exPath = `${dayPath}.exercises[${exIndex}]`;
            if (!isPlainObject(rawEx)) {
              errors.push(`${exPath}: must be a plain object`);
              return;
            }
            const name = validateRequiredString(
              rawEx.name,
              `${exPath}.name`,
              150,
              errors
            );
            normalizedExercises.push({ name });
          });
        }

        normalizedSchedule.push({
          ...(Number.isSafeInteger(rawDay.dayNumber)
            ? { dayNumber: rawDay.dayNumber }
            : {}),
          dayName,
          focus,
          exercises: normalizedExercises,
        });
      });
    }

    normalizedLastWeek = {
      weekNumber,
      schedule: normalizedSchedule,
    };
  }

  let recentWorkouts = [];
  if (body.recentWorkouts !== undefined && body.recentWorkouts !== null) {
    if (
      !Array.isArray(body.recentWorkouts) ||
      body.recentWorkouts.length > 50
    ) {
      errors.push(
        "recentWorkouts: must be an array with at most 50 workout entries"
      );
    } else {
      body.recentWorkouts.forEach((entry, index) => {
        if (!isPlainObject(entry)) {
          errors.push(`recentWorkouts[${index}]: must be a plain object`);
        }
      });
      recentWorkouts = body.recentWorkouts;
    }
  }

  let feedback = "";
  if (body.feedback !== undefined && body.feedback !== null) {
    if (typeof body.feedback !== "string" || body.feedback.length > 1000) {
      errors.push("feedback: must be a string of at most 1000 characters");
    } else {
      feedback = body.feedback.trim();
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    data: {
      profile: normalizedProfile,
      programName,
      lastWeek: normalizedLastWeek,
      recentWorkouts,
      feedback,
    },
  };
}

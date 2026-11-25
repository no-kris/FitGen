const DEFAULT_SETS_COUNT = 3;
const DEFAULT_REST_SECONDS = 90;

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

const SETS_RANGE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(?:sets?)?\s*(?:[-\u2013\u2014]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(?:sets?)?$/;
const SETS_SINGLE_PATTERN = /^(\d+(?:\.\d+)?)\s*(?:sets?)?$/;

const REST_COMPOUND_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(?:minutes?|mins?|m)\s*(\d+(?:\.\d+)?)\s*(?:seconds?|secs?|s)$/;
const REST_CLOCK_PATTERN = /^(\d+):([0-5]\d)$/;
const REST_RANGE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?\s*(?:[-\u2013\u2014]|\bto\b)\s*(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/;
const REST_SINGLE_PATTERN =
  /^(\d+(?:\.\d+)?)\s*(seconds?|secs?|s|minutes?|mins?|m)?$/;

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

function parsePositiveInt(value) {
  if (typeof value === "number") {
    return Number.isSafeInteger(value) && value >= 1 ? value : null;
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (/^\d+$/.test(trimmed)) {
      const parsed = Number(trimmed);
      return Number.isSafeInteger(parsed) && parsed >= 1 ? parsed : null;
    }
  }
  return null;
}

function sanitizeSetsCount(input) {
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

  const rangeMatch = normalized.match(SETS_RANGE_PATTERN);
  if (rangeMatch) {
    const count = Math.floor(
      Math.max(Number(rangeMatch[1]), Number(rangeMatch[2]))
    );
    return Number.isFinite(count) && count >= 1 ? count : DEFAULT_SETS_COUNT;
  }

  const singleMatch = normalized.match(SETS_SINGLE_PATTERN);
  if (singleMatch) {
    const count = Math.floor(Number(singleMatch[1]));
    return Number.isFinite(count) && count >= 1 ? count : DEFAULT_SETS_COUNT;
  }

  return DEFAULT_SETS_COUNT;
}

function restUnitMultiplier(unit) {
  return unit.startsWith("m") ? 60 : 1;
}

function parseStrictRestSeconds(input) {
  if (typeof input === "number") {
    if (!Number.isFinite(input) || input <= 0) {
      return null;
    }
    const rounded = Math.round(input);
    return rounded > 0 ? rounded : null;
  }

  if (typeof input !== "string") {
    return null;
  }

  const normalized = input.trim().toLowerCase();
  if (!normalized) {
    return null;
  }

  const compoundMatch = normalized.match(REST_COMPOUND_PATTERN);
  if (compoundMatch) {
    const total = Math.round(
      Number(compoundMatch[1]) * 60 + Number(compoundMatch[2])
    );
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  const clockMatch = normalized.match(REST_CLOCK_PATTERN);
  if (clockMatch) {
    const total = Number(clockMatch[1]) * 60 + Number(clockMatch[2]);
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  const rangeMatch = normalized.match(REST_RANGE_PATTERN);
  if (rangeMatch) {
    const lowUnit = rangeMatch[2] || rangeMatch[4] || "";
    const highUnit = rangeMatch[4] || rangeMatch[2] || "";
    const lowSeconds = Number(rangeMatch[1]) * restUnitMultiplier(lowUnit);
    const highSeconds = Number(rangeMatch[3]) * restUnitMultiplier(highUnit);
    const total = Math.round(Math.max(lowSeconds, highSeconds));
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  const singleMatch = normalized.match(REST_SINGLE_PATTERN);
  if (singleMatch) {
    const total = Math.round(
      Number(singleMatch[1]) * restUnitMultiplier(singleMatch[2] || "")
    );
    return Number.isFinite(total) && total > 0 ? total : null;
  }

  return null;
}

function sanitizeRestSeconds(exercise) {
  const fromRestSeconds = parseStrictRestSeconds(exercise.restSeconds);
  if (fromRestSeconds !== null) {
    return fromRestSeconds;
  }
  const fromRest = parseStrictRestSeconds(exercise.rest);
  if (fromRest !== null) {
    return fromRest;
  }
  return DEFAULT_REST_SECONDS;
}

function sanitizeAlternatives(rawAlternatives, exerciseName) {
  if (!Array.isArray(rawAlternatives)) {
    return [];
  }

  const lowerExerciseName = exerciseName.toLowerCase();
  const seen = new Set();
  const sanitized = [];

  for (const item of rawAlternatives) {
    if (typeof item !== "string") {
      continue;
    }
    const trimmed = item.trim();
    if (!trimmed) {
      continue;
    }
    const lower = trimmed.toLowerCase();
    if (lower === lowerExerciseName || seen.has(lower)) {
      continue;
    }
    seen.add(lower);
    sanitized.push(trimmed);
  }

  return sanitized;
}

function sanitizeOptionalString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function validateOptions(options) {
  const optionErrors = [];

  if (options !== undefined && !isPlainObject(options)) {
    return {
      optionErrors: ["options: must be a plain object"],
    };
  }

  const opts = options ?? {};
  const mode = opts.mode === undefined ? "initial" : opts.mode;
  if (mode !== "initial" && mode !== "week") {
    optionErrors.push('mode: must be "initial" or "week"');
  }

  let selectedDaysSet = null;
  if (opts.selectedDays !== undefined) {
    if (!Array.isArray(opts.selectedDays) || opts.selectedDays.length === 0) {
      optionErrors.push(
        "selectedDays: must be a non-empty array of valid weekday names"
      );
    } else {
      selectedDaysSet = new Set();
      opts.selectedDays.forEach((day, idx) => {
        const canonical = normalizeWeekday(day);
        if (!canonical) {
          optionErrors.push(
            `selectedDays[${idx}]: must be a valid weekday name`
          );
        } else {
          selectedDaysSet.add(canonical);
        }
      });
    }
  }

  let expectedWeekNumber;
  if (opts.expectedWeekNumber !== undefined) {
    if (
      !Number.isInteger(opts.expectedWeekNumber) ||
      opts.expectedWeekNumber < 1
    ) {
      optionErrors.push(
        "expectedWeekNumber: must be a positive integer (>= 1)"
      );
    } else {
      expectedWeekNumber = opts.expectedWeekNumber;
    }
  }

  let expectedTotalWeeks;
  if (opts.expectedTotalWeeks !== undefined) {
    if (
      !Number.isInteger(opts.expectedTotalWeeks) ||
      opts.expectedTotalWeeks < 1
    ) {
      optionErrors.push(
        "expectedTotalWeeks: must be a positive integer (>= 1)"
      );
    } else {
      expectedTotalWeeks = opts.expectedTotalWeeks;
    }
  }

  return {
    optionErrors,
    mode,
    selectedDaysSet,
    expectedWeekNumber,
    expectedTotalWeeks,
  };
}

function hasValidUniqueDayNumbers(rawSchedule) {
  const seen = new Set();
  for (const day of rawSchedule) {
    if (
      !isPlainObject(day) ||
      !Number.isInteger(day.dayNumber) ||
      day.dayNumber < 1 ||
      seen.has(day.dayNumber)
    ) {
      return false;
    }
    seen.add(day.dayNumber);
  }
  return true;
}

function validateExercise(rawExercise, path, errors) {
  if (!isPlainObject(rawExercise)) {
    errors.push(`${path}: must be a plain object`);
    return null;
  }

  let name = "";
  if (
    typeof rawExercise.name !== "string" ||
    rawExercise.name.trim().length === 0
  ) {
    errors.push(`${path}.name: must be a non-empty string`);
  } else {
    name = rawExercise.name.trim();
  }

  let reps = "";
  if (
    typeof rawExercise.reps === "string" &&
    rawExercise.reps.trim().length > 0
  ) {
    reps = rawExercise.reps.trim();
  } else if (
    typeof rawExercise.reps === "number" &&
    Number.isFinite(rawExercise.reps) &&
    rawExercise.reps > 0
  ) {
    reps = String(rawExercise.reps);
  } else {
    errors.push(
      `${path}.reps: must be a non-empty string or positive number`
    );
  }

  const sets = sanitizeSetsCount(rawExercise.sets);
  const restSeconds = sanitizeRestSeconds(rawExercise);
  const rest = `${restSeconds}s`;
  const notes = sanitizeOptionalString(rawExercise.notes);
  const alternatives = sanitizeAlternatives(rawExercise.alternatives, name);

  return {
    name,
    sets,
    reps,
    restSeconds,
    rest,
    notes,
    alternatives,
  };
}

function validateWeek(rawWeek, weekIndex, context, errors) {
  const weekPath = `weeks[${weekIndex}]`;
  if (!isPlainObject(rawWeek)) {
    errors.push(`${weekPath}: must be a plain object`);
    return null;
  }

  let weekNumber = rawWeek.weekNumber;
  if (!Number.isInteger(weekNumber) || weekNumber < 1) {
    errors.push(`${weekPath}.weekNumber: must be a positive integer (>= 1)`);
  } else if (
    context.expectedWeekNumber !== undefined &&
    weekNumber !== context.expectedWeekNumber
  ) {
    errors.push(
      `${weekPath}.weekNumber: expected ${context.expectedWeekNumber}, received ${weekNumber}`
    );
  }

  const description = sanitizeOptionalString(rawWeek.description);
  const coachNotes = sanitizeOptionalString(rawWeek.coachNotes);

  if (!Array.isArray(rawWeek.schedule) || rawWeek.schedule.length === 0) {
    errors.push(`${weekPath}.schedule: must be a non-empty array`);
    return null;
  }

  const preserveDayNumbers = hasValidUniqueDayNumbers(rawWeek.schedule);
  const seenDays = new Set();
  const sanitizedSchedule = [];

  rawWeek.schedule.forEach((rawDay, dayIndex) => {
    const dayPath = `${weekPath}.schedule[${dayIndex}]`;
    if (!isPlainObject(rawDay)) {
      errors.push(`${dayPath}: must be a plain object`);
      return;
    }

    let dayName = "";
    if (
      typeof rawDay.dayName !== "string" ||
      rawDay.dayName.trim().length === 0
    ) {
      errors.push(`${dayPath}.dayName: must be a non-empty string`);
    } else {
      const trimmedDay = rawDay.dayName.trim();
      dayName = normalizeWeekday(trimmedDay) ?? trimmedDay;

      if (context.selectedDaysSet && !context.selectedDaysSet.has(dayName)) {
        errors.push(
          `${dayPath}.dayName: "${dayName}" is not in selectedDays`
        );
      }

      const dayKey = dayName.toLowerCase();
      if (seenDays.has(dayKey)) {
        errors.push(`${dayPath}.dayName: duplicate day "${dayName}"`);
      } else {
        seenDays.add(dayKey);
      }
    }

    let focus = "";
    if (typeof rawDay.focus !== "string" || rawDay.focus.trim().length === 0) {
      errors.push(`${dayPath}.focus: must be a non-empty string`);
    } else {
      focus = rawDay.focus.trim();
    }

    const sanitizedExercises = [];
    if (!Array.isArray(rawDay.exercises) || rawDay.exercises.length === 0) {
      errors.push(`${dayPath}.exercises: must be a non-empty array`);
    } else {
      rawDay.exercises.forEach((rawExercise, exIndex) => {
        const ex = validateExercise(
          rawExercise,
          `${dayPath}.exercises[${exIndex}]`,
          errors
        );
        if (ex) {
          sanitizedExercises.push(ex);
        }
      });
    }

    sanitizedSchedule.push({
      dayNumber: preserveDayNumbers ? rawDay.dayNumber : dayIndex + 1,
      dayName,
      focus,
      exercises: sanitizedExercises,
    });
  });

  return {
    weekNumber,
    description,
    coachNotes,
    schedule: sanitizedSchedule,
  };
}

/**
 * Strictly validates and sanitizes an AI-generated workout plan payload.
 * Pure, deterministic, Edge-safe, never mutates input, never emits undefined values.
 *
 * @param {unknown} rawPlan - Parsed JSON object from the AI model.
 * @param {Object} [options={}]
 * @param {"initial" | "week"} [options.mode="initial"]
 * @param {string[]} [options.selectedDays]
 * @param {number} [options.expectedWeekNumber]
 * @param {number} [options.expectedTotalWeeks]
 * @returns {{ ok: true, plan: Object } | { ok: false, errors: string[] }}
 */
export function validatePlan(rawPlan, options = {}) {
  const {
    optionErrors,
    mode,
    selectedDaysSet,
    expectedWeekNumber,
    expectedTotalWeeks,
  } = validateOptions(options);

  if (optionErrors.length > 0) {
    return { ok: false, errors: optionErrors };
  }

  if (!isPlainObject(rawPlan)) {
    return { ok: false, errors: ["plan: must be a plain object"] };
  }

  const errors = [];
  let sanitizedProgramName = "";
  let rawWeeks = null;
  let isBareWeek = false;

  if (mode === "initial") {
    if (
      typeof rawPlan.programName !== "string" ||
      rawPlan.programName.trim().length === 0
    ) {
      errors.push("programName: must be a non-empty string");
    } else {
      sanitizedProgramName = rawPlan.programName.trim();
    }

    if (!Array.isArray(rawPlan.weeks) || rawPlan.weeks.length === 0) {
      errors.push("weeks: must be a non-empty array");
    } else {
      rawWeeks = rawPlan.weeks;
      if (expectedWeekNumber !== undefined && rawWeeks.length !== 1) {
        errors.push(
          "weeks: must contain exactly 1 week when expectedWeekNumber is specified"
        );
      }
    }
  } else {
    if (rawPlan.weeks !== undefined) {
      if (!Array.isArray(rawPlan.weeks) || rawPlan.weeks.length !== 1) {
        errors.push("weeks: must be an array with 1 week");
      } else {
        rawWeeks = rawPlan.weeks;
      }
    } else if (rawPlan.schedule !== undefined) {
      isBareWeek = true;
      rawWeeks = [rawPlan];
    } else {
      errors.push("weeks: must be an array with 1 week");
    }
  }

  const sanitizedWeeks = [];
  if (rawWeeks) {
    const context = { selectedDaysSet, expectedWeekNumber };
    rawWeeks.forEach((rawWeek, weekIndex) => {
      const sanitizedWeek = validateWeek(rawWeek, weekIndex, context, errors);
      if (sanitizedWeek) {
        sanitizedWeeks.push(sanitizedWeek);
      }
    });
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  if (mode === "initial") {
    const totalWeeks =
      expectedTotalWeeks ??
      parsePositiveInt(rawPlan.totalWeeks) ??
      sanitizedWeeks.length;

    return {
      ok: true,
      plan: {
        programName: sanitizedProgramName,
        description: sanitizeOptionalString(rawPlan.description),
        totalWeeks,
        weeks: sanitizedWeeks,
      },
    };
  }

  const weekPlan = {};
  if (!isBareWeek) {
    if (
      typeof rawPlan.programName === "string" &&
      rawPlan.programName.trim().length > 0
    ) {
      weekPlan.programName = rawPlan.programName.trim();
    }
    if (
      typeof rawPlan.description === "string" &&
      rawPlan.description.trim().length > 0
    ) {
      weekPlan.description = rawPlan.description.trim();
    }
  }
  weekPlan.weeks = sanitizedWeeks;

  return { ok: true, plan: weekPlan };
}

export default validatePlan;

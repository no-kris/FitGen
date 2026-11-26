export const DEFAULT_DURATION_MINUTES = 60;

const DEFAULT_EMPTY_VALUE = "None";
const NO_RECENT_WORKOUTS_TEXT =
  "No logs recorded yet (assume standard progression).";

function isEmptyOrNone(text) {
  const trimmed = text.trim();
  return trimmed === "" || trimmed.toLowerCase() === "none";
}

/**
 * Normalizes optional profile text fields (exclusions, priorities).
 * Exact parity with src/utils/normalizeProfileText.js.
 *
 * @param {unknown} value
 * @returns {string}
 */
export function normalizeProfileText(value) {
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
}

/**
 * Resolves canonical session duration in minutes, falling back to 60 minutes.
 *
 * @param {unknown} rawDuration
 * @returns {number}
 */
export function resolveDurationMinutes(rawDuration) {
  if (
    typeof rawDuration === "number" ||
    (typeof rawDuration === "string" && rawDuration.trim() !== "")
  ) {
    const parsed = Number(rawDuration);
    const rounded = Math.round(parsed);
    if (Number.isFinite(parsed) && rounded > 0) {
      return rounded;
    }
  }
  return DEFAULT_DURATION_MINUTES;
}

/**
 * Formats the most recent 10 workout logs for next-week prompt context.
 * Supports both flat and legacy nested workout log shapes.
 *
 * @param {unknown} recentWorkouts
 * @returns {string}
 */
export function formatRecentWorkouts(recentWorkouts) {
  if (!Array.isArray(recentWorkouts) || recentWorkouts.length === 0) {
    return NO_RECENT_WORKOUTS_TEXT;
  }

  const validLogs = recentWorkouts
    .slice(-10)
    .filter((log) => log !== null && typeof log === "object" && !Array.isArray(log));

  if (validLogs.length === 0) {
    return NO_RECENT_WORKOUTS_TEXT;
  }

  return validLogs
    .map((log) => {
      const focus =
        typeof log?.focus === "string" && log.focus.trim()
          ? log.focus.trim()
          : typeof log?.workout?.focus === "string" && log.workout.focus.trim()
            ? log.workout.focus.trim()
            : "Workout";
      const exerciseCount = Array.isArray(log?.logs) ? log.logs.length : 0;
      const rawDurationSec =
        typeof log?.duration === "number" &&
        Number.isFinite(log.duration) &&
        log.duration > 0
          ? log.duration
          : 0;
      const durationMinutes = Math.floor(rawDurationSec / 60);

      return `${focus}: ${exerciseCount} exercises completed. Duration: ${durationMinutes} minutes.`;
    })
    .join("\n");
}

/**
 * Single source of truth for the JSON plan schema included in both prompts.
 *
 * @param {Object} [options]
 * @param {"initial" | "week"} [options.mode="initial"]
 * @param {number} [options.weekNumber=1]
 * @param {number} [options.totalWeeks]
 * @returns {string}
 */
export function buildPlanSchemaSnippet({
  mode = "initial",
  weekNumber = 1,
  totalWeeks,
} = {}) {
  const isInitial = mode === "initial";

  const schema = {
    programName: isInitial
      ? "Creative & Scientific Program Name"
      : `Same as previous week, just with week ${weekNumber} added.`,
    description: isInitial
      ? "Strategic summary of the training phase."
      : `Strategic summary of the training phase for week ${weekNumber}.`,
    ...(isInitial && totalWeeks !== undefined ? { totalWeeks } : {}),
    weeks: [
      {
        weekNumber,
        description: isInitial
          ? "Phase focus (e.g., 'Neuromuscular Adaptation' or 'Hypertrophy Block 1')."
          : "Brief summary of this week's specific training focus (e.g. 'Hypertrophy Phase - Volume Increase').",
        coachNotes: isInitial
          ? "Coach note for week 1 (e.g., 'System: Profile Analyzed. Exclusions Applied. Generating Optimal Sequence.')."
          : "Explain how you adapted the plan based on user feedback and performance.",
        schedule: [
          {
            dayNumber: 1,
            dayName: "Monday",
            focus: "Primary Focus (e.g., Push, Pull, Legs, Upper Body)",
            exercises: [
              {
                name: "Exercise Name",
                sets: 3,
                reps: "8-12",
                restSeconds: 60,
                rest: "60s",
                notes: isInitial
                  ? "Keep chest up and core tight."
                  : "Progression note",
                alternatives: ["Exact Alt 1", "Exact Alt 2", "Exact Alt 3"],
              },
            ],
          },
        ],
      },
    ],
  };

  return JSON.stringify(schema, null, 2);
}

function getEquipmentInstruction(equipment) {
  switch (equipment.trim().toLowerCase()) {
    case "full gym":
      return "Use a full gym with a wide range of equipment to perform a variety of exercises.";
    case "home gym (basic equipment)":
      return "Use basic equipment at home, such as dumbbells, resistance bands, and a mat.";
    case "bodyweight":
      return "Use only bodyweight exercises to perform a variety of exercises.";
    default:
      return `Use only the user's available equipment: ${equipment}.`;
  }
}

function getGoalInstruction(goal) {
  switch (goal.trim().toLowerCase()) {
    case "build muscle":
      return "Focus on higher reps (8-12), moderate weights, and shorter rest periods (2-3m) to build muscle.";
    case "lose weight":
      return "Focus on metabolic conditioning, high reps (12-15+), circuit training or supersets, and short rest periods (1-2m) to keep heart rate up.";
    case "gain strength":
      return "Focus on lower reps (4-6), heavy weights, and longer rest periods (3-5m) to maximize strength.";
    default:
      return `Tailor reps, intensity, and rest periods specifically to achieve: ${goal}.`;
  }
}

/**
 * Builds the initial week-1 workout plan generation prompt.
 *
 * @param {Object} profile
 * @returns {string}
 */
export function buildInitialPlanPrompt(profile) {
  const goal =
    typeof profile?.goal === "string" && profile.goal.trim()
      ? profile.goal.trim()
      : "general fitness";
  const level =
    typeof profile?.level === "string" && profile.level.trim()
      ? profile.level.trim()
      : "beginner";
  const equipment =
    typeof profile?.equipment === "string" && profile.equipment.trim()
      ? profile.equipment.trim()
      : "bodyweight";
  const days = Array.isArray(profile?.selectedDays)
    ? profile.selectedDays.join(", ")
    : "";
  const durationMinutes = resolveDurationMinutes(profile?.duration);
  const totalWeeks = profile?.weeks;
  const exclusions = normalizeProfileText(profile?.exclusions);
  const priorities = normalizeProfileText(profile?.priorities);
  const schemaSnippet = buildPlanSchemaSnippet({
    mode: "initial",
    weekNumber: 1,
    totalWeeks,
  });

  return `
    You are an expert fitness coach. Your mission is to generate a highly personalized workout plan strictly adhering to the user's input.

    **USER PROFILE:**
    - **Primary Goal:** ${goal}. (This is what the user wants to achieve)
    - **Experience Level:** ${level} (Adjust volume, complexity, and terminology accordingly)
    - **Schedule:** ${days} (Strictly enable workouts ONLY on these days)
    - **Session Duration:** ${durationMinutes} minutes (This is a HARD CONSTRAINT. Adjust volume/sets/rest periods to fit)
    - **Available Equipment:** ${getEquipmentInstruction(equipment)} (Do NOT prescribe exercises using unavailable equipment)
    - **EXCLUSIONS & INJURIES (CRITICAL):** ${exclusions} (You MUST filter out any exercises, distinct muscle groups, or movement patterns that conflict with these exclusions. Failure to do so is a safety violation.)
    - **PRIORITIZE MUSCLE GROUPS:** ${priorities} (You MUST focus on the user's priority muscle groups or movement patterns.)

    **TASK:**
    Create strictly **WEEK 1** of a ${totalWeeks}-week program.

    **OUTPUT FORMAT:**
    Returns STRICT, parseable JSON. No markdown, no preambles.
    Structure:
${schemaSnippet}

    **IMPORTANT RULES:**
    1. **Strict Scheduling:** Generate workouts ONLY for the specific days requested: ${days}.
    2. **Time Management:** Adjust volume (sets/exercises) to fit the ${durationMinutes} minute duration.
    3. **Alternatives:** Every exercise MUST have 3 valid alternatives using ONLY available equipment.
    4. **Specificity:** ${getGoalInstruction(goal)}
    5. **Safety:** DOUBLE-CHECK Exclusions: '${exclusions}'. If user excludes "Running", do NOT include treadmill warmups. If "Shoulder Pain", avoid overhead pressing.
    6. **Focus:** DOUBLE-CHECK Prioritize: '${priorities}'. If user prioritizes "Legs", focus on leg exercises.
  `;
}

/**
 * Builds the next-week workout plan generation prompt.
 *
 * @param {Object} params
 * @param {Object} params.profile
 * @param {string} [params.programName=""]
 * @param {Object} params.lastWeek
 * @param {Array} [params.recentWorkouts=[]]
 * @param {string} [params.feedback=""]
 * @returns {string}
 */
export function buildNextWeekPrompt({
  profile,
  programName = "",
  lastWeek,
  recentWorkouts = [],
  feedback = "",
}) {
  const nextWeekNumber = lastWeek.weekNumber + 1;
  const days = Array.isArray(profile?.selectedDays)
    ? profile.selectedDays.join(", ")
    : "";
  const goal =
    typeof profile?.goal === "string" && profile.goal.trim()
      ? profile.goal.trim()
      : "general fitness";
  const level =
    typeof profile?.level === "string" && profile.level.trim()
      ? profile.level.trim()
      : "intermediate";
  const equipment =
    typeof profile?.equipment === "string" && profile.equipment.trim()
      ? profile.equipment.trim()
      : "bodyweight";
  const targetDurationMinutes = resolveDurationMinutes(profile?.duration);
  const exclusions = normalizeProfileText(profile?.exclusions);
  const priorities = normalizeProfileText(profile?.priorities);
  const safeProgramName =
    typeof programName === "string" && programName.trim()
      ? programName.trim()
      : "their training program";
  const safeFeedback =
    typeof feedback === "string" && feedback.trim() ? feedback.trim() : "None";
  const previousWeekSummary = JSON.stringify(
    lastWeek.schedule.map((d) => ({
      day: d.dayName,
      focus: d.focus,
      exercises: d.exercises.map((e) => e.name),
    }))
  );
  const recentHistory = formatRecentWorkouts(recentWorkouts);
  const schemaSnippet = buildPlanSchemaSnippet({
    mode: "week",
    weekNumber: nextWeekNumber,
  });

  return `
    You are an expert fitness coach. The user has just finished Week ${lastWeek.weekNumber} of "${safeProgramName}".

    User Profile: ${goal}, ${level}, ${equipment}.
    Exclusions & Injuries: ${exclusions}
    Prioritize Muscle Groups: ${priorities}
    Schedule: ${days}
    User Feedback for Week ${lastWeek.weekNumber}: "${safeFeedback}"

    Here is the structure of the previous week (Week ${lastWeek.weekNumber}):
    ${previousWeekSummary}

    Here is their recent performance summary:
    ${recentHistory}

    **TASK**: Generate the full schedule for **WEEK ${nextWeekNumber}**.
    - **CRITICAL**: Read the User Feedback. If they mention pain/injury (e.g., 'stiff shoulder'), MODIFY the plan to accommodate (e.g., remove overhead press).
    - If feedback is positive, apply progressive overload.
    - Respect profile exclusions ('${exclusions}') and priorities ('${priorities}').
    - Write a 'coachNotes' field explaining EXACTLY how you adapted the plan based on their feedback and performance. Write in a slightly robotic or tactical tone.
    - Ensure workouts are scheduled on: ${days}.
    - **CRITICAL**: Adjust volume to fit ${targetDurationMinutes} minutes.
    - Provide an "alternatives" array (3 items) for every exercise.

    **OUTPUT FORMAT:**
    Returns STRICT, parseable JSON. No markdown, no preambles.
    Structure:
${schemaSnippet}
  `;
}

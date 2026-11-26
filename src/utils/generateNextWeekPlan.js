import { requestNextWeekPlan } from "../services/api/callModel";
import getUserToken from "./getUserToken";
import normalizeProfileText from "./normalizeProfileText";

const generateNextWeekPlan = async (profile, plan, history, feedback) => {
  if (!Array.isArray(plan?.weeks) || plan.weeks.length === 0) {
    throw new Error("Cannot generate next week without an existing plan");
  }

  const lastWeek = plan.weeks[plan.weeks.length - 1];

  const payload = {
    profile: {
      goal: profile?.goal,
      level: profile?.level,
      equipment: profile?.equipment,
      selectedDays: profile?.selectedDays,
      ...(profile?.duration !== undefined
        ? { duration: profile.duration }
        : {}),
      exclusions: normalizeProfileText(profile?.exclusions),
      priorities: normalizeProfileText(profile?.priorities),
    },
    programName: typeof plan?.programName === "string" ? plan.programName : "",
    lastWeek: {
      weekNumber: lastWeek?.weekNumber,
      schedule: Array.isArray(lastWeek?.schedule)
        ? lastWeek.schedule.map((day) => ({
            ...(day?.dayNumber !== undefined
              ? { dayNumber: day.dayNumber }
              : {}),
            dayName: day?.dayName,
            focus: day?.focus,
            exercises: Array.isArray(day?.exercises)
              ? day.exercises.map((ex) => ({ name: ex?.name }))
              : [],
          }))
        : [],
    },
    recentWorkouts: Array.isArray(history) ? history.slice(-10) : [],
    feedback: typeof feedback === "string" ? feedback : "",
  };

  const token = await getUserToken();
  const result = await requestNextWeekPlan(payload, token);

  if (result && Array.isArray(result.weeks) && result.weeks.length > 0) {
    return result;
  }

  throw new Error("Failed to generate valid plan data");
};

export default generateNextWeekPlan;

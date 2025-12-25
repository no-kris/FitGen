import callModel from "../services/api/callModel";

const generateNextWeekPlan = async (profile, plan, history, feedback) => {
  const lastWeek = plan.weeks[plan.weeks.length - 1];
  const nextWeekNumber = lastWeek.weekNumber + 1;
  const days = profile.selectedDays.join(", ");
  const recentHistory = history
    .slice(-10)
    .map(
      (log) =>
        `${log.workout.focus}: ${
          log.logs.length
        } exercises completed. Duration: ${Math.floor(
          log.duration / 60
        )} minutes.`
    )
    .join("\n");

  const prompt = `
    You are an expert fitness coach. The user has just finished Week ${
      lastWeek.weekNumber
    } of "${plan.programName}".
    
    User Profile: ${profile.goal}, ${profile.level}, ${profile.equipment}.
    Schedule: ${days}
    User Feedback for Week ${lastWeek.weekNumber}: "${feedback || "None"}"
    
    Here is the structure of the previous week (Week ${lastWeek.weekNumber}):
    ${JSON.stringify(
      lastWeek.schedule.map((d) => ({
        day: d.dayName,
        focus: d.focus,
        exercises: d.exercises.map((e) => e.name),
      }))
    )}

    Here is their recent performance summary:
    ${recentHistory || "No logs recorded yet (assume standard progression)."}

    **TASK**: Generate the full schedule for **WEEK ${nextWeekNumber}**.
    - **CRITICAL**: Read the User Feedback. If they mention pain/injury (e.g., 'stiff shoulder'), MODIFY the plan to accommodate (e.g., remove overhead press).
    - If feedback is positive, apply progressive overload.
    - Write a 'coachNotes' field explaining EXACTLY how you adapted the plan based on their feedback and performance. Write in a slightly robotic or tactical tone.
    - Ensure workouts are scheduled on: ${days}.
    - **CRITICAL**: Adjust volume to fit ${
      profile.sessionDuration || 60
    } minutes.
    - Provide an "alternatives" array (3 items) for every exercise.
    
    **OUTPUT FORMAT:**
    Returns STRICT, parseable JSON. No markdown, no preambles.
    Structure:
    {
      "programName": "Same as previous week, just with week ${nextWeekNumber} added.",
      "description": "Strategic summary of the training phase for week ${nextWeekNumber}.",
      "weeks": [
        {
          "weekNumber": ${nextWeekNumber},
          "description": "Brief summary of this week's specific training focus (e.g. 'Hypertrophy Phase - Volume Increase').",
          "coachNotes": "Explain how you adapted the plan based on user feedback and performance.",
          "schedule": [
            {
              "dayNumber": 1,
              "dayName": "Monday",
              "focus": "Primary Focus (e.g., Push, Pull, Legs, Upper Body)",
              "exercises": [
                 { 
                   "name": "Exercise Name", 
                   "sets": 3, 
                   "reps": "8-12", 
                   "rest": "60s", 
                   "notes": "Progression note", 
                   "alternatives": ["Exact Alt 1", "Exact Alt 2", "Exact Alt 3"] 
                 }
              ]
            }
          ]
        }
      ]
    }
  `;

  const result = await callModel(prompt);

  if (result && result.weeks && result.weeks.length > 0) {
    return result;
  } else if (result && result.weekNumber) {
    return { weeks: [result] };
  }

  throw new Error("Failed to generate valid plan data");
};

export default generateNextWeekPlan;

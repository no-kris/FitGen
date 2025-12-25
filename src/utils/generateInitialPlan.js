import callModel from "../services/api/callModel";

const generateInitialPlan = async (formData) => {
  const days = formData.selectedDays.join(", ");
  const exclusions =
    formData.exclusions !== "None" && formData.exclusions.length > 0
      ? formData.exclusions.join(", ")
      : "";
  const priorities =
    formData.priorities !== "None" && formData.priorities.length > 0
      ? formData.priorities.join(", ")
      : "";

  const getEquipmentInstruction = (equipment) => {
    switch (equipment.toLowerCase()) {
      case "full gym":
        return "Use a full gym with a wide range of equipment to perform a variety of exercises.";
      case "home gym (basic equipment)":
        return "Use basic equipment at home, such as dumbbells, resistance bands, and a mat.";
      case "bodyweight":
        return "Use only bodyweight exercises to perform a variety of exercises.";
    }
  };

  const getGoalInstruction = (goal) => {
    switch (goal.toLowerCase()) {
      case "build muscle":
        return "Focus on higher reps (8-12), moderate weights, and shorter rest periods (2-3m) to build muscle.";
      case "lose weight":
        return "Focus on metabolic conditioning, high reps (12-15+), circuit training or supersets, and short rest periods (1-2m) to keep heart rate up.";
      case "gain strength":
        return "Focus on lower reps (4-6), heavy weights, and longer rest periods (3-5m) to maximize strength.";
    }
  };

  const prompt = `
    You are an expert fitness coach. Your mission is to generate a highly personalized workout plan strictly adhering to the user's input.

    **USER PROFILE:**
    - **Primary Goal:** ${
      formData.goal
    }. (This is what the user wants to achieve)
    - **Experience Level:** ${
      formData.level
    } (Adjust volume, complexity, and terminology accordingly)
    - **Schedule:** ${days} (Strictly enable workouts ONLY on these days)
    - **Session Duration:** ${
      formData.duration
    } minutes (This is a HARD CONSTRAINT. Adjust volume/sets/rest periods to fit)
    - **Available Equipment:** ${getEquipmentInstruction(
      formData.equipment
    )} (Do NOT prescribe exercises using unavailable equipment)
    - **EXCLUSIONS & INJURIES (CRITICAL):** ${
      exclusions || "None"
    } (You MUST filter out any exercises, distinct muscle groups, or movement patterns that conflict with these exclusions. Failure to do so is a safety violation.)
    - **PRIORITIZE MUSCLE GROUPS:** ${
      priorities || "Any"
    } (You MUST focus on the user's priority muscle groups or movement patterns.)

    **TASK:**
    Create strictly **WEEK 1** of a ${formData.weeks}-week program.

    **OUTPUT FORMAT:**
    Returns STRICT, parseable JSON. No markdown, no preambles.
    Structure:
    {
      "programName": "Creative & Scientific Program Name",
      "description": "Strategic summary of the training phase.",
      "totalWeeks": ${formData.weeks},
      "weeks": [
        {
          "weekNumber": 1,
          "description": "Phase focus (e.g., 'Neuromuscular Adaptation' or 'Hypertrophy Block 1').",
          "coachNotes": "SYSTEM: PROFILE ANALYZED. EXCLUSIONS APPLIED. GENERATING OPTIMAL SEQUENCE.",
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
                  "notes": "Cues for form or tempo", 
                  "alternatives": ["Exact Alt 1", "Exact Alt 2", "Exact Alt 3"] 
                } 
              ] 
            }
          ]
        }
      ]
    }

    **IMPORTANT RULES:**
    1. **Strict Scheduling:** Generate workouts ONLY for the specific days requested: ${days}.
    2. **Time Management:** Adjust volume (sets/exercises) to fit the ${
      formData.duration
    } minute duration.
    3. **Alternatives:** Every exercise MUST have 3 valid alternatives using ONLY available equipment.
    4. **Specificity:** ${getGoalInstruction(formData.goal)}
    5. **Safety:** DOUBLE-CHECK Exclusions: '${
      exclusions || "None"
    }'. If user excludes "Running", do NOT include treadmill warmups. If "Shoulder Pain", avoid overhead pressing.
    6. **Focus:** DOUBLE-CHECK Prioritize: '${
      priorities || "Any"
    }'. If user prioritizes "Legs", focus on leg exercises.
   `;

  return callModel(prompt);
};

export default generateInitialPlan;

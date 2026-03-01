import generateNextWeekPlan from "../utils/generateNextWeekPlan";
import { firestoreService } from "../services/firebase/firestoreServices";

export function useWorkout({
  user,
  userData,
  setUserData,
  setView,
  setActiveWorkout,
}) {
  const { plan, profile, history } = userData;

  const handleGenerateNextWeek = async (feedback) => {
    try {
      const result = await generateNextWeekPlan(
        profile,
        plan,
        history,
        feedback
      );
      const newWeek = result.weeks[0];
      const newWeekPlan = {
        ...plan,
        programName: result.programName,
        description: result.description,
        weeks: [...plan.weeks, newWeek],
      };
      setUserData((prev) => ({ ...prev, plan: newWeekPlan }));
      if (user) {
        firestoreService.saveUserData(user.uid, { plan: newWeekPlan });
      }
      setView("plan");
    } catch (error) {
      console.error(error);
    }
  };

  const handleReplaceExercise = (
    weekIndex,
    dayIndex,
    exerciseIndex,
    newExerciseName
  ) => {
    const newPlan = JSON.parse(JSON.stringify(plan));
    const exercise =
      newPlan.weeks[weekIndex].schedule[dayIndex].exercises[exerciseIndex];

    const oldName = exercise.name;

    exercise.alternatives = exercise.alternatives.filter(
      (alt) => alt !== newExerciseName
    );
    exercise.alternatives.push(oldName);
    exercise.name = newExerciseName;

    setUserData((prev) => ({ ...prev, plan: newPlan }));
    if (user) {
      firestoreService.saveUserData(user.uid, { plan: newPlan });
    }
  };

  const handleStartWorkout = (day) => {
    const savedState = localStorage.getItem("fitgen-active");
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setActiveWorkout({ ...day, logs: parsed.logs, elapsed: parsed.elapsed });
    } else {
      setActiveWorkout(day);
    }
    setView("active");
  };

  const handleFinishWorkout = (log) => {
    const updatedLog = {
      ...log,
      workout: {
        ...log.workout,
        date: new Date().toISOString(),
      },
    };
    const updatedHistory = [...history, updatedLog];
    setUserData((prev) => ({ ...prev, history: updatedHistory }));
    if (user) {
      firestoreService.saveUserData(user.uid, { history: updatedHistory });
    }
    localStorage.removeItem("fitgen-active");
    setActiveWorkout(null);
    setView("logs");
  };

  return {
    handleGenerateNextWeek,
    handleReplaceExercise,
    handleStartWorkout,
    handleFinishWorkout,
  };
}

import { useRef } from "react";
import generateNextWeekPlan from "../utils/generateNextWeekPlan";
import parseSetsCount from "../utils/parseSetsCount";
import { activeWorkoutStore } from "../services/storage/activeWorkoutStore";
import { useAppContext } from "../context/AppContext";

const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";
const SYNC_FAILED_ERROR =
  "Cloud sync failed. Please retry sync before saving changes.";

function syncSavedLogsWithDay(savedLogs, day) {
  if (!Array.isArray(savedLogs)) {
    return null;
  }
  if (!Array.isArray(day?.exercises)) {
    return savedLogs;
  }

  return day.exercises.map((exercise, index) => {
    const savedLog = savedLogs[index];
    if (savedLog && Array.isArray(savedLog.sets)) {
      return {
        ...savedLog,
        name: exercise.name || savedLog.name,
      };
    }

    const setCount = parseSetsCount(exercise.sets);
    return {
      name: exercise.name,
      sets: Array.from({ length: setCount }, () => ({
        weight: "",
        reps: "",
        completed: false,
      })),
    };
  });
}

export function useWorkout() {
  const {
    user,
    status,
    isSynced,
    syncError,
    userData,
    plan: ctxPlan,
    profile: ctxProfile,
    workouts: ctxWorkouts,
    updatePlan,
    addWorkout,
    setView,
    setActiveWorkout,
  } = useAppContext();
  const plan = ctxPlan !== undefined ? ctxPlan : userData?.plan ?? null;
  const profile = ctxProfile !== undefined ? ctxProfile : userData?.profile ?? null;
  const workouts = ctxWorkouts !== undefined ? ctxWorkouts : userData?.history ?? [];
  const isFinishingRef = useRef(false);

  const assertCloudSynced = () => {
    if (!user) {
      return;
    }
    const isSyncFailed = status === "error" || (!isSynced && Boolean(syncError));
    if (isSyncFailed) {
      throw new Error(SYNC_FAILED_ERROR);
    }
    const isSyncPending =
      status === "loading" || (status === undefined && !isSynced);
    if (isSyncPending) {
      throw new Error(SYNC_PENDING_ERROR);
    }
  };

  const handleGenerateNextWeek = async (feedback) => {
    assertCloudSynced();

    const result = await generateNextWeekPlan(
      profile,
      plan,
      workouts,
      feedback
    );
    const newWeek = result.weeks[0];
    const newWeekPlan = {
      ...plan,
      programName: result.programName || plan.programName,
      description: result.description || plan.description,
      weeks: [...plan.weeks, newWeek],
    };

    await updatePlan(newWeekPlan);
    setView("plan");
    return newWeekPlan;
  };

  const handleReplaceExercise = async (
    weekIndex,
    dayIndex,
    exerciseIndex,
    newExerciseName
  ) => {
    assertCloudSynced();

    const newPlan = {
      ...plan,
      weeks: plan.weeks.map((week, wIdx) => {
        if (wIdx !== weekIndex) return week;
        return {
          ...week,
          schedule: week.schedule.map((day, dIdx) => {
            if (dIdx !== dayIndex) return day;
            return {
              ...day,
              exercises: day.exercises.map((exercise, eIdx) => {
                if (eIdx !== exerciseIndex) return exercise;
                const currentAlternatives = Array.isArray(exercise.alternatives)
                  ? exercise.alternatives
                  : [];
                return {
                  ...exercise,
                  name: newExerciseName,
                  alternatives: [
                    ...currentAlternatives.filter(
                      (alt) => alt !== newExerciseName
                    ),
                    exercise.name,
                  ],
                };
              }),
            };
          }),
        };
      }),
    };

    await updatePlan(newPlan);
    return newPlan;
  };

  const handleStartWorkout = (day) => {
    const saved = activeWorkoutStore.load();
    if (!saved) {
      setActiveWorkout(day);
      setView("active");
      return { status: "started" };
    }

    if (activeWorkoutStore.matchesDay(saved, day)) {
      const syncedLogs = syncSavedLogsWithDay(saved.logs, day);
      setActiveWorkout({
        ...day,
        ...(syncedLogs ? { logs: syncedLogs } : {}),
        elapsed: saved.elapsed,
      });
      setView("active");
      return { status: "resumed" };
    }

    return {
      status: "conflict",
      pausedWorkout: saved,
      requestedDay: day,
    };
  };

  const handleResumePausedWorkout = (pausedWorkout) => {
    let targetDay = null;
    if (pausedWorkout && Array.isArray(plan?.weeks)) {
      const matchingWeek = plan.weeks.find(
        (week) => week.weekNumber === pausedWorkout.weekNumber
      );
      if (matchingWeek && Array.isArray(matchingWeek.schedule)) {
        const matchingDay = matchingWeek.schedule.find((day) =>
          activeWorkoutStore.matchesDay(pausedWorkout, {
            ...day,
            weekNumber: matchingWeek.weekNumber,
          })
        );
        if (matchingDay) {
          targetDay = { ...matchingDay, weekNumber: matchingWeek.weekNumber };
        }
      }
    }

    if (!targetDay && pausedWorkout?.workout) {
      targetDay = {
        ...pausedWorkout.workout,
        weekNumber:
          pausedWorkout.workout.weekNumber ?? pausedWorkout.weekNumber,
      };
    }

    if (!targetDay) {
      activeWorkoutStore.clear();
      return false;
    }

    const syncedLogs = syncSavedLogsWithDay(pausedWorkout.logs, targetDay);
    setActiveWorkout({
      ...targetDay,
      ...(syncedLogs ? { logs: syncedLogs } : {}),
      elapsed: pausedWorkout.elapsed ?? 0,
    });
    setView("active");
    return true;
  };

  const handleDiscardAndStartWorkout = (day) => {
    activeWorkoutStore.clear();
    setActiveWorkout(day);
    setView("active");
  };

  const handleFinishWorkout = async (log) => {
    if (isFinishingRef.current) {
      return null;
    }
    assertCloudSynced();

    isFinishingRef.current = true;
    try {
      const workoutMeta = log?.workout || {};
      const workoutPayload = {
        weekNumber: log?.weekNumber ?? workoutMeta.weekNumber ?? 0,
        dayNumber: log?.dayNumber ?? workoutMeta.dayNumber ?? null,
        dayName: log?.dayName ?? workoutMeta.dayName ?? "",
        focus: log?.focus ?? workoutMeta.focus ?? "",
        logs: Array.isArray(log?.logs) ? log.logs : [],
        duration:
          typeof log?.duration === "number" && Number.isFinite(log.duration)
            ? log.duration
            : 0,
        completedAt: new Date().toISOString(),
      };

      const savedEntry = await addWorkout(workoutPayload);

      activeWorkoutStore.clear();
      setActiveWorkout(null);
      setView("logs");
      return savedEntry;
    } finally {
      isFinishingRef.current = false;
    }
  };

  return {
    handleGenerateNextWeek,
    handleReplaceExercise,
    handleStartWorkout,
    handleResumePausedWorkout,
    handleDiscardAndStartWorkout,
    handleFinishWorkout,
  };
}

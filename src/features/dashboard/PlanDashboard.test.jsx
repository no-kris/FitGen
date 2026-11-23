// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  cleanup,
} from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

const firestoreServiceMock = vi.hoisted(() => ({
  saveUserData: vi.fn(),
  addWorkout: vi.fn(),
  getWorkouts: vi.fn(),
  getUserData: vi.fn(),
  migrateLegacyHistory: vi.fn(),
  clearUserData: vi.fn(),
}));

vi.mock("../../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

import PlanDashboard from "./PlanDashboard";

const ACTIVE_KEY = "fitgen:active:v1";

function makeTwoDayPlan() {
  return {
    programName: "Hypertrophy Split",
    description: "Upper/Lower progression",
    totalWeeks: 4,
    weeks: [
      {
        weekNumber: 1,
        coachNotes: "Focus on clean reps",
        schedule: [
          {
            dayNumber: 1,
            dayName: "Monday",
            focus: "Push",
            exercises: [
              {
                name: "Bench Press",
                sets: 3,
                reps: "8-10",
                rest: "90s",
                alternatives: ["DB Press"],
              },
            ],
          },
          {
            dayNumber: 2,
            dayName: "Wednesday",
            focus: "Pull",
            exercises: [
              {
                name: "Barbell Row",
                sets: 3,
                reps: "8-10",
                rest: "90s",
                alternatives: ["Cable Row"],
              },
            ],
          },
        ],
      },
    ],
  };
}

function renderDashboard({ history = [], plan = makeTwoDayPlan() } = {}) {
  const setUserData = vi.fn();
  const setView = vi.fn();
  const setActiveWorkout = vi.fn();

  const contextValue = {
    user: { uid: "user-1" },
    isSynced: true,
    syncError: null,
    userData: {
      profile: { goal: "muscle", selectedDays: ["Monday", "Wednesday"] },
      plan,
      history,
    },
    setUserData,
    setView,
    setActiveWorkout,
  };

  render(
    <AppContext.Provider value={contextValue}>
      <PlanDashboard />
    </AppContext.Provider>
  );

  return { setUserData, setView, setActiveWorkout };
}

describe("PlanDashboard", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("marks days complete and enables next-week check-in for new flat workout entries", () => {
    renderDashboard({
      history: [
        {
          id: "w-mon",
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 1800,
          completedAt: "2026-11-20T10:00:00.000Z",
        },
        {
          id: "w-wed",
          weekNumber: 1,
          dayNumber: 2,
          dayName: "Wednesday",
          focus: "Pull",
          logs: [],
          duration: 1800,
          completedAt: "2026-11-22T10:00:00.000Z",
        },
      ],
    });

    expect(screen.getAllByText("[DONE]")).toHaveLength(2);
    const checkinBtn = screen.getByRole("button", {
      name: /check-in & generate week 2/i,
    });
    expect(checkinBtn.disabled).toBe(false);
  });

  it("keeps next-week check-in disabled when only some days are complete in flat history", () => {
    renderDashboard({
      history: [
        {
          id: "w-mon",
          weekNumber: 1,
          dayNumber: 1,
          dayName: "Monday",
          focus: "Push",
          logs: [],
          duration: 1800,
          completedAt: "2026-11-20T10:00:00.000Z",
        },
      ],
    });

    expect(screen.getAllByText("[DONE]")).toHaveLength(1);
    const checkinBtn = screen.getByRole("button", {
      name: /check-in & generate week 2/i,
    });
    expect(checkinBtn.disabled).toBe(true);
  });

  it("remains compatible with legacy nested workout.* entries for completion checks", () => {
    renderDashboard({
      history: [
        {
          workout: {
            weekNumber: 1,
            dayName: "Monday",
            focus: "Push",
          },
          logs: [],
          duration: 1500,
        },
        {
          workout: {
            weekNumber: 1,
            dayName: "Wednesday",
            focus: "Pull",
          },
          logs: [],
          duration: 1600,
        },
      ],
    });

    expect(screen.getAllByText("[DONE]")).toHaveLength(2);
    const checkinBtn = screen.getByRole("button", {
      name: /check-in & generate week 2/i,
    });
    expect(checkinBtn.disabled).toBe(false);
  });

  it("shows paused-workout conflict modal with Resume Paused, Discard & Start, and Cancel when starting a different day", () => {
    const plan = makeTwoDayPlan();
    const pausedMonday = {
      weekNumber: 1,
      dayNumber: 1,
      dayName: "Monday",
      focus: "Push",
      workout: { ...plan.weeks[0].schedule[0], weekNumber: 1 },
      logs: [
        {
          name: "Bench Press",
          sets: [{ weight: "135", reps: "10", completed: true }],
        },
      ],
      elapsed: 600,
    };
    localStorage.setItem(ACTIVE_KEY, JSON.stringify(pausedMonday));

    const { setActiveWorkout, setView } = renderDashboard({ plan });

    const wednesdayCard = screen.getByText("Wednesday").closest(".card");
    expect(wednesdayCard).not.toBeNull();
    const wednesdayPlayBtn = within(wednesdayCard).getAllByRole("button")[1];

    // Starting Wednesday while Monday is paused opens conflict modal
    fireEvent.click(wednesdayPlayBtn);

    const dialog = screen.getByRole("dialog");
    expect(dialog.textContent).toContain("Week 1 - Monday");
    expect(dialog.textContent).toContain("Wednesday");
    expect(setActiveWorkout).not.toHaveBeenCalled();
    expect(setView).not.toHaveBeenCalled();

    // Cancel closes dialog without changing workout or clearing paused state
    fireEvent.click(within(dialog).getByRole("button", { name: /cancel/i }));
    expect(screen.queryByRole("dialog")).toBeNull();
    expect(setActiveWorkout).not.toHaveBeenCalled();
    expect(localStorage.getItem(ACTIVE_KEY)).not.toBeNull();

    // Re-open conflict modal and choose Resume Paused
    fireEvent.click(wednesdayPlayBtn);
    const resumeDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(resumeDialog).getByRole("button", { name: /resume paused/i })
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(setActiveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        elapsed: 600,
      })
    );
    expect(setView).toHaveBeenCalledWith("active");

    // Re-open conflict modal and choose Discard & Start
    setActiveWorkout.mockClear();
    setView.mockClear();
    fireEvent.click(wednesdayPlayBtn);
    const discardDialog = screen.getByRole("dialog");
    fireEvent.click(
      within(discardDialog).getByRole("button", { name: /discard & start/i })
    );

    expect(screen.queryByRole("dialog")).toBeNull();
    expect(localStorage.getItem(ACTIVE_KEY)).toBeNull();
    expect(setActiveWorkout).toHaveBeenCalledWith(
      expect.objectContaining({
        weekNumber: 1,
        dayNumber: 2,
        dayName: "Wednesday",
      })
    );
    expect(setView).toHaveBeenCalledWith("active");
  });
});

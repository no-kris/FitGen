// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  cleanup,
} from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

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

function deepFreeze(value) {
  if (value && typeof value === "object" && !Object.isFrozen(value)) {
    Object.freeze(value);
    for (const key of Object.keys(value)) {
      deepFreeze(value[key]);
    }
  }
  return value;
}

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function makeMultiWeekPlan(weekCount, totalWeeks = 4) {
  return {
    programName: "Hypertrophy Split",
    description: "Upper/Lower progression",
    totalWeeks,
    weeks: Array.from({ length: weekCount }, (_, idx) => {
      const weekNumber = idx + 1;
      return {
        weekNumber,
        coachNotes: `Week ${weekNumber} coach focus`,
        schedule: [
          {
            dayNumber: 1,
            dayName: "Monday",
            focus: `Week ${weekNumber} Push`,
            exercises: [
              {
                name: weekNumber === 1 ? "Bench Press" : `Week ${weekNumber} Bench`,
                sets: 3,
                reps: "8-10",
                rest: "90s",
                alternatives: ["Dumbbell Press", "Push-ups"],
              },
            ],
          },
          {
            dayNumber: 2,
            dayName: "Wednesday",
            focus: `Week ${weekNumber} Pull`,
            exercises: [
              {
                name: `Week ${weekNumber} Row`,
                sets: 3,
                reps: "8-10",
                rest: "90s",
                alternatives: ["Cable Row"],
              },
            ],
          },
        ],
      };
    }),
  };
}

function renderDashboard({
  history = [],
  plan = makeTwoDayPlan(),
  user = { uid: "user-1" },
  isSynced = true,
  syncError = null,
  retrySync = vi.fn(),
  updatePlan = vi.fn(async (nextPlan) => nextPlan),
} = {}) {
  const setView = vi.fn();
  const setActiveWorkout = vi.fn();

  const buildContext = (overrides = {}) => ({
    user: "user" in overrides ? overrides.user : user,
    isSynced: "isSynced" in overrides ? overrides.isSynced : isSynced,
    syncError: "syncError" in overrides ? overrides.syncError : syncError,
    retrySync: "retrySync" in overrides ? overrides.retrySync : retrySync,
    userData: {
      profile: { goal: "muscle", selectedDays: ["Monday", "Wednesday"] },
      plan: "plan" in overrides ? overrides.plan : plan,
      history: "history" in overrides ? overrides.history : history,
    },
    updatePlan: "updatePlan" in overrides ? overrides.updatePlan : updatePlan,
    setView,
    setActiveWorkout,
  });

  const view = render(
    <AppContext.Provider value={buildContext()}>
      <PlanDashboard />
    </AppContext.Provider>
  );

  const rerenderDashboard = (overrides = {}) => {
    view.rerender(
      <AppContext.Provider value={buildContext(overrides)}>
        <PlanDashboard />
      </AppContext.Provider>
    );
  };

  return {
    ...view,
    rerenderDashboard,
    updatePlan,
    setView,
    setActiveWorkout,
    retrySync,
  };
}

function StatefulDashboardHarness({
  initialPlan,
  initialHistory = [],
  user = { uid: "user-1" },
  isSynced = true,
  syncError = null,
  retrySync = vi.fn(),
  updatePlan: updatePlanProp,
  onPlanChange,
}) {
  const [userData, setUserDataState] = useState({
    profile: { goal: "muscle", selectedDays: ["Monday", "Wednesday"] },
    plan: initialPlan,
    history: initialHistory,
  });

  const updatePlan = async (nextPlan) => {
    if (updatePlanProp) {
      await updatePlanProp(nextPlan);
    }
    setUserDataState((prev) => {
      onPlanChange?.(nextPlan);
      return { ...prev, plan: nextPlan };
    });
    return nextPlan;
  };

  return (
    <AppContext.Provider
      value={{
        user,
        isSynced,
        syncError,
        retrySync,
        userData,
        updatePlan,
        setView: vi.fn(),
        setActiveWorkout: vi.fn(),
      }}
    >
      <PlanDashboard />
    </AppContext.Provider>
  );
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

  describe("week tab selection and non-jumping updates", () => {
    it("selects the latest week on initial mount with aria-pressed exposed on week buttons", () => {
      renderDashboard({ plan: makeMultiWeekPlan(3, 4) });

      expect(screen.getByText("WK 3/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 3" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("false");
      expect(
        screen
          .getByRole("button", { name: "Week 2" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("keeps a manually selected earlier week active across non-growing plan reference updates", () => {
      const initialPlan = makeMultiWeekPlan(3, 4);
      const { rerenderDashboard } = renderDashboard({ plan: initialPlan });

      fireEvent.click(screen.getByRole("button", { name: "Week 1" }));
      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 3" })
          .getAttribute("aria-pressed")
      ).toBe("false");

      const rehydratedPlan = {
        ...initialPlan,
        weeks: initialPlan.weeks.map((week) => ({ ...week })),
      };
      rerenderDashboard({ plan: rehydratedPlan });

      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 3" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("advances to the latest week when plan.weeks.length grows (from 2 to 3 and from null to 2)", () => {
      const { rerenderDashboard } = renderDashboard({
        plan: makeMultiWeekPlan(2, 4),
      });

      fireEvent.click(screen.getByRole("button", { name: "Week 1" }));
      expect(screen.getByText("WK 1/4")).not.toBeNull();

      rerenderDashboard({ plan: makeMultiWeekPlan(3, 4) });

      expect(screen.getByText("WK 3/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 3" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("false");

      cleanup();

      const fromNull = renderDashboard({ plan: null });
      expect(screen.getByText("NO DATA FOUND")).not.toBeNull();

      fromNull.rerenderDashboard({ plan: makeMultiWeekPlan(2, 4) });
      expect(screen.getByText("WK 2/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 2" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("clamps week selection when plan.weeks shrinks out of bounds and stays put when still in bounds", () => {
      const { rerenderDashboard } = renderDashboard({
        plan: makeMultiWeekPlan(3, 4),
      });
      expect(screen.getByText("WK 3/4")).not.toBeNull();

      rerenderDashboard({ plan: makeMultiWeekPlan(1, 4) });

      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen.getByRole("button", { name: /check-in & generate week 2/i })
      ).not.toBeNull();

      cleanup();

      const inBounds = renderDashboard({ plan: makeMultiWeekPlan(3, 4) });
      fireEvent.click(screen.getByRole("button", { name: "Week 1" }));
      expect(screen.getByText("WK 1/4")).not.toBeNull();

      inBounds.rerenderDashboard({ plan: makeMultiWeekPlan(2, 4) });

      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 2" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });

    it("handles empty weeks array while a day modal is open, null plan, and reloads into the newest week", () => {
      const initialPlan = makeMultiWeekPlan(2, 4);
      const { rerenderDashboard } = renderDashboard({ plan: initialPlan });

      fireEvent.click(
        screen.getByRole("button", { name: "View Monday workout details" })
      );
      expect(screen.getByRole("dialog")).not.toBeNull();

      rerenderDashboard({ plan: { ...initialPlan, weeks: [] } });
      expect(screen.getByText("LOADING...")).not.toBeNull();
      expect(screen.queryByRole("dialog")).toBeNull();

      rerenderDashboard({ plan: null });
      expect(screen.getByText("NO DATA FOUND")).not.toBeNull();

      rerenderDashboard({ plan: makeMultiWeekPlan(2, 4) });
      expect(screen.getByText("WK 2/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 2" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("false");
    });
  });

  describe("end-to-end immutable exercise swap in earlier week", () => {
    it("immutably swaps an exercise in Week 1 without jumping week tabs or mutating the frozen plan", async () => {
      const frozenPlan = deepFreeze(makeMultiWeekPlan(2, 4));
      const saveDeferred = createDeferred();
      const updatePlanMock = vi.fn().mockReturnValueOnce(saveDeferred.promise);
      let latestPlan = frozenPlan;

      render(
        <StatefulDashboardHarness
          initialPlan={frozenPlan}
          updatePlan={updatePlanMock}
          onPlanChange={(nextPlan) => {
            latestPlan = nextPlan;
          }}
        />
      );

      expect(screen.getByText("WK 2/4")).not.toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "Week 1" }));
      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen.getByRole("button", { name: "Start Monday workout" })
      ).not.toBeNull();

      fireEvent.click(
        screen.getByRole("button", { name: "View Monday workout details" })
      );
      const dialog = screen.getByRole("dialog");
      expect(
        within(dialog).getByRole("heading", { name: "Bench Press" })
      ).not.toBeNull();

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Swap Bench Press" })
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Dumbbell Press" })
      );

      expect(updatePlanMock).toHaveBeenCalledTimes(1);
      expect(
        within(dialog).getByRole("button", { name: /swapping/i })
      ).not.toBeNull();
      expect(frozenPlan.weeks[0].schedule[0].exercises[0].name).toBe(
        "Bench Press"
      );

      await act(async () => {
        saveDeferred.resolve(undefined);
        await saveDeferred.promise;
      });

      expect(frozenPlan.weeks[0].schedule[0].exercises[0].name).toBe(
        "Bench Press"
      );
      expect(latestPlan).not.toBe(frozenPlan);
      expect(latestPlan.weeks[0].schedule[0].exercises[0].name).toBe(
        "Dumbbell Press"
      );

      expect(screen.getByText("WK 1/4")).not.toBeNull();
      expect(
        screen
          .getByRole("button", { name: "Week 1" })
          .getAttribute("aria-pressed")
      ).toBe("true");
      expect(
        screen
          .getByRole("button", { name: "Week 2" })
          .getAttribute("aria-pressed")
      ).toBe("false");

      const openDialog = screen.getByRole("dialog");
      expect(
        within(openDialog).getByRole("heading", { name: "Dumbbell Press" })
      ).not.toBeNull();
      const updatedSwapBtn = within(openDialog).getByRole("button", {
        name: "Swap Dumbbell Press",
      });
      expect(updatedSwapBtn.getAttribute("aria-expanded")).toBe("false");

      fireEvent.click(updatedSwapBtn);
      expect(
        within(openDialog).getByRole("button", { name: "Bench Press" })
      ).not.toBeNull();
    });

    it("propagates swap save failures into DayDetailModal alert with Retry instead of swallowing them", async () => {
      const frozenPlan = deepFreeze(makeMultiWeekPlan(2, 4));
      const updatePlanMock = vi
        .fn()
        .mockRejectedValueOnce(new Error("Cloud write failed"))
        .mockResolvedValueOnce(undefined);

      render(
        <StatefulDashboardHarness
          initialPlan={frozenPlan}
          updatePlan={updatePlanMock}
        />
      );

      fireEvent.click(screen.getByRole("button", { name: "Week 1" }));
      fireEvent.click(
        screen.getByRole("button", { name: "View Monday workout details" })
      );
      const dialog = screen.getByRole("dialog");

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Swap Bench Press" })
      );
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Dumbbell Press" })
      );

      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toContain("Cloud write failed");
      expect(
        within(dialog).getByRole("heading", { name: "Bench Press" })
      ).not.toBeNull();

      await act(async () => {
        fireEvent.click(within(alert).getByRole("button", { name: "Retry" }));
        await Promise.resolve();
      });

      expect(updatePlanMock).toHaveBeenCalledTimes(2);
      expect(within(dialog).queryByRole("alert")).toBeNull();
      expect(
        within(dialog).getByRole("heading", { name: "Dumbbell Press" })
      ).not.toBeNull();
      expect(screen.getByText("WK 1/4")).not.toBeNull();
    });
  });

  describe("cloud sync status banners", () => {
    it("renders a polite status banner while cloud sync is pending and no alert or Retry Sync", () => {
      renderDashboard({
        user: { uid: "user-1" },
        isSynced: false,
        syncError: null,
      });

      const status = screen.getByRole("status");
      expect(status.textContent).toContain("Syncing your cloud data...");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(screen.queryByRole("button", { name: "Retry Sync" })).toBeNull();
    });

    it("renders an alert banner with Retry Sync when cloud sync fails and does not mask it with a syncing banner", () => {
      const retrySync = vi.fn();
      renderDashboard({
        user: { uid: "user-1" },
        isSynced: false,
        syncError: new Error("Failed to reach Firestore"),
        retrySync,
      });

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Failed to reach Firestore");
      expect(screen.queryByRole("status")).toBeNull();
      expect(screen.queryByText(/syncing your cloud data/i)).toBeNull();

      const retryBtn = within(alert).getByRole("button", {
        name: "Retry Sync",
      });
      fireEvent.click(retryBtn);
      expect(retrySync).toHaveBeenCalledTimes(1);
    });
  });
});

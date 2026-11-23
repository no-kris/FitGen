// @vitest-environment jsdom
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../../context/AppContext";
import LogsScreen from "./LogsScreen";

function renderLogsScreen(history) {
  return render(
    <AppContext.Provider
      value={{
        userData: {
          profile: null,
          plan: null,
          history,
        },
      }}
    >
      <LogsScreen />
    </AppContext.Provider>
  );
}

describe("LogsScreen", () => {
  afterEach(() => {
    cleanup();
  });

  it("shows empty state when no workouts have been logged", () => {
    renderLogsScreen([]);
    expect(screen.getByText(/no entries recorded/i)).toBeTruthy();
  });

  it("renders new flat workout entries with dayName, focus, duration, date, and expandable set details", () => {
    const completedAt = "2026-11-20T15:30:00.000Z";
    const expectedDate = new Date(completedAt).toLocaleDateString();

    renderLogsScreen([
      {
        id: "flat-1",
        weekNumber: 1,
        dayNumber: 1,
        dayName: "Monday",
        focus: "Push",
        duration: 2700,
        completedAt,
        logs: [
          {
            name: "Bench Press",
            sets: [
              { weight: "135", reps: "10", completed: true },
              { weight: "155", reps: "8", completed: false },
            ],
          },
          {
            name: "Tricep Dip",
            sets: [{ weight: "0", reps: "12", completed: false }],
          },
        ],
      },
    ]);

    expect(screen.getByText("Monday")).toBeTruthy();
    expect(screen.getByText("Push")).toBeTruthy();
    expect(screen.getByText(/45 minutes \/ 2 exercises/i)).toBeTruthy();
    expect(screen.getByText(expectedDate)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    expect(screen.getByText("Bench Press")).toBeTruthy();
    expect(screen.getByText(/set 1: 135lbs x 10 reps/i)).toBeTruthy();
    expect(screen.getByText("Tricep Dip")).toBeTruthy();
    expect(screen.getByText(/no completed sets/i)).toBeTruthy();
  });

  it("renders legacy nested workout entries including non-array sets without crashing", () => {
    const legacyDate = "2026-10-15T12:00:00.000Z";
    const expectedDate = new Date(legacyDate).toLocaleDateString();

    renderLogsScreen([
      {
        workout: {
          weekNumber: 1,
          dayName: "Wednesday",
          focus: "Pull",
          date: legacyDate,
        },
        duration: 1800,
        logs: [
          {
            exercise: "Barbell Row",
            sets: 3,
            reps: "8-10",
            weight: "115",
          },
        ],
      },
    ]);

    expect(screen.getByText("Wednesday")).toBeTruthy();
    expect(screen.getByText("Pull")).toBeTruthy();
    expect(screen.getByText(/30 minutes \/ 1 exercises/i)).toBeTruthy();
    expect(screen.getByText(expectedDate)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: /view details/i }));

    expect(screen.getByText("Barbell Row")).toBeTruthy();
    expect(screen.getByText(/3 sets \/ 8-10 reps \/ 115 lbs/i)).toBeTruthy();
  });

  it("renders mixed flat and legacy entries newest-first and expands entries independently", () => {
    renderLogsScreen([
      {
        workout: {
          weekNumber: 1,
          dayName: "Monday",
          focus: "Legacy Push",
          date: "2026-10-01T10:00:00.000Z",
        },
        duration: 1200,
        logs: [
          {
            name: "Push-up",
            sets: [{ weight: "0", reps: "20", completed: true }],
          },
        ],
      },
      {
        id: "flat-newest",
        weekNumber: 2,
        dayNumber: 3,
        dayName: "Friday",
        focus: "Flat Legs",
        duration: 2400,
        completedAt: "2026-11-22T10:00:00.000Z",
        logs: [
          {
            name: "Back Squat",
            sets: [{ weight: "225", reps: "5", completed: true }],
          },
        ],
      },
    ]);

    expect(screen.getByText("Flat Legs")).toBeTruthy();
    expect(screen.getByText("Legacy Push")).toBeTruthy();

    const detailButtons = screen.getAllByRole("button", {
      name: /view details/i,
    });
    expect(detailButtons).toHaveLength(2);

    // First button belongs to newest entry (Friday / Flat Legs)
    fireEvent.click(detailButtons[0]);
    expect(screen.getByText("Back Squat")).toBeTruthy();
    expect(screen.queryByText("Push-up")).toBeNull();
  });
});

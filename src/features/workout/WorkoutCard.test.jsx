// @vitest-environment jsdom
import { useState } from "react";
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act, cleanup } from "@testing-library/react";

vi.mock("@capacitor/haptics", () => ({
  Haptics: { vibrate: vi.fn() },
}));

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn(),
  },
}));

import WorkoutCard from "./WorkoutCard";

function WorkoutCardHarness({ exercise }) {
  const workout = {
    exercises: [exercise],
  };
  const [logs, setLogs] = useState([
    {
      name: exercise.name,
      sets: [{ weight: "135", reps: "10", completed: false }],
    },
  ]);

  return <WorkoutCard workout={workout} logs={logs} setLogs={setLogs} />;
}

function renderCardWithRest(rest) {
  render(
    <WorkoutCardHarness
      exercise={{
        name: "Barbell Squat",
        sets: 1,
        reps: "8-10",
        rest,
      }}
    />
  );
}

function completeFirstSet() {
  const buttons = screen.getAllByRole("button");
  fireEvent.click(buttons[0]);
}

describe("WorkoutCard rest timer parsing", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("starts rest timer at 3:00 for a 2-3m range and dismisses it after 180 seconds", () => {
    renderCardWithRest("2-3m");
    completeFirstSet();

    expect(screen.getByText("Resting")).toBeTruthy();
    expect(screen.getByText("3:00")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(179_000);
    });
    expect(screen.getByText("Resting")).toBeTruthy();
    expect(screen.getByText("0:01")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(screen.queryByText("Resting")).toBeNull();
  });

  it("starts rest timer at 1:30 for a 60-90s range and dismisses it after 90 seconds", () => {
    renderCardWithRest("60-90s");
    completeFirstSet();

    expect(screen.getByText("Resting")).toBeTruthy();
    expect(screen.getByText("1:30")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.queryByText("Resting")).toBeNull();
  });

  it("defaults to 1:30 for N/A rest, never displays NaN:NaN, and dismisses after 90 seconds", () => {
    renderCardWithRest("N/A");
    completeFirstSet();

    expect(screen.getByText("Resting")).toBeTruthy();
    expect(screen.queryByText("NaN:NaN")).toBeNull();
    expect(screen.getByText("1:30")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(90_000);
    });
    expect(screen.queryByText("Resting")).toBeNull();
  });

  it("starts rest timer at 2:15 for compound rest string 2 min 15 sec", () => {
    renderCardWithRest("2 min 15 sec");
    completeFirstSet();

    expect(screen.getByText("Resting")).toBeTruthy();
    expect(screen.getByText("2:15")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(135_000);
    });
    expect(screen.queryByText("Resting")).toBeNull();
  });
});

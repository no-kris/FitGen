// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, act, cleanup } from "@testing-library/react";

vi.mock("@capacitor-community/keep-awake", () => ({
  KeepAwake: {
    keepAwake: vi.fn(),
    allowSleep: vi.fn(),
  },
}));

import RestTimer from "./RestTimer";

describe("RestTimer", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
    vi.useRealTimers();
  });

  it("counts down from 0:45 for valid numeric restTime={45} and completes after 45s", () => {
    const onComplete = vi.fn();
    render(<RestTimer restTime={45} onRestComplete={onComplete} />);

    expect(screen.getByText("0:45")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(44_000);
    });
    expect(screen.getByText("0:01")).toBeTruthy();
    expect(onComplete).not.toHaveBeenCalled();

    act(() => {
      vi.advanceTimersByTime(1_000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it.each([
    { label: "NaN", restTime: NaN },
    { label: "0", restTime: 0 },
    { label: "N/A", restTime: "N/A" },
    { label: "negative -15", restTime: -15 },
    { label: "undefined", restTime: undefined },
  ])(
    "normalizes invalid restTime ($label) to 1:30 and completes after 90s",
    ({ restTime }) => {
      const onComplete = vi.fn();
      render(<RestTimer restTime={restTime} onRestComplete={onComplete} />);

      expect(screen.queryByText("NaN:NaN")).toBeNull();
      expect(screen.getByText("1:30")).toBeTruthy();

      act(() => {
        vi.advanceTimersByTime(89_000);
      });
      expect(onComplete).not.toHaveBeenCalled();

      act(() => {
        vi.advanceTimersByTime(1_000);
      });
      expect(onComplete).toHaveBeenCalledTimes(1);
    }
  );

  it("parses raw string restTime like 2-3m into 3:00 and completes after 180s", () => {
    const onComplete = vi.fn();
    render(<RestTimer restTime="2-3m" onRestComplete={onComplete} />);

    expect(screen.getByText("3:00")).toBeTruthy();

    act(() => {
      vi.advanceTimersByTime(180_000);
    });
    expect(onComplete).toHaveBeenCalledTimes(1);
  });
});

// @vitest-environment jsdom
import { describe, it, expect, vi, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  within,
  act,
  cleanup,
} from "@testing-library/react";
import DayDetailModal from "./DayDetailModal";

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

function makeDayDetails(overrides = {}) {
  return {
    dayNumber: 1,
    dayName: "Monday",
    focus: "Push",
    exercises: [
      {
        name: "Bench Press",
        sets: 3,
        reps: "8-10",
        rest: "90s",
        alternatives: ["Dumbbell Press", "Incline Press"],
      },
      {
        name: "Overhead Press",
        sets: 3,
        reps: "10-12",
        rest: "90s",
        alternatives: [],
      },
      {
        name: "Lateral Raises",
        sets: 3,
        reps: "15",
        rest: "60s",
      },
      {
        name: "Tricep Pushdown",
        sets: 3,
        reps: "12-15",
        rest: "60s",
        alternatives: null,
      },
    ],
    ...overrides,
  };
}

describe("DayDetailModal", () => {
  afterEach(() => {
    cleanup();
    vi.clearAllMocks();
  });

  it("returns null when closed or when details is null", () => {
    const { rerender } = render(
      <DayDetailModal
        isOpen={false}
        onClose={vi.fn()}
        details={makeDayDetails()}
        onReplaceExercise={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();

    rerender(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={null}
        onReplaceExercise={vi.fn()}
      />
    );
    expect(screen.queryByRole("dialog")).toBeNull();
  });

  it("hides swap buttons when alternatives are missing, null, or empty, and toggles aria-expanded on accessible Swap buttons", () => {
    render(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={makeDayDetails()}
        onReplaceExercise={vi.fn()}
      />
    );

    const dialog = screen.getByRole("dialog");
    expect(within(dialog).getByText("Monday")).not.toBeNull();
    expect(within(dialog).getByText("Push")).not.toBeNull();
    expect(
      within(dialog).getByRole("heading", { name: "Bench Press" })
    ).not.toBeNull();

    expect(
      within(dialog).queryByRole("button", { name: "Swap Overhead Press" })
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Swap Lateral Raises" })
    ).toBeNull();
    expect(
      within(dialog).queryByRole("button", { name: "Swap Tricep Pushdown" })
    ).toBeNull();

    const swapBtn = within(dialog).getByRole("button", {
      name: "Swap Bench Press",
    });
    expect(swapBtn.getAttribute("aria-expanded")).toBe("false");
    expect(within(dialog).queryByText("Select Alternative")).toBeNull();

    fireEvent.click(swapBtn);
    expect(swapBtn.getAttribute("aria-expanded")).toBe("true");
    expect(within(dialog).getByText("Select Alternative")).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Dumbbell Press" })
    ).not.toBeNull();
    expect(
      within(dialog).getByRole("button", { name: "Incline Press" })
    ).not.toBeNull();

    fireEvent.click(swapBtn);
    expect(swapBtn.getAttribute("aria-expanded")).toBe("false");
    expect(within(dialog).queryByText("Select Alternative")).toBeNull();
  });

  it("does not mutate a deeply frozen details prop and updates only when parent provides new immutable details", async () => {
    const frozenDetails = deepFreeze(makeDayDetails());
    const onReplaceExercise = vi.fn().mockResolvedValue(undefined);

    const { rerender } = render(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={frozenDetails}
        onReplaceExercise={onReplaceExercise}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Swap Bench Press" }));

    await act(async () => {
      fireEvent.click(screen.getByRole("button", { name: "Dumbbell Press" }));
      await Promise.resolve();
    });

    expect(onReplaceExercise).toHaveBeenCalledTimes(1);
    expect(onReplaceExercise).toHaveBeenCalledWith(0, "Dumbbell Press");
    expect(frozenDetails.exercises[0].name).toBe("Bench Press");
    expect(
      screen.getByRole("heading", { name: "Bench Press" })
    ).not.toBeNull();

    const updatedDetails = deepFreeze({
      ...frozenDetails,
      exercises: frozenDetails.exercises.map((exercise, idx) =>
        idx === 0
          ? {
              ...exercise,
              name: "Dumbbell Press",
              alternatives: ["Incline Press", "Bench Press"],
            }
          : exercise
      ),
    });

    rerender(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={updatedDetails}
        onReplaceExercise={onReplaceExercise}
      />
    );

    expect(
      screen.getByRole("heading", { name: "Dumbbell Press" })
    ).not.toBeNull();
    expect(
      screen.queryByRole("heading", { name: "Bench Press" })
    ).toBeNull();
  });

  it("shows pending state, blocks close actions, and guards against concurrent double-clicks while swapping", async () => {
    const deferred = createDeferred();
    const onReplaceExercise = vi.fn().mockReturnValue(deferred.promise);
    const onClose = vi.fn();

    render(
      <DayDetailModal
        isOpen
        onClose={onClose}
        details={deepFreeze(makeDayDetails())}
        onReplaceExercise={onReplaceExercise}
      />
    );

    const swapToggle = screen.getByRole("button", { name: "Swap Bench Press" });
    fireEvent.click(swapToggle);

    const dumbbellBtn = screen.getByRole("button", { name: "Dumbbell Press" });
    const inclineBtn = screen.getByRole("button", { name: "Incline Press" });

    fireEvent.click(dumbbellBtn);
    fireEvent.click(dumbbellBtn);
    fireEvent.click(inclineBtn);

    expect(onReplaceExercise).toHaveBeenCalledTimes(1);
    expect(onReplaceExercise).toHaveBeenCalledWith(0, "Dumbbell Press");

    const swappingBtn = screen.getByRole("button", { name: /swapping/i });
    expect(swappingBtn.getAttribute("aria-busy")).toBe("true");
    expect(swappingBtn.disabled).toBe(true);
    expect(inclineBtn.disabled).toBe(true);
    expect(inclineBtn.getAttribute("aria-busy")).toBe("false");
    expect(swapToggle.disabled).toBe(true);

    const closeBtn = screen.getByRole("button", { name: "CLOSE" });
    expect(closeBtn.disabled).toBe(true);
    fireEvent.click(closeBtn);
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    const overlay = screen.getByRole("dialog").parentElement;
    fireEvent.click(overlay);
    expect(onClose).not.toHaveBeenCalled();

    expect(
      screen.getByRole("heading", { name: "Bench Press" })
    ).not.toBeNull();

    await act(async () => {
      deferred.resolve();
      await deferred.promise;
    });

    expect(screen.queryByRole("button", { name: /swapping/i })).toBeNull();
    expect(swapToggle.disabled).toBe(false);
    expect(swapToggle.getAttribute("aria-expanded")).toBe("false");
    expect(closeBtn.disabled).toBe(false);

    fireEvent.click(closeBtn);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps original exercise, renders inline alert with Retry on failure, and clears alert after successful retry", async () => {
    const details = deepFreeze(makeDayDetails());
    const onReplaceExercise = vi
      .fn()
      .mockRejectedValueOnce(new Error("Save rejected by server"))
      .mockResolvedValueOnce(undefined);
    const onClose = vi.fn();

    render(
      <DayDetailModal
        isOpen
        onClose={onClose}
        details={details}
        onReplaceExercise={onReplaceExercise}
      />
    );

    const swapToggle = screen.getByRole("button", { name: "Swap Bench Press" });
    fireEvent.click(swapToggle);
    fireEvent.click(screen.getByRole("button", { name: "Dumbbell Press" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Save rejected by server");
    expect(onClose).not.toHaveBeenCalled();
    expect(screen.getByRole("dialog")).not.toBeNull();
    expect(
      screen.getByRole("heading", { name: "Bench Press" })
    ).not.toBeNull();
    expect(details.exercises[0].name).toBe("Bench Press");

    const dumbbellBtn = screen.getByRole("button", { name: "Dumbbell Press" });
    expect(dumbbellBtn.disabled).toBe(false);
    expect(dumbbellBtn.getAttribute("aria-busy")).toBe("false");
    expect(swapToggle.disabled).toBe(false);
    expect(screen.getByRole("button", { name: "CLOSE" }).disabled).toBe(false);

    const retryBtn = within(alert).getByRole("button", { name: "Retry" });
    await act(async () => {
      fireEvent.click(retryBtn);
      await Promise.resolve();
    });

    expect(onReplaceExercise).toHaveBeenCalledTimes(2);
    expect(onReplaceExercise).toHaveBeenNthCalledWith(1, 0, "Dumbbell Press");
    expect(onReplaceExercise).toHaveBeenNthCalledWith(2, 0, "Dumbbell Press");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(swapToggle.getAttribute("aria-expanded")).toBe("false");
    expect(screen.queryByText("Select Alternative")).toBeNull();
  });

  it("resets expanded panel and swap error when closed and reopened", async () => {
    const onReplaceExercise = vi
      .fn()
      .mockRejectedValueOnce(new Error("Temporary failure"));
    const onClose = vi.fn();

    const { rerender } = render(
      <DayDetailModal
        isOpen
        onClose={onClose}
        details={makeDayDetails()}
        onReplaceExercise={onReplaceExercise}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Swap Bench Press" }));
    fireEvent.click(screen.getByRole("button", { name: "Dumbbell Press" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Temporary failure");

    fireEvent.click(screen.getByRole("button", { name: "CLOSE" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <DayDetailModal
        isOpen={false}
        onClose={onClose}
        details={makeDayDetails()}
        onReplaceExercise={onReplaceExercise}
      />
    );
    rerender(
      <DayDetailModal
        isOpen
        onClose={onClose}
        details={makeDayDetails()}
        onReplaceExercise={onReplaceExercise}
      />
    );

    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByText("Select Alternative")).toBeNull();
    expect(
      screen
        .getByRole("button", { name: "Swap Bench Press" })
        .getAttribute("aria-expanded")
    ).toBe("false");
  });

  it("renders status banner and disables alternative selection when isSyncPending is true", () => {
    const onReplaceExercise = vi.fn();

    render(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={makeDayDetails()}
        onReplaceExercise={onReplaceExercise}
        isSyncPending
        isSyncFailed={false}
      />
    );

    const status = screen.getByRole("status");
    expect(status.textContent).toContain("Still syncing your cloud data...");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("button", { name: "Retry Sync" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Swap Bench Press" }));
    const dumbbellBtn = screen.getByRole("button", { name: "Dumbbell Press" });
    const inclineBtn = screen.getByRole("button", { name: "Incline Press" });

    expect(dumbbellBtn.disabled).toBe(true);
    expect(inclineBtn.disabled).toBe(true);

    fireEvent.click(dumbbellBtn);
    expect(onReplaceExercise).not.toHaveBeenCalled();
  });

  it("renders alert with Retry Sync and disables alternative selection when isSyncFailed is true", () => {
    const onReplaceExercise = vi.fn();
    const onRetrySync = vi.fn();

    render(
      <DayDetailModal
        isOpen
        onClose={vi.fn()}
        details={makeDayDetails()}
        onReplaceExercise={onReplaceExercise}
        isSyncPending={false}
        isSyncFailed
        syncError={new Error("Cloud unreachable")}
        onRetrySync={onRetrySync}
      />
    );

    const alert = screen.getByRole("alert");
    expect(alert.textContent).toContain("Cloud unreachable");
    expect(screen.queryByRole("status")).toBeNull();
    expect(screen.queryByText(/still syncing/i)).toBeNull();

    const retrySyncBtn = within(alert).getByRole("button", {
      name: "Retry Sync",
    });
    fireEvent.click(retrySyncBtn);
    expect(onRetrySync).toHaveBeenCalledTimes(1);

    fireEvent.click(screen.getByRole("button", { name: "Swap Bench Press" }));
    const dumbbellBtn = screen.getByRole("button", { name: "Dumbbell Press" });
    expect(dumbbellBtn.disabled).toBe(true);

    fireEvent.click(dumbbellBtn);
    expect(onReplaceExercise).not.toHaveBeenCalled();
  });
});

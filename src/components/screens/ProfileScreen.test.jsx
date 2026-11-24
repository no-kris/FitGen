// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  within,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

const authServiceMock = vi.hoisted(() => ({
  logout: vi.fn(),
  reauthenticate: vi.fn(),
  deleteAccount: vi.fn(),
}));

vi.mock("../../services/firebase/authServices", () => ({
  authService: authServiceMock,
}));

vi.mock("../../services/api/emailService", () => ({
  default: vi.fn(),
}));

import ProfileScreen from "./ProfileScreen";

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function createContextValue(overrides = {}) {
  return {
    user: { uid: "u-1", email: "athlete@example.com", isAnonymous: false },
    userData: {
      profile: {
        goal: "Build Muscle",
        level: "Intermediate",
        selectedDays: ["Monday", "Wednesday", "Friday"],
        equipment: "Full Gym",
        exclusions: "None",
        priorities: "None",
      },
      plan: { weeks: [] },
      history: [],
    },
    handleResetSystem: vi.fn().mockResolvedValue(undefined),
    deleteAll: vi.fn().mockResolvedValue({ deletedWorkoutsCount: 0 }),
    clearStorage: vi.fn(),
    isSynced: true,
    syncError: null,
    retrySync: vi.fn(),
    ...overrides,
  };
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    localStorage.clear();
    vi.resetAllMocks();
    authServiceMock.logout.mockResolvedValue(undefined);
    authServiceMock.reauthenticate.mockResolvedValue(undefined);
    authServiceMock.deleteAccount.mockResolvedValue(undefined);
  });

  afterEach(() => {
    cleanup();
  });

  it("always renders RESET SYSTEM, LOGOUT, PRIVACY POLICY, DELETE ACCOUNT, and File REPORT buttons", () => {
    render(
      <AppContext.Provider value={createContextValue()}>
        <ProfileScreen />
      </AppContext.Provider>
    );

    expect(screen.getByRole("button", { name: "RESET SYSTEM" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "LOGOUT" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "PRIVACY POLICY" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "DELETE ACCOUNT" })).toBeTruthy();
    expect(screen.getByRole("button", { name: "File REPORT" })).toBeTruthy();
  });

  describe("cloud sync status banner and reset guards", () => {
    it("renders pending status banner and disables Reset Program confirmation while cloud sync is pending", () => {
      render(
        <AppContext.Provider
          value={createContextValue({
            isSynced: false,
            syncError: null,
          })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      const status = screen.getByRole("status");
      expect(status.textContent).toContain("Syncing your cloud data...");
      expect(screen.queryByRole("alert")).toBeNull();
      expect(
        screen.queryByRole("button", { name: "Retry Sync" })
      ).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "RESET SYSTEM" }));
      const dialog = screen.getByRole("dialog", { name: "Reset Program?" });
      expect(within(dialog).getByRole("status").textContent).toContain(
        "Still syncing your cloud data..."
      );
      expect(
        within(dialog).getByRole("button", { name: "Reset Program" }).disabled
      ).toBe(true);
    });

    it("renders role=alert with syncError and Retry Sync button without masking error as syncing", () => {
      const retrySync = vi.fn();
      render(
        <AppContext.Provider
          value={createContextValue({
            isSynced: false,
            syncError: new Error("Cloud connection timed out"),
            retrySync,
          })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      const alert = screen.getByRole("alert");
      expect(alert.textContent).toContain("Cloud connection timed out");
      expect(screen.queryByText(/Syncing your cloud data/i)).toBeNull();

      const retryBtn = screen.getByRole("button", { name: "Retry Sync" });
      fireEvent.click(retryBtn);
      expect(retrySync).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "RESET SYSTEM" }));
      const dialog = screen.getByRole("dialog", { name: "Reset Program?" });
      expect(within(dialog).getByRole("alert").textContent).toContain(
        "Cloud connection timed out"
      );
      expect(
        within(dialog).getByRole("button", { name: "Reset Program" }).disabled
      ).toBe(true);

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Retry Sync" })
      );
      expect(retrySync).toHaveBeenCalledTimes(2);
    });
  });

  describe("Reset Program modal", () => {
    it("displays history-preservation copy, handles pending/double-submit/close-blocking, and closes on success", async () => {
      const deferred = createDeferred();
      const handleResetSystem = vi.fn(() => deferred.promise);

      render(
        <AppContext.Provider
          value={createContextValue({ handleResetSystem })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      fireEvent.click(screen.getByRole("button", { name: "RESET SYSTEM" }));
      const dialog = screen.getByRole("dialog", { name: "Reset Program?" });

      expect(dialog.textContent).toMatch(/workout history will be preserved/i);

      const confirmBtn = within(dialog).getByRole("button", {
        name: "Reset Program",
      });
      expect(confirmBtn.disabled).toBe(false);

      fireEvent.click(confirmBtn);

      expect(handleResetSystem).toHaveBeenCalledTimes(1);
      const resettingBtn = within(dialog).getByRole("button", {
        name: /resetting/i,
      });
      expect(resettingBtn.disabled).toBe(true);
      expect(resettingBtn.getAttribute("aria-busy")).toBe("true");
      expect(
        within(dialog).getByRole("button", { name: "Cancel" }).disabled
      ).toBe(true);

      // Block double-submit and dismissal while reset is in flight
      fireEvent.click(resettingBtn);
      fireEvent.click(within(dialog).getByRole("button", { name: "Cancel" }));
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Close modal" })
      );
      fireEvent.click(dialog.parentElement);

      expect(handleResetSystem).toHaveBeenCalledTimes(1);
      expect(
        screen.getByRole("dialog", { name: "Reset Program?" })
      ).toBeTruthy();

      await act(async () => {
        deferred.resolve(undefined);
        await deferred.promise;
      });

      expect(
        screen.queryByRole("dialog", { name: "Reset Program?" })
      ).toBeNull();
    });

    it("keeps modal open with role=alert and Retry button on reset failure, then succeeds on retry", async () => {
      const handleResetSystem = vi
        .fn()
        .mockRejectedValueOnce(new Error("Reset write failed"))
        .mockResolvedValueOnce(undefined);

      render(
        <AppContext.Provider
          value={createContextValue({ handleResetSystem })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      fireEvent.click(screen.getByRole("button", { name: "RESET SYSTEM" }));
      const dialog = screen.getByRole("dialog", { name: "Reset Program?" });

      fireEvent.click(
        within(dialog).getByRole("button", { name: "Reset Program" })
      );

      const alert = await within(dialog).findByRole("alert");
      expect(alert.textContent).toContain("Reset write failed");
      expect(
        screen.getByRole("dialog", { name: "Reset Program?" })
      ).toBeTruthy();

      const retryBtn = within(dialog).getByRole("button", { name: "Retry" });
      expect(retryBtn.disabled).toBe(false);

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Reset Program?" })
        ).toBeNull();
      });
      expect(handleResetSystem).toHaveBeenCalledTimes(2);
    });

    it("renders safely without throwing when userData.profile is transiently null during an in-flight optimistic reset and supports error + Retry on rollback", async () => {
      // 1) Direct null-profile render safety
      expect(() =>
        render(
          <AppContext.Provider
            value={createContextValue({
              userData: { profile: null, plan: null, history: [] },
            })}
          >
            <ProfileScreen />
          </AppContext.Provider>
        )
      ).not.toThrow();

      expect(screen.getByRole("button", { name: "RESET SYSTEM" })).toBeTruthy();
      expect(screen.getByText(/0 DAYS\/WEEK/i)).toBeTruthy();
      expect(screen.getByText("No exclusions requested")).toBeTruthy();
      expect(screen.getByText("No priorities requested")).toBeTruthy();
      expect(screen.queryByText(/undefined/i)).toBeNull();
      expect(screen.queryByText(/null/i)).toBeNull();

      cleanup();

      // 2) Full in-flight optimistic reset transition: populated -> transient null -> rollback with error + Retry -> success
      const firstResetDeferred = createDeferred();
      const handleResetSystem = vi
        .fn()
        .mockReturnValueOnce(firstResetDeferred.promise)
        .mockResolvedValueOnce(undefined);

      const baseContext = createContextValue({ handleResetSystem });
      const { rerender } = render(
        <AppContext.Provider value={baseContext}>
          <ProfileScreen />
        </AppContext.Provider>
      );

      fireEvent.click(screen.getByRole("button", { name: "RESET SYSTEM" }));
      const dialog = screen.getByRole("dialog", { name: "Reset Program?" });
      fireEvent.click(
        within(dialog).getByRole("button", { name: "Reset Program" })
      );

      expect(handleResetSystem).toHaveBeenCalledTimes(1);

      // Simulate optimistic resetProgram setting userData.profile & plan to null while App pins ProfileScreen
      expect(() =>
        rerender(
          <AppContext.Provider
            value={{
              ...baseContext,
              userData: {
                profile: null,
                plan: null,
                history: baseContext.userData.history,
              },
            }}
          >
            <ProfileScreen />
          </AppContext.Provider>
        )
      ).not.toThrow();

      const openDialog = screen.getByRole("dialog", { name: "Reset Program?" });
      const resettingBtn = within(openDialog).getByRole("button", {
        name: /resetting/i,
      });
      expect(resettingBtn.disabled).toBe(true);
      expect(resettingBtn.getAttribute("aria-busy")).toBe("true");

      // Simulate Firestore rejection + rollback restoring profile
      await act(async () => {
        firstResetDeferred.reject(new Error("Optimistic reset failed"));
        await Promise.resolve();
      });

      rerender(
        <AppContext.Provider value={baseContext}>
          <ProfileScreen />
        </AppContext.Provider>
      );

      const alert = await within(
        screen.getByRole("dialog", { name: "Reset Program?" })
      ).findByRole("alert");
      expect(alert.textContent).toContain("Optimistic reset failed");
      expect(screen.getByText("Build Muscle")).toBeTruthy();

      const retryBtn = within(
        screen.getByRole("dialog", { name: "Reset Program?" })
      ).getByRole("button", { name: "Retry" });
      expect(retryBtn.disabled).toBe(false);

      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Reset Program?" })
        ).toBeNull();
      });
      expect(handleResetSystem).toHaveBeenCalledTimes(2);
    });
  });

  describe("Delete Account modal integration", () => {
    it("opens DeleteAccountModal with password re-auth and executes reauthenticate -> deleteAll -> deleteAccount -> clearStorage in order", async () => {
      const callOrder = [];
      const clearStorage = vi.fn(() => callOrder.push("clearStorage"));
      const deleteAll = vi.fn(async () => {
        callOrder.push("deleteAll");
        return { deletedWorkoutsCount: 0 };
      });
      authServiceMock.reauthenticate.mockImplementationOnce(async () => {
        callOrder.push("reauthenticate");
      });
      authServiceMock.deleteAccount.mockImplementationOnce(async () => {
        callOrder.push("deleteAccount");
      });

      render(
        <AppContext.Provider
          value={createContextValue({ clearStorage, deleteAll })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      expect(
        screen.queryByRole("dialog", { name: "Delete Account?" })
      ).toBeNull();

      fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));

      const dialog = screen.getByRole("dialog", { name: "Delete Account?" });
      const passwordInput = within(dialog).getByLabelText("Confirm Password");
      const confirmBtn = within(dialog).getByRole("button", {
        name: "Confirm Delete",
      });
      expect(confirmBtn.disabled).toBe(true);

      fireEvent.change(passwordInput, { target: { value: "my-secret" } });
      expect(confirmBtn.disabled).toBe(false);

      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(
          screen.queryByRole("dialog", { name: "Delete Account?" })
        ).toBeNull();
      });
      expect(authServiceMock.reauthenticate).toHaveBeenCalledWith("my-secret");
      expect(deleteAll).toHaveBeenCalledTimes(1);
      expect(authServiceMock.deleteAccount).toHaveBeenCalledTimes(1);
      expect(clearStorage).toHaveBeenCalledTimes(1);
      expect(callOrder).toEqual([
        "reauthenticate",
        "deleteAll",
        "deleteAccount",
        "clearStorage",
      ]);
    });
  });

  describe("LOGOUT flow", () => {
    it("disables button with Logging out... and aria-busy while pending, blocks double-clicks, and clears active storage on success", async () => {
      const deferred = createDeferred();
      authServiceMock.logout.mockReturnValueOnce(deferred.promise);
      const clearStorage = vi.fn();
      const deleteAll = vi.fn();

      localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
      localStorage.setItem("fitgen-active", JSON.stringify({ legacy: true }));
      localStorage.setItem("fitgen-active-w1-d1", "{}");
      localStorage.setItem("theme", "dark");

      render(
        <AppContext.Provider
          value={createContextValue({ clearStorage, deleteAll })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      fireEvent.click(screen.getByRole("button", { name: "LOGOUT" }));

      const loggingOutBtn = screen.getByRole("button", {
        name: /logging out/i,
      });
      expect(loggingOutBtn.disabled).toBe(true);
      expect(loggingOutBtn.getAttribute("aria-busy")).toBe("true");

      fireEvent.click(loggingOutBtn);
      expect(authServiceMock.logout).toHaveBeenCalledTimes(1);

      await act(async () => {
        deferred.resolve(undefined);
        await deferred.promise;
      });

      expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
      expect(localStorage.getItem("fitgen-active")).toBeNull();
      expect(localStorage.getItem("fitgen-active-w1-d1")).toBeNull();
      expect(localStorage.getItem("theme")).toBe("dark");
      expect(clearStorage).toHaveBeenCalledTimes(1);
      expect(deleteAll).not.toHaveBeenCalled();
      expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
    });

    it("shows role=alert error banner with Retry button and preserves active storage when logout fails, then retries cleanly", async () => {
      const consoleErrorSpy = vi
        .spyOn(console, "error")
        .mockImplementation(() => {});
      authServiceMock.logout
        .mockRejectedValueOnce(new Error("Offline"))
        .mockResolvedValueOnce(undefined);
      const clearStorage = vi.fn();

      localStorage.setItem("fitgen:active:v1", JSON.stringify({ weekNumber: 1 }));
      localStorage.setItem("fitgen-active", JSON.stringify({ legacy: true }));

      try {
        render(
          <AppContext.Provider value={createContextValue({ clearStorage })}>
            <ProfileScreen />
          </AppContext.Provider>
        );

        fireEvent.click(screen.getByRole("button", { name: "LOGOUT" }));

        const alert = await screen.findByRole("alert");
        expect(alert.textContent).toContain(
          "Failed to log out. Please try again."
        );
        expect(localStorage.getItem("fitgen:active:v1")).not.toBeNull();
        expect(localStorage.getItem("fitgen-active")).not.toBeNull();
        expect(clearStorage).not.toHaveBeenCalled();

        const retryBtn = screen.getByRole("button", { name: "Retry" });
        fireEvent.click(retryBtn);

        await waitFor(() => {
          expect(screen.queryByRole("alert")).toBeNull();
        });
        expect(authServiceMock.logout).toHaveBeenCalledTimes(2);
        expect(localStorage.getItem("fitgen:active:v1")).toBeNull();
        expect(localStorage.getItem("fitgen-active")).toBeNull();
        expect(clearStorage).toHaveBeenCalledTimes(1);
      } finally {
        consoleErrorSpy.mockRestore();
      }
    });
  });

  describe("exclusions and priorities display", () => {
    it.each([
      { label: "empty string", value: "" },
      { label: "whitespace string", value: "   " },
      { label: "legacy empty array", value: [] },
      { label: "legacy empty and None array", value: ["", "None"] },
      { label: "canonical None", value: "None" },
      { label: "lowercase none", value: "none" },
      { label: "null", value: null },
      { label: "undefined", value: undefined },
    ])(
      'displays "No exclusions requested" and "No priorities requested" when values are $label',
      ({ value }) => {
        const base = createContextValue();
        render(
          <AppContext.Provider
            value={createContextValue({
              userData: {
                ...base.userData,
                profile: {
                  ...base.userData.profile,
                  exclusions: value,
                  priorities: value,
                },
              },
            })}
          >
            <ProfileScreen />
          </AppContext.Provider>
        );

        expect(screen.getByText("No exclusions requested")).toBeTruthy();
        expect(screen.getByText("No priorities requested")).toBeTruthy();
        expect(screen.queryByText(/Exclusions:/i)).toBeNull();
        expect(screen.queryByText(/Priorities:/i)).toBeNull();
        expect(screen.queryByText(/undefined/i)).toBeNull();
        expect(screen.queryByText(/null/i)).toBeNull();
      }
    );

    it("displays trimmed non-empty string exclusions and priorities", () => {
      const base = createContextValue();
      render(
        <AppContext.Provider
          value={createContextValue({
            userData: {
              ...base.userData,
              profile: {
                ...base.userData.profile,
                exclusions: "knee pain",
                priorities: "  legs, back  ",
              },
            },
          })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      const exclusionsItem = screen.getByText("Exclusions: knee pain");
      const prioritiesItem = screen.getByText("Priorities: legs, back");
      expect(exclusionsItem.textContent).toBe("Exclusions: knee pain");
      expect(prioritiesItem.textContent).toBe("Priorities: legs, back");
      expect(screen.queryByText("No exclusions requested")).toBeNull();
      expect(screen.queryByText("No priorities requested")).toBeNull();
    });

    it("displays joined legacy non-empty array exclusions and priorities", () => {
      const base = createContextValue();
      render(
        <AppContext.Provider
          value={createContextValue({
            userData: {
              ...base.userData,
              profile: {
                ...base.userData.profile,
                exclusions: ["knee pain", "shoulder"],
                priorities: ["legs", "core"],
              },
            },
          })}
        >
          <ProfileScreen />
        </AppContext.Provider>
      );

      expect(screen.getByText("Exclusions: knee pain, shoulder")).toBeTruthy();
      expect(screen.getByText("Priorities: legs, core")).toBeTruthy();
    });
  });
});

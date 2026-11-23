// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

const authServiceMock = vi.hoisted(() => ({
  logout: vi.fn(),
  deleteAccount: vi.fn(),
}));

const firestoreServiceMock = vi.hoisted(() => ({
  clearUserData: vi.fn(),
}));

vi.mock("../../services/firebase/authServices", () => ({
  authService: authServiceMock,
}));

vi.mock("../../services/firebase/firestoreServices", () => ({
  firestoreService: firestoreServiceMock,
}));

vi.mock("../../services/api/emailService", () => ({
  default: vi.fn(),
}));

import ProfileScreen from "./ProfileScreen";

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
    handleResetSystem: vi.fn(),
    clearStorage: vi.fn(),
    ...overrides,
  };
}

describe("ProfileScreen", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    authServiceMock.logout.mockResolvedValue(undefined);
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

  it("invokes authService.logout when LOGOUT is clicked", () => {
    render(
      <AppContext.Provider value={createContextValue()}>
        <ProfileScreen />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "LOGOUT" }));

    expect(authServiceMock.logout).toHaveBeenCalledTimes(1);
    expect(firestoreServiceMock.clearUserData).not.toHaveBeenCalled();
    expect(authServiceMock.deleteAccount).not.toHaveBeenCalled();
  });

  it("opens the Delete Account confirmation modal when DELETE ACCOUNT is clicked", () => {
    render(
      <AppContext.Provider value={createContextValue()}>
        <ProfileScreen />
      </AppContext.Provider>
    );

    expect(screen.queryByRole("dialog", { name: "Delete Account?" })).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "DELETE ACCOUNT" }));

    expect(
      screen.getByRole("dialog", { name: "Delete Account?" })
    ).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(screen.queryByRole("dialog", { name: "Delete Account?" })).toBeNull();
  });
});

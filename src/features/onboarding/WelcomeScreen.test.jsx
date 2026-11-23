// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../../context/AppContext";

vi.mock("../../services/firebase/authServices", () => ({
  authService: {
    logout: vi.fn(),
  },
}));

vi.mock("../../services/firebase/firestoreServices", () => ({
  firestoreService: {
    clearUserData: vi.fn(),
  },
}));

vi.mock("../../services/api/emailService", () => ({
  default: vi.fn(),
}));

import WelcomeScreen from "./WelcomeScreen";

describe("WelcomeScreen", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders only the Initialize Account button", () => {
    render(
      <AppContext.Provider value={{ setShowAuth: vi.fn() }}>
        <WelcomeScreen />
      </AppContext.Provider>
    );

    const buttons = screen.getAllByRole("button");
    expect(buttons).toHaveLength(1);
    expect(buttons[0].textContent).toBe("Initialize Account");
  });

  it("opens the auth modal when Initialize Account is clicked", () => {
    const setShowAuth = vi.fn();

    render(
      <AppContext.Provider value={{ setShowAuth }}>
        <WelcomeScreen />
      </AppContext.Provider>
    );

    fireEvent.click(screen.getByRole("button", { name: "Initialize Account" }));

    expect(setShowAuth).toHaveBeenCalledTimes(1);
    expect(setShowAuth).toHaveBeenCalledWith(true);
  });
});

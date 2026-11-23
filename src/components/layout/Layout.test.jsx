// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { AppContext } from "../../context/AppContext";
import Layout from "./Layout";

describe("Layout", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders child content and bottom navigation when view is plan", () => {
    const setView = vi.fn();

    render(
      <AppContext.Provider value={{ view: "plan", setView }}>
        <Layout>
          <div>Dashboard Content</div>
        </Layout>
      </AppContext.Provider>
    );

    expect(screen.getByText("Dashboard Content")).toBeTruthy();
    const planButton = screen.getByRole("button", { name: "PLAN" });
    const logsButton = screen.getByRole("button", { name: "LOGS" });
    const profileButton = screen.getByRole("button", { name: "PROFILE" });

    expect(planButton).toBeTruthy();
    expect(logsButton).toBeTruthy();
    expect(profileButton).toBeTruthy();

    fireEvent.click(logsButton);
    expect(setView).toHaveBeenCalledWith("logs");
  });

  it("does not render any SYNC button or banner prompt", () => {
    render(
      <AppContext.Provider value={{ view: "plan", setView: vi.fn() }}>
        <Layout>
          <div>Dashboard Content</div>
        </Layout>
      </AppContext.Provider>
    );

    expect(screen.queryByRole("button", { name: "SYNC" })).toBeNull();
    expect(screen.queryByText(/login or signup to sync data/i)).toBeNull();
    expect(screen.getAllByRole("button")).toHaveLength(3);
  });

  it("hides bottom navigation when view is active", () => {
    render(
      <AppContext.Provider value={{ view: "active", setView: vi.fn() }}>
        <Layout>
          <div>Active Workout Content</div>
        </Layout>
      </AppContext.Provider>
    );

    expect(screen.getByText("Active Workout Content")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "PLAN" })).toBeNull();
    expect(screen.queryByRole("button", { name: "LOGS" })).toBeNull();
    expect(screen.queryByRole("button", { name: "PROFILE" })).toBeNull();
    expect(screen.queryAllByRole("button")).toHaveLength(0);
  });
});

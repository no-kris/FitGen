// @vitest-environment jsdom
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  render,
  screen,
  fireEvent,
  waitFor,
  act,
  cleanup,
} from "@testing-library/react";

const MODAL_MODULE_PATH = "./DeleteAccountModal.jsx";

async function loadDeleteAccountModal() {
  try {
    const mod = await import(MODAL_MODULE_PATH);
    return mod.default ?? null;
  } catch {
    return null;
  }
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

describe("DeleteAccountModal", () => {
  beforeEach(() => {
    vi.resetAllMocks();
  });

  afterEach(() => {
    cleanup();
  });

  it("renders accessible dialog, Confirm Password input, show/hide toggle, and disables Confirm Delete when password is empty", async () => {
    const DeleteAccountModal = await loadDeleteAccountModal();
    expect(DeleteAccountModal).not.toBeNull();

    render(
      <DeleteAccountModal
        isOpen
        onClose={vi.fn()}
        onConfirmDelete={vi.fn()}
      />
    );

    expect(
      screen.getByRole("dialog", { name: "Delete Account?" })
    ).toBeTruthy();

    const passwordInput = screen.getByLabelText("Confirm Password");
    expect(passwordInput.getAttribute("type")).toBe("password");

    const confirmBtn = screen.getByRole("button", { name: "Confirm Delete" });
    expect(confirmBtn.disabled).toBe(true);

    const toggleBtn = screen.getByRole("button", { name: "Show password" });
    fireEvent.click(toggleBtn);
    expect(passwordInput.getAttribute("type")).toBe("text");
    expect(screen.getByRole("button", { name: "Hide password" })).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Hide password" }));
    expect(passwordInput.getAttribute("type")).toBe("password");

    fireEvent.change(passwordInput, { target: { value: "my-password" } });
    expect(confirmBtn.disabled).toBe(false);
  });

  it("disables controls, shows Deleting... with aria-busy, blocks close and double-submit while pending, and closes on success", async () => {
    const DeleteAccountModal = await loadDeleteAccountModal();
    expect(DeleteAccountModal).not.toBeNull();

    const deferred = createDeferred();
    const onConfirmDelete = vi.fn(() => deferred.promise);
    const onClose = vi.fn();

    render(
      <DeleteAccountModal
        isOpen
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    const passwordInput = screen.getByLabelText("Confirm Password");
    fireEvent.change(passwordInput, { target: { value: "secret123" } });

    const confirmBtn = screen.getByRole("button", { name: "Confirm Delete" });
    fireEvent.click(confirmBtn);

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(onConfirmDelete).toHaveBeenCalledWith("secret123");

    const deletingBtn = screen.getByRole("button", { name: /deleting/i });
    expect(deletingBtn.disabled).toBe(true);
    expect(deletingBtn.getAttribute("aria-busy")).toBe("true");
    expect(passwordInput.disabled).toBe(true);
    expect(
      screen.getByRole("button", { name: "Show password" }).disabled
    ).toBe(true);
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(true);

    // Block double-submit and all dismissal paths while pending
    fireEvent.click(deletingBtn);
    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    fireEvent.click(screen.getByRole("button", { name: "Close modal" }));
    const dialog = screen.getByRole("dialog", { name: "Delete Account?" });
    fireEvent.click(dialog.parentElement);

    expect(onConfirmDelete).toHaveBeenCalledTimes(1);
    expect(onClose).not.toHaveBeenCalled();

    await act(async () => {
      deferred.resolve({ deleted: true });
      await deferred.promise;
    });

    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("keeps modal open on failure, displays role=alert error, switches button to Retry, and succeeds on retry", async () => {
    const DeleteAccountModal = await loadDeleteAccountModal();
    expect(DeleteAccountModal).not.toBeNull();

    const onConfirmDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error("Incorrect password. Please try again."))
      .mockResolvedValueOnce({ deleted: true });
    const onClose = vi.fn();

    render(
      <DeleteAccountModal
        isOpen
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    const passwordInput = screen.getByLabelText("Confirm Password");
    fireEvent.change(passwordInput, { target: { value: "wrong-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    const alert = await screen.findByRole("alert");
    expect(alert.textContent).toContain("Incorrect password. Please try again.");
    expect(onClose).not.toHaveBeenCalled();
    expect(passwordInput.disabled).toBe(false);
    expect(passwordInput.getAttribute("aria-invalid")).toBe("true");
    expect(screen.getByRole("button", { name: "Cancel" }).disabled).toBe(false);

    const retryBtn = screen.getByRole("button", { name: "Retry" });
    expect(retryBtn.disabled).toBe(false);

    fireEvent.click(retryBtn);

    await waitFor(() => {
      expect(onClose).toHaveBeenCalledTimes(1);
    });
    expect(onConfirmDelete).toHaveBeenCalledTimes(2);
    expect(onConfirmDelete).toHaveBeenLastCalledWith("wrong-pass");
  });

  it("resets password and stale error when closed and reopened", async () => {
    const DeleteAccountModal = await loadDeleteAccountModal();
    expect(DeleteAccountModal).not.toBeNull();

    const onConfirmDelete = vi
      .fn()
      .mockRejectedValueOnce(new Error("Incorrect password. Please try again."));
    const onClose = vi.fn();

    const { rerender } = render(
      <DeleteAccountModal
        isOpen
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    const passwordInput = screen.getByLabelText("Confirm Password");
    fireEvent.change(passwordInput, { target: { value: "stale-pass" } });
    fireEvent.click(screen.getByRole("button", { name: "Confirm Delete" }));

    await screen.findByRole("alert");

    fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <DeleteAccountModal
        isOpen={false}
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );
    rerender(
      <DeleteAccountModal
        isOpen
        onClose={onClose}
        onConfirmDelete={onConfirmDelete}
      />
    );

    const reopenedInput = screen.getByLabelText("Confirm Password");
    expect(reopenedInput.value).toBe("");
    expect(screen.queryByRole("alert")).toBeNull();
    expect(
      screen.getByRole("button", { name: "Confirm Delete" }).disabled
    ).toBe(true);
  });
});

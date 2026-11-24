import { useRef, useState } from "react";
import {
  Dumbbell,
  Settings,
  LogOut,
  Loader2,
  Scale,
  Weight,
} from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import TextInput from "../ui/TextInput";
import DeleteAccountModal from "../../features/auth/DeleteAccountModal";
import { useAuth } from "../../hooks/useAuth";
import { useAppContext } from "../../context/AppContext";
import normalizeProfileText from "../../utils/normalizeProfileText";

export default function ProfileScreen() {
  const {
    userData,
    handleResetSystem: onResetSystem,
    user,
    clearStorage,
    deleteAll,
    isSynced = true,
    syncError = null,
    retrySync,
  } = useAppContext();
  const profile = userData.profile;
  const { handleLogout, handleDeleteAccount } = useAuth({
    user,
    clearStorage,
    deleteAll,
  });
  const [activeModal, setActiveModal] = useState(null); // 'reset' | 'report' | 'delete-account' | null
  const [reportReason, setReportReason] = useState("");
  const [isResetting, setIsResetting] = useState(false);
  const [resetError, setResetError] = useState(null);
  const isResettingRef = useRef(false);
  const [isLoggingOut, setIsLoggingOut] = useState(false);
  const [logoutError, setLogoutError] = useState(null);
  const isLoggingOutRef = useRef(false);

  const isSyncFailed = Boolean(user && !isSynced && syncError);
  const isSyncPending = Boolean(user && !isSynced && !syncError);

  const goal = profile?.goal ?? "";
  const level = profile?.level ?? "";
  const selectedDaysCount = Array.isArray(profile?.selectedDays)
    ? profile.selectedDays.length
    : 0;
  const equipment = profile?.equipment ?? "";

  const Icon =
    goal.toLowerCase() === "build muscle"
      ? Dumbbell
      : goal.toLowerCase() === "lose weight"
      ? Scale
      : Weight;

  const exclusions = normalizeProfileText(profile?.exclusions);
  const priorities = normalizeProfileText(profile?.priorities);

  const planDetails = [
    `Equipment: ${equipment}`,
    exclusions !== "None"
      ? `Exclusions: ${exclusions}`
      : "No exclusions requested",
    priorities !== "None"
      ? `Priorities: ${priorities}`
      : "No priorities requested",
  ];

  const handleCloseResetModal = () => {
    if (isResettingRef.current || isResetting) {
      return;
    }
    setResetError(null);
    setActiveModal(null);
  };

  const handleConfirmReset = async () => {
    if (isResettingRef.current) {
      return;
    }
    isResettingRef.current = true;
    setIsResetting(true);
    setResetError(null);
    try {
      await onResetSystem();
      setActiveModal(null);
    } catch (error) {
      setResetError(
        error?.message || "Failed to reset program. Please try again."
      );
    } finally {
      isResettingRef.current = false;
      setIsResetting(false);
    }
  };

  const handleLogoutClick = async () => {
    if (isLoggingOutRef.current) {
      return;
    }
    isLoggingOutRef.current = true;
    setIsLoggingOut(true);
    setLogoutError(null);
    try {
      await handleLogout();
    } catch (error) {
      setLogoutError(error?.message || "Failed to log out. Please try again.");
    } finally {
      isLoggingOutRef.current = false;
      setIsLoggingOut(false);
    }
  };

  const handleReport = () => {
    const subject = encodeURIComponent("FitGen App Report");
    const body = encodeURIComponent(reportReason);
    const email = import.meta.env.VITE_DEV_EMAIL;
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setActiveModal(null);
    setReportReason("");
  };

  return (
    <>
      <div className="flex flex-col">
        <div className="text-center mt-6">
          <div className="card p-6 mb-8">
            <Icon size={46} className="mb-4 text-primary" />
            <h2 className="text-2xl font-bold mb-2 uppercase">
              {goal}
            </h2>
            <p className="text-base text-muted uppercase">
              {level} // {selectedDaysCount} DAYS/WEEK
            </p>
            <div className="flex flex-col text-center gap-4 mt-4">
              <ul className="text-lg font-bold text-primary uppercase letter-spacing-2 line-height-2 list-none">
                {planDetails.map((detail, index) => (
                  <li key={index} className="mb-2 text-left">
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </div>
      <div className="flex flex-col h-full">
        <div>
          {isSyncFailed && (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3 mb-4"
            >
              <span className="text-lg font-bold">
                {syncError?.message || "Failed to sync your cloud data."}
              </span>
              <Button
                text="Retry Sync"
                onClick={() => retrySync?.()}
                className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
              />
            </div>
          )}
          {isSyncPending && (
            <div
              role="status"
              aria-live="polite"
              className="card p-3 mb-4 flex items-center justify-center gap-2 text-muted text-lg font-bold"
            >
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              <span>Syncing your cloud data...</span>
            </div>
          )}
          {logoutError && (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3 mb-4"
            >
              <span className="text-lg font-bold">{logoutError}</span>
              <Button
                text="Retry"
                onClick={handleLogoutClick}
                disabled={isLoggingOut}
                className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
              />
            </div>
          )}
          <Button
            text="RESET SYSTEM"
            onClick={() => {
              setResetError(null);
              setActiveModal("reset");
            }}
            className="button btn-danger w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
          />
          <Button
            text={
              isLoggingOut ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2
                    className="animate-spin"
                    size={16}
                    aria-hidden="true"
                  />
                  Logging out...
                </span>
              ) : (
                "LOGOUT"
              )
            }
            onClick={handleLogoutClick}
            Icon={isLoggingOut ? null : LogOut}
            iconSize={20}
            disabled={isLoggingOut}
            aria-busy={isLoggingOut}
            className="flex items-center justify-center gap-2 button btn-secondary w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
          />
        </div>

        <div className="flex justify-between pb-4">
          <Button
            text="PRIVACY POLICY"
            onClick={() =>
              window.open(
                "https://docs.google.com/document/d/e/2PACX-1vQIArxvMDxCVizYEzY1IgbwGab-v29NuDK43yi6oeIvZZxDmwIBbj_68wbUIsTdFOWQSC9sUbzSrdHX/pub",
                "_blank",
                "noopener,noreferrer"
              )
            }
            className="text-success uppercase"
          />
          <Button
            text="DELETE ACCOUNT"
            onClick={() => setActiveModal("delete-account")}
            className="text-error uppercase"
          />
          <Button
            text="File REPORT"
            onClick={() => setActiveModal("report")}
            className="text-primary uppercase"
          />
        </div>
      </div>

      {activeModal === "delete-account" && (
        <DeleteAccountModal
          isOpen
          onClose={() => setActiveModal(null)}
          onConfirmDelete={handleDeleteAccount}
        />
      )}

      <Modal
        isOpen={activeModal === "reset"}
        onClose={handleCloseResetModal}
        title="Reset Program?"
      >
        <div className="flex flex-col gap-4">
          <p className="text-lg">
            Are you sure you want to reset your current program? Your workout
            plan and profile will be cleared, but your workout history will be
            preserved.
          </p>
          {isSyncFailed && (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3"
            >
              <span className="text-lg font-bold">
                {syncError?.message || "Failed to sync your cloud data."}
              </span>
              <Button
                text="Retry Sync"
                onClick={() => retrySync?.()}
                className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
              />
            </div>
          )}
          {isSyncPending && (
            <div
              role="status"
              aria-live="polite"
              className="card p-3 flex items-center justify-center gap-2 text-muted text-lg font-bold"
            >
              <Loader2 className="animate-spin" size={16} aria-hidden="true" />
              <span>Still syncing your cloud data...</span>
            </div>
          )}
          {resetError && (
            <div role="alert" className="alert-error text-lg font-bold">
              {resetError}
            </div>
          )}
          <div className="flex justify-center w-full gap-2">
            <Button
              text="Cancel"
              onClick={handleCloseResetModal}
              disabled={isResetting}
              className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            />
            <Button
              text={
                isResetting ? (
                  <span className="flex items-center justify-center gap-2">
                    <Loader2
                      className="animate-spin"
                      size={16}
                      aria-hidden="true"
                    />
                    Resetting...
                  </span>
                ) : resetError ? (
                  "Retry"
                ) : (
                  "Reset Program"
                )
              }
              onClick={handleConfirmReset}
              disabled={isResetting || isSyncPending || isSyncFailed}
              aria-busy={isResetting}
              className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "report"}
        onClose={() => setActiveModal(null)}
        title="File Report"
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted line-height-2 letter-spacing-2">
            Describe the issue you are experiencing. This will open your default
            email client.
          </p>
          <TextInput
            placeholder="Reason for report..."
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="input input-bordered w-full text-primary"
          />
          <div className="flex justify-end gap-2">
            <Button
              text="Cancel"
              onClick={() => setActiveModal(null)}
              className="button btn-muted font-bold text-lg uppercase p-3"
            />
            <Button
              text="Submit"
              className="button btn-primary font-bold text-lg uppercase p-3"
              onClick={handleReport}
              disabled={!reportReason.trim()}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

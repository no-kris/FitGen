import { Loader2, RotateCcw, Shuffle } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useRef, useState } from "react";

export default function DayDetailModal({
  isOpen,
  onClose,
  details,
  onReplaceExercise,
  isSyncPending = false,
  isSyncFailed = false,
  syncError = null,
  onRetrySync,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  const [isReplacing, setIsReplacing] = useState(false);
  const [pendingSwap, setPendingSwap] = useState(null);
  const [swapError, setSwapError] = useState(null);
  const [failedSwap, setFailedSwap] = useState(null);
  const isReplacingRef = useRef(false);

  if (!isOpen || !details) return null;

  const exercises = Array.isArray(details.exercises) ? details.exercises : [];

  const handleClose = () => {
    if (isReplacingRef.current || isReplacing) {
      return;
    }
    setExpandedIndex(null);
    setSwapError(null);
    setFailedSwap(null);
    onClose();
  };

  const handleExpand = (index) => {
    if (isReplacingRef.current || isReplacing) {
      return;
    }
    setSwapError(null);
    setFailedSwap(null);
    setExpandedIndex((prev) => (prev === index ? null : index));
  };

  const handleSelectAlternative = async (index, alt) => {
    if (isReplacingRef.current || isSyncPending || isSyncFailed) {
      return;
    }
    isReplacingRef.current = true;
    setIsReplacing(true);
    setPendingSwap({ exerciseIndex: index, altName: alt });
    setSwapError(null);

    try {
      await onReplaceExercise(index, alt);
      setExpandedIndex(null);
      setFailedSwap(null);
    } catch (error) {
      setSwapError(
        error?.message || "Failed to replace exercise. Please try again."
      );
      setFailedSwap({ exerciseIndex: index, altName: alt });
    } finally {
      isReplacingRef.current = false;
      setIsReplacing(false);
      setPendingSwap(null);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="WORKOUT DETAILS">
      <div className="view-container p-2">
        <div className="flex flex-col gap-3 justify-between pb-2">
          <div>
            <h1 className="text-3xl font-bold">{details.dayName}</h1>
            <span className="text-primary text-lg">{details.focus}</span>
          </div>

          {isSyncFailed ? (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3"
            >
              <span className="text-lg font-bold">
                {syncError?.message || "Failed to sync your cloud data."}
              </span>
              <Button
                type="button"
                text="Retry Sync"
                onClick={() => onRetrySync?.()}
                className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
              />
            </div>
          ) : (
            isSyncPending && (
              <div
                role="status"
                aria-live="polite"
                className="card p-3 flex items-center justify-center gap-2 text-muted text-lg font-bold"
              >
                <Loader2
                  className="animate-spin"
                  size={16}
                  aria-hidden="true"
                />
                <span>Still syncing your cloud data...</span>
              </div>
            )
          )}

          {swapError && (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3"
            >
              <span className="text-lg font-bold">{swapError}</span>
              {failedSwap && (
                <Button
                  type="button"
                  text="Retry"
                  onClick={() =>
                    handleSelectAlternative(
                      failedSwap.exerciseIndex,
                      failedSwap.altName
                    )
                  }
                  disabled={isReplacing || isSyncPending || isSyncFailed}
                  className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
                />
              )}
            </div>
          )}

          <div>
            {exercises.map((exercise, index) => (
              <div key={index} className="card mb-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h2 className="text-xl font-bold">{exercise.name}</h2>
                    <div>
                      <span className="text-primary text-lg font-bold letter-spacing-2">
                        {exercise.sets} SETS x {exercise.reps} REPS
                      </span>
                    </div>
                  </div>
                  <div>
                    {Array.isArray(exercise.alternatives) &&
                      exercise.alternatives.length > 0 && (
                        <Button
                          type="button"
                          onClick={() => handleExpand(index)}
                          Icon={Shuffle}
                          iconSize={20}
                          disabled={isReplacing}
                          aria-label={`Swap ${exercise.name}`}
                          aria-expanded={expandedIndex === index}
                          className={`px-2 py-1 ${
                            expandedIndex === index
                              ? "text-primary"
                              : "text-muted"
                          }`}
                          text=""
                        />
                      )}
                  </div>
                </div>
                {expandedIndex === index && (
                  <div className="mt-4">
                    <p className="text-base text-muted uppercase letter-spacing-2 mb-4">
                      Select Alternative
                    </p>
                    <div className="flex flex-col gap-5 scrollable-list">
                      {exercise.alternatives.map((alt, altIndex) => {
                        const isThisPending =
                          pendingSwap?.exerciseIndex === index &&
                          pendingSwap?.altName === alt;
                        return (
                          <div key={`${alt}-${altIndex}`}>
                            <Button
                              type="button"
                              text={
                                isThisPending ? (
                                  <span className="flex items-center justify-center gap-2">
                                    <Loader2
                                      className="animate-spin"
                                      size={16}
                                      aria-hidden="true"
                                    />
                                    Swapping...
                                  </span>
                                ) : (
                                  alt
                                )
                              }
                              Icon={isThisPending ? null : RotateCcw}
                              iconSize={16}
                              disabled={
                                isReplacing || isSyncPending || isSyncFailed
                              }
                              aria-busy={isThisPending}
                              className="button btn-primary text-lg letter-spacing-2 font-bold w-full flex items-center gap-2 p-2"
                              onClick={() =>
                                handleSelectAlternative(index, alt)
                              }
                            />
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            type="button"
            text="CLOSE"
            disabled={isReplacing}
            className="button btn-muted p-2 w-full font-bold text-xl uppercase"
            onClick={handleClose}
          />
        </div>
      </div>
    </Modal>
  );
}

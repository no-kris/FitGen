import { ArrowLeft, Loader2 } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import formatTimer from "../../utils/formatTimer";
import WorkoutCard from "./WorkoutCard";
import Modal from "../../components/ui/Modal";
import { useWorkout } from "../../hooks/useWorkout";
import { useAppContext } from "../../context/AppContext";
import { activeWorkoutStore } from "../../services/storage/activeWorkoutStore";

export default function ActiveWorkout() {
  const { activeWorkout: workout, setView } = useAppContext();
  const onClose = () => setView("plan");
  const { handleFinishWorkout } = useWorkout();

  const [logs, setLogs] = useState(
    () =>
      workout.logs ||
      workout.exercises.map((e) => ({
        name: e.name,
        sets: Array.from({ length: parseInt(e.sets) }, () => ({
          weight: "",
          reps: "",
          completed: false,
        })),
      }))
  );
  const [timer, setTimer] = useState(workout.elapsed || 0);
  const [showConfirm, setShowConfirm] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const timerRef = useRef(workout.elapsed || 0);
  const startTimeRef = useRef(null);
  const isSubmittingRef = useRef(false);
  const hasFinishedRef = useRef(false);

  useEffect(() => {
    if (isSaving || hasFinishedRef.current) {
      return;
    }
    startTimeRef.current = Date.now() - timerRef.current * 1000;
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedTime = Math.floor((now - startTimeRef.current) / 1000);
      timerRef.current = elapsedTime;
      setTimer(elapsedTime);
    }, 1000);
    return () => clearInterval(interval);
  }, [isSaving]);

  useEffect(() => {
    if (isSaving || hasFinishedRef.current) {
      return;
    }
    activeWorkoutStore.save({
      weekNumber: workout.weekNumber,
      dayNumber: workout.dayNumber ?? null,
      dayName: workout.dayName ?? "",
      focus: workout.focus ?? "",
      workout,
      logs,
      elapsed: timer,
    });
  }, [logs, timer, workout, isSaving]);

  const handleSaveProgress = () => {
    activeWorkoutStore.save({
      weekNumber: workout.weekNumber,
      dayNumber: workout.dayNumber ?? null,
      dayName: workout.dayName ?? "",
      focus: workout.focus ?? "",
      workout,
      logs,
      elapsed: timer,
    });
    onClose();
  };

  const handleConfirmFinish = async () => {
    if (isSubmittingRef.current) {
      return;
    }
    isSubmittingRef.current = true;
    setIsSaving(true);
    setSaveError(null);

    try {
      const saved = await handleFinishWorkout({
        workout,
        logs,
        duration: timer,
      });
      if (saved) {
        hasFinishedRef.current = true;
        setShowConfirm(null);
      }
    } catch (error) {
      setSaveError(
        error?.message || "Failed to save workout. Please try again."
      );
    } finally {
      isSubmittingRef.current = false;
      setIsSaving(false);
    }
  };

  return (
    <>
      <div className="flex flex-col h-full">
        <div className="p-4 border-b flex items-center justify-between sticky">
          <Button
            onClick={() => setShowConfirm("exit")}
            Icon={ArrowLeft}
            iconSize={24}
            text=""
            className="text-muted"
            disabled={isSaving}
            aria-label="Exit workout"
          />
          <div className="text-center flex flex-col gap-2">
            <span className="text-xl font-bold text-primary">
              {formatTimer(timer)}
            </span>
          </div>
          <Button
            text="FINISH"
            onClick={() => {
              setSaveError(null);
              setShowConfirm("finish");
            }}
            className="text-lg bg-primary text-dark p-2 letter-spacing-2"
            disabled={isSaving}
            aria-busy={isSaving}
          />
        </div>

        <div className="p-4 flex flex-col gap-4">
          {saveError && !showConfirm && (
            <div
              role="alert"
              className="alert-error flex items-center justify-between gap-3"
            >
              <span className="text-lg font-bold">{saveError}</span>
              <Button
                text="Retry"
                onClick={handleConfirmFinish}
                disabled={isSaving}
                className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2"
              />
            </div>
          )}
          <WorkoutCard workout={workout} logs={logs} setLogs={setLogs} />
        </div>
      </div>

      <Modal
        isOpen={Boolean(showConfirm)}
        onClose={() => {
          if (!isSaving) {
            setShowConfirm(null);
          }
        }}
        title="Confirm Action"
      >
        <div className="flex flex-col gap-3">
          <p className="text-lg font-bold">{`${
            showConfirm === "exit" ? "Save progress?" : "Finished workout?"
          }`}</p>
          {showConfirm === "finish" && saveError && (
            <div role="alert" className="alert-error text-lg font-bold">
              {saveError}
            </div>
          )}
          <div className="flex justify-center w-full gap-2">
            <Button
              text="Cancel"
              onClick={() => setShowConfirm(null)}
              disabled={isSaving}
              className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            />
            {showConfirm === "exit" ? (
              <>
                <Button
                  text="Save"
                  onClick={handleSaveProgress}
                  className="button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
                />
                <Button
                  text="Discard"
                  onClick={() => {
                    activeWorkoutStore.clear();
                    onClose();
                  }}
                  className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
                />
              </>
            ) : (
              <Button
                text={
                  isSaving ? (
                    <span className="flex items-center justify-center gap-2">
                      <Loader2
                        className="animate-spin"
                        size={16}
                        aria-hidden="true"
                      />
                      Saving...
                    </span>
                  ) : saveError ? (
                    "Retry"
                  ) : (
                    "Finish"
                  )
                }
                onClick={handleConfirmFinish}
                disabled={isSaving}
                aria-busy={isSaving}
                className="button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}

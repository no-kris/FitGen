import { ArrowLeft, Weight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import Button from "../../components/ui/Button";
import formatTimer from "../../utils/formatTimer";
import WorkoutCard from "./WorkoutCard";
import Modal from "../../components/ui/Modal";
import { useWorkout } from "../../hooks/useWorkout";
import { useAppContext } from "../../context/AppContext";

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
  //  `useRef` discards the value on subsequent renders.
  // eslint-disable-next-line
  const startTimeRef = useRef(Date.now() - timer * 1000);

  useEffect(() => {
    const interval = setInterval(() => {
      const now = Date.now();
      const elapsedtime = Math.floor((now - startTimeRef.current) / 1000);
      setTimer(elapsedtime);
    }, 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "fitgen-active",
      JSON.stringify({ workout, logs, elapsed: timer })
    );
  }, [logs, timer, workout]);

  const handleSaveProgress = () => {
    try {
      const stored = localStorage.getItem("fitgen-active");
      const currentWorkout = stored ? JSON.parse(stored) : null;

      const updatedWorkout = {
        ...(currentWorkout || { workout }), // Fallback to current props if LS is missing
        elapsed: timer,
        logs,
      };
      localStorage.setItem("fitgen-active", JSON.stringify(updatedWorkout));
    } catch (e) {
      console.error("Error saving progress", e);
    }
    onClose();
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
          />
          <div className="text-center flex flex-col gap-2">
            <span className="text-xl font-bold text-primary">
              {formatTimer(timer)}
            </span>
          </div>
          <Button
            text="FINISH"
            onClick={() => setShowConfirm("finish")}
            className="text-lg bg-primary text-dark p-2 letter-spacing-2"
          />
        </div>

        <div className="p-4 flex flex-col gap-4">
          <WorkoutCard workout={workout} logs={logs} setLogs={setLogs} />
        </div>
      </div>

      <Modal
        isOpen={showConfirm}
        onClose={() => setShowConfirm(null)}
        title="Confirm Action"
        children={
          <div className="flex flex-col gap-2">
            <p className="text-lg font-bold">{`${
              showConfirm === "exit" ? "Save progress?" : "Finished workout?"
            }`}</p>
            <div className="flex justify-center w-full gap-2">
              <Button
                text="Cancel"
                onClick={() => setShowConfirm(null)}
                className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
              <Button
                text={showConfirm === "exit" ? "Save" : "Finish"}
                onClick={
                  showConfirm === "exit"
                    ? () => handleSaveProgress()
                    : () =>
                        handleFinishWorkout({
                          workout,
                          logs,
                          duration: timer,
                        })
                }
                className="button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
              {showConfirm === "exit" && (
                <Button
                  text="Discard"
                  onClick={() => {
                    localStorage.removeItem("fitgen-active");
                    onClose();
                  }}
                  className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
                />
              )}
            </div>
          </div>
        }
      />
    </>
  );
}

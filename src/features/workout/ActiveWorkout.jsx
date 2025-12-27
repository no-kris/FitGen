import { ArrowLeft, Weight } from "lucide-react";
import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import formatTimer from "../../utils/formatTimer";
import WorkoutCard from "./WorkoutCard";

export default function ActiveWorkout({ workout, onFinish, onClose }) {
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

  useEffect(() => {
    const interval = setInterval(() => setTimer((t) => t + 1), 1000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    localStorage.setItem(
      "fitgen-active",
      JSON.stringify({ workout, logs, elapsed: timer })
    );
  }, [logs, timer, workout]);

  return (
    <div className="flex flex-col h-full">
      <div className="p-4 border-b flex items-center justify-between sticky">
        <Button
          onClick={() => onClose()}
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
          onClick={() => onClose()}
          className="text-lg bg-primary text-dark p-2 letter-spacing-2"
        />
      </div>

      <div className="p-4 flex flex-col gap-4">
        <WorkoutCard workout={workout} logs={logs} setLogs={setLogs} />
      </div>
    </div>
  );
}

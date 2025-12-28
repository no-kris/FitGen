import { ArrowRightCircle, Clock, PlusCircle, Trash } from "lucide-react";
import { useEffect, useState } from "react";
import formatTimer from "../../utils/formatTimer";
import Button from "../../components/ui/Button";

export default function RestTimer({ restTime, onRestComplete }) {
  const [timeLeft, setTimeLeft] = useState(restTime);

  useEffect(() => {
    if (timeLeft <= 0) {
      onRestComplete();
    }
  }, [timeLeft, onRestComplete]);

  const triggerHaptic = () => {
    if (typeof navigator !== "undefined" && navigator.vibrate) {
      navigator.vibrate(50);
    }
  };

  useEffect(() => {
    const timer = setInterval(() => {
      setTimeLeft((prevTime) => prevTime - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, []);

  return (
    <div className="rest-timer-overlay">
      <div className="flex justify-center gap-4 items-center">
        <div className="flex items-center gap-3">
          <div className="relative">
            <Clock
              size={24}
              className="text-primary animate-spin"
              style={{ animationDuration: "3s" }}
            />
          </div>
          <div className="flex flex-col">
            <span className="text-lg text-muted font-bold uppercase tracking-wider">
              Resting
            </span>
            <span className="text-2xl font-bold text-white">
              {formatTimer(timeLeft)}
            </span>
          </div>
        </div>
        <div className="flex gap-4 justify-center items-center">
          <Button
            onClick={() => {
              triggerHaptic();
              setTimeLeft((t) => t + 30);
            }}
            text="+30s"
            Icon={PlusCircle}
            iconSize={14}
            className="button btn-primary p-2 flex align-center justify-center gap-1"
          />
          <Button
            onClick={() => onRestComplete()}
            text="SKIP"
            Icon={ArrowRightCircle}
            iconSize={14}
            className="button btn-muted p-2 flex align-center justify-center gap-1"
          />
        </div>
      </div>
    </div>
  );
}

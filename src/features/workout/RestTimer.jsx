import { ArrowRightCircle, Clock, PlusCircle } from "lucide-react";
import { useEffect, useState, useRef } from "react";
import formatTimer from "../../utils/formatTimer";
import Button from "../../components/ui/Button";
import { KeepAwake } from "@capacitor-community/keep-awake";

export default function RestTimer({ restTime, onRestComplete }) {
  const [timeLeft, setTimeLeft] = useState(restTime);
  const endTimeRef = useRef(Date.now() + restTime * 1000);

  useEffect(() => {
    KeepAwake.keepAwake();

    const interval = setInterval(() => {
      const now = Date.now();
      const difference = endTimeRef.current - now;
      const secondsRemaining = Math.max(0, Math.ceil(difference / 1000));

      setTimeLeft(secondsRemaining);

      if (secondsRemaining <= 0) {
        clearInterval(interval);
        onRestComplete();
      }
    }, 100);

    return () => {
      clearInterval(interval);
      KeepAwake.allowSleep();
    };
  }, [onRestComplete]);

  const addTime = () => {
    endTimeRef.current += 30000;
    setTimeLeft(
      Math.max(0, Math.ceil((endTimeRef.current - Date.now()) / 1000))
    );
  };

  return (
    <div className="rest-timer-overlay">
      <div className="flex flex-col justify-center items-center w-full max-w-md animate-enter">
        <Clock size={48} className="animate-spin mb-2 text-primary" />
        <span className="timer-label">Resting</span>

        <div className="timer-hero">{formatTimer(timeLeft)}</div>

        <div className="flex flex-col gap-4 w-full px-8">
          <Button
            onClick={() => onRestComplete()}
            text="Skip Rest"
            Icon={ArrowRightCircle}
            iconSize={20}
            className="btn-primary w-full p-4 text-lg font-bold flex justify-center items-center gap-2"
          />

          <Button
            onClick={addTime}
            text="+30 Seconds"
            Icon={PlusCircle}
            iconSize={20}
            className="btn-secondary w-full p-4 text-lg font-medium flex justify-center items-center gap-2"
          />
        </div>
      </div>
    </div>
  );
}

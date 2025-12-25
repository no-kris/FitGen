import { Play, Settings } from "lucide-react";
import Button from "../../components/ui/Button";

export default function Schedule({
  currentWeek,
  setDetails,
  onCompleted,
  onStartWorkout,
}) {
  return currentWeek.schedule.map((day, index) => {
    const done = onCompleted(day);
    return (
      <div key={index} className={`card ${done ? "opacity-50" : ""}`}>
        <div className="flex justify-between items-start mb-4">
          <div className="flex flex-col gap-1">
            <div className="flex items-center gap-2">
              <h3 className="text-xl font-bold letter-spacing-2">
                {day.dayName}
              </h3>
              {done && (
                <span className="text-success text-lg font-bold uppercase">
                  [DONE]
                </span>
              )}
            </div>
            <span className="text-lg text-muted uppercase">{day.focus}</span>
          </div>
          <div className="flex gap-4">
            {!done && (
              <>
                <Button
                  onClick={() => setDetails({ ...day, index: index })}
                  Icon={Settings}
                  iconSize={20}
                  text=""
                />
                <Button
                  onClick={() =>
                    onStartWorkout({
                      ...day,
                      weekNum: currentWeek.weekNumber,
                    })
                  }
                  Icon={Play}
                  iconSize={20}
                  className="text-primary font-bold"
                  text=""
                />
              </>
            )}
          </div>
        </div>
      </div>
    );
  });
}

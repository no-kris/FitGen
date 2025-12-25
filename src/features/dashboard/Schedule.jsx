import { CheckCircle2, Play, Settings } from "lucide-react";
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
          <div className="flex gap-6">
            {!done && (
              <>
                <Button
                  onClick={() => setDetails({ ...day, index: index })}
                  Icon={Settings}
                  iconSize={20}
                  className="px-2 py-1 text-muted bg-light"
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
                  className="px-2 py-1 text-primary bg-light"
                  text=""
                />
              </>
            )}
            {done && <CheckCircle2 className="text-success" size={24} />}
          </div>
        </div>
        <div>
          {day.exercises
            .slice(0, day.exercises.length)
            .map((exercise, index) => (
              <div
                key={index}
                className="flex items-center justify-between mb-2"
              >
                <div className="flex items-center gap-2 text-lg">
                  <span className="text-primary">::</span> {exercise.name}
                </div>
                <span className="text-base letter-spacing-2 text-muted whitespace-nowrap">
                  {exercise.sets}x{exercise.reps}
                </span>
              </div>
            ))}
        </div>
      </div>
    );
  });
}

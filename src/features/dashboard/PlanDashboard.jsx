import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Schedule from "./Schedule";
import { CheckCircle2, Notebook, PlusCircle } from "lucide-react";

export default function PlanDashboard({ plan, history, setView }) {
  const [weekIndex, setWeekIndex] = useState(0);
  const [details, setDetails] = useState(null);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [showCheckin, setShowCheckin] = useState(false);

  if (!plan || !plan.weeks || plan.totalWeeks === 0)
    return (
      <div className="text-center text-2xl text-muted p-6">NO DATA FOUND</div>
    );

  useEffect(() => {
    if (plan?.weeks) {
      setWeekIndex(plan.weeks.length - 1);
    }
  }, [plan]);

  const currentWeek = plan.weeks[weekIndex] || plan.weeks[0];
  if (!currentWeek)
    return (
      <div className="text-center text-2xl text-muted p-6">LOADING...</div>
    );

  const handleCompleted = (day) => {
    return history.some(
      (h) =>
        h.workout.dayName === day.dayName &&
        h.workout.weekNumber === currentWeek.weekNumber
    );
  };

  const handleStartWorkout = (day) => {
    setActiveWorkout(day);
    setView("active");
  };

  const isLastAvailableWeek = weekIndex === plan.weeks.length - 1;
  const isProgramCompleted = currentWeek.weekNumber >= plan.totalWeeks;

  const allWorkoutsCompleted = currentWeek.schedule.every((day) =>
    history.some(
      (h) =>
        h.workout.dayName === day.dayName &&
        h.workout.weekNumber === currentWeek.weekNumber
    )
  );

  return (
    <div className="view-container p-2">
      <div className="flex flex-col gap-3 justify-between border-b pb-2">
        <h1 className="text-3xl font-bold">{plan.programName}</h1>
        <span className="text-primary text-lg">
          WK {currentWeek.weekNumber}/{plan.totalWeeks}
        </span>
        <div className="flex gap-2 mt-2 text-lg text-muted letter-spacing-2 line-height-1">
          <span>{plan.description}</span>
        </div>
      </div>

      <div>
        {plan.weeks.map((week, index) => (
          <div
            key={index}
            className={`mt-4 p-2 flex gap-4 ${
              weekIndex === index ? "bg-primary" : "bg-muted"
            }`}
          >
            <Button
              onClick={() => setWeekIndex(index)}
              className={`letter-spacing-2 font-semibold ${
                weekIndex === index ? "text-dark" : "text-primary"
              }`}
              text={`Week ${week.weekNumber}`}
            />
          </div>
        ))}
      </div>

      {currentWeek.coachNotes && (
        <div className="card flex flex-col gap-3 mt-4">
          <div className="flex gap-4 border-b pb-2 items-center">
            <Notebook className="text-primary" size={24} />
            <h2 className="text-2xl font-bold text-primary">Coach Logs</h2>
          </div>
          <p className="mt-2 text-lg text-muted letter-spacing-2 line-height-1">
            {currentWeek.coachNotes}
          </p>
        </div>
      )}

      <div className="flex flex-col gap-3 mt-4">
        <Schedule
          currentWeek={currentWeek}
          setDetails={setDetails}
          onCompleted={handleCompleted}
          onStartWorkout={handleStartWorkout}
        />
      </div>

      {isProgramCompleted ? (
        <div className="card flex text-center border-primary">
          <CheckCircle2 size={40} className="text-primary mx-auto mb-2" />
          <h3 className="text-primary font-bold">PROGRAM COMPLETE</h3>
          <p className="text-muted text-xs mt-2">
            SYSTEM STANDBY. RESET TO BEGIN NEW CYCLE.
          </p>
        </div>
      ) : (
        isLastAvailableWeek && (
          <Button
            text={`CHECK-IN & GENERATE WEEK ${currentWeek.weekNumber + 1}`}
            Icon={PlusCircle}
            iconSize={24}
            onClick={() => setShowCheckin(true)}
            className="flex items-center justify-center gap-4 button btn-primary w-full font-bold text-xl uppercase p-4 letter-spacing-2 mt-4"
            disabled={!allWorkoutsCompleted}
          />
        )
      )}
    </div>
  );
}

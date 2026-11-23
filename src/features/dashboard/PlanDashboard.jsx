import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import Schedule from "./Schedule";
import { CheckCircle2, Notebook, PlusCircle } from "lucide-react";
import FeedbackModal from "../workout/FeedbackModal";
import DayDetailModal from "../workout/DayDetailModal";
import { useWorkout } from "../../hooks/useWorkout";
import { useAppContext } from "../../context/AppContext";

export default function PlanDashboard() {
  const { userData } = useAppContext();
  const { plan, history } = userData;
  const {
    handleGenerateNextWeek,
    handleReplaceExercise,
    handleStartWorkout,
    handleResumePausedWorkout,
    handleDiscardAndStartWorkout,
  } = useWorkout();

  const [weekIndex, setWeekIndex] = useState(0);
  const [activeDayIndex, setActiveDayIndex] = useState(null);
  const [showCheckin, setShowCheckin] = useState(false);
  const [pausedConflict, setPausedConflict] = useState(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    if (plan?.weeks) {
      setWeekIndex(plan.weeks.length - 1);
    }
  }, [plan]);

  if (!plan || !plan.weeks || plan.totalWeeks === 0)
    return (
      <div className="text-center text-2xl text-muted p-6">NO DATA FOUND</div>
    );

  const currentWeek = plan.weeks[weekIndex] || plan.weeks[0];
  const activeDayDetails =
    activeDayIndex !== null ? currentWeek.schedule[activeDayIndex] : null;

  if (!currentWeek)
    return (
      <div className="text-center text-2xl text-muted p-6">LOADING...</div>
    );

  const isDayCompleted = (day) =>
    history.some((h) => {
      const entryWeek = h?.weekNumber ?? h?.workout?.weekNumber;
      const entryDayName = h?.dayName ?? h?.workout?.dayName;
      const entryDayNumber = h?.dayNumber ?? h?.workout?.dayNumber;
      if (entryWeek !== currentWeek.weekNumber) return false;
      if (entryDayName != null && day.dayName != null) {
        return entryDayName === day.dayName;
      }
      return entryDayNumber != null && entryDayNumber === day.dayNumber;
    });

  const isLastAvailableWeek = weekIndex === plan.weeks.length - 1;
  const isProgramCompleted = currentWeek.weekNumber >= plan.totalWeeks;

  const allWorkoutsCompleted = currentWeek.schedule.every(isDayCompleted);

  const handleCheckin = async (feedback) => {
    setIsLoading(true);
    try {
      await handleGenerateNextWeek(feedback);
      setShowCheckin(false);
    } catch (error) {
      setError(error);
    } finally {
      setIsLoading(false);
    }
  };

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

      <div className="flex gap-4 mt-4 overflow-x-auto">
        {plan.weeks.map((week, index) => (
          <div
            key={index}
            className={`p-2 shrink-0 ${
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
          setDetails={setActiveDayIndex}
          onCompleted={isDayCompleted}
          onStartWorkout={(day) => {
            const res = handleStartWorkout(day);
            if (res?.status === "conflict") {
              setPausedConflict(res);
            }
          }}
        />
      </div>

      {isProgramCompleted ? (
        <div className="card flex flex-col text-center border-primary mt-4">
          <div>
            <CheckCircle2 size={40} className="text-success mx-auto mb-2" />
            <h3 className="text-success text-xl font-bold">PROGRAM COMPLETE</h3>
          </div>
          <p className="text-muted text-base mt-2">
            SYSTEM STANDBY. RESET TO BEGIN NEW CYCLE.
          </p>
        </div>
      ) : (
        isLastAvailableWeek && (
          <>
            {error && (
              <div className="text-center text-error">{error.message}</div>
            )}
            <Button
              text={`CHECK-IN & GENERATE WEEK ${currentWeek.weekNumber + 1}`}
              Icon={PlusCircle}
              iconSize={20}
              onClick={() => setShowCheckin(true)}
              className="flex items-center justify-center gap-4 button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2 mt-4"
              disabled={!allWorkoutsCompleted}
            />
          </>
        )
      )}

      <FeedbackModal
        isOpen={showCheckin}
        onClose={() => setShowCheckin(false)}
        isLoading={isLoading}
        weekNumber={currentWeek.weekNumber}
        onCheckin={handleCheckin}
      />

      <DayDetailModal
        isOpen={!!activeDayDetails}
        onClose={() => setActiveDayIndex(null)}
        details={activeDayDetails}
        onReplaceExercise={async (exIndex, newEx) => {
          try {
            setError(null);
            await handleReplaceExercise(
              weekIndex,
              activeDayIndex,
              exIndex,
              newEx
            );
          } catch (err) {
            setError(err);
          }
        }}
      />

      <Modal
        isOpen={Boolean(pausedConflict)}
        onClose={() => setPausedConflict(null)}
        title="Workout In Progress"
      >
        {pausedConflict && (
          <div className="flex flex-col gap-3">
            <p className="text-lg">
              You have a paused workout (Week{" "}
              {pausedConflict.pausedWorkout.weekNumber} -{" "}
              {pausedConflict.pausedWorkout.dayName}). Would you like to resume
              it or discard it and start {pausedConflict.requestedDay.dayName}?
            </p>
            <div className="flex flex-col gap-2">
              <Button
                text="Resume Paused"
                onClick={() => {
                  const paused = pausedConflict.pausedWorkout;
                  setPausedConflict(null);
                  handleResumePausedWorkout(paused);
                }}
                className="button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
              <Button
                text="Discard & Start"
                onClick={() => {
                  const requested = pausedConflict.requestedDay;
                  setPausedConflict(null);
                  handleDiscardAndStartWorkout(requested);
                }}
                className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
              <Button
                text="Cancel"
                onClick={() => setPausedConflict(null)}
                className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
              />
            </div>
          </div>
        )}
      </Modal>
    </div>
  );
}

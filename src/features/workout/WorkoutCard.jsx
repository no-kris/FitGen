import { Check, PlusCircle, Trash } from "lucide-react";
import TextInput from "../../components/ui/TextInput";
import Button from "../../components/ui/Button";
import RestTimer from "./RestTimer";
import { useState } from "react";
import { Haptics } from "@capacitor/haptics";

export default function WorkoutCard({ workout, logs, setLogs }) {
  const [activeRestTimerIndex, setActiveRestTimerIndex] = useState(null);

  const toggleSet = (exerciseIndex, setIndex) => {
    const updatedLogs = [...logs];
    const updatedSets = [...updatedLogs[exerciseIndex].sets];
    const isCompleted = !updatedSets[setIndex].completed;

    updatedSets[setIndex] = {
      ...updatedSets[setIndex],
      completed: isCompleted,
    };
    updatedLogs[exerciseIndex] = {
      ...updatedLogs[exerciseIndex],
      sets: updatedSets,
    };
    setLogs(updatedLogs);
  };

  const updateVal = (exerciseIndex, setIndex, field, val) => {
    const cleanVal = val.replace(/[^0-9]/g, "");

    const updatedLogs = [...logs];
    const updatedSets = [...updatedLogs[exerciseIndex].sets];
    updatedSets[setIndex] = { ...updatedSets[setIndex], [field]: cleanVal };
    updatedLogs[exerciseIndex] = {
      ...updatedLogs[exerciseIndex],
      sets: updatedSets,
    };
    setLogs(updatedLogs);
  };

  const handleAddSet = (exerciseIndex) => {
    const updatedLogs = [...logs];
    const updatedExercise = { ...updatedLogs[exerciseIndex] };
    const updatedSets = [...updatedExercise.sets];
    updatedSets.push({ weight: "", reps: "", completed: false });
    updatedExercise.sets = updatedSets;
    updatedLogs[exerciseIndex] = updatedExercise;
    setLogs(updatedLogs);
  };

  const handleDeleteSet = (exerciseIndex, setIndex) => {
    const updatedLogs = [...logs];
    const updatedExercise = { ...updatedLogs[exerciseIndex] };
    const updatedSets = [...updatedExercise.sets];
    updatedSets.splice(setIndex, 1);
    updatedExercise.sets = updatedSets;
    updatedLogs[exerciseIndex] = updatedExercise;
    setLogs(updatedLogs);
  };

  const triggerHaptic = () => {
    try {
      Haptics.vibrate({ duration: 1000 });
    } catch {
      // Ignore errors if haptics not available
    }
  };

  return workout.exercises.map((exercise, index) => {
    return (
      <div
        key={index}
        className="card flex flex-col justify-center items-center mb-4"
      >
        <div className="flex items-center mb-2">
          <div className="flex flex-col gap-1">
            <h4 className="font-bold text-lg uppercase letter-spacing-2">
              {exercise.name}
            </h4>
            <div className="flex items-center gap-2 mt-1">
              <span className="text-base text-primary">
                {exercise.sets} x {exercise.reps}
              </span>
              <span className="text-base text-muted">
                / {exercise.rest} REST
              </span>
            </div>
            {exercise.notes && (
              <div className="mt-1 line-height-1">
                <span className="text-primary">NOTES: </span>
                {exercise.notes}
              </div>
            )}
          </div>
        </div>

        <div className="flex flex-col mt-2">
          {logs[index] &&
            logs[index].sets.map((set, j) => (
              <div
                key={j}
                className={`grid-cols-workout p-2 mb-2 ${
                  set.completed ? "bg-success opacity-50" : ""
                }`}
              >
                <div className="flex justify-center">
                  <span
                    className={`text-xl font-bold ${
                      set.completed ? "text-dark" : ""
                    }`}
                  >
                    {j + 1}
                  </span>
                </div>
                <TextInput
                  type="text"
                  inputMode="decimal"
                  placeholder="WEIGHT"
                  value={set.weight}
                  className="input text-center placeholder-text m-0 w-full"
                  onChange={(e) =>
                    updateVal(index, j, "weight", e.target.value)
                  }
                />
                <TextInput
                  type="text"
                  inputMode="numeric"
                  placeholder="REPS"
                  value={set.reps}
                  className="input text-center placeholder-text m-0 w-full"
                  onChange={(e) => updateVal(index, j, "reps", e.target.value)}
                />
                <div className="flex justify-center gap-3">
                  <Button
                    onClick={() => {
                      toggleSet(index, j);
                      if (!set.completed) setActiveRestTimerIndex(index);
                    }}
                    Icon={Check}
                    iconSize={16}
                    className={`p-3 ${
                      set.completed
                        ? "bg-success opacity-80 text-dark"
                        : "bg-muted"
                    }`}
                  />
                  {!set.completed && (
                    <Button
                      onClick={() => handleDeleteSet(index, j)}
                      Icon={Trash}
                      iconSize={16}
                      className="p-3 bg-danger"
                    />
                  )}
                </div>
              </div>
            ))}
          <Button
            text="ADD SET"
            onClick={() => handleAddSet(index)}
            Icon={PlusCircle}
            iconSize={16}
            className="flex justify-center items-center button btn-muted w-full font-bold text-lg p-2 mt-2 letter-spacing-2 gap-3"
          />
        </div>
        {activeRestTimerIndex === index && (
          <RestTimer
            restTime={parseInt(exercise.rest)}
            onRestComplete={() => {
              triggerHaptic();
              setActiveRestTimerIndex(null);
            }}
          />
        )}
      </div>
    );
  });
}

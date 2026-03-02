import { RotateCcw, Shuffle } from "lucide-react";
import Button from "../../components/ui/Button";
import Modal from "../../components/ui/Modal";
import { useState } from "react";

export default function DayDetailModal({
  isOpen,
  onClose,
  details,
  onReplaceExercise,
}) {
  const [expandedIndex, setExpandedIndex] = useState(null);
  if (!isOpen) return null;

  const handleExpand = (index) => {
    setExpandedIndex(expandedIndex === index ? null : index);
  };

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="WORKOUT DETAILS">
      <div className="view-container p-2">
        <div className="flex flex-col gap-3 justify-between pb-2">
          <div>
            <h1 className="text-3xl font-bold">{details.dayName}</h1>
            <span className="text-primary text-lg">{details.focus}</span>
          </div>

          <div>
            {details.exercises.map((exercise, index) => (
              <div key={index} className="card mb-4">
                <div className="flex justify-between items-start gap-2">
                  <div>
                    <h2 className="text-xl font-bold">{exercise.name}</h2>
                    <div>
                      <span className="text-primary text-lg font-bold letter-spacing-2">
                        {exercise.sets} SETS x {exercise.reps} REPS
                      </span>
                    </div>
                  </div>
                  <div>
                    {exercise.alternatives &&
                      exercise.alternatives.length > 0 && (
                        <Button
                          onClick={() => handleExpand(index)}
                          Icon={Shuffle}
                          iconSize={20}
                          className={`px-2 py-1 text-muted bg-light ${
                            expandedIndex === index ? "text-primary" : ""
                          }`}
                          text=""
                        />
                      )}
                  </div>
                </div>
                {expandedIndex === index && (
                  <div className="mt-4 pt-4">
                    <p className="text-base text-muted uppercase letter-spacing-2 mb-4">
                      Select Alternative
                    </p>
<<<<<<< HEAD
                    <div className="flex flex-col gap-5 scrollable-list pr-2">
=======
                    <div className="flex flex-col gap-5 scrollable-list">
>>>>>>> iphone
                      {exercise.alternatives.map((alt, altIndex) => (
                        <div key={altIndex}>
                          <Button
                            text={alt}
                            Icon={RotateCcw}
                            iconSize={16}
                            className="button btn-primary text-lg letter-spacing-2 font-bold w-full flex items-start gap-1 p-2"
                            onClick={() => {
                              onReplaceExercise(index, alt);
                              setExpandedIndex(null);
                              details.exercises[index].name = alt;
                            }}
                          />
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
          <Button
            text={"CLOSE"}
            className="button btn-muted p-2 w-full font-bold text-xl uppercase"
            onClick={onClose}
          />
        </div>
      </div>
    </Modal>
  );
}

import { useState } from "react";
import Button from "../ui/Button";
import { ArrowDown, ArrowUp } from "lucide-react";
import { useAppContext } from "../../context/AppContext";

export default function LogsScreen() {
  const { userData } = useAppContext();
  const history = userData.history;
  const [expandedIndex, setExpandedIndex] = useState(null);

  return (
    <>
      <h2 className="text-2xl font-bold mb-2 uppercase pb-2 text-center">
        DATA LOGS
      </h2>
      {history.length === 0 ? (
        <div className="text-center mt-6 text-muted text-base uppercase py-10">
          NO ENTRIES RECORDED
        </div>
      ) : (
        history
          .slice()
          .reverse()
          .map((entry, index) => (
            <div key={index} className="card p-6 mb-4">
              <div className="flex flex-col gap-3 mb-2 border-b">
                <div className="flex gap-2">
                  <span className="text-lg font-bold text-primary uppercase">
                    {entry?.workout?.dayName}
                  </span>
                  <span>::</span>
                  <span className="text-lg font-bold text-primary uppercase">
                    {entry?.workout?.focus}
                  </span>
                </div>

                <div className="flex justify-between">
                  <div className="text-base uppercase">
                    {Math.floor((entry?.duration || 0) / 60)} MINUTES /{" "}
                    {entry?.logs?.length || 0} EXERCISES
                  </div>
                  <span className="text-base text-muted uppercase">
                    {entry?.workout?.date
                      ? new Date(entry.workout.date).toLocaleDateString()
                      : ""}
                  </span>
                </div>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {expandedIndex === index ? (
                  <Button
                    onClick={() => setExpandedIndex(null)}
                    Icon={ArrowUp}
                    iconSize={16}
                  />
                ) : (
                  <Button
                    onClick={() => setExpandedIndex(index)}
                    Icon={ArrowDown}
                    iconSize={16}
                    text="View Details"
                    className="flex flex-col items-center gap-2"
                  />
                )}
                {expandedIndex === index &&
                  entry?.logs?.map((log, index) => (
                    <div key={index} className="flex flex-col gap-1 mb-2">
                      <div className="text-lg font-bold text-primary uppercase">
                        {log.name || log.exercise}
                      </div>
                      <div className="text-base text-muted uppercase">
                        {Array.isArray(log.sets) ? (
                          <div className="flex flex-col">
                            {log.sets
                              .filter((s) => s.completed)
                              .map((s, i) => (
                                <span key={i}>
                                  SET {i + 1}: {s.weight || 0}LBS x{" "}
                                  {s.reps || 0} REPS
                                </span>
                              ))}
                            {log.sets.filter((s) => s.completed).length ===
                              0 && <span>NO COMPLETED SETS</span>}
                          </div>
                        ) : (
                          <span>
                            {log.sets} SETS / {log.reps} REPS / {log.weight} LBS
                          </span>
                        )}
                      </div>
                    </div>
                  ))}
              </div>
            </div>
          ))
      )}
    </>
  );
}

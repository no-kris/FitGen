export default function LogsScreen({ history }) {
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
              <div className="flex justify-between mb-2 border-b">
                <span className="text-lg font-bold text-primary uppercase">
                  {entry.workout.focus}
                </span>
                <div className="text-base uppercase">
                  {Math.floor(entry.duration / 60)} MINUTES /{" "}
                  {entry.logs.length} EXERCISES
                </div>
                <span className="text-base text-muted uppercase">
                  {new Date(entry.workout.date).toLocaleDateString()}
                </span>
              </div>

              <div className="mt-4 flex flex-col gap-2">
                {entry.logs.map((log, index) => (
                  <div key={index} className="flex justify-between">
                    <div className="text-lg font-bold text-primary uppercase">
                      {log.exercise}
                    </div>
                    <div className="text-base text-muted uppercase">
                      {log.sets} SETS / {log.reps} REPS / {log.weight} LBS
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

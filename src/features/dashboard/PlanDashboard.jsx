import { useEffect, useState } from "react";
import Button from "../../components/ui/Button";

export default function PlanDashboard({ plan, history }) {
  const [weekIndex, setWeekIndex] = useState(0);
  const [details, setDetails] = useState(null);

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
    </div>
  );
}

import DisplayStep from "../../../components/ui/DisplayStep";
import InputStep from "../../../components/ui/InputStep";
import SliderStep from "../../../components/ui/SliderStep";
import toggleDay from "./toggleDay";

const renderStep = (step, setFormData, formData) => {
  let stepContent;

  switch (step) {
    case 1:
      stepContent = (
        <DisplayStep
          list={["build muscle", "lose weight", "gain strength"]}
          handleClick={(option) =>
            setFormData({
              ...formData,
              goal: option,
            })
          }
          formData={formData}
          item="goal"
        />
      );
      break;
    case 2:
      stepContent = (
        <DisplayStep
          list={["beginner", "intermediate", "advanced"]}
          handleClick={(option) =>
            setFormData({
              ...formData,
              level: option,
            })
          }
          formData={formData}
          item="level"
        />
      );
      break;
    case 3:
      stepContent = (
        <DisplayStep
          list={[
            "Monday",
            "Tuesday",
            "Wednesday",
            "Thursday",
            "Friday",
            "Saturday",
            "Sunday",
          ]}
          handleClick={(day) => toggleDay(day, setFormData, formData)}
          formData={formData}
          item="selectedDays"
        />
      );
      break;
    case 4:
      stepContent = (
        <DisplayStep
          list={["full gym", "home gym (basic equipment)", "bodyweight"]}
          handleClick={(option) =>
            setFormData({
              ...formData,
              equipment: option,
            })
          }
          formData={formData}
          item="equipment"
        />
      );
      break;
    case 5:
      stepContent = (
        <SliderStep
          value={formData.duration}
          handleChange={(e) =>
            setFormData({ ...formData, duration: parseInt(e.target.value) })
          }
          label="Duration"
          options={{ min: 15, max: 120, step: 1, unit: "min" }}
        />
      );
      break;
    case 6:
      stepContent = (
        <SliderStep
          value={formData.weeks}
          handleChange={(e) =>
            setFormData({ ...formData, weeks: parseInt(e.target.value) })
          }
          label="Weeks"
          options={{ min: 2, max: 16, step: 1, unit: "weeks" }}
        />
      );
      break;
    case 7:
      stepContent = (
        <InputStep
          value={formData.exclusions}
          handleChange={(e) =>
            setFormData({ ...formData, exclusions: e.target.value })
          }
          label="Constraints"
          placeholder="e.g. knee pain, shoulder injury"
        />
      );
      break;
    case 8:
      stepContent = (
        <InputStep
          value={formData.priorities}
          handleChange={(e) =>
            setFormData({ ...formData, priorities: e.target.value })
          }
          label="Priorities"
          placeholder="e.g. legs, back, chest"
        />
      );
      break;
  }

  return (
    <>
      <div className="card">
        <h3 className="text-primary mb-4 text-xl font-bold border-b border-color pb-2 uppercase">
          {step === 1
            ? "TARGET OBJECTIVE"
            : step === 2
            ? "EXPERIENCE"
            : step === 3
            ? "SCHEDULE"
            : step === 4
            ? "EQUIPMENT"
            : step === 5
            ? "DURATION"
            : step === 6
            ? "WEEKS"
            : step === 7
            ? "CONSTRAINTS"
            : "PRIORITIES"}
        </h3>
        {stepContent}
      </div>
    </>
  );
};

export default renderStep;

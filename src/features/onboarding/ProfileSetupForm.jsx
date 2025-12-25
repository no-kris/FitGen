import { useState } from "react";
import renderStep from "./helpers/renderStep";
import { Loader2, Settings } from "lucide-react";
import Button from "../../components/ui/Button";
import handleNextStep from "./helpers/handleNextStep";
import generateInitialPlan from "../../utils/generateInitialPlan";

export default function ProfileSetupForm({ onSavePlan }) {
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [formData, setFormData] = useState({
    goal: "build muscle",
    level: "beginner",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    equipment: "full gym",
    duration: 60,
    weeks: 4,
    exclusions: [],
    priorities: [],
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [errors, setErrors] = useState({});

  const handleGenerate = async () => {
    setIsGenerating(true);
    try {
      const plan = await generateInitialPlan(formData);
      onSavePlan(plan, formData);
    } catch (error) {
      setErrors({ error: error.message });
    } finally {
      setIsGenerating(false);
    }
  };

  const handleClickNext = () => {
    if (step === totalSteps) {
      handleGenerate();
    } else {
      handleNextStep(step, totalSteps, setStep, formData, setErrors);
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <div className="flex justify-between items-center">
        <div className="flex items-center gap-2">
          <Settings size={24} className="text-primary" />
          <h1 className="text-2xl font-bold">Setup</h1>
        </div>
        <p className="text-lg text-primary uppercase">
          STEP {step}/{totalSteps}
        </p>
      </div>
      {errors ? (
        <div className="flex flex-col gap-2">
          {Object.entries(errors).map(([key, value]) => (
            <p key={key} className="text-error text-lg">
              {value}
            </p>
          ))}
        </div>
      ) : null}
      {renderStep(step, setFormData, formData)}
      <div className="flex gap-4 mt-4">
        <Button
          onClick={() => {
            setStep((step) => Math.max(1, step - 1));
          }}
          disabled={step === 1}
          className="button btn-secondary text-xl font-bold w-full p-4"
          text="Back"
        />
        <Button
          onClick={() => {
            handleClickNext();
          }}
          disabled={isGenerating}
          className="button btn-primary text-xl font-bold w-full p-4"
          text={
            isGenerating ? (
              <Loader2 className="animate-spin" />
            ) : step === totalSteps ? (
              "INITIATE PLAN"
            ) : (
              "Next"
            )
          }
        />
      </div>
    </div>
  );
}

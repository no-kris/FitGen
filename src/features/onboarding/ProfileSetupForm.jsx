import { useRef, useState } from "react";
import renderStep from "./helpers/renderStep";
import { Loader2, Settings } from "lucide-react";
import Button from "../../components/ui/Button";
import handleNextStep from "./helpers/handleNextStep";
import generateInitialPlan from "../../utils/generateInitialPlan";
import { useAppContext } from "../../context/AppContext";

export default function ProfileSetupForm() {
  const {
    handleSavePlan: onSavePlan,
    user = null,
    isSynced = true,
    syncError = null,
    retrySync,
  } = useAppContext();
  const [step, setStep] = useState(1);
  const totalSteps = 8;
  const [formData, setFormData] = useState({
    goal: "build muscle",
    level: "beginner",
    selectedDays: ["Monday", "Wednesday", "Friday"],
    equipment: "full gym",
    duration: 60,
    weeks: 6,
    exclusions: "",
    priorities: "",
  });
  const [isGenerating, setIsGenerating] = useState(false);
  const [errors, setErrors] = useState({});
  const isGeneratingRef = useRef(false);

  const isSyncFailed = Boolean(user && !isSynced && syncError);
  const isSyncPending = Boolean(user && !isSynced && !syncError);
  const errorEntries = Object.entries(errors).filter(([, value]) =>
    Boolean(value)
  );

  const handleGenerate = async () => {
    if (isGeneratingRef.current || isSyncPending || isSyncFailed) {
      return;
    }
    isGeneratingRef.current = true;
    setIsGenerating(true);
    setErrors({});
    try {
      const plan = await generateInitialPlan(formData);
      await onSavePlan(plan, formData);
    } catch (error) {
      setErrors({
        error: error?.message || "Failed to generate plan. Please try again.",
      });
    } finally {
      isGeneratingRef.current = false;
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

  const handleBack = () => {
    if (isGeneratingRef.current || isGenerating) {
      return;
    }
    setErrors({});
    setStep((prevStep) => Math.max(1, prevStep - 1));
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
      {isSyncFailed && (
        <div
          role="alert"
          className="alert-error flex items-center justify-between gap-3"
        >
          <span className="text-lg font-bold">
            {syncError?.message || "Failed to sync your cloud data."}
          </span>
          <Button
            text="Retry Sync"
            onClick={() => retrySync?.()}
            className="button btn-primary text-base font-bold uppercase p-2 letter-spacing-2 shrink-0"
          />
        </div>
      )}
      {isSyncPending && (
        <div
          role="status"
          aria-live="polite"
          className="card p-3 flex items-center justify-center gap-2 text-muted text-lg font-bold"
        >
          <Loader2 className="animate-spin" size={16} aria-hidden="true" />
          <span>Syncing your cloud data...</span>
        </div>
      )}
      {errorEntries.length > 0 && (
        <div role="alert" className="alert-error flex flex-col gap-2">
          {errorEntries.map(([key, value]) => (
            <p key={key} className="text-error text-lg font-bold">
              {value}
            </p>
          ))}
        </div>
      )}
      {renderStep(step, setFormData, formData)}
      <div className="flex gap-4 mt-4">
        <Button
          onClick={handleBack}
          disabled={step === 1 || isGenerating}
          className="button btn-secondary text-xl font-bold w-full p-4"
          text="Back"
        />
        <Button
          onClick={handleClickNext}
          disabled={
            isGenerating ||
            (step === totalSteps && (isSyncPending || isSyncFailed))
          }
          aria-busy={isGenerating}
          className="button btn-primary text-xl font-bold w-full p-4"
          text={
            isGenerating ? (
              <span className="flex items-center justify-center gap-2">
                <Loader2
                  className="animate-spin"
                  size={16}
                  aria-hidden="true"
                />
                Generating...
              </span>
            ) : step === totalSteps ? (
              errors.error ? (
                "Retry"
              ) : (
                "INITIATE PLAN"
              )
            ) : (
              "Next"
            )
          }
        />
      </div>
    </div>
  );
}

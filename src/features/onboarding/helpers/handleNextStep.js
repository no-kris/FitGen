const handleNextStep = (step, totalSteps, setStep, formData, setErrors) => {
  let isValid = true;
  let newErrors = {};

  switch (step) {
    case 1:
      if (!formData.goal) {
        isValid = false;
        newErrors.goal = "Goal is required";
      }
      break;
    case 2:
      if (!formData.level) {
        isValid = false;
        newErrors.level = "Level is required";
      }
      break;
    case 3:
      if (
        !Array.isArray(formData.selectedDays) ||
        !formData.selectedDays.length
      ) {
        isValid = false;
        newErrors.selectedDays = "At least one day is required";
      }
      break;
    case 4:
      if (!formData.equipment) {
        isValid = false;
        newErrors.equipment = "Equipment is required";
      }
      break;
    case 5:
      if (!formData.duration || formData.duration <= 0) {
        isValid = false;
        newErrors.duration = "Duration is required";
      }
      break;
    case 6:
      if (!formData.weeks || formData.weeks <= 0) {
        isValid = false;
        newErrors.weeks = "Weeks is required";
      }
      break;
  }

  if (isValid) {
    setErrors({});
    setStep((prevStep) => Math.min(totalSteps, prevStep + 1));
  } else {
    setErrors(newErrors);
  }
};

export default handleNextStep;

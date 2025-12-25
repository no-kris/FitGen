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
      if (!formData.selectedDays.length) {
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
      if (!formData.duration) {
        isValid = false;
        newErrors.duration = "Duration is required";
      }
      break;
    case 6:
      if (!formData.weeks) {
        isValid = false;
        newErrors.weeks = "Weeks is required";
      }
      break;
  }

  if (isValid) {
    setStep((step) => Math.min(totalSteps, step + 1));
  } else {
    setErrors(newErrors);
  }
};

export default handleNextStep;

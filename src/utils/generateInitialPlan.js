import { requestInitialPlan } from "../services/api/callModel";
import getUserToken from "./getUserToken";
import normalizeProfileText from "./normalizeProfileText";

const generateInitialPlan = async (formData) => {
  const payload = {
    goal: formData?.goal,
    level: formData?.level,
    selectedDays: formData?.selectedDays,
    equipment: formData?.equipment,
    duration: formData?.duration,
    weeks: formData?.weeks,
    exclusions: normalizeProfileText(formData?.exclusions),
    priorities: normalizeProfileText(formData?.priorities),
  };

  const token = await getUserToken();
  return requestInitialPlan(payload, token);
};

export default generateInitialPlan;

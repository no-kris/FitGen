import { Dumbbell, Settings, LogOut, Scale, Weight } from "lucide-react";
import Button from "../ui/Button";

export default function ProfileScreen({
  profile,
  setPlan,
  setProfile,
  setView,
  isGuest,
  handleLogout,
}) {
  const handleResetSystem = () => {
    setPlan(null);
    setProfile(null);
    localStorage.removeItem("fitgen-plan");
    localStorage.removeItem("fitgen-profile");
    setView("profile");
  };

  const Icon =
    profile.goal.toLowerCase() === "build muscle"
      ? Dumbbell
      : profile.goal.toLowerCase() === "lose fat"
      ? Scale
      : Weight;

  const planDescription =
    `You have ${profile.equipment} equipment to workout with.` +
    (profile.exclusions !== "None" && profile.exclusions.length > 0
      ? ` You have requested to avoid ${profile.exclusions.join(", ")}.`
      : " You have not requested any exclusions.") +
    (profile.priorities !== "None" && profile.priorities.length > 0
      ? ` You have requested to prioritize ${profile.priorities.join(", ")}.`
      : " You have not requested any priorities.");

  return (
    <div className="text-center mt-6">
      <div className="card p-6 mb-8">
        <Icon size={46} className="mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2 uppercase">{profile.goal}</h2>
        <p className="text-base text-muted uppercase">
          {profile.level} // {profile.selectedDays.length} DAYS/WEEK
        </p>
        <div className="flex flex-col text-center gap-4 mt-4">
          <p className="text-lg font-bold text-primary uppercase letter-spacing-2 line-height-2">
            {planDescription}
          </p>
        </div>
      </div>
      <Button
        text="RESET SYSTEM"
        onClick={() => {
          handleResetSystem;
        }}
        icon={Settings}
        iconSize={20}
        className="button btn-danger w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
      />
      {!isGuest && (
        <Button
          text="LOGOUT"
          onClick={() => {
            handleLogout;
          }}
          icon={LogOut}
          iconSize={20}
          className="button btn-secondary w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
        />
      )}
    </div>
  );
}

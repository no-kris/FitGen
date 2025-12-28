import { useState } from "react";
import { Dumbbell, Settings, LogOut, Scale, Weight } from "lucide-react";
import Button from "../ui/Button";
import Modal from "../ui/Modal";
import TextInput from "../ui/TextInput";

export default function ProfileScreen({
  profile,
  onResetSystem,
  isGuest,
  handleLogout,
}) {
  const [activeModal, setActiveModal] = useState(null); // 'reset' | 'report' | null
  const [reportReason, setReportReason] = useState("");

  const Icon =
    profile.goal.toLowerCase() === "build muscle"
      ? Dumbbell
      : profile.goal.toLowerCase() === "lose weight"
      ? Scale
      : Weight;

  const planDetails = [
    `Equipment: ${profile.equipment}`,
    profile.exclusions !== "None"
      ? `Exclusions: ${profile.exclusions}`
      : "No exclusions requested",
    profile.priorities !== "None"
      ? `Priorities: ${profile.priorities}`
      : "No priorities requested",
  ];

  const handleReport = () => {
    const subject = encodeURIComponent("FitGen App Report");
    const body = encodeURIComponent(reportReason);
    const email = import.meta.env.VITE_DEV_EMAIL;
    window.location.href = `mailto:${email}?subject=${subject}&body=${body}`;
    setActiveModal(null);
    setReportReason("");
  };

  return (
    <>
      <div className="flex flex-col">
        <div className="text-center mt-6">
          <div className="card p-6 mb-8">
            <Icon size={46} className="mb-4 text-primary" />
            <h2 className="text-2xl font-bold mb-2 uppercase">
              {profile.goal}
            </h2>
            <p className="text-base text-muted uppercase">
              {profile.level} // {profile.selectedDays.length} DAYS/WEEK
            </p>
            <div className="flex flex-col text-center gap-4 mt-4">
              <ul className="text-lg font-bold text-primary uppercase letter-spacing-2 line-height-2 list-none">
                {planDetails.map((detail, index) => (
                  <li key={index} className="mb-2 text-left">
                    {detail}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
        <div className="flex flex-col justify-between h-full">
          <Button
            text="RESET SYSTEM"
            onClick={() => setActiveModal("reset")}
            className="button btn-danger w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
          />
          <Button
            text="BUY DEV PROTEIN?"
            onClick={() =>
              window.open(
                "https://www.buymeacoffee.com/kristreska",
                "_blank",
                "noopener,noreferrer"
              )
            }
            className="button btn-primary w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
          />
          {!isGuest && (
            <Button
              text="LOGOUT"
              onClick={() => {
                handleLogout();
              }}
              icon={LogOut}
              iconSize={20}
              className="button btn-secondary w-full mb-4 text-2xl font-bold letter-spacing-2 p-3"
            />
          )}

          <div className="flex justify-between pb-4">
            <Button
              text="PRIVACY POLICY"
              onClick={() =>
                window.open(
                  "https://docs.google.com/document/d/e/2PACX-1vQIArxvMDxCVizYEzY1IgbwGab-v29NuDK43yi6oeIvZZxDmwIBbj_68wbUIsTdFOWQSC9sUbzSrdHX/pub",
                  "_blank",
                  "noopener,noreferrer"
                )
              }
              className="text-primary uppercase"
            />
            <Button
              text="File REPORT"
              onClick={() => setActiveModal("report")}
              className="text-error uppercase"
            />
          </div>
        </div>
      </div>

      <Modal
        isOpen={activeModal === "reset"}
        onClose={() => setActiveModal(null)}
        title="Reset Program?"
      >
        <div className="flex flex-col gap-2">
          <p className="text-lg">
            Are you sure you want to reset current program?
          </p>
          <div className="flex justify-center w-full gap-2">
            <Button
              text="Cancel"
              onClick={() => setActiveModal(null)}
              className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            />
            <Button
              text="I'm Sure"
              onClick={() => onResetSystem()}
              className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            />
          </div>
        </div>
      </Modal>

      <Modal
        isOpen={activeModal === "report"}
        onClose={() => setActiveModal(null)}
        title="File Report"
      >
        <div className="flex flex-col gap-4">
          <p className="text-base text-muted line-height-2 letter-spacing-2">
            Describe the issue you are experiencing. This will open your default
            email client.
          </p>
          <TextInput
            placeholder="Reason for report..."
            value={reportReason}
            onChange={(e) => setReportReason(e.target.value)}
            className="input input-bordered w-full text-primary"
          />
          <div className="flex justify-end gap-2">
            <Button
              text="Cancel"
              onClick={() => setActiveModal(null)}
              className="button btn-muted font-bold text-lg uppercase p-3"
            />
            <Button
              text="Submit"
              className="button btn-primary font-bold text-lg uppercase p-3"
              onClick={handleReport}
              disabled={!reportReason.trim()}
            />
          </div>
        </div>
      </Modal>
    </>
  );
}

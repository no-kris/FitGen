import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import { Bot, Loader2 } from "lucide-react";
import { useState } from "react";
import TextInput from "../../components/ui/TextInput";

export default function FeedbackModal({
  isOpen,
  onClose,
  isLoading,
  weekNumber,
  onCheckin,
}) {
  const [feedback, setFeedback] = useState("");
  if (!isOpen) return null;

  return (
    <Modal isOpen={isOpen} onClose={onClose} title="Check-in">
      <div className="flex flex-col gap-2">
        <p className="text-muted mb-4 text-lg line-height-2 letter-spacing-2">
          WEEK {weekNumber} STATUS REPORT. PLEASE LOG INJURIES OR FEEDBACK FOR
          OPTIMIZATION.
        </p>
        <TextInput
          value={feedback}
          onChange={(e) => setFeedback(e.target.value)}
          label="Feedback"
          placeholder="(e.g. I had aches in my shoulder.)"
          className="mb-4 w-full input"
        />
        <Button
          onClick={() => onCheckin(feedback)}
          disabled={isLoading}
          className="button btn-primary w-full p-4 font-bold text-xl uppercase letter-spacing-2"
          text={
            isLoading ? (
              <Loader2 className="animate-spin" size={24} />
            ) : (
              "CHECK-IN"
            )
          }
        />
      </div>
    </Modal>
  );
}

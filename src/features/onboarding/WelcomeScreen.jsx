import { Activity } from "lucide-react";
import Button from "../../components/ui/Button";

export default function WelcomeScreen({ onGuestMode, onAuth }) {
  return (
    <div className="flex flex-col items-center justify-center h-full text-center p-6">
      <Activity size={80} className="text-primary mb-6 logo-icon" />
      <h1 className="text-4xl font-bold mb-2 uppercase">
        FitGen<span className="text-primary">.AI</span>
      </h1>
      <p className="text-lg mb-6 text-muted">
        ADVANCED HYPERTROPHY ALGORITHMS. PERSONALIZED. ADAPTIVE.
      </p>
      <div className="flex flex-col gap-4 max-w-xs">
        <Button
          text="Initialize Account"
          onClick={onAuth}
          className="button btn-primary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
        />
        <Button
          text="Run as Guest?"
          onClick={onGuestMode}
          className="button btn-secondary w-full font-bold text-lg uppercase p-4 letter-spacing-2"
        />
      </div>
    </div>
  );
}

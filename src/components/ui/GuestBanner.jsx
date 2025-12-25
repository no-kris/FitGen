import { ArrowRight, ShieldAlert } from "lucide-react";
import Button from "./Button";

export default function GuestBanner({ onClick }) {
  return (
    <div className="guest-banner">
      <div className="flex items-center gap-2 text-primary">
        <ShieldAlert size={24} />
        <p className="text-base font-bold">
          <span className="uppercase font-bold">Guest Mode</span> detected.
          Login or signup to sync data.
        </p>
      </div>
      <Button
        onClick={onClick}
        className="text-primary underline"
        text="SYNC"
      />
    </div>
  );
}

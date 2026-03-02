import GuestBanner from "../ui/GuestBanner";
import NavIcon from "../ui/NavIcon";
import { Calendar, Dumbbell, User } from "lucide-react";
import { useAppContext } from "../../context/AppContext";

export default function Layout({ children }) {
  const { view, setView, isGuest, setShowAuth } = useAppContext();

  return (
    <div className="app-container">
      {isGuest && <GuestBanner onClick={() => setShowAuth(true)} />}
      <div
        className={`content-area ${
          view !== "welcome" && view !== "active" ? "has-nav" : ""
        }`}
      >
        {children}
      </div>
      {view !== "welcome" && view !== "active" && (
        <div className="bottom-nav">
          <NavIcon
            icon={Calendar}
            label="PLAN"
            onClick={() => setView("plan")}
            active={view === "plan"}
          />
          <NavIcon
            icon={Dumbbell}
            label="LOGS"
            onClick={() => setView("logs")}
            active={view === "logs"}
          />
          <NavIcon
            icon={User}
            label="PROFILE"
            onClick={() => setView("profile")}
            active={view === "profile"}
          />
        </div>
      )}
    </div>
  );
}

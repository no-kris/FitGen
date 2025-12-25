import GuestBanner from "../ui/GuestBanner";
import NavIcon from "../ui/NavIcon";
import { Calendar, Dumbbell, User } from "lucide-react";

export default function Layout({
  activeTab,
  onTabChange,
  isGuest,
  onAuth,
  children,
}) {
  return (
    <div className="app-container">
      {isGuest && <GuestBanner onClick={onAuth} />}
      <div
        className={`content-area ${
          activeTab !== "welcome" && activeTab !== "active" ? "has-nav" : ""
        }`}
      >
        {children}
      </div>
      {activeTab !== "welcome" && activeTab !== "active" && (
        <div className="bottom-nav">
          <NavIcon
            icon={Calendar}
            label="PLAN"
            onClick={() => onTabChange("plan")}
            active={activeTab === "plan"}
          />
          <NavIcon
            icon={Dumbbell}
            label="LOGS"
            onClick={() => onTabChange("logs")}
            active={activeTab === "logs"}
          />
          <NavIcon
            icon={User}
            label="PROFILE"
            onClick={() => onTabChange("profile")}
            active={activeTab === "profile"}
          />
        </div>
      )}
    </div>
  );
}

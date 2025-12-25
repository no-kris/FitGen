import { useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);

  const [profile, setProfile] = useState({
    goal: "build muscle",
    level: "beginner",
    daysPerWeek: 3,
    equipment: "full gym",
    exclusions: [],
    priorities: ["legs", "back", "chest"],
  });
  const [plan, setPlan] = useState({
    goal: "build muscle",
    level: "beginner",
    daysPerWeek: 3,
    equipment: "full gym",
    exclusions: ["no heavy deadlifts", "no kettlebell"],
    priorities: ["legs", "back", "chest"],
  });
  const [history, setHistory] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);

  const [showAuth, setShowAuth] = useState(false);

  const saveToLocalStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleSignUp = (user) => {
    setIsGuest(false);
    setShowAuth(false);
    setUser(user);
    saveToLocalStorage("fitgen-user", user);
  };

  const handleLogout = () => {
    setUser(null);
    localStorage.removeItem("fitgen-user");
    setIsGuest(false);
    setView("welcome");
  };

  return (
    <>
      <div className="app-container">
        {view === "welcome" ? (
          <WelcomeScreen
            onGuestMode={() => {
              setIsGuest(true);
              setView(plan ? "plan" : "profile");
            }}
            onAuth={() => setShowAuth(true)}
          />
        ) : (
          <Layout
            activeTab={view}
            onTabChange={setView}
            isGuest={isGuest}
            onAuth={() => setShowAuth(true)}
          >
            {view === "plan" && <h1>Plan</h1>}
            {view === "logs" && <h1>Logs</h1>}
            {view === "profile" && (
              <div className="view-container p-6">
                {plan ? (
                  <ProfileScreen
                    profile={profile}
                    setPlan={setPlan}
                    setProfile={setProfile}
                    setView={setView}
                    isGuest={isGuest}
                    handleLogout={isGuest ? null : handleLogout}
                  />
                ) : (
                  <ProfileSetupForm />
                )}
              </div>
            )}
          </Layout>
        )}
      </div>

      <Modal
        isOpen={showAuth}
        onClose={() => setShowAuth(false)}
        title="LOGIN OR SIGNUP"
      >
        <AuthModal onSignUp={handleSignUp} onClose={() => setShowAuth(false)} />
      </Modal>
    </>
  );
}

export default App;

import { useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";
import LogsScreen from "./components/screens/LogsScreen";
import PlanDashboard from "./features/dashboard/PlanDashboard";
import generateNextWeekPlan from "./utils/generateNextWeekPlan";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);

  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);

  const [showAuth, setShowAuth] = useState(false);

  const saveToLocalStorage = (key, data) => {
    localStorage.setItem(key, JSON.stringify(data));
  };

  const handleSavePlan = (plan, profile) => {
    setPlan(plan);
    setProfile(profile);
    saveToLocalStorage("fitgen-plan", plan);
    saveToLocalStorage("fitgen-profile", profile);
    setView("plan");
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

  const handleGenerateNextWeek = async (feedback) => {
    try {
      const result = await generateNextWeekPlan(
        profile,
        plan,
        history,
        feedback
      );
      const newWeek = result.weeks[0];
      const newWeekPlan = {
        ...plan,
        programName: result.programName,
        description: result.description,
        weeks: [...plan.weeks, newWeek],
      };
      setPlan(newWeekPlan);
      saveToLocalStorage("fitgen-plan", newWeekPlan);
      setView("plan");
    } catch (error) {
      console.error(error);
    }
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
            {view === "plan" && (
              <PlanDashboard
                plan={plan}
                history={history}
                setView={setView}
                onGenerateNextWeek={handleGenerateNextWeek}
              />
            )}
            {view === "logs" && (
              <div className="view-container">
                <LogsScreen history={history} />
              </div>
            )}
            {view === "profile" && (
              <div className="view-container">
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
                  <ProfileSetupForm onSavePlan={handleSavePlan} />
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

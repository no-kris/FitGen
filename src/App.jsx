import { useEffect, useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";
import LogsScreen from "./components/screens/LogsScreen";
import PlanDashboard from "./features/dashboard/PlanDashboard";
import generateNextWeekPlan from "./utils/generateNextWeekPlan";
import ActiveWorkout from "./features/workout/ActiveWorkout";
import saveToLocalStorage from "./utils/saveToLocalStorage";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);
  const [profile, setProfile] = useState(null);
  const [plan, setPlan] = useState(null);
  const [history, setHistory] = useState([]);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [showAuth, setShowAuth] = useState(false);

  useEffect(() => {
    const localUser = localStorage.getItem("fitgen-user");
    const localPlan = localStorage.getItem("fitgen-plan");
    const localProfile = localStorage.getItem("fitgen-profile");
    const localHistory = localStorage.getItem("fitgen-history");
    if (localUser) setUser(JSON.parse(localUser));
    if (localPlan) setPlan(JSON.parse(localPlan));
    if (localProfile) setProfile(JSON.parse(localProfile));
    if (localHistory) {
      const parsedHistory = JSON.parse(localHistory);
      // Filter out any null/invalid entries to prevent crashes
      setHistory(
        Array.isArray(parsedHistory)
          ? parsedHistory.filter((h) => h && h.workout)
          : []
      );
    }
  }, []);

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

  const handleReplaceExercise = (
    weekIndex,
    dayIndex,
    exerciseIndex,
    newExerciseName
  ) => {
    const newPlan = JSON.parse(JSON.stringify(plan));
    const exercise =
      newPlan.weeks[weekIndex].schedule[dayIndex].exercises[exerciseIndex];

    const oldName = exercise.name;

    exercise.alternatives = exercise.alternatives.filter(
      (alt) => alt !== newExerciseName
    );
    exercise.alternatives.push(oldName);
    exercise.name = newExerciseName;

    setPlan(newPlan);
    saveToLocalStorage("fitgen-plan", newPlan);
  };

  const handleStartWorkout = (day) => {
    const savedState = localStorage.getItem("fitgen-active");
    if (savedState) {
      const parsed = JSON.parse(savedState);
      setActiveWorkout({ ...day, logs: parsed.logs, elapsed: parsed.elapsed });
    } else {
      setActiveWorkout(day);
    }
    setView("active");
  };

  const handleFinishWorkout = (log) => {
    const updatedHistory = [...history, log];
    setHistory(updatedHistory);
    saveToLocalStorage("fitgen-history", updatedHistory);
    localStorage.removeItem("fitgen-active");
    setActiveWorkout(null);
    setView("logs");
  };

  const handleResetSystem = () => {
    setPlan(null);
    setProfile(null);
    setHistory([]);
    localStorage.removeItem("fitgen-plan");
    localStorage.removeItem("fitgen-profile");
    localStorage.removeItem("fitgen-history");
    localStorage.removeItem("fitgen-active");
    setView("profile");
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
                onStartWorkout={handleStartWorkout}
                onGenerateNextWeek={handleGenerateNextWeek}
                onReplaceExercise={handleReplaceExercise}
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
                    onResetSystem={handleResetSystem}
                    isGuest={isGuest}
                    handleLogout={isGuest ? null : handleLogout}
                  />
                ) : (
                  <ProfileSetupForm onSavePlan={handleSavePlan} />
                )}
              </div>
            )}
            {view === "active" && activeWorkout && (
              <div>
                <ActiveWorkout
                  workout={activeWorkout}
                  onFinish={handleFinishWorkout}
                  onClose={() => {
                    setView("plan");
                  }}
                />
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

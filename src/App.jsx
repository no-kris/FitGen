import { useEffect, useMemo, useRef, useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";
import LogsScreen from "./components/screens/LogsScreen";
import PlanDashboard from "./features/dashboard/PlanDashboard";
import ActiveWorkout from "./features/workout/ActiveWorkout";
import { activeWorkoutStore } from "./services/storage/activeWorkoutStore";
import { AppContext } from "./context/AppContext";
import { useAuthObserver } from "./hooks/useAuthObserver";
import { useUserData } from "./hooks/useUserData";

function App() {
  const [view, setView] = useState("welcome");
  const [showAuth, setShowAuth] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const clearLocalDataRef = useRef(null);

  const clearStorage = () => {
    clearLocalDataRef.current?.();
    setActiveWorkout(null);
    activeWorkoutStore.clear();
  };

  const handleLogoutEvent = () => {
    clearStorage();
    setView("welcome");
  };

  const handleSyncComplete = (hasPlan) => {
    if (view === "welcome") {
      setView(hasPlan ? "plan" : "profile");
    }
  };

  const { user, setUser } = useAuthObserver(handleLogoutEvent);
  const {
    profile,
    plan,
    workouts,
    status,
    error,
    isSynced,
    syncError,
    retrySync,
    savePlan,
    updatePlan,
    addWorkout,
    resetProgram,
    deleteAll,
    clearLocalData,
  } = useUserData(user, { onSyncComplete: handleSyncComplete });

  useEffect(() => {
    clearLocalDataRef.current = clearLocalData;
  }, [clearLocalData]);

  const userData = useMemo(
    () => ({ profile, plan, history: workouts }),
    [profile, plan, workouts]
  );

  const handleSavePlan = async (nextPlan, nextProfile) => {
    await savePlan(nextPlan, nextProfile);
    setView("plan");
  };

  const handleResetSystem = async () => {
    await resetProgram();
    activeWorkoutStore.clear();
    setActiveWorkout(null);
    setView("profile");
  };

  const contextValue = {
    user,
    setUser,
    showAuth,
    setShowAuth,
    profile,
    plan,
    workouts,
    status,
    error,
    isSynced,
    syncError,
    retrySync,
    savePlan,
    updatePlan,
    addWorkout,
    resetProgram,
    deleteAll,
    userData,
    view,
    setView,
    activeWorkout,
    setActiveWorkout,
    clearStorage,
    handleSavePlan,
    handleResetSystem,
  };

  return (
    <AppContext.Provider value={contextValue}>
      <div className="app-container">
        {view === "welcome" ? (
          <WelcomeScreen />
        ) : (
          <Layout>
            {view === "plan" && <PlanDashboard />}
            {view === "logs" && (
              <div className="view-container">
                <LogsScreen />
              </div>
            )}
            {view === "profile" && (
              <div className="view-container">
                {userData.plan ? <ProfileScreen /> : <ProfileSetupForm />}
              </div>
            )}
            {view === "active" && activeWorkout && (
              <div>
                <ActiveWorkout />
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
        <AuthModal onClose={() => setShowAuth(false)} />
      </Modal>
    </AppContext.Provider>
  );
}

export default App;

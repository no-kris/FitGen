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
  const [isSavingPlan, setIsSavingPlan] = useState(false);
  const [isResettingProgram, setIsResettingProgram] = useState(false);
  const clearLocalDataRef = useRef(null);

  const clearStorage = () => {
    clearLocalDataRef.current?.();
    setActiveWorkout(null);
    activeWorkoutStore.clear();
    setIsSavingPlan(false);
    setIsResettingProgram(false);
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
    setIsSavingPlan(true);
    try {
      await savePlan(nextPlan, nextProfile);
      setView("plan");
    } finally {
      setIsSavingPlan(false);
    }
  };

  const handleResetSystem = async () => {
    setIsResettingProgram(true);
    try {
      await resetProgram();
      activeWorkoutStore.clear();
      setActiveWorkout(null);
      setView("profile");
    } finally {
      setIsResettingProgram(false);
    }
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
                {(userData.plan || isResettingProgram) && !isSavingPlan ? (
                  <ProfileScreen />
                ) : (
                  <ProfileSetupForm />
                )}
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

import { useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";
import LogsScreen from "./components/screens/LogsScreen";
import PlanDashboard from "./features/dashboard/PlanDashboard";
import ActiveWorkout from "./features/workout/ActiveWorkout";
import { firestoreService } from "./services/firebase/firestoreServices";
import { activeWorkoutStore } from "./services/storage/activeWorkoutStore";
import { AppContext } from "./context/AppContext";
import { useAuthObserver } from "./hooks/useAuthObserver";
import { useCloudSync } from "./hooks/useCloudSync";

function App() {
  const [view, setView] = useState("welcome");
  const [showAuth, setShowAuth] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [userData, setUserData] = useState({
    profile: null,
    plan: null,
    history: [],
  });

  const handleLogoutEvent = () => {
    setUserData({ profile: null, plan: null, history: [] });
    setView("welcome");
  };

  const handleSyncComplete = (hasPlan) => {
    if (view === "welcome") {
      setView(hasPlan ? "plan" : "profile");
    }
  };

  const { user, setUser } = useAuthObserver(handleLogoutEvent);
  const { isSynced, syncError } = useCloudSync(
    user,
    userData,
    setUserData,
    handleSyncComplete
  );

  const clearStorage = () => {
    setUserData({ profile: null, plan: null, history: [] });
    activeWorkoutStore.clear();
  };

  const handleSavePlan = async (plan, profile) => {
    if (user) {
      if (!isSynced) {
        throw new Error(
          "Still syncing your data from the cloud. Please try again in a moment."
        );
      }
      await firestoreService.saveUserData(user.uid, { plan, profile });
    }
    setUserData((prev) => ({ ...prev, plan, profile }));
    setView("plan");
  };

  const handleResetSystem = async () => {
    if (user) {
      try {
        await firestoreService.clearUserData(user.uid);
      } catch (error) {
        console.error("Error clearing user data:", error);
      }
    }
    clearStorage();
    setView("profile");
  };

  const contextValue = {
    user,
    setUser,
    isSynced,
    syncError,
    view,
    setView,
    userData,
    setUserData,
    showAuth,
    setShowAuth,
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

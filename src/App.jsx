import { useEffect, useState, useRef } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";
import Layout from "./components/layout/Layout";
import ProfileScreen from "./components/screens/ProfileScreen";
import ProfileSetupForm from "./features/onboarding/ProfileSetupForm";
import LogsScreen from "./components/screens/LogsScreen";
import PlanDashboard from "./features/dashboard/PlanDashboard";
import ActiveWorkout from "./features/workout/ActiveWorkout";
import { authService } from "./services/firebase/authServices";
import { firestoreService } from "./services/firebase/firestoreServices";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);
  const [userData, setUserData] = useState({
    profile: null,
    plan: null,
    history: [],
  });
  const [showAuth, setShowAuth] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null);

  const clearStorage = () => {
    setUserData({ profile: null, plan: null, history: [] });
    localStorage.removeItem("fitgen-active");
  };

  const stateRef = useRef({ userData, view });

  useEffect(() => {
    stateRef.current = { userData, view };
  }, [userData, view]);

  useEffect(() => {
    const unsubscribe = authService.subscribeToAuthChanges(
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          setIsGuest(currentUser.isAnonymous);

          let hasPlan = stateRef.current.userData.plan;

          // FETCH CLOUD DATA
          try {
            const cloudData = await firestoreService.getUserData(
              currentUser.uid
            );
            if (cloudData) {
              // Apply cloud data to local state
              setUserData((prev) => ({
                profile: cloudData.profile || prev.profile,
                plan: cloudData.plan || prev.plan,
                history: cloudData.history || prev.history,
              }));

              if (cloudData.plan) {
                hasPlan = true;
              }
            } else {
              // No cloud data? (New User or First Sync)
              const currentLocalState = stateRef.current.userData;

              if (currentLocalState.plan || currentLocalState.profile) {
                await firestoreService.saveUserData(currentUser.uid, {
                  plan: currentLocalState.plan,
                  profile: currentLocalState.profile,
                  history: currentLocalState.history,
                });
              }
            }
          } catch (err) {
            console.error("Sync Error:", err);
          }

          if (stateRef.current.view === "welcome") {
            setView(hasPlan ? "plan" : "profile");
          }
        } else {
          setUser(null);
          // On logout we can safely clear state without dependency issues
          setIsGuest((prevIsGuest) => {
            if (!prevIsGuest) {
              setUserData({ profile: null, plan: null, history: [] });
              setView("welcome");
            }
            return prevIsGuest;
          });
        }
      }
    );
    return () => unsubscribe();
  }, []);

  const handleSavePlan = (plan, profile) => {
    setUserData((prev) => ({ ...prev, plan, profile }));
    if (user) {
      firestoreService.saveUserData(user.uid, { plan, profile });
    }
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

  return (
    <>
      <div className="app-container">
        {view === "welcome" ? (
          <WelcomeScreen onAuth={() => setShowAuth(true)} />
        ) : (
          <Layout
            activeTab={view}
            onTabChange={setView}
            isGuest={isGuest}
            onAuth={() => setShowAuth(true)}
          >
            {view === "plan" && (
              <PlanDashboard
                user={user}
                userData={userData}
                setUserData={setUserData}
                setView={setView}
                setActiveWorkout={setActiveWorkout}
              />
            )}
            {view === "logs" && (
              <div className="view-container">
                <LogsScreen history={userData.history} />
              </div>
            )}
            {view === "profile" && (
              <div className="view-container">
                {userData.plan ? (
                  <ProfileScreen
                    profile={userData.profile}
                    onResetSystem={handleResetSystem}
                    isGuest={isGuest}
                    user={user}
                    clearStorage={clearStorage}
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
                  user={user}
                  userData={userData}
                  setUserData={setUserData}
                  setView={setView}
                  setActiveWorkout={setActiveWorkout}
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
        <AuthModal onClose={() => setShowAuth(false)} />
      </Modal>
    </>
  );
}

export default App;

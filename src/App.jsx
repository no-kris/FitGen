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
<<<<<<< HEAD
import saveToLocalStorage from "./utils/saveToLocalStorage";
import { authService } from "./services/firebase/authServices";
import { firestoreService } from "./services/firebase/firestoreServices";
=======
import { firestoreService } from "./services/firebase/firestoreServices";
import { AppContext } from "./context/AppContext";
import { useAuthObserver } from "./hooks/useAuthObserver";
import { useCloudSync } from "./hooks/useCloudSync";
>>>>>>> iphone

function App() {
  const [view, setView] = useState("welcome");
  const [showAuth, setShowAuth] = useState(false);
  const [activeWorkout, setActiveWorkout] = useState(null);
  const [userData, setUserData] = useState({
    profile: null,
    plan: null,
    history: [],
  });

<<<<<<< HEAD
  useEffect(() => {
    const localUser = localStorage.getItem("fitgen-user");
    const localPlan = localStorage.getItem("fitgen-plan");
    const localProfile = localStorage.getItem("fitgen-profile");
    const localHistory = localStorage.getItem("fitgen-history");
    function loadUser() {
      if (localUser) setUser(JSON.parse(localUser));
      if (localPlan) setPlan(JSON.parse(localPlan));
      if (localProfile) setProfile(JSON.parse(localProfile));
      if (localHistory) {
        const parsedHistory = JSON.parse(localHistory);
        setHistory(
          Array.isArray(parsedHistory)
            ? parsedHistory.filter((h) => h && h.workout)
            : []
        );
      }
    }
    loadUser();
  }, []);

  useEffect(() => {
    const unsubscribe = authService.subscribeToAuthChanges(
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          saveToLocalStorage("fitgen-user", currentUser);
          setIsGuest(false);
          // FETCH DATA FROM FIRESTORE
          try {
            const cloudData = await firestoreService.getUserData(
              currentUser.uid
            );
            if (cloudData) {
              if (cloudData.plan) {
                setPlan(cloudData.plan);
                saveToLocalStorage("fitgen-plan", cloudData.plan);
              }
              if (cloudData.profile) {
                setProfile(cloudData.profile);
                saveToLocalStorage("fitgen-profile", cloudData.profile);
              }
              if (cloudData.history) {
                setHistory(cloudData.history);
                saveToLocalStorage("fitgen-history", cloudData.history);
              }
            } else {
              // No cloud data. Either first time user.
              if (plan || profile) {
                await firestoreService.saveUserData(currentUser.uid, {
                  plan,
                  profile,
                  history,
                });
              }
            }
          } catch (error) {
            console.log("Failed to retrieve account", error);
            window.alert("Unable to find your data.");
          }
          if (view === "welcome") setView(plan ? "plan" : "profile");
        } else {
          setUser(null);
          localStorage.removeItem("fitgen-user");
          if (!isGuest) {
            setPlan(null);
            setProfile(null);
            setHistory([]);
            setView("welcome");
          }
        }
      }
    );
    return () => unsubscribe();
  }, [isGuest, history, plan, profile, view]);

  const clearLocalData = () => {
    setPlan(null);
    setProfile(null);
    setHistory([]);
    localStorage.removeItem("fitgen-plan");
    localStorage.removeItem("fitgen-profile");
    localStorage.removeItem("fitgen-history");
=======
  const handleLogoutEvent = () => {
    // Only clear data and redirect if they weren't a guest
    setUserData({ profile: null, plan: null, history: [] });
    setView("welcome");
  };

  const handleSyncComplete = (hasPlan) => {
    if (view === "welcome") {
      setView(hasPlan ? "plan" : "profile");
    }
  };

  const { user, setUser, isGuest, setIsGuest } =
    useAuthObserver(handleLogoutEvent);
  useCloudSync(user, userData, setUserData, handleSyncComplete);

  const clearStorage = () => {
    setUserData({ profile: null, plan: null, history: [] });
>>>>>>> iphone
    localStorage.removeItem("fitgen-active");
  };

  const handleSavePlan = (plan, profile) => {
<<<<<<< HEAD
    setPlan(plan);
    setProfile(profile);
    saveToLocalStorage("fitgen-plan", plan);
    saveToLocalStorage("fitgen-profile", profile);
=======
    setUserData((prev) => ({ ...prev, plan, profile }));
>>>>>>> iphone
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
<<<<<<< HEAD
  };

  const handleLogin = async (user) => {
    try {
      await authService.signIn(user.email, user.password);
      setIsGuest(false);
      setShowAuth(false);
    } catch (error) {
      console.error("Login failed", error);
    }
  };

  const handleResetPassword = async (email) => {
    try {
      await authService.resetPassword(email);
    } catch (error) {
      console.error("Reset password failed", error);
    }
  };

  const handleLogout = async () => {
    try {
      await authService.logout();
    } catch (error) {
      console.error("Logout failed", error);
    }
  };

  const handleDeleteAccount = async () => {
    try {
      clearLocalData();
      await firestoreService.clearUserData(user.uid);
      await authService.deleteAccount();
      alert("Your account has been successfully deleted.");
    } catch (error) {
      console.log("Failed to delete the user", error);
      if (error.code === "auth/requires-recent-login") {
        alert(
          "For security reasons, please log out and log back in before deleting your account."
        );
      } else {
        alert("Failed to delete account completely. Please try again.");
      }
    }
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
      if (user) {
        firestoreService.saveUserData(user.uid, { plan: newWeekPlan });
      }
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
    if (user) {
      firestoreService.saveUserData(user.uid, { plan: newPlan });
    }
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
    const updatedLog = {
      ...log,
      workout: {
        ...log.workout,
        date: new Date().toISOString(),
      },
    };
    const updatedHistory = [...history, updatedLog];
    setHistory(updatedHistory);
    saveToLocalStorage("fitgen-history", updatedHistory);
    if (user) {
      firestoreService.saveUserData(user.uid, { history: updatedHistory });
    }
    localStorage.removeItem("fitgen-active");
    setActiveWorkout(null);
    setView("logs");
  };

  const handleResetSystem = async () => {
    if (user) {
      try {
        await firestoreService.clearUserData(user.uid);
      } catch (error) {
        console.error("Failed to clear cloud data", error);
      }
    }
    clearLocalData();
=======
    clearStorage();
>>>>>>> iphone
    setView("profile");
  };

  const contextValue = {
    user,
    setUser,
    view,
    setView,
    isGuest,
    setIsGuest,
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
<<<<<<< HEAD
                {plan ? (
                  <ProfileScreen
                    profile={profile}
                    onResetSystem={handleResetSystem}
                    isGuest={isGuest}
                    onLogout={isGuest ? null : handleLogout}
                    onDeleteAccount={isGuest ? null : handleDeleteAccount}
                  />
                ) : (
                  <ProfileSetupForm onSavePlan={handleSavePlan} />
                )}
=======
                {userData.plan ? <ProfileScreen /> : <ProfileSetupForm />}
>>>>>>> iphone
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

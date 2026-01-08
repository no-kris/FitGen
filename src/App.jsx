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
import { authService } from "./services/firebase/authServices";
import { firestoreService } from "./services/firebase/firestoreServices";
import sendWelcomeMessage from "./services/api/emailService";

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
      setHistory(
        Array.isArray(parsedHistory)
          ? parsedHistory.filter((h) => h && h.workout)
          : []
      );
    }
  }, []);

  useEffect(() => {
    const unsubscribe = authService.subscribeToAuthChanges(
      async (currentUser) => {
        if (currentUser) {
          setUser(currentUser);
          saveToLocalStorage("fitgen-user", currentUser);
          setIsGuest(false);

          // FETCH CLOUD DATA
          try {
            const cloudData = await firestoreService.getUserData(
              currentUser.uid
            );
            if (cloudData) {
              // Apply cloud data to local state
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
              // No cloud data? (New User or First Sync)
              // If they have local guest data, maybe we should upload it?
              // For now, let's just save valid local data to cloud if it exists
              if (plan || profile) {
                await firestoreService.saveUserData(currentUser.uid, {
                  plan,
                  profile,
                  history,
                });
              }
            }
          } catch (err) {
            console.error("Sync Error:", err);
          }

          if (view === "welcome") setView(plan ? "plan" : "profile");
        } else {
          setUser(null);
          localStorage.removeItem("fitgen-user");
          // Clear data on logout so Guest doesn't see previous user's stuff
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
  }, [isGuest]);

  const handleSavePlan = (plan, profile) => {
    setPlan(plan);
    setProfile(profile);
    saveToLocalStorage("fitgen-plan", plan);
    saveToLocalStorage("fitgen-profile", profile);
    if (user) {
      firestoreService.saveUserData(user.uid, { plan, profile });
    }
    setView("plan");
  };

  const clearStorage = () => {
    setPlan(null);
    setProfile(null);
    setHistory([]);
    localStorage.removeItem("fitgen-plan");
    localStorage.removeItem("fitgen-profile");
    localStorage.removeItem("fitgen-history");
    localStorage.removeItem("fitgen-active");
  };

  const handleSignUp = async (user) => {
    try {
      await authService.signUp(user.email, user.password);
      sendWelcomeMessage(user.email);
      alert("Account successfully created! Welcome email sent.");
      setIsGuest(false);
      setShowAuth(false);
    } catch (error) {
      console.error("Signup failed", error);
    }
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
      await firestoreService.clearUserData(user.uid);
      await authService.deleteAccount();
      clearStorage();
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
                    onLogout={isGuest ? null : handleLogout}
                    onDeleteAccount={isGuest ? null : handleDeleteAccount}
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
        <AuthModal
          onSignUp={handleSignUp}
          onLogin={handleLogin}
          onResetPassword={handleResetPassword}
          onClose={() => setShowAuth(false)}
        />
      </Modal>
    </>
  );
}

export default App;

import { useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";
import Modal from "./components/ui/Modal";
import AuthModal from "./features/auth/AuthModal";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);

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

  return (
    <>
      <div className="app-container">
        {view === "welcome" && (
          <WelcomeScreen
            onGuestMode={() => setIsGuest(true)}
            onAuth={() => setShowAuth(true)}
          />
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

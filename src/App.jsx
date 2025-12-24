import { useState } from "react";
import WelcomeScreen from "./features/onboarding/WelcomeScreen";

function App() {
  const [user, setUser] = useState(null);
  const [view, setView] = useState("welcome");
  const [isGuest, setIsGuest] = useState(false);

  const [showAuth, setShowAuth] = useState(false);

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
    </>
  );
}

export default App;

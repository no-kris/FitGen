import { useState, useEffect, useRef } from "react";
import { authService } from "../services/firebase/authServices";

export function useAuthObserver(onLogout) {
  const [user, setUser] = useState(null);

  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    const unsubscribe = authService.subscribeToAuthChanges((currentUser) => {
      if (currentUser && !currentUser.isAnonymous) {
        setUser(currentUser);
      } else if (currentUser && currentUser.isAnonymous) {
        setUser(null);
        if (onLogoutRef.current) {
          onLogoutRef.current();
        }
        try {
          Promise.resolve(authService.logout()).catch((error) => {
            console.error("Failed to sign out anonymous user:", error);
          });
        } catch (error) {
          console.error("Failed to sign out anonymous user:", error);
        }
      } else {
        setUser(null);
        if (onLogoutRef.current) {
          onLogoutRef.current();
        }
      }
    });
    return () => unsubscribe();
  }, []);

  return { user, setUser };
}

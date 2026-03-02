import { useState, useEffect, useRef } from "react";
import { authService } from "../services/firebase/authServices";

export function useAuthObserver(onLogout) {
  const [user, setUser] = useState(null);
  const [isGuest, setIsGuest] = useState(false);

  const onLogoutRef = useRef(onLogout);
  useEffect(() => {
    onLogoutRef.current = onLogout;
  }, [onLogout]);

  useEffect(() => {
    const unsubscribe = authService.subscribeToAuthChanges((currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setIsGuest(currentUser.isAnonymous);
      } else {
        setUser(null);
        // We do NOT change isGuest to false immediately here
        // so that logout effects can check if the user WAS a guest.
        if (onLogoutRef.current) {
          onLogoutRef.current();
        }
      }
    });
    return () => unsubscribe();
  }, []);

  return { user, setUser, isGuest, setIsGuest };
}

import { useEffect, useRef } from "react";
import { firestoreService } from "../services/firebase/firestoreServices";

export function useCloudSync(user, userData, setUserData, onSyncComplete) {
  const localDataRef = useRef(userData);
  const onSyncCompleteRef = useRef(onSyncComplete);

  // Keep a ref to the latest callbacks/local data
  useEffect(() => {
    localDataRef.current = userData;
  }, [userData]);

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  useEffect(() => {
    if (!user) {
      return;
    }

    let isMounted = true;
    const syncData = async () => {
      let finalHasPlan = false;
      try {
        const cloudData = await firestoreService.getUserData(user.uid);
        if (cloudData && isMounted) {
          setUserData((prev) => ({
            profile: cloudData.profile || prev.profile,
            plan: cloudData.plan || prev.plan,
            history: cloudData.history || prev.history,
          }));
          finalHasPlan = !!cloudData.plan;
        } else if (isMounted) {
          const currentLocalData = localDataRef.current;
          if (currentLocalData.plan || currentLocalData.profile) {
            await firestoreService.saveUserData(user.uid, {
              plan: currentLocalData.plan,
              profile: currentLocalData.profile,
              history: currentLocalData.history,
            });
          }
          finalHasPlan = !!currentLocalData.plan;
        }
      } catch (err) {
        console.error("Sync Error:", err);
      } finally {
        if (isMounted) {
          if (onSyncCompleteRef.current) {
            onSyncCompleteRef.current(finalHasPlan);
          }
        }
      }
    };

    syncData();

    return () => {
      isMounted = false;
    };
  }, [user, setUserData]);

  return {};
}

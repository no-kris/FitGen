import { useEffect, useRef, useState } from "react";
import { firestoreService } from "../services/firebase/firestoreServices";

export function useCloudSync(user, userData, setUserData, onSyncComplete) {
  const [syncState, setSyncState] = useState({
    user: null,
    isSynced: false,
    syncError: null,
  });
  const localDataRef = useRef(userData);
  const setUserDataRef = useRef(setUserData);
  const onSyncCompleteRef = useRef(onSyncComplete);

  // Keep a ref to the latest callbacks/local data
  useEffect(() => {
    localDataRef.current = userData;
  }, [userData]);

  useEffect(() => {
    setUserDataRef.current = setUserData;
  }, [setUserData]);

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
        if (cloudData && Array.isArray(cloudData.history)) {
          await firestoreService.migrateLegacyHistory(
            user.uid,
            cloudData.history
          );
        }
        const cloudWorkouts = await firestoreService.getWorkouts(user.uid);

        if (!isMounted) {
          return;
        }

        if (cloudData || cloudWorkouts.length > 0) {
          setUserDataRef.current((prev) => ({
            profile: cloudData?.profile ?? prev.profile,
            plan: cloudData?.plan ?? prev.plan,
            history: cloudWorkouts,
          }));
          finalHasPlan = Boolean(cloudData?.plan);
        } else {
          const currentLocalData = localDataRef.current;
          if (currentLocalData.plan || currentLocalData.profile) {
            await firestoreService.saveUserData(user.uid, {
              plan: currentLocalData.plan,
              profile: currentLocalData.profile,
            });
          }
          finalHasPlan = Boolean(currentLocalData.plan);
        }

        if (isMounted) {
          setSyncState({ user, isSynced: true, syncError: null });
        }
      } catch (err) {
        console.error("Sync Error:", err);
        if (isMounted) {
          setSyncState({ user, isSynced: false, syncError: err });
        }
      } finally {
        if (isMounted && onSyncCompleteRef.current) {
          onSyncCompleteRef.current(finalHasPlan);
        }
      }
    };

    syncData();

    return () => {
      isMounted = false;
    };
  }, [user]);

  const isCurrentUser = Boolean(user && syncState.user === user);

  return {
    isSynced: isCurrentUser ? syncState.isSynced : false,
    syncError: isCurrentUser ? syncState.syncError : null,
  };
}

import { useCallback, useEffect, useRef, useState } from "react";
import { firestoreService } from "../services/firebase/firestoreServices";

const EMPTY_WORKOUTS = [];
const EMPTY_DATA_STATE = {
  ownerUid: null,
  profile: null,
  plan: null,
  workouts: EMPTY_WORKOUTS,
};

const SYNC_PENDING_ERROR =
  "Still syncing your data from the cloud. Please try again in a moment.";
const SYNC_FAILED_DEFAULT_ERROR =
  "Cloud sync failed. Please retry sync before saving changes.";
const SYNC_FAILED_SAVE_PLAN_ERROR =
  "Cloud sync failed. Please retry sync before saving your plan.";
const SYNC_FAILED_RESET_ERROR =
  "Cloud sync failed. Please retry sync before resetting your program.";

export function useUserData(user, options = {}) {
  const { onSyncComplete } = options || {};
  const uid = user?.uid ?? null;

  const [prevUid, setPrevUid] = useState(uid);
  const [syncAttempt, setSyncAttempt] = useState(0);
  const [syncState, setSyncState] = useState({
    uid: null,
    attempt: 0,
    status: "ready",
    error: null,
  });
  const [dataState, setDataState] = useState(EMPTY_DATA_STATE);

  const currentUidRef = useRef(uid);
  const localDataRef = useRef(dataState);
  const onSyncCompleteRef = useRef(onSyncComplete);

  if (uid !== prevUid) {
    setPrevUid(uid);
    setSyncState({
      uid: null,
      attempt: syncAttempt,
      status: "ready",
      error: null,
    });
    if (prevUid !== null) {
      setDataState(EMPTY_DATA_STATE);
    }
  }

  useEffect(() => {
    currentUidRef.current = uid;
  }, [uid]);

  useEffect(() => {
    localDataRef.current = dataState;
  }, [dataState]);

  useEffect(() => {
    onSyncCompleteRef.current = onSyncComplete;
  }, [onSyncComplete]);

  const retrySync = useCallback(() => {
    if (!uid) {
      return;
    }
    setSyncAttempt((prev) => prev + 1);
  }, [uid]);

  useEffect(() => {
    if (!uid) {
      return;
    }

    let isMounted = true;
    const syncData = async () => {
      let finalHasPlan = false;
      try {
        const cloudData = await firestoreService.getUserData(uid);
        if (!isMounted) {
          return;
        }
        if (cloudData && Array.isArray(cloudData.history)) {
          await firestoreService.migrateLegacyHistory(uid, cloudData.history);
          if (!isMounted) {
            return;
          }
        }
        const cloudWorkouts = await firestoreService.getWorkouts(uid);
        if (!isMounted) {
          return;
        }

        if (cloudData || cloudWorkouts.length > 0) {
          setDataState({
            ownerUid: uid,
            profile: cloudData?.profile ?? null,
            plan: cloudData?.plan ?? null,
            workouts: cloudWorkouts,
          });
          finalHasPlan = Boolean(cloudData?.plan);
        } else {
          const currentLocal = localDataRef.current;
          if (
            currentLocal.ownerUid === null &&
            (currentLocal.plan || currentLocal.profile)
          ) {
            await firestoreService.saveUserData(uid, {
              plan: currentLocal.plan,
              profile: currentLocal.profile,
            });
            if (!isMounted) {
              return;
            }
            setDataState({
              ownerUid: uid,
              profile: currentLocal.profile ?? null,
              plan: currentLocal.plan ?? null,
              workouts: EMPTY_WORKOUTS,
            });
            finalHasPlan = Boolean(currentLocal.plan);
          } else {
            setDataState({
              ownerUid: uid,
              profile: null,
              plan: null,
              workouts: EMPTY_WORKOUTS,
            });
            finalHasPlan = false;
          }
        }

        if (isMounted) {
          setSyncState({
            uid,
            attempt: syncAttempt,
            status: "ready",
            error: null,
          });
        }
      } catch (err) {
        console.error("Sync Error:", err);
        if (isMounted) {
          setSyncState({
            uid,
            attempt: syncAttempt,
            status: "error",
            error: err,
          });
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
  }, [uid, syncAttempt]);

  const isCurrentSync = Boolean(
    uid && syncState.uid === uid && syncState.attempt === syncAttempt
  );

  const status = !uid
    ? "ready"
    : isCurrentSync
      ? syncState.status
      : "loading";

  const error = uid && isCurrentSync ? syncState.error : null;
  const isSynced = Boolean(uid && status === "ready");
  const syncError = uid && status === "error" ? error : null;

  const isDataVisible = dataState.ownerUid === uid;
  const profile = isDataVisible ? dataState.profile : null;
  const plan = isDataVisible ? dataState.plan : null;
  const workouts = isDataVisible ? dataState.workouts : EMPTY_WORKOUTS;

  const assertReadyForWrite = useCallback(
    (failedMessage = SYNC_FAILED_DEFAULT_ERROR) => {
      if (!uid) {
        return;
      }
      if (status === "error") {
        throw new Error(failedMessage);
      }
      if (status !== "ready") {
        throw new Error(SYNC_PENDING_ERROR);
      }
    },
    [uid, status]
  );

  const savePlan = useCallback(
    async (nextPlan, nextProfile) => {
      assertReadyForWrite(SYNC_FAILED_SAVE_PLAN_ERROR);
      const writeUid = uid;
      if (writeUid) {
        await firestoreService.saveUserData(writeUid, {
          plan: nextPlan,
          profile: nextProfile,
        });
      }
      if (currentUidRef.current === writeUid) {
        setDataState((prev) => ({
          ...prev,
          ownerUid: writeUid,
          plan: nextPlan,
          profile: nextProfile,
        }));
      }
      return { plan: nextPlan, profile: nextProfile };
    },
    [assertReadyForWrite, uid]
  );

  const updatePlan = useCallback(
    async (nextPlan) => {
      assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR);
      const writeUid = uid;
      if (writeUid) {
        await firestoreService.saveUserData(writeUid, { plan: nextPlan });
      }
      if (currentUidRef.current === writeUid) {
        setDataState((prev) => ({
          ...prev,
          ownerUid: writeUid,
          plan: nextPlan,
        }));
      }
      return nextPlan;
    },
    [assertReadyForWrite, uid]
  );

  const addWorkout = useCallback(
    async (workoutPayload) => {
      assertReadyForWrite(SYNC_FAILED_DEFAULT_ERROR);
      const writeUid = uid;
      const savedEntry = writeUid
        ? await firestoreService.addWorkout(writeUid, workoutPayload)
        : { id: `local-${Date.now()}`, ...workoutPayload };
      if (currentUidRef.current === writeUid) {
        setDataState((prev) => ({
          ...prev,
          ownerUid: writeUid,
          workouts: [...prev.workouts, savedEntry],
        }));
      }
      return savedEntry;
    },
    [assertReadyForWrite, uid]
  );

  const resetProgram = useCallback(async () => {
    assertReadyForWrite(SYNC_FAILED_RESET_ERROR);
    const writeUid = uid;
    if (writeUid) {
      await firestoreService.resetUserProgram(writeUid);
    }
    if (currentUidRef.current === writeUid) {
      setDataState((prev) => ({
        ...prev,
        ownerUid: writeUid,
        profile: null,
        plan: null,
      }));
    }
  }, [assertReadyForWrite, uid]);

  const deleteAll = useCallback(async () => {
    if (!uid) {
      throw new Error("User ID is required to delete user data.");
    }
    const writeUid = uid;
    const result = await firestoreService.deleteUserData(writeUid);
    if (currentUidRef.current === writeUid) {
      setDataState({
        ownerUid: writeUid,
        profile: null,
        plan: null,
        workouts: EMPTY_WORKOUTS,
      });
    }
    return result;
  }, [uid]);

  const clearLocalData = useCallback(() => {
    setDataState(EMPTY_DATA_STATE);
  }, []);

  return {
    profile,
    plan,
    workouts,
    status,
    error,
    isSynced,
    syncError,
    retrySync,
    savePlan,
    updatePlan,
    addWorkout,
    resetProgram,
    deleteAll,
    clearLocalData,
  };
}

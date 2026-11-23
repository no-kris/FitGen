import { auth } from "../services/firebase/firebaseHelper";

export default async function getUserToken() {
  const currentUser = auth.currentUser;
  if (!currentUser) {
    throw new Error(
      "You are not authorized. You must have an account to perform this task."
    );
  }

  return await currentUser.getIdToken();
}

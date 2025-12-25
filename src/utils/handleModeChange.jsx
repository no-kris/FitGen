import Button from "../components/ui/Button";

const handleModeChange = (mode, setMode) => {
  if (mode === "login") {
    return (
      <>
        <Button
          onClick={() => setMode("signup")}
          text="CREATE ACCOUNT"
          className="text-primary"
        />
        <Button
          onClick={() => setMode("reset")}
          text="FORGOT PASS?"
          className="text-primary"
        />
      </>
    );
  }
  if (mode === "signup") {
    return (
      <Button
        onClick={() => setMode("login")}
        text="ALREADY HAVE AN ACCOUNT?"
        className="text-primary"
      />
    );
  }
  if (mode === "reset") {
    return (
      <Button
        onClick={() => setMode("login")}
        text="BACK TO LOGIN"
        className="text-primary"
      />
    );
  }
};

export default handleModeChange;

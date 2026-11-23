import { useState } from "react";
import Button from "../../components/ui/Button";
import TextInput from "../../components/ui/TextInput";
import handleModeChange from "../../utils/handleModeChange";
import { Eye, EyeOff } from "lucide-react";
import { useAuth } from "../../hooks/useAuth";

export default function AuthModal({ onClose }) {
  const { handleSignUp, handleLogin, handleResetPassword } = useAuth({
    setShowAuth: onClose,
  });
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  const handleSubmit = async () => {
    if (mode === "reset") {
      if (!email) {
        setMessage("EMAIL REQUIRED");
        return;
      }
      try {
        await handleResetPassword(email);
        onClose();
      } catch (error) {
        setMessage(error.message);
      }
      return;
    }

    if (!email || !password) {
      setMessage("CREDENTIALS REQUIRED");
      return;
    }

    if (mode === "login") {
      setMessage("AUTHENTICATING...");
      try {
        await handleLogin({ email, password });
        setMessage("");
      } catch (error) {
        setMessage(error.message);
      }
    } else if (mode === "signup") {
      setMessage("REGISTERING...");
      try {
        await handleSignUp({ email, password });
        setMessage("");
      } catch (error) {
        setMessage(error.message);
      }
    }
  };

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <div className="p-3 bg-card border text-error text-lg font-bold text-center">
          {message}
        </div>
      )}
      <div className="flex flex-col">
        <TextInput
          label="EMAIL"
          type="email"
          id="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          className="input input-bordered w-full text-primary"
          placeholder="USER@MAIL.COM"
        />
        {mode !== "reset" && (
          <>
            <div className="relative">
              <TextInput
                label="PASSWORD"
                type={showPassword ? "text" : "password"}
                id="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                className="input input-bordered w-full text-primary"
                placeholder="********"
              />
              <Button
                onClick={() => setShowPassword(!showPassword)}
                className="btn-show-password"
                Icon={showPassword ? EyeOff : Eye}
              />
            </div>
          </>
        )}
      </div>
      <div className="flex items-center justify-between mt-2 text-xs font-bold">
        {handleModeChange(mode, setMode)}
      </div>
      <Button
        onClick={handleSubmit}
        className="button btn-primary w-full font-bold text-lg uppercase p-4"
        text={
          mode === "login"
            ? "AUTHENTICATE"
            : mode === "signup"
            ? "REGISTER IDENTITY"
            : "SEND RESET LINK"
        }
      />
    </div>
  );
}

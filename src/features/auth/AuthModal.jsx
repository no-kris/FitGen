import { useState } from "react";
import Button from "../../components/ui/Button";
import handleModeChange from "../../utils/handleModeChange";

export default function AuthModal({ onClose }) {
  const [mode, setMode] = useState("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [message, setMessage] = useState("");

  return (
    <div className="flex flex-col gap-4">
      {message && (
        <div className="p-3 bg-card border border-primary text-primary text-xs font-bold text-center">
          {message}
        </div>
      )}
      <div className="flex items-center justify-between mt-2 text-xs font-bold">
        {handleModeChange(mode, setMode)}
      </div>
    </div>
  );
}

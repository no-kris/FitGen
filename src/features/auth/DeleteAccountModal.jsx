import { useRef, useState } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import Modal from "../../components/ui/Modal";
import Button from "../../components/ui/Button";
import TextInput from "../../components/ui/TextInput";

export default function DeleteAccountModal({
  isOpen,
  onClose,
  onConfirmDelete,
}) {
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [deleteError, setDeleteError] = useState(null);
  const isDeletingRef = useRef(false);

  const handleClose = () => {
    if (isDeletingRef.current || isDeleting) {
      return;
    }
    setPassword("");
    setShowPassword(false);
    setDeleteError(null);
    onClose();
  };

  const handleConfirm = async () => {
    if (isDeletingRef.current || password.length === 0) {
      return;
    }
    isDeletingRef.current = true;
    setIsDeleting(true);
    setDeleteError(null);

    try {
      await onConfirmDelete(password);
      setPassword("");
      setShowPassword(false);
      setDeleteError(null);
      onClose();
    } catch (error) {
      setDeleteError(
        error?.message || "Failed to delete account. Please try again."
      );
    } finally {
      isDeletingRef.current = false;
      setIsDeleting(false);
    }
  };

  return (
    <Modal isOpen={isOpen} onClose={handleClose} title="Delete Account?">
      <div className="flex flex-col gap-4">
        <p className="text-lg">
          Are you sure you want to permanently delete your account? Your
          account, profile, workout plan, and workout history will be
          permanently erased and cannot be recovered. Enter your current
          password to confirm.
        </p>

        <div className="relative">
          <TextInput
            id="delete-account-password"
            label="Confirm Password"
            type={showPassword ? "text" : "password"}
            value={password}
            onChange={(e) => {
              setPassword(e.target.value);
              if (deleteError) {
                setDeleteError(null);
              }
            }}
            placeholder="Enter your password"
            autoComplete="current-password"
            disabled={isDeleting}
            aria-invalid={Boolean(deleteError)}
            className={`input input-bordered w-full text-primary ${
              isDeleting ? "opacity-50" : ""
            }`}
          />
          <Button
            type="button"
            onClick={() => setShowPassword((prev) => !prev)}
            className="btn-show-password"
            Icon={showPassword ? EyeOff : Eye}
            disabled={isDeleting}
            aria-label={showPassword ? "Hide password" : "Show password"}
          />
        </div>

        {deleteError && (
          <div role="alert" className="alert-error text-lg font-bold">
            {deleteError}
          </div>
        )}

        <div className="flex justify-center w-full gap-2">
          <Button
            type="button"
            text="Cancel"
            onClick={handleClose}
            disabled={isDeleting}
            className="button btn-muted w-full font-bold text-lg uppercase p-4 letter-spacing-2"
          />
          <Button
            type="button"
            disabled={isDeleting || password.length === 0}
            aria-busy={isDeleting}
            onClick={handleConfirm}
            className="button btn-danger w-full font-bold text-lg uppercase p-4 letter-spacing-2"
            text={
              isDeleting ? (
                <span className="flex items-center justify-center gap-2">
                  <Loader2
                    className="animate-spin"
                    size={16}
                    aria-hidden="true"
                  />
                  Deleting...
                </span>
              ) : deleteError ? (
                "Retry"
              ) : (
                "Confirm Delete"
              )
            }
          />
        </div>
      </div>
    </Modal>
  );
}

import { FormEvent, useState } from "react";
import { ApiError } from "../api/client";
import { useChangePassword } from "../api/hooks";
import { Button, Field, Input } from "./ui";

/**
 * The password-change form, shared by the forced ChangePasswordPage and the Security page.
 * `forced` relabels "Current password" as "Temporary password"; `onSuccess` lets the forced flow
 * redirect while the Security page just shows an inline confirmation.
 */
export function ChangePasswordForm({ forced, onSuccess }: { forced?: boolean; onSuccess?: () => void }) {
  const changePassword = useChangePassword();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setDone(false);
    if (next !== confirm) {
      setError("The new passwords don't match.");
      return;
    }
    try {
      await changePassword.mutateAsync({ currentPassword: current, newPassword: next });
      setCurrent("");
      setNext("");
      setConfirm("");
      setDone(true);
      onSuccess?.();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the password.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label={forced ? "Temporary password" : "Current password"}>
        <Input
          type="password"
          autoComplete="current-password"
          required
          value={current}
          onChange={(e) => {
            setCurrent(e.target.value);
            setDone(false);
          }}
        />
      </Field>
      <Field label="New password">
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          placeholder="12+ characters with a letter and a number"
          value={next}
          onChange={(e) => setNext(e.target.value)}
        />
      </Field>
      <Field label="Confirm new password">
        <Input
          type="password"
          autoComplete="new-password"
          required
          minLength={12}
          value={confirm}
          onChange={(e) => setConfirm(e.target.value)}
        />
      </Field>
      {error && (
        <p role="alert" className="mb-3 font-mono text-2xs text-fail">
          {error}
        </p>
      )}
      {done && (
        <p role="status" className="mb-3 font-mono text-2xs text-pass">
          Password changed. Other sessions have been signed out.
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        icon="shield-checkmark-outline"
        className="w-full py-2.5"
        loading={changePassword.isPending}
      >
        {changePassword.isPending ? "Saving…" : "Change password"}
      </Button>
    </form>
  );
}

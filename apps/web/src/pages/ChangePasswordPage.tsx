import { useNavigate } from "react-router-dom";
import { useMe } from "../api/hooks";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { Card } from "../components/ui";

/**
 * The forced password-change screen: RequireAuth redirects here while the account still has an
 * admin-issued temporary password, and blocks everything else until it's replaced. Voluntary
 * password changes live on the Security page instead.
 */
export function ChangePasswordPage() {
  const { data: me } = useMe();
  const navigate = useNavigate();
  const forced = !!me?.mustChangePassword;

  return (
    <div className="mx-auto max-w-[480px]">
      <Card title={forced ? "Set your own password" : "Change password"}>
        {forced && (
          <p className="mb-4 text-2xs text-ink-faint">
            Your account was set up with a temporary password that someone else knows. Pick your own before
            continuing — everything else is locked until you do.
          </p>
        )}
        <ChangePasswordForm forced={forced} onSuccess={() => navigate("/", { replace: true })} />
      </Card>
    </div>
  );
}

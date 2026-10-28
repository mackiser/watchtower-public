import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useLogout, useMe } from "../api/hooks";
import { Icon } from "../components/Icon";
import { MfaEnrollmentModal } from "../components/MfaEnrollment";
import { Button, Card } from "../components/ui";

/**
 * The mandatory-MFA gate. RequireAuth routes any signed-in account without two-factor here, and
 * the API refuses everything except enrollment endpoints until it's on — so this page's only
 * exits are finishing setup or signing out.
 */
export function EnrollMfaPage() {
  const { data: me } = useMe();
  const logout = useLogout();
  const [enrolling, setEnrolling] = useState(true);

  // Enrollment finished (useEnableMfa refreshes ["me"]) — back to the app. Only once the modal
  // is closed, though: mfaEnabled flips true while it's still showing the one-time recovery
  // codes, and redirecting then would unmount them before they could be saved.
  if (me?.mfaEnabled && !enrolling) return <Navigate to="/" replace />;

  return (
    <div className="mx-auto max-w-[560px] pt-10">
      <Card title="Two-factor authentication required">
        <p className="mb-2 flex items-center gap-2 text-xs font-semibold text-ink">
          <Icon name="lock-closed-outline" size={16} /> Watchtower now requires two-factor authentication for
          every account.
        </p>
        <p className="mb-4 text-2xs leading-relaxed text-ink-faint">
          Set it up once with an authenticator app (Microsoft Authenticator, Google Authenticator, 1Password,
          etc.) — it takes about a minute. You&rsquo;ll get recovery codes to keep somewhere safe in case you
          lose your phone.
        </p>
        <div className="flex flex-wrap items-center gap-2">
          <Button variant="primary" icon="shield-checkmark-outline" onClick={() => setEnrolling(true)}>
            Set up two-factor
          </Button>
          <Button variant="ghost" icon="log-out-outline" loading={logout.isPending} onClick={() => logout.mutate()}>
            Sign out
          </Button>
        </div>
      </Card>
      {enrolling && <MfaEnrollmentModal onClose={() => setEnrolling(false)} />}
    </div>
  );
}

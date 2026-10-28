import type { ReactNode } from "react";
import { Navigate, useLocation } from "react-router-dom";
import { useMe } from "../api/hooks";
import { Skeleton } from "./ui";

export function RequireAuth({ children, adminOnly }: { children: ReactNode; adminOnly?: boolean }) {
  const { data: user, isLoading } = useMe();
  const location = useLocation();

  if (isLoading)
    return (
      <div className="centered-loader">
        <Skeleton className="h-2 w-40" />
      </div>
    );
  if (!user) return <Navigate to="/login" state={{ from: location }} replace />;
  // An admin-issued temporary password must be replaced before anything else — the admin who
  // set it knows it too.
  if (user.mustChangePassword && location.pathname !== "/change-password") {
    return <Navigate to="/change-password" replace />;
  }
  // MFA is mandatory (the API blocks non-enrollment endpoints too) — after any forced password
  // change, an un-enrolled account can only reach the enrollment gate. `mfaExempt` accounts
  // (admin-granted, for testing/demos) skip the gate and can enroll later from Security.
  if (!user.mustChangePassword && !user.mfaEnabled && !user.mfaExempt && location.pathname !== "/enroll-2fa") {
    return <Navigate to="/enroll-2fa" replace />;
  }
  if (adminOnly && user.role !== "ADMIN") return <Navigate to="/" replace />;
  return <>{children}</>;
}

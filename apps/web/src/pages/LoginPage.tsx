import { FormEvent, useEffect, useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { useLogin, useLoginMfa, useMe } from "../api/hooks";
import { ApiError } from "../api/client";
import { Logo } from "../components/Logo";
import { Button, Field, Input } from "../components/ui";

// Set only on the public demo build (see Dockerfile): the login is deliberately published.
const DEMO_EMAIL = import.meta.env.VITE_DEMO_EMAIL || undefined;
const DEMO_PASSWORD = import.meta.env.VITE_DEMO_PASSWORD || undefined;

export function LoginPage() {
  const { data: user } = useMe();
  const login = useLogin();
  const loginMfa = useLoginMfa();
  const navigate = useNavigate();
  const location = useLocation() as { state?: { from?: Location } };
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Once the password is accepted for an MFA account, we swap the form for the code step.
  const [mfaStep, setMfaStep] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // Set by the unauthorized listener in main.tsx when a signed-in session hits a 401 (idle or
  // absolute timeout). Read in the initializer, cleared in an effect — clearing inside the
  // initializer would lose the notice under StrictMode's dev double-mount.
  const [expiredNotice] = useState(() => sessionStorage.getItem("wt-session-expired") === "1");
  useEffect(() => {
    sessionStorage.removeItem("wt-session-expired");
  }, []);

  if (user) return <Navigate to="/" replace />;

  const dest = location.state?.from?.pathname ?? "/";

  async function onSubmitPassword(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await login.mutateAsync({ email, password });
      if ("mfaRequired" in res) {
        setMfaStep(true);
      } else {
        navigate(dest, { replace: true });
      }
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't sign in.");
    }
  }

  async function onSubmitCode(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await loginMfa.mutateAsync(code.trim());
      navigate(dest, { replace: true });
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't verify that code.");
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center p-6">
      {/* the auth card floats alone on the field — the one resting-elevation surface here */}
      <div className="w-full max-w-[380px] rounded border border-line bg-surface p-8 shadow-sm">
        <div className="brand mb-[22px]">
          <Logo />
          <span className="mark">WATCHTOWER</span>
        </div>
        {expiredNotice && (
          <p role="status" className="mb-4 font-mono text-2xs text-warn">
            Your session expired — please sign in again.
          </p>
        )}
        {mfaStep ? (
          <>
            <h1 className="mb-1 text-md font-bold text-ink">Two-factor</h1>
            <div className="mb-[22px] font-mono text-3xs uppercase tracking-[1px] text-ink-faint">
              Enter the code from your authenticator app
            </div>
            <form onSubmit={onSubmitCode}>
              <Field
                label="Authentication code"
                hint="Lost your device? Enter one of your recovery codes instead."
              >
                <Input
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  autoFocus
                  required
                  placeholder="123456"
                  value={code}
                  onChange={(e) => setCode(e.target.value)}
                />
              </Field>
              {error && (
                <p role="alert" className="mb-3 font-mono text-2xs text-fail">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full py-2.5" loading={loginMfa.isPending}>
                {loginMfa.isPending ? "Verifying…" : "Verify"}
              </Button>
              <Button
                type="button"
                className="mt-2.5 w-full py-2.5"
                onClick={() => {
                  setMfaStep(false);
                  setCode("");
                  setError(null);
                }}
              >
                Back
              </Button>
            </form>
          </>
        ) : (
          <>
            <h1 className="mb-1 text-md font-bold text-ink">Sign in</h1>
            <div className="mb-[22px] font-mono text-3xs uppercase tracking-[1px] text-ink-faint">
              Security Posture &amp; Hardening Console
            </div>
            <form onSubmit={onSubmitPassword}>
              <Field label="Email">
                <Input
                  type="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                />
              </Field>
              <Field label="Password">
                <Input
                  type="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                />
              </Field>
              {error && (
                <p role="alert" className="mb-3 font-mono text-2xs text-fail">
                  {error}
                </p>
              )}
              <Button type="submit" variant="primary" className="w-full py-2.5" loading={login.isPending}>
                {login.isPending ? "Signing in…" : "Sign in"}
              </Button>
            </form>
            {DEMO_EMAIL && (
              <div className="mt-5 border-t border-line-soft pt-4 text-2xs text-ink-dim">
                <p className="mb-2">
                  This is a read-only demo with fictional data. Sign in as{" "}
                  <span className="font-mono text-ink">{DEMO_EMAIL}</span> / <span className="whitespace-nowrap font-mono text-ink">{DEMO_PASSWORD}</span>.
                </p>
                <Button
                  type="button"
                  size="sm"
                  onClick={() => {
                    setEmail(DEMO_EMAIL);
                    setPassword(DEMO_PASSWORD ?? "");
                  }}
                >
                  Fill in demo login
                </Button>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

import { FormEvent, useEffect, useId, useState } from "react";
import { useLocation } from "react-router-dom";
import { ApiError } from "../api/client";
import {
  useDisableMfa,
  useForgetTrustedDevices,
  useMe,
  useMfaStatus,
  useRegenerateRecoveryCodes,
  useSetMfaGrace,
  useUpdateProfile,
} from "../api/hooks";
import { ChangePasswordForm } from "../components/ChangePasswordForm";
import { Icon } from "../components/Icon";
import { MfaEnrollmentModal, RecoveryCodesView } from "../components/MfaEnrollment";
import { Button, Card, Field, Input, Modal, Select } from "../components/ui";

const GRACE_OPTIONS = [
  { value: 0, label: "Every sign-in" },
  { value: 15, label: "15 minutes" },
  { value: 30, label: "30 minutes" },
  { value: 60, label: "1 hour" },
];

export function SecurityPage() {
  const { data: me } = useMe();
  const { data: status } = useMfaStatus();
  const [enrolling, setEnrolling] = useState(false);
  const [disabling, setDisabling] = useState(false);
  const [regenerating, setRegenerating] = useState(false);

  const setGrace = useSetMfaGrace();
  const forgetDevices = useForgetTrustedDevices();
  const [devicesForgotten, setDevicesForgotten] = useState(false);

  const mfaOn = !!me?.mfaEnabled;

  // The header profile menu deep-links to #profile / #password / #twofactor — scroll to them.
  const location = useLocation();
  useEffect(() => {
    if (!location.hash) return;
    const el = document.getElementById(location.hash.slice(1));
    if (el) el.scrollIntoView({ behavior: "smooth", block: "start" });
  }, [location.hash]);

  return (
    <div>
      <div className="scope">
        <span>Account settings</span>
      </div>
      <Card title="Profile" id="profile" className="mb-[18px]">
        <ProfileSection />
      </Card>
      <div className="grid gap-[18px] min-[900px]:grid-cols-2">
        <Card title="Change password" id="password">
          <ChangePasswordForm />
        </Card>

        <Card title="Two-factor authentication" id="twofactor">
          {!mfaOn ? (
            <>
              <p className="mb-4 text-2xs text-ink-faint">
                Add a second step at sign-in using an authenticator app (Microsoft Authenticator, Google
                Authenticator, 1Password, etc.). Recommended for every account.
                {me?.mfaExempt && (
                  <>
                    {" "}
                    <span className="text-warn">
                      An admin has made two-factor optional for this account, so you won&rsquo;t be prompted to set
                      it up — you can still turn it on here.
                    </span>
                  </>
                )}
              </p>
              <Button variant="primary" icon="shield-checkmark-outline" onClick={() => setEnrolling(true)}>
                Enable two-factor
              </Button>
            </>
          ) : (
            <>
              <p className="inline-flex items-center gap-2 font-mono text-2xs uppercase tracking-[.5px] text-pass">
                <Icon name="checkmark-outline" /> Two-factor is on
              </p>

              <Field
                label="Ask again on this device"
                className="mt-4"
                hint="After you pass two-factor, this browser won't ask again until this much time has passed. Changing it forgets currently-trusted devices."
              >
                <Select
                  value={me?.mfaGraceMinutes ?? 0}
                  disabled={setGrace.isPending}
                  onChange={(e) => setGrace.mutate(Number(e.target.value))}
                >
                  {GRACE_OPTIONS.map((o) => (
                    <option key={o.value} value={o.value}>
                      {o.label}
                    </option>
                  ))}
                </Select>
              </Field>

              <div className="mt-3.5 flex items-center justify-between gap-3.5 border-t border-line-soft py-3.5">
                <div>
                  <div className="mb-0.5 text-xs font-semibold text-ink">Recovery codes</div>
                  <div className="text-2xs text-ink-faint">
                    {status ? `${status.recoveryCodesRemaining} unused` : "…"} — single-use backups for when you
                    don&rsquo;t have your authenticator.
                  </div>
                </div>
                <Button onClick={() => setRegenerating(true)}>Regenerate</Button>
              </div>

              <div className="flex items-center justify-between gap-3.5 border-t border-line-soft py-3.5">
                <div>
                  <div className="mb-0.5 text-xs font-semibold text-ink">Trusted devices</div>
                  <div className="text-2xs text-ink-faint">Forget every browser currently skipping two-factor.</div>
                </div>
                <Button
                  disabled={forgetDevices.isPending}
                  onClick={() =>
                    forgetDevices.mutate(undefined, {
                      onSuccess: () => {
                        setDevicesForgotten(true);
                        setTimeout(() => setDevicesForgotten(false), 2500);
                      },
                    })
                  }
                >
                  {devicesForgotten ? "Done" : "Forget devices"}
                </Button>
              </div>

              <Button variant="danger" icon="trash-outline" className="mt-[18px]" onClick={() => setDisabling(true)}>
                Turn off two-factor
              </Button>
            </>
          )}
        </Card>
      </div>

      {enrolling && <MfaEnrollmentModal onClose={() => setEnrolling(false)} />}
      {disabling && <DisableMfaDialog onClose={() => setDisabling(false)} />}
      {regenerating && <RegenerateCodesDialog onClose={() => setRegenerating(false)} />}
    </div>
  );
}

// ---------- profile (own display name) ----------
// Email and role are shown read-only: email is the sign-in identity, role is admin-managed.
function ProfileSection() {
  const { data: me } = useMe();
  const updateProfile = useUpdateProfile();
  const [name, setName] = useState(me?.name ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Sync once the cached user resolves (SecurityPage can render before ["me"] is populated).
  useEffect(() => {
    if (me?.name) setName(me.name);
  }, [me?.name]);

  const dirty = me ? name.trim() !== me.name : false;

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setSaved(false);
    try {
      await updateProfile.mutateAsync({ name: name.trim() });
      setSaved(true);
      setTimeout(() => setSaved(false), 2000);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't save your name.");
    }
  }

  return (
    <form onSubmit={onSubmit}>
      <Field label="Display name">
        <Input
          type="text"
          required
          maxLength={100}
          value={name}
          onChange={(e) => {
            setName(e.target.value);
            setSaved(false);
          }}
        />
      </Field>
      <Field label="Email" hint="Your email is your sign-in and can't be changed here.">
        <Input type="email" value={me?.email ?? ""} disabled readOnly className="opacity-60" />
      </Field>
      <Field label="Role">
        <Input type="text" value={me?.role === "ADMIN" ? "Admin" : "Member"} disabled readOnly className="opacity-60" />
      </Field>
      {error && (
        <p role="alert" className="mb-3 font-mono text-2xs text-fail">
          {error}
        </p>
      )}
      {saved && (
        <p role="status" className="mb-3 font-mono text-2xs text-pass">
          Saved.
        </p>
      )}
      <Button
        type="submit"
        variant="primary"
        loading={updateProfile.isPending}
        disabled={!dirty || !name.trim() || updateProfile.isPending}
      >
        {updateProfile.isPending ? "Saving…" : "Save name"}
      </Button>
    </form>
  );
}

// ---------- disable ----------
function DisableMfaDialog({ onClose }: { onClose: () => void }) {
  const disable = useDisableMfa();
  const formId = useId();
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await disable.mutateAsync({ password, code: code.trim() });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't turn off two-factor.");
    }
  }

  return (
    <Modal
      title="Turn off two-factor"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="danger" loading={disable.isPending}>
            {disable.isPending ? "Turning off…" : "Turn off two-factor"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit}>
        <p className="confirm-body mb-3.5">
          Confirm with your password and a current code. This removes your recovery codes and trusted devices too.
        </p>
        <Field label="Password">
          <Input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Authentication or recovery code" error={error}>
          <Input
            type="text"
            inputMode="numeric"
            autoComplete="one-time-code"
            required
            value={code}
            onChange={(e) => setCode(e.target.value)}
          />
        </Field>
      </form>
    </Modal>
  );
}

// ---------- regenerate recovery codes ----------
function RegenerateCodesDialog({ onClose }: { onClose: () => void }) {
  const regenerate = useRegenerateRecoveryCodes();
  const formId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await regenerate.mutateAsync(code.trim());
      setCodes(res.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't regenerate codes.");
    }
  }

  return (
    <Modal
      title="Regenerate recovery codes"
      onClose={onClose}
      maxWidth={440}
      footer={
        codes ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={regenerate.isPending}>
              {regenerate.isPending ? "Generating…" : "Regenerate"}
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <RecoveryCodesView codes={codes} />
      ) : (
        <form id={formId} onSubmit={onSubmit}>
          <p className="confirm-body mb-3.5">
            This replaces all of your existing recovery codes. Enter a current code to confirm.
          </p>
          <Field label="Authentication code" error={error}>
            <Input
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              required
              autoFocus
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>
        </form>
      )}
    </Modal>
  );
}

import type { AuthUser } from "@watchtower/shared";
import { FormEvent, useId, useState } from "react";
import { ApiError } from "../api/client";
import { useCreateUser, useDeleteUser, useMe, useResetUserMfa, useResetUserPassword, useSetUserMfaExempt, useSetUserRole, useUnlockUser, useUsers } from "../api/hooks";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Button, Card, Field, Input, Modal, Pill, Select } from "../components/ui";
import { timeAgo } from "../lib/format";

export function AdminUsersPage() {
  const { data: users, isLoading } = useUsers();
  const { data: me } = useMe();
  const createUser = useCreateUser();
  const deleteUser = useDeleteUser();

  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [password, setPassword] = useState("");
  const [role, setRole] = useState<"ADMIN" | "MEMBER">("MEMBER");
  const [mfaExempt, setMfaExempt] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [errorField, setErrorField] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setErrorField(null);
    try {
      await createUser.mutateAsync({ email, name, password, role, mfaExempt });
      setEmail("");
      setName("");
      setPassword("");
      setRole("MEMBER");
      setMfaExempt(false);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't create that user.");
      // The API's validation errors are field-specific (duplicate email, password too short,
      // etc.) even though the message itself doesn't say which field — point at the most likely
      // offender so the user isn't hunting a 3-field form for what went wrong.
      const msg = err instanceof ApiError ? err.message.toLowerCase() : "";
      setErrorField(msg.includes("email") ? "newEmail" : msg.includes("password") ? "newPassword" : msg.includes("name") ? "newName" : null);
    }
  }

  const resetMfa = useResetUserMfa();
  const unlock = useUnlockUser();
  const setUserMfaExempt = useSetUserMfaExempt();
  const [pendingExempt, setPendingExempt] = useState<AuthUser | null>(null);
  const [pendingRemove, setPendingRemove] = useState<AuthUser | null>(null);
  const [pendingReset, setPendingReset] = useState<AuthUser | null>(null);
  const [pendingMfaReset, setPendingMfaReset] = useState<AuthUser | null>(null);
  const [pendingRole, setPendingRole] = useState<AuthUser | null>(null);

  return (
    <div>
      <div className="scope">
        <span>Team access</span>
      </div>
      <div className="grid gap-[18px] min-[900px]:grid-cols-2">
        <Card title="Add a teammate">
          <form onSubmit={onSubmit}>
            <Field label="Name">
              <Input
                type="text"
                required
                invalid={errorField === "newName"}
                value={name}
                onChange={(e) => {
                  setName(e.target.value);
                  if (errorField === "newName") setErrorField(null);
                }}
              />
            </Field>
            <Field label="Email">
              <Input
                type="email"
                required
                invalid={errorField === "newEmail"}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  if (errorField === "newEmail") setErrorField(null);
                }}
              />
            </Field>
            <Field label="Temporary password">
              <Input
                type="text"
                autoComplete="off"
                required
                minLength={12}
                placeholder="12+ characters with a letter and a number"
                invalid={errorField === "newPassword"}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  if (errorField === "newPassword") setErrorField(null);
                }}
              />
            </Field>
            <Field label="Role">
              <Select value={role} onChange={(e) => setRole(e.target.value as "ADMIN" | "MEMBER")}>
                <option value="MEMBER">Member</option>
                <option value="ADMIN">Admin</option>
              </Select>
            </Field>
            <Field
              label="Two-factor"
              hint={
                mfaExempt
                  ? "This account can use the app without setting up 2FA — intended for test and demo logins, not day-to-day accounts."
                  : "They'll be required to enroll in two-factor at their first sign-in."
              }
            >
              <Select value={mfaExempt ? "optional" : "required"} onChange={(e) => setMfaExempt(e.target.value === "optional")}>
                <option value="required">Required at first sign-in</option>
                <option value="optional">Optional — allow skipping setup</option>
              </Select>
            </Field>
            {error && (
              <p role="alert" className="mb-3 font-mono text-2xs text-fail">
                {error}
              </p>
            )}
            <Button type="submit" variant="primary" icon="add-outline" className="w-full py-2.5" loading={createUser.isPending}>
              {createUser.isPending ? "Adding…" : "Add teammate"}
            </Button>
          </form>
        </Card>
        <Card title="Current team">
          {isLoading ? (
            <p className="py-2 text-xs text-ink-faint">Loading…</p>
          ) : (
            <table className="users-table">
              <thead>
                <tr>
                  <th>Name</th>
                  <th>Email</th>
                  <th>Last sign-in</th>
                  <th>Role</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {(users ?? []).map((u) => {
                  const locked = !!u.lockedUntil && new Date(u.lockedUntil) > new Date();
                  return (
                  <tr key={u.id}>
                    <td data-label="Name">{u.name}</td>
                    <td data-label="Email">{u.email}</td>
                    <td
                      data-label="Last sign-in"
                      className="whitespace-nowrap font-mono text-2xs text-ink-dim"
                      title={u.lastLoginAt ? new Date(u.lastLoginAt).toLocaleString() : "Has never signed in"}
                    >
                      {u.lastLoginAt ? timeAgo(u.lastLoginAt) : <span className="text-ink-faint">Never</span>}
                    </td>
                    <td data-label="Role">
                      <Pill round tone={u.role === "ADMIN" ? "signal" : "neutral"}>
                        {u.role}
                      </Pill>
                      {u.mfaEnabled && (
                        <Pill round tone="pass" className="ml-1.5" title="Two-factor authentication is on">
                          2FA
                        </Pill>
                      )}
                      {/* The waiver is shown even when they've enrolled anyway — it's a standing
                          grant, so it stays visible until an admin revokes it. */}
                      {u.mfaExempt && (
                        <Pill
                          round
                          tone="neutral"
                          className="ml-1.5"
                          title="Exempt from the mandatory two-factor enrollment gate (test/demo account)"
                        >
                          2FA optional
                        </Pill>
                      )}
                      {!u.mfaEnabled && !u.mfaExempt && (
                        <Pill round tone="warn" className="ml-1.5" title="Hasn't enrolled in two-factor yet — they'll be required to at next sign-in">
                          no 2FA
                        </Pill>
                      )}
                      {locked && (
                        <Pill
                          round
                          tone="fail"
                          className="ml-1.5"
                          title={`Locked after repeated failed sign-in attempts until ${new Date(u.lockedUntil!).toLocaleTimeString()}`}
                        >
                          Locked
                        </Pill>
                      )}
                      {u.mustChangePassword && (
                        <Pill round tone="warn" className="ml-1.5" title="Still using the admin-issued temporary password">
                          temp pw
                        </Pill>
                      )}
                    </td>
                    <td>
                      {u.id !== me?.id && (
                        <div className="flex flex-wrap justify-end gap-2">
                          {locked && (
                            <Button
                              size="sm"
                              icon="lock-closed-outline"
                              loading={unlock.isPending && unlock.variables === u.id}
                              disabled={unlock.isPending}
                              onClick={() => unlock.mutate(u.id)}
                            >
                              Unlock
                            </Button>
                          )}
                          <Button size="sm" icon="people-outline" onClick={() => setPendingRole(u)}>
                            {u.role === "ADMIN" ? "Make member" : "Make admin"}
                          </Button>
                          {/* Tightening (making 2FA required again) is one click; loosening goes
                              through a confirm — same asymmetry as the ISPM not-applicable flag. */}
                          {u.mfaExempt ? (
                            <Button
                              size="sm"
                              icon="lock-closed-outline"
                              disabled={setUserMfaExempt.isPending}
                              onClick={() => setUserMfaExempt.mutate({ id: u.id, mfaExempt: false })}
                            >
                              Make 2FA required
                            </Button>
                          ) : (
                            <Button size="sm" icon="shield-checkmark-outline" onClick={() => setPendingExempt(u)}>
                              Make 2FA optional
                            </Button>
                          )}
                          {u.mfaEnabled && (
                            <Button size="sm" icon="shield-checkmark-outline" onClick={() => setPendingMfaReset(u)}>
                              Reset 2FA
                            </Button>
                          )}
                          <Button size="sm" icon="shield-checkmark-outline" onClick={() => setPendingReset(u)}>
                            Reset password
                          </Button>
                          <Button size="sm" icon="trash-outline" onClick={() => setPendingRemove(u)}>
                            Remove
                          </Button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </Card>
      </div>
      {pendingReset && <ResetPasswordDialog user={pendingReset} onClose={() => setPendingReset(null)} />}
      {pendingMfaReset && (
        <ConfirmDialog
          title="Reset two-factor?"
          body={`${pendingMfaReset.name} (${pendingMfaReset.email}) will have two-factor turned off and be signed out everywhere. Use this only when they've lost their authenticator and recovery codes — they can re-enable it afterward.`}
          confirmLabel="Reset two-factor"
          danger
          onConfirm={() => {
            resetMfa.mutate(pendingMfaReset.id);
            setPendingMfaReset(null);
          }}
          onCancel={() => setPendingMfaReset(null)}
        />
      )}
      {pendingRemove && (
        <ConfirmDialog
          title="Remove this teammate?"
          body={`${pendingRemove.name} (${pendingRemove.email}) will lose access immediately. They'll need to be re-invited to sign in again.`}
          confirmLabel="Remove access"
          danger
          onConfirm={() => {
            deleteUser.mutate(pendingRemove.id);
            setPendingRemove(null);
          }}
          onCancel={() => setPendingRemove(null)}
        />
      )}
      {pendingExempt && (
        <ConfirmDialog
          title="Make two-factor optional?"
          body={`${pendingExempt.name} (${pendingExempt.email}) will be able to use Watchtower without setting up two-factor authentication. Intended for test and demo accounts — every other account stays required. This is recorded in the audit log, and you can switch it back at any time.`}
          confirmLabel="Make 2FA optional"
          danger
          onConfirm={() => {
            setUserMfaExempt.mutate({ id: pendingExempt.id, mfaExempt: true });
            setPendingExempt(null);
          }}
          onCancel={() => setPendingExempt(null)}
        />
      )}
      {pendingRole && <RoleChangeDialog user={pendingRole} onClose={() => setPendingRole(null)} />}
    </div>
  );
}

/**
 * Promote a member to admin or demote an admin back to member. Uses a confirm dialog rather than a
 * one-click toggle because it's a real privilege change; surfaces the API's last-admin guard inline.
 */
function RoleChangeDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const setRole = useSetUserRole();
  const [error, setError] = useState<string | null>(null);
  const target: "ADMIN" | "MEMBER" = user.role === "ADMIN" ? "MEMBER" : "ADMIN";
  const promoting = target === "ADMIN";

  async function onConfirm() {
    setError(null);
    try {
      await setRole.mutateAsync({ id: user.id, role: target });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't change the role.");
    }
  }

  return (
    <Modal
      title={promoting ? "Make admin?" : "Make member?"}
      onClose={onClose}
      maxWidth={440}
      alert
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button variant={promoting ? "primary" : "danger"} onClick={onConfirm} loading={setRole.isPending}>
            {setRole.isPending ? "Saving…" : promoting ? "Make admin" : "Make member"}
          </Button>
        </>
      }
    >
      <p className="confirm-body">
        {promoting
          ? `${user.name} (${user.email}) will become an admin — full access to manage clients and teammates, including changing roles.`
          : `${user.name} (${user.email}) will become a regular member and lose admin access to managing clients, teammates, and roles.`}
      </p>
      {error && (
        <p role="alert" className="mt-3 font-mono text-2xs text-fail">
          {error}
        </p>
      )}
    </Modal>
  );
}

/**
 * Issues a new temporary password for a teammate (no email infra, so the admin hands it over
 * out-of-band). The account is signed out everywhere and must pick its own password next login.
 */
function ResetPasswordDialog({ user, onClose }: { user: AuthUser; onClose: () => void }) {
  const resetPassword = useResetUserPassword();
  const formId = useId();
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      await resetPassword.mutateAsync({ id: user.id, password });
      onClose();
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't reset the password.");
    }
  }

  return (
    <Modal
      title="Reset password"
      onClose={onClose}
      maxWidth={440}
      footer={
        <>
          <Button onClick={onClose}>Cancel</Button>
          <Button type="submit" form={formId} variant="primary" loading={resetPassword.isPending}>
            {resetPassword.isPending ? "Resetting…" : "Reset password"}
          </Button>
        </>
      }
    >
      <form id={formId} onSubmit={onSubmit}>
        <p className="confirm-body mb-3.5">
          {user.name} ({user.email}) will be signed out everywhere and must replace this temporary password on
          their next sign-in.
        </p>
        <Field label="New temporary password" error={error}>
          <Input
            type="text"
            autoComplete="off"
            required
            minLength={12}
            placeholder="12+ characters with a letter and a number"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            autoFocus
          />
        </Field>
      </form>
    </Modal>
  );
}

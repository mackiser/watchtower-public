import { FormEvent, useEffect, useId, useState } from "react";
import { ApiError } from "../api/client";
import { useEnableMfa, useMfaSetup } from "../api/hooks";
import { Button, Field, Input, Modal } from "./ui";

// TOTP enrollment UI, shared by the Security page ("Enable two-factor") and the mandatory-MFA
// gate (pages/EnrollMfaPage) since 2FA became required for every account.

/** One-time display of freshly minted recovery codes (enrollment + regenerate flows). */
export function RecoveryCodesView({ codes }: { codes: string[] }) {
  const [copied, setCopied] = useState(false);
  const text = codes.join("\n");

  function copy() {
    navigator.clipboard?.writeText(text).then(
      () => {
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      },
      () => {},
    );
  }
  function download() {
    const blob = new Blob([text + "\n"], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "watchtower-recovery-codes.txt";
    a.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div>
      <p className="font-mono text-2xs text-warn">
        Save these now — each works once and they won&rsquo;t be shown again.
      </p>
      <ul className="my-3.5 grid list-none grid-cols-2 gap-x-4 gap-y-2 rounded-[10px] bg-surface-2 p-3.5">
        {codes.map((c) => (
          <li key={c} className="font-mono text-sm tracking-[1px] text-ink">
            {c}
          </li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <Button onClick={copy}>{copied ? "Copied" : "Copy"}</Button>
        <Button onClick={download}>Download .txt</Button>
      </div>
    </div>
  );
}

export function MfaEnrollmentModal({ onClose }: { onClose: () => void }) {
  const setup = useMfaSetup();
  const enable = useEnableMfa();
  const formId = useId();
  const [code, setCode] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [codes, setCodes] = useState<string[] | null>(null);

  // Kick off setup when the modal mounts — it stashes the pending secret and returns the QR. The
  // endpoint is idempotent (reuses an existing pending secret), so StrictMode's double-invoked
  // effect just yields the same secret twice rather than a mismatch.
  useEffect(() => {
    setup.mutate(undefined, { onError: (e) => setError(e instanceof ApiError ? e.message : "Couldn't start setup.") });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function onVerify(e: FormEvent) {
    e.preventDefault();
    setError(null);
    try {
      const res = await enable.mutateAsync(code.trim());
      setCodes(res.recoveryCodes);
    } catch (err) {
      setError(err instanceof ApiError ? err.message : "Couldn't turn on two-factor.");
    }
  }

  return (
    <Modal
      title={codes ? "Save your recovery codes" : "Enable two-factor"}
      onClose={onClose}
      maxWidth={480}
      footer={
        codes ? (
          <Button variant="primary" onClick={onClose}>
            Done
          </Button>
        ) : (
          <>
            <Button onClick={onClose}>Cancel</Button>
            <Button type="submit" form={formId} variant="primary" loading={enable.isPending} disabled={!setup.data}>
              {enable.isPending ? "Verifying…" : "Verify & turn on"}
            </Button>
          </>
        )
      }
    >
      {codes ? (
        <RecoveryCodesView codes={codes} />
      ) : (
        <>
          <p className="mb-3 text-2xs text-ink-faint">
            Scan this with your authenticator app, then enter the 6-digit code it shows to confirm.
          </p>
          {setup.data ? (
            <>
              <div className="mx-auto my-3.5 w-max rounded-[10px] bg-white p-3.5">
                <img src={setup.data.qrDataUrl} alt="Two-factor QR code" width={180} height={180} />
              </div>
              <p className="text-center text-2xs leading-[1.8] text-ink-dim">
                Can&rsquo;t scan? Enter this key manually:
                <br />
                <code className="rounded-md bg-surface-2 px-2 py-[3px] font-mono text-xs tracking-[1px] text-ink">
                  {setup.data.secret}
                </code>
              </p>
              <form id={formId} onSubmit={onVerify} className="mt-3.5">
                <Field label="Code from your app" error={error}>
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
              </form>
            </>
          ) : (
            <p className="py-2 text-xs text-ink-faint">{error ?? "Preparing…"}</p>
          )}
        </>
      )}
    </Modal>
  );
}

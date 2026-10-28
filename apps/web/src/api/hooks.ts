import type { AuthEventRow, AuthUser, ClientDetail, ClientSummary, IspmControl, QualysKbDetail, QualysSnapshot, QualysSyncResult, QualysSyncSchedule, SearchResults, TaskLinkType, TaskPriority, TaskStatus, UserOption } from "@watchtower/shared";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { api, ApiError } from "./client";

// ---------- auth ----------
export function useMe() {
  return useQuery<AuthUser | null>({
    queryKey: ["me"],
    queryFn: async () => {
      try {
        return await api.get<AuthUser>("/auth/me");
      } catch (e) {
        if (e instanceof ApiError && e.status === 401) return null;
        throw e;
      }
    },
    retry: false,
    staleTime: 60_000,
  });
}

// Login is two-step for MFA accounts: the first call returns { mfaRequired: true } instead of a
// user, and the caller follows up with useLoginMfa.
export type LoginResult = AuthUser | { mfaRequired: true };

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (creds: { email: string; password: string }) => api.post<LoginResult>("/auth/login", creds),
    onSuccess: (res) => {
      if ("id" in res) qc.setQueryData(["me"], res);
    },
  });
}

export function useLoginMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<AuthUser>("/auth/login/mfa", { code }),
    onSuccess: (user) => qc.setQueryData(["me"], user),
  });
}

export function useChangePassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { currentPassword: string; newPassword: string }) => api.post<void>("/auth/password", input),
    // Clears the forced-change gate without a refetch round-trip.
    onSuccess: () =>
      qc.setQueryData(["me"], (me: AuthUser | null | undefined) => (me ? { ...me, mustChangePassword: false } : me)),
  });
}

// Updates the signed-in user's own display name (email/role are not editable here). Writes the
// returned user straight into the ["me"] cache so the header reflects it immediately.
export function useUpdateProfile() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { name: string }) => api.patch<AuthUser>("/auth/profile", input),
    onSuccess: (updated) => qc.setQueryData(["me"], updated),
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => api.post<void>("/auth/logout"),
    onSuccess: () => {
      qc.setQueryData(["me"], null);
      qc.clear();
    },
  });
}

// ---------- MFA (two-factor) management ----------
export interface MfaStatus {
  mfaEnabled: boolean;
  mfaGraceMinutes: number;
  recoveryCodesRemaining: number;
}

export function useMfaStatus() {
  return useQuery<MfaStatus>({ queryKey: ["mfa-status"], queryFn: () => api.get("/auth/mfa/status") });
}

export function useMfaSetup() {
  return useMutation({
    mutationFn: () => api.post<{ qrDataUrl: string; otpauthUri: string; secret: string }>("/auth/mfa/setup"),
  });
}

export function useEnableMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/mfa/enable", { code }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
  });
}

export function useDisableMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { password: string; code: string }) => api.post<void>("/auth/mfa/disable", input),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
  });
}

export function useRegenerateRecoveryCodes() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (code: string) => api.post<{ recoveryCodes: string[] }>("/auth/mfa/recovery-codes", { code }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["mfa-status"] }),
  });
}

export function useSetMfaGrace() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (minutes: number) => api.patch<{ mfaGraceMinutes: number }>("/auth/mfa/grace", { minutes }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ["me"] });
      qc.invalidateQueries({ queryKey: ["mfa-status"] });
    },
  });
}

export function useForgetTrustedDevices() {
  return useMutation({ mutationFn: () => api.post<void>("/auth/mfa/forget-devices") });
}

// ---------- clients ----------
export function useClients(opts?: { includeArchived?: boolean }) {
  const includeArchived = opts?.includeArchived ?? false;
  return useQuery<ClientSummary[]>({
    queryKey: ["clients", { includeArchived }],
    queryFn: () => api.get(includeArchived ? "/clients?includeArchived=true" : "/clients"),
  });
}

export function useClient(id: string | undefined) {
  return useQuery<ClientDetail>({
    queryKey: ["clients", id],
    queryFn: () => api.get(`/clients/${id}`),
    enabled: !!id,
  });
}

export function useCreateClient() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (name: string) => api.post<{ id: string; name: string }>("/clients", { name }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useSetClientArchived() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, archived }: { id: string; archived: boolean }) => api.patch(`/clients/${id}/archive`, { archived }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

// ---------- admin: Qualys sync ----------
export function useSetClientQualysTag() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, qualysTag }: { id: string; qualysTag: string | null }) =>
      api.patch<void>(`/clients/${id}`, { qualysTag }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useSyncQualys() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { clientId?: string } = {}) => api.post<QualysSyncResult[]>("/clients/sync-qualys", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients"] }),
  });
}

export function useSyncSchedule() {
  return useQuery<QualysSyncSchedule>({ queryKey: ["sync-schedule"], queryFn: () => api.get("/clients/sync-schedule") });
}

export function useSetSyncSchedule() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { enabled: boolean; time: string }) =>
      api.put<QualysSyncSchedule>("/clients/sync-schedule", input),
    onSuccess: (schedule) => qc.setQueryData(["sync-schedule"], schedule),
  });
}

export function useReplaceIspm(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    // Always stamps today's date so every inline ISPM edit records a daily IspmSnapshot history
    // point (one per day, same-day edits overwrite) — mirrors the Qualys sync cadence.
    mutationFn: (controls: IspmControl[]) =>
      api.put<ClientDetail>(`/clients/${clientId}/ispm`, { controls, date: new Date().toISOString().slice(0, 10) }),
    onSuccess: (detail) => {
      qc.setQueryData(["clients", clientId], detail);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// Admin-only per-client posture goals. Sending null for a field clears the override and returns
// that goal to the shared default. The response is a full ClientDetail already rescored against
// the new goals, so it goes straight into the cache; the Overview list is invalidated because
// this client's score and grade moved there too.
export function useSetClientGoals(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (goals: { vulnTargetPerAsset?: number | null; ispmTargetPct?: number | null }) =>
      api.patch<ClientDetail>(`/clients/${clientId}/goals`, goals),
    onSuccess: (detail) => {
      qc.setQueryData(["clients", clientId], detail);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

export function useSetIspmNotApplicable(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (value: boolean) => api.patch<ClientDetail>(`/clients/${clientId}/ispm-not-applicable`, { value }),
    onSuccess: (detail) => {
      qc.setQueryData(["clients", clientId], detail);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// ---------- tasks (kanban board) ----------
export interface TaskInput {
  title: string;
  status?: TaskStatus;
  note?: string;
  priority?: TaskPriority;
  dueDate?: string | null; // yyyy-mm-dd
  assigneeId?: string | null;
  linkType?: TaskLinkType;
  linkRef?: string;
}

// Teammate names for the assignee dropdown — available to every signed-in user (unlike the
// admin-only /users). Changes rarely; cache for the session.
export function useUserOptions() {
  return useQuery<UserOption[]>({
    queryKey: ["user-options"],
    queryFn: () => api.get("/user-options"),
    staleTime: 5 * 60_000,
  });
}

export function useCreateTask(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (task: TaskInput) => api.post(`/clients/${clientId}/tasks`, task),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", clientId] }),
  });
}

export function useUpdateTask(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ taskId, ...patch }: { taskId: string } & Partial<TaskInput>) =>
      api.patch(`/clients/${clientId}/tasks/${taskId}`, patch),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", clientId] }),
  });
}

export function useDeleteTask(clientId: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (taskId: string) => api.delete(`/clients/${clientId}/tasks/${taskId}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["clients", clientId] }),
  });
}

// ---------- admin: users ----------
export function useUsers(enabled = true) {
  // `enabled: false` lets non-admin surfaces (e.g. the Overview attention digest) mount the hook
  // without firing a request that would 403.
  return useQuery<AuthUser[]>({ queryKey: ["users"], queryFn: () => api.get("/users"), enabled });
}

export function useCreateUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { email: string; name: string; password: string; role: "ADMIN" | "MEMBER"; mfaExempt: boolean }) =>
      api.post<AuthUser>("/users", input),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetUserPassword() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, password }: { id: string; password: string }) => api.patch<void>(`/users/${id}/password`, { password }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useResetUserMfa() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete<void>(`/users/${id}/mfa`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// Grants/revokes a teammate's waiver from the mandatory-2FA enrollment gate.
export function useSetUserMfaExempt() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, mfaExempt }: { id: string; mfaExempt: boolean }) =>
      api.patch<AuthUser>(`/users/${id}/mfa-exempt`, { mfaExempt }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// Clears a brute-force lockout so the teammate can sign in again immediately.
export function useUnlockUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.post<AuthUser>(`/users/${id}/unlock`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

// ---------- Qualys KnowledgeBase ----------
// The vulnerability write-up for one QID, fetched only when the detail modal opens. Vendor
// reference text never changes for a given QID within a session, so it's cached indefinitely.
// A 404 is an expected state (the QID is counted before its write-up is cached, and the KB fetch
// is allowed to fail without failing a sync), so it must not be retried as though it were an error.
export function useQualysKb(clientId: string, qid: string | null) {
  return useQuery<QualysKbDetail>({
    queryKey: ["qualys-kb", clientId, qid],
    queryFn: () => api.get(`/qualys-kb/${clientId}/${qid}`),
    enabled: !!qid,
    staleTime: Infinity,
    retry: false,
  });
}

/** Save a hand-authored title/notes for a QID. Global — naming a QID names it for every client
 *  that has it — so every client payload is invalidated, not just the current one. */
export function useSetQualysKb(clientId: string, qid: string) {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { title?: string; notes?: string }) => api.patch<QualysKbDetail>(`/qualys-kb/${qid}`, input),
    onSuccess: (saved) => {
      qc.setQueryData(["qualys-kb", clientId, qid], saved);
      qc.invalidateQueries({ queryKey: ["clients"] });
    },
  });
}

// ---------- global search (Ctrl+K palette) ----------
export function useSearch(q: string) {
  return useQuery<SearchResults>({
    queryKey: ["search", q],
    queryFn: () => api.get(`/search?q=${encodeURIComponent(q)}`),
    enabled: q.trim().length >= 2,
    // Keep the previous results on screen while the next keystroke's query runs — no flicker.
    placeholderData: (prev) => prev,
  });
}

// ---------- admin: audit log ----------
export function useAuditEvents(q: string) {
  return useQuery<AuthEventRow[]>({
    queryKey: ["audit-events", q],
    queryFn: () => api.get(`/audit-events${q ? `?q=${encodeURIComponent(q)}` : ""}`),
  });
}

export function useDeleteUser() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (id: string) => api.delete(`/users/${id}`),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

export function useSetUserRole() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: ({ id, role }: { id: string; role: "ADMIN" | "MEMBER" }) =>
      api.patch<AuthUser>(`/users/${id}/role`, { role }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ["users"] }),
  });
}

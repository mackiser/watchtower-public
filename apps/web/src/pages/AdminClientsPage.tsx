import { useState } from "react";
import { useNavigate } from "react-router-dom";
import {
  useClients,
  useCreateClient,
  useSetClientArchived,
  useSetClientQualysTag,
  useSetSyncSchedule,
  useSyncQualys,
  useSyncSchedule,
} from "../api/hooks";
import { ConfirmDialog } from "../components/ConfirmDialog";
import { Icon } from "../components/Icon";
import { Button, Card, Input, Pill } from "../components/ui";
import { timeAgo } from "../lib/format";

/** Compact daily-schedule controls: pause/resume + reschedule, persisted server-side. */
function SyncScheduleBar() {
  const { data: schedule } = useSyncSchedule();
  const setSchedule = useSetSyncSchedule();
  const [timeDraft, setTimeDraft] = useState<string | null>(null);

  if (!schedule) return null;
  const time = timeDraft ?? schedule.time;
  const dirty = time !== schedule.time;

  return (
    <div className="mb-4 flex flex-wrap items-center gap-3 rounded border border-line-soft bg-surface-2 px-3 py-2">
      <span className="font-mono text-3xs uppercase tracking-[.5px] text-ink-faint">Daily sync</span>
      {!schedule.configured ? (
        <span className="font-mono text-2xs text-warn">Not configured on this server — set Qualys credentials.</span>
      ) : (
        <>
          <Pill round tone={schedule.enabled ? "pass" : "warn"}>
            {schedule.enabled ? "Active" : "Paused"}
          </Pill>
          <label className="flex items-center gap-1.5 font-mono text-2xs text-ink-dim">
            at
            <Input
              type="time"
              value={time}
              onChange={(e) => setTimeDraft(e.target.value)}
              aria-label="Daily sync time"
              className="w-auto px-2 py-1 text-2xs"
            />
            {schedule.tz}
          </label>
          {dirty && (
            <Button
              size="sm"
              loading={setSchedule.isPending}
              onClick={() =>
                setSchedule.mutate({ enabled: schedule.enabled, time }, { onSuccess: () => setTimeDraft(null) })
              }
            >
              Save time
            </Button>
          )}
          <Button
            size="sm"
            disabled={setSchedule.isPending}
            onClick={() => setSchedule.mutate({ enabled: !schedule.enabled, time: schedule.time })}
          >
            {schedule.enabled ? "Pause" : "Resume"}
          </Button>
          {setSchedule.isError && (
            <span role="alert" className="font-mono text-2xs text-fail">
              {setSchedule.error instanceof Error ? setSchedule.error.message : "Couldn't update schedule."}
            </span>
          )}
        </>
      )}
    </div>
  );
}

export function AdminClientsPage() {
  const { data: clients, isLoading } = useClients({ includeArchived: true });
  const navigate = useNavigate();
  const setArchived = useSetClientArchived();
  const setTag = useSetClientQualysTag();
  const sync = useSyncQualys();
  const createClient = useCreateClient();
  const [pendingArchiveId, setPendingArchiveId] = useState<string | null>(null);
  const [editingTagId, setEditingTagId] = useState<string | null>(null);
  const [tagDraft, setTagDraft] = useState("");
  const [adding, setAdding] = useState(false);
  const [nameDraft, setNameDraft] = useState("");

  const submitNewClient = () => {
    const name = nameDraft.trim();
    if (!name) return;
    // Land on the new client's page — its ISPM tab is where controls get added now.
    createClient.mutate(name, { onSuccess: ({ id }) => navigate(`/clients/${id}`) });
  };

  const pendingClient = clients?.find((c) => c.id === pendingArchiveId);

  const saveTag = (id: string) => {
    const qualysTag = tagDraft.trim() || null;
    setTag.mutate({ id, qualysTag }, { onSuccess: () => setEditingTagId(null) });
  };

  const syncSummary = sync.data
    ? `${sync.data.filter((r) => r.ok).length} synced, ${sync.data.filter((r) => !r.ok).length} failed`
    : null;

  return (
    <div>
      <div className="scope">
        <span>Manage clients</span>
      </div>
      <Card
        title="All clients"
        hint="A client's Qualys tag links it to the asset tag in the Qualys instance — tagged clients are pulled automatically on the daily schedule below."
        actions={
          <div className="flex items-center gap-3">
            {syncSummary && !sync.isPending && (
              <span className="font-mono text-3xs text-ink-dim" role="status">
                {syncSummary}
              </span>
            )}
            {sync.isError && (
              <span className="font-mono text-3xs text-fail" role="alert">
                {sync.error instanceof Error ? sync.error.message : "Sync failed."}
              </span>
            )}
            <Button size="sm" icon="refresh-outline" loading={sync.isPending} onClick={() => sync.mutate({})}>
              {sync.isPending ? "Syncing…" : "Sync Qualys now"}
            </Button>
            <Button size="sm" variant="primary" icon="add-outline" disabled={adding} onClick={() => setAdding(true)}>
              Add client
            </Button>
          </div>
        }
      >
        <SyncScheduleBar />
        {adding && (
          <form
            className="mb-4 flex flex-wrap items-center gap-2"
            onSubmit={(e) => {
              e.preventDefault();
              submitNewClient();
            }}
          >
            <Input
              autoFocus
              value={nameDraft}
              onChange={(e) => setNameDraft(e.target.value)}
              onKeyDown={(e) => e.key === "Escape" && (setAdding(false), setNameDraft(""), createClient.reset())}
              placeholder="New client name"
              aria-label="New client name"
              className="max-w-[280px]"
            />
            <Button size="sm" type="submit" variant="primary" loading={createClient.isPending} disabled={!nameDraft.trim()}>
              Create
            </Button>
            <Button
              size="sm"
              variant="ghost"
              type="button"
              onClick={() => {
                setAdding(false);
                setNameDraft("");
                createClient.reset();
              }}
            >
              Cancel
            </Button>
            {createClient.isError && (
              <span role="alert" className="font-mono text-2xs text-fail">
                {createClient.error instanceof Error ? createClient.error.message : "Couldn't create the client."}
              </span>
            )}
          </form>
        )}
        {isLoading ? (
          <p className="py-2 text-xs text-ink-faint">Loading…</p>
        ) : (
          <table className="users-table">
            <thead>
              <tr>
                <th>Name</th>
                <th>Qualys tag</th>
                <th>Last sync</th>
                <th>Status</th>
                <th />
              </tr>
            </thead>
            <tbody>
              {(clients ?? []).map((c) => {
                const isThisPending = setArchived.isPending && setArchived.variables?.id === c.id;
                const isThisSyncing = sync.isPending && sync.variables?.clientId === c.id;
                const editing = editingTagId === c.id;
                return (
                  <tr key={c.id}>
                    <td data-label="Name">{c.name}</td>
                    <td data-label="Qualys tag">
                      {editing ? (
                        <form
                          className="flex items-center gap-2"
                          onSubmit={(e) => {
                            e.preventDefault();
                            saveTag(c.id);
                          }}
                        >
                          <Input
                            autoFocus
                            value={tagDraft}
                            onChange={(e) => setTagDraft(e.target.value)}
                            onKeyDown={(e) => e.key === "Escape" && setEditingTagId(null)}
                            placeholder="Tag name in Qualys"
                            aria-label={`Qualys tag for ${c.name}`}
                            className="max-w-[220px]"
                          />
                          <Button size="sm" type="submit" loading={setTag.isPending}>
                            Save
                          </Button>
                          <Button size="sm" variant="ghost" type="button" onClick={() => setEditingTagId(null)}>
                            Cancel
                          </Button>
                        </form>
                      ) : (
                        <button
                          type="button"
                          className="group inline-flex items-center gap-1.5 rounded px-1 py-0.5 font-mono text-2xs text-ink-dim hover:text-ink focus-visible:outline focus-visible:outline-2 focus-visible:outline-signal"
                          title="Edit Qualys tag"
                          onClick={() => {
                            setEditingTagId(c.id);
                            setTagDraft(c.qualysTag ?? "");
                          }}
                        >
                          {c.qualysTag ?? <span className="text-ink-faint">—</span>}
                          <span
                            aria-hidden="true"
                            className="opacity-0 transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100"
                          >
                            <Icon name="create-outline" size={12} />
                          </span>
                        </button>
                      )}
                    </td>
                    <td data-label="Last sync" className="whitespace-nowrap font-mono text-2xs text-ink-dim">
                      {!c.qualysTag ? (
                        <span className="text-ink-faint">Not synced</span>
                      ) : c.qualysSyncError ? (
                        <Pill round tone="fail" title={c.qualysSyncError}>
                          Sync failed
                        </Pill>
                      ) : c.qualysLastSyncAt ? (
                        <span title={new Date(c.qualysLastSyncAt).toLocaleString()}>{timeAgo(c.qualysLastSyncAt)}</span>
                      ) : (
                        <span className="text-ink-faint">Never</span>
                      )}
                    </td>
                    <td data-label="Status">
                      <Pill round tone={c.archivedAt ? "neutral" : "signal"}>
                        {c.archivedAt ? "Archived" : "Active"}
                      </Pill>
                    </td>
                    <td>
                      <div className="flex flex-wrap justify-end gap-2">
                        {c.qualysTag && !c.archivedAt && (
                          <Button
                            size="sm"
                            icon="refresh-outline"
                            disabled={sync.isPending}
                            onClick={() => sync.mutate({ clientId: c.id })}
                          >
                            {isThisSyncing ? "Syncing…" : "Sync"}
                          </Button>
                        )}
                        {c.archivedAt ? (
                          <Button
                            size="sm"
                            icon="checkmark-outline"
                            disabled={setArchived.isPending}
                            onClick={() => setArchived.mutate({ id: c.id, archived: false })}
                          >
                            {isThisPending ? "Unarchiving…" : "Unarchive"}
                          </Button>
                        ) : (
                          <Button
                            size="sm"
                            icon="trash-outline"
                            disabled={setArchived.isPending}
                            onClick={() => setPendingArchiveId(c.id)}
                          >
                            Archive
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </Card>
      {pendingClient && (
        <ConfirmDialog
          title="Archive this client?"
          body={`${pendingClient.name} will drop off the Overview and stop being included in triage. Their Qualys, ISPM, and task history is kept, and you can unarchive them here at any time.`}
          confirmLabel="Archive"
          danger
          onConfirm={() => {
            setArchived.mutate({ id: pendingClient.id, archived: true });
            setPendingArchiveId(null);
          }}
          onCancel={() => setPendingArchiveId(null)}
        />
      )}
    </div>
  );
}

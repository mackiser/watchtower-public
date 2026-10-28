import { compositeScoreSeries, ispmWeightedCompliancePct, rate } from "@watchtower/shared";
import { useEffect, useMemo, useState } from "react";
import { useLocation, useParams } from "react-router-dom";
import { ApiError } from "../api/client";
import { useClient, useMe } from "../api/hooks";
import { ClientGoalsModal } from "../components/ClientGoalsModal";
import { GradeCard } from "../components/GradeCard";
import { Icon } from "../components/Icon";
import { IspmTab } from "../components/IspmTab";
import { LineChart } from "../components/LineChart";
import { NarrativeCard } from "../components/NarrativeCard";
import { QualysTab } from "../components/QualysTab";
import { TasksTab } from "../components/TasksTab";
import { Button, Card, Pill, Skeleton } from "../components/ui";

type TabKey = "qualys" | "ispm" | "tasks";

export function ClientPage() {
  const { id } = useParams<{ id: string }>();
  const { data: client, isLoading, isError, error, refetch } = useClient(id);
  const { data: me } = useMe();
  const [editingGoals, setEditingGoals] = useState(false);
  // The search palette deep-links straight to a tab via navigation state (e.g. a task result
  // opens the Tasks tab). The effect handles same-client jumps, where this component doesn't
  // remount and the useState initializer never re-runs.
  const location = useLocation();
  const stateTab = (location.state as { tab?: TabKey } | null)?.tab;
  const [tab, setTab] = useState<TabKey>(stateTab ?? "qualys");
  useEffect(() => {
    if (stateTab) setTab(stateTab);
  }, [stateTab, id]);

  // Composite score at each scan date, scored against *this client's* goals — the same ones the
  // server used for the grade card, or the line would disagree with it. Passing the client's
  // current ISPM compliance pins the trend's endpoint to the grade card's value (both blend the
  // live controls). Null scores (a dated scan with zero assets and no ISPM) aren't plottable.
  const trend = useMemo(
    () =>
      client
        ? compositeScoreSeries(
            client.qSeries,
            client.ispmSeries,
            client.ispmNotApplicable,
            ispmWeightedCompliancePct(client.ispm),
            client.goals
          ).filter((p) => p.score != null)
        : [],
    [client]
  );

  if (isLoading)
    return (
      <div>
        {/* Mirror the real layout (eyebrow, name, posture band, trend card, tabs) to avoid a load shift. */}
        <Skeleton className="mb-4 h-3 w-24" />
        <Skeleton className="mb-3.5 h-8 w-72" />
        <div className="posture-band">
          <Skeleton className="h-[140px]" />
          <Skeleton className="h-[140px]" />
        </div>
        <Skeleton className="mb-6 h-[340px]" />
        <Skeleton className="h-10" />
      </div>
    );
  if (isError || !client) {
    // A 404 means the client genuinely doesn't exist; anything else (500, network) deserves a
    // retry path, not a misleading "not found".
    const notFound = error instanceof ApiError && error.status === 404;
    return (
      <Card>
        {notFound ? (
          <p className="py-2 text-xs text-ink-faint">Client not found.</p>
        ) : (
          <p className="flex items-center gap-3 py-2 text-xs text-ink-faint">
            Couldn&rsquo;t load this client. <Button onClick={() => refetch()}>Try again</Button>
          </p>
        )}
      </Card>
    );
  }

  const ispmBadge = client.ispmNotApplicable ? "N/A" : client.ispm.length ? `${rate(client.ispm).pct}%` : "—";
  const openTasks = client.tasks.filter((t) => t.status !== "Done").length;

  return (
    <div>
      {client.archivedAt && (
        <div className="archived-banner">
          <b>Archived client</b> — kept for history only. Editing is disabled until an admin unarchives them
          from Manage Clients.
        </div>
      )}
      <div className="scope">
        <span>Client</span>
      </div>
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
        <div className="posture-client-name">{client.name}</div>
        {client.customGoals && (
          <Pill tone="signal" title="This client is scored against its own posture goals, not the defaults">
            custom goals
          </Pill>
        )}
        {/* Admin-only: a target change moves this client's grade, which is a reporting figure.
            Archived clients are read-only everywhere, and the API refuses the write too. */}
        {me?.role === "ADMIN" && !client.archivedAt && (
          <Button size="sm" className="ml-auto" icon="create-outline" onClick={() => setEditingGoals(true)}>
            Goals
          </Button>
        )}
      </div>
      <div className="posture-band">
        <GradeCard client={client} />
        <NarrativeCard client={client} />
      </div>
      <Card title="Security posture score over time" hint="composite score, 0–100" className="mb-6">
        <LineChart
          series={trend}
          lines={[{ key: "score", label: "Posture score", color: "var(--signal)" }]}
          yMax={100}
          initialZoomed={false}
          trendGoodWhen="up"
        />
      </Card>
      <div className="tabs">
        <button className={`tab${tab === "qualys" ? " active" : ""}`} onClick={() => setTab("qualys")}>
          <Icon name="bug-outline" /> Qualys Vulnerabilities
        </button>
        <button className={`tab${tab === "ispm" ? " active" : ""}`} onClick={() => setTab("ispm")}>
          <Icon name="shield-checkmark-outline" /> ISPM Compliance <span className="badge">{ispmBadge}</span>
        </button>
        <button className={`tab${tab === "tasks" ? " active" : ""}`} onClick={() => setTab("tasks")}>
          <Icon name="clipboard-outline" /> Tasks <span className="badge">{openTasks || "—"}</span>
        </button>
      </div>
      {tab === "qualys" && <QualysTab client={client} />}
      {tab === "ispm" && <IspmTab client={client} />}
      {tab === "tasks" && <TasksTab client={client} />}
      {editingGoals && <ClientGoalsModal client={client} onClose={() => setEditingGoals(false)} />}
    </div>
  );
}

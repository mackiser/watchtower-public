import type { ClientDetail } from "@watchtower/shared";
import { TaskBoard } from "./TaskBoard";

export function TasksTab({ client }: { client: ClientDetail }) {
  const tasks = client.tasks;
  const open = tasks.filter((t) => t.status !== "Done").length;
  return (
    <div>
      <div className="scope">
        <span>
          {client.name} &middot; {tasks.length} task{tasks.length === 1 ? "" : "s"} &middot; {open} open
        </span>
      </div>
      <TaskBoard clientId={client.id} tasks={tasks} ispmControls={client.ispm} />
    </div>
  );
}

import Link from "next/link";
import type { Project } from "@/lib/api";

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString(
    "pt-BR",
    {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
    }
  );
}

export function ProjectCard({
  project,
}: {
  project: Project;
}) {
  const isActive =
    project.status === "ACTIVE";

  return (
    <Link
      href={`/projects/${project.id}`}
      className="group relative flex flex-col gap-4 rounded-lg border border-line bg-panel p-5 transition-colors hover:border-signal/50"
    >
      <div className="flex items-center gap-2">
        <span
          className={`h-2 w-2 rounded-full ${
            isActive
              ? "bg-ok pulse-dot"
              : "bg-mute"
          }`}
          aria-hidden="true"
        />

        <span className="font-mono text-[11px] uppercase tracking-wider text-mute">
          {isActive
            ? "active"
            : "archived"}
        </span>
      </div>

      <h3 className="font-display text-xl font-medium leading-tight text-paper">
        {project.name}
      </h3>

      <dl className="mt-auto grid grid-cols-2 gap-x-4 gap-y-1 font-mono text-[11px] text-mute">
        <dt className="uppercase tracking-wider">
          id
        </dt>
        <dd className="truncate text-right text-paper/80">
          {project.id}
        </dd>

        <dt className="uppercase tracking-wider">
          criado
        </dt>
        <dd className="text-right text-paper/80">
          {formatDate(
            project.createdAt
          )}
        </dd>
      </dl>
    </Link>
  );
}

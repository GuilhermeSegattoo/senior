/*
 * Cliente HTTP fino para a API do Senior (Fase F, src/gateway/server.ts
 * no repositório raiz). Sem biblioteca de fetching — a superfície é
 * pequena o suficiente para não justificar isso ainda.
 */

export type ProjectStatus = "ACTIVE" | "ARCHIVED";

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  createdAt: string;
  updatedAt: string;
}

export function getApiUrl(): string {
  return (
    process.env.NEXT_PUBLIC_API_URL ??
    "http://localhost:4000"
  );
}

async function request<T>(
  path: string,
  init?: RequestInit
): Promise<T> {
  const response = await fetch(
    `${getApiUrl()}${path}`,
    init
  );

  const body = await response
    .json()
    .catch(() => null);

  if (!response.ok) {
    const message =
      body &&
      typeof body === "object" &&
      "error" in body
        ? String(
            (body as { error: unknown })
              .error
          )
        : `Falha na requisição (${response.status}).`;

    throw new Error(message);
  }

  return body as T;
}

export async function fetchHealth(): Promise<boolean> {
  try {
    await request("/health");
    return true;
  } catch {
    return false;
  }
}

export async function fetchProjects(): Promise<
  Project[]
> {
  const data = await request<{
    projects: Project[];
  }>("/projects");

  return data.projects;
}

export async function createProject(
  name: string
): Promise<Project> {
  const data = await request<{
    project: Project;
  }>("/projects", {
    method: "POST",
    headers: {
      "Content-Type":
        "application/json",
    },
    body: JSON.stringify({ name }),
  });

  return data.project;
}

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

export class ApiError extends Error {
  constructor(
    readonly status: number,
    message: string
  ) {
    super(message);
  }
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

    throw new ApiError(
      response.status,
      message
    );
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

export async function fetchProject(
  projectId: string
): Promise<Project | null> {
  try {
    const data = await request<{
      project: Project;
    }>(
      `/projects/${projectId}`
    );

    return data.project;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404
    ) {
      return null;
    }

    throw error;
  }
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

export interface FilesystemEntry {
  name: string;
  path: string;
}

export interface FilesystemBrowseResult {
  path: string;
  parent: string | null;
  directories: FilesystemEntry[];
}

export async function browseFilesystem(
  targetPath?: string
): Promise<FilesystemBrowseResult> {
  const query = targetPath
    ? `?path=${encodeURIComponent(
        targetPath
      )}`
    : "";

  return request<FilesystemBrowseResult>(
    `/fs/browse${query}`
  );
}

export async function importLocalProject(
  path: string,
  name?: string
): Promise<Project> {
  const data = await request<{
    project: Project;
  }>("/projects/import/local", {
    method: "POST",
    headers: {
      "Content-Type":
        "application/json",
    },
    body: JSON.stringify({
      path,
      name,
    }),
  });

  return data.project;
}

export async function importGithubProject(
  url: string,
  name?: string
): Promise<Project> {
  const data = await request<{
    project: Project;
  }>("/projects/import/github", {
    method: "POST",
    headers: {
      "Content-Type":
        "application/json",
    },
    body: JSON.stringify({
      url,
      name,
    }),
  });

  return data.project;
}

export type TaskStatus =
  | "WAITING"
  | "READY"
  | "RUNNING"
  | "VALIDATING"
  | "CORRECTION_REQUIRED"
  | "VALIDATED"
  | "DONE"
  | "FAILED"
  | "BLOCKED";

export interface ManagedTask {
  id: string;
  agent: string;
  task: string;
  dependsOn: string[];
  status: TaskStatus;
  result?: string;
  error?: string;
  branch?: string;
  commit?: string;
  headCommit?: string;
}

export interface ManagedPlan {
  projectId: string;
  objective: string;
  createdAt: string;
  tasks: ManagedTask[];
}

export async function fetchPlan(
  projectId: string
): Promise<ManagedPlan | null> {
  try {
    const data = await request<{
      plan: ManagedPlan;
    }>(
      `/projects/${projectId}/plan`
    );

    return data.plan;
  } catch (error) {
    if (
      error instanceof ApiError &&
      error.status === 404
    ) {
      return null;
    }

    throw error;
  }
}

export async function createPlan(
  projectId: string,
  objective: string
): Promise<ManagedPlan> {
  const data = await request<{
    plan: ManagedPlan;
  }>(`/projects/${projectId}/plan`, {
    method: "POST",
    headers: {
      "Content-Type":
        "application/json",
    },
    body: JSON.stringify({
      objective,
    }),
  });

  return data.plan;
}

export type JobStatus =
  | "PENDING"
  | "RUNNING"
  | "DONE"
  | "OBJECTIVE_NOT_MET"
  | "FAILED"
  | "NEEDS_HUMAN"
  | "BLOCKED";

export interface Job {
  id: string;
  projectId: string;
  status: JobStatus;
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
}

export async function startJob(
  projectId: string
): Promise<Job> {
  const data = await request<{
    job: Job;
  }>(
    `/projects/${projectId}/jobs`,
    { method: "POST" }
  );

  return data.job;
}

export async function fetchJob(
  jobId: string
): Promise<Job> {
  const data = await request<{
    job: Job;
  }>(`/jobs/${jobId}`);

  return data.job;
}

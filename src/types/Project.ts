export type ProjectStatus =
  | "ACTIVE"
  | "ARCHIVED";

export interface ProjectRepository {
  provider: "github";
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export interface Project {
  id: string;
  name: string;
  path: string;
  status: ProjectStatus;
  repository?: ProjectRepository;
  createdAt: string;
  updatedAt: string;
}

export interface CreateProjectInput {
  name: string;
}

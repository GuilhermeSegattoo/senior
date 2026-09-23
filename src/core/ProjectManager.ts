import {
  mkdir,
  readFile,
  writeFile,
} from "node:fs/promises";

import path from "node:path";

import type {
  CreateProjectInput,
  Project,
} from "../types/Project.js";

export class ProjectManager {
  private dataDir = path.join(
    process.cwd(),
    "data"
  );

  private projectsDir = path.join(
    process.cwd(),
    "projects"
  );

  private projectsFile = path.join(
    this.dataDir,
    "projects.json"
  );

  // =========================================================
  // ESTRUTURA
  // =========================================================

  private async ensureStructure(): Promise<void> {
    await mkdir(this.dataDir, {
      recursive: true,
    });

    await mkdir(this.projectsDir, {
      recursive: true,
    });
  }

  // =========================================================
  // LEITURA
  // =========================================================

  private async readProjects(): Promise<Project[]> {
    await this.ensureStructure();

    try {
      const content = await readFile(
        this.projectsFile,
        "utf8"
      );

      return JSON.parse(content) as Project[];
    } catch (error) {
      const nodeError =
        error as NodeJS.ErrnoException;

      if (nodeError.code === "ENOENT") {
        return [];
      }

      throw error;
    }
  }

  // =========================================================
  // ESCRITA
  // =========================================================

  private async writeProjects(
    projects: Project[]
  ): Promise<void> {
    await this.ensureStructure();

    await writeFile(
      this.projectsFile,
      JSON.stringify(projects, null, 2),
      "utf8"
    );
  }

  // =========================================================
  // SLUG / ID
  // =========================================================

  private createSlug(name: string): string {
    return name
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "");
  }

  // =========================================================
  // LISTAR PROJETOS
  // =========================================================

  async list(): Promise<Project[]> {
    return this.readProjects();
  }

  // =========================================================
  // BUSCAR PROJETO
  // =========================================================

  async getById(
    projectId: string
  ): Promise<Project | null> {
    const projects =
      await this.readProjects();

    return (
      projects.find(
        (project) =>
          project.id === projectId
      ) ?? null
    );
  }

  // =========================================================
  // CRIAR PROJETO
  // =========================================================

  async create(
    input: CreateProjectInput
  ): Promise<Project> {
    const projects =
      await this.readProjects();

    const id =
      this.createSlug(input.name);

    if (!id) {
      throw new Error(
        "Não foi possível gerar um ID válido para o projeto."
      );
    }

    const existingProject =
      projects.find(
        (project) =>
          project.id === id
      );

    if (existingProject) {
      throw new Error(
        `O projeto ${id} já existe.`
      );
    }

    const projectPath = path.join(
      this.projectsDir,
      id
    );

    await mkdir(projectPath, {
      recursive: true,
    });

    const now =
      new Date().toISOString();

    const project: Project = {
      id,
      name: input.name.trim(),
      path: projectPath,
      status: "ACTIVE",
      createdAt: now,
      updatedAt: now,
    };

    projects.push(project);

    await this.writeProjects(
      projects
    );

    return project;
  }

  // =========================================================
  // ASSOCIAR REPOSITÓRIO
  // =========================================================

  async attachRepository(
    projectId: string,
    repository: Project["repository"]
  ): Promise<Project> {
    if (!repository) {
      throw new Error(
        "Repositório inválido."
      );
    }

    const projects =
      await this.readProjects();

    const project =
      projects.find(
        (item) =>
          item.id === projectId
      );

    if (!project) {
      throw new Error(
        `Projeto ${projectId} não encontrado.`
      );
    }

    project.repository =
      repository;

    project.updatedAt =
      new Date().toISOString();

    await this.writeProjects(
      projects
    );

    return project;
  }
}

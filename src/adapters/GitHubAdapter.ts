import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export interface GitHubStatus {
  connected: boolean;
  username?: string;
}

export interface GitHubRepository {
  owner: string;
  name: string;
  url: string;
  defaultBranch: string;
}

export class GitHubAdapter {
  async status(): Promise<GitHubStatus> {
    try {
      const { stdout } = await execFileAsync(
        "gh",
        ["api", "user", "--jq", ".login"],
        {
          timeout: 15_000,
        }
      );

      const username = stdout.trim();

      if (!username) {
        return {
          connected: false,
        };
      }

      return {
        connected: true,
        username,
      };
    } catch {
      return {
        connected: false,
      };
    }
  }

  async createRepository(
    name: string
  ): Promise<GitHubRepository> {
    const github = await this.status();

    if (
      !github.connected ||
      !github.username
    ) {
      throw new Error(
        "GitHub não está conectado."
      );
    }

    await execFileAsync(
      "gh",
      [
        "repo",
        "create",
        name,
        "--private",
        "--description",
        `Projeto gerenciado pelo JARVIS: ${name}`,
      ],
      {
        timeout: 30_000,
      }
    );

    const fullName =
      `${github.username}/${name}`;

    const { stdout } = await execFileAsync(
      "gh",
      [
        "repo",
        "view",
        fullName,
        "--json",
        "name,url,defaultBranchRef",
      ],
      {
        timeout: 15_000,
      }
    );

    const repository = JSON.parse(stdout);

    return {
      owner: github.username,
      name: repository.name,
      url: repository.url,
      defaultBranch:
        repository.defaultBranchRef?.name ??
        "main",
    };
  }
}

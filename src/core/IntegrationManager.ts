import { GitHubAdapter } from "../adapters/GitHubAdapter.js";

export class IntegrationManager {
  private github = new GitHubAdapter();

  async githubStatus() {
    return this.github.status();
  }
}

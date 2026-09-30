import { mkdtemp, mkdir, copyFile, chmod, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";

// A clean home prevents loading user/project MCP servers, plugins and hooks.
// Copy only the CLI login, never config, extensions or project instructions.
export async function prepareCodexConversation() {
  const root = await mkdtemp(path.join(os.tmpdir(), "senior-codex-chat-"));
  const home = path.join(root, "home"), cwd = path.join(root, "workspace");
  try {
    await mkdir(home, { mode: 0o700 }); await mkdir(cwd, { mode: 0o700 });
    try {
      await copyFile(path.join(process.env.CODEX_HOME || path.join(os.homedir(), ".codex"), "auth.json"), path.join(home, "auth.json"));
      await chmod(path.join(home, "auth.json"), 0o600);
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; }
    return { cwd, env: { ...process.env, CODEX_HOME: home }, dispose: () => rm(root, { recursive: true, force: true }) };
  } catch (error) { await rm(root, { recursive: true, force: true }); throw error; }
}

export const codexConversationArgs = [
  "--ephemeral", "-c", 'web_search="disabled"',
  ...["shell_tool", "unified_exec", "shell_snapshot", "shell_zsh_fork", "apply_patch_freeform", "js_repl", "code_mode", "code_mode_host", "hooks", "codex_hooks", "plugin_hooks", "plugins", "remote_plugin", "apps", "enable_mcp_apps", "multi_agent", "browser_use", "computer_use", "image_generation"].flatMap(feature => ["-c", `features.${feature}=false`]),
];

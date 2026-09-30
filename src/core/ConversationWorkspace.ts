import { mkdir } from "node:fs/promises";
import path from "node:path";

export async function conversationWorkspace() {
  const workspace = path.join(process.cwd(), "data", "conversation-workspace");
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  return workspace;
}

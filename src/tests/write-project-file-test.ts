import {
  mkdtemp,
  mkdir,
  readFile,
  symlink,
} from "node:fs/promises";
import os from "node:os";
import path from "node:path";

import { WriteProjectFileTool } from "../tools/WriteProjectFileTool.js";

async function main() {
  const root = await mkdtemp(
    path.join(os.tmpdir(), "jarvis-write-test-")
  );

  const workspace = path.join(root, "workspace");
  const outside = path.join(root, "outside");

  await mkdir(path.join(workspace, "src"), {
    recursive: true,
  });

  await mkdir(outside, {
    recursive: true,
  });

  const tool = new WriteProjectFileTool(workspace);

  await tool.execute(
    "src/hello.txt",
    "JARVIS WRITE OK"
  );

  const content = await readFile(
    path.join(workspace, "src/hello.txt"),
    "utf8"
  );

  console.log(
    "Escrita normal:",
    content === "JARVIS WRITE OK"
  );

  let traversalBlocked = false;

  try {
    await tool.execute(
      "../escape.txt",
      "NAO PODE"
    );
  } catch {
    traversalBlocked = true;
  }

  console.log(
    "Traversal bloqueado:",
    traversalBlocked
  );

  await symlink(
    outside,
    path.join(workspace, "escape")
  );

  let symlinkBlocked = false;

  try {
    await tool.execute(
      "escape/stolen.txt",
      "NAO PODE"
    );
  } catch {
    symlinkBlocked = true;
  }

  console.log(
    "Symlink bloqueado:",
    symlinkBlocked
  );

  if (
    content !== "JARVIS WRITE OK" ||
    !traversalBlocked ||
    !symlinkBlocked
  ) {
    throw new Error(
      "WRITE PROJECT FILE TEST FALHOU."
    );
  }

  console.log(
    "\nWRITE PROJECT FILE FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

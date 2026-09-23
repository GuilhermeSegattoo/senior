import {
  mkdtemp,
  mkdir,
  writeFile,
  symlink,
  rm,
} from "node:fs/promises";

import path from "node:path";
import os from "node:os";

import {
  WorkspaceGuard,
} from "../tools/WorkspaceGuard.js";

async function main() {
  const base =
    await mkdtemp(
      path.join(
        os.tmpdir(),
        "senior-guard-"
      )
    );

  const workspace =
    path.join(base, "workspace");

  const outside =
    path.join(base, "outside");

  await mkdir(workspace);
  await mkdir(outside);

  await writeFile(
    path.join(outside, "secret.txt"),
    "SEGREDO"
  );

  await symlink(
    outside,
    path.join(workspace, "escape")
  );

  const guard =
    new WorkspaceGuard(workspace);

  try {
    await guard.resolveExisting(
      "escape/secret.txt"
    );

    throw new Error(
      "FALHA: symlink permitiu fuga do workspace."
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (
      message.startsWith("FALHA:")
    ) {
      throw error;
    }

    console.log(
      "Symlink malicioso bloqueado: true"
    );
  } finally {
    await rm(base, {
      recursive: true,
      force: true,
    });
  }

  console.log(
    "\nSYMLINK PROTECTION FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

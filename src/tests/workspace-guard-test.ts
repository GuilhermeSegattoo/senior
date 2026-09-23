import { WorkspaceGuard } from "../tools/WorkspaceGuard.js";

const guard =
  new WorkspaceGuard(
    "/tmp/senior-workspace"
  );

function expectAllowed(
  value: string
): void {
  const result =
    guard.resolve(value);

  console.log(
    `ALLOW  ${value} -> ${result}`
  );
}

function expectBlocked(
  value: string
): void {
  try {
    guard.resolve(value);

    throw new Error(
      `FALHA: deveria bloquear ${value}`
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
      `BLOCK  ${value}`
    );
  }
}

expectAllowed(
  "src/index.ts"
);

expectAllowed(
  "tests/auth.test.ts"
);

expectBlocked(
  "../segredo.txt"
);

expectBlocked(
  "../../../../etc/passwd"
);

expectBlocked(
  "/etc/passwd"
);

console.log(
  "\nWORKSPACE GUARD FUNCIONANDO."
);

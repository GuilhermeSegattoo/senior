import type { AddressInfo } from "node:net";

import { createGatewayServer } from "../gateway/server.js";
import { ProjectManager } from "../core/ProjectManager.js";

async function main() {
  console.log(
    "\n=== SENIOR GATEWAY — SEGURANÇA (CORS / CSRF / injeção) ===\n"
  );

  const server = createGatewayServer();

  await new Promise<void>(
    (resolve) => {
      server.listen(0, resolve);
    }
  );

  const address =
    server.address() as AddressInfo;

  const baseUrl = `http://127.0.0.1:${address.port}`;

  try {
    // -------------------------------------------------------
    // CSRF: POST sem Content-Type: application/json (o padrão de
    // um fetch() "simples" disparado por outra origem) tem que ser
    // rejeitado, não silenciosamente aceito.
    // -------------------------------------------------------

    const plainTextPost = await fetch(
      `${baseUrl}/projects`,
      {
        method: "POST",
        headers: {
          "Content-Type":
            "text/plain",
        },
        body: JSON.stringify({
          name: "csrf-test-project",
        }),
      }
    );

    if (plainTextPost.status !== 415) {
      throw new Error(
        `Esperado 415 para POST sem Content-Type: application/json, obtido ${plainTextPost.status}`
      );
    }

    console.log(
      "OK: POST com Content-Type diferente de application/json é rejeitado (415)."
    );

    const afterRejected =
      await fetch(
        `${baseUrl}/projects`
      );

    const afterRejectedBody =
      (await afterRejected.json()) as {
        projects: Array<{
          name: string;
        }>;
      };

    if (
      afterRejectedBody.projects.some(
        (project) =>
          project.name ===
          "csrf-test-project"
      )
    ) {
      throw new Error(
        "O projeto do payload rejeitado foi criado mesmo assim."
      );
    }

    console.log(
      "OK: nenhum projeto foi criado a partir do POST rejeitado."
    );

    // -------------------------------------------------------
    // CORS: origem fora da allowlist não deve receber
    // Access-Control-Allow-Origin (o navegador bloqueia leitura
    // cross-origin por padrão nesse caso).
    // -------------------------------------------------------

    const untrustedOriginResponse =
      await fetch(
        `${baseUrl}/projects`,
        {
          headers: {
            Origin:
              "https://site-malicioso.exemplo",
          },
        }
      );

    if (
      untrustedOriginResponse.headers.get(
        "access-control-allow-origin"
      )
    ) {
      throw new Error(
        "Origem fora da allowlist recebeu Access-Control-Allow-Origin."
      );
    }

    console.log(
      "OK: origem fora da allowlist não recebe Access-Control-Allow-Origin."
    );

    const trustedOriginResponse =
      await fetch(
        `${baseUrl}/projects`,
        {
          headers: {
            Origin:
              "http://localhost:3000",
          },
        }
      );

    if (
      trustedOriginResponse.headers.get(
        "access-control-allow-origin"
      ) !== "http://localhost:3000"
    ) {
      throw new Error(
        "Origem confiável (localhost:3000) não recebeu Access-Control-Allow-Origin correto."
      );
    }

    console.log(
      "OK: origem confiável (localhost:3000, o frontend) recebe o header de CORS."
    );

    console.log(
      "\nGATEWAY SECURITY FUNCIONANDO."
    );
  } finally {
    await new Promise<void>(
      (resolve, reject) => {
        server.close((error) =>
          error
            ? reject(error)
            : resolve()
        );
      }
    );
  }

  // -----------------------------------------------------------
  // Argument injection: URL do GitHub começando com "-" (ou
  // qualquer coisa fora do formato esperado) tem que ser rejeitada
  // ANTES de qualquer tentativa de "git clone" — nunca deve virar
  // argumento de linha de comando.
  // -----------------------------------------------------------

  const projectManager =
    new ProjectManager();

  let injectionRejected = false;

  try {
    await projectManager.importGithub(
      {
        url: "--upload-pack=touch /tmp/pwned;github.com/a/b",
      }
    );
  } catch {
    injectionRejected = true;
  }

  if (!injectionRejected) {
    throw new Error(
      "importGithub() aceitou uma URL com formato de flag do git — risco de argument injection."
    );
  }

  console.log(
    "OK: importGithub() rejeita URLs que não começam com o esquema esperado (proteção contra argument injection)."
  );

  console.log(
    "\nGATEWAY SECURITY (INJEÇÃO) FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

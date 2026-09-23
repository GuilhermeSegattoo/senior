import { ReadProjectFileTool } from "../tools/ReadProjectFileTool.js";

async function main() {
  const tool =
    new ReadProjectFileTool(process.cwd());

  const result =
    await tool.execute("package.json");

  console.log("Arquivo:", result.path);
  console.log("Bytes:", result.bytes);

  console.log(
    "Conteúdo encontrado:",
    result.content.includes("\"senior\"")
  );

  try {
    await tool.execute("../segredo.txt");

    throw new Error(
      "FALHA: fuga do workspace foi permitida."
    );
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : String(error);

    if (message.startsWith("FALHA:")) {
      throw error;
    }

    console.log("Fuga bloqueada: true");
  }

  console.log(
    "\nREAD PROJECT FILE FUNCIONANDO."
  );
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});

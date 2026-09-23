import { ValidationManager } from "../core/ValidationManager.js";

import type {
  ManagedTask,
} from "../types/Task.js";

const manager =
  new ValidationManager();

const task: ManagedTask = {
  id: "backend-001",

  agent: "backend",

  task:
    "Criar endpoint de cadastro de usuário.",

  dependsOn: [],

  status: "DONE",

  businessRules: [
    {
      id: "BR-01",

      description:
        "Não permitir e-mails duplicados.",

      required: true,
    },
  ],

  acceptanceCriteria: [
    {
      id: "AC-01",

      description:
        "Usuário válido deve ser cadastrado.",

      status: "PENDING",

      evidence: [],
    },

    {
      id: "AC-02",

      description:
        "E-mail duplicado deve ser rejeitado.",

      status: "PENDING",

      evidence: [],
    },
  ],

  requiredChecks: [
    "typecheck",
    "test",
  ],
};

const validation =
  manager.initialize(task);

console.log(
  "\n=== ATTEMPT 1 ==="
);

const attempt1 =
  manager.startAttempt(
    validation
  );

manager.passCriterion(
  attempt1,
  "AC-01",
  {
    type: "TEST",

    description:
      "Cadastro válido funcionou.",
  }
);

manager.failCriterion(
  attempt1,
  "AC-02",
  "E-mail duplicado ainda foi aceito.",
  {
    type: "TEST",

    description:
      "Teste de duplicidade falhou.",
  }
);

manager.recordCheck(
  attempt1,
  "typecheck",
  true,
  {
    type: "TYPECHECK",

    description:
      "TypeScript compilou sem erros.",
  }
);

manager.recordCheck(
  attempt1,
  "test",
  false,
  {
    type: "TEST",

    description:
      "Suite encontrou falha na duplicidade.",
  },
  "Um teste falhou."
);

const firstPassed =
  manager.completeAttempt(
    validation,
    attempt1
  );

if (firstPassed) {
  throw new Error(
    "Attempt 1 deveria falhar."
  );
}

if (
  validation.status !==
  "FAILED"
) {
  throw new Error(
    `Status esperado FAILED, recebido ${validation.status}`
  );
}

manager.setDiagnosis(
  attempt1,
  "A validação de e-mail duplicado não está funcionando.",
  "Corrigir a regra de unicidade e executar os testes novamente."
);

console.log(
  "Attempt 1 falhou corretamente."
);

console.log(
  "\n=== ATTEMPT 2 ==="
);

const attempt2 =
  manager.startAttempt(
    validation
  );

manager.passCriterion(
  attempt2,
  "AC-01",
  {
    type: "TEST",

    description:
      "Cadastro válido funcionou.",
  }
);

manager.passCriterion(
  attempt2,
  "AC-02",
  {
    type: "TEST",

    description:
      "Cadastro duplicado foi rejeitado.",
  }
);

manager.recordCheck(
  attempt2,
  "typecheck",
  true,
  {
    type: "TYPECHECK",

    description:
      "TypeScript compilou sem erros.",
  }
);

manager.recordCheck(
  attempt2,
  "test",
  true,
  {
    type: "TEST",

    description:
      "Todos os testes passaram.",
  }
);

const secondPassed =
  manager.completeAttempt(
    validation,
    attempt2
  );

if (!secondPassed) {
  throw new Error(
    "Attempt 2 deveria passar."
  );
}

const finalStatus: string =
  validation.status;

if (
  finalStatus !== "PASSED"
) {
  throw new Error(
    `Status esperado PASSED, recebido ${finalStatus}`
  );
}

if (
  validation.attempts.length !== 2
) {
  throw new Error(
    "A validação deveria possuir exatamente 2 tentativas."
  );
}

if (
  !validation.validatedAt
) {
  throw new Error(
    "validatedAt deveria ter sido preenchido."
  );
}

console.log(
  "Attempt 2 passou corretamente."
);

console.log(
  "\n=== RESULTADO ==="
);

console.log(
  `Status: ${validation.status}`
);

console.log(
  `Tentativas: ${validation.attempts.length}`
);

console.log(
  "VALIDATION MANAGER FUNCIONANDO."
);

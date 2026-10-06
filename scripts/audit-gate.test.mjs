import test from "node:test";
import assert from "node:assert/strict";
import { blockingAdvisories } from "./audit-gate.mjs";

const bracesChain = {
  vulnerabilities: {
    braces: { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-vfj7-8cjw-p6xm" }] },
    micromatch: { severity: "high", via: ["braces"] },
    "fast-glob": { severity: "high", via: ["micromatch"] },
    "eslint-config-next": { severity: "high", via: ["fast-glob"] },
  },
};

test("audit gate allows only the unfixed dev-only braces advisory chain", () => {
  assert.deepEqual(blockingAdvisories(bracesChain), []);
  assert.deepEqual(blockingAdvisories({ vulnerabilities: {} }), []);
});

test("audit gate blocks any other high or critical advisory", () => {
  const report = {
    vulnerabilities: {
      ...bracesChain.vulnerabilities,
      sharp: { severity: "high", via: [{ url: "https://github.com/advisories/GHSA-wq5f-xc86-pv6w" }] },
      leftpad: { severity: "critical", via: [{ url: "https://github.com/advisories/GHSA-xxxx-yyyy-zzzz" }] },
      moderate: { severity: "moderate", via: [{ url: "https://github.com/advisories/GHSA-aaaa-bbbb-cccc" }] },
    },
  };
  assert.deepEqual(blockingAdvisories(report).sort(), ["leftpad", "sharp"]);
  assert.throws(() => blockingAdvisories({}), /inválido/);
});

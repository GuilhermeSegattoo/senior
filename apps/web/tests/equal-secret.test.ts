import test from "node:test";
import assert from "node:assert/strict";
import { equalSecret } from "../src/lib/server-auth.js";

test("equalSecret compares padded bytes without hashing and rejects length differences", () => {
  assert.equal(equalSecret("mesma-senha", "mesma-senha"), true);
  assert.equal(equalSecret("mesma-senha", "outra-senha"), false);
  assert.equal(equalSecret("curta", "muito-mais-longa"), false);
  assert.equal(equalSecret("", ""), true);
  assert.equal(equalSecret("", "x"), false);
  assert.equal(equalSecret("a", "a"), true);
  assert.equal(equalSecret("ab", "ab\0"), false);
  assert.equal(equalSecret("café", "café"), true);
  assert.equal(equalSecret("café", "cafe"), false);
  assert.equal(equalSecret("senha-de-teste-123", "senha-de-teste-124"), false);
});

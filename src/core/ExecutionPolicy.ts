export function codeExecutionAllowed() {
  return process.env.NODE_ENV === "development" || process.env.SENIOR_ENABLE_CODE_EXECUTION === "true";
}

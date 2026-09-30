import { readFile, appendFile } from 'node:fs/promises';
export function coverageMarkdown(summary, label) {
  const rows = ['lines', 'statements', 'functions', 'branches'].map(key => {
    const value = summary.total?.[key];
    if (!value || !Number.isFinite(value.pct)) throw new Error(`Missing coverage: ${key}`);
    return `| ${key} | ${value.covered}/${value.total} | ${value.pct}% |`;
  });
  return `## Coverage: ${label}\n\n| Metric | Covered/total | Coverage |\n| --- | ---: | ---: |\n${rows.join('\n')}\n\nFull HTML and LCOV reports are attached to this job.\n`;
}
if (process.argv[1]?.endsWith('report-coverage.mjs')) {
  const [file, label = 'tests'] = process.argv.slice(2);
  const report = coverageMarkdown(JSON.parse(await readFile(file, 'utf8')), label);
  if (!process.env.GITHUB_STEP_SUMMARY) throw new Error('GITHUB_STEP_SUMMARY is required');
  await appendFile(process.env.GITHUB_STEP_SUMMARY, report);
}

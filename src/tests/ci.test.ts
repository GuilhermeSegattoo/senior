import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { parse } from 'yaml';

test('CI matrices cover every check, retain coverage and cancel obsolete PR executions',()=>{
  const ci=parse(readFileSync('.github/workflows/ci.yml','utf8'));
  assert.match(ci.jobs.versions.steps[1].run,/int\(version\.split.*- 2/);
  for(const name of ['lint','typecheck','backend-tests','web-tests','build']) {
    const job=ci.jobs[name];assert.equal(job.needs,'versions');assert.ok(job.strategy.matrix.node.includes('needs.versions.outputs.nodes'));
    assert.ok(job.steps.some((s:{with?:{cache?:string}})=>s.with?.cache==='npm'));
  }
  for(const name of ['backend-tests','web-tests']) {
    const steps=ci.jobs[name].steps;assert.ok(steps.some((s:{run?:string})=>s.run?.includes('test:coverage')));
    assert.ok(steps.some((s:{run?:string})=>s.run?.includes('report-coverage.mjs')));
    assert.ok(steps.some((s:{uses?:string})=>s.uses?.includes('upload-artifact')));
  }
  for(const name of ['ci','security','docker']) {
    const workflow=parse(readFileSync(`.github/workflows/${name}.yml`,'utf8'));
    assert.equal(workflow.concurrency['cancel-in-progress'],true);assert.match(workflow.concurrency.group,/pull_request.number/);
    assert.deepEqual(workflow.permissions,{contents:'read'});
    assert.deepEqual(workflow.on.push.branches,['main']);
  }
  const security=parse(readFileSync('.github/workflows/security.yml','utf8'));
  assert.equal(security.jobs.codeql.permissions['security-events'],'write');
  assert.ok(security.jobs.audit.steps.some((s:{run?:string})=>s.run==='npm audit --audit-level=high'));
  assert.equal(security.jobs['dependency-review'].if,"github.event_name == 'pull_request'");
  assert.ok(security.jobs.secrets.steps.some((s:{uses?:string})=>s.uses?.startsWith('gitleaks/')));
  const updates=parse(readFileSync('.github/dependabot.yml','utf8')).updates;
  assert.equal(updates.filter((u:{'package-ecosystem':string})=>u['package-ecosystem']==='npm').length,2);
  for(const ecosystem of ['github-actions','docker'])assert.ok(updates.some((u:{'package-ecosystem':string})=>u['package-ecosystem']===ecosystem));
});

test('installed Pi dependencies use patched versions, not its embedded shrinkwrap pins',()=>{
  const brace=JSON.parse(readFileSync('node_modules/@earendil-works/pi-coding-agent/node_modules/brace-expansion/package.json','utf8'));
  const undici=JSON.parse(readFileSync('node_modules/@earendil-works/pi-coding-agent/node_modules/undici/package.json','utf8'));
  assert.ok(brace.version.split('.').map(Number)[0]===5 && Number(brace.version.split('.')[2])>=12,`Unsafe installed brace-expansion ${brace.version}`);
  const [major,minor,patch]=undici.version.split('.').map(Number);assert.ok(major===8&&(minor>10||(minor===10&&patch>=2)),`Unsafe installed undici ${undici.version}`);
});

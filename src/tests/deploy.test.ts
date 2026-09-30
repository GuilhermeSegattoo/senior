import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { mkdtemp, rm, stat, readFile } from "node:fs/promises";
import { execFileSync } from "node:child_process";
import { DatabaseSync } from "node:sqlite";
import os from "node:os";
import path from "node:path";
import { parse } from "yaml";
import { BrainStore } from "../core/BrainStore.js";

test("Dokploy compose has private exposes, healthchecks and no fixed networks/names/Caddy",()=>{
  const config=parse(readFileSync("compose.dokploy.yaml","utf8"));
  assert.deepEqual(Object.keys(config.services).sort(),["api","web"]);assert.equal(config.networks,undefined);
  for(const [name,service]of Object.entries(config.services) as Array<[string,Record<string,unknown>]>) {
    assert.equal(service.ports,undefined);assert.equal(service.container_name,undefined);assert.equal(service.networks,undefined);assert.equal(service.env_file,undefined);
    assert.deepEqual(service.expose,[name==="api"?"4000":"3000"]);assert.ok(service.healthcheck);assert.equal(service.stop_grace_period,"30s");
  }
  for(const volume of Object.values(config.volumes))assert.ok(volume===null||!Object.hasOwn(volume as object,"name"));
  assert.equal(config.services.api.environment.SENIOR_ENABLE_CODE_EXECUTION,"false");
  assert.equal(config.services.web.environment.SENIOR_TRUST_PROXY,"${SENIOR_TRUST_PROXY:-true}");
  assert.equal(config.services.web.environment.SENIOR_TRUSTED_PROXY_HOPS,"${SENIOR_TRUSTED_PROXY_HOPS:-1}");
  assert.equal(config.services.web.environment.OPENAI_API_KEY,undefined);
  assert.equal(config.services.web.environment.SENIOR_API_URL,"http://api:4000");
});
test("VACUUM INTO script restores committed WAL history/memory, protects permissions and refuses overwrite",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"senior-backup-")),source=path.join(directory,"live.sqlite"),target=path.join(directory,"backup'quote.sqlite");
  const store=new BrainStore(source);
  try{
    const session=store.createSession("Persisted");store.message(session.id,"assistant","WAL history");store.remember("personal","Confirmed memory","user-confirmed");
    const run=()=>execFileSync(process.execPath,["deploy/backup-sqlite.mjs",source,target],{stdio:"pipe"});run();
    const restored=new DatabaseSync(target,{readOnly:true});
    try{assert.equal(restored.prepare("SELECT text FROM messages").get()!.text,"WAL history");assert.equal(restored.prepare("SELECT text FROM memories").get()!.text,"Confirmed memory");assert.equal(restored.prepare("PRAGMA integrity_check").get()!.integrity_check,"ok");}finally{restored.close();}
    assert.equal((await stat(target)).mode&0o777,0o600);
    const bytes=await readFile(target);assert.throws(run);assert.deepEqual(await readFile(target),bytes);
    assert.throws(()=>execFileSync(process.execPath,["deploy/backup-sqlite.mjs",source,source],{stdio:"pipe"}));
    assert.throws(()=>execFileSync(process.execPath,["deploy/backup-sqlite.mjs",path.join(directory,"missing"),target],{stdio:"pipe"}));
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test("daily snapshots retain N owned backups, leave unrelated files and preserve backups after failure",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"senior-daily-")),source=path.join(directory,"live.sqlite"),backups=path.join(directory,"backups");
  const store=new BrainStore(source);
  try{
    const session=store.createSession("Daily");store.message(session.id,"assistant","Snapshot WAL");
    const daily=(keep:string,db=source)=>execFileSync(process.execPath,["deploy/backup-sqlite.mjs","--daily",db,backups,keep],{stdio:"pipe"});
    for(let i=0;i<4;i++)daily("2");
    const {readdir,writeFile,copyFile,mkdir}=await import("node:fs/promises");
    await writeFile(path.join(backups,"manual.sqlite"),"preserve");await writeFile(path.join(backups,"notes.txt"),"preserve");
    const owned=()=>readdir(backups).then(files=>files.filter(file=>/^brain-.*\.sqlite$/.test(file)));
    assert.equal((await owned()).length,2);
    const before=await owned();assert.throws(()=>daily("0"));assert.throws(()=>daily("2",path.join(directory,"missing")));assert.deepEqual(await owned(),before);
    daily("1");assert.equal((await owned()).length,1);assert.equal(await readFile(path.join(backups,"manual.sqlite"),"utf8"),"preserve");
    store.close();
    // Restore drill: stopped source, empty replacement directory, standalone
    // snapshot only (no stale WAL/SHM), same BrainStore migration/startup path.
    const restoreDir=path.join(directory,"restored");await mkdir(restoreDir);await copyFile(path.join(backups,(await owned())[0]),path.join(restoreDir,"brain.sqlite"));
    const restored=new BrainStore(path.join(restoreDir,"brain.sqlite"));
    try{assert.equal(restored.messages(session.id)[0].text,"Snapshot WAL");restored.message(session.id,"assistant","After restore");assert.equal(restored.messages(session.id).length,2);}finally{restored.close();}
  }finally{try{store.close();}catch{/* Already closed for the restore drill. */}await rm(directory,{recursive:true,force:true});}
});

test("Docker CI validates Compose, scans both targets and gates publishing on main and smoke",()=>{
  const workflow=parse(readFileSync(".github/workflows/docker.yml","utf8"));
  const job=workflow.jobs.images;
  assert.deepEqual(job.strategy.matrix.target,["api","web"]);
  assert.match(job.steps.map((step:{run?:string})=>step.run||"").join("\n"),/docker compose -f compose\.dokploy\.yaml config/);
  const build=job.steps.find((step:{uses?:string})=>step.uses?.startsWith("docker/build-push-action"));
  assert.equal(build.with.target,"${{ matrix.target }}");assert.equal(build.with.load,true);assert.match(build.with["cache-to"],/type=gha/);
  const scan=job.steps.find((step:{uses?:string})=>step.uses?.startsWith("aquasecurity/trivy-action"));assert.equal(scan.with["exit-code"],"1");
  const smoke=workflow.jobs.smoke;assert.equal(smoke.needs,"images");assert.match(smoke.steps.map((step:{run?:string})=>step.run||"").join("\n"),/--no-build.*--wait/);
  assert.equal(workflow.jobs.publish.needs,"smoke");assert.match(workflow.jobs.publish.if,/event_name == 'push'.*refs\/heads\/main/);
  assert.equal(workflow.permissions["packages"],undefined);assert.equal(workflow.jobs.publish.permissions.packages,"write");
  assert.match(workflow.env.SENIOR_GATEWAY_TOKEN,/^fixture-/);
});

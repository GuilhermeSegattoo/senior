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
  assert.equal(config.services.web.environment.SENIOR_TRUST_PROXY,"true");
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

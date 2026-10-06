import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { DatabaseSync } from "node:sqlite";
import { EventEmitter } from "node:events";
import { createServer } from "node:http";
import { once } from "node:events";
import { BrainStore } from "../core/BrainStore.js";
import { withStateLock } from "../core/StateLock.js";
import { processIdentity, processOwnerAlive } from "../core/ProcessIdentity.js";
import { installGracefulShutdown } from "../gateway/GracefulShutdown.js";
import { Brain } from "../core/Brain.js";
import type { Orchestrator } from "../core/Orchestrator.js";
import { spawn } from "node:child_process";
import { createInterface } from "node:readline";

const delay=(ms:number)=>new Promise(resolve=>setTimeout(resolve,ms));
test("v1 migration preserves history and interrupted current-PID runs can be retried",async()=>{
  const directory=await mkdtemp(path.join(os.tmpdir(),"senior-restart-")),file=path.join(directory,"brain.sqlite");
  const old=new DatabaseSync(file);
  old.exec("CREATE TABLE brain_runs (id TEXT PRIMARY KEY, sessionId TEXT NOT NULL, requestId TEXT NOT NULL UNIQUE, status TEXT NOT NULL, input TEXT NOT NULL, selection TEXT NOT NULL, team TEXT NOT NULL, error TEXT, createdAt TEXT NOT NULL, completedAt TEXT, pid INTEGER) STRICT; PRAGMA user_version=1;");old.close();
  const store=new BrainStore(file);
  try{
    const s=store.createSession("Persisted");store.message(s.id,"assistant","Existing history");
    const run=store.enqueue(s.id,"old-request","hello",{},[]);store.claim();
    assert.equal(store.run(run.id)!.pid,process.pid);assert.equal(store.run(run.id)!.bootId,processIdentity.bootId);
    store.reconcile();assert.equal(store.run(run.id)!.status,"INTERRUPTED");
    assert.equal(store.messages(s.id)[0].text,"Existing history");
    assert.equal(store.enqueue(s.id,"new-request","retry",{},[]).status,"QUEUED");
    assert.equal(store.db.prepare("PRAGMA user_version").get()!.user_version,2);
    assert.equal(processOwnerAlive({...processIdentity,processStart:"reused",pid:99999999}),false);
  }finally{store.close();await rm(directory,{recursive:true,force:true});}
});

test("legacy/current-PID stale locks are reclaimed but concurrent and nested live locks remain held",async()=>{
  const original=process.cwd(),directory=await mkdtemp(path.join(os.tmpdir(),"senior-lock-restart-"));
  try{
    process.chdir(directory);
    await withStateLock("warm",async()=>{});
    const db=new DatabaseSync(path.join(directory,"data/locks.sqlite"));
    db.prepare("INSERT INTO locks(scope,owner,pid,bootId,startedAt,processStart) VALUES (?,?,?,?,?,?)").run("test","old-container",process.pid,"previous-boot","yesterday",processIdentity.processStart);
    await withStateLock("test",async()=>{assert.equal(db.prepare("SELECT owner FROM locks WHERE scope='test'").get()!.owner==="old-container",false);});
    db.prepare("INSERT INTO locks(scope,owner,pid) VALUES (?,?,?)").run("legacy","old",process.pid);
    await withStateLock("legacy",async()=>{});
    const order:string[]=[];let release!:()=>void;
    const first=withStateLock("concurrent",async()=>{order.push("first");await withStateLock("concurrent",async()=>{order.push("nested");});await new Promise<void>(resolve=>{release=resolve;});order.push("released");});
    await delay(20);
    const second=withStateLock("concurrent",async()=>{order.push("second");});
    await delay(120);assert.deepEqual(order,["first","nested"]);
    release();await Promise.all([first,second]);assert.deepEqual(order,["first","nested","released","second"]);
    assert.equal(db.prepare("SELECT COUNT(*) AS n FROM locks").get()!.n,0);db.close();
  }finally{process.chdir(original);await rm(directory,{recursive:true,force:true});}
});

test("SIGTERM/SIGINT interrupt Brain before closing server and unregister handlers",async()=>{
  for(const signal of ["SIGTERM","SIGINT"]){
    const store=new BrainStore(":memory:");let entered!:()=>void;const started=new Promise<void>(r=>{entered=r;});
    const brain=new Brain(store,{} as Orchestrator,()=>({name:"fake",status:async()=>true,ask:async(_p,options)=>{
      entered();await new Promise<void>((_resolve,reject)=>{options.signal!.addEventListener("abort",()=>reject(new Error("aborted")),{once:true});});return{text:"late"};
    }}));
    const session=store.createSession("Shutdown"),run=store.enqueue(session.id,signal,"hello",{},[]);
    const server=createServer((_req,res)=>res.end("ok"));const signals=new EventEmitter();
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    installGracefulShutdown(server,()=>brain.stop(),signals);
    const work=brain.tick();await started;const closed=once(server,"close");signals.emit(signal);signals.emit(signal);await closed;await work;
    assert.equal(store.run(run.id)!.status,"INTERRUPTED");assert.equal(store.messages(session.id).length,1);assert.equal(signals.listenerCount(signal),0);store.close();
  }
});

test("Linux process-start fingerprint distinguishes a live child from reused PID",async()=>{
  const module=path.resolve("src/core/ProcessIdentity.ts");
  const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",`import {processIdentity} from ${JSON.stringify(module)}; console.log(JSON.stringify(processIdentity));setInterval(()=>{},1000);`],{stdio:["ignore","pipe","pipe"]});
  const lines=createInterface({input:child.stdout});
  try{
    const [line]=await once(lines,"line");const owner=JSON.parse(line);
    assert.equal(processOwnerAlive(owner),true);
    if(process.platform==="linux")assert.equal(processOwnerAlive({...owner,processStart:"old-kernel-start"}),false);
  }finally{lines.close();child.kill("SIGTERM");await once(child,"exit");}
});

test("real gateway processes persist interruption and exit cleanly on SIGTERM and SIGINT",{timeout:15000},async()=>{
  for(const signal of ["SIGTERM","SIGINT"] as const){
    const directory=await mkdtemp(path.join(os.tmpdir(),"senior-signal-"));
    const file=path.join(directory,"brain.sqlite");
    const imports={store:path.resolve("src/core/BrainStore.ts"),brain:path.resolve("src/core/Brain.ts"),orchestrator:path.resolve("src/core/Orchestrator.ts"),gateway:path.resolve("src/gateway/server.ts")};
    const script=`import {BrainStore} from ${JSON.stringify(imports.store)};import {Brain} from ${JSON.stringify(imports.brain)};import {Orchestrator} from ${JSON.stringify(imports.orchestrator)};import {createGatewayServer} from ${JSON.stringify(imports.gateway)};
process.chdir(${JSON.stringify(directory)});const store=new BrainStore(${JSON.stringify(file)}),orchestrator=new Orchestrator();let ready;const started=new Promise(r=>ready=r);const brain=new Brain(store,orchestrator,()=>({name:'fake',status:async()=>true,ask:async(_p,o)=>{ready();await new Promise((_r,reject)=>o.signal.addEventListener('abort',()=>reject(new Error('aborted')),{once:true}));return {text:'late'};}}));const server=createGatewayServer({orchestrator,brain});await new Promise(r=>server.listen(0,'127.0.0.1',r));const session=store.createSession('Signal');const run=store.enqueue(session.id,'signal','hello',{},[]);await started;console.log(JSON.stringify({id:run.id}));`;
    const child=spawn(process.execPath,["--import","tsx","--input-type=module","-e",script],{stdio:["ignore","pipe","pipe"]});
    const lines=createInterface({input:child.stdout}),exited=once(child,"exit");let stderr="";child.stderr.on("data",data=>{stderr+=data;});
    try{
      const [line]=await once(lines,"line"),{id}=JSON.parse(line);child.kill(signal);const [code]=await exited;assert.equal(code,0,stderr);
      const store=new BrainStore(file);try{assert.equal(store.run(id)!.status,"INTERRUPTED");assert.equal(store.messages(store.run(id)!.sessionId).length,1);}finally{store.close();}
    }finally{lines.close();if(child.exitCode===null&&child.signalCode===null){child.kill("SIGKILL");await exited;}await rm(directory,{recursive:true,force:true});}
  }
});

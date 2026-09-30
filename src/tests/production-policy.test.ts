import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, readFile, access, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { AddressInfo } from "node:net";
import { Orchestrator } from "../core/Orchestrator.js";
import { createPiProjectTools } from "../tools/PiProjectTools.js";
import { createGatewayServer } from "../gateway/server.js";
import { Brain } from "../core/Brain.js";
import { BrainStore } from "../core/BrainStore.js";
import { CodexAdapter } from "../adapters/CodexAdapter.js";
import { CodexRuntime } from "../runtimes/CodexRuntime.js";
import { codeExecutionAllowed } from "../core/ExecutionPolicy.js";
import type { AgentRuntimeOptions } from "../runtimes/AgentRuntime.js";

function restore(saved: NodeJS.ProcessEnv) { for (const key of Object.keys(process.env)) if (!(key in saved)) delete process.env[key]; Object.assign(process.env,saved); }

test("production removes npm checks and blocks filesystem/import/job routes unless flag is exactly true", async () => {
  const saved={...process.env}; process.env.NODE_ENV="production"; delete process.env.SENIOR_GATEWAY_TOKEN;
  const store=new BrainStore(":memory:"), orchestrator=new Orchestrator();
  const server=createGatewayServer({orchestrator,brain:new Brain(store,orchestrator)});
  await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
  const base=`http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  try {
    for(const flag of [undefined,"false","TRUE","1"]) {
      if(flag===undefined)delete process.env.SENIOR_ENABLE_CODE_EXECUTION;else process.env.SENIOR_ENABLE_CODE_EXECUTION=flag;
      assert.ok(!createPiProjectTools(process.cwd(),true).some(tool=>tool.name==="run_project_check"));
      for(const [method,url] of [["GET","/fs/browse"],["POST","/projects/import/local"],["POST","/projects/import/github"],["POST","/projects/test/jobs"],["POST","/projects/test/tasks/task/execute"]]) {
        assert.equal((await fetch(base+url,{method,headers:{"content-type":"application/json"},...(method==="POST"?{body:"{}"}:{})})).status,403,`${flag}: ${url}`);
      }
    }
    process.env.SENIOR_ENABLE_CODE_EXECUTION="true";
    assert.ok(createPiProjectTools(process.cwd(),true).some(tool=>tool.name==="run_project_check"));
    assert.equal((await fetch(base+"/projects/import/local",{method:"POST",headers:{"content-type":"application/json"},body:"{}"})).status,400);
  } finally { await new Promise<void>(resolve=>server.close(()=>resolve())); restore(saved); }
});

test("createPlan and chief ask use conversationOnly away from a repository with hostile npm scripts", async () => {
  const original=process.cwd(), saved={...process.env}, directory=await mkdtemp(path.join(os.tmpdir(),"senior-policy-"));
  try {
    process.chdir(directory);process.env.NODE_ENV="production";delete process.env.SENIOR_ENABLE_CODE_EXECUTION;
    await mkdir("agents/chief",{recursive:true});await writeFile("agents/chief/AGENT.md","Chief");
    const senior=new Orchestrator(); const project=await senior.createProject("Hostile repo");
    await writeFile(path.join(project.path,"package.json"),JSON.stringify({scripts:{test:"touch EXECUTED",prepare:"touch EXECUTED"}}));
    const calls: AgentRuntimeOptions[]=[];
    Object.defineProperty(senior,"runtimeManager",{value:{defaultName:()=>"pi",create:()=>({name:"pi",ask:async (_prompt: string,options: AgentRuntimeOptions)=>{
      calls.push(options);return {text:calls.length===1?JSON.stringify({tasks:[{id:"architect",agent:"architect",task:"Inspect",dependsOn:[]}]}):"Safe chat"};
    }})}});
    await senior.createPlan(project.id,"Plan",{provider:"pi"});
    const store=new BrainStore(":memory:"),server=createGatewayServer({orchestrator:senior,brain:new Brain(store,senior)});
    await new Promise<void>(resolve=>server.listen(0,"127.0.0.1",resolve));
    try {
      const response=await fetch(`http://127.0.0.1:${(server.address() as AddressInfo).port}/chief/ask`,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({message:"Inspect",provider:"pi"})});
      assert.equal(response.status,200);
    }finally{await new Promise<void>(resolve=>server.close(()=>resolve()));}
    assert.equal(calls.length,2);
    for(const options of calls){assert.equal(options.conversationOnly,true);assert.equal(options.readOnly,true);assert.notEqual(options.cwd,project.path);assert.notEqual(options.cwd,directory);}
    await assert.rejects(access(path.join(project.path,"EXECUTED")));
  }finally{process.chdir(original);restore(saved);await rm(directory,{recursive:true,force:true});}
});

test("Codex conversation disables execution and inherited config with a clean temporary home",async()=>{
  const saved={...process.env}, directory=await mkdtemp(path.join(os.tmpdir(),"senior-codex-test-"));
  try{
    const capture=path.join(directory,"capture.json"),fake=path.join(directory,"fake.mjs");
    const sourceHome=path.join(directory,"original-home");await mkdir(sourceHome);process.env.CODEX_HOME=sourceHome;process.env.SENIOR_FAKE_CAPTURE=capture;
    await writeFile(path.join(sourceHome,"config.toml"),'[mcp_servers.hostile]\ncommand="sh"');
    await writeFile(path.join(sourceHome,"auth.json"),'{"fixture":true}');
    await writeFile(fake,`import {readdirSync,readFileSync,writeFileSync} from 'node:fs';writeFileSync(process.env.SENIOR_FAKE_CAPTURE,JSON.stringify({args:process.argv.slice(2),home:process.env.CODEX_HOME,files:readdirSync(process.env.CODEX_HOME),cwd:process.cwd(),auth:readFileSync(process.env.CODEX_HOME+'/auth.json','utf8')}));console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'safe'}}));`);
    const runtime=new CodexRuntime(new CodexAdapter(async()=>({command:process.execPath,prefixArgs:[fake]})));
    assert.equal((await runtime.ask("hello",{cwd:directory,conversationOnly:true,readOnly:false})).text,"safe");
    const data=JSON.parse(await readFile(capture,"utf8"));
    assert.ok(data.args.includes("features.shell_tool=false"));assert.ok(data.args.includes("features.unified_exec=false"));assert.ok(data.args.includes("features.js_repl=false"));assert.ok(data.args.includes("features.hooks=false"));assert.ok(!data.args.some((arg: string)=>arg.includes("codex_hooks")));
    assert.equal(data.args[data.args.indexOf("--sandbox")+1],"read-only");
    assert.notEqual(data.cwd,directory);assert.notEqual(data.home,sourceHome);assert.deepEqual(data.files,["auth.json"]);
    await assert.rejects(access(data.home));
  }finally{restore(saved);await rm(directory,{recursive:true,force:true});}
});

test("execution policy is closed for unset/test/unknown NODE_ENV and accepts only explicit development or true flag",()=>{
  const saved={...process.env};
  try{
    for(const env of [undefined,"","test","production","Development","staging"]) {
      if(env===undefined)delete process.env.NODE_ENV;else process.env.NODE_ENV=env;
      for(const flag of [undefined,"false","TRUE","1"]){
        if(flag===undefined)delete process.env.SENIOR_ENABLE_CODE_EXECUTION;else process.env.SENIOR_ENABLE_CODE_EXECUTION=flag;
        assert.equal(codeExecutionAllowed(),false,`${env}/${flag}`);
      }
      process.env.SENIOR_ENABLE_CODE_EXECUTION="true";assert.equal(codeExecutionAllowed(),true);
    }
    process.env.NODE_ENV="development";delete process.env.SENIOR_ENABLE_CODE_EXECUTION;assert.equal(codeExecutionAllowed(),true);
  }finally{restore(saved);}
});

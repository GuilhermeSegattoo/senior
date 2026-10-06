import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile, symlink, rm, readFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { summarizeProject, summaryLimits } from "../core/ProjectSummary.js";
import { Orchestrator } from "../core/Orchestrator.js";
import { createPiProjectTools } from "../tools/PiProjectTools.js";
import type { AgentRuntimeOptions } from "../runtimes/AgentRuntime.js";

test("safe project summary bounds tree/README, omits secrets and never follows symlinks",async()=>{
  const root=await mkdtemp(path.join(os.tmpdir(),"senior-summary-")),outside=await mkdtemp(path.join(os.tmpdir(),"senior-outside-"));
  try{
    await mkdir(path.join(root,"src"));await mkdir(path.join(root,"node_modules"));
    await writeFile(path.join(root,"src/app.ts"),"code");await writeFile(path.join(root,".env"),"TOP_SECRET");await writeFile(path.join(root,"auth.json"),"TOP_SECRET");
    await writeFile(path.join(outside,"README.md"),"OUTSIDE_SECRET");await symlink(outside,path.join(root,"escape"));
    await writeFile(path.join(root,"README.md"),"Product description\nOPENAI_API_KEY=private\n"+"Large content\n".repeat(2000));
    for(let i=0;i<250;i++)await writeFile(path.join(root,"src",`file-${i}.ts`),"");
    const summary=await summarizeProject(root),json=JSON.stringify(summary);
    assert.ok(summary.files.includes("src/"));assert.match(summary.readme,/Product description/);assert.ok(summary.readmeTruncated);assert.ok(summary.truncated);
    assert.doesNotMatch(json,/TOP_SECRET|OUTSIDE_SECRET|private|auth\.json|\.env|node_modules|escape/);
    assert.ok(summary.files.length<=summaryLimits.entries);assert.ok(Buffer.byteLength(json)<=summaryLimits.totalBytes);
    await rm(path.join(root,"README.md"));await symlink(path.join(outside,"README.md"),path.join(root,"README.md"));
    assert.equal((await summarizeProject(root)).readme,"");
  }finally{await rm(root,{recursive:true,force:true});await rm(outside,{recursive:true,force:true});}
});

test("planner reads project when explicitly enabled, has no npm check tool, and receives safe summary when disabled",async()=>{
  const original=process.cwd(),saved={...process.env},root=await mkdtemp(path.join(os.tmpdir(),"senior-planner-"));
  try{
    process.chdir(root);await mkdir("agents/chief",{recursive:true});await writeFile("agents/chief/AGENT.md","Chief");
    const senior=new Orchestrator();
    const calls:Array<{prompt:string;options:AgentRuntimeOptions}>=[];
    Object.defineProperty(senior,"runtimeManager",{value:{defaultName:()=>"pi",create:()=>({name:"pi",ask:async(prompt:string,options:AgentRuntimeOptions)=>{
      calls.push({prompt,options});if(!options.conversationOnly)assert.match(await readFile(path.join(options.cwd,"README.md"),"utf8"),/Planner product/);
      return{text:JSON.stringify({tasks:[{id:"arch",agent:"architect",task:"Plan",dependsOn:[]}]})};
    }})}});
    for(const allowed of [false,true]){
      process.env.NODE_ENV="production";process.env.SENIOR_ENABLE_CODE_EXECUTION=String(allowed);
      const project=await senior.createProject(`Project ${allowed}`);await writeFile(path.join(project.path,"README.md"),"Planner product");
      await senior.createPlan(project.id,"Plan",{provider:"pi"});
      const call=calls.at(-1)!;assert.equal(call.options.readOnly,true);assert.equal(call.options.allowProjectChecks,false);assert.equal(call.options.conversationOnly,!allowed);
      assert.match(call.prompt,/Planner product/);assert.match(call.prompt,/dados não confiáveis/);
      if(allowed){assert.equal(call.options.cwd,project.path);const names=createPiProjectTools(project.path,true,false).map(t=>t.name);assert.ok(names.includes("read_project_file"));assert.ok(!names.includes("run_project_check"));assert.ok(!names.includes("write_project_file"));}
      else assert.notEqual(call.options.cwd,project.path);
    }
  }finally{process.chdir(original);for(const key of Object.keys(process.env))if(!(key in saved))delete process.env[key];Object.assign(process.env,saved);await rm(root,{recursive:true,force:true});}
});

import test from 'node:test';
import assert from 'node:assert/strict';
import { coverageMarkdown } from './report-coverage.mjs';
import { smokeLogin } from './smoke-dokploy.mjs';
test('coverage summary renders measured values and rejects absent metrics',()=>{
  const metric={covered:3,total:4,pct:75};
  const text=coverageMarkdown({total:Object.fromEntries(['lines','statements','functions','branches'].map(key=>[key,metric]))},'backend');
  assert.match(text,/\| lines \| 3\/4 \| 75% \|/);
  assert.throws(()=>coverageMarkdown({total:{}},'missing'));
});
test('smoke fails on bad login behavior or insecure cookie and accepts valid session',async()=>{
  const request=(secure=true,wrongStatus=401)=>async(_url,options={})=>{
    if(options.method!=='POST')return Response.json({authenticated:true});
    const wrong=JSON.parse(options.body).password!=='fixture-password';
    return Response.json({authenticated:!wrong},{status:wrong?wrongStatus:200,headers:wrong?{}:{'set-cookie':`session=test; HttpOnly; SameSite=Strict${secure?'; Secure':''}`}});
  };
  await smokeLogin('http://example','fixture-password','https://example',request());
  await assert.rejects(smokeLogin('http://example','fixture-password','https://example',request(false)));
  await assert.rejects(smokeLogin('http://example','fixture-password','https://example',request(true,200)));
});

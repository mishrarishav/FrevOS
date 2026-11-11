import test from 'node:test';
import assert from 'node:assert/strict';
import { promises as fs } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomBytes } from 'node:crypto';
import { createNativeServerMonitoringCollector, monitorTargetBinding, validMonitorSnapshot } from './QueueCollector.mjs';

const target = {id:`srv_${'a'.repeat(32)}`,workspaceId:'ws_fixture',address:'10.9.69.20',port:5985,transport:'local',credentialProfile:'fixture_profile',revision:1};
const snapshot = () => ({observedAt:new Date().toISOString(),computerName:'FIXTURE20',osName:'Fixture Windows',uptimeSeconds:12,logicalProcessors:8,cpuPercent:55,memoryTotalBytes:8_000_000,memoryAvailableBytes:2_000_000,disks:[{name:'C:',totalBytes:1000,freeBytes:400}],network:{receivedBytesPerSecond:null,sentBytesPerSecond:100},processes:[{pid:4,name:'fixture',cpuPercent:12,workingSetBytes:200}],services:[{name:'fixture',displayName:'Fixture service',state:'Running',startMode:'Auto',pid:4}]});
function context(signal) {const at=Date.now();return {requestId:`smr_${randomBytes(16).toString('hex')}`,action:'sample',issuedAt:new Date(at).toISOString(),expiresAt:new Date(at+30000).toISOString(),signal};}
async function fixture(run) {
  const queueRoot=await fs.mkdtemp(path.join(os.tmpdir(),'devsetu-monitor-fixture-'));
  for(const leaf of ['requests','results']) await fs.mkdir(path.join(queueRoot,target.workspaceId,leaf),{recursive:true});
  try { await run(queueRoot); } finally { await fs.rm(queueRoot,{recursive:true,force:true}); }
}
async function respond(queueRoot,ctx,mutate=()=>{},result={status:'connected',computerName:'FIXTURE20',snapshot:snapshot()}) {
  const requestPath=path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.json`);
  for(let i=0;i<200;i++) {try {await fs.access(requestPath);break;} catch{} await new Promise(resolve=>setTimeout(resolve,5));}
  const request=JSON.parse(await fs.readFile(requestPath,'utf8'));
  assert.deepEqual(Object.keys(request).sort(),['version','requestId','workspaceId','targetId','action','binding','issuedAt','expiresAt'].sort());
  assert(!JSON.stringify(request).includes('fixture_profile'));
  assert(!JSON.stringify(request).includes('10.9.69.20'));
  const envelope={version:1,requestId:ctx.requestId,workspaceId:target.workspaceId,targetId:target.id,binding:monitorTargetBinding(target),completedAt:new Date().toISOString(),transport:target.transport,result};
  mutate(envelope);
  await fs.writeFile(path.join(queueRoot,target.workspaceId,'results',`${ctx.requestId}.json`),JSON.stringify(envelope),{flag:'wx'});
}
test('queues data-only bound requests and accepts exact fresh snapshot',async()=>fixture(async queueRoot=>{
  const ctx=context();
  const collect=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:1500});
  const promise=collect(target,ctx);
  await respond(queueRoot,ctx);
  assert.equal((await promise).status,'connected');
  await assert.rejects(fs.access(path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.json`)));
}));
for(const [name,mutate] of [
  ['another target',e=>{e.targetId=`srv_${'b'.repeat(32)}`;}],
  ['tampered endpoint binding',e=>{e.binding='0'.repeat(64);}],
  ['another workspace',e=>{e.workspaceId='ws_other';}],
  ['transport mislabel',e=>{e.transport='winrm-http';}],
  ['stale result time',e=>{e.completedAt='2020-01-01T00:00:00.000Z';}],
  ['unknown result field',e=>{e.result.commandLine='secret';}],
  ['unbounded CPU',e=>{e.result.snapshot.cpuPercent=101;}],
  ['cumulative process seconds',e=>{e.result.snapshot.processes[0].cpuPercent=10000;}],
  ['service credential details',e=>{e.result.snapshot.services[0].startName='domain\\account';}],
]) test(`rejects ${name}`,async()=>fixture(async queueRoot=>{
  const ctx=context();const promise=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:1000})(target,ctx);
  await respond(queueRoot,ctx,mutate);
  assert.deepEqual(await promise,{status:'error',computerName:null});
}));
test('accepts fixed access-denied without inventing metric data',async()=>fixture(async queueRoot=>{
  const ctx=context();const promise=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:1000})(target,ctx);
  await respond(queueRoot,ctx,()=>{},{status:'access-denied',computerName:null});
  assert.deepEqual(await promise,{status:'access-denied',computerName:null});
}));
test('routine access/display revision edits retain the enrolled endpoint binding',async()=>fixture(async queueRoot=>{
  const revisedTarget={...target,revision:target.revision+1};
  assert.equal(monitorTargetBinding(revisedTarget),monitorTargetBinding(target));
  const ctx=context();const promise=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:1000})(revisedTarget,ctx);
  await respond(queueRoot,ctx);
  assert.equal((await promise).status,'connected');
}));
test('each stable endpoint identity field remains bound to operator enrollment',()=>{
  for(const edit of [{workspaceId:'ws_other'},{id:`srv_${'b'.repeat(32)}`},{address:'10.9.69.21'},{port:5986},{transport:'winrm-https'},{credentialProfile:'other_profile'}]) {
    assert.notEqual(monitorTargetBinding({...target,...edit}),monitorTargetBinding(target));
  }
});
test('timeout creates cancellation marker and removes only its own request',async()=>fixture(async queueRoot=>{
  const ctx=context();const collect=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:100});
  assert.equal((await collect(target,ctx)).status,'error');
  assert.equal(await fs.readFile(path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.cancel`),'utf8'),'cancelled');
}));
test('abort cancels a pending request promptly',async()=>fixture(async queueRoot=>{
  const abort=new AbortController();const ctx=context(abort.signal);
  const promise=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:1000})(target,ctx);
  const request=path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.json`);
  for(let i=0;i<100;i++){try{await fs.access(request);break;}catch{} await new Promise(resolve=>setTimeout(resolve,5));}
  abort.abort();
  assert.equal((await promise).status,'error');
  assert.equal(await fs.readFile(path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.cancel`),'utf8'),'cancelled');
}));
test('rejects public targets, traversal, expired contexts, and duplicate IDs before dispatch',async()=>fixture(async queueRoot=>{
  const collect=createNativeServerMonitoringCollector({queueRoot,pollIntervalMs:10,timeoutMs:100});
  assert.equal((await collect({...target,address:'8.8.8.8'},context())).status,'error');
  assert.equal((await collect({...target,workspaceId:'../fixture'},context())).status,'error');
  assert.equal((await collect(target,{...context(),requestId:'../a'})).status,'error');
  const old={...context(),issuedAt:'2020-01-01T00:00:00.000Z',expiresAt:'2020-01-01T00:01:00.000Z'};
  assert.equal((await collect(target,old)).status,'error');
  const ctx=context();const request=path.join(queueRoot,target.workspaceId,'requests',`${ctx.requestId}.json`);
  await fs.writeFile(request,'untouched',{flag:'wx'});
  assert.equal((await collect(target,ctx)).status,'error');
  assert.equal(await fs.readFile(request,'utf8'),'untouched');
}));
test('does not create missing queues or hide central worker configuration failure',async()=>fixture(async queueRoot=>{
  await fs.rmdir(path.join(queueRoot,target.workspaceId,'requests'));
  assert.equal((await createNativeServerMonitoringCollector({queueRoot,timeoutMs:100})(target,context())).status,'error');
  await assert.rejects(fs.stat(path.join(queueRoot,target.workspaceId,'requests')));
}));
test('nullable unsupported counters stay null and invalid byte quantities fail',()=>{
  const value=snapshot();value.cpuPercent=null;value.processes[0].cpuPercent=null;
  assert.equal(validMonitorSnapshot(value),true);
  value.memoryAvailableBytes=value.memoryTotalBytes+1;
  assert.equal(validMonitorSnapshot(value),false);
});

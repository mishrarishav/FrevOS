import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';

const targetId = /^srv_[a-f0-9]{32}$/;
const requestId = /^smr_[a-f0-9]{32}$/;
const workspaceId = /^ws_[A-Za-z0-9][A-Za-z0-9_-]{0,119}$/;
const statuses = new Set(['connected','auth-failed','access-denied','unreachable','winrm-unavailable','unsupported','error']);
const transport = new Set(['winrm-http','winrm-https','local']);
const failure = () => ({ status: 'error', computerName: null });
const exact = (value, required, optional = []) => value && typeof value === 'object' && !Array.isArray(value) && required.every(key => Object.hasOwn(value, key)) && Object.keys(value).every(key => required.includes(key) || optional.includes(key));
const label = value => typeof value === 'string' && value.length > 0 && value.length <= 240 && !/[\x00-\x1f\x7f]/.test(value);
const bytes = value => Number.isSafeInteger(value) && value >= 0;
const percent = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const rate = value => value === null || typeof value === 'number' && Number.isFinite(value) && value >= 0;
const instant = value => typeof value === 'string' && /^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,7})?Z$/.test(value) && Number.isFinite(Date.parse(value));
export function monitorTargetBinding(target) {
  // Revision is a DB concurrency fence, not an operator endpoint identity.
  return createHash('sha256').update([target.workspaceId,target.id,target.address,String(target.port),target.transport,target.credentialProfile].join('\n')).digest('hex');
}
function validTarget(value) {
  if (!value || !targetId.test(value.id) || !workspaceId.test(value.workspaceId) || !transport.has(value.transport) || !/^[a-z][a-z0-9_-]{2,79}$/.test(value.credentialProfile) || !Number.isInteger(value.revision) || value.revision < 0 || !Number.isInteger(value.port) || value.port < 1 || value.port > 65535) return false;
  if (typeof value.address !== 'string' || !/^(?:0|[1-9]\d{0,2})(?:\.(?:0|[1-9]\d{0,2})){3}$/.test(value.address)) return false;
  const [a,b,...rest] = value.address.split('.').map(Number);
  return [a,b,...rest].every(part => part <= 255) && (a === 10 || a === 172 && b >= 16 && b <= 31 || a === 192 && b === 168);
}
export function validMonitorSnapshot(value) {
  if (!exact(value,['observedAt','computerName','osName','uptimeSeconds','logicalProcessors','cpuPercent','memoryTotalBytes','memoryAvailableBytes','disks','network','processes','services'])) return false;
  if (!instant(value.observedAt) || !label(value.computerName) || !label(value.osName) || !Number.isFinite(value.uptimeSeconds) || value.uptimeSeconds < 0 || !Number.isInteger(value.logicalProcessors) || value.logicalProcessors < 1 || value.logicalProcessors > 4096 || !percent(value.cpuPercent) || !bytes(value.memoryTotalBytes) || value.memoryTotalBytes < 1 || !bytes(value.memoryAvailableBytes) || value.memoryAvailableBytes > value.memoryTotalBytes) return false;
  if (!Array.isArray(value.disks) || value.disks.length > 64 || !value.disks.every(disk => exact(disk,['name','totalBytes','freeBytes']) && label(disk.name) && bytes(disk.totalBytes) && bytes(disk.freeBytes) && disk.freeBytes <= disk.totalBytes)) return false;
  if (!exact(value.network,['receivedBytesPerSecond','sentBytesPerSecond']) || !rate(value.network.receivedBytesPerSecond) || !rate(value.network.sentBytesPerSecond)) return false;
  if (!Array.isArray(value.processes) || value.processes.length > 100 || !value.processes.every(proc => exact(proc,['pid','name','cpuPercent','workingSetBytes']) && bytes(proc.pid) && label(proc.name) && percent(proc.cpuPercent) && bytes(proc.workingSetBytes))) return false;
  return Array.isArray(value.services) && value.services.length <= 1000 && value.services.every(service => exact(service,['name','displayName','state','startMode','pid']) && label(service.name) && label(service.displayName) && label(service.state) && label(service.startMode) && (service.pid === null || bytes(service.pid)));
}
async function noReparse(target) {
  let current = path.resolve(target);
  while (true) {
    try { if ((await fs.lstat(current)).isSymbolicLink()) throw new Error('monitor-reparse-path-rejected'); }
    catch (error) { if (error?.code !== 'ENOENT') throw error; }
    const parent = path.dirname(current);
    if (parent === current) break;
    current = parent;
  }
}
function wait(ms, signal) {
  return new Promise((resolve, reject) => {
    const done = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); resolve(); };
    const aborted = () => { clearTimeout(timer); signal?.removeEventListener('abort', aborted); reject(new Error('monitor-cancelled')); };
    const timer = setTimeout(done, ms);
    if (signal?.aborted) aborted(); else signal?.addEventListener('abort', aborted, { once: true });
  });
}

/** Data-only transport to the separately installed SYSTEM worker. It never launches a shell. */
export function createNativeServerMonitoringCollector({ queueRoot, workspaceId: onlyWorkspace, pollIntervalMs = 250, timeoutMs = 90000 } = {}) {
  if (typeof queueRoot !== 'string' || !path.isAbsolute(queueRoot) || onlyWorkspace !== undefined && !workspaceId.test(onlyWorkspace) || !Number.isInteger(pollIntervalMs) || pollIntervalMs < 10 || pollIntervalMs > 5000 || !Number.isInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 120000) throw new Error('monitor-invalid-queue-config');
  const root = path.resolve(queueRoot);
  return async (target, context) => {
    if (!validTarget(target) || onlyWorkspace !== undefined && target.workspaceId !== onlyWorkspace || !context || !requestId.test(context.requestId) || !['check','sample'].includes(context.action) || !instant(context.issuedAt) || !instant(context.expiresAt)) return failure();
    const issued = Date.parse(context.issuedAt), expires = Date.parse(context.expiresAt), now = Date.now();
    if (issued > now + 15000 || issued < now - 120000 || expires <= now || expires <= issued || expires > issued + 120000 || context.signal?.aborted) return failure();
    const base = path.join(root,target.workspaceId);
    const requestPath = path.join(base,'requests',`${context.requestId}.json`);
    const cancelPath = path.join(base,'requests',`${context.requestId}.cancel`);
    const resultPath = path.join(base,'results',`${context.requestId}.json`);
    const binding = monitorTargetBinding(target);
    let submitted = false, completed = false;
    try {
      // Directories are operator-created with separate request/result ACLs. No mkdir fallback.
      await noReparse(root);
      for (const directory of [base,path.dirname(requestPath),path.dirname(resultPath)]) {
        await noReparse(directory);
        if (!(await fs.stat(directory)).isDirectory()) return failure();
      }
      if ((await fs.readdir(path.dirname(requestPath))).length >= 256) return failure();
      await noReparse(requestPath);
      await fs.writeFile(requestPath,JSON.stringify({version:1,requestId:context.requestId,workspaceId:target.workspaceId,targetId:target.id,action:context.action,binding,issuedAt:context.issuedAt,expiresAt:context.expiresAt}),{flag:'wx',mode:0o600});
      submitted = true;
      const deadline = Math.min(expires,Date.now() + timeoutMs);
      while (Date.now() < deadline && !context.signal?.aborted) {
        try {
          await noReparse(resultPath);
          const info = await fs.stat(resultPath);
          if (!info.isFile() || info.size < 2 || info.size > 1048576) return failure();
          const envelope = JSON.parse(await fs.readFile(resultPath,'utf8'));
          if (!exact(envelope,['version','requestId','workspaceId','targetId','binding','completedAt','transport','result']) || envelope.version !== 1 || envelope.requestId !== context.requestId || envelope.workspaceId !== target.workspaceId || envelope.targetId !== target.id || envelope.binding !== binding || envelope.transport !== target.transport || !instant(envelope.completedAt) || Date.parse(envelope.completedAt) < issued - 15000 || Date.parse(envelope.completedAt) > Date.now() + 15000) return failure();
          const result = envelope.result;
          if (!exact(result,['status','computerName'],['snapshot']) || !statuses.has(result.status) || result.computerName !== null && !label(result.computerName)) return failure();
          if (result.status === 'connected' && (!result.computerName || !validMonitorSnapshot(result.snapshot) || result.snapshot.computerName !== result.computerName)) return failure();
          if (result.status !== 'connected' && Object.hasOwn(result,'snapshot')) return failure();
          completed = true;
          return result;
        } catch (error) { if (!['ENOENT','EBUSY','EACCES'].includes(error?.code)) return failure(); }
        await wait(Math.min(pollIntervalMs,Math.max(1,deadline - Date.now())),context.signal);
      }
      return failure();
    } catch { return failure(); }
    finally {
      if (submitted) {
        if (!completed) { try { await noReparse(cancelPath); await fs.writeFile(cancelPath,'cancelled',{flag:'wx',mode:0o600}); } catch {} }
        // Results/claims are SYSTEM-owned, retained for bounded audit and replay rejection.
        try { await fs.unlink(requestPath); } catch {}
      }
    }
  };
}

import { createHash, randomBytes } from "node:crypto";
import { readFile, writeFile, link, unlink } from "node:fs/promises";
import { join } from "node:path";
import { z } from "zod";
import { DeploymentChangeSchema, type DeploymentChange } from "@frevos/contracts";

const digest = z.string().regex(/^[a-f0-9]{64}$/);
const id = z.string().regex(/^[a-f0-9]{32}$/);
const candidateSchema = z
  .object({
    version: z.literal(1),
    candidateId: id,
    manifestSha256: digest,
    previousManifestSha256: digest,
    expiresAt: z.iso.datetime({ offset: true }),
    label: z.string().min(1).max(120),
  })
  .strict();
const requestSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^su_[a-f0-9]{32}$/),
    candidateId: id,
    manifestSha256: digest,
    previousManifestSha256: digest,
    actor: z.literal("usr_windows_admin"),
    issuedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const resultSchema = z
  .object({
    version: z.literal(1),
    requestId: z.string().regex(/^su_[a-f0-9]{32}$/),
    candidateId: id,
    manifestSha256: digest,
    status: z.enum(["activating", "succeeded", "failed"]),
    updatedAt: z.iso.datetime({ offset: true }),
  })
  .strict();
const noteSchema = z
  .object({ request: requestSchema, changeDetails: DeploymentChangeSchema })
  .strict();
export class SelfUpdates {
  constructor(private readonly root: string) {}
  private async note(candidateId: string) {
    try {
      return noteSchema.parse(
        JSON.parse(await readFile(join(this.root, "requests", candidateId + ".note"), "utf8")),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }
  private async publish(file: string, value: unknown) {
    const temporary = file + "." + randomBytes(16).toString("hex") + ".tmp";
    await writeFile(temporary, JSON.stringify(value), { flag: "wx" });
    try {
      await link(temporary, file);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    } finally {
      await unlink(temporary);
    }
  }
  async state() {
    const raw = await readFile(join(this.root, "catalog.json"), "utf8");
    const candidate = candidateSchema.parse(JSON.parse(raw));
    let request: z.infer<typeof requestSchema> | null = null;
    try {
      request = requestSchema.parse(
        JSON.parse(
          await readFile(join(this.root, "requests", candidate.candidateId + ".json"), "utf8"),
        ),
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
    }
    let result: z.infer<typeof resultSchema> | null = null;
    if (request) {
      try {
        result = resultSchema.parse(
          JSON.parse(
            await readFile(join(this.root, "results", request.requestId + ".json"), "utf8"),
          ),
        );
        if (
          result.candidateId !== candidate.candidateId ||
          result.manifestSha256 !== candidate.manifestSha256
        )
          throw Error("Self-update identity mismatch");
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }
    }
    const note = await this.note(candidate.candidateId);
    if (
      note &&
      (note.request.candidateId !== candidate.candidateId ||
        note.request.manifestSha256 !== candidate.manifestSha256 ||
        note.request.previousManifestSha256 !== candidate.previousManifestSha256 ||
        (request && JSON.stringify(note.request) !== JSON.stringify(request)))
    )
      throw Error("Self-update note identity mismatch");
    return {
      candidate,
      request,
      result,
      changeDetails: note?.changeDetails ?? null,
      expired: Date.parse(candidate.expiresAt) <= Date.now(),
    };
  }
  async request(candidateId: string, manifestSha256: string, input: DeploymentChange) {
    const changeDetails = DeploymentChangeSchema.parse(input);
    const state = await this.state();
    if (
      state.candidate.candidateId !== candidateId ||
      state.candidate.manifestSha256 !== manifestSha256 ||
      state.expired
    )
      throw Error("Candidate expired or changed");
    if (state.request) {
      if (JSON.stringify(state.changeDetails) !== JSON.stringify(changeDetails))
        throw Error("Self-update note changed");
      return state.request;
    }
    const request = requestSchema.parse({
      version: 1,
      requestId: "su_" + randomBytes(16).toString("hex"),
      candidateId,
      manifestSha256,
      previousManifestSha256: state.candidate.previousManifestSha256,
      actor: "usr_windows_admin",
      issuedAt: new Date().toISOString(),
    });
    // Publish context first. Raced/retried writers use its exact request identity;
    // native workers retain their compatible seven-field request envelope.
    await this.publish(join(this.root, "requests", candidateId + ".note"), {
      request,
      changeDetails,
    });
    const chosen = await this.note(candidateId);
    if (
      !chosen ||
      JSON.stringify(chosen.changeDetails) !== JSON.stringify(changeDetails) ||
      chosen.request.manifestSha256 !== manifestSha256
    )
      throw Error("Self-update note changed");
    await this.publish(join(this.root, "requests", candidateId + ".json"), chosen.request);
    return (await this.state()).request;
  }
}

// Served by the authenticated control plane. No credentials, paths or commands
// are supplied by this UI; it can request only the operator-sealed candidate.
export const selfUpdateHtml =
  '<!doctype html><html lang="en"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>DevSetu update</title><link rel="stylesheet" href="/maintenance.css"><main><h1>DevSetu platform update</h1><p>Server20 · application update · existing application data preserved</p><p id="candidate">Checking prepared release…</p><button id="deploy" disabled>Deploy DevSetu</button><p id="status" role="status"></p><p id="elapsed"></p><p id="details"></p><a href="/deployments/deploy-72">Back to deployments</a></main><dialog id="confirmation"><form id="change-form"><h2>Deploy details</h2><label for="message">What is changing?</label><textarea id="message" required minlength="3" maxlength="2000" rows="4"></textarea><label for="approved-by">Approved by / approval reference</label><input id="approved-by" required minlength="2" maxlength="160"><p>Your signed-in account is recorded automatically. The approval reference is recorded as provided; no approval request is sent.</p><p>This activates a prepared build; it does not create a Git commit.</p><p id="form-status" role="status"></p><button type="button" id="cancel">Cancel</button> <button id="confirm" type="submit">Confirm deploy</button></form></dialog><script src="/maintenance.js" defer></script></html>';
export const selfUpdateStyle =
  "body{font:16px system-ui;background:#0c1018;color:#edf4f7;margin:0;padding:24px}main{max-width:720px;margin:6vh auto;background:#131a23;padding:28px;border:1px solid #2c3948;border-radius:14px}button,a,input,textarea{font:inherit;color:inherit}button{background:#00cbd6;color:#041013;border:0;border-radius:8px;padding:13px 24px;cursor:pointer}button:disabled{opacity:.5;cursor:wait}code{overflow-wrap:anywhere}p{line-height:1.6;white-space:pre-wrap;overflow-wrap:anywhere}a{color:#00dbe8}dialog{background:#131a23;color:#edf4f7;border:1px solid #2c3948;border-radius:14px;max-width:600px;width:calc(100% - 64px);max-height:calc(100dvh - 70px);overflow:auto;padding:22px}dialog::backdrop{background:#030610b8}label{display:grid;gap:8px;margin:18px 0}input,textarea{box-sizing:border-box;width:100%;background:#0c1018;border:1px solid #435063;padding:10px;border-radius:6px}";
export const selfUpdateScript = String.raw`
const deploy=document.getElementById('deploy'),status=document.getElementById('status'),dialog=document.getElementById('confirmation'),form=document.getElementById('change-form'),message=document.getElementById('message'),approvedBy=document.getElementById('approved-by'),formStatus=document.getElementById('form-status'),confirmButton=document.getElementById('confirm'),cancel=document.getElementById('cancel');
let started=null,submitting=false,pendingBody=null,selected=null;
function closeDialog(){if(submitting)return;dialog.close();message.value='';approvedBy.value='';formStatus.textContent='';}
dialog.oncancel=e=>{if(submitting)e.preventDefault();};cancel.onclick=closeDialog;
async function poll(){try{const r=await fetch('/v1/workspaces/ws_server20/platform-update',{cache:'no-store'});if(!r.ok)throw Error();const s=await r.json();window.candidate=s.candidate;document.getElementById('candidate').textContent=s.candidate.label+' · '+s.candidate.manifestSha256.slice(0,12);document.getElementById('details').textContent=s.changeDetails?'Changes: '+s.changeDetails.message+'\nDeclared approval: '+s.changeDetails.approvedBy+'\nRequested by: '+(s.request?.actor||'signed-in owner'):s.request?'Change/approval details were not recorded for this older update.':'';const active=s.request&&(!s.result||s.result.status==='activating');deploy.disabled=submitting||s.expired||!!s.request;status.textContent=s.result?.status==='succeeded'?'Update succeeded. DevSetu is healthy.':s.result?.status==='failed'?'Update failed. Previous release recovery evidence was retained.':active?'Deploying DevSetu. The dashboard may reconnect during restart.':s.expired?'Prepared release expired.':'Prepared release is ready.';if(active)started??=Date.parse(s.request.issuedAt);if(s.result&&s.result.status!=='activating')started=null;if(s.request&&pendingBody&&s.request.candidateId===pendingBody.candidateId){pendingBody=null;if(!submitting)closeDialog();}}catch{status.textContent=started?'DevSetu is restarting. Reconnecting…':'Update service unavailable. Retrying…';deploy.disabled=true;}setTimeout(poll,1500);}
deploy.onclick=()=>{if(submitting||!window.candidate)return;selected=window.candidate;message.value=pendingBody?.changeDetails.message||'';approvedBy.value=pendingBody?.changeDetails.approvedBy||'';message.readOnly=approvedBy.readOnly=!!pendingBody;formStatus.textContent=pendingBody?'Retry retains the original details and candidate.':'';dialog.showModal();};
form.onsubmit=async e=>{e.preventDefault();if(submitting||!selected)return;pendingBody??={candidateId:selected.candidateId,manifestSha256:selected.manifestSha256,changeDetails:{message:message.value.trim(),approvedBy:approvedBy.value.trim()}};submitting=true;started=Date.now();deploy.disabled=true;confirmButton.disabled=cancel.disabled=true;message.readOnly=approvedBy.readOnly=true;formStatus.textContent='Submitting update…';try{const cookie=document.cookie.split('; ').find(x=>x.startsWith('frevos-internal-csrf='));if(!cookie)throw Error();const r=await fetch('/v1/workspaces/ws_server20/platform-update',{method:'POST',headers:{'content-type':'application/json','x-csrf-token':decodeURIComponent(cookie.slice(cookie.indexOf('=')+1))},body:JSON.stringify(pendingBody)});if(!r.ok){if([400,401,403,409].includes(r.status)){pendingBody=null;message.readOnly=approvedBy.readOnly=false;formStatus.textContent='Request was rejected. Check the prepared candidate and details.';return;}throw Error();}dialog.close();message.value='';approvedBy.value='';}catch{formStatus.textContent='Request not confirmed. Retry retains the same candidate and details.';}finally{submitting=false;confirmButton.disabled=cancel.disabled=false;}};
setInterval(()=>{document.getElementById('elapsed').textContent=started?'Elapsed '+Math.floor((Date.now()-started)/1000)+' seconds':'';},1000);poll();
`;

# ADR 0064: Visible Production configuration with a separate execution gate

Status: Accepted for the owner's current configuration request, 2026-10-26.

## Context

After requesting an unchanged-dependency Servix Production plan, the owner
logged into the adjacent DevSetu browser and delegated configuration and the
current workflow's approvals. The owner requires visible DevSetu execution and
preservation of uploads, attachments, environments and existing files.

## Decision

Supersede the plan-only authorization limit in the earlier readiness handoff
for visible configuration of the current Servix Production proposal. Save a
separate revisioned Production profile through the authenticated UI; preserve
the existing Development profile. Keep the current library/runtime versions.

The delegated instruction does not replace an actual actor/workspace/action/
target/correlation/expiry/artifact-bound approval record, authorize unrelated
future actions or waive audit/integrity controls. Do not fabricate an approver
or label a generic configuration save as a Production release approval.

The saved profile must remain visibly unavailable until an approved enrolled
adapter supports actual same-owner runtime adoption, promotion of the retained
backend bytes, health/preservation checks and saved-artifact recovery. Preserve
ADR 0057's exclusion on the legacy Development adapter. Do not implement a
manual Production workaround outside DevSetu.

## Observed result and consequences

`servix-production` revision 1 was saved visibly in DevSetu Internal, targeting
server21 `D:\Servix` and `https://support.eesl.co.in/`, with the existing central
Servix repository and five backend preservation paths. The connection test at
23:17:45 IST passed preservation and reported destination pending. No source
connector or Production executor was enrolled. Development remains revision 3.
No Production release approval or activation, task registration, credential/
permission change or database write occurred.

The next required bounded task is the actual Production adapter and its
verification. A saved profile or successful historical Development deployment
does not establish that capability.

## Rejected alternatives

- Retarget the existing Development runner or weaken its Production exclusion.
- Record a blanket approval without a specific executable action and artifact.
- Deploy through a private script while presenting a configuration save as
  evidence of DevSetu deployment.

Related: [ADR 0049](0049-configured-component-deployments.md),
[ADR 0057](0057-servix-backend-build-artifact.md),
[Production plan](../SERVIX_PRODUCTION_DEPLOYMENT_PLAN.md).

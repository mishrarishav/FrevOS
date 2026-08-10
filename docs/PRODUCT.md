# FrevOS Product Definition

## Mission

FrevOS is a cloud-first AI Work Operating System that lets authorized users
direct and supervise AI-assisted work on connected projects from desktop or
mobile. FrevOS owns policy, state, approvals, evidence, audit, and integration
boundaries while replaceable model providers assist with reasoning.

The product should make complex work observable and controllable without
requiring the user's laptop to remain online.

## Product boundaries

FrevOS is:

- a multi-workspace project and repository control plane;
- an orchestrator for bounded specialist-agent work;
- a policy and approval boundary for consequential actions;
- an evidence, audit, release, and deployment system;
- a web and mobile-first interface for long-running cloud jobs.

FrevOS is not:

- a general-purpose code editor or unrestricted chat shell;
- a replacement for GitHub as source control;
- a permanent mirror of customer repositories;
- a model-training system for customer source code;
- an AI runtime installed on a Production Windows server;
- an authority that may bypass human approval for sensitive actions.

## Primary user outcomes

An authorized user should eventually be able to:

1. Connect a GitHub repository through a GitHub App.
2. Understand its architecture, build system, tests, risks, and current state.
3. Request a bounded change and see a structured execution timeline.
4. Review the proposed plan, diff, test evidence, and independent QA evidence.
5. Approve a pull request or sensitive transition at the appropriate boundary.
6. Build one traceable artifact and promote it unchanged through environments.
7. Observe health and initiate an approved rollback when necessary.
8. Search authorized Outlook context, create drafts, inspect availability, and
   propose calendar events without granting implicit send authority.
9. Resume a task from another device after disconnecting.

## Core user flow

```text
User
  -> FrevOS Web / Mobile PWA
  -> Task Orchestrator and Policy Engine
  -> Specialized Agents
  -> Controlled Tool Gateway
  -> GitHub / Workers / QA / Release / Deploy / Office / Memory
  -> Evidence and Audit
  -> Review and Human Approval where required
```

## Planned capabilities

### Project onboarding

- Normalize and validate a GitHub repository URL.
- Verify GitHub App installation and granted permissions.
- Resolve immutable provider repository identity and metadata.
- Analyze the repository in an isolated temporary environment.
- Propose source-linked project configuration for human review.

### AI-assisted delivery

- Repository analysis, task planning, coding, testing, review, and QA.
- Dedicated branches and pull requests; no direct default-branch mutation.
- User-visible progress, retries, failures, and evidence.
- Provider-neutral model selection constrained by project data policy.

### Release and deployment

- Immutable artifact production with digest and provenance.
- Exact artifact promotion from UAT to Production.
- Explicit Production approval and deterministic deployment.
- Health checks, backup, audit, and controlled rollback.

### Work context

- Source-linked, workspace-scoped project memory.
- Separately authorized mail reading, draft creation, sending, calendar reading,
  and invitation sending.
- Future voice input that cannot authorize sensitive actions by itself.

## Experience requirements

- Desktop web and mobile-first installable PWA.
- Accessible keyboard and touch interaction.
- Persistent task state across browser close, logout, disconnect, and worker
  interruption.
- Honest loading, empty, denied, partial, retry, and failure states.
- A live timeline containing plans, tool activity, approvals, evidence, and
  outcomes without leaking secrets.
- Clear distinction between a proposal, an approved action, an in-progress
  action, and a verified result.

The approved Phase 3 experience source is pinned in
[Phase 3 UI Reference](UI_REFERENCE.md). It governs the visual and interaction
contract only; production authority and data remain within FrevOS boundaries.

## Core domain concepts

The domain will eventually include `User`, `Workspace`, `WorkspaceMember`,
`Client`, `Project`, `RepositoryConnection`, `ProjectConfiguration`, `Task`,
`TaskStep`, `AgentRun`, `ToolInvocation`, `ApprovalRequest`, `Artifact`,
`Release`, `Deployment`, `DeploymentTarget`, `AuditEvent`, `SecretReference`,
`ProjectMemoryRecord`, and `Notification`.

Every project-related concept is workspace scoped. Exact schemas are deferred
to the contracts phase and must not be inferred from this conceptual list.

## Product success principles

Success means more than a green test result. A completed task must demonstrate
that the requested behavior was implemented, policy was enforced, relevant
validation passed, evidence is attributable, and sensitive transitions were
properly approved.

Quantitative service objectives, supported providers, pricing, retention, and
commercial packaging remain open product decisions.

# ADR 0003: Route side effects through controlled business tools

- Status: Accepted
- Date: 2026-08-09

## Context

Agents and models can propose useful actions but may be mistaken, manipulated by
untrusted content, or supplied with ambiguous context. Giving them unrestricted
shell, database, server, email, or deployment access would make deterministic
authorization, approvals, validation, idempotency, and audit unreliable.

## Decision

All meaningful agent side effects pass through a FrevOS-controlled gateway of
versioned business-level tools. Each registered tool declares:

- identifier and version;
- input and output schemas;
- required scopes and workspace behavior;
- normalized target and risk level;
- approval policy;
- timeout and idempotency behavior;
- audit action and correlation behavior;
- redaction rules and error contract.

The gateway re-authorizes each invocation and validates the registered contract.
Callers cannot supply their own risk or permission declaration.

Unrestricted shell, raw PowerShell, arbitrary deletion, arbitrary database
queries, arbitrary external messages, remote server commands, and unrestricted
service control are prohibited. A bounded command runner may exist only inside
an isolated temporary worker with explicit resource and network limits.

## Consequences

- Tools align with business intent and can be audited consistently.
- New operations require contract and policy design before implementation.
- Models may have less flexibility, but failures are contained and reviewable.
- Provider APIs remain infrastructure details behind a stable authorization
  boundary.

## Rejected alternatives

- General shell or PowerShell as the primary agent interface.
- Trusting a model-generated statement that an action is authorized.
- Direct provider API credentials in agent context.
- Retrofitting audit records after an external action completes.

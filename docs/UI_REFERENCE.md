# Phase 3 UI Reference Contract

## Approved source

| Item | Approved value |
| --- | --- |
| Product owner approval | Supplied and approved in the Phase 3 handoff on 2026-08-10 |
| Lovable project | `https://lovable.dev/projects/e5155d85-06bc-46e7-8f9a-5b2b0ba5c319` |
| Source repository | `https://github.com/mishrarishav/neural-command-lab` |
| Provider repository ID | `1329600731` |
| Visibility | Private |
| Default branch | `main` |
| Approved commit | `85f3ba2271ba381fc0520108365c5bb48fe386a7` |
| UI implementation parent | `abe5ded45ec3d8888e442f22387c7080280de9cb` |
| Reference role | Experience and visual contract only |

The approved commit is immutable evidence. Later changes in Lovable or on the
reference repository's default branch do not change this contract. Adopting a
new reference requires a new exact commit and an explicit contract update.

## Trust and ownership boundary

The reference is prototype input, not production source or an authority over
FrevOS architecture. FrevOS owns its web application, routing, accessibility,
testing, dependency policy, authentication boundary, state, APIs,
authorization, persistence, audit, and deployment behavior.

The Phase 3 implementation uses deterministic local demonstration data. It
must display that status and must not claim that a real repository, task,
approval, agent, check, release, or deployment action occurred. It has no
network client, credential handling, Production action, or durable storage.

## Experience principles

The approved experience is a calm, evidence-first "Neural Command OS":

- an operating system for controlled AI-assisted work, not a chat clone, code
  editor, generic admin dashboard, or decorative science-fiction interface;
- compact, legible information density with clear hierarchy;
- proposals, approvals, active operations, verified results, and failures are
  visually and textually distinct;
- agent identities are restrained glyphs and status signals, not characters;
- audit IDs, source SHAs, artifact digests, and tool output use monospace text;
- motion communicates activity or panel state and respects reduced motion;
- color reinforces a written status but never carries meaning alone.

## Screen contract

The approved reference defines the following route vocabulary:

| Route | Surface | Roadmap ownership |
| --- | --- | --- |
| `/` | Control Center and command surface | Phase 3 shell |
| `/design-system` | Tokens, components, responsive examples, and state gallery | Phase 3 design system |
| `/onboarding` | Repository connection flow | Phase 5 behavior |
| `/projects/frevos` | Project command center | Phase 4/5 behavior |
| `/projects/frevos/intelligence` | Repository intelligence | Phase 5/12 behavior |
| `/tasks/task-184` | Live agent run | Phase 7/8 behavior |
| `/qa/runs/qa-482` | Independent QA evidence | Phase 8 behavior |
| `/reviews/pr-12` | Change review | Phase 8 behavior |
| `/releases` | Releases and immutable artifacts | Phase 9 behavior |
| `/deployments/deploy-72` | Deployment control | Phase 10/11 behavior |
| `/approvals` | Sensitive-action inbox | Phase 4/6 behavior |
| `/audit` | Correlated audit explorer | Phase 4/6 behavior |
| `/agents` | Controlled agent roster | Phase 7 behavior |
| `/integrations` | Provider and service integrations | Provider-specific phases |

Phase 3 implements the global shell, Control Center, design-system surface, and
honest planned-surface destinations for later route vocabulary. A planned
surface must identify its owning phase and may not simulate protected behavior.
The later phases replace these destinations with authorized, tested product
flows without changing the shared shell contract silently.

## Global shell contract

Desktop includes:

- a thin system bar with the FrevOS identity, workspace switcher, system state,
  running-work indicator, notifications affordance, and user/state menu;
- a left rail for Control Center, Projects, Agents, QA, Reviews, Releases,
  Deployments, Approvals, Audit, and Integrations;
- an adaptive main workspace;
- an optional right Agent Activity dock with status filtering;
- a persistent Ask FrevOS composer with context, attachment, voice placeholder,
  risk indication, and Run action;
- a global command palette opened with `Control+K` or `Command+K`;
- a visible `Phase 3 shell · Demonstration data` disclosure.

Mobile includes:

- a compact top bar and a fixed bottom navigation;
- a thumb-reachable Ask FrevOS action and full-width composer sheet;
- full-screen overlays for command navigation, state examples, and agent
  activity;
- cards and controls that reflow rather than compress desktop columns.

## Phase 3 interaction states

The bounded shell supports:

- client-side route navigation with back and forward history;
- keyboard and pointer command-palette navigation;
- workspace switching within demonstration data;
- opening, closing, and filtering Agent Activity;
- opening and closing the mobile composer;
- command submission that produces a clearly simulated local receipt;
- a reusable state gallery for loading, empty, offline, denied, failed, and
  approval-expired states;
- all primary Phase 3 buttons either navigate, open a surface, change visible
  local state, or produce a simulated receipt.

No Phase 3 interaction invokes an external system or persists across reloads.

## Design tokens

The production-owned tokens preserve the reference's semantic language:

| Token family | Contract |
| --- | --- |
| Canvas | Near-black obsidian with a faint 48px technical grid |
| Surfaces | Three graphite elevation levels with subtle one-pixel borders |
| Signal | Electric cyan for active intelligence and focus |
| Orchestration | Violet for agent coordination |
| Verified | Green for verified success |
| Approval | Amber for warnings and explicit approval boundaries |
| Failure | Red only for failed or destructive states |
| Neutral | Muted blue-grey for inactive or secondary state |
| Typography | System sans stack plus system monospace stack |
| Spacing | 4px base with an 8px primary rhythm |
| Radius | 10px controls and 12px panels |
| Elevation | Restrained inset highlight and deep soft shadow |
| Motion | 160–240ms transitions and a low-frequency activity pulse |

Colors use OKLCH custom properties. Focus indication, contrast, status labels,
and reduced-motion behavior are part of the token contract.

## Phase 3 acceptance criteria

Phase 3 is ready for review only when:

1. the application builds from the monorepo with exact dependencies and the
   frozen lockfile;
2. the Control Center, design-system route, planned route vocabulary, command
   palette, activity dock, workspace switcher, composer, and state gallery work;
3. desktop and mobile navigation are structurally different at the approved
   breakpoint and no horizontal page overflow is introduced;
4. semantic landmarks, labelled controls, keyboard access, visible focus, and
   reduced-motion behavior are present;
5. demonstration data and simulated outcomes are visibly disclosed;
6. no network, authentication, persistence, provider SDK, secret, or protected
   action implementation is present;
7. repository validation, formatting, linting, type checking, unit coverage,
   production build, dependency audit, and complete diff review pass.

Browser-level product acceptance remains separate. It can be added to
`FrevOS-Acceptance` only after the production shell is merged and an authorized
Preview or UAT target exists.

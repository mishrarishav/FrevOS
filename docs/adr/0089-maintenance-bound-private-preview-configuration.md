# ADR 0089: Private preview configuration after verified maintenance activation

Status: Accepted implementation detail of the owner's approved software/VPN task.
Extends ADR 0075's configuration operator; does not replace its publication path.

The current Server20 platform is activated through authenticated DevSetu
maintenance. Its successful activation has a sealed candidate, an actor-bound
request, a consumed updater claim and matching native Apply/result receipts.
It does not have a component publication run. Do not invent one or claim a
prepared-artifact activation was a source-to-deploy pipeline.

Retain the existing v1 component-run authority. Add a strict v2 configuration
intent bound to the exact active manifest and actual maintenance candidate,
request, consumed claim and successful native receipt. Verify all identities
and the signed-in requester before any write. The new configuration intent
still expires within ten minutes and is consumed once, with retained preimages
and recovery. No generic command, process or task selector is introduced.

Only the selected private relay configuration child and reviewed compatibility
guard may change. Existing task definitions, runtime values, enrollment bytes,
parent permissions and databases remain unchanged. No DNS/firewall mutation
is included. The live origin must resolve over the VPN and be reachable before
claiming two-laptop acceptance. New Production activation retains its separate
exact-artifact human approval.

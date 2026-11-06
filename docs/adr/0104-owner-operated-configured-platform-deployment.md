# ADR 0104: Owner-operated configured platform deployment

Status: Accepted for the owner's 2026-11-06 local-validation and final-deployment
instruction. Supersedes the activation portion of the current ADR0102 operator
task; its data, pairing, consent and OS-permission boundaries remain effective.

Complete implementation and local validation. Do not activate a release on
Server20, replace a live connector or change T-Server routing in this task.
The owner performs final deployment through DevSetu.

Expose the existing configured source-publication, CI/build and independent native
activation pipeline from a persistent project deployment workspace. Use enrolled
configuration, verified source/destination identities, authenticated actor,
declared change/approval, integrity, audit and persistent-path protections.
Opening the workspace must not submit work. The final owner confirmation is the
deploy action; do not create a second unguarded pipeline or silently select a
prepared release in place of current source.

Unconfigured legacy platform entries offer configuration and an honestly labelled
prepared-release fallback. A prepared artifact cannot be described as an automatic
source-to-deploy pipeline. Existing `/maintenance` activation remains compatible.

T-Server is the existing gateway to the Server20 application. Updating that
application changes both entry points; it is not a second application copy or an
atomic deployment to two servers. Gateway/WAF changes are separately configured
infrastructure and must not be implied by an application deployment result.

Keep current live deployment and data unchanged during local tests. Report local
browser fixtures, actual OS reads, native mutation authority and Android device
acceptance separately. Full release gates remain required when the owner creates
the final immutable release; a timed-out integration test is not a passing gate.

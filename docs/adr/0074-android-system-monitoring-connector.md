# ADR 0074: Android system monitoring connector

Status: Accepted for the owner's explicit follow-on goal, 2026-10-29.

## Scope and dependency

The owner explicitly requests completing the duplicate/last-seen correction and
then an installable Android connector that appears Online with Last seen. This
authorizes a bounded Phase 4 Android monitoring pilot, stacked on the preceding
configured Discovery correction source 969b8f4344882cb5e3fff9966a75968a0902ffb5
in codex/android-system-connector. It does not claim an unmerged roadmap phase
has exited. Retain source/destination independence and all existing user/admin
boundaries. Windows/Linux enrollment and customer applications must keep working.

## Decision

Provide an installable native Java APK using Android platform APIs, Android 8+
on ARM64/x64, with configurable server origin and explicit monitoring consent.
Reuse manually approved join codes and admin-approved system enrollment. No
administrator password, project checkout or hardcoded server address is required.
Use app-private, Android Keystore encrypted identity; exclude backups and keep
the signing identity outside source/artifacts. Preserve paired identity on app
updates. Do not persist passwords, display device credentials or log request bodies.

For display grouping, hash the Android 8+ signing-key/user/device-scoped Android ID
again with the configured server origin; never transmit the raw ID. If unavailable,
persist a random pairing identifier. This helps associate a reinstall on the same
Android user/device while retaining every connection and authorization boundary.
Factory reset, Android-user changes or signing-key changes can change identity;
do not merge known collisions by a display name. See the official
[Android ID reference](https://developer.android.com/reference/android/provider/Settings.Secure#ANDROID_ID).

Android is system-monitoring only: authenticated heartbeat, OS, RAM, private
app-volume available capacity, uptime and battery. System-wide CPU is unavailable
when Android does not expose a reliable API. Do not claim all-app/private-file
access, code execution, project deployment, file collection or desktop tools.
Reject these unsupported scopes at server and UI boundaries. Existing role and
workspace checks apply to every Android connection, not just presentation.

Monitoring starts from an explicit visible app action, has an ongoing foreground
notification with Stop, and reports connection status/retry in the app. Android
14+ uses a declared specialUse service with its enterprise device-monitoring
purpose. Never acquire device-admin/root, force battery exemptions, bypass
notification choices or claim guaranteed execution after OS/user termination.
Stop and network loss naturally make presence stale; retained server receipt
time supplies Last seen. No background location, microphone, camera, contacts,
SMS or broad storage permissions are needed. Google Play distribution is separate
from this internal APK pilot and requires its own policy review.

HTTPS uses the system trust store. The owner-retained private HTTP pilot requires
an explicit local opt-in; public HTTP and redirects are denied. Browser pairing
proof, where supported, must preserve the existing original-browser and receiver
cookies, one-use challenge and deliberate loopback confirmation. Pairing alone
never bypasses the ordinary-user login requirement.

Builds use pinned official SDK/JDK inputs and an operator-configured signing
reference. SDK license acceptance and creation of a new retained signing key
need owner confirmation at their execution boundary. Never forge SDK acceptance
files or ship an unsigned/debug APK as an approved installer. The platform release
records the signed APK bytes/digest and publishes the same APK as its download.

## Verification

Exercise Android approved-code and manual enrollment, platform/consent binding,
credential isolation, ordinary-user own-only data, fresh/stale/last-seen behavior,
unsupported control denials, and Windows/Linux regression cases. Compile and
verify APK manifest, signature, permissions and packaged source identity; use an
actual Android runtime for install/start/stop/update/network-loss acceptance.
An emulator proves only that runtime, not every phone/OEM background policy.
Retain unverified devices and infrastructure blockers explicitly in the handoff.

References: [Android service types](https://developer.android.com/develop/background-work/services/fgs/service-types),
[background starts](https://developer.android.com/develop/background-work/services/fgs/restrictions-bg-start),
[SDK terms](https://developer.android.com/studio#terms-and-conditions).

## Execution checkpoint, 2026-10-29

The preceding Discovery correction retry is live at
1d859f6e2c6b324bc73186f0516a1bb59a711b45; the Android branch fast-forwards to that
completed correction, retaining the earlier base above as history. The owner
explicitly accepts SDK terms and chooses Server20. The separate SDK worker is
observed non-admin and READY at E:\DevSetuAndroid. An unsigned prototype compiles
with verified official SDK inputs. New signing-key creation is separately pending
owner approval; no private key, installable signed APK or live Android connection
is claimed. Detailed evidence remains in the Android handoff.

Persist the platform capability only for the new Android identity. Ordinary
Windows/Linux enrollments keep their previous strict-record shape. Pre-Android
bundles cannot interpret new Android enrollment/observation enum values. The
installed native operator checks the current and candidate source inventories
before activation, rejecting a downgrade across that data-compatibility boundary.
Use a compatible saved bundle for recovery; never delete Android records to make
an older parser pass. The guard and actual compatible recovery still need their
recorded acceptance results before claiming release readiness.

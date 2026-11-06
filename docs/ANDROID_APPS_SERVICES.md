# Android apps and connector-owned services

ADR0103 extends the desktop apps/services task to the Android connector. All
changes here are local; the owner will perform final deployment. The existing
Server20 app, signed APK, signing identity, pairings, data and environment have not
been changed by this implementation.

The Android app has separate optional inventory and service-control checkboxes,
initially off on existing installations. Save these locally after updating the
APK. While user-started monitoring runs, the authenticated software job path
collects the current Android user's installed-package metadata. The UI labels
package IDs and user/system apps, retains the previous successful snapshot, and
does not offer a desktop installation catalogue for Android. Other users/work
profiles, APK contents and arbitrary third-party service state/control are outside
Android's supported app permissions and are not claimed.

The Services list contains DevSetu's protected foreground connection and its own
non-exported health-sampling service. An administrator may explicitly allow the
sampling service once and issue typed Start/Stop jobs after local control opt-in.
The definition pins the package signing certificate digests, version and exact
component. Role, workspace, device, definition, policy revision, consent and
single-use authorization remain enforced. Stop sampling pauses new health
observations while heartbeat and paired sign-in continue. Local Stop monitoring
stops the whole connector. Android may stop the app; remote Start cannot resume
a force-stopped or OS-restricted process. Open the Android app to resume it.

Local verification on 2026-11-06 IST:

- All nine production Java sources compile against the approved Android API36
  platform/lambda jars, using source8/target8 and a pinned official Temurin21
  compiler container. SDK jars were copied read-only; no server SDK/build changed.
- The actual platform-independent Android execution policy passes 21 JVM fixtures
  generated with the shared contracts, covering digest serialization, valid read
  and control jobs, revoked consent, wrong scope/identity, changed app definition,
  expiry, consumed approval, extra arguments and unsupported operations. The JSON
  JVM library is test-only and is not included in the APK.
- The server's real in-process software queue/RBAC tests pass Android inventory
  and own-service control/denial paths. These tests do not execute Android services.
- No Android phone/emulator lifecycle acceptance or signed APK build is claimed.
  The existing signed APK has not been replaced. Java compilation is not an APK
  signature, install, foreground/background or battery-policy acceptance result.

To repeat local compile/policy verification, build contracts, place the verified
public platform/lambda/test-JSON jars in a local cache, then run
`scripts/test-android-software.ps1 -SdkCache <cache>`. The script verifies pinned
hashes, uses network-disabled containers, retains a bounded local evidence folder
and changes no live device or server. Compiler image and expected dependency
hashes are explicit parameters.

Before a later signed release, update the configured Android builder operator
through its normal reviewed hash-enrollment procedure. Its exact source inventory
now includes AndroidSoftware, AndroidSoftwarePolicy and HealthSamplingService;
its manifest permission allowlist adds QUERY_ALL_PACKAGES for this internal
enterprise inventory use. Do not bypass that operator guard. Build/sign with the
existing retained signing key; manifest versionCode3/versionName1.2.0 permits an
in-place APK update that preserves the existing Keystore pairing. Test that update
and local consent/Start/Stop behavior on a real Android device before claiming
phone acceptance. Google Play publication needs a separate policy review.

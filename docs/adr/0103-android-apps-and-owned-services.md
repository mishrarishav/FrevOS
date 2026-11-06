# ADR 0103: Android apps and connector-owned service management

Status: Accepted for the owner's 2026-11-06 explicit Windows/Linux/Android scope.
Supersedes ADR 0074's health-only software exclusion and extends ADR 0102 only
for Android apps and the connector's own services. Phase 4 remains open.

Use Android's public PackageManager APIs to report bounded installed-package
metadata for the current Android user, under a separate optional local inventory
opt-in. Request QUERY_ALL_PACKAGES for this internal enterprise inventory APK;
other Android users/work profiles, APK/file contents and app usage are excluded.
Google Play publication is separate and requires its own policy review.

Android does not provide a supported global third-party running-services manager
to an ordinary app. Show only two known DevSetu components: the protected
foreground connection service, and the app's non-exported HealthSamplingService.
The sampling service collects the same already-consented health data. Its Stop
pauses fresh health samples while the authenticated foreground connection and
paired sign-in continue. Start resumes that exact component; no caller-supplied
component, package, intent, command or argument is accepted. Local Stop monitoring
continues to stop the whole connector. Android may terminate/restrict the process;
remote Start cannot resurrect a force-stopped app. Display stale data honestly.

Controls require their own one-time local opt-in, an administrator role, the
existing versioned per-device allowed-service rule, a fresh snapshot and an exact
typed five-minute authorization. Bind the definition to the app package, signing
certificate digests, version and fixed component. Revalidate before the native
Start/Stop call. Persist private at-most-once receipts before mutation, reconcile
uncertain outcomes without repeating a mutation, and prune only acknowledged
expired receipts. Existing Keystore pairing and install permissions remain intact;
Android catalogue installation, root/device-admin, hidden APIs and arbitrary
third-party control remain unsupported.

Validate schemas, actual server queues/RBAC and source compilation against the
approved SDK. Report phone lifecycle/OS policy acceptance separately; Java
compilation and protocol fixtures do not prove a phone's background behavior.
The owner will perform final deployment. No Server20 activation or live-device
permission change is authorized by this local implementation step.

Primary references: [package visibility](https://developer.android.com/training/package-visibility/declaring),
[PackageManager](https://developer.android.com/reference/android/content/pm/PackageManager),
[running services restrictions](https://developer.android.com/reference/android/app/ActivityManager#getRunningServices(int)),
[background execution limits](https://developer.android.com/about/versions/oreo/background),
[service lifecycle](https://developer.android.com/reference/android/app/Service).

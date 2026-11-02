"use strict";
const { context } = require("./SystemLinuxInstaller.cjs");
async function setup(options = {}) {
  const adapter = context(options);
  await adapter.preflight();
  return require("./DeviceEnrollment.cjs").serve({
    ...options,
    ...adapter,
    notificationConsent: async (input) => {
      if (input.enabled) throw Error("linux-notifications-not-supported");
    },
    notificationsSupported: false,
  });
}
if (require.main === module)
  setup()
    .then((session) =>
      process.stdout.write(
        "DevSetu system setup is ready. No administrator password or project is required.\nOpen this private local page if the browser did not open:\n" +
          session.pageUrl +
          "\n",
      ),
    )
    .catch(() => {
      process.stderr.write(
        "DevSetu system setup could not start. Run as your desktop user, check the user systemd/cgroup-v2 service manager and the supported Linux x64 runtime. Existing projects are preserved.\n",
      );
      process.exitCode = 1;
    });
module.exports = { setup };

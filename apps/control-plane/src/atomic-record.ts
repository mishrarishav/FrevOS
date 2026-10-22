import { rename } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";

// Windows scanners can briefly hold a file without FILE_SHARE_DELETE. Retry
// only the atomic replacement of the already fsynced record, never the action.
export async function replaceDurableRecord(source: string, target: string) {
  for (let attempt = 0; ; attempt++) {
    try {
      await rename(source, target);
      return;
    } catch (error) {
      if (
        process.platform !== "win32" ||
        attempt >= 5 ||
        !["EPERM", "EACCES", "EBUSY"].includes((error as NodeJS.ErrnoException).code ?? "")
      )
        throw error;
      await delay(25 * 2 ** attempt);
    }
  }
}

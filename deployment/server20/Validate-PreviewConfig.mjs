import { validatePreviewConfig } from "../../apps/control-plane/dist/preview-relay.js";
let text = "";
for await (const bytes of process.stdin) {
  text += bytes.toString("utf8");
  if (Buffer.byteLength(text) > 32768) throw Error("preview-configuration-capacity");
}
const input = JSON.parse(text);
if (Object.keys(input).sort().join() !== "config,portal")
  throw Error("preview-validation-envelope");
const config = await validatePreviewConfig(input.config, input.portal);
process.stdout.write(JSON.stringify(config));

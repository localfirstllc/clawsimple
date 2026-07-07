import { readFileSync } from "fs";

const scriptUrl = new URL("./install-bot.sh", import.meta.url);

export function getInstallScript() {
  // Read on each request so script edits are picked up without process restart.
  return readFileSync(scriptUrl, "utf8");
}

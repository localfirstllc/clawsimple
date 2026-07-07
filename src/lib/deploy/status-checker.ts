import { spawn } from "child_process";
import fs from "fs/promises";
import path from "path";

export async function checkDeploymentStatusSSH(
  serverIp: string
): Promise<"completed" | "running" | "failed" | "unknown"> {
  // Validate IP address format to prevent command injection
  const ipv4Regex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
  const ipv6Regex = /^(([0-9a-fA-F]{1,4}:){7,7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:)|fe80:(:[0-9a-fA-F]{0,4}){0,4}%[0-9a-zA-Z]{1,}|::(ffff(:0{1,4}){0,1}:){0,1}((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])|([0-9a-fA-F]{1,4}:){1,4}:((25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9])\.){3,3}(25[0-5]|(2[0-4]|1{0,1}[0-9]){0,1}[0-9]))$/;

  if (!ipv4Regex.test(serverIp) && !ipv6Regex.test(serverIp)) {
    console.error(`Invalid IP address format: ${serverIp}`);
    return "unknown";
  }
  const privateKeyB64 = process.env.STATUS_CHECKER_PRIVATE_KEY_B64;
  if (!privateKeyB64) {
    console.warn("STATUS_CHECKER_PRIVATE_KEY_B64 not configured");
    return "unknown";
  }

  // Convert Base64 private key to string
  let privateKey = "";
  try {
    privateKey = Buffer.from(privateKeyB64, "base64").toString("utf8");
  } catch (error) {
    console.error("Failed to decode STATUS_CHECKER_PRIVATE_KEY_B64", error);
    return "unknown";
  }

  // Write private key to a temporary file securely
  const tmpDir = process.env.TMPDIR || "/tmp";
  const keyFile = path.join(tmpDir, `status_key_${Date.now()}_${Math.random().toString(36).slice(2)}`);
  
  try {
    // Set strictly restricted permissions (600) for the key file
    await fs.writeFile(keyFile, privateKey, { mode: 0o600 });

    const result = await new Promise<string>((resolve) => {
      // Use ssh to execute the forced command (which ignores our command and runs status-check.sh)
      // StrictHostKeyChecking=no is needed because we don't know the host key yet
      const ssh = spawn("ssh", [
        "-i", keyFile,
        "-o", "StrictHostKeyChecking=no",
        "-o", "UserKnownHostsFile=/dev/null",
        "-o", "ConnectTimeout=10",
        "-o", "BatchMode=yes", // Disable password entry
        `root@${serverIp}`,
        "status-check" // This command is ignored due to forced command, but required by syntax
      ]);

      let stdout = "";
      let stderr = "";

      ssh.stdout.on("data", (data) => {
        stdout += data.toString();
      });

      ssh.stderr.on("data", (data) => {
        stderr += data.toString();
      });

      ssh.on("close", (code) => {
        if (code === 0 && stdout.includes("STATUS:COMPLETED")) {
          resolve("completed");
        } else if (stdout.includes("STATUS:FAILED")) {
          resolve("failed");
        } else if (stdout.includes("STATUS:RUNNING")) {
          resolve("running");
        } else {
          // If we can't connect yet (e.g. sshd not started), it might fail
          // or output nothing. Treat as unknown/running.
          if (stderr.length > 0) {
            // console.warn(`SSH Status Check Error for ${serverIp}: ${stderr}`);
          }
          resolve("unknown");
        }
      });

      ssh.on("error", () => {
        // console.error(`SSH Spawn Error for ${serverIp}:`, err);
        resolve("unknown");
      });
    });

    return result as "completed" | "running" | "failed" | "unknown";
  } catch (error) {
    console.error("SSH Check Execution Error:", error);
    return "unknown";
  } finally {
    // Always clean up the key file
    await fs.unlink(keyFile).catch(() => {});
  }
}

export function getStatusCheckerPublicKey(): string | undefined {
  return process.env.STATUS_CHECKER_PUBLIC_KEY;
}

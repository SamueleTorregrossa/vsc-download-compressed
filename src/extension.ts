import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ------------------ UTILITY FUNCTIONS ------------------ //

/**
 * Checks if rsync is installed and meets the minimum required version.
 * @param minVersion Minimum rsync version required.
 * @returns Promise resolving to true if rsync is installed and sufficient, else false.
 */
function checkRsyncVersion(minVersion: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec("rsync --version", (error, stdout) => {
      if (error) {
        // rsync is not installed
        resolve(false);
      } else {
        // Parse version from stdout
        const versionMatch = stdout.match(/rsync\s+version\s+(\d+\.\d+\.\d+)/i);
        if (versionMatch) {
          const installedVersion = versionMatch[1];
          const isVersionSufficient =
            compareVersions(installedVersion, minVersion) >= 0;
          resolve(isVersionSufficient);
        } else {
          // Could not parse version
          resolve(false);
        }
      }
    });
  });
}

/**
 * Compares two version strings.
 * Returns 1 if v1 > v2, -1 if v1 < v2, or 0 if equal.
 */
function compareVersions(v1: string, v2: string): number {
  const v1parts = v1.split(".").map(Number);
  const v2parts = v2.split(".").map(Number);

  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const num1 = v1parts[i] ?? 0;
    const num2 = v2parts[i] ?? 0;
    if (num1 > num2) {return 1;}
    if (num1 < num2) {return -1;}
  }
  return 0;
}

/**
 * Installs rsync using Homebrew (macOS) or apt-get (Linux).
 * @returns Promise that resolves when rsync is installed.
 */
function installRsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    let installCommand = "";
    if (os.platform() === "darwin") {
      installCommand = "brew install rsync";
    } else if (os.platform() === "linux") {
      installCommand = "sudo apt-get install -y rsync";
    } else {
      return reject(
        new Error("Unsupported OS for automatic rsync installation.")
      );
    }

    exec(installCommand, (error, stdout, stderr) => {
      if (error) {
        reject(
          new Error(
            `Failed to install rsync: ${stderr}, please install manually.`
          )
        );
      } else {
        resolve();
      }
    });
  });
}

/**
 * Parses the remote name from the authority string.
 * The authority might be a plain hostname or a hex-encoded JSON object
 * as used by Cursor.
 * @param authority The authority string after "ssh-remote+"
 * @returns The actual hostname/remote name (e.g., "user@host" or "host")
 */
function parseRemoteName(authority: string): string {
  // Check if authority contains hex-encoded "hostName" (686f73744e616d65)
  // Cursor encodes connection info as hex JSON like:
  // "7b22686f73744e616d65223a22686f7374227d" -> {"hostName":"host"}
  if (authority.includes('686f73744e616d65')) {
    const decoded = Buffer.from(authority, 'hex').toString('utf8');
    const parsed = JSON.parse(decoded);
    return parsed.user ? `${parsed.user}@${parsed.hostName}` : parsed.hostName;
  }
  return authority;
}

/**
 * Tests if passwordless SSH is configured for the remote by attempting
 * an SSH connection with BatchMode=yes (i.e., no password prompts).
 * @param remoteName Remote server identifier (e.g., user@host).
 * @returns Promise resolving to true if SSH is passwordless, else false.
 */
function testPasswordlessSSH(remoteName: string): Promise<boolean> {
  return new Promise((resolve) => {
    const testCommand = `ssh -o BatchMode=yes "${remoteName}" exit`;
    exec(testCommand, (error) => {
      if (error) {
        // Non-zero exit could be from permission denied or host not found
        resolve(false);
      } else {
        resolve(true);
      }
    });
  });
}

// ---------------- EXTENSION ENTRY POINT ---------------- //

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Fast Download");

  const downloadDisposable = vscode.commands.registerCommand(
    "extension.compress_download",
    async (fileUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
      // 0) On Windows, bail out
      if (os.platform() === "win32") {
        vscode.window.showInformationMessage(
          "Windows is not supported by Fast Download."
        );
        return;
      }

      // 1) Ensure the extension is running in a remote workspace
      const folder = vscode.workspace.workspaceFolders?.[0];
      outputChannel.show(true);
      outputChannel.appendLine(`Workspace folder: ${folder?.uri.toString()}`);

      if (!folder || folder.uri.scheme !== "vscode-remote") {
        vscode.window.showErrorMessage(
          "No remote SSH workspace detected. Please open a remote SSH workspace before using Fast Download."
        );
        return;
      }

      // 2) Parse the remote host name (e.g., "ssh-remote+user@host")
      const remoteAuthorityEncoded = folder.uri.authority;
      const remoteAuthority = decodeURIComponent(remoteAuthorityEncoded);
      const match = remoteAuthority.match(/ssh-remote\+(.+)/);
      if (!match) {
        vscode.window.showErrorMessage(
          "Could not determine remote host. Please ensure you are connected via SSH."
        );
        return;
      }
      const remoteName = parseRemoteName(match[1]); // Parse hex-encoded JSON or plain "user@host"

      // 3) Which files do we want to download?
      const uriList = selectedUris || [fileUri];
      if (!uriList.length) {
        vscode.window.showErrorMessage("No files to download.");
        return;
      }

      // 4) Check environment every time: rsync & passwordless SSH
      try {
        await vscode.window.withProgress(
          {
            location: vscode.ProgressLocation.Notification,
            title: "Preparing Fast Download...",
            cancellable: false,
          },
          async (progress) => {
            progress.report({ increment: 0, message: "Checking rsync..." });

            // 4a) Check if rsync is installed and >= 3.0.0
            const minRsyncVersion = "3.0.0";
            const rsyncOk = await checkRsyncVersion(minRsyncVersion);
            if (!rsyncOk) {
              // Prompt to install rsync
              const choice = await vscode.window.showWarningMessage(
                "rsync is missing or outdated. Install it now?",
                "Yes",
                "No"
              );
              if (choice === "Yes") {
                try {
                  await installRsync();
                  vscode.window.showInformationMessage(
                    "rsync installed successfully."
                  );
                } catch (err: any) {
                  vscode.window.showErrorMessage(err.message);
                  throw new Error("rsync installation failed.");
                }
              } else {
                throw new Error("rsync is required for Fast Download.");
              }
            } else {
              outputChannel.appendLine("rsync is already installed.");
            }

            // 4b) Check passwordless SSH
            progress.report({ increment: 40, message: "Testing SSH auth..." });
            const sshTest = await testPasswordlessSSH(remoteName);
            if (!sshTest) {
              // Provide instructions for key-based auth
              const choice = await vscode.window.showWarningMessage(
                `Passwordless SSH is not configured for ${remoteName}. View setup instructions?`,
                "Yes",
                "No"
              );
              if (choice === "Yes") {
                // Determine whether a local SSH key already exists
                const localKeyPath = path.join(os.homedir(), ".ssh", "id_rsa");
                let instructions: string;

                if (fs.existsSync(localKeyPath)) {
                  // Only show the steps for copying the key if it exists
                  instructions = `
SSH Key Setup Instructions
--------------------------
1) Copy your existing *public* key to the remote server:
   ssh-copy-id -i ~/.ssh/id_rsa.pub ${remoteName}

2) Verify by SSH’ing to the remote:
   ssh ${remoteName}
`;
                } else {
                  // Show the full steps, including key generation
                  instructions = `
SSH Key Setup Instructions
--------------------------
1) Generate a key pair (if you don't already have one):
   ssh-keygen -t rsa -b 4096 -f ~/.ssh/id_rsa -N ""

2) Copy your public key to the remote server:
   ssh-copy-id -i ~/.ssh/id_rsa.pub ${remoteName}

3) Verify by SSH’ing to the remote:
   ssh ${remoteName}
`;
                }

                // Show instructions in the output channel
                outputChannel.clear();
                outputChannel.appendLine(instructions);
                outputChannel.show(true);

                // Copy instructions to clipboard
                vscode.env.clipboard.writeText(instructions);

                vscode.window.showInformationMessage(
                  "SSH setup instructions have been posted in the output channel and copied to clipboard."
                );
              }
              throw new Error(
                "Passwordless SSH is required for Fast Download."
              );
            } else {
              outputChannel.appendLine(
                "Passwordless SSH is already configured."
              );
            }
          }
        );
      } catch (err: any) {
        // If rsync or SSH checks fail, we abort the download
        vscode.window.showErrorMessage(
          `Environment check failed: ${err.message}. Please resolve the issue and try again.`
        );
        return;
      }

      // 5) At this point, we have verified rsync & passwordless SSH
      //    Prompt for a local download destination
      const defaultDownloadLocation = vscode.workspace
        .getConfiguration("fastDownload")
        .get<string>("defaultDownloadLocation");

      const destinationPath =
        defaultDownloadLocation ||
        (await vscode.window.showInputBox({
          prompt: "Enter the local destination path",
          value: path.join(os.homedir(), "Downloads"),
        }));

      if (!destinationPath) {
        vscode.window.showErrorMessage("No destination path provided.");
        return;
      }

      // 6) Construct the rsync command
      const remoteFiles = uriList.map((uri) => {
        return `"${remoteName}:${uri.path}"`;
      });
      const command = `rsync -P -avz -e "ssh -o BatchMode=yes" ${remoteFiles.join(
        " "
      )} "${destinationPath}"`;

      // 7) Execute rsync
      outputChannel.show(true);
      outputChannel.clear();
      outputChannel.appendLine(`Remote files: ${remoteFiles.join(" ")}`);
      outputChannel.appendLine(`Running: ${command}`);

      exec(command, (error, stdout, stderr) => {
        if (error) {
          if (
            stderr.includes("Permission denied") ||
            stderr.includes("Authentication failed")
          ) {
            vscode.window
              .showErrorMessage(
                "Passwordless SSH authentication failed. Please re-check your SSH setup.",
                "Setup Guide"
              )
              .then((selection) => {
                if (selection === "Setup Guide") {
                  vscode.env.openExternal(
                    vscode.Uri.parse("https://www.ssh.com/academy/ssh/keygen")
                  );
                }
              });
          } else {
            vscode.window.showErrorMessage(
              `rsync failed: ${stderr}. Please check the output for more details.`
            );
          }
          return;
        }

        // Success
        outputChannel.appendLine(stdout);
        vscode.window.showInformationMessage(
          `Download complete. Files saved to: ${destinationPath}`
        );
      });
    }
  );

  context.subscriptions.push(downloadDisposable);
  context.subscriptions.push(outputChannel);
}

export function deactivate() {}

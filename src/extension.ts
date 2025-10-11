import * as vscode from "vscode";
import { exec } from "child_process";
import * as path from "path";
import * as os from "os";
import * as fs from "fs";

// ------------------ UTILITY FUNCTIONS ------------------ //

/**
 * Checks if rsync is installed and meets the minimum required version.
 * On Windows, checks for scp availability instead.
 * @param minVersion Minimum rsync version required (ignored on Windows).
 * @returns Promise resolving to true if rsync/scp is available, else false.
 */
function checkRsyncVersion(minVersion: string): Promise<boolean> {
  return new Promise((resolve) => {
    const platform = os.platform();

    if (platform === "win32") {
      // On Windows, assume scp is available (built-in with Windows 10/11 OpenSSH)
      resolve(true);
    } else {
      // On macOS and Linux, check rsync
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
    }
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
    if (num1 > num2) { return 1; }
    if (num1 < num2) { return -1; }
  }
  return 0;
}

/**
 * Installs rsync using Homebrew (macOS), apt-get (Linux), or suggests OpenSSH for Windows.
 * @returns Promise that resolves when rsync is installed or instructions are provided.
 */
function installRsync(): Promise<void> {
  return new Promise((resolve, reject) => {
    const platform = os.platform();

    if (platform === "darwin") {
      const installCommand = "brew install rsync";
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
    } else if (platform === "linux") {
      const installCommand = "sudo apt-get install -y rsync";
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
    } else {
      reject(
        new Error("Unsupported OS for automatic installation.")
      );
    }
  });
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

/**
 * Gets the SSH key path based on the current platform.
 * @returns SSH key directory path
 */
function getSSHKeyPath(): string {
  return path.join(os.homedir(), ".ssh", "id_rsa");
}

// ---------------- EXTENSION ENTRY POINT ---------------- //

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Fast Download");

  const downloadDisposable = vscode.commands.registerCommand(
    "extension.compress_download",
    async (fileUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
      // 1) Ensure the extension is running in a remote workspace
      const folder = vscode.workspace.workspaceFolders?.[0];
      // outputChannel.show(true);
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
      const remoteName = match[1]; // "user@host"

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
            progress.report({ increment: 0, message: "Checking transfer tools..." });

            // 4a) Check if rsync/scp is available
            const minRsyncVersion = "3.0.0";
            const transferOk = await checkRsyncVersion(minRsyncVersion);
            const platform = os.platform();
            const toolName = platform === "win32" ? "SCP" : "rsync";
            if (!transferOk) {
              // Prompt to install transfer tool
              const installMsg = "rsync is missing or outdated. Install it now?";

              const choice = await vscode.window.showWarningMessage(
                installMsg,
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
              outputChannel.appendLine(`${toolName} is already available.`);
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
                const localKeyPath = getSSHKeyPath();
                const keyExists = fs.existsSync(localKeyPath);

                let instructions: string;
                if (keyExists) {
                  // Key exists but SSH auth failed - likely a configuration issue
                  instructions = `
                  SSH Troubleshooting (Key exists but authentication failed)
                  --------------------------------------------------------
                  Your SSH key exists at: ${localKeyPath}

                  Possible issues:
                  1) Key not copied to remote server:
                    - Copy your public key to the remote server using one of these methods:
                    
                    CMD: type %USERPROFILE%\\.ssh\\id_rsa.pub | ssh ${remoteName} "cat >> ~/.ssh/authorized_keys"
                    PowerShell: Get-Content ~\\.ssh\\id_rsa.pub | ssh ${remoteName} "cat >> ~/.ssh/authorized_keys"
                    Git Bash: ssh-copy-id -i ~/.ssh/id_rsa.pub ${remoteName}

                  2) Check remote server permissions:
                    ssh ${remoteName} "chmod 700 ~/.ssh && chmod 600 ~/.ssh/authorized_keys"

                  3) Verify key fingerprint:
                    ssh-keygen -lf ${localKeyPath}.pub

                  4) Test connection:
                    ssh -v ${remoteName}
                  `;
                } else {
                  // No key exists - need to create one
                  instructions = `
                  1) Generate a key pair (if you don't already have one):
                    ssh-keygen -t rsa -b 4096 -f %USERPROFILE%\\.ssh\\id_rsa -N ""

                  2) Copy your public key to the remote server:
                    type %USERPROFILE%\\.ssh\\id_rsa.pub | ssh ${remoteName} "cat >> ~/.ssh/authorized_keys"

                    OR use PowerShell:
                    Get-Content ~\\.ssh\\id_rsa.pub | ssh ${remoteName} "cat >> ~/.ssh/authorized_keys"

                    OR use ssh-copy-id if available (with Git Bash or WSL):
                    ssh-copy-id -i ~/.ssh/id_rsa.pub ${remoteName}

                  3) Verify by SSH'ing to the remote:
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

      // Get last used location from workspace state
      const lastUsedLocation = context.workspaceState.get<string>("lastDownloadLocation");

      let destinationPath: string | undefined;

      if (defaultDownloadLocation) {
        // Use configured default location
        destinationPath = defaultDownloadLocation;
      } else {
        // Determine default URI for folder picker
        let defaultUri: vscode.Uri;
        if (lastUsedLocation && fs.existsSync(lastUsedLocation)) {
          // Use last used location if it exists
          defaultUri = vscode.Uri.file(lastUsedLocation);
        } else {
          // Fall back to Downloads folder
          defaultUri = vscode.Uri.file(path.join(os.homedir(), "Downloads"));
        }

        const folderUri = await vscode.window.showOpenDialog({
          canSelectFiles: false,
          canSelectFolders: true,
          canSelectMany: false,
          defaultUri: defaultUri,
          openLabel: "Select Download Folder",
        });

        if (folderUri && folderUri[0]) {
          destinationPath = folderUri[0].fsPath;
          // Save the selected location for next time
          await context.workspaceState.update("lastDownloadLocation", destinationPath);
        }
      }

      if (!destinationPath) {
        vscode.window.showErrorMessage("No destination path selected.");
        return;
      }

      // 6) Construct the transfer command (rsync for Unix, scp for Windows)
      const platform = os.platform();
      let command: string;

      if (platform === "win32") {
        // Use scp on Windows
        const remoteFiles = uriList.map((uri) => {
          return `"${remoteName}:${uri.path}"`;
        });
        // scp doesn't support multiple source files in one command like rsync
        // We'll handle multiple files by copying them one by one
        command = `scp -o BatchMode=yes -r ${remoteFiles.join(" ")} "${destinationPath}"`;
      } else {
        // Use rsync on Unix-like systems
        const remoteFiles = uriList.map((uri) => {
          return `"${remoteName}:${uri.path}"`;
        });
        command = `rsync -P -avz -e "ssh -o BatchMode=yes" ${remoteFiles.join(
          " "
        )} "${destinationPath}"`;
      }

      // 7) Execute the transfer command
      // outputChannel.show(true);
      outputChannel.clear();
      outputChannel.appendLine(`Platform: ${platform}`);
      outputChannel.appendLine(`Transfer method: ${platform === "win32" ? "scp" : "rsync"}`);
      outputChannel.appendLine(`Remote files: ${uriList.map((uri) => `${remoteName}:${uri.path}`).join(" ")}`);
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
            const transferMethod = platform === "win32" ? "scp" : "rsync";
            vscode.window.showErrorMessage(
              `${transferMethod} failed: ${stderr}. Please check the output for more details.`
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

export function deactivate() { }

import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';
import * as os from 'os';

function checkRsyncVersion(minVersion: string): Promise<boolean> {
  return new Promise((resolve) => {
    exec('rsync --version', (error, stdout) => {
      if (error) {
        // rsync is not installed
        resolve(false);
      } else {
        // Parse version from stdout
        const versionMatch = stdout.match(/rsync\s+version\s+(\d+\.\d+\.\d+)/i);
        if (versionMatch) {
          const installedVersion = versionMatch[1];
          const isVersionSufficient = compareVersions(installedVersion, minVersion) >= 0;
          resolve(isVersionSufficient);
        } else {
          // Could not parse version
          resolve(false);
        }
      }
    });
  });
}

// Helper function to compare version strings
function compareVersions(v1: string, v2: string): number {
  const v1parts = v1.split('.').map(Number);
  const v2parts = v2.split('.').map(Number);
  for (let i = 0; i < Math.max(v1parts.length, v2parts.length); i++) {
    const num1 = v1parts[i] || 0;
    const num2 = v2parts[i] || 0;
    if (num1 > num2) return 1;
    if (num1 < num2) return -1;
  }
  return 0;
}

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Compress Download");

  const disposable = vscode.commands.registerCommand('extension.compress_download', async (fileUri: vscode.Uri, selectedUris: vscode.Uri[]) => {
    // Ensure uriList is an array
    const uriList = selectedUris || [fileUri];

    // Check if the OS is Windows
    if (os.platform() === 'win32') {
      vscode.window.showInformationMessage('Windows is currently not supported by this extension.');
      return;
    }

    // Check if rsync is installed and version is sufficient
    const minRsyncVersion = '3.0.0'; // Minimum required version
    const rsyncVersionOk = await checkRsyncVersion(minRsyncVersion);
    if (!rsyncVersionOk) {
      // Provide installation instructions based on OS
      let installInstructions = '';
      if (os.platform() === 'darwin') { // macOS
        installInstructions = 'Install rsync via Homebrew:\n\nbrew install rsync';
      } else if (os.platform() === 'linux') {
        installInstructions = 'Install rsync via apt-get:\n\nsudo apt-get install rsync';
      } else {
        installInstructions = 'Please install rsync version 3.0.0 or higher.';
      }

      vscode.window.showErrorMessage(`rsync version ${minRsyncVersion} or higher is required.\n\n${installInstructions}`);
      return;
    }

    // Prompt user to input the destination path, default to Downloads folder
    const destinationPath = await vscode.window.showInputBox({
      prompt: 'Enter the destination path',
      value: path.join(os.homedir(), 'Downloads')
    });

    if (!destinationPath) {
      vscode.window.showErrorMessage('No destination path provided');
      return;
    }

    // Extract remote name from the first URI (assuming all URIs are from the same remote)
    const remoteAuthority = fileUri.authority;
    const remoteNameMatch = remoteAuthority.match(/ssh-remote\+(.+)/);
    if (!remoteNameMatch) {
      vscode.window.showErrorMessage('Could not determine remote host. Please ensure you are connected via SSH.');
      return;
    }
    const remoteName = remoteNameMatch[1];

    // Construct remote file paths
    const remoteFiles = uriList.map(uri => {
      const filePath = uri.path; // Get the file path
      return `"${remoteName}:${filePath}"`;
    });

    // Include SSH options to enforce BatchMode
    const command = `rsync -P -avz -e "ssh -o BatchMode=yes" ${remoteFiles.join(' ')} "${destinationPath}"`;

    outputChannel.show(true);
    outputChannel.clear();
    // Print a list of the remote files
    outputChannel.appendLine(`Remote files: ${remoteFiles.join(' ')}`);
    outputChannel.appendLine(`Running command: ${command}`);

    const childProcess = exec(command);

    let sshAuthFailed = false;

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        outputChannel.append(data.toString());
        if (data.toString().includes('Permission denied') || data.toString().includes('Authentication failed')) {
          sshAuthFailed = true;
        }
      });
    }

    childProcess.on('close', (code) => {
      if (sshAuthFailed) {
        vscode.window.showErrorMessage('Passwordless SSH authentication is not set up for the remote host. Please set it up to use this extension.', 'Setup Guide').then(selection => {
          if (selection === 'Setup Guide') {
            vscode.env.openExternal(vscode.Uri.parse('https://www.ssh.com/academy/ssh/keygen'));
          }
        });
      } else if (code === 0) {
        vscode.window.showInformationMessage(`Command successful. Files downloaded to ${destinationPath}`);
      } else {
        vscode.window.showErrorMessage(`Command failed with exit code ${code}. Check the output for more details.`);
      }
    });
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(outputChannel);
}

export function deactivate() {}

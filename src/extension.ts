import * as vscode from 'vscode';
import { exec } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const disposable = vscode.commands.registerCommand('extension.compress_download', (uri: vscode.Uri) => {
    // Extract remote name and file path from URI
    const remoteName = uri.authority.split('+')[1]; // Extract 'wse1' from 'ssh-remote+wse1'
    const filePath = uri.path; // Get the file path

    // Ensure a proper destination directory
    const destinationPath = path.join(process.env.HOME || '/home', 'Downloads');
    const remoteFilePath = `${remoteName}:${filePath}`; // Remote file path
    const rsyncCommand = `rsync -avz "${remoteFilePath}" "${destinationPath}"`;

    vscode.window.showInformationMessage(`Running rsync command: ${rsyncCommand}`);

    exec(rsyncCommand, (rsyncError, rsyncStdout, rsyncStderr) => {
      if (rsyncError) {
        vscode.window.showErrorMessage(`Rsync failed: ${rsyncStderr}`);
      } else {
        vscode.window.showInformationMessage(`Rsync successful: ${rsyncStdout}`);
      }
    });
  });

  context.subscriptions.push(disposable);
}

export function deactivate() {}

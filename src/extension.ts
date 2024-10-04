import * as vscode from 'vscode';
import { exec, ChildProcess } from 'child_process';
import * as path from 'path';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Compress Download");

  const disposable = vscode.commands.registerCommand('extension.compress_download', (uri: vscode.Uri) => {
    // Extract remote name and file path from URI
    const remoteName = uri.authority.split('+')[1]; // Extract 'wse1' from 'ssh-remote+wse1'
    const filePath = uri.path; // Get the file path

    // Ensure a proper destination directory
    // const destinationPath = path.join(process.env.HOME || '/home', 'Downloads');

    // just prompt to input text with home/username/Downloads as default
    const destinationPath = vscode.window.showInputBox({
      prompt: 'Enter the destination path',
      value: path.join(process.env.HOME || '/home', 'Downloads')
    });

    const remoteFilePath = `${remoteName}:${filePath}`; // Remote file path
    const rsyncCommand = `rsync -P -avz "${remoteFilePath}" "${destinationPath}"`;

    outputChannel.show(true);
    outputChannel.clear();
    // output all the uri information
    outputChannel.appendLine(`Running rsync command: ${rsyncCommand}`);

    const rsyncProcess: ChildProcess = exec(rsyncCommand);

    if (rsyncProcess.stdout) {
      rsyncProcess.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
      });
    }

    if (rsyncProcess.stderr) {
      rsyncProcess.stderr.on('data', (data) => {
        outputChannel.append(data.toString());
      });
    }

    rsyncProcess.on('close', (code) => {
      if (code === 0) {
        vscode.window.showInformationMessage(`Rsync successful. Files downloaded to ${destinationPath}`);
      } else {
        vscode.window.showErrorMessage(`Rsync failed with exit code ${code}. Check the output for more details.`);
      }
    });
  });

  context.subscriptions.push(disposable);
  context.subscriptions.push(outputChannel);
}

export function deactivate() {}
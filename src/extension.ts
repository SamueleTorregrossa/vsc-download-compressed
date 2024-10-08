import * as vscode from 'vscode';
import { exec, ChildProcess } from 'child_process';
import * as path from 'path';
import * as os from 'os';

export function activate(context: vscode.ExtensionContext) {
  const outputChannel = vscode.window.createOutputChannel("Compress Download");

  const disposable = vscode.commands.registerCommand('extension.compress_download', async (uri: vscode.Uri) => {
    // Check if the OS is Windows
    if (os.platform() === 'win32') {
      vscode.window.showInformationMessage('Windows is currently not supported by this extension.');
      return;
    }

    // Extract remote name and file path from URI
    const remoteName = uri.authority.split('+')[1]; // Extract 'wse1' from 'ssh-remote+wse1'
    const filePath = uri.path; // Get the file path

    // Prompt user to input the destination path, default to Downloads folder
    const destinationPath = await vscode.window.showInputBox({
      prompt: 'Enter the destination path',
      value: path.join(process.env.HOME || process.env.USERPROFILE || '/home', 'Downloads')
    });

    if (!destinationPath) {
      vscode.window.showErrorMessage('No destination path provided');
      return;
    }

    const remoteFilePath = filePath; // Remote file path
    const command = `rsync -P -avz "${remoteName}:${remoteFilePath}" "${destinationPath}"`;

    outputChannel.show(true);
    outputChannel.clear();
    outputChannel.appendLine(`Running command: ${command}`);

    const childProcess: ChildProcess = exec(command);

    if (childProcess.stdout) {
      childProcess.stdout.on('data', (data) => {
        outputChannel.append(data.toString());
      });
    }

    if (childProcess.stderr) {
      childProcess.stderr.on('data', (data) => {
        outputChannel.append(data.toString());
      });
    }

    childProcess.on('close', (code) => {
      if (code === 0) {
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

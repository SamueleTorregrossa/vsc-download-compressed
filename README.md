# README

## Features

This extension provides the following features:
- Compress files or directories on remote servers.
- Download the compressed files to your local machine.

When connected to a remote SSH environment in Visual Studio Code, you can right-click on any file or directory in the Explorer context menu and select "Compress and Download". The extension will compress the selected item on the remote server and transfer the compressed file to your local Downloads directory using `rsync`.

## Requirements

- Visual Studio Code version 1.60.0 or higher.
- A remote server accessible via SSH.
- `rsync` installed on both the local and remote machines.
- Proper SSH configuration to allow passwordless login to the remote server (using SSH keys).

## Installation

1. **Package the Extension**:
   ```sh
   npm install -g vsce
   vsce package
   ```

2. **Install the Extension**:
   - Open Visual Studio Code.
   - Go to the Extensions view (`Ctrl+Shift+X`).
   - Click on the three-dot menu in the top-right corner and select "Install from VSIX...".
   - Select the generated `.vsix` file from the previous step.

## Extension Settings

This extension currently does not add any VS Code settings.

## Known Issues

- The extension is only available in SSH remote environments.
- Ensure that `rsync` is properly installed and configured on both local and remote machines.

## Release Notes

### 0.0.1

- Initial release of "compress-extension".
- Supports compressing and downloading files and directories from remote SSH environments.

## Usage

1. **Connect to a Remote SSH Session**:
   - Use the Remote - SSH extension to connect to your remote server.

2. **Compress and Download**:
   - Right-click on a file or directory in the Explorer view.
   - Select "Compress and Download" from the context menu.
   - The extension will compress the selected item on the remote server and transfer it to your local Downloads directory.

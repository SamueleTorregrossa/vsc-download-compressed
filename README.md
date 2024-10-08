# Remote - SSH: Fast Download README

## Features

This extension provides the following features:

- **Fast File Downloads**: Quickly download files or directories from remote servers connected via SSH directly to your local machine.

- **Multiple File Selection**: Supports downloading multiple files or directories at once.

- **Rsync-Based Transfers**: Utilizes `rsync` for efficient and reliable synchronization between the remote server and your local machine.

- **Automatic Rsync Version Check**: Ensures that `rsync` is installed and up-to-date on your local machine, providing guidance if updates are needed.

- **Passwordless SSH Authentication Support**: Detects if passwordless SSH authentication is not set up and guides you through the setup process for a smoother experience.

## Benefits

- **Speed and Efficiency**: `rsync` optimizes data transfer by only copying changes, making downloads faster, especially for large files or directories.

- **Convenience**: Easily download files directly from the VSCode Explorer context menu without needing to switch to external tools like FileZilla.

- **Security**: Encourages the use of SSH keys for passwordless authentication, enhancing security and reducing the hassle of entering passwords.

## Requirements

- **Visual Studio Code**: Version 1.60.0 or higher.

- **Remote SSH Extension**: The official VSCode Remote - SSH extension to connect to remote servers.

- **Rsync**: Installed on both the local and remote machines. On macOS, ensure that `rsync` version 3.0.0 or higher is installed, as the default version is outdated.

- **SSH Configuration**: Passwordless SSH authentication set up using SSH keys.

## Installation

### 1. Install Rsync on Your Local Machine

#### macOS

- **Install Homebrew** (if not already installed):

  ```bash
  /bin/bash -c "$(curl -fsSL https://raw.githubusercontent.com/Homebrew/install/HEAD/install.sh)"
  ```

- **Install rsync via Homebrew**:

  ```bash
  brew install rsync
  ```

- **Verify Installation**:

  ```bash
  rsync --version
  ```

  Ensure the version is **3.0.0** or higher.

#### Linux

- **Install rsync via apt-get**:

  ```bash
  sudo apt-get install rsync
  ```

- **Verify Installation**:

  ```bash
  rsync --version
  ```

  Ensure the version is **3.0.0** or higher.

### 2. Set Up Passwordless SSH Authentication

- **Generate an SSH Key Pair** (if you don't already have one):

  ```bash
  ssh-keygen -t rsa -b 4096 -C "your_email@example.com"
  ```

  - Press **Enter** to accept the default file location.
  - Optionally, enter a passphrase for added security.

- **Copy Your Public Key to the Remote Server**:

  ```bash
  ssh-copy-id username@remote_host
  ```

  Replace `username` and `remote_host` with your remote server's credentials.

- **Test the SSH Connection**:

  ```bash
  ssh username@remote_host
  ```

  You should be able to log in without entering a password.

### 3. Install the Extension

- **From the Visual Studio Code Marketplace**:

  - Open Visual Studio Code.
  - Go to the **Extensions** view (`Ctrl+Shift+X` or `Cmd+Shift+X`).
  - Search for **"SSH Fast Download"** or **"compress-download-extension"**.
  - Click **"Install"**.

- **Manual Installation**:

  - If you have the `.vsix` file:
    - Open Visual Studio Code.
    - Go to the **Extensions** view.
    - Click on the three-dot menu (`...`) in the top-right corner.
    - Select **"Install from VSIX..."**.
    - Choose the `.vsix` file you downloaded or packaged.

## Usage

1. **Connect to a Remote SSH Session**:

   - Use the **Remote - SSH** extension to connect to your remote server.

2. **Download Files or Directories**:

   - In the **Explorer** view, select one or multiple files or directories.
   - Right-click on the selection.
   - Choose **"Compress and Download"** from the context menu.
   - When prompted, enter the destination path on your local machine (default is your **Downloads** folder).
   - The extension will use `rsync` to transfer the selected items from the remote server to your local destination.

3. **Monitor Progress**:

   - The extension will display progress and output in the **"Compress Download"** output channel.
   - Notifications will inform you when the download is complete or if any errors occur.

## Extension Settings

This extension currently does not add any VS Code settings.

## Known Issues

- **Windows Support**: The extension currently does not support Windows as the local machine.

- **Rsync Version on macOS**: The default version of `rsync` on macOS is outdated. Ensure you install version **3.0.0** or higher via Homebrew.

- **Passwordless SSH Authentication Required**: The extension requires passwordless SSH authentication to function properly. If not set up, the extension will guide you through the process.

## Release Notes

### 0.0.8

- **Multiple File Selection Support**: You can now select and download multiple files or directories at once.

- **Rsync Version Check**: The extension now checks if `rsync` is installed and up-to-date on your local machine, providing installation instructions if necessary.

- **Passwordless SSH Authentication Detection**: The extension detects if passwordless SSH authentication is not set up and guides you to set it up.

- **Improved Error Handling**: Enhanced feedback and error messages to assist users in troubleshooting.

- **Simplified Workflow**: Removed the compression step in favor of `rsync`'s built-in capabilities for efficient file transfer.

### 0.0.7

- **Initial Release**: Introduced the ability to download compressed files and directories from remote SSH environments.

## Contributing

Contributions are welcome! Please submit issues or pull requests to the [GitHub repository](https://github.com/SamueleTorregrossa/vsc-download-compressed).

## License

This project is licensed under the [MIT License](LICENSE).

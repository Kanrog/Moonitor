#!/bin/bash

# Moonitor - Automated Installer
# Run this on your Klipper host (Raspberry Pi/Debian SBC)

set -e

echo -e "\e[1;32mStarting Moonitor installation...\e[0m"

# 1. Install Node.js and Git if not present
if ! command -v node &> /dev/null; then
    echo -e "\e[1;33mNode.js not found. Installing Node.js 20.x...\e[0m"
    curl -fsSL https://deb.nodesource.com/setup_20.x | sudo -E bash -
    sudo apt-get install -y nodejs git
else
    echo -e "\e[1;32mNode.js is already installed.\e[0m"
    sudo apt-get install -y git
fi

# 2. Setup project directory by cloning from GitHub
INSTALL_DIR="$HOME/Moonitor"
if [ -d "$INSTALL_DIR" ]; then
    echo "Directory $INSTALL_DIR already exists. Updating..."
    cd "$INSTALL_DIR"
    git pull
else
    echo "Cloning Moonitor repository..."
    git clone https://github.com/Kanrog/Moonitor.git "$INSTALL_DIR"
    cd "$INSTALL_DIR"
fi

# 3. Set executable permissions for scripts
echo "Setting file permissions..."
chmod +x update.sh
chmod +x install.sh

# 4. Install dependencies
echo "Installing npm dependencies..."
npm install

# 5. Setup systemd service
SERVICE_FILE="/etc/systemd/system/moonitor.service"
echo "Setting up systemd service to run in the background..."

sudo tee $SERVICE_FILE > /dev/null << EOF
[Unit]
Description=Moonitor Dashboard
After=network.target

[Service]
Type=simple
User=$USER
WorkingDirectory=$INSTALL_DIR
ExecStart=$(which node) server.js
Restart=on-failure
RestartSec=5

[Install]
WantedBy=multi-user.target
EOF

# 6. Reload and start systemd service
sudo systemctl daemon-reload
sudo systemctl enable moonitor.service
sudo systemctl start moonitor.service

# 7. Get Local IP
LOCAL_IP=$(hostname -I | awk '{print $1}')

echo -e "\e[1;32mInstallation Complete!\e[0m"
echo -e "You can now access your Moonitor at: \e[1;36mhttp://$LOCAL_IP:3366\e[0m"
echo ""
echo "To view system logs for the dashboard, run:"
echo "  sudo journalctl -u moonitor.service -f"
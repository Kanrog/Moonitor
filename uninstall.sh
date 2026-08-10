#!/bin/bash

# Moonitor - Automated Uninstaller
# Run this on your Klipper host to completely remove Moonitor

set -e

echo -e "\e[1;31mStarting Moonitor uninstallation...\e[0m"

SERVICE_FILE="/etc/systemd/system/moonitor.service"

# 1. Stop and disable the systemd service
if systemctl is-active --quiet moonitor.service; then
    echo "Stopping moonitor.service..."
    sudo systemctl stop moonitor.service
fi

if systemctl is-enabled --quiet moonitor.service 2>/dev/null; then
    echo "Disabling moonitor.service..."
    sudo systemctl disable moonitor.service
fi

# 2. Remove the systemd service file
if [ -f "$SERVICE_FILE" ]; then
    echo "Removing systemd service file..."
    sudo rm "$SERVICE_FILE"
    sudo systemctl daemon-reload
fi

# 3. Remove the installation directory
INSTALL_DIR="$HOME/Moonitor"
if [ -d "$INSTALL_DIR" ]; then
    echo "Removing project directory at $INSTALL_DIR..."
    rm -rf "$INSTALL_DIR"
else
    echo "Directory $INSTALL_DIR not found. Skipping."
fi

echo -e "\e[1;32mMoonitor has been completely removed from this host.\e[0m"
echo "Note: Node.js and Git were left installed as they may be required by other system components."
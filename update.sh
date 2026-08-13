#!/bin/bash

# Moonitor - Automated Updater
set -e

echo -e "\e[1;34mStarting Moonitor update...\e[0m"

# Ensure we are in the correct directory regardless of where the script is called from
INSTALL_DIR="$HOME/Moonitor"
if [ ! -d "$INSTALL_DIR" ]; then
    echo -e "\e[1;31mError: Moonitor directory not found at $INSTALL_DIR\e[0m"
    exit 1
fi

cd "$INSTALL_DIR"

echo "Pulling latest code from GitHub..."
git pull

echo "Updating npm dependencies..."
npm install

echo "Restarting Moonitor systemd service..."
sudo systemctl restart moonitor.service

echo -e "\e[1;32mMoonitor has been successfully updated!\e[0m"
echo "Remember to do a hard refresh (Ctrl + Shift + R) in your browser to load the new UI."
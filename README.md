<p align="center">
  <img src="images/logo_animated.svg" width="250" alt="Moonitor Logo">
</p>

# Moonitor

**A lightweight, zero-latency fleet dashboard for Klipper and Moonraker.**[cite: 16]

Moonitor is a unified browser interface designed to let you monitor and control multiple 3D printers from a single screen.[cite: 16]

It is built on the philosophy that **individual Klipper hosts should remain localized in their respective printers.**[cite: 16] Instead of trying to centralize hardware connections onto one massive host machine, Moonitor acts strictly as a lightweight HTML thin-client dashboard[cite: 16]. It handles the high-level UI while letting your individual printers do the heavy lifting[cite: 16].

---

## Gallery

| Fully Configured Fleet Dashboard | Hover Control Overlay |
| :---: | :---: |
| ![Fully set up interface with printers added](images/1.jpg)[cite: 16] | ![Control overlay on a printer card](images/2.png)[cite: 16] |
| *Managing multiple Klipper nodes from a single window.*[cite: 16] | *Access instant controls, telemetry, and macros on hover.*[cite: 16] |

| Network Scan Results | Highlight Mode |
| :---: | :---: |
| ![Network scan results dialog](images/3.png)[cite: 16] | ![Highlight mode preview](images/highlight.png) |
| *Easily discover and batch-add local Moonraker endpoints.*[cite: 16] | *Maximize a single printer while keeping others in a bottom strip.* |

---

## Features

* **Network Discovery:** Built-in mDNS scanning automatically finds Moonraker instances on your local network - no hunting for IP addresses[cite: 16].
* **Zero-Latency Telemetry:** Connects directly to each printer's Moonraker WebSockets from your browser for instant temperature and status updates[cite: 16].
* **Grid-Based Command Center:** View all your webcam streams side-by-side in a responsive CSS grid that adapts to your screen size[cite: 16].
* **Essential Controls:** Start, pause, cancel, adjust Z-offset, set temperatures, home axes, and trigger custom macros across your entire fleet from one window[cite: 16].
* **Persistent Storage:** Saves your fleet configuration locally so your dashboard is exactly how you left it after a reboot[cite: 16].
* **Flexible Camera Controls:** Enable, disable, rotate (0°, 90°, 180°, 270°), and horizontally mirror your webcam feeds directly from the printer settings to fit any enclosure orientation[cite: 16].
* **Customisable Themes:** Includes 6 preset color themes (Moonitor Dark, Cyberpunk Neon, Emerald Mint, Sunset Ember, Monolith, and Purple Vibe) plus a fully customizable color palette to adjust backgrounds, text, buttons, button text, and outlines with persistent `localStorage` saving[cite: 16].
* **Highlight & Auto-Cycle Modes:** Instantly maximize any single printer preview while keeping the rest visible in a bottom strip, or enable Auto-Cycle mode to automatically rotate through your fleet on a user-defined timer with live countdown indicators and hover-pause protection.

> ### Creality K2 / K2 Plus Camera Note
> The Creality K2 series uses a proprietary WebRTC camera stream instead of a standard MJPEG endpoint[cite: 16]. If your camera feed fails to load, ensure you have a local stream bridge (such as `go2rtc` or a community-supported helper script) configured on your printer to translate the stream into an accessible format[cite: 16].

---

## Architecture

* **Backend:** A tiny Node.js server that handles local network scanning (mDNS/Bonjour) and serves the static UI files[cite: 16].
* **Frontend:** Vanilla JavaScript and HTML. The frontend talks directly to the Moonraker WebSockets, bypassing the Node backend entirely for live printer control[cite: 16]. 

---

## System Requirements & Performance

Moonitor is built as a true thin-client[cite: 16]. The Node.js backend exists solely to serve the static UI files and run local network discovery[cite: 16]. All live telemetry, commands, and camera streams are handled directly between your browser and the printer's WebSockets[cite: 16].

Because of this architecture, Moonitor has virtually zero system overhead[cite: 16]. In real-world testing, a Moonitor service managing an active fleet of 5 printers consumes roughly **31 MB of RAM** with no memory leaks after over a month of continuous uptime[cite: 16]. It can comfortably run directly on an existing Pi or Debian SBC alongside Klipper without impacting your print quality or host performance[cite: 16].

| Memory & Performance Benchmark |
| :---: |
| ![Moonitor Memory Benchmark](images/memory-benchmark.png)[cite: 16] |
| *Consuming ~31 MB of RAM after over a month of continuous uptime across 5 printers.*[cite: 16] |

---

## Quick Install

You can install Moonitor directly on one of your existing Klipper hosts (like a Raspberry Pi) or a dedicated local home server[cite: 16]. 

Run this command via SSH on your target Debian/Ubuntu machine to automatically install Node.js, download Moonitor, and set it up as a background service[cite: 16]:

```bash
curl -sSL [https://raw.githubusercontent.com/Kanrog/Moonitor/main/install.sh](https://raw.githubusercontent.com/Kanrog/Moonitor/main/install.sh) | bash
```

Once installed, open a browser on your network and navigate to `http://<YOUR_HOST_IP>:3366`[cite: 16].

---

> **Note on Moonraker CORS:**
> Ensure your `moonraker.conf` allows connections from your local subnet, or Moonraker will block Moonitor's WebSocket requests[cite: 16]. Add your local IP range (e.g., `192.168.0.0/16`) to the `trusted_clients` list under the `[authorization]` section[cite: 16].

---
## Install as an App (PWA)

Moonitor includes full Progressive Web App (PWA) support, allowing you to install it directly to your desktop or mobile home screen as a standalone application[cite: 16]. Once installed, Moonitor will run in its own dedicated window without browser tabs or toolbars, giving you a clean, native dashboard experience for your fleet[cite: 16].

**How to install:**
* **Desktop (Chrome/Edge):** Open the browser's main menu (three dots in the top right), navigate to **"Save and share"** (or "Apps"), and click **"Install page as app"**[cite: 16].
* **Mobile (iOS/Android):** Open Moonitor in Safari or Chrome, tap the "Share" icon (iOS) or the three-dot "Menu" (Android), and select **"Add to Home Screen"**[cite: 16].

> **Troubleshooting: "This app cannot be installed" / Missing Install Button**
> Because Moonitor runs locally over standard HTTP, modern browsers (like Chrome on Android or Desktop) may flag the connection as insecure and gray out the true "Install" button, only allowing you to create a standard browser shortcut[cite: 16].
> 
> **To fix this and force a full app installation:**[cite: 16]
> 1. Type `chrome://flags/#unsafely-treat-insecure-origin-as-secure` (or `edge://flags` for Edge) into your browser's address bar[cite: 16].
> 2. Change the setting from **Default** to **Enabled**[cite: 16].
> 3. Type your exact Moonitor address (e.g., `http://192.168.0.215:3366`) into the text box provided[cite: 16].
> 4. Tap the **Relaunch** button to restart the browser[cite: 16].
> 5. Navigate back to your Moonitor dashboard and open the menu again. The **Install** option will now be fully enabled![cite: 16]

---

## Updating Moonitor

Moonitor does not include an auto-updater to keep the dashboard as lightweight and secure as possible[cite: 16]. Instead, the four commands needed to update it has been simplified into one[cite: 16].

To update your installation to the latest version, SSH into the machine hosting Moonitor (your Klipper host or home server) and run this following command to pull the latest code, update any dependencies, and restart the background service[cite: 16]:

```bash
./Moonitor/update.sh
```

Please note that this only works if you installed Moonitor after August 13th 2026[cite: 16].
If you have an earlier version, you need to reinstall Moonitor[cite: 16].

---

## Uninstall

If you ever need to remove Moonitor from your host system, you can use the automated uninstall script[cite: 16]. This will stop the background service, remove it from systemd, and delete the Moonitor project directory[cite: 16]. It will safely leave Node.js and Git installed so it does not interfere with other services on your machine[cite: 16].

Run this command via SSH to completely remove Moonitor[cite: 16]:

```bash
curl -sSL [https://raw.githubusercontent.com/Kanrog/Moonitor/main/uninstall.sh](https://raw.githubusercontent.com/Kanrog/Moonitor/main/uninstall.sh) | bash
```
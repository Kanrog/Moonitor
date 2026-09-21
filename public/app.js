if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service Worker registration failed:', err));
    });
}

let sockets = {};
let foundDiscoveredPrinters = [];

// 6 Preset Themes (Balanced 2x3 grid)
const THEME_PRESETS = {
    moonitor: { bg: '#1e1e2e', surface: '#313244', accent: '#89b4fa', text: '#cdd6f4' },
    cyberpunk: { bg: '#09090b', surface: '#18181b', accent: '#f43f5e', text: '#fafafa' },
    emerald: { bg: '#064e3b', surface: '#065f46', accent: '#34d399', text: '#ecfdf5' },
    sunset: { bg: '#291b1a', surface: '#3d2624', accent: '#fb923c', text: '#ffedd5' },
    monolith: { bg: '#111111', surface: '#222222', accent: '#e2e8f0', text: '#f8fafc' },
    purple: { bg: '#1e1b4b', surface: '#312e81', accent: '#c084fc', text: '#f3e8ff' }
};

document.addEventListener('DOMContentLoaded', () => {
    loadSavedTheme();
    loadPrinters();

    // Mobile tap-to-close logic: Closes the overlay if you tap outside of it on touch devices
    document.addEventListener('click', (e) => {
        if (!window.matchMedia('(hover: hover)').matches) {
            const isInteractive = e.target.closest('button, input, select');
            const isOverlay = e.target.closest('.card-overlay');
            const isFeed = e.target.closest('.webcam-feed, .camera-disabled-placeholder');

            if (isOverlay && !isInteractive) {
                document.querySelectorAll('.card.touch-active').forEach(c => c.classList.remove('touch-active'));
            }
            else if (!isOverlay && !isFeed) {
                document.querySelectorAll('.card.touch-active').forEach(c => c.classList.remove('touch-active'));
            }
        }
    });
});

// --- Theme Management Functions ---

function loadSavedTheme() {
    const savedType = localStorage.getItem('moonitor-theme-type');

    if (savedType === 'custom') {
        const customTheme = {
            bg: localStorage.getItem('moonitor-custom-bg') || '#1e1e2e',
            surface: localStorage.getItem('moonitor-custom-surface') || '#313244',
            accent: localStorage.getItem('moonitor-custom-accent') || '#89b4fa',
            text: localStorage.getItem('moonitor-custom-text') || '#cdd6f4'
        };
        applyThemeValues(customTheme, false);
        setPickerValues(customTheme);
    } else if (savedType && THEME_PRESETS[savedType]) {
        applyPresetTheme(savedType, false);
    } else {
        applyPresetTheme('moonitor', false);
    }
}

function applyPresetTheme(themeKey, save = true) {
    const theme = THEME_PRESETS[themeKey];
    if (!theme) return;

    applyThemeValues(theme, save);
    setPickerValues(theme);

    if (save) {
        localStorage.setItem('moonitor-theme-type', themeKey);
    }
}

function applyThemeValues(theme, save = true) {
    const root = document.documentElement;
    root.style.setProperty('--bg', theme.bg);
    root.style.setProperty('--surface', theme.surface);
    root.style.setProperty('--accent', theme.accent);
    root.style.setProperty('--text', theme.text);
    root.style.setProperty('--overlay-bg', hexToRgba(theme.bg, 0.92));

    if (save) {
        localStorage.setItem('moonitor-theme-type', 'custom');
        localStorage.setItem('moonitor-custom-bg', theme.bg);
        localStorage.setItem('moonitor-custom-surface', theme.surface);
        localStorage.setItem('moonitor-custom-accent', theme.accent);
        localStorage.setItem('moonitor-custom-text', theme.text);
    }
}

function triggerCustomUpdate() {
    const customTheme = {
        bg: document.getElementById('picker-bg').value,
        surface: document.getElementById('picker-surface').value,
        accent: document.getElementById('picker-accent').value,
        text: document.getElementById('picker-text').value
    };
    applyThemeValues(customTheme, true);
}

function setPickerValues(theme) {
    document.getElementById('picker-bg').value = theme.bg;
    document.getElementById('picker-surface').value = theme.surface;
    document.getElementById('picker-accent').value = theme.accent;
    document.getElementById('picker-text').value = theme.text;
}

function hexToRgba(hex, alpha) {
    let c = hex.replace('#', '');
    if (c.length === 3) c = c.split('').map(x => x + x).join('');
    const num = parseInt(c, 16);
    return `rgba(${(num >> 16) & 255}, ${(num >> 8) & 255}, ${num & 255}, ${alpha})`;
}

function openSettingsModal() {
    document.getElementById('settings-modal').style.display = 'flex';
}

function closeSettingsModal() {
    document.getElementById('settings-modal').style.display = 'none';
}

// --- Printer Logic ---

async function loadPrinters() {
    const res = await fetch('/api/printers');
    const printers = await res.json();
    renderPrinters(printers);
}

async function addManualPrinter() {
    let name = document.getElementById('manual-name').value.trim();
    const ip = document.getElementById('manual-ip').value.trim();
    if (!ip) return alert("Please enter an IP address.");

    if (!name) {
        name = `Printer (${ip})`;
        try {
            const res = await fetch(`http://${ip}:7125/printer/info`);
            if (res.ok) {
                const data = await res.json();
                name = data?.result?.hostname || name;
            }
        } catch (e) {}
    }

    await fetch('/api/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            name, 
            ip, 
            port: 7125, 
            webcamPort: 8080, 
            webcamPath: '/webcam/?action=stream',
            cameraEnabled: true,
            rotation: 0,
            mirror: false
        })
    });
    
    document.getElementById('manual-name').value = '';
    document.getElementById('manual-ip').value = '';
    loadPrinters();
}

async function scanNetwork() {
    const scanBtn = document.getElementById('scan-btn');
    const scanResultsDiv = document.getElementById('scan-results');
    const scanList = document.getElementById('scan-list');
    const statusText = document.getElementById('scan-status-text');
    const searchlight = document.getElementById('searchlight');
    
    scanBtn.disabled = true;
    scanResultsDiv.style.display = 'none';
    searchlight.style.display = 'block';
    statusText.innerHTML = '<span class="pulse-dot"></span> Scouting local subnets for Moonraker endpoints...';
    
    try {
        const res = await fetch('/api/printers/scan');
        foundDiscoveredPrinters = await res.json();
        
        scanList.innerHTML = '';
        
        if (foundDiscoveredPrinters.length === 0) {
            statusText.innerHTML = '<span>No new printers found on network.</span>';
            setTimeout(() => { statusText.innerHTML = ''; }, 4000);
        } else {
            statusText.innerHTML = `<span>Found ${foundDiscoveredPrinters.length} printer(s). Select the ones you want to add:</span>`;
            
            foundDiscoveredPrinters.forEach((p, index) => {
                const item = document.createElement('div');
                item.className = 'scan-list-item';
                item.innerHTML = `
                    <label>
                        <input type="checkbox" id="scan-item-${index}" value="${index}" checked>
                        <span><strong>${p.name}</strong> <span style="color: var(--text-muted); font-size: 0.85em;">(${p.ip})</span></span>
                    </label>
                `;
                scanList.appendChild(item);
            });
            
            scanResultsDiv.style.display = 'flex';
        }
    } catch (e) {
        statusText.innerHTML = '<span style="color:var(--danger)">Scan failed to reach backend server.</span>';
    } finally {
        scanBtn.disabled = false;
        searchlight.style.display = 'none';
    }
}

async function addSelectedPrinters() {
    const checkboxes = document.querySelectorAll('#scan-list input[type="checkbox"]:checked');
    if (checkboxes.length === 0) {
        alert("Please select at least one printer to add.");
        return;
    }

    for (const cb of checkboxes) {
        const printer = foundDiscoveredPrinters[cb.value];
        if (printer) {
            await fetch('/api/printers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ 
                    name: printer.name, 
                    ip: printer.ip, 
                    port: printer.port || 7125, 
                    webcamPort: 8080,
                    webcamPath: '/webcam/?action=stream',
                    cameraEnabled: true,
                    rotation: 0,
                    mirror: false
                })
            });
        }
    }

    document.getElementById('scan-results').style.display = 'none';
    document.getElementById('scan-status-text').innerHTML = '';
    loadPrinters();
}

async function removePrinter(ip) {
    if (!confirm(`Are you sure you want to remove the printer at ${ip}?`)) {
        return;
    }

    if (sockets[ip]) {
        sockets[ip].close();
        delete sockets[ip];
    }
    await fetch(`/api/printers/${ip}`, { method: 'DELETE' });
    loadPrinters();
}

async function openEditModal(ip) {
    const res = await fetch('/api/printers');
    const printers = await res.json();
    const printer = printers.find(p => p.ip === ip);
    if (!printer) return;

    document.getElementById('edit-old-ip').value = printer.ip;
    document.getElementById('edit-name').value = printer.name;
    document.getElementById('edit-ip').value = printer.ip;
    document.getElementById('edit-camera-enabled').checked = printer.cameraEnabled !== false;
    document.getElementById('edit-rotation').value = printer.rotation || 0;
    document.getElementById('edit-mirror').checked = printer.mirror || false;

    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function savePrinterEdit() {
    const oldIp = document.getElementById('edit-old-ip').value;
    const name = document.getElementById('edit-name').value.trim();
    const ip = document.getElementById('edit-ip').value.trim();
    const cameraEnabled = document.getElementById('edit-camera-enabled').checked;
    const rotation = parseInt(document.getElementById('edit-rotation').value);
    const mirror = document.getElementById('edit-mirror').checked;

    if (!ip) {
        alert("IP address cannot be empty.");
        return;
    }

    if (sockets[oldIp]) {
        sockets[oldIp].close();
        delete sockets[oldIp];
    }

    await fetch(`/api/printers/${oldIp}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip, cameraEnabled, rotation, mirror })
    });

    closeEditModal();
    loadPrinters();
}

async function fetchMacros(ip) {
    const selectEl = document.getElementById(`macro-select-${ip}`);
    if (!selectEl || selectEl.options.length > 1) return;

    try {
        const res = await fetch(`http://${ip}:7125/printer/objects/list`);
        if (!res.ok) return;
        const data = await res.json();
        
        const objects = data?.result?.objects || [];
        const macros = objects
            .filter(obj => obj.startsWith('gcode_macro '))
            .map(obj => obj.replace('gcode_macro ', ''))
            .filter(name => !name.startsWith('_'))
            .sort();

        selectEl.innerHTML = '<option value="">Select Macro...</option>';
        macros.forEach(macro => {
            const opt = document.createElement('option');
            opt.value = macro;
            opt.textContent = macro;
            selectEl.appendChild(opt);
        });
    } catch (e) {
        console.error(`Failed to fetch macros for ${ip}:`, e);
    }
}

function toggleOverlay(element, ip) {
    if (window.matchMedia('(hover: hover)').matches) return;
    
    const card = element.closest('.card');
    const isActive = card.classList.contains('touch-active');
    
    document.querySelectorAll('.card.touch-active').forEach(c => c.classList.remove('touch-active'));
    
    if (!isActive) {
        card.classList.add('touch-active');
        fetchMacros(ip);
    }
}

function renderPrinters(printers) {
    const grid = document.getElementById('printer-grid');
    grid.innerHTML = '';

    printers.forEach(printer => {
        const card = document.createElement('div');
        card.className = 'card';
        
        const camPath = printer.webcamPath || '/webcam/?action=stream';
        const primaryCamUrl = `http://${printer.ip}:${printer.webcamPort}${camPath}`;
        const fallbackCamUrl = `http://${printer.ip}/webcam/?action=stream`;

        const isCamEnabled = printer.cameraEnabled !== false;
        const rotation = printer.rotation || 0;
        const mirror = printer.mirror ? -1 : 1;
        
        let transformStr = `rotate(${rotation}deg) scaleX(${mirror})`;
        if (rotation === 90 || rotation === 270) {
            transformStr = `rotate(${rotation}deg) scale(${mirror * 0.5625}, 1.7778)`;
        }

        const safeIp = printer.ip;

        card.innerHTML = `
            ${isCamEnabled ? `<img class="webcam-feed" src="${primaryCamUrl}" style="transform: ${transformStr};" alt="Camera Feed Offline" onerror="if(this.src !== '${fallbackCamUrl}') { this.src = '${fallbackCamUrl}'; } else { this.style.display='none'; }" onclick="toggleOverlay(this, '${safeIp}')">` : `<div class="camera-disabled-placeholder" style="position: absolute; top:0; left:0; right:0; bottom:0; display:flex; align-items:center; justify-content:center; color: var(--text-muted); font-size: 0.85rem;" onclick="toggleOverlay(this, '${safeIp}')">Camera Disabled</div>`}

            <div class="card-top-bar">
                <h3>${printer.name}</h3>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <span class="status-badge" id="status-${printer.ip}">Connecting...</span>
                    <a href="http://${printer.ip}" target="_blank" class="icon-btn" style="text-decoration: none; display: inline-flex; align-items: center; justify-content: center;" title="Open Klipper Interface">🔗</a>
                    <button class="icon-btn" onclick="openEditModal('${safeIp}')" title="Edit Printer">⚙️</button>
                    <button class="icon-btn remove-btn" onclick="removePrinter('${printer.ip}')" title="Remove Printer">✕</button>
                </div>
            </div>

            <div class="card-overlay" onmouseenter="fetchMacros('${printer.ip}')">
                <div class="controls-row">
                    <button onclick="sendCommand('${printer.ip}', 'printer.print.pause')">Pause</button>
                    <button onclick="sendCommand('${printer.ip}', 'printer.print.resume')">Resume</button>
                    <button class="danger" onclick="sendCommand('${printer.ip}', 'printer.print.cancel')">Cancel</button>
                </div>

                <div class="controls-row">
                    <button onclick="sendGcode('${printer.ip}', 'G28')">Home All</button>
                    <button onclick="sendGcode('${printer.ip}', 'G28 X Y')">Home X/Y</button>
                    <button onclick="sendGcode('${printer.ip}', 'G28 Z')">Home Z</button>
                    <button class="danger" onclick="sendGcode('${printer.ip}', 'M84')">Motors Off</button>
                </div>
                
                <div class="controls-row" style="align-items: center;">
                    <span style="font-size: 0.75rem; color: var(--text-muted); flex: none;">Z-Offset:</span>
                    <button onclick="sendGcode('${printer.ip}', 'SET_GCODE_OFFSET Z_ADJUST=0.01 MOVE=1')">+0.01</button>
                    <button onclick="sendGcode('${printer.ip}', 'SET_GCODE_OFFSET Z_ADJUST=-0.01 MOVE=1')">-0.01</button>
                    <button onclick="sendGcode('${printer.ip}', 'SET_GCODE_OFFSET Z_ADJUST=0.05 MOVE=1')">+0.05</button>
                    <button onclick="sendGcode('${printer.ip}', 'SET_GCODE_OFFSET Z_ADJUST=-0.05 MOVE=1')">-0.05</button>
                </div>

                <div class="controls-row">
                    <input type="number" id="hotend-${printer.ip}" placeholder="Hotend Target">
                    <button onclick="setTemp('${printer.ip}', 'extruder', 'hotend-${printer.ip}')">Set Hotend</button>
                </div>
                
                <div class="controls-row">
                    <input type="number" id="bed-${printer.ip}" placeholder="Bed Target">
                    <button onclick="setTemp('${printer.ip}', 'heater_bed', 'bed-${printer.ip}')">Set Bed</button>
                </div>

                <div class="controls-row">
                    <select id="macro-select-${printer.ip}">
                        <option value="">Select Macro...</option>
                    </select>
                    <button onclick="runSelectedMacro('${printer.ip}')">Run</button>
                </div>
                
                <div class="temp-footer">
                    <span>Hotend: <strong id="hotend-read-${printer.ip}">0.0</strong>°C</span>
                    <span>Bed: <strong id="bed-read-${printer.ip}">0.0</strong>°C</span>
                </div>
            </div>
        `;
        grid.appendChild(card);
        connectWebSocket(printer);
    });
}

async function checkCorsStatus(ip) {
    try {
        await fetch(`http://${ip}:7125/printer/info`);
        return false; 
    } catch (e) {
        try {
            await fetch(`http://${ip}:7125/printer/info`, { mode: 'no-cors' });
            return true; 
        } catch (pingErr) {
            return false; 
        }
    }
}

function connectWebSocket(printer) {
    if (sockets[printer.ip]) {
        sockets[printer.ip].close();
    }

    const ws = new WebSocket(`ws://${printer.ip}:${printer.port}/websocket`);
    sockets[printer.ip] = ws;

    ws.onopen = () => {
        const statusEl = document.getElementById(`status-${printer.ip}`);
        if(statusEl) {
            statusEl.textContent = "Connected";
            statusEl.style.background = "var(--success)";
        }
        
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "printer.objects.query",
            params: { objects: { print_stats: null, extruder: null, heater_bed: null } },
            id: 1
        }));
        
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "printer.objects.subscribe",
            params: { objects: { print_stats: null, extruder: null, heater_bed: null } },
            id: 2
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.result && data.result.status) updatePrinterUI(printer.ip, data.result.status);
        if (data.method === "notify_status_update") updatePrinterUI(printer.ip, data.params[0]);
    };

    ws.onclose = async () => {
        const statusEl = document.getElementById(`status-${printer.ip}`);
        if (statusEl) {
            statusEl.textContent = "Checking...";
            const isCorsBlocked = await checkCorsStatus(printer.ip);
            
            if (isCorsBlocked) {
                statusEl.textContent = "CORS Blocked";
                statusEl.style.background = "var(--danger)";
            } else {
                statusEl.textContent = "Offline";
                statusEl.style.background = "#45475a";
            }
        }
        
        setTimeout(() => {
            if(document.getElementById(`status-${printer.ip}`)) connectWebSocket(printer);
        }, 5000);
    };
}

function updatePrinterUI(ip, status) {
    if (status.print_stats && status.print_stats.state) {
        document.getElementById(`status-${ip}`).textContent = status.print_stats.state.toUpperCase();
    }
    if (status.extruder && status.extruder.temperature !== undefined) {
        document.getElementById(`hotend-read-${ip}`).textContent = status.extruder.temperature.toFixed(1);
    }
    if (status.heater_bed && status.heater_bed.temperature !== undefined) {
        document.getElementById(`bed-read-${ip}`).textContent = status.heater_bed.temperature.toFixed(1);
    }
}

function sendCommand(ip, method, params = {}) {
    const ws = sockets[ip];
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: Date.now() }))
    } else {
        alert("Printer is not connected. Check CORS settings or network.");
    }
}

function sendGcode(ip, script) {
    sendCommand(ip, "printer.gcode.script", { script: script });
}

function setTemp(ip, heater, inputId) {
    const temp = document.getElementById(inputId).value;
    if (temp === "") return;
    sendGcode(ip, `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${temp}`);
}

function runSelectedMacro(ip) {
    const selectEl = document.getElementById(`macro-select-${ip}`);
    const macro = selectEl.value;
    if (macro) {
        sendGcode(ip, macro);
    } else {
        alert("Please select a macro from the dropdown first.");
    }
}
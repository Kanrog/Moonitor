// Register Service Worker for PWA Installation
if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
        navigator.serviceWorker.register('/sw.js').catch(err => console.error('Service Worker registration failed:', err));
    });
}

let sockets = {};
let foundDiscoveredPrinters = [];

document.addEventListener('DOMContentLoaded', loadPrinters);

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
        body: JSON.stringify({ name, ip, port: 7125, webcamPort: 8080, webcamPath: '/webcam/?action=stream' })
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
                    webcamPath: '/webcam/?action=stream'
                })
            });
        }
    }

    document.getElementById('scan-results').style.display = 'none';
    document.getElementById('scan-status-text').innerHTML = '';
    loadPrinters();
}

async function removePrinter(ip) {
    if (sockets[ip]) {
        sockets[ip].close();
        delete sockets[ip];
    }
    await fetch(`/api/printers/${ip}`, { method: 'DELETE' });
    loadPrinters();
}

function openEditModal(ip, currentName) {
    document.getElementById('edit-old-ip').value = ip;
    document.getElementById('edit-name').value = currentName;
    document.getElementById('edit-ip').value = ip;
    document.getElementById('edit-modal').style.display = 'flex';
}

function closeEditModal() {
    document.getElementById('edit-modal').style.display = 'none';
}

async function savePrinterEdit() {
    const oldIp = document.getElementById('edit-old-ip').value;
    const name = document.getElementById('edit-name').value.trim();
    const ip = document.getElementById('edit-ip').value.trim();

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
        body: JSON.stringify({ name, ip })
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

function renderPrinters(printers) {
    const grid = document.getElementById('printer-grid');
    grid.innerHTML = '';

    printers.forEach(printer => {
        const card = document.createElement('div');
        card.className = 'card';
        
        const camPath = printer.webcamPath || '/webcam/?action=stream';
        const primaryCamUrl = `http://${printer.ip}:${printer.webcamPort}${camPath}`;
        const fallbackCamUrl = `http://${printer.ip}/webcam/?action=stream`;

        const safeName = printer.name.replace(/'/g, "\\'").replace(/"/g, '&quot;');

        card.innerHTML = `
            <img class="webcam-feed" src="${primaryCamUrl}" alt="Camera Feed Offline" onerror="if(this.src !== '${fallbackCamUrl}') { this.src = '${fallbackCamUrl}'; } else { this.style.display='none'; }">

            <div class="card-top-bar">
                <h3>${printer.name}</h3>
                <div style="display: flex; gap: 4px; align-items: center;">
                    <span class="status-badge" id="status-${printer.ip}">Connecting...</span>
                    <button class="icon-btn" onclick="openEditModal('${printer.ip}', '${safeName}')" title="Edit Printer">⚙️</button>
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
        ws.send(JSON.stringify({ jsonrpc: "2.0", method: method, params: params, id: Date.now() }));
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
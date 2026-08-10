let sockets = {};

document.addEventListener('DOMContentLoaded', loadPrinters);

async function loadPrinters() {
    const res = await fetch('/api/printers');
    const printers = await res.json();
    renderPrinters(printers);
}

async function addManualPrinter() {
    const name = document.getElementById('manual-name').value;
    const ip = document.getElementById('manual-ip').value;
    if (!name || !ip) return alert("Please enter both a name and an IP address.");

    await fetch('/api/printers', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, ip, port: 7125, webcamPort: 8080 })
    });
    
    document.getElementById('manual-name').value = '';
    document.getElementById('manual-ip').value = '';
    loadPrinters();
}

async function scanNetwork() {
    const res = await fetch('/api/printers/scan');
    const discovered = await res.json();
    const scanDiv = document.getElementById('scan-results');
    scanDiv.style.display = 'flex';
    scanDiv.innerHTML = '';
    
    if (discovered.length === 0) {
        scanDiv.innerHTML = '<span>No new printers found on network.</span>';
        setTimeout(() => scanDiv.style.display = 'none', 3000);
        return;
    }

    discovered.forEach(p => {
        const btn = document.createElement('button');
        btn.textContent = `Add ${p.name} (${p.ip})`;
        btn.onclick = async () => {
            await fetch('/api/printers', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ name: p.name, ip: p.ip, port: p.port, webcamPort: 8080 })
            });
            scanDiv.style.display = 'none';
            loadPrinters();
        };
        scanDiv.appendChild(btn);
    });
}

async function removePrinter(ip) {
    if (sockets[ip]) {
        sockets[ip].close();
        delete sockets[ip];
    }
    await fetch(`/api/printers/${ip}`, { method: 'DELETE' });
    loadPrinters();
}

function renderPrinters(printers) {
    const grid = document.getElementById('printer-grid');
    grid.innerHTML = '';

    printers.forEach(printer => {
        const card = document.createElement('div');
        card.className = 'card';
        
        // Crowsnest / mjpg-streamer standard URL: http://IP:8080/?action=stream
        card.innerHTML = `
            <div class="card-header">
                <h3>${printer.name}</h3>
                <div>
                    <span class="status-badge" id="status-${printer.ip}">Connecting...</span>
                    <button class="remove-btn" onclick="removePrinter('${printer.ip}')">X</button>
                </div>
            </div>
            
            <div class="webcam-container">
                <img src="http://${printer.ip}:${printer.webcamPort}/?action=stream" alt="Webcam offline or loading..." onerror="this.src=''; this.alt='No Camera Stream Found';">
            </div>

            <div class="controls-row">
                <button onclick="sendCommand('${printer.ip}', 'printer.print.pause')">Pause</button>
                <button onclick="sendCommand('${printer.ip}', 'printer.print.resume')">Resume</button>
                <button class="danger" onclick="sendCommand('${printer.ip}', 'printer.print.cancel')">Cancel</button>
            </div>

            <div class="controls-row">
                <button onclick="sendGcode('${printer.ip}', 'G28')">Home All</button>
                <button onclick="sendGcode('${printer.ip}', 'G28 X Y')">Home X/Y</button>
                <button onclick="sendGcode('${printer.ip}', 'G28 Z')">Home Z</button>
            </div>
            
            <div class="controls-row" style="align-items: center;">
                <span style="font-size: 0.9em; flex: none;">Z-Offset:</span>
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
                <input type="text" id="macro-${printer.ip}" placeholder="Macro Name (e.g. LOAD_FILAMENT)">
                <button onclick="runMacro('${printer.ip}')">Run Macro</button>
            </div>
            
            <div style="font-size: 0.85em; margin-top: 5px; display: flex; justify-content: space-between; background: #1e1e2e; padding: 10px; border-radius: 4px;">
                <span>Hotend: <strong id="hotend-read-${printer.ip}">0.0</strong>°C</span>
                <span>Bed: <strong id="bed-read-${printer.ip}">0.0</strong>°C</span>
            </div>
        `;
        grid.appendChild(card);
        connectWebSocket(printer);
    });
}

function connectWebSocket(printer) {
    if (sockets[printer.ip]) {
        sockets[printer.ip].close();
    }

    const ws = new WebSocket(`ws://${printer.ip}:${printer.port}/websocket`);
    sockets[printer.ip] = ws;

    ws.onopen = () => {
        document.getElementById(`status-${printer.ip}`).textContent = "Connected";
        
        // Request the initial state of the printer
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "printer.objects.query",
            params: {
                objects: {
                    print_stats: null,
                    extruder: null,
                    heater_bed: null
                }
            },
            id: 1
        }));
        
        // Subscribe to live push updates
        ws.send(JSON.stringify({
            jsonrpc: "2.0",
            method: "printer.objects.subscribe",
            params: {
                objects: {
                    print_stats: null,
                    extruder: null,
                    heater_bed: null
                }
            },
            id: 2
        }));
    };

    ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        
        // Handle the initial state payload
        if (data.result && data.result.status) {
            updatePrinterUI(printer.ip, data.result.status);
        }
        
        // Handle live subscription updates
        if (data.method === "notify_status_update") {
            updatePrinterUI(printer.ip, data.params[0]);
        }
    };

    ws.onclose = () => {
        const statusEl = document.getElementById(`status-${printer.ip}`);
        if(statusEl) statusEl.textContent = "Disconnected";
        
        // Attempt to reconnect every 5 seconds if connection drops
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
    }
}

// Moonraker uses printer.gcode.script to send raw commands directly to Klipper
function sendGcode(ip, script) {
    sendCommand(ip, "printer.gcode.script", { script: script });
}

function setTemp(ip, heater, inputId) {
    const temp = document.getElementById(inputId).value;
    if (temp === "") return;
    sendGcode(ip, `SET_HEATER_TEMPERATURE HEATER=${heater} TARGET=${temp}`);
}

function runMacro(ip) {
    const macro = document.getElementById(`macro-${ip}`).value.trim();
    if (macro) sendGcode(ip, macro);
}
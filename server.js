const express = require('express');
const path = require('path');
const Bonjour = require('bonjour-service');
const cors = require('cors');
const fs = require('fs');
const http = require('http');

const app = express();
const port = 3366;
const bonjour = new Bonjour.Bonjour();

app.use(cors());
app.use(express.static(path.join(__dirname, 'public')));
app.use(express.json());

const dbPath = path.join(__dirname, 'printers.json');

let savedPrinters = [];
if (fs.existsSync(dbPath)) {
    savedPrinters = JSON.parse(fs.readFileSync(dbPath));
}

function saveDatabase() {
    fs.writeFileSync(dbPath, JSON.stringify(savedPrinters, null, 2));
}

let discoveredPrinters = {};

// mDNS Scanning (Fallback 1)
bonjour.find({ type: 'http' }, function (service) {
    if (service.name.toLowerCase().includes('moonraker') || service.name.toLowerCase().includes('mainsail') || service.name.toLowerCase().includes('fluidd')) {
        const ip = service.addresses.find(addr => addr.includes('.')); 
        if (ip) {
            discoveredPrinters[ip] = {
                name: service.name,
                ip: ip,
                port: service.port || 7125
            };
        }
    }
});

// mDNS Scanning (Fallback 2)
bonjour.find({ type: 'moonraker' }, function (service) {
    const ip = service.addresses.find(addr => addr.includes('.'));
    if (ip) {
        discoveredPrinters[ip] = {
            name: service.name,
            ip: ip,
            port: service.port || 7125
        };
    }
});

// Active Subnet Probing
function probeMoonrakerIP(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}:7125/printer/info`, { timeout: 800 }, (res) => {
            let body = '';
            res.on('data', chunk => body += chunk);
            res.on('end', () => {
                try {
                    const data = JSON.parse(body);
                    const hostname = data?.result?.hostname || `Printer (${ip})`;
                    resolve({ found: true, ip, name: hostname, port: 7125 });
                } catch (e) {
                    resolve({ found: true, ip, name: `Klipper (${ip})`, port: 7125 });
                }
            });
        });

        req.on('error', () => resolve({ found: false }));
        req.on('timeout', () => {
            req.destroy();
            resolve({ found: false });
        });
    });
}

// API Endpoints
app.get('/api/printers/scan', async (req, res) => {
    const results = { ...discoveredPrinters };
    
    const networkInterfaces = require('os').networkInterfaces();
    let localSubnet = '192.168.0';
    
    // Auto-detect the host's subnet
    for (const name of Object.keys(networkInterfaces)) {
        for (const net of networkInterfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                localSubnet = net.address.split('.').slice(0, 3).join('.');
                break;
            }
        }
    }

    // Active batched IP sweep
    const BATCH_SIZE = 15;
    for (let i = 1; i <= 254; i += BATCH_SIZE) {
        const batch = [];
        for (let j = i; j < Math.min(i + BATCH_SIZE, 255); j++) {
            const ip = `${localSubnet}.${j}`;
            if (!results[ip]) { 
                batch.push(probeMoonrakerIP(ip));
            }
        }
        const batchResults = await Promise.all(batch);
        batchResults.forEach(r => {
            if (r.found) {
                results[r.ip] = { name: r.name, ip: r.ip, port: r.port };
            }
        });
    }

    res.json(Object.values(results));
});

app.get('/api/printers', (req, res) => {
    res.json(savedPrinters);
});

app.post('/api/printers', (req, res) => {
    const { name, ip, port, webcamPort } = req.body;
    if (!savedPrinters.find(p => p.ip === ip)) {
        savedPrinters.push({ 
            name, 
            ip, 
            port: port || 7125, 
            webcamPort: webcamPort || 8080 
        });
        saveDatabase();
    }
    res.json({ success: true, printers: savedPrinters });
});

app.delete('/api/printers/:ip', (req, res) => {
    savedPrinters = savedPrinters.filter(p => p.ip !== req.params.ip);
    saveDatabase();
    res.json({ success: true, printers: savedPrinters });
});

app.listen(port, () => {
    console.log(`Moonitor running at http://localhost:${port}`);
});
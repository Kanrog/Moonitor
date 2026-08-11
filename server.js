const express = require('express');
const path = require('path');
const Bonjour = require('bonjour-service');
const cors = require('cors');
const fs = require('fs');
const http = require('http');
const os = require('os');

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

bonjour.find({ type: 'http' }, function (service) {
    if (service.name.toLowerCase().includes('moonraker') || service.name.toLowerCase().includes('mainsail') || service.name.toLowerCase().includes('fluidd')) {
        const ip = service.addresses.find(addr => addr.includes('.')); 
        if (ip) {
            discoveredPrinters[ip] = { name: service.name, ip: ip, port: service.port || 7125 };
        }
    }
});

bonjour.find({ type: 'moonraker' }, function (service) {
    const ip = service.addresses.find(addr => addr.includes('.'));
    if (ip) {
        discoveredPrinters[ip] = { name: service.name, ip: ip, port: service.port || 7125 };
    }
});

function getSubnetFromIP(ipStr) {
    if (!ipStr) return null;
    const cleanIP = ipStr.replace(/^.*:/, ''); 
    const parts = cleanIP.split('.');
    if (parts.length === 4 && parts[0] !== '127') return parts.slice(0, 3).join('.');
    return null;
}

function getCandidateSubnets(req) {
    const subnets = new Set();
    const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
    const clientSubnet = getSubnetFromIP(clientIp);
    if (clientSubnet) subnets.add(clientSubnet);

    const networkInterfaces = os.networkInterfaces();
    const ignoreIfaces = ['lo', 'docker', 'br-', 'veth', 'tailscale', 'tun', 'tap', 'vbox'];

    for (const ifaceName of Object.keys(networkInterfaces)) {
        if (ignoreIfaces.some(ign => ifaceName.toLowerCase().startsWith(ign))) continue;
        for (const net of networkInterfaces[ifaceName]) {
            if (net.family === 'IPv4' && !net.internal) {
                const sub = getSubnetFromIP(net.address);
                if (sub) subnets.add(sub);
            }
        }
    }
    if (subnets.size === 0) { subnets.add('192.168.0'); subnets.add('192.168.1'); }
    return Array.from(subnets);
}

function probeMoonrakerIP(ip) {
    return new Promise((resolve) => {
        const req = http.get(`http://${ip}:7125/printer/info`, { timeout: 600 }, (res) => {
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
        req.on('timeout', () => { req.destroy(); resolve({ found: false }); });
    });
}

app.get('/api/printers/scan', async (req, res) => {
    const results = { ...discoveredPrinters };
    const subnets = getCandidateSubnets(req);
    const BATCH_SIZE = 20;
    
    for (const subnet of subnets) {
        for (let i = 1; i <= 254; i += BATCH_SIZE) {
            const batch = [];
            for (let j = i; j < Math.min(i + BATCH_SIZE, 255); j++) {
                const ip = `${subnet}.${j}`;
                if (!results[ip]) batch.push(probeMoonrakerIP(ip));
            }
            const batchResults = await Promise.all(batch);
            batchResults.forEach(r => { if (r.found) results[r.ip] = { name: r.name, ip: r.ip, port: r.port }; });
        }
    }
    res.json(Object.values(results));
});

app.get('/api/printers', (req, res) => {
    res.json(savedPrinters);
});

app.post('/api/printers', (req, res) => {
    const { name, ip, port, webcamPort, webcamPath } = req.body;
    if (!savedPrinters.find(p => p.ip === ip)) {
        savedPrinters.push({ 
            name, 
            ip, 
            port: port || 7125, 
            webcamPort: webcamPort || 8080,
            webcamPath: webcamPath || '/webcam/?action=stream'
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
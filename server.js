const express = require('express');
const path = require('path');
const Bonjour = require('bonjour-service');
const cors = require('cors');
const fs = require('fs');

const app = express();
const port = 3333;
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
            discoveredPrinters[ip] = {
                name: service.name,
                ip: ip,
                port: service.port || 7125
            };
        }
    }
});

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

app.get('/api/printers/scan', (req, res) => {
    res.json(Object.values(discoveredPrinters));
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
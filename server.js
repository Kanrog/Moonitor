const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');
const os = require('os');

const app = express();
const server = http.createServer(app);
const PORT = 3366;

app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));
app.use('/images', express.static(path.join(__dirname, 'images')));

const DB_FILE = path.join(__dirname, 'printers.json');

function getPrinters() {
    if (!fs.existsSync(DB_FILE)) return [];
    try {
        return JSON.parse(fs.readFileSync(DB_FILE));
    } catch (e) {
        return [];
    }
}

function savePrinters(printers) {
    fs.writeFileSync(DB_FILE, JSON.stringify(printers, null, 2));
}

function getLocalSubnetBase() {
    const interfaces = os.networkInterfaces();
    for (const name of Object.keys(interfaces)) {
        for (const net of interfaces[name]) {
            if (net.family === 'IPv4' && !net.internal) {
                const parts = net.address.split('.');
                return `${parts[0]}.${parts[1]}.${parts[2]}.`;
            }
        }
    }
    return '192.168.0.';
}

// Helper to query Moonraker for its actual hostname/printer name
async function fetchMoonrakerName(ip) {
    return new Promise((resolve) => {
        const reqTimer = setTimeout(() => resolve(`Printer (${ip})`), 500);
        http.get(`http://${ip}:7125/printer/info`, (res) => {
            let data = '';
            res.on('data', chunk => data += chunk);
            res.on('end', () => {
                clearTimeout(reqTimer);
                try {
                    const json = JSON.parse(data);
                    const hostname = json?.result?.hostname;
                    resolve(hostname ? hostname : `Printer (${ip})`);
                } catch (e) {
                    resolve(`Printer (${ip})`);
                }
            });
        }).on('error', () => {
            clearTimeout(reqTimer);
            resolve(`Printer (${ip})`);
        });
    });
}

app.get('/api/printers', (req, res) => {
    res.json(getPrinters());
});

app.post('/api/printers', async (req, res) => {
    let { name, ip, port, webcamPort, webcamPath, cameraEnabled, rotation, mirror } = req.body;
    const printers = getPrinters();
    
    if (!name || name.startsWith('Printer (')) {
        name = await fetchMoonrakerName(ip);
    }

    const newPrinter = {
        name,
        ip,
        port: port || 7125,
        webcamPort: webcamPort || 8080,
        webcamPath: webcamPath || '/webcam/?action=stream',
        cameraEnabled: cameraEnabled !== undefined ? cameraEnabled : true,
        rotation: rotation !== undefined ? parseInt(rotation) : 0,
        mirror: mirror !== undefined ? mirror : false
    };

    printers.push(newPrinter);
    savePrinters(printers);
    res.json({ success: true, printer: newPrinter });
});

app.put('/api/printers/:oldIp', (req, res) => {
    const { oldIp } = req.params;
    const { name, ip, port, webcamPort, webcamPath, cameraEnabled, rotation, mirror } = req.body;
    let printers = getPrinters();
    
    printers = printers.map(p => {
        if (p.ip === oldIp) {
            return {
                ...p,
                name: name !== undefined ? name : p.name,
                ip: ip !== undefined ? ip : p.ip,
                port: port !== undefined ? port : p.port,
                webcamPort: webcamPort !== undefined ? webcamPort : p.webcamPort,
                webcamPath: webcamPath !== undefined ? webcamPath : p.webcamPath,
                cameraEnabled: cameraEnabled !== undefined ? cameraEnabled : p.cameraEnabled,
                rotation: rotation !== undefined ? parseInt(rotation) : (p.rotation || 0),
                mirror: mirror !== undefined ? mirror : (p.mirror || false)
            };
        }
        return p;
    });

    savePrinters(printers);
    res.json({ success: true });
});

app.delete('/api/printers/:ip', (req, res) => {
    const { ip } = req.params;
    let printers = getPrinters();
    printers = printers.filter(p => p.ip !== ip);
    savePrinters(printers);
    res.json({ success: true });
});

app.get('/api/printers/scan', async (req, res) => {
    const baseSubnet = getLocalSubnetBase();
    const existing = getPrinters();
    const existingIps = new Set(existing.map(p => p.ip));

    let foundPrinters = [];
    const batchSize = 40; // Controlled concurrency to prevent socket saturation

    for (let i = 1; i < 255; i += batchSize) {
        const batchPromises = [];
        for (let j = i; j < i + batchSize && j < 255; j++) {
            const testIp = baseSubnet + j;
            if (existingIps.has(testIp)) continue;

            batchPromises.push(
                new Promise((resolve) => {
                    const reqTimer = setTimeout(() => resolve(null), 600);
                    http.get(`http://${testIp}:7125/printer/info`, (response) => {
                        let data = '';
                        response.on('data', chunk => data += chunk);
                        response.on('end', () => {
                            clearTimeout(reqTimer);
                            if (response.statusCode === 200) {
                                try {
                                    const json = JSON.parse(data);
                                    const hostname = json?.result?.hostname || `Printer (${testIp})`;
                                    resolve({ name: hostname, ip: testIp, port: 7125 });
                                } catch (e) {
                                    resolve({ name: `Printer (${testIp})`, ip: testIp, port: 7125 });
                                }
                            } else {
                                resolve(null);
                            }
                        });
                    }).on('error', () => {
                        clearTimeout(reqTimer);
                        resolve(null);
                    });
                })
            );
        }

        const results = await Promise.all(batchPromises);
        results.forEach(p => {
            if (p !== null && !foundPrinters.some(existingP => existingP.ip === p.ip)) {
                foundPrinters.push(p);
            }
        });
    }

    res.json(foundPrinters);
});

server.listen(PORT, () => {
    console.log(`Moonitor server running at http://localhost:${PORT}`);
});
const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const dgram = require('dgram');
const fs = require('fs');
const path = require('path');

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

app.get('/api/printers', (req, res) => {
    res.json(getPrinters());
});

app.post('/api/printers', (req, res) => {
    const { name, ip, port, webcamPort, webcamPath, cameraEnabled, rotation, mirror } = req.body;
    const printers = getPrinters();
    
    const newPrinter = {
        name: name || `Printer (${ip})`,
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

app.get('/api/printers/scan', (req, res) => {
    const message = Buffer.from('M-SEARCH * HTTP/1.1\r\nHOST: 239.255.255.250:1900\r\nMAN: "ssdp:discover"\r\nMX: 2\r\nST: urn:schemas-upnp-org:device:Basic:1\r\n\r\n');
    const client = dgram.createSocket('udp4');
    let foundDevices = [];

    client.on('message', (msg, rinfo) => {
        const response = msg.toString();
        if (response.includes('Moonraker') || response.includes('Klipper') || rinfo.address) {
            if (!foundDevices.some(d => d.ip === rinfo.address)) {
                foundDevices.push({ name: `Printer (${rinfo.address})`, ip: rinfo.address, port: 7125 });
            }
        }
    });

    client.bind(() => {
        try {
            client.setBroadcast(true);
            client.send(message, 0, message.length, 1900, '239.255.255.250');
        } catch (e) {}
    });

    setTimeout(async () => {
        client.close();
        const subnetPrinters = [...foundDevices];
        const baseIp = '192.168.0.';
        
        const existing = getPrinters();
        const existingIps = new Set(existing.map(p => p.ip));

        const promises = [];
        for (let i = 1; i < 255; i++) {
            const testIp = baseIp + i;
            if (existingIps.has(testIp) || subnetPrinters.some(p => p.ip === testIp)) continue;

            promises.push(
                new Promise((resolve) => {
                    const reqTimer = setTimeout(() => resolve(null), 300);
                    http.get(`http://${testIp}:7125/printer/info`, (res) => {
                        clearTimeout(reqTimer);
                        if (res.statusCode === 200) {
                            resolve({ name: `Printer (${testIp})`, ip: testIp, port: 7125 });
                        } else {
                            resolve(null);
                        }
                    }).on('error', () => {
                        clearTimeout(reqTimer);
                        resolve(null);
                    });
                })
            );
        }

        const results = await Promise.all(promises);
        results.forEach(p => {
            if (p && !subnetPrinters.some(existingP => existingP.ip === p.ip)) {
                subnetPrinters.push(p);
            }
        });

        res.json(subnetPrinters);
    }, 2500);
});

server.listen(PORT, () => {
    console.log(`Moonitor server running at http://localhost:${PORT}`);
});
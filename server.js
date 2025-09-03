const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs');
const { v4: uuidv4 } = require('uuid'); // Um einzigartige IDs zu erstellen

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DB_FILE = path.join(__dirname, 'db.json');

app.use(express.static(path.join(__dirname, 'public')));

// In-memory state
let drawingHistory = [];
let participants = [];
let sharedNotepadContent = '';
const clients = new Map(); // Speichert verbundene Clients und ihre Metadaten

// --- Hilfsfunktionen ---
function getRandomColor() {
    const letters = '0123456789ABCDEF';
    let color = '#';
    for (let i = 0; i < 6; i++) {
        color += letters[Math.floor(Math.random() * 16)];
    }
    return color;
}

// --- Datenbankfunktionen ---
function saveData() {
    try {
        const dataToSave = {
            drawingHistory,
            participants,
            sharedNotepadContent,
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(dataToSave, null, 2));
    } catch (error) {
        console.error('Fehler beim Speichern der Daten:', error);
    }
}

function loadData() {
    try {
        if (fs.existsSync(DB_FILE)) {
            const rawData = fs.readFileSync(DB_FILE);
            const data = JSON.parse(rawData);
            drawingHistory = data.drawingHistory || [];
            participants = data.participants || [];
            sharedNotepadContent = data.sharedNotepadContent || '';
            console.log('Daten erfolgreich aus db.json geladen.');
        }
    } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
    }
}

// --- WebSocket Logik ---
loadData();

wss.on('connection', ws => {
    const id = uuidv4();
    const color = getRandomColor();
    const metadata = { id, color };
    clients.set(ws, metadata);

    // Initialdaten an den neuen Client senden
    ws.send(JSON.stringify({ type: 'init', data: { id, color, clients: Array.from(clients.values()) } }));
    ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
    ws.send(JSON.stringify({ type: 'participantsUpdate', data: participants }));
    ws.send(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepadContent }));

    // Allen anderen den neuen Client mitteilen
    broadcast(JSON.stringify({ type: 'userConnected', data: metadata }), ws);

    ws.on('message', message => {
        const msg = JSON.parse(message);
        const senderMeta = clients.get(ws);

        switch (msg.type) {
            case 'draw':
                drawingHistory.push(msg.data);
                broadcast(JSON.stringify({ type: 'draw', data: msg.data }));
                saveData();
                break;
            case 'clear':
                drawingHistory = [];
                broadcast(JSON.stringify({ type: 'clear' }));
                saveData();
                break;
            case 'getHistory':
                ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
                break;
            case 'register':
                const name = msg.data.name.trim();
                if (name && !participants.includes(name)) {
                    participants.push(name);
                    broadcast(JSON.stringify({ type: 'participantsUpdate', data: participants }));
                    saveData();
                } else if (participants.includes(name)) {
                    ws.send(JSON.stringify({ type: 'registrationError', message: 'Dieser Name ist bereits vergeben.' }));
                }
                break;
            case 'notepadUpdate':
                sharedNotepadContent = msg.data;
                broadcast(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepadContent }), ws);
                saveData();
                break;
            case 'mouseMove':
                senderMeta.x = msg.data.x;
                senderMeta.y = msg.data.y;
                broadcast(JSON.stringify({ type: 'mouseMove', data: { id: senderMeta.id, x: msg.data.x, y: msg.data.y } }), ws);
                break;
        }
    });

    ws.on('close', () => {
        const metadata = clients.get(ws);
        broadcast(JSON.stringify({ type: 'userDisconnected', data: { id: metadata.id } }));
        clients.delete(ws);
    });
});

function broadcast(data, exclude) {
    wss.clients.forEach(client => {
        if (client !== exclude && client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

const PORT = 8080;
server.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
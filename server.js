const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const fs = require('fs'); // Import File System module

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

const DB_FILE = path.join(__dirname, 'db.json');

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let drawingHistory = [];
let participants = [];
let sharedNotepadContent = ''; // Variable für den geteilten Notepad-Inhalt

// --- Database Functions ---
function saveData() {
    try {
        const dataToSave = {
            drawingHistory,
            participants,
            sharedNotepadContent, // Zum Speichern hinzufügen
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
            sharedNotepadContent = data.sharedNotepadContent || ''; // Notepad-Inhalt laden
            console.log('Daten erfolgreich aus db.json geladen.');
        }
    } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
    }
}

// Load data from file on server start
loadData();

wss.on('connection', ws => {
    // Send initial data to the new client
    ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
    ws.send(JSON.stringify({ type: 'participantsUpdate', data: participants }));
    ws.send(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepadContent })); // Gespeicherten Inhalt senden

    ws.on('message', message => {
        const msg = JSON.parse(message);

        switch (msg.type) {
            case 'draw':
                drawingHistory.push(msg.data);
                broadcast(JSON.stringify({ type: 'draw', data: msg.data }));
                saveData(); // Save after drawing
                break;
            case 'clear':
                drawingHistory = [];
                broadcast(JSON.stringify({ type: 'clear' }));
                saveData(); // Save after clearing
                break;
            case 'getHistory':
                ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
                break;
            case 'register':
                const name = msg.data.name.trim();
                if (name && !participants.includes(name)) {
                    participants.push(name);
                    broadcast(JSON.stringify({ type: 'participantsUpdate', data: participants }));
                    saveData(); // Save after registration
                } else if (participants.includes(name)) {
                    ws.send(JSON.stringify({ type: 'registrationError', message: 'Dieser Name ist bereits vergeben.' }));
                }
                break;
            case 'notepadUpdate':
                sharedNotepadContent = msg.data;
                broadcast(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepadContent }));
                saveData(); // Jede Änderung speichern
                break;
        }
    });
});

function broadcast(data) {
    wss.clients.forEach(client => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

const PORT = 8080;
server.listen(PORT, () => console.log(`Server is running on http://localhost:${PORT}`));
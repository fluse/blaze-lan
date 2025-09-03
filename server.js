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
let pollState = {}; // Zustand für die Umfrage
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
            pollState, // Umfrage-Daten mitspeichern
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
            // Umfrage-Daten laden oder initialisieren
            pollState = data.pollState || {
                question: "Welcher Tag passt euch am besten für die BlazeOnline?",
                options: {
                    "18. Oktober": [],
                    "25. Oktober": [],
                    "1. November": [],
                    "8. November": [],
                    "15. November": [],

                }
            };
            console.log('Daten erfolgreich aus db.json geladen.');
        } else {
             // Initialisiere Umfrage-Daten, falls keine DB-Datei existiert
            pollState = {
                question: "Welches Wochenende passt euch am besten?",
                options: {
                    "Nächstes Wochenende": [],
                    "In zwei Wochen": [],
                    "In drei Wochen": []
                }
            };
        }
    } catch (error) {
        console.error('Fehler beim Laden der Daten:', error);
    }
}

// --- WebSocket Logik ---
loadData();

wss.on('connection', ws => {
    const id = uuidv4();
    const color = getRandomColor(); // Start with a random color as fallback
    const metadata = { id, color };
    clients.set(ws, metadata);

    // Initialdaten an den neuen Client senden
    ws.send(JSON.stringify({ type: 'init', data: { id, clients: Array.from(clients.values()) } }));
    ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
    ws.send(JSON.stringify({ type: 'participantsUpdate', data: participants }));
    ws.send(JSON.stringify({ type: 'notepadUpdate', data: sharedNotepadContent }));
    ws.send(JSON.stringify({ type: 'pollUpdate', data: pollState })); // Aktuellen Umfragestand senden

    // Allen anderen den neuen Client mitteilen
    broadcast(JSON.stringify({ type: 'userConnected', data: metadata }), ws);

    ws.on('message', message => {
        const msg = JSON.parse(message);
        const senderMeta = clients.get(ws);
        if (!senderMeta) return; // Exit if client is not in map

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
                if (name && !participants.find(p => p.name === name)) {
                    senderMeta.name = name; // Add name to metadata
                    participants.push({ id: senderMeta.id, name });
                    broadcast(JSON.stringify({ type: 'participantsUpdate', data: participants }));
                    broadcast(JSON.stringify({ type: 'nameUpdate', data: { id: senderMeta.id, name: name } }));
                    saveData();
                } else if (participants.find(p => p.name === name)) {
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
            case 'vote':
                const option = msg.data.option;
                const voterId = senderMeta.id;
                
                if (pollState.options[option]) {
                    Object.keys(pollState.options).forEach(key => {
                        const index = pollState.options[key].indexOf(voterId);
                        if (index > -1) {
                            pollState.options[key].splice(index, 1);
                        }
                    });
                    pollState.options[option].push(voterId);
                    broadcast(JSON.stringify({ type: 'pollUpdate', data: pollState }));
                    saveData();
                }
                break;
            
            // NEU: Case für die Farbaktualisierung
            case 'colorUpdate':
                const newColor = msg.data.color;
                senderMeta.color = newColor; // Update color in the server's in-memory state
                // Broadcast the color change to all other clients so they can update the cursor
                broadcast(JSON.stringify({ type: 'colorUpdate', data: { id: senderMeta.id, color: newColor } }));
                break;
        }
    });

    ws.on('close', () => {
        const metadata = clients.get(ws);
        if (metadata) {
            // Teilnehmer aus der Liste entfernen, falls er registriert war
            const participantIndex = participants.findIndex(p => p.id === metadata.id);
            if (participantIndex > -1) {
                participants.splice(participantIndex, 1);
                // Die aktualisierte Teilnehmerliste an alle senden
                broadcast(JSON.stringify({ type: 'participantsUpdate', data: participants }));
                saveData(); // Änderungen speichern
            }

            // Allen anderen mitteilen, dass der Benutzer die Verbindung getrennt hat
            broadcast(JSON.stringify({ type: 'userDisconnected', data: { id: metadata.id } }));
            clients.delete(ws);
        }
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


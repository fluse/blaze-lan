const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const app = express();
const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// Serve static files from the 'public' directory
app.use(express.static(path.join(__dirname, 'public')));

let drawingHistory = [];
let participants = [];

wss.on('connection', ws => {
    // Send initial data to the new client
    ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
    ws.send(JSON.stringify({ type: 'participantsUpdate', data: participants }));

    ws.on('message', message => {
        const msg = JSON.parse(message);

        switch (msg.type) {
            case 'draw':
                drawingHistory.push(msg.data);
                broadcast(JSON.stringify({ type: 'draw', data: msg.data }));
                break;
            case 'clear':
                drawingHistory = [];
                broadcast(JSON.stringify({ type: 'clear' }));
                break;
            case 'getHistory':
                ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
                break;
            case 'register':
                const name = msg.data.name.trim();
                if (name && !participants.includes(name)) {
                    participants.push(name);
                    broadcast(JSON.stringify({ type: 'participantsUpdate', data: participants }));
                } else if (participants.includes(name)) {
                    ws.send(JSON.stringify({ type: 'registrationError', message: 'Dieser Name ist bereits vergeben.' }));
                }
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
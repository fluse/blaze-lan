const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');

const PORT = 8080;

// We use Express to serve the static HTML file
const app = express();
app.use(express.static(path.join(__dirname, 'public')));

const server = http.createServer(app);
const wss = new WebSocket.Server({ server });

// In-memory storage for all drawing segments.
// For a real production app, you might want a database.
// For a LAN party, this is perfectly fine.
let drawingHistory = [];

wss.on('connection', (ws) => {
    console.log('Ein neuer Freund ist beigetreten!');

    // When a new client connects, send them the entire drawing history
    ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));

    ws.on('message', (message) => {
        const parsedMessage = JSON.parse(message);

        if (parsedMessage.type === 'draw') {
            // Add the new segment to our history
            drawingHistory.push(parsedMessage.data);
            // Broadcast the new segment to all other clients
            broadcast(message.toString());
        } else if (parsedMessage.type === 'clear') {
            // Clear the history
            drawingHistory = [];
            // Tell all clients to clear their canvas
            broadcast(JSON.stringify({ type: 'clear' }));
            console.log('Leinwand wurde geleert!');
        } else if (parsedMessage.type === 'getHistory') {
            // A client resized and requests the history again
             ws.send(JSON.stringify({ type: 'history', data: drawingHistory }));
        }
    });

    ws.on('close', () => {
        console.log('Ein Freund hat die Party verlassen.');
    });

    ws.on('error', (error) => {
        console.error('WebSocket Fehler:', error);
    });
});

// Helper function to send a message to all connected clients
function broadcast(data) {
    wss.clients.forEach((client) => {
        if (client.readyState === WebSocket.OPEN) {
            client.send(data);
        }
    });
}

// Serve the main html file
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'public', 'lan_party_canvas.html'));
});


server.listen(PORT, () => {
    console.log(`LAN Party Server läuft auf Hochtouren auf Port ${PORT}!`);
});

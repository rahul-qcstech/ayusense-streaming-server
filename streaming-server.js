// streaming-server.js
require('dotenv').config();
const { WebSocketServer } = require('ws');
const { SpeechClient } = require('@google-cloud/speech');

// --- Robust Google Cloud Authentication ---
let speechClient;
try {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error('The GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  }
  const credentials = JSON.parse(credentialsJson);
  speechClient = new SpeechClient({ credentials });
} catch (error) {
  console.error('FATAL: Failed to initialize Google Speech Client.', error);
  process.exit(1);
}
// --- End of Authentication Logic ---

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server started on port 8080');

// --- Heartbeat Mechanism ---
function heartbeat() {
  this.isAlive = true;
}
const interval = setInterval(function ping() {
  wss.clients.forEach(function each(ws) {
    if (ws.isAlive === false) return ws.terminate();
    ws.isAlive = false;
    ws.ping();
  });
}, 30000);
wss.on('close', function close() {
  clearInterval(interval);
});
// --- End of Heartbeat Mechanism ---

wss.on('connection', (ws) => {
  console.log('Client connected. Initializing Google Speech stream.');
  
  ws.isAlive = true;
  ws.on('pong', heartbeat);

  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'en-US', 
        alternativeLanguageCodes: ['hi-IN'],
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on('error', (error) => {
      console.error('Google Speech-to-Text Error:', error);
    })
    .on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data.results[0]));
      }
    });

  ws.on('message', (message) => {
    // --- Start of New Debugging Code ---
    console.log(`Received audio chunk of size: ${message.length}`);
    // --- End of New Debugging Code ---
    recognizeStream.write(message);
  });

  ws.on('close', () => {
    console.log('Client disconnected. Destroying Google Speech stream.');
    recognizeStream.destroy();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    recognizeStream.destroy();
  });
});

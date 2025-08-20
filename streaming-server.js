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
        languageCode: 'en-US', // Reverted to simplest config for debugging
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on('error', (error) => {
      console.error('Google Speech-to-Text Error:', error);
    })
    .on('data', (data) => {
      // --- Start of New Debugging Code --
      console.log('Results received from Google:', JSON.stringify(data.results[0], null, 2));

      // --- End of New Debugging Code ---

      // --- Start of Robust Data Handling ---
      // Google's API is inconsistent. Sometimes the result is the data object itself,
      // and sometimes it's nested in data.results[0]. This handles both cases.
      const result = data.results && data.results.length > 0 ? data.results[0] : data;
      console.log('Alternatives:', result.alternatives);

      if (ws.readyState === ws.OPEN && result && result.alternatives && result.alternatives.length > 0) {
        ws.send(JSON.stringify(result.alternatives[0]));
      }
      // --- End of Robust Data Handling ---
    });

  ws.on('message', (message) => {
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

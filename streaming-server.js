// streaming-server.js
require('dotenv').config();
const { WebSocketServer } = require('ws');
const { SpeechClient } = require('@google-cloud/speech');

const wss = new WebSocketServer({ port: 8080 });

// --- Robust Google Cloud Authentication ---
let speechClient;
try {
  // Render secrets are loaded as environment variables.
  // This code expects the raw JSON content in the variable.
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error('The GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  }
  const credentials = JSON.parse(credentialsJson);
  speechClient = new SpeechClient({ credentials });
} catch (error) {
  console.error('FATAL: Failed to initialize Google Speech Client.', error);
  process.exit(1); // Exit the process if authentication fails
}
// --- End of Authentication Logic ---

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('Client connected');

  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCodes: ['en-US'],
        model: 'latest_long',
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on('error', (error) => {
      console.error('Google Speech-to-Text Error:', error);
      // The stream is now destroyed. We should close the websocket.
      if (ws.readyState === ws.OPEN) {
        ws.close(1011, 'Google Speech-to-Text Error');
      }
    })
    .on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        const result = data.results[0];
        if (result) {
          const transcript = result.alternatives[0]?.transcript || '';
          const isFinal = result.isFinal || false;
          // The API returns the detected language code in the result.
          const languageCode = result.languageCode || '';
          ws.send(JSON.stringify({ transcript, isFinal, languageCode }));
        }
      }
    });

  ws.on('message', (message) => {
    // This is the crucial check.
    if (recognizeStream.writable) {
      recognizeStream.write(message);
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    // If the client disconnects, we need to make sure the stream is cleaned up.
    // destroy() is the most robust way to ensure it's gone.
    recognizeStream.destroy();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    // The 'close' event will be fired next, which will handle cleanup.
  });
});
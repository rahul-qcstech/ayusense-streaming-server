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
  // It's raw JSON, parse it directly (for Render)
  const credentials = JSON.parse(credentialsJson);
  speechClient = new SpeechClient({ credentials });
} catch (error) {
  console.error('FATAL: Failed to initialize Google Speech Client.', error);
  process.exit(1); // Exit the process if authentication fails
}
// --- End of Authentication Logic ---

const wss = new WebSocketServer({ port: 8080 });
console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('Client connected. Initializing Google Speech stream.');

  // Eagerly create the stream to Google as soon as the client connects.
  const recognizeStream = speechClient
    .streamingRecognize({
      config: {
        encoding: 'WEBM_OPUS',
        sampleRateHertz: 48000,
        languageCode: 'en-US', 
        alternativeLanguageCodes: ['hi-IN'], // Use languageCodes for auto-detection
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on('error', (error) => {
      console.error('Google Speech-to-Text Error:', error);
    })
    .on('data', (data) => {
      // As soon as we get a result from Google, send it to the client.
      if (ws.readyState === ws.OPEN) {
        ws.send(JSON.stringify(data.results[0]));
      }
    });

  // When we receive an audio message from the client, simply write it to the stream.
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

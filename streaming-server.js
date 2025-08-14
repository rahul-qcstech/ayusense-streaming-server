// streaming-server.js
const { WebSocketServer } = require('ws');
const { SpeechClient } = require('@google-cloud/speech');

const wss = new WebSocketServer({ port: 8080 });

// --- Robust Google Cloud Authentication ---
let speechClient;
try {
  // Fly.io secrets are loaded as environment variables.
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
        languageCode: 'en-US',
        enableAutomaticPunctuation: true,
      },
      interimResults: true,
    })
    .on('error', (error) => {
      console.error('Google Speech-to-Text Error:', error);
    })
    .on('data', (data) => {
      const transcript = data.results[0]?.alternatives[0]?.transcript || '';
      const isFinal = data.results[0]?.isFinal || false;
      ws.send(JSON.stringify({ transcript, isFinal }));
    });

  ws.on('message', (message) => {
    recognizeStream.write(message);
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    recognizeStream.destroy();
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    recognizeStream.destroy();
  });
});
// streaming-server.js
require('dotenv').config();
const { WebSocketServer } = require('ws');
const { SpeechClient } = require('@google-cloud/speech');

const wss = new WebSocketServer({ port: 8080 });

// --- Google Cloud Authentication ---
// The SpeechClient will automatically find and use the credentials
// from the GOOGLE_APPLICATION_CREDENTIALS environment variable.
let speechClient;
try {
  speechClient = new SpeechClient();
} catch (error) {
  console.error('FATAL: Failed to initialize Google Speech Client.', error);
  console.error('Please ensure your GOOGLE_APPLICATION_CREDENTIALS environment variable is set correctly.');
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
      // The stream is now destroyed. We should close the websocket.
      if (ws.readyState === ws.OPEN) {
        ws.close(1011, 'Google Speech-to-Text Error');
      }
    })
    .on('data', (data) => {
      if (ws.readyState === ws.OPEN) {
        const transcript = data.results[0]?.alternatives[0]?.transcript || '';
        const isFinal = data.results[0]?.isFinal || false;
        ws.send(JSON.stringify({ transcript, isFinal }));
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
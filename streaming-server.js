// streaming-server.js
require('dotenv').config();
const { WebSocketServer } = require('ws');
const { SpeechClient } = require('@google-cloud/speech');

const wss = new WebSocketServer({ port: 8080 });

// --- Robust Google Cloud Authentication ---
let speechClient;
try {
  const credentialsJson = process.env.GOOGLE_APPLICATION_CREDENTIALS;
  if (!credentialsJson) {
    throw new Error('The GOOGLE_APPLICATION_CREDENTIALS environment variable is not set.');
  }

  // Check if the variable contains a file path or raw JSON
  if (credentialsJson.trim().startsWith('{')) {
    // It's raw JSON, parse it directly (for Render)
    const credentials = JSON.parse(credentialsJson);
    speechClient = new SpeechClient({ credentials });
  } else {
    // It's a file path (for local development)
    // The SpeechClient will read the file path from the env var automatically.
    speechClient = new SpeechClient();
  }
} catch (error) {
  console.error('FATAL: Failed to initialize Google Speech Client.', error);
  process.exit(1); // Exit the process if authentication fails
}
// --- End of Authentication Logic ---

console.log('WebSocket server started on port 8080');

wss.on('connection', (ws) => {
  console.log('Client connected');
  let recognizeStream = null;

  ws.on('message', (message) => {
    if (!recognizeStream) {
      console.log('Attempting to create Google Speech stream...');
      recognizeStream = speechClient
        .streamingRecognize({
          config: {
            encoding: 'WEBM_OPUS',
            sampleRateHertz: 48000,
            languageCode: 'en-US',
            alternativeLanguageCodes: ['hi-IN'],
            model: 'latest_long',
            enableAutomaticPunctuation: true,
          },
          interimResults: true,
        })
        .on('error', (error) => {
          console.error('Google Speech-to-Text Error:', error);
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
              const languageCode = result.languageCode || '';
              ws.send(JSON.stringify({ transcript, isFinal, languageCode }));
            }
          }
        });
      console.log('Google Speech stream created.');
    }

    console.log(`Writing message of size ${message.length} to stream.`);
    if (recognizeStream.writable) {
      recognizeStream.write(message);
      console.log('Message written to stream.');
    } else {
      console.log('Stream is not writable.');
    }
  });

  ws.on('close', () => {
    console.log('Client disconnected');
    if (recognizeStream) {
      recognizeStream.destroy();
    }
  });

  ws.on('error', (error) => {
    console.error('WebSocket error:', error);
    if (recognizeStream) {
      recognizeStream.destroy();
    }
  });
});
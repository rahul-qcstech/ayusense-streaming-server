# AyuSense Streaming Server

This is a standalone WebSocket server for the AyuSense application. It handles real-time audio transcription using Google Cloud Speech-to-Text.

## Deployment

This server is designed to be deployed as a standalone service on a platform like Render or Fly.io.

### Environment Variables
- `GOOGLE_APPLICATION_CREDENTIALS`: The raw JSON content of your Google Cloud service account key.
- `PORT`: The port for the WebSocket server to listen on (defaults to 8080).

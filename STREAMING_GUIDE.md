# RTSP Streaming Guide

## Overview

The Video Monitoring Dashboard now supports real-time RTSP streaming with browser-compatible HLS playback. This guide explains how to set up and use the streaming functionality.

## Prerequisites

### 1. Install FFmpeg

FFmpeg is required to convert RTSP streams to HLS format for browser playback.

**Windows:**
```bash
# Option 1: Download from official site
# Go to https://ffmpeg.org/download.html
# Download Windows build and extract to C:\ffmpeg
# Add C:\ffmpeg\bin to PATH

# Option 2: Use winget (Windows 10/11)
winget install ffmpeg

# Option 3: Use Chocolatey (if installed)
choco install ffmpeg
```

**Linux/Mac:**
```bash
# Ubuntu/Debian
sudo apt update && sudo apt install ffmpeg

# macOS
brew install ffmpeg
```

### 2. Verify Installation

```bash
ffmpeg -version
```

## How It Works

1. **RTSP Input**: Camera provides RTSP stream (e.g., `rtsp://admin:password@192.168.1.100:554/stream`)
2. **FFmpeg Conversion**: Backend uses FFmpeg to convert RTSP to HLS format
3. **HLS Output**: Stream is served as HLS segments (`playlist.m3u8` + `.ts` files)
4. **Browser Playback**: Frontend uses HLS.js to play the stream in the browser

## Usage

### 1. Add Camera with RTSP URL

1. Go to **Accounts** tab
2. Create or edit an account
3. Add a camera with a valid RTSP URL:
   ```
   rtsp://username:password@ip_address:port/stream_path
   ```

### 2. Start Live Stream

1. Click the **green eye icon** (👁️) next to any camera
2. Click **"Start Stream"** button
3. Wait for the stream to initialize (2-3 seconds)
4. Video will start playing automatically

### 3. Stream Controls

- **Start Stream**: Begins RTSP to HLS conversion
- **Stop Stream**: Stops the stream and cleans up resources
- **Video Controls**: Standard HTML5 video controls (play, pause, volume, fullscreen)

## API Endpoints

### Start Stream
```http
POST /api/cameras/{camera_id}/start-stream
Authorization: Bearer <token>
```

**Response:**
```json
{
  "message": "Stream started successfully",
  "stream_url": "/streams/1/playlist.m3u8"
}
```

### Stop Stream
```http
POST /api/cameras/{camera_id}/stop-stream
Authorization: Bearer <token>
```

### Check Stream Status
```http
GET /api/cameras/{camera_id}/stream-status
Authorization: Bearer <token>
```

**Response:**
```json
{
  "camera_id": 1,
  "is_streaming": true,
  "stream_url": "/streams/1/playlist.m3u8",
  "rtsp_url": "rtsp://admin:password@192.168.1.100:554/stream"
}
```

## File Structure

```
project/
├── backend/
│   ├── streaming_server.py    # RTSP to HLS conversion
│   └── main.py               # API endpoints
├── streams/                  # HLS output directory
│   └── {camera_id}/
│       ├── playlist.m3u8     # HLS playlist
│       └── segment_*.ts      # Video segments
└── frontend/
    └── src/pages/
        └── VideoAccounts.jsx # Stream viewer UI
```

## Troubleshooting

### Common Issues

1. **"FFmpeg not found"**
   - Install FFmpeg and ensure it's in your PATH
   - Restart the backend after installation

2. **"Failed to start stream"**
   - Check RTSP URL format and credentials
   - Verify camera is accessible from the server
   - Check firewall settings

3. **"Stream playback error"**
   - Ensure HLS.js is loaded correctly
   - Check browser console for errors
   - Try refreshing the page

4. **"HLS is not supported"**
   - Use a modern browser (Chrome, Firefox, Safari, Edge)
   - Ensure JavaScript is enabled

### Debug Mode

Enable debug logging by setting environment variable:
```bash
export LOG_LEVEL=DEBUG
```

### Manual FFmpeg Test

Test RTSP connection manually:
```bash
ffmpeg -i "rtsp://admin:password@192.168.1.100:554/stream" -c:v libx264 -c:a aac -f hls -hls_time 2 -hls_list_size 3 -hls_flags delete_segments -y test.m3u8
```

## Performance Considerations

1. **CPU Usage**: FFmpeg transcoding is CPU-intensive
2. **Network Bandwidth**: HLS segments are served over HTTP
3. **Storage**: Old segments are automatically cleaned up
4. **Concurrent Streams**: Limit based on server capacity

## Security Notes

1. **RTSP Credentials**: Store securely, never log in plain text
2. **Network Access**: Ensure proper firewall configuration
3. **HTTPS**: Use HTTPS in production for secure streaming
4. **Authentication**: All streaming endpoints require valid JWT tokens

## Production Deployment

For production use, consider:

1. **Load Balancing**: Multiple backend instances
2. **CDN**: Use CDN for HLS segment delivery
3. **Monitoring**: Monitor stream health and performance
4. **Backup**: Redundant streaming servers
5. **SSL/TLS**: Secure all communications

## Browser Compatibility

- ✅ Chrome 30+
- ✅ Firefox 42+
- ✅ Safari 8+
- ✅ Edge 12+
- ❌ Internet Explorer (not supported)

## Example RTSP URLs

```
# Generic IP Camera
rtsp://admin:password@192.168.1.100:554/stream1

# Hikvision
rtsp://admin:password@192.168.1.100:554/Streaming/Channels/101

# Dahua
rtsp://admin:password@192.168.1.100:554/cam/realmonitor?channel=1&subtype=0

# Axis
rtsp://admin:password@192.168.1.100:554/axis-media/media.amp

# Foscam
rtsp://admin:password@192.168.1.100:554/videoMain
```

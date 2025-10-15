# Call Recording Retrieval Feature

## Overview

The system now automatically retrieves and stores call recordings from the FreePBX server for all inbound and outbound calls made through the monitoring system.

## How It Works

### 1. Call Recording Storage on PBX
- FreePBX stores all call recordings in: `/var/spool/asterisk/monitor/YYYY/MM/DD/`
- Recording filename format: `parked-{from}-{to}-YYYYMMDD-HHMMSS-{uniqueid}.wav`
- The `uniqueid` is the key identifier used to locate recordings

### 2. Automatic Retrieval Process

When an inbound call event is created:

1. **Webhook receives call** - FreePBX sends call metadata including `uniqueid`
2. **Event created** - Alarm event is created with call details
3. **Background tasks start**:
   - Video capture (5-second clip from camera)
   - **Recording retrieval** (new feature)

### 3. Recording Retrieval Flow

```
Call Ends → Recording appears on PBX (10-30 sec delay)
           ↓
System polls PBX via SFTP every second (up to 60 seconds)
           ↓
Recording found → Downloaded via SFTP
           ↓
Saved locally to /mnt/media/uploads/
           ↓
Added to event's media_paths array
           ↓
WebSocket broadcast to update frontend
           ↓
Appears in History page as playable audio
```

## Implementation Components

### Backend Files

#### 1. `/var/www/videomonitoring/backend/recording_retrieval.py`
- New module for SFTP communication with PBX
- `RecordingRetrieval` class handles:
  - Finding recordings by uniqueid
  - Downloading files from PBX
  - Saving to local storage

Key methods:
- `find_recording_by_uniqueid()` - Searches PBX filesystem for recording
- `download_recording()` - Downloads file via SFTP
- `retrieve_and_download()` - Combined find + download operation

#### 2. `/var/www/videomonitoring/backend/main.py`
- Added `retrieve_call_recording()` function (lines 699-746)
- Integrated into inbound call webhook (lines 866-869)
- Runs as background task to avoid blocking webhook response

### Frontend Files

#### 3. `/var/www/videomonitoring/frontend/src/pages/History.jsx`
- Updated media modal to detect audio files (.wav, .mp3, .ogg)
- Renders HTML5 `<audio>` player for call recordings (lines 275-281)
- Automatically plays when modal opens

### Configuration

#### 4. `/var/www/videomonitoring/backend/.env`
Added PBX SFTP credentials:
```bash
PBX_SFTP_HOST=ipbx.statewidecentralstation.com
PBX_SFTP_PORT=22
PBX_SFTP_USERNAME=recordings_api
PBX_RECORDINGS_PATH=/var/spool/asterisk/monitor
```

**Note**: Authentication uses SSH key (`~/.ssh/pbx_recordings_key`) instead of password for security.

#### 5. PBX Server Setup
Created user `recordings_api` on PBX with:
- Read access to `/var/spool/asterisk/monitor`
- Member of `asterisk` group
- SFTP access enabled via SSH public key authentication
- Public key installed in `~/.ssh/authorized_keys` on PBX

#### 6. SSH Key Authentication
SSH key pair generated on monitoring server:
- Private key: `~/.ssh/pbx_recordings_key` (on monitoring server)
- Public key: Installed on PBX server in `/home/recordings_api/.ssh/authorized_keys`
- Key type: RSA 4096-bit
- Used by `recording_retrieval.py` for secure SFTP connections

### Dependencies

#### 7. Python Package
- **paramiko** - SFTP client library
- Installed via: `pip install paramiko`

## User Experience

### In History Page

When viewing alarm history:

1. **Call events** now show multiple media icons:
   - 🎥 Video icon for 5-second camera capture
   - 🎥 Video/Audio icon for call recording (when available)

2. **Clicking media icon** opens modal with:
   - Audio player for `.wav` recordings
   - Standard HTML5 controls (play, pause, volume, seek)
   - Auto-plays when modal opens

3. **Media appears dynamically**:
   - Video clip appears within seconds of call
   - Audio recording appears 10-60 seconds after call ends (waits for PBX to save file)

## Technical Details

### Timing
- **Recording availability**: 10-30 seconds after call ends (FreePBX processing time)
- **Max wait time**: 60 seconds before giving up
- **Poll interval**: 1 second

### Error Handling
- If recording not found after 60 seconds, logs warning but doesn't fail event
- SFTP connection errors are logged and don't block other features
- Missing recordings don't prevent video capture or other event processing

### Storage
- Recordings stored in: `/mnt/media/uploads/`
- Filename format: `call_recording_YYYYMMDD_HHMMSS_{original_filename}.wav`
- Database stores relative path: `uploads/call_recording_...`

### WebSocket Updates
- When recording is downloaded, WebSocket broadcasts update
- Frontend automatically adds new media to existing event
- No page refresh needed

## Benefits

1. **Complete audit trail** - Every call is recorded and stored with event
2. **Compliance** - Recordings kept locally independent of PBX retention
3. **Investigation** - Operators can listen to exact conversation
4. **Context** - Audio + video provides complete picture of event
5. **Historical analysis** - All recordings searchable via History page

## Future Enhancements

Possible improvements:
- Transcription of recordings (speech-to-text)
- Recording playback in AlarmDetail page (currently only in History)
- Bulk download of recordings
- Recording expiration/cleanup policies
- Outbound call recording (when operator calls contacts)

## Troubleshooting

### Recording not appearing?

1. **Check PBX connectivity**:
   ```bash
   sftp recordings_api@ipbx.statewidecentralstation.com
   ```

2. **Check recording exists on PBX**:
   ```bash
   ls /var/spool/asterisk/monitor/2025/10/13/
   ```

3. **Check logs**:
   ```bash
   sudo journalctl -u videomonitoring | grep -i recording
   ```

4. **Verify SFTP credentials in .env**:
   ```bash
   cat /var/www/videomonitoring/backend/.env | grep PBX_SFTP
   ```

### Recording not playing?

1. **Check file exists locally**:
   ```bash
   ls -lh /mnt/media/uploads/call_recording*
   ```

2. **Check nginx serving files**:
   ```bash
   curl -I http://localhost/uploads/call_recording_{filename}.wav
   ```

3. **Check browser console** for audio loading errors

## Testing

To test the feature:

1. Make an inbound call to the monitoring number
2. Call gets parked automatically
3. Wait 30-60 seconds after call ends
4. Check History page
5. Event should show multiple media icons
6. Click audio icon to play recording

## Summary

This feature provides automatic, reliable call recording retrieval and playback, enhancing the monitoring system's audit capabilities and providing operators with complete context for every alarm event.

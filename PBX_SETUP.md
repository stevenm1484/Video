# Quick PBX Setup Guide

## Step-by-Step Configuration

### 1. Configure PBX Server Details

Create or update `/var/www/videomonitoring/frontend/.env`:

```bash
cd /var/www/videomonitoring/frontend
cp .env.example .env
```

Edit `.env` with your PBX server details:

```env
REACT_APP_PBX_WS_SERVER=your-pbx-server.com:7443
REACT_APP_PBX_DOMAIN=your-pbx-server.com
```

### 2. Configure User SIP Extensions

1. Log in to the dashboard as an admin
2. Navigate to **Setup → Users**
3. Click on a user to edit
4. Fill in the SIP/PBX fields:
   - **SIP Extension**: The user's extension number (e.g., "1001")
   - **SIP Password**: The password for SIP authentication
5. Click **Save**

### 3. Test the Integration

1. Log out and log back in as the user you just configured
2. Look for the **PBX status indicator** next to your name in the navigation bar
3. Status colors:
   - 🟢 **Green**: Successfully connected to PBX - ready to dial!
   - 🟡 **Yellow**: Connecting to PBX...
   - 🔴 **Red**: Disconnected or error (hover to see details)

### 4. Make a Test Call

1. Navigate to any alarm detail page
2. Click the **"Call"** button next to a contact
3. The dialer will automatically:
   - Use your existing PBX registration
   - Initiate the call
   - Display call status and duration
   - Provide DTMF dialpad for menu navigation
   - Save call logs when completed

## How Auto-Registration Works

### On Login
✅ User logs in → System checks for `sip_extension` → Auto-registers to PBX → Status shows green

### On Page Refresh
✅ Page loads → System detects logged-in user → Auto-re-registers to PBX → Status shows green

### On Logout
✅ User logs out → Auto-unregisters from PBX → Cleans up connections → Ready for next login

## Troubleshooting

### ❌ Status shows Red (Disconnected)

**Check these items:**

1. **Environment Variables**: Verify `.env` has correct PBX server settings
2. **User Configuration**: Ensure user has both `sip_extension` and `sip_password` set
3. **Network Access**: Confirm PBX server is reachable from user's network
4. **WebSocket Port**: Ensure port 7443 (or configured port) is not blocked
5. **Browser Console**: Look for `[PBX]` error messages in developer tools

### ❌ Call Quality Issues

- **No Audio**: Check browser microphone permissions
- **Echo**: Use headset instead of speakers
- **Choppy Audio**: Check network bandwidth and stability

### ❌ PBX Not Showing

- User doesn't have `sip_extension` configured
- This is normal for users without dialing capabilities

## Production Checklist

Before deploying to production:

- [ ] Update `.env` with production PBX server URLs
- [ ] Use `wss://` (secure WebSocket) instead of `ws://`
- [ ] Verify SSL/TLS certificates on PBX server
- [ ] Test from different networks (office, VPN, remote)
- [ ] Configure SIP extension passwords for all operators
- [ ] Test failover scenarios (network disconnection, PBX restart)
- [ ] Enable PBX server logging for troubleshooting
- [ ] Document PBX server IP whitelist requirements (if any)

## Architecture Overview

```
┌─────────────┐
│   Browser   │
│  (Frontend) │
└──────┬──────┘
       │ Login
       │
       ▼
┌─────────────────┐
│  Auto-Register  │──────┐
│   to PBX via    │      │
│   WebSocket     │      │
└─────────────────┘      │
                         │
                         ▼
              ┌──────────────────┐
              │   PBX Server     │
              │  (SIP/WebRTC)    │
              └──────────────────┘
                         │
                         │ Routes Call
                         ▼
              ┌──────────────────┐
              │  PSTN/Carrier    │
              │  (Phone Network) │
              └──────────────────┘
```

## Features Summary

✨ **Auto-Registration**: Registers on login, re-registers on refresh
✨ **Visual Status**: Real-time indicator shows connection state
✨ **Persistent**: Maintains registration across page navigation
✨ **Auto-Cleanup**: Unregisters cleanly on logout
✨ **Call Logs**: Automatically saves call records to alarms
✨ **DTMF Support**: In-call dialpad for IVR navigation
✨ **Mobile Support**: Works on mobile browsers with proper permissions

## Next Steps

1. ✅ Configure PBX server details in `.env`
2. ✅ Set up SIP extensions for users
3. ✅ Test login and verify green status indicator
4. ✅ Make a test call from alarm detail page
5. ✅ Review call logs in alarm history

For detailed documentation, see `PBX_INTEGRATION.md`

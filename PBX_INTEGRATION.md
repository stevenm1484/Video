# PBX/Dialer Integration Guide

## Overview

The Video Monitoring Dashboard now includes PBX (Private Branch Exchange) integration that automatically registers users to the SIP server when they log in. This allows for seamless dialing capabilities directly from the dashboard.

## Features

- **Auto-Registration on Login**: Users with SIP extensions are automatically registered to the PBX when they log in
- **Visual Status Indicator**: A real-time PBX status indicator is displayed next to the user's name in the navigation bar
- **Persistent Registration**: Registration persists across page refreshes
- **Auto-Cleanup on Logout**: Automatically unregisters from PBX when users log out

## Configuration

### Backend Setup

1. **User Configuration**: Add SIP extension and password to users in the Users management page
   - `sip_extension`: The user's SIP extension number (e.g., "1001")
   - `sip_password`: The SIP password for authentication

2. **Database**: The User model includes these fields:
   ```python
   sip_extension = Column(String, nullable=True)
   sip_password = Column(String, nullable=True)
   ```

### Frontend Setup

1. **Environment Variables**: Create a `.env` file in the `frontend/` directory:
   ```bash
   cp .env.example .env
   ```

2. **Configure PBX Settings** in `.env`:
   ```env
   # WebSocket server for SIP connections (including port)
   REACT_APP_PBX_WS_SERVER=pbx.yourdomain.com:7443

   # SIP domain for registration and calls
   REACT_APP_PBX_DOMAIN=pbx.yourdomain.com
   ```

3. **Restart Frontend**: After configuring, restart the frontend development server:
   ```bash
   cd frontend
   npm run dev
   ```

## How It Works

### Registration Flow

1. **Login**: When a user logs in, the system checks if they have a `sip_extension` configured
2. **Auto-Register**: If configured, the PBX store automatically initiates registration using JsSIP
3. **Status Updates**: The PBX status indicator updates in real-time:
   - 🔴 **Red/Disconnected**: Not registered or registration failed
   - 🟡 **Yellow/Connecting**: Registration in progress
   - 🟢 **Green/Connected**: Successfully registered and ready to dial

4. **Page Refresh**: On page refresh, the Layout component automatically re-registers the user
5. **Logout**: Unregisters from PBX and cleans up WebSocket connections

### PBX Store (`pbxStore.js`)

The centralized store manages all PBX-related state:

```javascript
// State
- isRegistered: boolean        // Registration status
- isRegistering: boolean        // Registration in progress
- registrationError: string     // Error message if registration fails
- ua: JsSIP.UA                  // User Agent instance
- activeSession: Session        // Current call session

// Actions
- register(user, pbxConfig)     // Register to PBX
- unregister()                  // Unregister from PBX
- makeCall(phoneNumber)         // Initiate outbound call
- endCall()                     // End active call
- reset()                       // Reset all state
```

### Status Indicator

The status indicator appears in two locations:

1. **Desktop Navigation**: Next to the user's name in the top-right corner
2. **Mobile Menu**: In the Account section of the mobile menu

**Visual States**:
- Phone icon with green border: Connected
- Phone-off icon with yellow border: Connecting
- Phone-off icon with red border: Disconnected/Error

Hover over the indicator to see error details if registration failed.

## Making Calls

### Using the Dialer Modal

When using the dialer modal (e.g., from Alarm Detail page), the modal will:

1. Use the existing PBX registration from the store
2. Automatically dial when the modal opens
3. Display call status and duration
4. Provide DTMF dialpad for connected calls
5. Save call logs to the alarm record

### Using the PBX Store Directly

You can also make calls programmatically:

```javascript
import { usePBXStore } from '../store/pbxStore'

function MyComponent() {
  const makeCall = usePBXStore(state => state.makeCall)
  const endCall = usePBXStore(state => state.endCall)
  const isRegistered = usePBXStore(state => state.isRegistered)

  const handleCall = () => {
    if (isRegistered) {
      const session = makeCall('5551234567')
      // Handle session events if needed
    }
  }

  return (
    <button onClick={handleCall}>Call</button>
  )
}
```

## Troubleshooting

### Registration Issues

**Problem**: Status shows "Disconnected" with red indicator

**Solutions**:
1. Check that `REACT_APP_PBX_WS_SERVER` and `REACT_APP_PBX_DOMAIN` are correctly configured
2. Verify the user has `sip_extension` and `sip_password` configured
3. Check browser console for detailed error messages (look for `[PBX]` prefixed logs)
4. Ensure the PBX server is accessible from the client's network
5. Verify WebSocket port (typically 7443 or 8089) is not blocked by firewall

### Call Quality Issues

1. **No Audio**: Check browser microphone permissions
2. **Poor Quality**: Verify network connectivity and bandwidth
3. **Echo**: Check for feedback loops (use headset instead of speakers)

### Browser Compatibility

- **Chrome/Edge**: Full support
- **Firefox**: Full support
- **Safari**: Requires HTTPS for WebRTC
- **Mobile Browsers**: May require user gesture to enable audio

## Security Considerations

1. **SIP Password Storage**:
   - Passwords are stored in the database but NOT exposed via UserResponse API
   - Only transmitted during registration to the PBX server
   - Use strong, unique passwords for each extension

2. **WebSocket Security**:
   - Always use `wss://` (secure WebSocket) in production
   - Ensure valid SSL/TLS certificates on PBX server

3. **Network Security**:
   - Consider IP whitelisting on the PBX server
   - Use VPN or private network when possible
   - Enable SIP authentication mechanisms

## Development vs Production

### Development
```env
REACT_APP_PBX_WS_SERVER=localhost:7443
REACT_APP_PBX_DOMAIN=localhost
```

### Production
```env
REACT_APP_PBX_WS_SERVER=pbx.yourdomain.com:7443
REACT_APP_PBX_DOMAIN=pbx.yourdomain.com
```

## API Reference

### Backend Endpoints

- `GET /api/users/me`: Returns user info including `sip_extension` (but NOT `sip_password`)
- `PUT /api/users/{user_id}`: Update user SIP credentials (admin only)

### Frontend Store Methods

```javascript
// Register to PBX
await registerPBX(user, pbxConfig?)

// Unregister from PBX
unregisterPBX()

// Make a call
const session = makeCall(phoneNumber, pbxConfig?)

// End active call
endCall()

// Reset state
reset()
```

## Testing

### Test Registration

1. Log in as a user with SIP extension configured
2. Check the PBX status indicator in the navigation bar
3. Verify the status changes to green (Connected)
4. Open browser console and look for `[PBX] Successfully registered to PBX`

### Test Calling

1. Navigate to an alarm detail page
2. Click "Call" on a contact
3. Verify the dialer modal opens and initiates the call
4. Check call status updates in real-time
5. Test DTMF tones by pressing dialpad buttons
6. End the call and verify it's logged

## Support

For issues or questions:
1. Check browser console for `[PBX]` prefixed error messages
2. Verify PBX server logs for registration/authentication errors
3. Test WebSocket connectivity using browser developer tools
4. Contact your system administrator for PBX server configuration

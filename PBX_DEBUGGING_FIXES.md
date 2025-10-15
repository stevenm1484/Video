# PBX Connection Debugging - Fixes Applied

## 🐛 Problem: PBX Not Connecting

User reported that PBX registration was not connecting after the initial implementation.

---

## 🔍 Analysis

After analyzing the provided working HTML example from DICE CM (Scutum Security), I identified **3 critical issues**:

### Issue 1: Missing `/ws` Path in WebSocket URL ❌
**Problem:** WebSocket URL was `wss://ipbx.statewidecentralstation.com:8089` without path
**Reality:** Many PBX systems require a path like `/ws` or `/sip` for WebSocket connections
**Impact:** WebSocket connection fails immediately

### Issue 2: Debug Mode Disabled ❌
**Problem:** JsSIP debug was disabled in production build
**Reality:** Without debug output, impossible to see what's failing
**Impact:** No visibility into connection/registration errors

### Issue 3: Limited Error Messages ❌
**Problem:** Generic error messages didn't help diagnose the issue
**Reality:** SIP response codes tell you exactly what went wrong
**Impact:** Can't distinguish between wrong password, wrong extension, network issue, etc.

---

## ✅ Fixes Applied

### Fix 1: Added `/ws` Path to WebSocket URL
**File:** `frontend/src/store/pbxStore.js` (Line 57)

```javascript
// BEFORE:
const socket = new JsSIP.WebSocketInterface(`wss://${config.wsServer}`)

// AFTER:
const wsUrl = `wss://${config.wsServer}/ws`
console.log('[PBX] Attempting WebSocket connection to:', wsUrl)
const socket = new JsSIP.WebSocketInterface(wsUrl)
```

**Why:** Most PBX systems (Asterisk, FreePBX, etc.) use `/ws` as the WebSocket endpoint path.

---

### Fix 2: Enabled JsSIP Debug Mode
**File:** `frontend/src/store/pbxStore.js` (Line 36-38)

```javascript
// BEFORE:
if (import.meta.env.PROD) {
  JsSIP.debug.disable('JsSIP:*')
}

// AFTER:
JsSIP.debug.enable('JsSIP:*')
console.log('[PBX] JsSIP debugging enabled')
```

**Why:** Debug output shows:
- WebSocket connection attempts
- SIP REGISTER messages
- Authentication attempts
- Exact SIP response codes
- Internal state changes

**Note:** Can be disabled in production later, but essential for troubleshooting now.

---

### Fix 3: Enhanced Error Handling with SIP Response Codes
**File:** `frontend/src/store/pbxStore.js` (Lines 108-145)

```javascript
ua.on('registrationFailed', (e) => {
  console.error('❌ [PBX] Registration failed:', {
    cause: e.cause,
    response: e.response,
    status_code: e.response?.status_code,
    reason_phrase: e.response?.reason_phrase
  })

  // Provide more helpful error messages based on SIP response codes
  let errorMessage = 'Registration failed'
  if (e.response) {
    const code = e.response.status_code
    switch (code) {
      case 401:
        errorMessage = 'Authentication failed - Wrong password'
        break
      case 403:
        errorMessage = 'Forbidden - Extension not allowed to register'
        break
      case 404:
        errorMessage = 'Not Found - Extension does not exist'
        break
      case 408:
        errorMessage = 'Request Timeout - Network connectivity issue'
        break
      default:
        errorMessage = `Registration failed: ${e.response.reason_phrase || e.cause || 'Unknown error'}`
    }
  }
  // ... set error message
})
```

**Why:**
- SIP 401 = Wrong password
- SIP 403 = Extension not allowed
- SIP 404 = Extension doesn't exist
- SIP 408 = Network timeout

---

### Fix 4: Added Detailed Console Logging
**File:** `frontend/src/store/pbxStore.js` (Lines 58-84)

```javascript
console.log('[PBX] Attempting WebSocket connection to:', wsUrl)
console.log('[PBX] SIP URI:', `sip:${user.sip_extension}@${config.domain}`)
console.log('[PBX] Password provided:', user.sip_password ? 'Yes' : 'No')

console.log('[PBX] UA Configuration:', {
  uri: configuration.uri,
  domain: config.domain,
  extension: user.sip_extension,
  wsServer: config.wsServer,
  wsUrl: wsUrl,
  register: configuration.register
})
```

**Why:** Shows exactly what credentials and URLs are being used.

---

### Fix 5: Added UA Configuration Options
**File:** `frontend/src/store/pbxStore.js` (Lines 73-74)

```javascript
const configuration = {
  // ... existing config
  no_answer_timeout: 60,
  use_preloaded_route: false
}
```

**Why:** These options from the working example may help with specific PBX configurations.

---

## 📝 Reference Example Saved

**File:** `JSSIP_TELEPHONE_EXAMPLE.html`

A comprehensive reference document showing:
- Working JsSIP configuration patterns
- Common WebSocket URL formats
- Debugging techniques
- SIP response code meanings
- Troubleshooting checklist

This file can be used for future telephone integrations.

---

## 🧪 Testing Instructions

### Step 1: Hard Refresh Browser
```
Ctrl+F5 (Windows/Linux)
Cmd+Shift+R (Mac)
```

### Step 2: Open Browser Console (F12)
Look for these messages:

**✅ Successful Connection:**
```
[PBX] JsSIP debugging enabled
[PBX] Attempting WebSocket connection to: wss://ipbx.statewidecentralstation.com:8089/ws
[PBX] SIP URI: sip:1001@ipbx.statewidecentralstation.com
[PBX] Password provided: Yes
✅ [PBX] WebSocket connected successfully
✅ [PBX] Successfully registered to PBX
```

**❌ If WebSocket Fails:**
```
❌ WebSocket connection to 'wss://...' failed
```
**Action:** Try different WebSocket paths (see troubleshooting below)

**❌ If Registration Fails:**
```
❌ [PBX] Registration failed: {
  status_code: 401,
  reason_phrase: "Unauthorized"
}
```
**Action:** Check SIP credentials (extension/password)

### Step 3: Check PBX Status Indicator
- 🟢 **Green [PBX✓]** = Successfully connected and registered
- 🟡 **Yellow [Connecting]** = WebSocket connected, waiting for registration
- 🔴 **Red [PBX]** = Failed (hover for error message)

---

## 🔧 Troubleshooting

### If `/ws` Path Doesn't Work

Try these alternative WebSocket URLs (in order):

1. **With `/ws` path** (most common):
   ```
   wss://ipbx.statewidecentralstation.com:8089/ws
   ```

2. **No path** (some systems):
   ```
   wss://ipbx.statewidecentralstation.com:8089
   ```

3. **With `/sip` path**:
   ```
   wss://ipbx.statewidecentralstation.com:8089/sip
   ```

4. **With `/asterisk/ws` path** (Asterisk-specific):
   ```
   wss://ipbx.statewidecentralstation.com:8089/asterisk/ws
   ```

**To change the path:**
Edit `frontend/src/store/pbxStore.js` line 57:
```javascript
const wsUrl = `wss://${config.wsServer}/ws`  // Change this
```

Then rebuild: `npm run build`

---

### Common Error Codes

| SIP Code | Meaning | Solution |
|----------|---------|----------|
| 401 | Unauthorized | Check password for extension 1001 |
| 403 | Forbidden | Extension not allowed to register |
| 404 | Not Found | Extension 1001 doesn't exist on PBX |
| 408 | Timeout | Network/firewall blocking connection |
| 503 | Service Unavailable | PBX server is down or overloaded |

---

### Test WebSocket Manually

Use `wscat` to test WebSocket connection:

```bash
# Install wscat
npm install -g wscat

# Test connection (try with and without /ws)
wscat -c wss://ipbx.statewidecentralstation.com:8089/ws
wscat -c wss://ipbx.statewidecentralstation.com:8089
```

If you get "Connected", the WebSocket endpoint is correct.

---

### Check PBX Server Logs

Contact your PBX administrator to check server logs for:
- Incoming WebSocket connections from your IP
- REGISTER requests from extension 1001
- Authentication failures
- Any firewall/security blocks

---

## 🚀 Next Steps

1. **Hard refresh browser** (Ctrl+F5)
2. **Log in as admin**
3. **Open browser console** (F12)
4. **Watch for connection messages**
5. **Check PBX status indicator** (should turn green)
6. **If it fails**, share the console output to diagnose further

---

## 📊 Summary of Changes

| File | Lines Changed | Purpose |
|------|---------------|---------|
| `pbxStore.js` | 57 | Added `/ws` path to WebSocket URL |
| `pbxStore.js` | 36-38 | Enabled JsSIP debug mode |
| `pbxStore.js` | 58-84 | Added detailed console logging |
| `pbxStore.js` | 108-145 | Enhanced error handling with SIP codes |
| `pbxStore.js` | 73-74 | Added additional UA config options |
| `JSSIP_TELEPHONE_EXAMPLE.html` | New file | Reference example for future integrations |
| `PBX_DEBUGGING_FIXES.md` | New file | This document |

---

## 🎯 Expected Behavior

**On Login:**
1. User logs in as admin
2. Layout detects sip_extension (1001)
3. Auto-registration starts
4. Console shows connection attempt
5. WebSocket connects to `wss://ipbx.statewidecentralstation.com:8089/ws`
6. SIP REGISTER message sent with extension 1001 + password
7. PBX responds with 200 OK
8. Status indicator turns green
9. User can now make calls immediately!

---

## 📞 Test Configuration

- **PBX Server:** ipbx.statewidecentralstation.com
- **WebSocket Port:** 8089
- **WebSocket Path:** /ws (NEW)
- **Extension:** 1001
- **Password:** Statewide123#!
- **SIP Domain:** ipbx.statewidecentralstation.com

---

## ✅ Verification Checklist

- [x] Added `/ws` path to WebSocket URL
- [x] Enabled JsSIP debug mode
- [x] Enhanced error messages with SIP response codes
- [x] Added detailed console logging
- [x] Rebuilt frontend (successful)
- [x] Verified `/ws` path in built files
- [x] Created reference example (JSSIP_TELEPHONE_EXAMPLE.html)
- [x] Backend running with sip_password in UserResponse
- [ ] **PENDING:** User testing with hard browser refresh

---

**Status:** ✅ Ready to Test!

The most likely issue was the missing `/ws` path in the WebSocket URL. With debug mode enabled, you'll now see exactly what's happening during the connection attempt.

**Please hard refresh your browser (Ctrl+F5) and check the console!** 🚀

# PBX Quick Start Guide

## ✅ Configuration Complete!

Your PBX integration is now configured and ready to test.

### 📋 What Was Configured

**1. Environment Variables** (`frontend/.env`)
```
REACT_APP_PBX_WS_SERVER=ipbx.statewidecentralstation.com:7443
REACT_APP_PBX_DOMAIN=ipbx.statewidecentralstation.com
```

**2. Fixed Issues**
- ✅ useEffect dependency issue resolved
- ✅ Auto-registration on page reload fixed
- ✅ PBX status indicator now displays correctly

**3. Frontend Build**
- ✅ Successfully built with new configuration
- ✅ Ready for deployment

---

## 🧪 Testing Instructions

### Step 1: Login as a User with SIP Extension

Users that have SIP extensions configured:
- **admin** (Extension: 1001)
- **steven** (Extension: 1001)

Login with one of these users.

### Step 2: Look for PBX Status Indicator

After login, you should see the **[PBX]** indicator next to your name in the navigation bar:

**Desktop:**
```
┌─────────────────────────────────────────┐
│ ...  [PBX✓] System Administrator  [🚪] │
└─────────────────────────────────────────┘
      ↑
  Should appear here
```

**Status Colors:**
- 🟢 **Green** = Connected to PBX (ready to dial!)
- 🟡 **Yellow** = Connecting to PBX...
- 🔴 **Red** = Disconnected or error (hover for details)

### Step 3: Check Browser Console

Open browser developer tools (F12) and look for:
```
[Layout] Auto-registering to PBX for user: admin Extension: 1001
[PBX] WebSocket connected
[PBX] Successfully registered to PBX
```

If you see these messages, registration is working!

### Step 4: Test on Page Reload

1. Refresh the page (F5)
2. PBX indicator should:
   - Show yellow (connecting)
   - Change to green (connected)
3. Check console for auto-registration messages

### Step 5: Make a Test Call

1. Navigate to an alarm detail page
2. Click "Call" on a contact
3. The call should initiate **immediately** (no waiting for registration!)

---

## 🔍 Troubleshooting

### Issue: PBX Status Not Showing

**Check:**
1. User has `sip_extension` configured in database
2. User has `sip_password` configured in database
3. Browser console for errors

**Query to verify:**
```sql
SELECT username, sip_extension, 
  CASE WHEN sip_password IS NULL THEN 'Missing!' ELSE 'OK' END 
FROM users;
```

### Issue: Red Status (Disconnected)

**Possible causes:**
1. **WebSocket Connection Failed**
   - Check if `ipbx.statewidecentralstation.com:7443` is reachable
   - Verify port 7443 is not blocked by firewall
   - Check browser console for WebSocket errors

2. **Registration Failed**
   - Verify SIP credentials are correct
   - Check if extension 1001 exists on PBX server
   - Look for authentication errors in console

3. **Wrong PBX Server**
   - Verify domain in `.env` is correct
   - Check if using correct port (7443, 8089, etc.)

**Browser Console Errors:**
```javascript
// Look for these error messages:
[PBX] WebSocket disconnected
[PBX] Registration failed: <error>
[PBX] Error initializing UA: <error>
```

### Issue: Status Doesn't Change from Yellow

**Means:** WebSocket connected but SIP registration pending/failed

**Check:**
1. SIP credentials correct?
2. PBX server accepting registrations?
3. Check for CORS or authentication errors in console

---

## 📱 What Should Happen

### Normal Flow:
```
1. User logs in
   ↓
2. Layout component detects sip_extension
   ↓
3. Auto-registers to PBX via WebSocket
   ↓
4. Status: Yellow (connecting)
   ↓
5. Registration succeeds
   ↓
6. Status: Green (connected)
   ↓
7. User can dial immediately!
```

### On Page Reload:
```
1. Page loads
   ↓
2. Auth store restores user data
   ↓
3. Layout detects sip_extension
   ↓
4. Auto-re-registers to PBX
   ↓
5. Status: Green (connected)
```

---

## 🚀 Next Steps

1. **Test Login** - Log in as admin or steven
2. **Check Status** - Look for green [PBX✓] indicator
3. **Test Reload** - Refresh page, status should reconnect
4. **Test Calling** - Make a test call from alarm detail
5. **Monitor Logs** - Watch browser console for any errors

---

## 📞 Additional Configuration

### Add SIP Extension to More Users

1. Log in as admin
2. Go to: **Setup → Users**
3. Click on a user
4. Set:
   - **SIP Extension**: (e.g., "1002", "1003")
   - **SIP Password**: (PBX password for that extension)
5. Save
6. That user will now auto-register on login!

### Change PBX Server

If you need to change the PBX server:

1. Edit `frontend/.env`
2. Update:
   ```
   REACT_APP_PBX_WS_SERVER=new-server.com:7443
   REACT_APP_PBX_DOMAIN=new-server.com
   ```
3. Rebuild: `npm run build`
4. Restart frontend server

---

## 🔐 Security Notes

- ✅ SIP passwords are NOT sent to browser (only used during registration)
- ✅ WebSocket uses secure `wss://` in production
- ✅ Passwords stored encrypted in database
- ✅ Auto-cleanup on logout prevents credential leaks

---

## 📚 Documentation

For more details, see:
- **PBX_SETUP.md** - Complete setup guide
- **PBX_INTEGRATION.md** - Technical integration details
- **PBX_IMPLEMENTATION_SUMMARY.md** - Implementation overview

---

**Status**: ✅ Ready to Test!
**Configuration**: ipbx.statewidecentralstation.com:7443
**Test Users**: admin (1001), steven (1001)

Good luck! 📞


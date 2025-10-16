# FreePBX Recording Setup Guide

This guide explains how to configure FreePBX to include custom metadata in call recordings so the Video Monitoring system can reliably find and retrieve recordings.

## Overview

When the Video Monitoring frontend makes outbound calls, it sends custom SIP headers:
- `X-VM-Tracking-ID`: Unique identifier like `VM-242-484-1760640000000`
- `X-VM-Alarm-ID`: The alarm ID (e.g., `242`)
- `X-VM-Event-ID`: The event ID (e.g., `484`)
- `X-VM-Contact`: Contact name (sanitized)

We need to configure Asterisk/FreePBX to:
1. Capture these headers into channel variables
2. Include them in the recording filename
3. Store them in the CDR for lookup

## Step 1: Configure Asterisk to Capture SIP Headers

Edit `/etc/asterisk/sip_custom.conf` or add to your trunk/extension configuration:

```ini
[general]
; Allow custom SIP headers to be passed to dialplan
usereqphone=yes
```

## Step 2: Add Dialplan Logic to Extract Headers

Edit `/etc/asterisk/extensions_custom.conf`:

```conf
[from-internal-custom]
; Extract custom headers and set as channel variables
exten => _X.,1,NoOp(Video Monitoring Call)
same => n,Set(VM_TRACKING_ID=${PJSIP_HEADER(read,X-VM-Tracking-ID)})
same => n,Set(VM_ALARM_ID=${PJSIP_HEADER(read,X-VM-Alarm-ID)})
same => n,Set(VM_EVENT_ID=${PJSIP_HEADER(read,X-VM-Event-ID)})
same => n,Set(VM_CONTACT=${PJSIP_HEADER(read,X-VM-Contact)})
same => n,NoOp(Tracking ID: ${VM_TRACKING_ID})
same => n,Return()

; For SIP (non-PJSIP) channels, use SIP_HEADER instead:
; same => n,Set(VM_TRACKING_ID=${SIP_HEADER(X-VM-Tracking-ID)})
```

**Note**: Use `PJSIP_HEADER` for PJSIP channels or `SIP_HEADER` for chan_sip.

## Step 3: Configure Recording Filename to Include Metadata

### Option A: Using FreePBX GUI (Easier)

1. Go to **Settings → Advanced Settings**
2. Find **Recording File Name Format**
3. Change to include channel variable:
   ```
   ${STRFTIME(${EPOCH},,%Y%m%d-%H%M%S)}-${VM_TRACKING_ID}-${UNIQUEID}
   ```

### Option B: Edit Asterisk Config Directly

Edit `/etc/asterisk/asterisk.conf` or recording configuration:

```conf
[general]
; Default recording filename format
; Include tracking ID if available, fall back to standard format
recordingformat => ${STRFTIME(${EPOCH},,%Y%m%d-%H%M%S)}-${IF($["${VM_TRACKING_ID}" != ""]?${VM_TRACKING_ID}:out)}-${CALLERID(num)}-${EXTEN}-${UNIQUEID}
```

## Step 4: Update MixMonitor/Monitor Commands

If you're using custom recording commands, update them to include the variable:

```conf
; In your recording macro or extension
exten => s,n,Set(MONITOR_FILENAME=${STRFTIME(${EPOCH},,%Y%m%d-%H%M%S)}-${VM_TRACKING_ID:-out}-${CALLERID(num)}-${EXTEN}-${UNIQUEID})
exten => s,n,MixMonitor(${MONITOR_FILENAME}.wav,b)
```

## Step 5: Store in CDR (Optional but Recommended)

Edit `/etc/asterisk/cdr_custom.conf`:

```conf
[mappings]
; Add custom CDR fields
Master.csv => ${CSV_QUOTE(${CDR(accountcode)})},${CSV_QUOTE(${CDR(src)})},${CSV_QUOTE(${CDR(dst)})},${CSV_QUOTE(${CDR(dcontext)})},${CSV_QUOTE(${CDR(clid)})},${CSV_QUOTE(${CDR(channel)})},${CSV_QUOTE(${CDR(dstchannel)})},${CSV_QUOTE(${CDR(lastapp)})},${CSV_QUOTE(${CDR(lastdata)})},${CSV_QUOTE(${CDR(start)})},${CSV_QUOTE(${CDR(answer)})},${CSV_QUOTE(${CDR(end)})},${CSV_QUOTE(${CDR(duration)})},${CSV_QUOTE(${CDR(billsec)})},${CSV_QUOTE(${CDR(disposition)})},${CSV_QUOTE(${CDR(amaflags)})},${CSV_QUOTE(${CDR(uniqueid)})},${CSV_QUOTE(${CDR(userfield)})},${CSV_QUOTE(${VM_TRACKING_ID})}
```

Or store in CDR userfield:

```conf
exten => h,1,Set(CDR(userfield)=${VM_TRACKING_ID})
```

## Step 6: Reload Asterisk Configuration

```bash
asterisk -rx "core reload"
asterisk -rx "dialplan reload"
asterisk -rx "module reload res_pjsip.so"  # or chan_sip
```

## Step 7: Test the Configuration

1. Make a test call from the Video Monitoring system
2. Check Asterisk console:
   ```bash
   asterisk -rvvv
   ```
3. Look for the custom headers in the logs
4. Check the recording filename in `/var/spool/asterisk/monitor/`

## Recording Filename Examples

**Before (current)**:
```
out-9178162014-1001-20251016-143054-1760639454.285.wav
```

**After (with tracking ID)**:
```
20251016-143054-VM-242-484-1760640000000-1760639454.285.wav
```

## Troubleshooting

### Headers Not Being Captured

1. Check if using PJSIP or chan_sip:
   ```bash
   asterisk -rx "core show channels"
   ```
2. Use correct header function (PJSIP_HEADER vs SIP_HEADER)
3. Enable SIP debug:
   ```bash
   asterisk -rx "pjsip set logger on"
   ```

### Filenames Don't Include Tracking ID

1. Check if channel variable is set:
   ```bash
   asterisk -rx "dialplan show from-internal-custom"
   ```
2. Verify recording format setting
3. Check permissions on recording directory

### CDR Not Storing Metadata

1. Enable CDR debugging:
   ```bash
   asterisk -rx "cdr set debug on"
   ```
2. Check CDR configuration:
   ```bash
   asterisk -rx "cdr show status"
   ```

## Alternative: Database-Only Approach (No FreePBX Changes Required)

If you cannot modify FreePBX configuration, the current timestamp-based fallback will continue to work. The custom headers are still sent and can be logged for reference, but the recording lookup will use the existing timestamp matching logic.

## Implementation Status

- ✅ Frontend sends custom SIP headers
- ✅ Tracking ID stored in call logs
- ⏳ FreePBX configuration needed (this guide)
- ⏳ Backend updated to search by tracking ID (next step)

## Next Steps

Once FreePBX is configured:
1. Update `recording_retrieval.py` to search for tracking ID in filenames
2. Fall back to timestamp search if not found
3. Test with real calls

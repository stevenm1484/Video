# Setup PBX Call Recordings Access

This guide explains how to set up SFTP access to retrieve call recordings from the FreePBX server.

## Steps to Perform on PBX Server (ipbx.statewidecentralstation.com)

SSH into your PBX server and run these commands:

### 1. Create a dedicated user for recordings access

```bash
sudo useradd -m -s /bin/bash recordings_api
```

This creates a new user called `recordings_api` with a home directory.

### 2. Set a password for the new user

```bash
sudo passwd recordings_api
```

Enter a strong password when prompted. Save this password - you'll need to provide it later.

### 3. Add user to asterisk group for read access

```bash
sudo usermod -aG asterisk recordings_api
```

This gives the user permission to read Asterisk files including recordings.

### 4. Set permissions on recordings directories

```bash
sudo chmod -R 755 /var/spool/asterisk/monitor
```

If you have recordings in another location, also run:

```bash
sudo chmod -R 755 /var/spool/asterisk/recording
```

### 5. Verify the recordings directory exists and has files

```bash
ls -la /var/spool/asterisk/monitor/
```

You should see recording files (usually .wav or .mp3 format).

---

## Test SFTP Access from Monitoring Server

From your monitoring server (where the videomonitoring app runs), test the connection:

```bash
sftp recordings_api@ipbx.statewidecentralstation.com
```

Enter the password you set. If successful, you'll see an sftp prompt. Test navigation:

```bash
cd /var/spool/asterisk/monitor
ls
exit
```

---

## Provide Credentials

Once the user is created and tested, provide these details:

1. Username: `recordings_api` (or whatever you named it)
2. Password: (the password you set)
3. Recordings path: `/var/spool/asterisk/monitor` (or the actual path if different)

I will then add these to your `.env` file as:

```
PBX_SFTP_HOST=ipbx.statewidecentralstation.com
PBX_SFTP_PORT=22
PBX_SFTP_USERNAME=recordings_api
PBX_SFTP_PASSWORD=your_password_here
PBX_RECORDINGS_PATH=/var/spool/asterisk/monitor
```

---

## Alternative: SSH Key-Based Authentication (More Secure)

If you prefer SSH keys instead of password:

### On monitoring server:

```bash
ssh-keygen -t rsa -b 4096 -f ~/.ssh/pbx_recordings_key
```

### Copy public key to PBX:

```bash
ssh-copy-id -i ~/.ssh/pbx_recordings_key.pub recordings_api@ipbx.statewidecentralstation.com
```

### Test:

```bash
ssh -i ~/.ssh/pbx_recordings_key recordings_api@ipbx.statewidecentralstation.com
```

If using SSH keys, provide the path to the private key file instead of a password.

---

## What Happens After Setup

Once configured, the monitoring system will:

1. Automatically detect when a call has a recording (based on uniqueid)
2. Download the recording file from the PBX via SFTP
3. Store it locally in `/mnt/media/uploads/`
4. Add it to the event's `media_paths`
5. Display an audio player in the History page for playback

This will work for:
- Inbound calls (calls coming into the monitoring system)
- Outbound calls (calls made by operators to contacts)
- Any call handled through the PBX that has recording enabled


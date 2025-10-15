# Manual FFmpeg Installation for Windows

## Option 1: Download from Official Site (Recommended)

1. **Go to:** https://ffmpeg.org/download.html
2. **Click:** "Windows" section
3. **Download:** "Windows builds by BtbN" (or similar)
4. **Extract:** Download the ZIP file and extract to `C:\ffmpeg`
5. **Add to PATH:**
   - Press `Win + R`, type `sysdm.cpl`, press Enter
   - Click "Environment Variables"
   - Under "System Variables", find and select "Path", click "Edit"
   - Click "New" and add: `C:\ffmpeg\bin`
   - Click "OK" on all dialogs
6. **Restart:** Close and reopen your terminal/PowerShell
7. **Test:** Run `ffmpeg -version` in a new terminal

## Option 2: Use Chocolatey (if installed)

```powershell
choco install ffmpeg
```

## Option 3: Use Scoop (if installed)

```powershell
scoop install ffmpeg
```

## Verify Installation

After installation, open a **new** terminal window and run:

```bash
ffmpeg -version
```

You should see FFmpeg version information.

## Restart Backend

After installing FFmpeg, restart the backend server:

1. Stop the current backend (Ctrl+C in the terminal where it's running)
2. Run: `.\venv\Scripts\python.exe backend\main.py`

## Test Streaming

Once FFmpeg is installed and the backend is restarted:

1. Go to: http://localhost:3000
2. Login: `admin` / `admin`
3. Navigate to "Accounts" tab
4. Click the green eye icon (👁️) next to a camera
5. Click "Start Stream"

The streaming should now work properly!

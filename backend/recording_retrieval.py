"""
Call Recording Retrieval Module
Downloads call recordings from FreePBX via SFTP
"""

import os
import logging
import asyncio
import paramiko
from pathlib import Path
from datetime import datetime
from typing import Optional, List

logger = logging.getLogger(__name__)

class RecordingRetrieval:
    """Handles downloading call recordings from FreePBX via SFTP"""

    def __init__(self):
        self.host = os.getenv("PBX_SFTP_HOST", "ipbx.statewidecentralstation.com")
        self.port = int(os.getenv("PBX_SFTP_PORT", "22"))
        self.username = os.getenv("PBX_SFTP_USERNAME", "recordings_api")
        self.key_path = os.path.expanduser("~/.ssh/pbx_recordings_key")
        self.recordings_path = os.getenv("PBX_RECORDINGS_PATH", "/var/spool/asterisk/monitor")
        self.local_uploads = Path("/mnt/media/uploads")

    async def find_recording_by_timestamp(self, call_timestamp: datetime, time_window: int = 60) -> Optional[str]:
        """
        Find the most recent recording file created around a specific timestamp.

        This is a fallback when uniqueid doesn't match due to call transfers/parking.
        Asterisk often creates new uniqueids when calls are transferred/parked.

        Args:
            call_timestamp: When the call event was created
            time_window: Seconds before/after to search (default 60)

        Returns:
            Remote file path or None if not found
        """
        try:
            year = call_timestamp.strftime("%Y")
            month = call_timestamp.strftime("%m")
            day = call_timestamp.strftime("%d")
            remote_dir = f"{self.recordings_path}/{year}/{month}/{day}"

            # Connect via SFTP using SSH key
            transport = paramiko.Transport((self.host, self.port))
            private_key = paramiko.RSAKey.from_private_key_file(self.key_path)
            transport.connect(username=self.username, pkey=private_key)
            sftp = paramiko.SFTPClient.from_transport(transport)

            try:
                # List all wav/mp3 files
                files = sftp.listdir(remote_dir)

                # Get file stats and filter by modification time
                candidates = []
                for filename in files:
                    if filename.endswith('.wav') or filename.endswith('.mp3'):
                        remote_path = f"{remote_dir}/{filename}"
                        try:
                            stat = sftp.stat(remote_path)
                            file_mtime = datetime.fromtimestamp(stat.st_mtime)

                            # Check if file was created within time window
                            time_diff = abs((file_mtime - call_timestamp).total_seconds())
                            if time_diff <= time_window:
                                candidates.append((remote_path, file_mtime, time_diff))
                        except Exception as e:
                            logger.debug(f"Could not stat file {filename}: {e}")
                            continue

                # Sort by time difference (closest match first)
                if candidates:
                    candidates.sort(key=lambda x: x[2])  # Sort by time_diff
                    best_match = candidates[0]
                    logger.info(f"Found recording by timestamp: {best_match[0]} (time diff: {best_match[2]:.1f}s)")
                    sftp.close()
                    transport.close()
                    return best_match[0]
                else:
                    logger.debug(f"No recordings found within {time_window}s of {call_timestamp}")

            except FileNotFoundError:
                logger.warning(f"Recording directory not found: {remote_dir}")
            except Exception as e:
                logger.error(f"Error listing recordings: {e}")
            finally:
                sftp.close()
                transport.close()

        except Exception as e:
            logger.error(f"SFTP connection error: {e}")

        return None

    async def find_recording_by_uniqueid(self, uniqueid: str, call_timestamp: datetime, max_wait: int = 30) -> Optional[str]:
        """
        Find a recording file by call uniqueid, with timestamp fallback

        FreePBX recordings are organized as:
        /var/spool/asterisk/monitor/YYYY/MM/DD/*-{uniqueid}.wav

        Args:
            uniqueid: The call unique ID (e.g., "1760391161.133")
            call_timestamp: When the call event was created (for fallback search)
            max_wait: Maximum seconds to wait for recording to appear

        Returns:
            Remote file path or None if not found
        """
        # Recordings may take a few seconds to appear after call ends
        for attempt in range(max_wait):
            try:
                # Get today's date for path
                year = call_timestamp.strftime("%Y")
                month = call_timestamp.strftime("%m")
                day = call_timestamp.strftime("%d")

                remote_dir = f"{self.recordings_path}/{year}/{month}/{day}"

                # Connect via SFTP using SSH key
                transport = paramiko.Transport((self.host, self.port))
                private_key = paramiko.RSAKey.from_private_key_file(self.key_path)
                transport.connect(username=self.username, pkey=private_key)
                sftp = paramiko.SFTPClient.from_transport(transport)

                try:
                    # List files in directory
                    files = sftp.listdir(remote_dir)

                    # Find file matching uniqueid
                    for filename in files:
                        if uniqueid in filename and (filename.endswith('.wav') or filename.endswith('.mp3')):
                            remote_path = f"{remote_dir}/{filename}"
                            logger.info(f"Found recording by uniqueid: {remote_path}")
                            sftp.close()
                            transport.close()
                            return remote_path

                except FileNotFoundError:
                    logger.warning(f"Recording directory not found: {remote_dir}")
                except Exception as e:
                    logger.error(f"Error listing recordings: {e}")
                finally:
                    sftp.close()
                    transport.close()

            except Exception as e:
                logger.error(f"SFTP connection error: {e}")

            # Wait 1 second before retry
            if attempt < max_wait - 1:
                await asyncio.sleep(1)
                logger.debug(f"Recording not found by uniqueid yet, retrying... (attempt {attempt + 1}/{max_wait})")

        # If not found by uniqueid after max_wait, try timestamp-based search as fallback
        logger.info(f"Uniqueid {uniqueid} not found after {max_wait} attempts, trying timestamp-based search...")
        return await self.find_recording_by_timestamp(call_timestamp, time_window=120)

    async def download_recording(self, remote_path: str) -> Optional[str]:
        """
        Download a recording file from PBX and transcode to web-friendly format

        Args:
            remote_path: Full path to recording on PBX

        Returns:
            Local file path relative to uploads directory, or None if failed
        """
        try:
            # Generate local filename
            remote_filename = Path(remote_path).name
            timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
            temp_filename = f"call_recording_temp_{timestamp}_{remote_filename}"
            temp_path = self.local_uploads / temp_filename

            # Final transcoded filename (change extension to .mp3 for better browser support)
            final_filename = f"call_recording_{timestamp}_{Path(remote_filename).stem}.mp3"
            final_path = self.local_uploads / final_filename

            logger.info(f"Downloading recording from {remote_path} to {temp_path}")

            # Connect via SFTP using SSH key
            transport = paramiko.Transport((self.host, self.port))
            private_key = paramiko.RSAKey.from_private_key_file(self.key_path)
            transport.connect(username=self.username, pkey=private_key)
            sftp = paramiko.SFTPClient.from_transport(transport)

            try:
                # Download file to temp location
                sftp.get(remote_path, str(temp_path))
                logger.info(f"Successfully downloaded recording to temp: {temp_filename}")

                # Transcode to web-friendly format (44.1 kHz, MP3)
                # This fixes the playback speed issue caused by 8 kHz telephony audio
                import subprocess
                transcode_cmd = [
                    '/usr/local/bin/ffmpeg',
                    '-i', str(temp_path),
                    '-ar', '44100',  # Resample to 44.1 kHz (web standard)
                    '-ac', '1',      # Keep mono
                    '-b:a', '64k',   # Bitrate for voice quality
                    '-y',            # Overwrite output
                    str(final_path)
                ]

                result = subprocess.run(
                    transcode_cmd,
                    capture_output=True,
                    text=True,
                    timeout=60
                )

                if result.returncode == 0:
                    logger.info(f"Successfully transcoded recording: {final_filename}")
                    # Remove temp file
                    temp_path.unlink()
                    # Return relative path for database
                    return f"uploads/{final_filename}"
                else:
                    logger.error(f"FFmpeg transcode failed: {result.stderr}")
                    # Fall back to original file if transcode fails
                    temp_path.rename(final_path.with_suffix('.wav'))
                    return f"uploads/{final_filename.replace('.mp3', '.wav')}"

            except Exception as e:
                logger.error(f"Error downloading/transcoding recording: {e}")
                return None
            finally:
                sftp.close()
                transport.close()

        except Exception as e:
            logger.error(f"SFTP connection error during download: {e}")
            return None

    async def retrieve_and_download(self, uniqueid: str, call_timestamp: datetime, max_wait: int = 30) -> Optional[str]:
        """
        Find and download a recording by uniqueid with timestamp fallback

        Args:
            uniqueid: The call unique ID
            call_timestamp: When the call event was created (for fallback search)
            max_wait: Maximum seconds to wait for recording

        Returns:
            Local file path relative to uploads directory, or None if failed
        """
        # Find the recording (includes timestamp fallback)
        remote_path = await self.find_recording_by_uniqueid(uniqueid, call_timestamp, max_wait)

        if not remote_path:
            logger.warning(f"Could not find recording for uniqueid {uniqueid}")
            return None

        # Download it
        local_path = await self.download_recording(remote_path)

        return local_path

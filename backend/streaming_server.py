#!/usr/bin/env python3
"""
RTSP to HLS Streaming Server
Converts RTSP streams to HLS format for browser playback
"""

import asyncio
import os
import subprocess
import time
from typing import Dict, Optional
import logging
from pathlib import Path
from security_utils import validate_rtsp_url

logger = logging.getLogger(__name__)

class StreamManager:
    def __init__(self, streams_dir: str = None, redis_client=None):
        if streams_dir is None:
            # Use dedicated media volume for streams
            streams_dir = "/mnt/media/streams"

        self.streams_dir = Path(streams_dir)
        self.streams_dir.mkdir(exist_ok=True)
        self.active_streams: Dict[int, subprocess.Popen] = {}
        self.stream_last_update: Dict[int, float] = {}  # Track last update time for health checks
        self.redis = redis_client  # Redis client for cross-worker coordination
        
    def start_stream(self, camera_id: int, rtsp_url: str, quality: str = 'low') -> bool:
        """Start an RTSP to HLS stream for a camera

        Args:
            camera_id: Camera ID
            rtsp_url: RTSP stream URL
            quality: 'low' (fast loading, grid view), 'medium' (single view), 'high' (fullscreen)
        """
        try:
            # SECURITY: Validate RTSP URL to prevent command injection
            try:
                rtsp_url = validate_rtsp_url(rtsp_url)
            except ValueError as e:
                logger.error(f"Invalid RTSP URL for camera {camera_id}: {e}")
                return False

            # Stop existing stream if running
            self.stop_stream(camera_id)

            # Clean up any orphaned FFmpeg processes for this camera
            self._cleanup_orphaned_ffmpeg(camera_id)

            # Create camera-specific directory
            camera_dir = self.streams_dir / str(camera_id)
            camera_dir.mkdir(exist_ok=True)

            # Check if FFmpeg is available
            ffmpeg_paths = ['/usr/local/bin/ffmpeg', 'ffmpeg', 'C:\\ffmpeg\\ffmpeg.exe']
            ffmpeg_path = None

            for path in ffmpeg_paths:
                try:
                    subprocess.run([path, '-version'],
                                 capture_output=True, check=True, timeout=5)
                    ffmpeg_path = path
                    break
                except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                    continue

            if not ffmpeg_path:
                logger.warning(f"FFmpeg not found, creating test stream for camera {camera_id}")
                return self._create_test_stream(camera_id, camera_dir)

            # HLS output path (relative to camera_dir since cwd is set to camera_dir)
            playlist_path = "playlist.m3u8"
            segment_path = "segment_%03d.ts"

            # Quality presets - optimized for GPU NVENC encoding with fast startup
            # GPU encoding is very efficient - can handle higher quality with minimal overhead
            # All streams limited to 10 FPS for reduced CPU/GPU load
            if quality == 'low':
                # Optimized for grid view - 360p, efficient for multiple concurrent streams
                video_scale = '640:360'  # Higher than before (was 240p) - GPU can handle it
                video_bitrate = '200k'  # Reduced from 300k (10 FPS needs less bitrate)
                preset = 'p2'  # Slightly slower for better quality/compression (was p1)
                hls_time = '2'  # 2 second segments
                keyframe_interval = '20'  # Force keyframe every 20 frames (2 sec at 10fps)
            elif quality == 'medium':
                # Balanced for single camera view - 540p (between 480p and 720p)
                video_scale = '960:540'  # Increased from 480p
                video_bitrate = '400k'  # Reduced from 600k (10 FPS needs less bitrate)
                preset = 'p3'  # Fast NVENC preset with good quality
                hls_time = '2'  # 2 second segments
                keyframe_interval = '20'  # Every 2 seconds at 10fps
            else:  # high
                # Higher quality for fullscreen - 720p or native resolution
                video_scale = '1280:720'
                video_bitrate = '800k'  # Reduced from 1200k (10 FPS needs less bitrate)
                preset = 'p4'  # Medium NVENC preset (p4 is good balance, was p5)
                hls_time = '2'  # 2 second segments
                keyframe_interval = '20'  # Every 2 seconds at 10fps

            # FFmpeg command to convert RTSP to HLS with FULL GPU PIPELINE
            # Uses GPU for: decode (hwaccel cuda) + scale (scale_cuda) + encode (h264_nvenc)
            # This minimizes CPU usage significantly compared to CPU decoding
            cmd = [
                ffmpeg_path,
                '-hwaccel', 'cuda',  # Enable CUDA hardware acceleration for decoding
                '-hwaccel_output_format', 'cuda',  # Keep decoded frames in GPU memory
                '-rtsp_transport', 'tcp',  # Use TCP for more reliable connection
                '-fflags', 'nobuffer',  # No buffering for faster startup
                '-flags', 'low_delay',  # Low delay mode
                '-i', rtsp_url,
            ]

            # Build GPU filter chain: scale on GPU + limit frame rate to 10 FPS
            # This avoids expensive GPU-to-CPU-to-GPU transfers and reduces processing load
            if video_scale:
                cmd.extend(['-vf', f'scale_cuda={video_scale},fps=10'])
            else:
                cmd.extend(['-vf', 'fps=10'])

            cmd.extend([
                '-c:v', 'h264_nvenc',
                '-preset', preset,
                '-tune', 'll',
                '-rc', 'cbr',
                '-b:v', video_bitrate,
                '-maxrate', video_bitrate,
                '-bufsize', video_bitrate,
                '-g', keyframe_interval,
                '-forced-idr', '1',
                '-sc_threshold', '0',
                '-c:a', 'aac',
                '-b:a', '64k',
                '-ar', '22050',
                '-f', 'hls',
                '-hls_time', hls_time,
                '-hls_list_size', '10',
                '-hls_flags', 'delete_segments+independent_segments+append_list',
                '-hls_segment_filename', str(segment_path),
                '-hls_segment_type', 'mpegts',
                '-hls_delete_threshold', '3',
                '-hls_allow_cache', '0',
                '-start_number', '0',
                '-hls_start_number_source', 'epoch',
                '-y',
                str(playlist_path)
            ])
            
            logger.info(f"Starting stream for camera {camera_id}: {' '.join(cmd)}")

            # Start FFmpeg process
            process = subprocess.Popen(
                cmd,
                stdout=subprocess.PIPE,
                stderr=subprocess.PIPE,
                cwd=str(camera_dir),
                text=True,
                creationflags=subprocess.CREATE_NEW_PROCESS_GROUP if os.name == 'nt' else 0
            )

            self.active_streams[camera_id] = process
            self.stream_last_update[camera_id] = time.time()  # Track start time

            # Start background thread to monitor stderr output
            import threading
            def monitor_stderr():
                try:
                    for line in process.stderr:
                        if line.strip():
                            # Log errors and warnings at appropriate levels
                            line_lower = line.lower()
                            if 'error' in line_lower or 'failed' in line_lower:
                                logger.error(f"FFmpeg [{camera_id}]: {line.strip()}")
                            elif 'warning' in line_lower:
                                logger.warning(f"FFmpeg [{camera_id}]: {line.strip()}")
                            else:
                                logger.debug(f"FFmpeg [{camera_id}]: {line.strip()}")
                except Exception as e:
                    logger.error(f"Error reading FFmpeg stderr for camera {camera_id}: {e}")

            stderr_thread = threading.Thread(target=monitor_stderr, daemon=True)
            stderr_thread.start()

            # Register stream in Redis for cross-worker coordination (synchronously in this sync function)
            # Note: This is a sync function, so we'll use redis-py sync client if available
            # The async wrapper will handle Redis properly
            logger.info(f"Registered stream {camera_id} in local worker, Redis will be updated by async wrapper")

            # Quick check to make sure process started (wait 500ms)
            time.sleep(0.5)
            if process.poll() is not None:
                # Process ended immediately, likely an error
                stdout, stderr = process.communicate()
                logger.error(f"FFmpeg failed immediately for camera {camera_id}")
                logger.error(f"STDERR: {stderr}")
                logger.error(f"STDOUT: {stdout}")
                logger.error(f"Return code: {process.returncode}")
                del self.active_streams[camera_id]
                if camera_id in self.stream_last_update:
                    del self.stream_last_update[camera_id]
                # Remove from Redis
                if self.redis:
                    try:
                        asyncio.create_task(self.redis.delete(f"stream_active:{camera_id}"))
                    except:
                        pass
                return False

            # Process is running - return immediately for async startup
            # Frontend will poll stream-status to check when playlist is ready
            logger.info(f"Stream process started for camera {camera_id}, waiting for playlist creation in background")
            return True
            
        except Exception as e:
            logger.error(f"Failed to start stream for camera {camera_id}: {e}")
            return False
    
    def _create_test_stream(self, camera_id: int, camera_dir: Path) -> bool:
        """Create a test HLS stream when FFmpeg is not available"""
        try:
            # Create a test stream using a sample video or test pattern
            return self._create_sample_video_stream(camera_id, camera_dir)
            
        except Exception as e:
            logger.error(f"Failed to create test stream for camera {camera_id}: {e}")
            return False
    
    def _create_sample_video_stream(self, camera_id: int, camera_dir: Path) -> bool:
        """Create a sample video stream for testing"""
        try:
            # Try to use FFmpeg to create a test pattern if available
            try:
                subprocess.run(['ffmpeg', '-version'], 
                             capture_output=True, check=True)
                
                # Create a test pattern video with GPU encoding
                cmd = [
                    'ffmpeg',
                    '-f', 'lavfi',
                    '-i', 'testsrc=duration=10:size=640x480:rate=30',
                    '-c:v', 'h264_nvenc',  # GPU encoding
                    '-f', 'hls',
                    '-hls_time', '2',
                    '-hls_list_size', '5',
                    '-hls_flags', 'delete_segments',
                    '-hls_segment_filename', str(camera_dir / 'segment_%03d.ts'),
                    '-y',
                    str(camera_dir / 'playlist.m3u8')
                ]
                
                result = subprocess.run(cmd, capture_output=True, text=True, timeout=30)
                if result.returncode == 0:
                    logger.info(f"Created sample video stream for camera {camera_id}")
                    return True
                else:
                    logger.warning(f"FFmpeg test pattern failed: {result.stderr}")
                    
            except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                pass
            
            # Fallback: Create a simple test message
            return self._create_test_message_stream(camera_id, camera_dir)
            
        except Exception as e:
            logger.error(f"Failed to create sample video stream for camera {camera_id}: {e}")
            return False
    
    def _create_test_message_stream(self, camera_id: int, camera_dir: Path) -> bool:
        """Create a test message stream when no video is available"""
        try:
            # Create a simple test playlist
            playlist_content = """#EXTM3U
#EXT-X-VERSION:3
#EXT-X-TARGETDURATION:2
#EXT-X-MEDIA-SEQUENCE:0
#EXTINF:2.0,
test_segment.ts
#EXT-X-ENDLIST"""
            
            playlist_path = camera_dir / "playlist.m3u8"
            with open(playlist_path, 'w') as f:
                f.write(playlist_content)
            
            # Create a dummy segment file
            segment_path = camera_dir / "test_segment.ts"
            with open(segment_path, 'wb') as f:
                f.write(b'\x00' * 1024)  # 1KB dummy file
            
            logger.info(f"Created test message stream for camera {camera_id}")
            return True
            
        except Exception as e:
            logger.error(f"Failed to create test message stream for camera {camera_id}: {e}")
            return False
    
    def stop_stream(self, camera_id: int) -> bool:
        """Stop an active stream"""
        try:
            if camera_id in self.active_streams:
                process = self.active_streams[camera_id]
                
                # Terminate the process group (Windows) or process (Unix)
                if os.name == 'nt':
                    # Windows: terminate the process group
                    process.terminate()
                else:
                    # Unix: terminate the process
                    process.terminate()
                
                # Wait for graceful shutdown
                try:
                    process.wait(timeout=5)
                except subprocess.TimeoutExpired:
                    # Force kill if it doesn't stop gracefully
                    if os.name == 'nt':
                        process.kill()
                    else:
                        process.kill()
                    process.wait()
                
                del self.active_streams[camera_id]
                if camera_id in self.stream_last_update:
                    del self.stream_last_update[camera_id]

                # Remove from Redis
                if self.redis:
                    try:
                        import asyncio
                        asyncio.create_task(self.redis.delete(f"stream_active:{camera_id}"))
                    except:
                        pass

                logger.info(f"Stream stopped for camera {camera_id}")

                # Clean up old stream files
                self._cleanup_stream_files(camera_id)
                return True
            return False
        except Exception as e:
            logger.error(f"Failed to stop stream for camera {camera_id}: {e}")
            return False
    
    def _cleanup_stream_files(self, camera_id: int):
        """Clean up old stream files for a camera"""
        try:
            camera_dir = self.streams_dir / str(camera_id)
            if camera_dir.exists():
                # Remove all .ts segment files
                for ts_file in camera_dir.glob("*.ts"):
                    ts_file.unlink()
                    logger.info(f"Removed old segment file: {ts_file}")
                
                # Remove playlist file
                playlist_file = camera_dir / "playlist.m3u8"
                if playlist_file.exists():
                    playlist_file.unlink()
                    logger.info(f"Removed old playlist file: {playlist_file}")
                
                # Remove any temporary files
                for temp_file in camera_dir.glob("*.tmp"):
                    temp_file.unlink()
                    logger.info(f"Removed temp file: {temp_file}")
                
                logger.info(f"Cleaned up stream files for camera {camera_id}")
        except Exception as e:
            logger.error(f"Failed to cleanup stream files for camera {camera_id}: {e}")
    
    def force_restart_stream(self, camera_id: int, rtsp_url: str) -> bool:
        """Force restart a stream, ensuring fresh live content"""
        try:
            # Stop existing stream if running
            if camera_id in self.active_streams:
                self.stop_stream(camera_id)
            
            # Clean up any remaining files
            self._cleanup_stream_files(camera_id)
            
            # Wait a moment for cleanup
            time.sleep(1)
            
            # Start fresh stream
            return self.start_stream(camera_id, rtsp_url)
        except Exception as e:
            logger.error(f"Failed to force restart stream for camera {camera_id}: {e}")
            return False
    
    async def is_stream_active_async(self, camera_id: int) -> bool:
        """Check if a stream is currently active (async version for multi-worker)

        For multi-worker environments, we check:
        1. If this worker has the process - check if it's running
        2. If not, check Redis (cross-worker state)
        3. If Redis unavailable, check filesystem for recent playlist file
        """
        # Check if this worker has the FFmpeg process
        if camera_id in self.active_streams:
            process = self.active_streams[camera_id]
            if process.poll() is None:
                # FFmpeg is running in this worker
                return True
            else:
                # FFmpeg process has ended, remove it from active streams
                del self.active_streams[camera_id]
                if camera_id in self.stream_last_update:
                    del self.stream_last_update[camera_id]
                logger.info(f"FFmpeg process for camera {camera_id} has ended")
                # Remove from Redis
                if self.redis:
                    try:
                        await self.redis.delete(f"stream_active:{camera_id}")
                    except Exception as e:
                        logger.debug(f"Failed to remove from Redis: {e}")

        # Check Redis for stream registered by another worker
        if self.redis:
            try:
                is_active = await self.redis.exists(f"stream_active:{camera_id}")
                if is_active:
                    logger.debug(f"Stream {camera_id} is active in another worker (via Redis)")
                    return True
            except Exception as e:
                logger.debug(f"Redis check failed for camera {camera_id}: {e}")

        # Fallback: Check filesystem for recent playlist file
        camera_dir = self.streams_dir / str(camera_id)
        playlist_path = camera_dir / "playlist.m3u8"

        if playlist_path.exists():
            # Check if playlist was recently modified (within last 30 seconds)
            age = time.time() - playlist_path.stat().st_mtime
            if age < 30:  # Playlist updated in last 30 seconds = stream is active
                logger.debug(f"Stream {camera_id} appears active based on filesystem (age: {age:.1f}s)")
                return True

        # No active FFmpeg process, not in Redis, and no recent playlist = stream is not active
        return False

    def is_stream_active(self, camera_id: int) -> bool:
        """Check if a stream is currently active (synchronous version - use for non-async code)

        NOTE: This is a simplified sync version. For proper multi-worker support,
        use is_stream_active_async() from async contexts.
        """
        # Check if this worker has the FFmpeg process
        if camera_id in self.active_streams:
            process = self.active_streams[camera_id]
            if process.poll() is None:
                return True
            else:
                del self.active_streams[camera_id]
                if camera_id in self.stream_last_update:
                    del self.stream_last_update[camera_id]

        # Fallback: Check filesystem for recent playlist file
        camera_dir = self.streams_dir / str(camera_id)
        playlist_path = camera_dir / "playlist.m3u8"

        if playlist_path.exists():
            age = time.time() - playlist_path.stat().st_mtime
            if age < 30:
                return True

        return False
    
    def is_stream_ready(self, camera_id: int) -> bool:
        """Check if stream playlist file exists and is ready to play"""
        camera_dir = self.streams_dir / str(camera_id)
        playlist_path = camera_dir / "playlist.m3u8"
        return playlist_path.exists()

    def is_stream_healthy(self, camera_id: int, max_age_seconds: int = 10) -> bool:
        """Check if stream is healthy by verifying recent segment creation

        Args:
            camera_id: Camera ID
            max_age_seconds: Maximum age of most recent segment file in seconds (default 10)

        Returns:
            True if stream is healthy (recent segments exist), False otherwise
        """
        if camera_id not in self.active_streams:
            return False

        # Check if FFmpeg process is still running
        process = self.active_streams[camera_id]
        if process.poll() is not None:
            logger.warning(f"Stream {camera_id} FFmpeg process has ended")
            return False

        # Check if any segment files were recently created/modified
        camera_dir = self.streams_dir / str(camera_id)
        if not camera_dir.exists():
            return False

        # Find most recent segment file
        segment_files = list(camera_dir.glob("segment_*.ts"))
        if not segment_files:
            # No segments yet - check if stream just started
            if camera_id in self.stream_last_update:
                elapsed = time.time() - self.stream_last_update[camera_id]
                # Give stream up to 30 seconds to produce first segment
                return elapsed < 30
            return False

        # Check modification time of most recent segment
        most_recent = max(segment_files, key=lambda p: p.stat().st_mtime)
        age = time.time() - most_recent.stat().st_mtime

        if age > max_age_seconds:
            logger.warning(f"Stream {camera_id} appears frozen - most recent segment is {age:.1f}s old")
            return False

        return True

    def get_stream_url(self, camera_id: int) -> Optional[str]:
        """Get the HLS stream URL for a camera"""
        # Only return URL if there's an active FFmpeg process AND playlist exists
        if camera_id in self.active_streams:
            process = self.active_streams[camera_id]
            if process.poll() is None:
                # Check if playlist file exists
                if self.is_stream_ready(camera_id):
                    return f"/streams/{camera_id}/playlist.m3u8"
                # Process running but playlist not ready yet
                return None
            else:
                # FFmpeg process has ended, remove it from active streams
                del self.active_streams[camera_id]
                logger.info(f"FFmpeg process for camera {camera_id} has ended")

        return None
    
    def cleanup_old_segments(self, camera_id: int):
        """Clean up old HLS segments"""
        try:
            camera_dir = self.streams_dir / str(camera_id)
            if camera_dir.exists():
                # Remove old .ts files (keep only recent ones)
                for ts_file in camera_dir.glob("segment_*.ts"):
                    if time.time() - ts_file.stat().st_mtime > 30:  # 30 seconds old
                        ts_file.unlink()
        except Exception as e:
            logger.error(f"Failed to cleanup segments for camera {camera_id}: {e}")
    
    def stop_all_streams(self):
        """Stop all active streams"""
        for camera_id in list(self.active_streams.keys()):
            self.stop_stream(camera_id)
    
    def kill_all_ffmpeg_processes(self):
        """Kill all FFmpeg processes (emergency cleanup)"""
        try:
            import psutil
            for proc in psutil.process_iter(['pid', 'name', 'cmdline']):
                try:
                    if proc.info['name'] and 'ffmpeg' in proc.info['name'].lower():
                        logger.info(f"Killing orphaned FFmpeg process: {proc.info['pid']}")
                        proc.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except ImportError:
            # Fallback for systems without psutil
            logger.warning("psutil not available, cannot kill orphaned FFmpeg processes")
        except Exception as e:
            logger.error(f"Error killing FFmpeg processes: {e}")
    
    def _cleanup_orphaned_ffmpeg(self, camera_id: int):
        """Clean up any orphaned FFmpeg processes for a specific camera"""
        try:
            import psutil
            camera_dir = self.streams_dir / str(camera_id)
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
                try:
                    if (proc.info['name'] and 'ffmpeg' in proc.info['name'].lower() and
                        proc.info['cwd'] and str(camera_dir) in proc.info['cwd']):
                        logger.info(f"Killing orphaned FFmpeg process for camera {camera_id}: {proc.info['pid']}")
                        proc.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except ImportError:
            logger.warning("psutil not available, cannot cleanup orphaned FFmpeg processes")
        except Exception as e:
            logger.error(f"Error cleaning up orphaned FFmpeg for camera {camera_id}: {e}")

    def get_stream_stats(self, camera_id: int) -> dict:
        """Get statistics for a stream including resource usage"""
        try:
            import psutil

            if camera_id not in self.active_streams:
                return {"active": False}

            process = self.active_streams[camera_id]
            if process.poll() is not None:
                return {"active": False, "status": "process_ended"}

            try:
                proc = psutil.Process(process.pid)
                cpu_percent = proc.cpu_percent(interval=0.1)
                memory_info = proc.memory_info()
                memory_mb = memory_info.rss / 1024 / 1024

                # Get stream health
                camera_dir = self.streams_dir / str(camera_id)
                segment_files = list(camera_dir.glob("segment_*.ts"))

                last_update_age = None
                if segment_files:
                    most_recent = max(segment_files, key=lambda p: p.stat().st_mtime)
                    last_update_age = time.time() - most_recent.stat().st_mtime

                return {
                    "active": True,
                    "pid": process.pid,
                    "cpu_percent": cpu_percent,
                    "memory_mb": memory_mb,
                    "segment_count": len(segment_files),
                    "last_update_age": last_update_age,
                    "healthy": self.is_stream_healthy(camera_id)
                }
            except psutil.NoSuchProcess:
                return {"active": False, "status": "process_not_found"}
        except ImportError:
            return {"active": True, "status": "psutil_not_available"}
        except Exception as e:
            logger.error(f"Error getting stream stats for camera {camera_id}: {e}")
            return {"active": False, "error": str(e)}

    def get_all_streams_stats(self) -> dict:
        """Get statistics for all active streams"""
        stats = {}
        for camera_id in list(self.active_streams.keys()):
            stats[camera_id] = self.get_stream_stats(camera_id)
        return stats

    def cleanup_all_orphaned_streams(self):
        """Clean up any streams that are not in active_streams but have FFmpeg processes"""
        try:
            import psutil

            # Get all FFmpeg processes
            for proc in psutil.process_iter(['pid', 'name', 'cmdline', 'cwd']):
                try:
                    if proc.info['name'] and 'ffmpeg' in proc.info['name'].lower():
                        # Check if this process is in our active_streams
                        is_managed = False
                        for camera_id, managed_proc in self.active_streams.items():
                            if managed_proc.pid == proc.info['pid']:
                                is_managed = True
                                break

                        if not is_managed:
                            logger.warning(f"Found orphaned FFmpeg process (PID {proc.info['pid']}), terminating...")
                            proc.terminate()
                            try:
                                proc.wait(timeout=5)
                            except psutil.TimeoutExpired:
                                proc.kill()
                except (psutil.NoSuchProcess, psutil.AccessDenied, psutil.ZombieProcess):
                    pass
        except ImportError:
            logger.warning("psutil not available, cannot cleanup orphaned processes")
        except Exception as e:
            logger.error(f"Error cleaning up orphaned streams: {e}")

    def capture_snapshot(self, camera_id: int, rtsp_url: str) -> Optional[str]:
        """Capture a single frame from RTSP stream and save as JPEG

        Args:
            camera_id: Camera ID
            rtsp_url: RTSP stream URL

        Returns:
            Path to snapshot file relative to project root, or None if failed
        """
        try:
            # SECURITY: Validate RTSP URL to prevent command injection
            try:
                rtsp_url = validate_rtsp_url(rtsp_url)
            except ValueError as e:
                logger.error(f"Invalid RTSP URL for camera {camera_id}: {e}")
                return None

            # Create snapshots directory on dedicated media volume
            snapshots_dir = Path("/mnt/media/uploads/snapshots")
            snapshots_dir.mkdir(parents=True, exist_ok=True)

            # Output filename with timestamp
            snapshot_filename = f"camera_{camera_id}_snapshot.jpg"
            snapshot_path = snapshots_dir / snapshot_filename

            # Check if FFmpeg is available
            ffmpeg_paths = ['/usr/local/bin/ffmpeg', 'ffmpeg', 'C:\\ffmpeg\\ffmpeg.exe']
            ffmpeg_path = None

            for path in ffmpeg_paths:
                try:
                    subprocess.run([path, '-version'],
                                 capture_output=True, check=True, timeout=5)
                    ffmpeg_path = path
                    break
                except (subprocess.CalledProcessError, FileNotFoundError, subprocess.TimeoutExpired):
                    continue

            if not ffmpeg_path:
                logger.warning(f"FFmpeg not found, cannot capture snapshot for camera {camera_id}")
                return None

            # FFmpeg command to capture a single frame
            cmd = [
                ffmpeg_path,
                '-rtsp_transport', 'tcp',
                '-i', rtsp_url,
                '-frames:v', '1',  # Capture only 1 frame
                '-q:v', '2',  # High quality JPEG (1-31, lower is better)
                '-y',  # Overwrite output file
                str(snapshot_path)
            ]

            logger.info(f"Capturing snapshot for camera {camera_id}")

            # Run FFmpeg with timeout
            result = subprocess.run(
                cmd,
                capture_output=True,
                text=True,
                timeout=10  # 10 second timeout
            )

            if result.returncode == 0 and snapshot_path.exists():
                logger.info(f"Snapshot captured for camera {camera_id}: {snapshot_path}")
                # Return path relative to project root for serving
                return f"uploads/snapshots/{snapshot_filename}"
            else:
                logger.error(f"Failed to capture snapshot for camera {camera_id}")
                logger.error(f"FFmpeg stderr: {result.stderr}")
                return None

        except subprocess.TimeoutExpired:
            logger.error(f"Snapshot capture timed out for camera {camera_id}")
            return None
        except Exception as e:
            logger.error(f"Failed to capture snapshot for camera {camera_id}: {e}")
            return None

# Global stream manager instance (will be initialized with Redis client by main.py)
stream_manager = StreamManager()

def set_redis_client(redis_client):
    """Set Redis client for cross-worker stream coordination"""
    global stream_manager
    stream_manager.redis = redis_client

async def start_camera_stream(camera_id: int, rtsp_url: str, quality: str = 'low') -> bool:
    """Start streaming for a camera (async wrapper with Redis registration)"""
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, stream_manager.start_stream, camera_id, rtsp_url, quality)

    # Register in Redis for cross-worker coordination
    if success and stream_manager.redis:
        try:
            await stream_manager.redis.setex(f"stream_active:{camera_id}", 60, "1")
            logger.info(f"Registered stream {camera_id} in Redis for cross-worker coordination")
        except Exception as e:
            logger.warning(f"Failed to register stream in Redis: {e}")

    return success

async def stop_camera_stream(camera_id: int) -> bool:
    """Stop streaming for a camera (async wrapper with Redis cleanup)"""
    loop = asyncio.get_event_loop()
    success = await loop.run_in_executor(None, stream_manager.stop_stream, camera_id)

    # Remove from Redis
    if stream_manager.redis:
        try:
            await stream_manager.redis.delete(f"stream_active:{camera_id}")
            logger.info(f"Removed stream {camera_id} from Redis")
        except Exception as e:
            logger.warning(f"Failed to remove stream from Redis: {e}")

    return success

async def is_camera_streaming(camera_id: int) -> bool:
    """Check if camera is streaming (async wrapper with Redis support)"""
    return await stream_manager.is_stream_active_async(camera_id)

async def get_camera_stream_url(camera_id: int) -> Optional[str]:
    """Get camera stream URL (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, stream_manager.get_stream_url, camera_id)

async def force_restart_camera_stream(camera_id: int, rtsp_url: str) -> bool:
    """Force restart camera stream for fresh live content (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, stream_manager.force_restart_stream, camera_id, rtsp_url)

async def is_stream_ready(camera_id: int) -> bool:
    """Check if stream is ready to play (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, stream_manager.is_stream_ready, camera_id)

async def capture_camera_snapshot(camera_id: int, rtsp_url: str) -> Optional[str]:
    """Capture snapshot from camera (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, stream_manager.capture_snapshot, camera_id, rtsp_url)

async def is_stream_healthy(camera_id: int, max_age_seconds: int = 10) -> bool:
    """Check if stream is healthy (async wrapper)"""
    loop = asyncio.get_event_loop()
    return await loop.run_in_executor(None, stream_manager.is_stream_healthy, camera_id, max_age_seconds)

# ============================================================================
# Stream Viewer Management (Reference Counting)
# ============================================================================

async def add_stream_viewer(camera_id: int, viewer_id: str) -> int:
    """
    Add a viewer to a camera stream (reference counting)

    Args:
        camera_id: Camera ID
        viewer_id: Unique viewer identifier (e.g., user_id, session_id)

    Returns:
        Current viewer count for this camera
    """
    if not stream_manager.redis:
        logger.warning("Redis not available for stream viewer tracking")
        return 1

    try:
        import time
        # Add viewer to the set of active viewers for this camera
        viewers_key = f"stream_viewers:{camera_id}"
        await stream_manager.redis.hset(viewers_key, viewer_id, int(time.time()))

        # Set expiry on the viewers hash (refresh it)
        await stream_manager.redis.expire(viewers_key, 300)  # 5 minutes

        # Get current viewer count
        viewer_count = await stream_manager.redis.hlen(viewers_key)

        logger.info(f"Added viewer {viewer_id} to camera {camera_id} stream (total viewers: {viewer_count})")
        return viewer_count
    except Exception as e:
        logger.error(f"Error adding stream viewer: {e}")
        return 1

async def remove_stream_viewer(camera_id: int, viewer_id: str) -> int:
    """
    Remove a viewer from a camera stream (reference counting)

    Args:
        camera_id: Camera ID
        viewer_id: Unique viewer identifier

    Returns:
        Remaining viewer count for this camera
    """
    if not stream_manager.redis:
        return 0

    try:
        import time
        viewers_key = f"stream_viewers:{camera_id}"

        # Remove viewer from the set
        await stream_manager.redis.hdel(viewers_key, viewer_id)

        # Get remaining viewer count
        viewer_count = await stream_manager.redis.hlen(viewers_key)

        # If no viewers remain, set a timestamp for when to stop the stream
        if viewer_count == 0:
            stop_time = int(time.time()) + 30  # 30 second grace period
            await stream_manager.redis.setex(f"stream_stop_at:{camera_id}", 60, stop_time)
            logger.info(f"Last viewer left camera {camera_id}, will stop stream in 30s if no new viewers")

        logger.info(f"Removed viewer {viewer_id} from camera {camera_id} stream (remaining viewers: {viewer_count})")
        return viewer_count
    except Exception as e:
        logger.error(f"Error removing stream viewer: {e}")
        return 0

async def get_stream_viewer_count(camera_id: int) -> int:
    """Get the current viewer count for a camera stream"""
    if not stream_manager.redis:
        return 0

    try:
        viewers_key = f"stream_viewers:{camera_id}"
        return await stream_manager.redis.hlen(viewers_key)
    except Exception as e:
        logger.error(f"Error getting stream viewer count: {e}")
        return 0

async def should_stop_stream(camera_id: int) -> bool:
    """
    Check if a stream should be stopped based on viewer count and grace period

    Returns:
        True if stream should be stopped, False otherwise
    """
    if not stream_manager.redis:
        return False

    try:
        import time
        # Check if there are any viewers
        viewer_count = await get_stream_viewer_count(camera_id)
        if viewer_count > 0:
            # Active viewers, don't stop
            # Remove any pending stop timestamp
            await stream_manager.redis.delete(f"stream_stop_at:{camera_id}")
            return False

        # No viewers - check if grace period has expired
        stop_at_str = await stream_manager.redis.get(f"stream_stop_at:{camera_id}")
        if not stop_at_str:
            # No stop timestamp set yet - create one now (30 second grace period)
            stop_time = int(time.time()) + 30
            await stream_manager.redis.setex(f"stream_stop_at:{camera_id}", 60, stop_time)
            logger.info(f"No viewers for camera {camera_id}, starting 30s grace period before stopping")
            return False  # Don't stop yet, give it the grace period

        stop_at = int(stop_at_str)
        now = int(time.time())

        if now >= stop_at:
            # Grace period expired, should stop
            await stream_manager.redis.delete(f"stream_stop_at:{camera_id}")
            logger.info(f"Grace period expired for camera {camera_id}, stopping stream")
            return True

        # Still within grace period
        remaining = stop_at - now
        logger.debug(f"Camera {camera_id} within grace period, {remaining}s remaining")
        return False
    except Exception as e:
        logger.error(f"Error checking if stream should stop: {e}")
        return False

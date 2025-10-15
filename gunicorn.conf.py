# Gunicorn configuration file
import multiprocessing

# Server socket
bind = "127.0.0.1:8000"
backlog = 2048

# Worker processes
# Using Redis pub/sub for cross-worker WebSocket communication
workers = multiprocessing.cpu_count() * 2 + 1
worker_class = "uvicorn.workers.UvicornWorker"
worker_connections = 1000
timeout = 300
keepalive = 5

# Process naming
proc_name = "videomonitoring"

# Logging
accesslog = "/var/log/videomonitoring/access.log"
errorlog = "/var/log/videomonitoring/error.log"
loglevel = "info"
access_log_format = "%(h)s %(l)s %(u)s %(t)s \"%(r)s\" %(s)s %(b)s \"%(f)s\" \"%(a)s\""

# Process management
daemon = False
pidfile = "/var/run/videomonitoring/gunicorn.pid"
user = "ec2-user"
group = "ec2-user"
umask = 0o007

# Server mechanics
preload_app = False
reload = False

# Environment variables
raw_env = [
    "PYTHONUNBUFFERED=1",
]

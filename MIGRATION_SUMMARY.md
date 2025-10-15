# Database Migration Summary

## Migration Overview
**Date:** October 10, 2025
**From:** SQLite (local file: `backend/video_monitoring.db`)
**To:** AWS RDS PostgreSQL

## RDS Database Details
- **Writer Endpoint:** monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com
- **Reader Endpoint:** monitoringdata.cluster-ro-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com
- **Port:** 5432
- **Database:** videomonitoring
- **PostgreSQL Version:** 17.4 (ARM64)

## Migration Results
✓ **Total Records Migrated:** 192

### Data Breakdown:
- Countries: 1 record
- Groups: 2 records
- Dealers: 2 records
- Users: 3 records
- Video Accounts: 2 records
- Cameras: 6 records
- Alarm Events: 118 records
- Alarms: 37 records
- Activity Logs: 21 records
- Account Claims: 0 records

## Configuration Changes

### 1. Backend Environment (.env)
Updated `/var/www/videomonitoring/backend/.env` with:
```
DATABASE_URL=postgresql://postgres:ZUzXgq<<5sivAc4fSeX|~c|#s~#C@monitoringdata.cluster-cpgkyg2y2s1h.us-west-2.rds.amazonaws.com:5432/videomonitoring
```

### 2. System Service
Updated `/etc/systemd/system/videomonitoring.service`:
- Added: `EnvironmentFile=/var/www/videomonitoring/backend/.env`
- Service enabled to start on boot
- Status: Active and running

### 3. Dependencies
Installed: `psycopg2-binary-2.9.11` (PostgreSQL adapter for Python)

## Verification
✓ Database connection successful
✓ All 192 records verified
✓ Write operations tested and working
✓ Application started successfully with RDS
✓ API endpoints responding correctly

## Backup Information
**Original SQLite Database:** `/var/www/videomonitoring/backend/video_monitoring.db`
**Backup Location:** Same location (not deleted)
**Note:** Keep the SQLite backup for at least 30 days before deletion

## Migration Scripts Created
1. `test_rds_connection.py` - Test database connectivity
2. `create_rds_database.py` - Create the videomonitoring database
3. `migrate_to_rds.py` - Full migration script (schema + data)
4. `update_sequences.py` - Update PostgreSQL auto-increment sequences
5. `verify_migration.py` - Comprehensive verification script

## Post-Migration Checklist
- [x] Database schema created in RDS
- [x] All data migrated successfully
- [x] Sequences updated for auto-increment columns
- [x] Environment configuration updated
- [x] Systemd service updated and restarted
- [x] Service enabled for auto-start on boot
- [x] Application tested and working
- [x] Verification script confirms data integrity

## Service Management Commands
```bash
# Check service status
sudo systemctl status videomonitoring

# Restart service
sudo systemctl restart videomonitoring

# View logs
sudo tail -f /var/log/videomonitoring.log
sudo tail -f /var/log/videomonitoring-error.log

# Stop service
sudo systemctl stop videomonitoring

# Start service
sudo systemctl start videomonitoring
```

## Rollback Procedure (if needed)
If you need to rollback to SQLite:

1. Edit `/var/www/videomonitoring/backend/.env`:
   - Remove or comment out the DATABASE_URL line
   - This will use the default SQLite database

2. Restart the service:
   ```bash
   sudo systemctl restart videomonitoring
   ```

## Next Steps
1. Monitor application performance over the next 24-48 hours
2. Set up RDS backups (automated snapshots)
3. Configure RDS monitoring and CloudWatch alarms
4. Consider setting up read replicas if needed for scaling
5. After 30 days of successful operation, archive/delete SQLite backups

## Performance Notes
- PostgreSQL provides better concurrent access than SQLite
- RDS offers automated backups and point-in-time recovery
- Connection pooling is already configured in SQLAlchemy
- RDS is on ARM64 (Graviton) for cost-effective performance

## Support
If you encounter any issues:
1. Check service logs: `sudo journalctl -u videomonitoring -f`
2. Run verification script: `/var/www/videomonitoring/venv/bin/python /var/www/videomonitoring/verify_migration.py`
3. Test connection: `/var/www/videomonitoring/venv/bin/python /var/www/videomonitoring/test_rds_connection.py`

---
**Migration completed successfully on:** October 10, 2025, 21:04 UTC
**Performed by:** Claude Code

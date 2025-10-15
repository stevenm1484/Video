#!/usr/bin/env python3
"""
Update camera RTSP URL
"""

import sqlite3

def update_camera_rtsp():
    # Connect to the database
    conn = sqlite3.connect('video_monitoring.db')
    cursor = conn.cursor()
    
    # Update camera 1 with the RTSP URL
    rtsp_url = "rtsp://1user1:Assi182311@75.99.195.195:7001/8c2e0fd0-d4d2-6ef2-0fd5-537fbdc6d3e5?stream=-1"
    
    cursor.execute("""
        UPDATE cameras 
        SET rtsp_url = ? 
        WHERE id = 1
    """, (rtsp_url,))
    
    # Check if the update was successful
    cursor.execute("SELECT id, name, rtsp_url, location FROM cameras WHERE id = 1")
    result = cursor.fetchone()
    
    if result:
        print(f"Camera updated successfully:")
        print(f"ID: {result[0]}")
        print(f"Name: {result[1]}")
        print(f"RTSP URL: {result[2]}")
        print(f"Location: {result[3]}")
    else:
        print("Camera not found!")
    
    # Commit the changes
    conn.commit()
    conn.close()

if __name__ == "__main__":
    update_camera_rtsp()

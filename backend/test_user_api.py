#!/usr/bin/env python3
"""
Test user API response to verify sip_extension is returned
"""
import requests
import json

# Login first
login_response = requests.post('http://localhost:8000/api/token', data={
    'username': 'admin',
    'password': 'admin'
})

if login_response.status_code != 200:
    print(f"Login failed: {login_response.text}")
    exit(1)

token = login_response.json()['access_token']
headers = {'Authorization': f'Bearer {token}'}

# Get users list
users_response = requests.get('http://localhost:8000/api/users', headers=headers)

if users_response.status_code != 200:
    print(f"Failed to get users: {users_response.text}")
    exit(1)

users = users_response.json()

print("\n=== User API Response Check ===\n")
for user in users:
    print(f"User: {user['username']}")
    print(f"  ID: {user['id']}")
    print(f"  SIP Extension: {user.get('sip_extension', '(not in response)')}")
    print(f"  Has sip_password key: {'sip_password' in user}")
    print()

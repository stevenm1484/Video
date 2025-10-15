#!/usr/bin/env python3
"""
Script to restructure AlarmDetail.jsx to have a permanent 3-column layout:
- Left: Tabbed content (Media / Action Plan / Contacts / Notes)
- Middle: Events Timeline (always visible, 150px)
- Right: Live Feed (always visible, stays mounted)
"""

# Read the current file
with open('/var/www/videomonitoring/frontend/src/pages/AlarmDetail.jsx', 'r') as f:
    lines = f.readlines()

# Find key line numbers
tab_nav_start = None
media_tab_start = None
action_plan_tab_start = None
contacts_tab_start = None
notes_tab_start = None

for i, line in enumerate(lines):
    if '{/* Tab Navigation */}' in line or 'Tab Navigation' in line and 'div style={styles.tabNavigation}' in lines[i+1] if i+1 < len(lines) else False:
        tab_nav_start = i
    elif '{/* Media Tab - Full Video Grid */}' in line or ('activeTab === \'media\'' in line and 'Full Video Grid' in line):
        media_tab_start = i
    elif '{/* Action Plan Tab */}' in line and action_plan_tab_start is None:
        action_plan_tab_start = i
    elif '{/* Contacts Tab */}' in line:
        contacts_tab_start = i
    elif '{/* Notes & Actions Tab */}' in line:
        notes_tab_start = i

print(f"Tab Nav: {tab_nav_start}")
print(f"Media Tab: {media_tab_start}")
print(f"Action Plan Tab: {action_plan_tab_start}")
print(f"Contacts Tab: {contacts_tab_start}")
print(f"Notes Tab: {notes_tab_start}")

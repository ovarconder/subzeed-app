#!/usr/bin/env python3
"""Remove leftover auth blocks from admin API routes after verifyAdmin injection"""

FILES = [
    "src/app/api/admin/billing/route.ts",
    "src/app/api/admin/fingerprints/route.ts",
    "src/app/api/admin/users/update-tier/route.ts",
    "src/app/api/admin/users/unblock/route.ts",
    "src/app/api/admin/stats/route.ts",
    "src/app/api/admin/users/route.ts",
]

import os
ROOT = os.path.join(os.path.dirname(__file__), '..')

for fp in FILES:
    full = os.path.join(ROOT, fp)
    with open(full) as f:
        lines = f.readlines()
    
    new_lines = []
    skip_until_admin = False
    
    for line in lines:
        # start skipping after verifyAdmin
        if 'await verifyAdmin(request);' in line:
            new_lines.append(line)
            skip_until_admin = True
            continue
        
        if skip_until_admin:
            # stop skipping at adminSupabase creation
            if 'const adminSupabase = createServiceSupabase();' in line or 'const adminSupabase = createServiceSupabase();' in line.strip():
                new_lines.append('    const adminSupabase = createServiceSupabase();\n')
                skip_until_admin = False
            continue
        
        new_lines.append(line)
    
    # Also handle stats route (different pattern)
    with open(full) as f:
        content = f.read()
    
    original = content
    lines2 = content.split('\n')
    new_lines2 = []
    skip = False
    for i, line in enumerate(lines2):
        if 'await verifyAdmin(request);' in line:
            new_lines2.append(line)
            skip = True
            continue
        if skip:
            # skip until adminSupabase
            if 'const adminSupabase = createServiceSupabase();' in line:
                skip = False
                new_lines2.append('    const adminSupabase = createServiceSupabase();')
            continue
        new_lines2.append(line)
    
    result = '\n'.join(new_lines2)
    
    # Also remove duplicate blank lines
    while '\n\n\n' in result:
        result = result.replace('\n\n\n', '\n\n')
    
    if result != original:
        with open(full, 'w') as f:
            f.write(result)
        print(f"  CLEANED {fp}")
    else:
        print(f"  NO CHANGE {fp}")

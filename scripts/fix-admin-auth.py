#!/usr/bin/env python3
"""Fix all admin API routes to use verifyAdmin helper instead of createServerSupabase + getSession"""

import re
import os

ROOT = os.path.join(os.path.dirname(__file__), '..')

FILES = [
    "src/app/api/admin/users/route.ts",
    "src/app/api/admin/billing/route.ts",
    "src/app/api/admin/fingerprints/route.ts",
    "src/app/api/admin/users/update-tier/route.ts",
    "src/app/api/admin/users/unblock/route.ts",
    "src/app/api/admin/stats/route.ts",
]

FIX_IMPORT = (
    r"import { createServerSupabase(, createServiceSupabase)? } from ['\"]@/lib/supabase/server['\"];"
)

NEW_IMPORT = (
    "import { createServiceSupabase } from '@/lib/supabase/server';\n"
    "import { verifyAdmin } from '@/lib/admin-auth';"
)

def fix_file(fp: str) -> bool:
    full_path = os.path.join(ROOT, fp)
    if not os.path.exists(full_path):
        print(f"  SKIP {fp} — not found")
        return False
    
    with open(full_path) as f:
        c = f.read()
    
    original = c
    
    # 1. Fix import
    c = re.sub(FIX_IMPORT, NEW_IMPORT, c)
    
    # 2. Remove "const supabase = await createServerSupabase();"
    c = re.sub(r"const supabase = await createServerSupabase\(\);\s*\n", "", c)
    
    # 3. Remove getSession block up to adminSupabase creation
    c = re.sub(
        r"const \{ data: \{ session \} \} = await supabase\.auth\.getSession\(\);\s*\n"
        r"\s*\n"
        r"\s*if \(!session\?\.user\) \{\s*\n"
        r"\s*return NextResponse\.json\(\{ error: ['\"]Unauthorized['\"] \}, \{ status: 401 \}\);\s*\n"
        r"\s*\}\s*\n"
        r"\s*\n"
        r"\s*// .*?\n"
        r"\s*const adminSupabase = createServiceSupabase\(\);",
        "",
        c
    )
    
    # 4. Remove profile fetch + admin check
    c = re.sub(
        r"const \{ data: profile \} = await adminSupabase\s*\n"
        r"\s*\.from\('profiles'\)\s*\n"
        r"\s*\.select\('[^']+'\)\s*\n"
        r"\s*\.eq\('id', [^)]+\)\s*\n"
        r"\s*\.single\(\);\s*\n"
        r"\s*\n"
        r"\s*if \(!profile \|\| \(profile\.is_super_admin !== true && profile\.email !== 'overconda@gmail\.com'\)\) \{\s*\n"
        r"\s*return NextResponse\.json\(\{ error: 'Forbidden: Admin only' \}, \{ status: 403 \}\);\s*\n"
        r"\s*\}",
        "",
        c
    )
    
    # 5. Add verifyAdmin after first "try {"
    c = c.replace("try {", "try {\n    await verifyAdmin(request);", 1)
    
    if c == original:
        print(f"  NO CHANGE {fp}")
        return False
    
    with open(full_path, "w") as f:
        f.write(c)
    
    print(f"  FIXED {fp}")
    return True


if __name__ == '__main__':
    print("Fixing admin API routes...")
    for f in FILES:
        fix_file(f)
    print("Done!")

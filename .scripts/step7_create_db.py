"""
Step 7: Create SQLite Database from EVMS CSV
Reference: A_Cost_Schedule_Processing_Manual.md (Step 7)
           B_Web_Dashboard_Development_Guide.md

Reads step6_evms01.csv and converts it to project_db.sqlite
with proper type mapping and indexing for dashboard performance.

All output is versioned in the .created_db folder.
"""

import csv
import sqlite3
import os
import sys
from datetime import datetime

# --- Configuration ---
SOURCE_CSV = r'c:\Users\cho\Desktop\Temp\05 Code\260215_evms\output\step6_evms01.csv'
PROJECT_DIR = r'c:\Users\cho\Desktop\Temp\05 Code\260216_evms_dashborad'
OUTPUT_DIR = os.path.join(PROJECT_DIR, 'output')
VERSIONED_DIR = os.path.join(PROJECT_DIR, '.created_db')

# Columns that should be stored as REAL (numeric)
NUMERIC_COLUMNS = {
    'R2_수량', 'R3_재료비_단가', 'R4_노무비_단가', 'R5_경비_단가', 'R6_합계_단가',
    'R7_재료비_금액', 'R8_노무비_금액', 'R9_경비_금액', 'R10_합계_금액',
    'WHEN3_기간(일)'
}

# Columns to index for dashboard query performance
INDEX_COLUMNS = ['WHERE2_동', 'HOW1_공사', 'HOW2_대공종', 'WHO1_하도급업체', 'WHEN1_시작일']

def create_database(csv_path, db_path):
    """Create SQLite database from CSV with proper schema."""
    print(f"Reading CSV: {csv_path}")
    
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        columns = reader.fieldnames
        rows = list(reader)
    
    print(f"  >> {len(rows)} rows, {len(columns)} columns")
    
    # Build CREATE TABLE statement
    col_defs = []
    for col in columns:
        col_type = 'REAL' if col in NUMERIC_COLUMNS else 'TEXT'
        col_defs.append(f'"{col}" {col_type}')
    
    create_sql = f'CREATE TABLE IF NOT EXISTS evms ({", ".join(col_defs)});'
    
    # Insert statement
    placeholders = ', '.join(['?' for _ in columns])
    insert_sql = f'INSERT INTO evms VALUES ({placeholders});'
    
    # Connect and create
    if os.path.exists(db_path):
        os.remove(db_path)
    
    conn = sqlite3.connect(db_path)
    cursor = conn.cursor()
    
    # Create table
    cursor.execute(create_sql)
    
    # Insert rows with type conversion
    insert_count = 0
    for row in rows:
        values = []
        for col in columns:
            val = row.get(col, '').strip() if row.get(col) else ''
            if col in NUMERIC_COLUMNS:
                try:
                    values.append(float(val) if val else 0.0)
                except ValueError:
                    values.append(0.0)
            else:
                values.append(val)
        cursor.execute(insert_sql, values)
        insert_count += 1
    
    # Create indexes
    print("  Creating indexes...")
    for col in INDEX_COLUMNS:
        if col in columns:
            idx_name = f'idx_evms_{col}'
            cursor.execute(f'CREATE INDEX IF NOT EXISTS "{idx_name}" ON evms ("{col}");')
            print(f"    >> Index: {idx_name}")
    
    conn.commit()
    
    # Verify
    cursor.execute("SELECT COUNT(*) FROM evms")
    count = cursor.fetchone()[0]
    cursor.execute("SELECT SUM(R10_합계_금액) FROM evms")
    total = cursor.fetchone()[0]
    
    print(f"\n[OK] Database created: {db_path}")
    print(f"   Rows: {count}")
    print(f"   Total Cost (R10): {total:,.0f}")
    
    conn.close()
    return count, total

def main():
    # Ensure directories exist
    os.makedirs(OUTPUT_DIR, exist_ok=True)
    os.makedirs(VERSIONED_DIR, exist_ok=True)
    
    # Check source
    if not os.path.exists(SOURCE_CSV):
        print(f"[ERROR] Source CSV not found: {SOURCE_CSV}")
        sys.exit(1)
    
    # 1. Create main output DB
    main_db_path = os.path.join(OUTPUT_DIR, 'project_db.sqlite')
    count, total = create_database(SOURCE_CSV, main_db_path)
    
    # 2. Create versioned copy
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    versioned_db_path = os.path.join(VERSIONED_DIR, f'project_db_v{timestamp}.sqlite')
    create_database(SOURCE_CSV, versioned_db_path)
    print(f"\n[SAVED] Versioned copy: {versioned_db_path}")
    
    # 3. Summary
    print(f"\n{'='*60}")
    print(f"  Step 7 Complete")
    print(f"  Main DB:      {main_db_path}")
    print(f"  Versioned DB: {versioned_db_path}")
    print(f"  Rows: {count} | Total: ₩{total:,.0f}")
    print(f"{'='*60}")

if __name__ == '__main__':
    main()

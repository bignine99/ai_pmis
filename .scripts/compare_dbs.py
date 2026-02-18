#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""기존 DB vs 새 DB 컬럼명 비교"""
import sqlite3

print("=== project_db_v2.sqlite ===")
conn = sqlite3.connect('output/project_db_v2.sqlite')
c = conn.cursor()
info = c.execute("PRAGMA table_info(evms)").fetchall()
v2_cols = []
for row in info:
    col_id, name, dtype, notnull, default, pk = row
    v2_cols.append(name)
    print(f"  [{col_id:2d}] {name}")
print(f"  Total: {len(v2_cols)} columns")
conn.close()

print()
print("=== project_db_v3.sqlite ===")
conn = sqlite3.connect('output/project_db_v3.sqlite')
c = conn.cursor()
info = c.execute("PRAGMA table_info(evms)").fetchall()
v3_cols = []
for row in info:
    col_id, name, dtype, notnull, default, pk = row
    v3_cols.append(name)
    print(f"  [{col_id:2d}] {name}")
print(f"  Total: {len(v3_cols)} columns")

# 차이 분석
v2_set = set(v2_cols)
v3_set = set(v3_cols)
print()
print("Only in v2:", v2_set - v3_set)
print("Only in v3:", v3_set - v2_set)
print("Common:", v2_set & v3_set)

conn.close()

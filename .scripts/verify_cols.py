#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""컬럼명 인코딩 확인"""
import sqlite3

conn = sqlite3.connect('output/project_db_v3.sqlite')
c = conn.cursor()

# pragma로 직접 컬럼 정보 확인
info = c.execute("PRAGMA table_info(evms)").fetchall()
for row in info:
    col_id, name, dtype, notnull, default, pk = row
    # 실제 바이트 확인
    print(f"  [{col_id:2d}] {name!r:40s}  type={dtype}")

print()

# 실제 한글 컬럼명으로 쿼리 테스트
test_queries = [
    "SELECT COUNT(*) FROM evms WHERE R10_합계_금액 > 0",
    "SELECT COUNT(*) FROM evms WHERE \"WHEN4_실행률(%)\" IS NOT NULL",
    "SELECT COUNT(*) FROM evms WHERE WHERE2_동 IS NOT NULL AND WHERE2_동 != ''",
    "SELECT COUNT(DISTINCT HOW2_대공종) FROM evms",
    "SELECT COUNT(DISTINCT WHO1_하도급업체) FROM evms",
]
for q in test_queries:
    try:
        result = c.execute(q).fetchone()[0]
        print(f"OK: {q} => {result}")
    except Exception as e:
        print(f"ERR: {q} => {e}")

conn.close()

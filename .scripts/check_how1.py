# -*- coding: utf-8 -*-
import sqlite3, sys
sys.stdout.reconfigure(encoding='utf-8')
conn = sqlite3.connect('output/project_db_v2.sqlite')
cur = conn.cursor()

print("=== HOW2_대공종 (A prefix) ===")
cur.execute("""SELECT HOW2_대공종, COUNT(*) as cnt, 
    ROUND(AVG("WHEN3_기간(일)"), 1) as avg_dur
    FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''
    AND HOW2_대공종 LIKE 'A%'
    GROUP BY HOW2_대공종 ORDER BY avg_dur DESC""")
for r in cur.fetchall():
    print(f"  {r[0]:30s}  cnt={r[1]:5d}  avg_dur={r[2]}")

print("\n=== HOW2_대공종 containing 철근 or 철골 or 콘크리트 or 골조 ===")
cur.execute("""SELECT HOW2_대공종, COUNT(*) as cnt,
    ROUND(AVG("WHEN3_기간(일)"), 1) as avg_dur
    FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''
    AND (HOW2_대공종 LIKE '%철근%' OR HOW2_대공종 LIKE '%철골%' 
         OR HOW2_대공종 LIKE '%콘크리트%' OR HOW2_대공종 LIKE '%골조%')
    GROUP BY HOW2_대공종 ORDER BY avg_dur DESC""")
for r in cur.fetchall():
    print(f"  {r[0]:30s}  cnt={r[1]:5d}  avg_dur={r[2]}")

print("\n=== All HOW2_대공종 with avg duration > 100 ===")
cur.execute("""SELECT HOW2_대공종, COUNT(*) as cnt,
    ROUND(AVG("WHEN3_기간(일)"), 1) as avg_dur
    FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''
    GROUP BY HOW2_대공종 ORDER BY avg_dur DESC LIMIT 20""")
for r in cur.fetchall():
    print(f"  {r[0]:30s}  cnt={r[1]:5d}  avg_dur={r[2]}")

print("\n=== 작업부산물 check ===")
cur.execute("SELECT DISTINCT HOW2_대공종 FROM evms WHERE HOW2_대공종 LIKE '%부산물%'")
for r in cur.fetchall():
    print(f"  '{r[0]}'")

conn.close()

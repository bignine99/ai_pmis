import sqlite3
conn = sqlite3.connect('output/project_db.sqlite')
c = conn.cursor()

print('=== HOW3_작업명 (상위 20) ===')
for r in c.execute('SELECT HOW3_작업명, COUNT(*) as cnt FROM evms WHERE HOW3_작업명 IS NOT NULL GROUP BY HOW3_작업명 ORDER BY cnt DESC LIMIT 20'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== HOW4_품명 (상위 30) ===')
for r in c.execute('SELECT HOW4_품명, COUNT(*) as cnt FROM evms WHERE HOW4_품명 IS NOT NULL GROUP BY HOW4_품명 ORDER BY cnt DESC LIMIT 30'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== HOW2_대공종 (전체) ===')
for r in c.execute('SELECT HOW2_대공종, COUNT(*) as cnt FROM evms WHERE HOW2_대공종 IS NOT NULL GROUP BY HOW2_대공종 ORDER BY cnt DESC'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== HOW5_규격 (상위 20) ===')
for r in c.execute('SELECT HOW5_규격, COUNT(*) as cnt FROM evms WHERE HOW5_규격 IS NOT NULL GROUP BY HOW5_규격 ORDER BY cnt DESC LIMIT 20'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== WHERE2_동 (전체) ===')
for r in c.execute('SELECT WHERE2_동, COUNT(*) as cnt FROM evms WHERE WHERE2_동 IS NOT NULL GROUP BY WHERE2_동 ORDER BY cnt DESC'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== HOW1_공사 (전체) ===')
for r in c.execute('SELECT HOW1_공사, COUNT(*) as cnt FROM evms WHERE HOW1_공사 IS NOT NULL GROUP BY HOW1_공사 ORDER BY cnt DESC'):
    print(f'  {r[0]} | {r[1]}건')

print('\n=== 철근 관련 항목 ===')
for r in c.execute("SELECT HOW3_작업명, HOW4_품명, HOW5_규격, R1_단위, SUM(R2_수량) as qty FROM evms WHERE HOW4_품명 LIKE '%철근%' OR HOW3_작업명 LIKE '%철근%' OR HOW4_품명 LIKE '%봉강%' GROUP BY HOW3_작업명, HOW4_품명, HOW5_규격 LIMIT 20"):
    print(f'  작업: {r[0]} | 품명: {r[1]} | 규격: {r[2]} | 단위: {r[3]} | 수량: {r[4]}')

print('\n=== 먹매김 관련 항목 ===')
for r in c.execute("SELECT HOW3_작업명, HOW4_품명, R1_단위, SUM(R2_수량) as qty FROM evms WHERE HOW4_품명 LIKE '%먹매김%' OR HOW3_작업명 LIKE '%먹매김%' GROUP BY HOW3_작업명, HOW4_품명 LIMIT 10"):
    print(f'  작업: {r[0]} | 품명: {r[1]} | 단위: {r[2]} | 수량: {r[3]}')

conn.close()

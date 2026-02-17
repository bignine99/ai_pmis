#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""DB 검증 스크립트"""
import sqlite3

conn = sqlite3.connect('output/project_db_v3.sqlite')
c = conn.cursor()

# 컬럼명 확인
cols = [d[0] for d in c.execute('SELECT * FROM evms LIMIT 1').description]
print('Columns:', cols)
print()

# 기본 통계
row_count = c.execute('SELECT COUNT(*) FROM evms').fetchone()[0]
print(f'Row count: {row_count}')

# BAC
bac = c.execute('SELECT SUM(R10_합계_금액) FROM evms').fetchone()[0]
print(f'BAC (Total Budget): {bac:,.0f}')

# EV (실행률 기반)
ev = c.execute('SELECT COALESCE(SUM(R10_합계_금액 * COALESCE("WHEN4_실행률(%)", 0)), 0) FROM evms').fetchone()[0]
print(f'EV (progress-based): {ev:,.0f}')

# 실행률 통계
with_progress = c.execute('SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" IS NOT NULL').fetchone()[0]
completed = c.execute('SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" >= 1').fetchone()[0]
avg_progress = c.execute('SELECT ROUND(AVG("WHEN4_실행률(%)") * 100, 1) FROM evms WHERE "WHEN4_실행률(%)" IS NOT NULL').fetchone()[0]

print(f'Rows with progress: {with_progress} / {row_count} ({100*with_progress/row_count:.1f}%)')
print(f'Rows completed (>=100%): {completed}')
print(f'Avg progress (of entered): {avg_progress}%')

# PV (today까지)
import datetime
today = datetime.date.today().isoformat()
pv = c.execute(f"SELECT COALESCE(SUM(R10_합계_금액), 0) FROM evms WHERE WHEN2종료일 <= '{today}' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''").fetchone()[0]
print(f'\nPV (to {today}): {pv:,.0f}')

# SPI, CPI
ac = c.execute('SELECT COALESCE(SUM(CASE WHEN "WHEN4_실행률(%)" IS NOT NULL AND "WHEN4_실행률(%)" > 0 THEN R10_합계_금액 * "WHEN4_실행률(%)" * 1.05 ELSE 0 END), 0) FROM evms').fetchone()[0]
print(f'AC (estimated): {ac:,.0f}')

spi = ev / pv if pv > 0 else 0
cpi = ev / ac if ac > 0 else 0
print(f'SPI: {spi:.3f}')
print(f'CPI: {cpi:.3f}')

# 실행률 분포
print('\n=== 실행률 분포 ===')
for label, q in [
    ('0% (미착수)', 'SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" IS NULL OR "WHEN4_실행률(%)" = 0'),
    ('1~49%', 'SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" > 0 AND "WHEN4_실행률(%)" < 0.5'),
    ('50~99%', 'SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" >= 0.5 AND "WHEN4_실행률(%)" < 1'),
    ('100%', 'SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" >= 1'),
]:
    count = c.execute(q).fetchone()[0]
    print(f'  {label}: {count}')

conn.close()

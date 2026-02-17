import sqlite3, json
conn = sqlite3.connect(r'output\project_db_v2.sqlite')
cur = conn.cursor()
results = {}
cur.execute('SELECT HOW2_대공종, COUNT(*), ROUND(AVG("WHEN3_기간(일)"), 1) FROM evms WHERE "WHEN1_시작일" IS NOT NULL AND "WHEN1_시작일" != "" AND HOW2_대공종 LIKE "A%" GROUP BY HOW2_대공종 ORDER BY ROUND(AVG("WHEN3_기간(일)"), 1) DESC')
results['A_prefix'] = cur.fetchall()
cur.execute('SELECT DISTINCT HOW2_대공종 FROM evms WHERE HOW2_대공종 LIKE "%부산물%"')
results['busanmul'] = cur.fetchall()
cur.execute('SELECT HOW2_대공종, COUNT(*), ROUND(AVG("WHEN3_기간(일)"), 1) FROM evms WHERE "WHEN1_시작일" IS NOT NULL AND "WHEN1_시작일" != "" AND (HOW2_대공종 LIKE "%철근%" OR HOW2_대공종 LIKE "%철골%" OR HOW2_대공종 LIKE "%골조%") GROUP BY HOW2_대공종 ORDER BY ROUND(AVG("WHEN3_기간(일)"), 1) DESC')
results['steel'] = cur.fetchall()
cur.execute('SELECT DISTINCT HOW1_공사 FROM evms WHERE HOW1_공사 IS NOT NULL AND HOW1_공사 != "" ORDER BY HOW1_공사')
results['how1_values'] = cur.fetchall()
conn.close()
with open('db_check_result.json', 'w', encoding='utf-8') as f:
    json.dump(results, f, ensure_ascii=False, indent=2)
print('DONE')

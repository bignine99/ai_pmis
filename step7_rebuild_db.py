import csv, sqlite3, os

BASE = os.path.dirname(os.path.abspath(__file__))
SRC  = os.path.join(BASE, '.raw_db', 'step7_evms_02.csv')
NEW_DB = os.path.join(BASE, 'output', 'project_db_v2.sqlite')
BACKUP = os.path.join(BASE, '.created_db', 'project_db_v20260217_144600.sqlite')

NUMS = {'R2_수량','R3_재료비_단가','R4_노무비_단가','R5_경비_단가',
        'R6_합계_단가','R7_재료비_금액','R8_노무비_금액','R9_경비_금액',
        'R10_합계_금액','WHEN3_기간(일)'}

IDXS = ['WHERE2_동','HOW1_공사','HOW2_대공종','HOW4_품명','WHO1_하도급업체','WHEN1_시작일']

def build(csv_path, db_path):
    if os.path.exists(db_path):
        os.remove(db_path)
    with open(csv_path, 'r', encoding='utf-8-sig') as f:
        rdr = csv.DictReader(f)
        cols = rdr.fieldnames
        rows = list(rdr)
    print(f'  CSV: {len(rows)} rows x {len(cols)} cols')
    defs = ', '.join([f'"{c}" '+('REAL' if c in NUMS else 'TEXT') for c in cols])
    ph = ','.join(['?' for _ in cols])
    conn = sqlite3.connect(db_path)
    cur = conn.cursor()
    cur.execute(f'CREATE TABLE evms ({defs})')
    for row in rows:
        vals = []
        for c in cols:
            v = (row.get(c) or '').strip()
            if c in NUMS:
                try: vals.append(float(v) if v else 0.0)
                except: vals.append(0.0)
            else:
                vals.append(v)
        cur.execute(f'INSERT INTO evms VALUES ({ph})', vals)
    for c in IDXS:
        if c in cols:
            cur.execute(f'CREATE INDEX "idx_{c}" ON evms ("{c}")')
    conn.commit()
    cur.execute('SELECT COUNT(*) FROM evms')
    cnt = cur.fetchone()[0]
    cur.execute('SELECT SUM(R10_합계_금액) FROM evms')
    tot = cur.fetchone()[0] or 0
    conn.close()
    sz = os.path.getsize(db_path)
    print(f'  DB: {db_path}')
    print(f'      {cnt} rows | Total: {tot:,.0f} | Size: {sz:,} bytes')
    return cnt, tot

if __name__ == '__main__':
    print('='*50)
    os.makedirs(os.path.dirname(NEW_DB), exist_ok=True)
    os.makedirs(os.path.dirname(BACKUP), exist_ok=True)
    print('[1] New DB...')
    c, t = build(SRC, NEW_DB)
    print('[2] Backup...')
    build(SRC, BACKUP)
    print(f'DONE! Rows={c} Total={t:,.0f}')
    print('='*50)

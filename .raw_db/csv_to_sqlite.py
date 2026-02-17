#!/usr/bin/env python3
"""
CSV → SQLite 변환 스크립트
step7_evms_03.csv → project_db_v3.sqlite
"""
import csv
import sqlite3
import os
import sys

CSV_FILE = 'step7_evms_03.csv'
DB_FILE = os.path.join('..', 'output', 'project_db_v3.sqlite')

# 정수 필드
INT_FIELDS = {
    'R3_재료비_단가', 'R4_노무비_단가', 'R5_경비_단가', 'R6_합계_단가',
    'R7_재료비_금액', 'R8_노무비_금액', 'R9_경비_금액', 'R10_합계_금액'
}

# 실수 필드
FLOAT_FIELDS = {
    'R2_수량', 'WHEN4_실행률(%)', 'WHEN3_기간(일)'
}

def clean_value(val, col_name):
    """컬럼 타입에 맞게 값 변환"""
    if val is None or val.strip() == '':
        return None
    val = val.strip()
    if col_name in INT_FIELDS:
        try:
            return int(float(val))
        except ValueError:
            return 0
    if col_name in FLOAT_FIELDS:
        try:
            return float(val)
        except ValueError:
            return None
    return val

def main():
    if not os.path.exists(CSV_FILE):
        print(f'Error: {CSV_FILE} not found')
        sys.exit(1)

    # 기존 DB 삭제
    if os.path.exists(DB_FILE):
        os.remove(DB_FILE)
        print(f'Removed existing {DB_FILE}')

    # DB 연결
    conn = sqlite3.connect(DB_FILE)
    cursor = conn.cursor()

    # CSV 읽기 (UTF-8 BOM 처리)
    with open(CSV_FILE, 'r', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        headers = reader.fieldnames
        print(f'CSV columns ({len(headers)}): {headers}')

        # 테이블 생성 - 컬럼명에 특수문자가 있으므로 따옴표 사용
        col_defs = []
        for h in headers:
            if h in INT_FIELDS:
                col_defs.append(f'"{h}" INTEGER DEFAULT 0')
            elif h in FLOAT_FIELDS:
                col_defs.append(f'"{h}" REAL')
            else:
                col_defs.append(f'"{h}" TEXT')

        create_sql = f'CREATE TABLE evms ({", ".join(col_defs)})'
        print(f'Creating table: evms')
        cursor.execute(create_sql)

        # 데이터 삽입
        placeholders = ', '.join(['?' for _ in headers])
        insert_sql = f'INSERT INTO evms ({", ".join([chr(34)+h+chr(34) for h in headers])}) VALUES ({placeholders})'

        row_count = 0
        for row in reader:
            values = [clean_value(row.get(h, ''), h) for h in headers]
            cursor.execute(insert_sql, values)
            row_count += 1

        conn.commit()
        print(f'Inserted {row_count} rows')

    # 인덱스 생성
    indexes = [
        'CREATE INDEX IF NOT EXISTS idx_where2 ON evms("WHERE2_동")',
        'CREATE INDEX IF NOT EXISTS idx_how1 ON evms("HOW1_공사")',
        'CREATE INDEX IF NOT EXISTS idx_how2 ON evms("HOW2_대공종")',
        'CREATE INDEX IF NOT EXISTS idx_when1 ON evms("WHEN1_시작일")',
        'CREATE INDEX IF NOT EXISTS idx_when2 ON evms("WHEN2종료일")',
        'CREATE INDEX IF NOT EXISTS idx_who1 ON evms("WHO1_하도급업체")',
        'CREATE INDEX IF NOT EXISTS idx_r10 ON evms("R10_합계_금액")',
        'CREATE INDEX IF NOT EXISTS idx_progress ON evms("WHEN4_실행률(%)")',
    ]
    for idx in indexes:
        cursor.execute(idx)
    conn.commit()
    print(f'Indexes created')

    # 검증
    count = cursor.execute('SELECT COUNT(*) FROM evms').fetchone()[0]
    total = cursor.execute('SELECT SUM("R10_합계_금액") FROM evms').fetchone()[0]
    progress_count = cursor.execute('SELECT COUNT(*) FROM evms WHERE "WHEN4_실행률(%)" IS NOT NULL').fetchone()[0]
    avg_progress = cursor.execute('SELECT AVG("WHEN4_실행률(%)") FROM evms WHERE "WHEN4_실행률(%)" IS NOT NULL').fetchone()[0]

    print(f'\n=== Verification ===')
    print(f'Total rows: {count}')
    print(f'Total budget: {total:,.0f}')
    print(f'Rows with progress: {progress_count} / {count} ({100*progress_count/count:.1f}%)')
    print(f'Average progress (of entered): {avg_progress:.2%}' if avg_progress else 'No progress data')

    # EV 계산 미리보기
    ev_from_progress = cursor.execute(
        'SELECT SUM("R10_합계_금액" * COALESCE("WHEN4_실행률(%)", 0)) FROM evms'
    ).fetchone()[0]
    print(f'EV (from progress): {ev_from_progress:,.0f}')
    print(f'EV / BAC = {ev_from_progress/total:.2%}' if total else '')

    db_size = os.path.getsize(DB_FILE)
    print(f'\nDB file: {DB_FILE}')
    print(f'DB size: {db_size:,} bytes ({db_size/1024/1024:.1f} MB)')

    conn.close()
    print('Done!')

if __name__ == '__main__':
    main()

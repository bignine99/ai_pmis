/**
 * ============================================================
 * DB Modules (데이터베이스 모듈)
 * ============================================================
 * 
 * 역할: sql.js (WASM) 라이브러리를 사용하여 SQLite 데이터베이스를
 *       브라우저에서 직접 로드하고 SQL 쿼리를 실행합니다.
 * 
 * 주요 개념:
 * - SQL (Structured Query Language): 데이터베이스에서 정보를 조회/분석하는 언어
 * - SELECT: 데이터 조회        | FROM: 테이블 지정
 * - WHERE: 조건 필터           | GROUP BY: 데이터 그룹화
 * - SUM, COUNT, AVG: 집계 함수 | ORDER BY: 정렬
 * - LIMIT: 결과 개수 제한
 * 
 * 모든 데이터는 'evms' 테이블 하나에 저장되어 있습니다.
 * 컬럼 이름 규칙:
 *   WHERE = 위치 (동/층)     | HOW = 공사/공종/품명/규격
 *   WHEN = 일정 (시작/종료)  | WHO = 하도급업체
 *   R = 수치 (단가/금액)
 */

// ─── 글로벌 변수 ─────────────────────────────────────────
let db = null;          // SQLite 데이터베이스 인스턴스
let dbReady = false;    // DB 준비 상태

// ─── 초기화 ──────────────────────────────────────────────

/**
 * sql.js를 초기화하고 SQLite DB 파일을 로드합니다.
 * @param {string} dbUrl - DB 파일 경로 (기본값: 'output/project_db.sqlite')
 * @returns {Promise<boolean>} - 성공 여부
 */
async function initDatabase(dbUrl) {
    dbUrl = dbUrl || 'output/project_db_v3.sqlite';
    try {
        // Step A: sql.js WASM 엔진 로드
        console.log('[DB] Step A: Loading sql.js WASM engine...');

        if (typeof initSqlJs === 'undefined') {
            throw new Error('initSqlJs is not defined. sql-wasm.js CDN script may not have loaded. Check internet connection.');
        }

        const SQL = await initSqlJs({
            locateFile: function (file) {
                return 'https://cdnjs.cloudflare.com/ajax/libs/sql.js/1.10.2/' + file;
            }
        });
        console.log('[DB] Step A: sql.js WASM loaded OK');

        // Step B: DB 파일 다운로드
        console.log('[DB] Step B: Fetching database file:', dbUrl);
        const response = await fetch(dbUrl);

        if (!response.ok) {
            throw new Error('DB file fetch failed: HTTP ' + response.status + ' - ' + dbUrl);
        }

        const buffer = await response.arrayBuffer();
        console.log('[DB] Step B: DB file downloaded, size:', buffer.byteLength, 'bytes');

        // Step C: DB 인스턴스 생성
        db = new SQL.Database(new Uint8Array(buffer));
        dbReady = true;

        // 검증: 테이블 존재 확인
        const tables = db.exec("SELECT name FROM sqlite_master WHERE type='table'");
        console.log('[DB] Step C: Database opened. Tables:', tables.length > 0 ? tables[0].values.flat() : 'none');

        const rowCount = db.exec("SELECT COUNT(*) FROM evms");
        console.log('[DB] Step C: evms table row count:', rowCount[0]?.values[0][0]);

        return true;
    } catch (error) {
        console.error('[DB] Database initialization failed:', error.message);
        console.error('[DB] Full error:', error);
        dbReady = false;
        return false;
    }
}

/**
 * SQL 쿼리를 실행하고 결과를 배열로 반환합니다.
 */
function runQuery(sql) {
    if (!db || !dbReady) {
        console.warn('[DB] Database not ready');
        return { columns: [], values: [] };
    }
    try {
        const results = db.exec(sql);
        if (results.length === 0) return { columns: [], values: [] };
        return results[0];
    } catch (error) {
        console.error('[DB] Query error:', error.message, '\nSQL:', sql);
        return { columns: [], values: [] };
    }
}

/**
 * 단일 값을 반환하는 쿼리 (예: COUNT, SUM)
 */
function runScalar(sql) {
    const result = runQuery(sql);
    if (result.values.length > 0 && result.values[0].length > 0) {
        return result.values[0][0];
    }
    return 0;
}

// ─── 프로젝트 개요 (Overview) 쿼리 ──────────────────────

function getProjectSummary() {
    return {
        totalBudget: runScalar("SELECT SUM(R10_합계_금액) FROM evms"),
        totalItems: runScalar("SELECT COUNT(*) FROM evms"),
        totalBuildings: runScalar("SELECT COUNT(DISTINCT WHERE2_동) FROM evms"),
        totalTrades: runScalar("SELECT COUNT(DISTINCT HOW2_대공종) FROM evms"),
        totalSubcontractors: runScalar("SELECT COUNT(DISTINCT WHO1_하도급업체) FROM evms"),
        materialCost: runScalar("SELECT SUM(R7_재료비_금액) FROM evms"),
        laborCost: runScalar("SELECT SUM(R8_노무비_금액) FROM evms"),
        expenseCost: runScalar("SELECT SUM(R9_경비_금액) FROM evms")
    };
}

// ─── 원가관리 (Cost Management) 쿼리 ─────────────────────

function getCostSummary(level) {
    return runQuery(
        'SELECT "' + level + '", ' +
        'SUM(R7_재료비_금액) as material, ' +
        'SUM(R8_노무비_금액) as labor, ' +
        'SUM(R9_경비_금액) as expense, ' +
        'SUM(R10_합계_금액) as total ' +
        'FROM evms WHERE "' + level + '" IS NOT NULL AND "' + level + '" != "" ' +
        'GROUP BY "' + level + '" ORDER BY SUM(R10_합계_금액) DESC'
    );
}

function getCostByBuilding() { return getCostSummary('WHERE2_동'); }
function getCostByTrade() { return getCostSummary('HOW2_대공종'); }
function getCostByConstruction() { return getCostSummary('HOW1_공사'); }

function getCostByTradeFiltered(constructionPrefix) {
    return runQuery(
        'SELECT HOW2_대공종, ' +
        'SUM(R7_재료비_금액) as material, ' +
        'SUM(R8_노무비_금액) as labor, ' +
        'SUM(R9_경비_금액) as expense, ' +
        'SUM(R10_합계_금액) as total ' +
        'FROM evms WHERE HOW2_대공종 LIKE \'' + constructionPrefix + '%\' ' +
        'AND HOW2_대공종 IS NOT NULL AND HOW2_대공종 != \'\'  ' +
        'GROUP BY HOW2_대공종 ORDER BY SUM(R10_합계_금액) DESC'
    );
}

function getTopNItems(n) {
    n = n || 10;
    return runQuery(
        'SELECT WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, R10_합계_금액 ' +
        'FROM evms ORDER BY R10_합계_금액 DESC LIMIT ' + n
    );
}

function getCostComposition() {
    return runQuery(
        "SELECT '재료비' as category, SUM(R7_재료비_금액) as amount FROM evms " +
        "UNION ALL SELECT '노무비', SUM(R8_노무비_금액) FROM evms " +
        "UNION ALL SELECT '경비', SUM(R9_경비_금액) FROM evms"
    );
}

// ─── 공정관리 (Schedule Management) 쿼리 ────────────────

function getScheduleTimeline() {
    return runQuery(
        "SELECT SUBSTR(WHEN1_시작일, 1, 7) as month, " +
        "COUNT(*) as task_count, SUM(R10_합계_금액) as monthly_cost " +
        "FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
        "GROUP BY month ORDER BY month"
    );
}

function getMonthlyTasks(yearMonth) {
    return runQuery(
        "SELECT WHERE2_동, HOW2_대공종, HOW3_작업명, " +
        "WHEN1_시작일, WHEN2종료일, \"WHEN3_기간(일)\", R10_합계_금액 " +
        "FROM evms WHERE SUBSTR(WHEN1_시작일, 1, 7) = '" + yearMonth + "' " +
        "ORDER BY WHEN1_시작일"
    );
}

function getDurationByTrade() {
    return runQuery(
        "SELECT HOW2_대공종, COUNT(*) as count, " +
        "ROUND(AVG(\"WHEN3_기간(일)\"), 1) as avg_duration, " +
        "MAX(\"WHEN3_기간(일)\") as max_duration, " +
        "MIN(WHEN1_시작일) as earliest_start, " +
        "MAX(WHEN2종료일) as latest_end " +
        "FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
        "GROUP BY HOW2_대공종 ORDER BY earliest_start"
    );
}

// ─── 물량관리 (Quantity Management) 쿼리 ─────────────────

function getQuantityByUnit() {
    return runQuery(
        "SELECT R1_단위, COUNT(*) as item_count, " +
        "SUM(R2_수량) as total_qty, SUM(R10_합계_금액) as total_cost " +
        "FROM evms WHERE R1_단위 IS NOT NULL AND R1_단위 != '' " +
        "GROUP BY R1_단위 ORDER BY total_cost DESC"
    );
}

function getMaterialQuantity(keyword) {
    return runQuery(
        "SELECT WHERE3_층, SUM(R2_수량) as qty, R1_단위, SUM(R10_합계_금액) as cost " +
        "FROM evms WHERE HOW4_품명 LIKE '%" + keyword + "%' " +
        "GROUP BY WHERE3_층 ORDER BY WHERE3_층"
    );
}

function getQuantityByTrade() {
    return runQuery(
        "SELECT HOW2_대공종, COUNT(*) as item_count, " +
        "SUM(R2_수량) as total_qty, SUM(R10_합계_금액) as total_cost " +
        "FROM evms GROUP BY HOW2_대공종 ORDER BY total_cost DESC"
    );
}

/** 상위 비용 자재 (ABC 분석용) */
function getTopCostMaterials(limit) {
    return runQuery(
        "SELECT HOW4_품명, HOW5_규격, R1_단위, SUM(R2_수량) as qty, " +
        "SUM(COALESCE(R7_재료비_금액,0)) as mat_cost, SUM(COALESCE(R10_합계_금액,0)) as total_cost, " +
        "COUNT(*) as cnt " +
        "FROM evms WHERE HOW4_품명 IS NOT NULL AND HOW4_품명 != '' " +
        "GROUP BY HOW4_품명 ORDER BY total_cost DESC " +
        (limit ? "LIMIT " + limit : "")
    );
}

/** 업체별 자재 현황 */
function getSupplierMaterials() {
    var valid = "WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
        "AND HOW4_품명 IS NOT NULL AND HOW4_품명 != ''";
    return runQuery(
        "SELECT WHO1_하도급업체, HOW4_품명, SUM(R2_수량) as qty, R1_단위, " +
        "SUM(COALESCE(R7_재료비_금액, R10_합계_금액, 0)) as mat_cost, COUNT(*) as cnt " +
        "FROM evms WHERE " + valid + " " +
        "GROUP BY WHO1_하도급업체, HOW4_품명 ORDER BY WHO1_하도급업체, mat_cost DESC"
    );
}

/** 공종별 자재 피벗 */
function getTradeQuantityPivot() {
    return runQuery(
        "SELECT HOW2_대공종, HOW4_품명, HOW5_규격, R1_단위, " +
        "SUM(R2_수량) as qty, SUM(COALESCE(R7_재료비_금액,0)) as mat_cost, " +
        "SUM(COALESCE(R10_합계_금액,0)) as total_cost, COUNT(*) as cnt " +
        "FROM evms WHERE HOW4_품명 IS NOT NULL AND HOW4_품명 != '' " +
        "GROUP BY HOW2_대공종, HOW4_품명 ORDER BY HOW2_대공종, total_cost DESC"
    );
}

// ─── 조직관리 (Organization Management) 쿼리 ────────────

function getCostBySubcontractor() { return getCostSummary('WHO1_하도급업체'); }

function getSubcontractorTrades() {
    return runQuery(
        "SELECT WHO1_하도급업체, HOW2_대공종, COUNT(*) as item_count, " +
        "SUM(R10_합계_금액) as total_cost " +
        "FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
        "GROUP BY WHO1_하도급업체, HOW2_대공종 ORDER BY WHO1_하도급업체, total_cost DESC"
    );
}

function getSubcontractorSummary() {
    return runQuery(
        "SELECT WHO1_하도급업체, COUNT(*) as item_count, " +
        "COUNT(DISTINCT HOW2_대공종) as trade_count, " +
        "SUM(R10_합계_금액) as total_cost, " +
        "SUM(R7_재료비_금액) as material_cost, " +
        "SUM(R8_노무비_금액) as labor_cost " +
        "FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
        "GROUP BY WHO1_하도급업체 ORDER BY total_cost DESC"
    );
}

// ─── EVMS 기성/진도 (Payment/Progress) 쿼리 ─────────────

function calculateEvmsMetrics(cutoffDate) {
    // BAC: 총 예산 (전체 합계금액)
    var bac = runScalar("SELECT SUM(R10_합계_금액) FROM evms");

    // PV (계획가치): cutoffDate 이전 종료 예정인 작업의 합계금액
    var pv = runScalar(
        "SELECT COALESCE(SUM(R10_합계_금액), 0) FROM evms " +
        "WHERE WHEN2종료일 <= '" + cutoffDate + "' " +
        "AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''"
    );

    // EV (실현가치): 실행률(%) 기반 실적 계산
    // EV = Σ(합계금액 × 실행률)
    // 실행률이 NULL인 행은 미착수(0%)로 처리
    var ev = runScalar(
        "SELECT COALESCE(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)), 0) FROM evms"
    );

    // AC (실제비용): 실행률이 입력된 항목의 실제 투입 추정
    // 실행률이 있는 행은 실투입 = 합계금액 × 실행률 × 1.05 (5% 오버런 가정)
    // 실행률이 없는 행은 0
    var ac = runScalar(
        "SELECT COALESCE(SUM(CASE WHEN \"WHEN4_실행률(%)\" IS NOT NULL AND \"WHEN4_실행률(%)\" > 0 " +
        "THEN R10_합계_금액 * \"WHEN4_실행률(%)\" * 1.05 ELSE 0 END), 0) FROM evms"
    );

    var sv = ev - pv;
    var cv = ev - ac;
    var spi = pv > 0 ? ev / pv : 0;
    var cpi = ac > 0 ? ev / ac : 0;
    var eac = cpi > 0 ? bac / cpi : bac;

    // 추가 메트릭: 실행률 통계
    var progressStats = runQuery(
        "SELECT COUNT(*) as total, " +
        "SUM(CASE WHEN \"WHEN4_실행률(%)\" IS NOT NULL THEN 1 ELSE 0 END) as with_progress, " +
        "SUM(CASE WHEN \"WHEN4_실행률(%)\" >= 1 THEN 1 ELSE 0 END) as completed, " +
        "ROUND(AVG(CASE WHEN \"WHEN4_실행률(%)\" IS NOT NULL THEN \"WHEN4_실행률(%)\" END) * 100, 1) as avg_progress " +
        "FROM evms"
    );
    var stats = progressStats && progressStats.length > 0 ? progressStats[0] : null;

    return {
        bac: bac, pv: pv, ev: ev, ac: ac,
        sv: sv, cv: cv, spi: spi, cpi: cpi, eac: eac,
        progressStats: stats ? {
            total: stats[0],
            withProgress: stats[1],
            completed: stats[2],
            avgProgress: stats[3]
        } : null
    };
}

function getMonthlyCumulativePV() {
    return runQuery(
        "SELECT SUBSTR(WHEN2종료일, 1, 7) as month, SUM(R10_합계_금액) as monthly_pv " +
        "FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' " +
        "GROUP BY month ORDER BY month"
    );
}

/**
 * 월별 EV (실행률 기반) 데이터 반환
 * 실행률이 입력된 행만 해당 월의 EV에 포함
 * @returns {{ columns: string[], values: any[][] }}
 */
function getMonthlyEV() {
    return runQuery(
        "SELECT SUBSTR(WHEN2종료일, 1, 7) as month, " +
        "SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) as monthly_ev " +
        "FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' " +
        "GROUP BY month ORDER BY month"
    );
}

// ─── 생산성관리 (Productivity Management) 쿼리 ──────────

function getUnitCostAnalysis() {
    return runQuery(
        "SELECT HOW4_품명, HOW5_규격, R1_단위, R6_합계_단가 as unit_cost, " +
        "R2_수량 as qty, R10_합계_금액 as total " +
        "FROM evms WHERE R6_합계_단가 > 0 AND R2_수량 > 0 " +
        "ORDER BY R6_합계_단가 DESC LIMIT 30"
    );
}

function getProductivityByTrade() {
    return runQuery(
        "SELECT HOW2_대공종, COUNT(*) as count, " +
        "ROUND(AVG(R6_합계_단가), 0) as avg_unit_cost, " +
        "ROUND(AVG(R10_합계_금액), 0) as avg_total, " +
        "SUM(R10_합계_금액) as total_cost " +
        "FROM evms WHERE R6_합계_단가 > 0 " +
        "GROUP BY HOW2_대공종 ORDER BY total_cost DESC"
    );
}

function getCostPerBuilding() {
    return runQuery(
        "SELECT WHERE2_동, COUNT(*) as items, " +
        "SUM(R10_합계_금액) as total_cost, " +
        "SUM(R7_재료비_금액) as material, " +
        "SUM(R8_노무비_금액) as labor, " +
        "SUM(R9_경비_금액) as expense " +
        "FROM evms WHERE WHERE2_동 IS NOT NULL AND WHERE2_동 != '' " +
        "GROUP BY WHERE2_동 ORDER BY total_cost DESC"
    );
}

// ─── 범용 필터 쿼리 ──────────────────────────────────────

function getDistinctValues(column) {
    return runQuery(
        'SELECT DISTINCT "' + column + '" FROM evms ' +
        'WHERE "' + column + '" IS NOT NULL AND "' + column + '" != \'\' ' +
        'ORDER BY "' + column + '"'
    );
}

function getFilteredData(filters) {
    filters = filters || {};
    var where = [];
    for (var col in filters) {
        if (filters[col] && filters[col] !== '전체') {
            where.push('"' + col + '" = \'' + filters[col] + '\'');
        }
    }
    var whereClause = where.length > 0 ? 'WHERE ' + where.join(' AND ') : '';
    return runQuery(
        'SELECT WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, ' +
        'R1_단위, R2_수량, R6_합계_단가, R10_합계_금액 ' +
        'FROM evms ' + whereClause + ' ORDER BY R10_합계_금액 DESC LIMIT 100'
    );
}

// ─── 모듈 내보내기 (전역 객체) ──────────────────────────

window.DB = {
    initDatabase: initDatabase,
    runQuery: runQuery,
    runScalar: runScalar,
    isReady: function () { return dbReady; },
    getProjectSummary: getProjectSummary,
    getCostSummary: getCostSummary,
    getCostByBuilding: getCostByBuilding,
    getCostByTrade: getCostByTrade,
    getCostByConstruction: getCostByConstruction,
    getCostByTradeFiltered: getCostByTradeFiltered,
    getTopNItems: getTopNItems,
    getCostComposition: getCostComposition,
    getScheduleTimeline: getScheduleTimeline,
    getMonthlyTasks: getMonthlyTasks,
    getDurationByTrade: getDurationByTrade,
    getQuantityByUnit: getQuantityByUnit,
    getMaterialQuantity: getMaterialQuantity,
    getQuantityByTrade: getQuantityByTrade,
    getCostBySubcontractor: getCostBySubcontractor,
    getSubcontractorTrades: getSubcontractorTrades,
    getSubcontractorSummary: getSubcontractorSummary,
    calculateEvmsMetrics: calculateEvmsMetrics,
    getMonthlyCumulativePV: getMonthlyCumulativePV,
    getMonthlyEV: getMonthlyEV,
    getUnitCostAnalysis: getUnitCostAnalysis,
    getProductivityByTrade: getProductivityByTrade,
    getCostPerBuilding: getCostPerBuilding,
    getDistinctValues: getDistinctValues,
    getFilteredData: getFilteredData,
    getGanttActivities: getGanttActivities,
    getProjectMilestones: getProjectMilestones,
    getHierarchicalGantt: getHierarchicalGantt,
    getOutlineScheduleData: getOutlineScheduleData,
    getSubcontractorSchedule: getSubcontractorSchedule,
    getTradeCompanyMatrix: getTradeCompanyMatrix,
    getZoneCompanyMatrix: getZoneCompanyMatrix,
    getTopCostMaterials: getTopCostMaterials,
    getSupplierMaterials: getSupplierMaterials,
    getTradeQuantityPivot: getTradeQuantityPivot,
    getTopMaterialsByConstruction: getTopMaterialsByConstruction
};

/**
 * 공사 분류별 품목+규격 기준 재료비 상위 N개 추출
 * @param {string} constructionFilter - HOW1_공사 LIKE 조건 (예: '%건축%')
 * @param {number} limit - 상위 N개
 * @returns {object} {columns, values}
 */
function getTopMaterialsByConstruction(constructionFilter, limit) {
    limit = limit || 20;
    return runQuery(
        "SELECT HOW4_품명, HOW5_규격, R1_단위, " +
        "SUM(R2_수량) as qty, " +
        "SUM(COALESCE(R7_재료비_금액,0)) as mat_cost, " +
        "SUM(COALESCE(R10_합계_금액,0)) as total_cost, " +
        "COUNT(*) as cnt " +
        "FROM evms WHERE HOW4_품명 IS NOT NULL AND HOW4_품명 != '' " +
        "AND HOW1_공사 LIKE '" + constructionFilter + "' " +
        "GROUP BY HOW4_품명, HOW5_규격 " +
        "ORDER BY mat_cost DESC LIMIT " + limit
    );
}

function getGanttActivities(groupBy, limit, dateWhere) {
    var sql = 'SELECT ' + groupBy + ', MIN(WHEN1_시작일) as sd, MAX(WHEN2종료일) as ed, COUNT(*) as cnt ' +
        'FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != \'\' ' +
        'AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != \'\' ';
    if (dateWhere) sql += 'AND ' + dateWhere + ' ';
    sql += 'GROUP BY ' + groupBy + ' ORDER BY MIN(WHEN1_시작일)';
    if (limit) sql += ' LIMIT ' + limit;
    return runQuery(sql);
}

function getProjectMilestones() {
    var milestones = [];
    var valid = "WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";

    // 1. 착공 (Notice to Proceed)
    var startDate = runScalar("SELECT MIN(WHEN1_시작일) FROM evms WHERE " + valid);
    if (startDate) milestones.push({ name: '착공 (Notice to Proceed)', date: startDate, type: 'start' });

    // 2. 토공사 완료 (Earthwork Finish)
    var earthEnd = runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE " + valid +
        " AND (HOW2_대공종 LIKE '%토공%' OR HOW2_대공종 LIKE '%흙막이%' OR HOW2_대공종 LIKE '%기초%')");
    if (earthEnd) milestones.push({ name: '토공사 완료 (Earthwork Finish)', date: earthEnd, type: 'mid' });

    // 3. 골조 상량 (Top Out)
    var topOut = runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE " + valid +
        " AND (HOW2_대공종 LIKE '%철근콘크리트%' OR HOW2_대공종 LIKE '%골조%' OR HOW2_대공종 LIKE '%콘크리트%' OR HOW2_대공종 LIKE '%철골%')");
    if (topOut) milestones.push({ name: '골조 상량 (Top Out)', date: topOut, type: 'mid' });

    // 4. 수전 및 시운전 (Commissioning)
    var commission = runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE " + valid +
        " AND (HOW1_공사 LIKE '%기계%' OR HOW1_공사 LIKE '%전기%' OR HOW2_대공종 LIKE '%설비%' OR HOW2_대공종 LIKE '%배관%' OR HOW2_대공종 LIKE '%덕트%')");
    if (commission) milestones.push({ name: '수전 및 시운전 (Commissioning)', date: commission, type: 'mid' });

    // 5. 사용승인 및 준공 (Handover)
    var endDate = runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE " + valid);
    if (endDate) milestones.push({ name: '사용승인 및 준공 (Handover)', date: endDate, type: 'end' });

    // 중복 날짜 제거 (같은 날짜면 뒤쪽 마일스톤 유지)
    var unique = [];
    var seen = {};
    milestones.forEach(function (m) {
        if (!seen[m.date]) {
            seen[m.date] = true;
            unique.push(m);
        }
    });

    return unique;
}

/**
 * 계층적 Gantt 데이터 조회 (개략/전체 공정표용)
 * HOW1_공사 > HOW3_작업명 계층으로 데이터를 반환합니다.
 * 각 작업에 진행률(progress)을 포함합니다.
 * @param {number} limit - 최대 작업 수
 * @param {string} dateWhere - 날짜 필터 조건 (선택)
 * @returns {Array} [{group, name, startDate, endDate, count, totalCost, progress}]
 */
function getHierarchicalGantt(limit, dateWhere) {
    var today = new Date().toISOString().slice(0, 10);
    var valid = "WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";

    var sql = 'SELECT HOW1_공사, HOW3_작업명, ' +
        'MIN(WHEN1_시작일) as sd, MAX(WHEN2종료일) as ed, ' +
        'COUNT(*) as cnt, SUM(R10_합계_금액) as cost ' +
        'FROM evms WHERE ' + valid + ' ';
    if (dateWhere) sql += 'AND ' + dateWhere + ' ';
    sql += 'GROUP BY HOW1_공사, HOW3_작업명 ORDER BY HOW1_공사, MIN(WHEN1_시작일)';
    if (limit) sql += ' LIMIT ' + limit;

    var result = runQuery(sql);
    if (!result || !result.values) return [];

    var items = [];
    result.values.forEach(function (r) {
        var sd = r[2];
        var ed = r[3];
        if (!sd || !ed) return;

        // 진행률 계산: 오늘 기준 경과 비율
        var startTs = new Date(sd).getTime();
        var endTs = new Date(ed).getTime();
        var todayTs = new Date(today).getTime();
        var progress = 0;
        if (todayTs >= endTs) {
            progress = 100;
        } else if (todayTs > startTs) {
            progress = Math.round((todayTs - startTs) / (endTs - startTs) * 100);
        }

        items.push({
            group: r[0] || '기타',
            name: r[1] || '',
            startDate: sd,
            endDate: ed,
            count: r[4] || 1,
            totalCost: r[5] || 0,
            progress: progress
        });
    });

    return items;
}

/**
 * 개략 공정표 데이터 조회
 * HOW1_공사, HOW2_대공종, WHERE2_동 기준 GROUP BY
 * Phase Roll-up 및 Zone 분류를 위한 원시 데이터를 반환합니다.
 */
function getOutlineScheduleData() {
    var valid = "WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";
    var sql = "SELECT HOW1_공사, HOW2_대공종, WHERE2_동, " +
        "MIN(WHEN1_시작일) as sd, MAX(WHEN2종료일) as ed, " +
        "COUNT(*) as cnt, SUM(R10_합계_금액) as cost " +
        "FROM evms WHERE " + valid + " " +
        "GROUP BY HOW1_공사, HOW2_대공종, WHERE2_동 " +
        "ORDER BY HOW1_공사, MIN(WHEN1_시작일)";
    var result = runQuery(sql);
    if (!result || !result.values) return [];

    return result.values.map(function (r) {
        return {
            how1: r[0] || '',
            how2: r[1] || '',
            zone: r[2] || '',
            startDate: r[3],
            endDate: r[4],
            count: r[5] || 0,
            cost: r[6] || 0
        };
    });
}

/**
 * 하도급업체별 일정 데이터 (Gantt용)
 * 업체별 시작일, 종료일, 주요공종, 건수, 금액 반환
 */
function getSubcontractorSchedule() {
    var valid = "WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
        "AND WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
        "AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";
    var sql = "SELECT WHO1_하도급업체, " +
        "MIN(WHEN1_시작일) as sd, MAX(WHEN2종료일) as ed, " +
        "COUNT(*) as cnt, SUM(R10_합계_금액) as cost, " +
        "GROUP_CONCAT(DISTINCT HOW1_공사) as trades " +
        "FROM evms WHERE " + valid + " " +
        "GROUP BY WHO1_하도급업체 ORDER BY MIN(WHEN1_시작일)";
    return runQuery(sql);
}

/** 공종(HOW1) × 업체(WHO1) 교차 집계 */
function getTradeCompanyMatrix() {
    var valid = "WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != ''";
    return runQuery(
        "SELECT HOW1_공사, WHO1_하도급업체, COUNT(*) as cnt, SUM(R10_합계_금액) as cost " +
        "FROM evms WHERE " + valid + " " +
        "GROUP BY HOW1_공사, WHO1_하도급업체 ORDER BY HOW1_공사, cost DESC"
    );
}

/** 동(WHERE2) × 업체(WHO1) 교차 집계 */
function getZoneCompanyMatrix() {
    var valid = "WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != ''";
    return runQuery(
        "SELECT WHERE2_동, WHO1_하도급업체, COUNT(*) as cnt, SUM(R10_합계_금액) as cost " +
        "FROM evms WHERE " + valid + " " +
        "GROUP BY WHERE2_동, WHO1_하도급업체 ORDER BY WHERE2_동, cost DESC"
    );
}

console.log('[DB] db_modules.js loaded. DB object registered on window.');

/**
 * ============================================================
 * CUBE-AI NL2SQL Engine (ai_engine.js)
 * ============================================================
 * - Gemini 2.5 Flash-Lite API 연동 (NL → SQL 변환)
 * - 28개 프리셋 규칙 기반 폴백 엔진
 * - 차트 자동 추천 로직
 * - 결과 포맷팅 유틸리티
 */

(function () {
    'use strict';

    // ── 설정 ──────────────────────────────────────────────────

    var CONFIG = {
        model: 'gemini-2.5-flash-lite',
        baseUrl: 'https://generativelanguage.googleapis.com/v1beta/models/',
        apiKey: null,
        temperature: 0.1,
        maxTokens: 8192
    };

    // ── 유틸리티 ──────────────────────────────────────────────

    function today() { return new Date().toISOString().slice(0, 10); }
    function thisMonth() { return today().slice(0, 7); }
    function thisYear() { return today().slice(0, 4); }
    function nextMonth() {
        var d = new Date(); d.setMonth(d.getMonth() + 1);
        return d.toISOString().slice(0, 7);
    }
    function thisQuarterRange() {
        var d = new Date();
        var qStart = Math.floor(d.getMonth() / 3) * 3;
        var s = new Date(d.getFullYear(), qStart, 1).toISOString().slice(0, 7);
        var e = new Date(d.getFullYear(), qStart + 2, 28).toISOString().slice(0, 7);
        return { start: s, end: e };
    }
    function nextQuarterRange() {
        var d = new Date();
        var qStart = Math.floor(d.getMonth() / 3) * 3 + 3;
        var s = new Date(d.getFullYear(), qStart, 1).toISOString().slice(0, 7);
        var e = new Date(d.getFullYear(), qStart + 2, 28).toISOString().slice(0, 7);
        return { start: s, end: e };
    }
    function weekRange() {
        var d = new Date();
        var dow = d.getDay();
        var mon = new Date(d.getTime() - ((dow === 0 ? 6 : dow - 1)) * 86400000);
        var sun = new Date(mon.getTime() + 6 * 86400000);
        return { start: mon.toISOString().slice(0, 10), end: sun.toISOString().slice(0, 10) };
    }

    function formatCurrency(n) {
        if (n == null) return '0원';
        var abs = Math.abs(n);
        if (abs >= 1e8) return (n / 1e8).toFixed(1) + '억원';
        if (abs >= 1e4) return (n / 1e4).toFixed(0) + '만원';
        return Number(n).toLocaleString() + '원';
    }
    function formatNumber(n) {
        if (n == null) return '0';
        return Number(n).toLocaleString();
    }
    function formatPercent(n) {
        if (n == null) return '0%';
        return (n * 100).toFixed(1) + '%';
    }

    // ── 시스템 프롬프트 ──────────────────────────────────────

    function buildSystemPrompt() {
        return '당신은 건설사업관리 PMIS의 SQL 전문가이자 데이터 분석가입니다.\n\n' +
            '[DB 스키마]\n' +
            '테이블: evms (7,891행, 인천소방학교 이전 신축공사)\n' +
            '컬럼:\n' +
            '- code (TEXT): 항목 코드\n' +
            '- WHERE1_프로젝트 (TEXT): 프로젝트명\n' +
            '- WHERE2_동 (TEXT): 건물 동 (예: 본관동, 별관동, 차고동, 훈련탑동)\n' +
            '- WHERE3_층 (TEXT): 층 (예: B1F, 1F, 2F, 3F, RF)\n' +
            '- HOW1_공사 (TEXT): 공사 구분 (01.건축공사, 02.토목공사, 03.기계설비공사, 04.전기공사 등)\n' +
            '- HOW2_대공종 (TEXT): 대공종 (골조공사, 방수공사, 철골공사 등)\n' +
            '- HOW3_작업명 (TEXT): 세부 작업명\n' +
            '- HOW4_품명 (TEXT): 자재/품목명\n' +
            '- HOW5_규격 (TEXT): 규격\n' +
            '- HOW6_세부작업명 (TEXT): 상세 작업\n' +
            '- WHEN1_시작일 (TEXT, YYYY-MM-DD): 작업 시작일\n' +
            '- WHEN2종료일 (TEXT, YYYY-MM-DD): 작업 종료일\n' +
            '- "WHEN3_기간(일)" (REAL): 작업 기간 (일수)\n' +
            '- "WHEN4_실행률(%)" (REAL): 실행률 (0~1, 예: 0.74=74%)\n' +
            '- WHO1_하도급업체 (TEXT): 하도급업체명 (예: 금빛건설㈜, 태양토건㈜)\n' +
            '- R1_단위 (TEXT): 단위 (m2, m3, kg, EA 등)\n' +
            '- R2_수량 (REAL): 수량\n' +
            '- R3_재료비_단가 ~ R6_합계_단가 (INTEGER): 단가\n' +
            '- R7_재료비_금액 (INTEGER): 재료비\n' +
            '- R8_노무비_금액 (INTEGER): 노무비\n' +
            '- R9_경비_금액 (INTEGER): 경비\n' +
            '- R10_합계_금액 (INTEGER): 합계금액\n\n' +
            '[규칙]\n' +
            '1. SELECT문만 생성하세요. INSERT/UPDATE/DELETE는 절대 금지.\n' +
            '2. 괄호가 포함된 컬럼명은 반드시 큰따옴표로 감싸세요: "WHEN3_기간(일)", "WHEN4_실행률(%)"\n' +
            '3. 금액의 단위는 "원"입니다.\n' +
            '4. 날짜 형식은 YYYY-MM-DD (예: 2026-02-17)\n' +
            '5. "이번 달" = SUBSTR(WHEN2종료일,1,7) = \'' + thisMonth() + '\'\n' +
            '6. "올해" = SUBSTR(WHEN2종료일,1,4) = \'' + thisYear() + '\'\n' +
            '7. "오늘" = \'' + today() + '\'\n' +
            '8. "다음 달" = SUBSTR(WHEN1_시작일,1,7) = \'' + nextMonth() + '\' 또는 종료일 기준\n' +
            '9. 공정 진행 중 = WHEN1_시작일 <= 오늘 AND WHEN2종료일 >= 오늘\n' +
            '10. 기성액 = SUM(R10_합계_금액 * COALESCE("WHEN4_실행률(%)", 0))\n' +
            '11. 건설 현장 구어체→표준: 공구리/곤구리=콘크리트, 아시바/비게=비계, 빠루=바, 생콘=레미콘, 타설=콘크리트 타설\n' +
            '12. "전반기/상반기" = 1~6월, "후반기/하반기" = 7~12월\n\n' +
            '[응답 형식]\n' +
            '반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.\n' +
            '```json\n' +
            '{\n' +
            '  "sql": "SELECT ...",\n' +
            '  "title": "분석 제목 (한국어)",\n' +
            '  "summary": "분석 결과에 대한 인사이트 (2~3문장, 한국어)",\n' +
            '  "chartType": "bar|line|pie|doughnut|horizontalBar|none",\n' +
            '  "chartConfig": { "labelColumn": 0, "dataColumns": [1], "dataLabels": ["금액"] },\n' +
            '  "kpis": [{ "label": "KPI명", "valueExpression": "sum", "unit": "원|건|%", "icon": "fa-coins" }]\n' +
            '}\n' +
            '```\n';
    }

    // ── 28개 프리셋 질문 ─────────────────────────────────────

    var PRESET_CATEGORIES = [
        {
            id: 'cost', label: '원가/기성 관리', icon: 'fa-coins', color: '#3B82F6',
            desc: '돈의 흐름과 관련된 질문',
            questions: [
                {
                    text: '이번 달(금월) 청구될 예상 기성 총액은 얼마인가?',
                    tag: '단기 자금',
                    sql: function () { return "SELECT '예상 기성액' AS 구분, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 금액 FROM evms"; },
                    title: '금월 예상 기성 총액',
                    summary: '실행률 기반으로 계산한 현재까지의 누적 기성액입니다. 실행률이 입력된 항목의 합계금액 × 실행률로 산출합니다.',
                    chartType: 'none',
                    kpis: [{ label: '예상 기성액', col: 1, unit: '원', icon: 'fa-coins' }]
                },
                {
                    text: '금빛건설㈜의 이번 분기 기성 예정 금액을 알려줘.',
                    tag: '업체별 기성',
                    sql: function () { var q = thisQuarterRange(); return "SELECT WHO1_하도급업체 AS 업체, SUM(R10_합계_금액) AS 기성예정액 FROM evms WHERE WHO1_하도급업체 LIKE '%금빛건설%' AND SUBSTR(WHEN2종료일,1,7) >= '" + q.start + "' AND SUBSTR(WHEN2종료일,1,7) <= '" + q.end + "' GROUP BY WHO1_하도급업체"; },
                    title: '금빛건설㈜ 분기 기성 예정 금액',
                    summary: '금빛건설㈜의 이번 분기 종료 예정 작업에 대한 합계금액입니다.',
                    chartType: 'none',
                    kpis: [{ label: '기성 예정액', col: 1, unit: '원', icon: 'fa-building' }]
                },
                {
                    text: '본관동 골조공사의 총 예정 원가는 얼마인가?',
                    tag: '공종별 원가',
                    sql: function () { return "SELECT WHERE2_동 AS 동, HOW2_대공종 AS 공종, SUM(R10_합계_금액) AS 총원가, SUM(R7_재료비_금액) AS 재료비, SUM(R8_노무비_금액) AS 노무비, SUM(R9_경비_금액) AS 경비 FROM evms WHERE WHERE2_동 LIKE '%본관%' AND HOW2_대공종 LIKE '%골조%' GROUP BY WHERE2_동, HOW2_대공종"; },
                    title: '본관동 골조공사 예정 원가',
                    summary: '본관동 골조공사의 비목별 원가 내역입니다. 재료비, 노무비, 경비로 구분됩니다.',
                    chartType: 'pie',
                    chartConfig: { labelColumn: -1, dataColumns: [3, 4, 5], dataLabels: ['재료비', '노무비', '경비'] }
                },
                {
                    text: '전체 공사비 중 노무비가 차지하는 비중은 몇 %인가?',
                    tag: '비목별 분석',
                    sql: function () { return "SELECT '재료비' AS 비목, SUM(R7_재료비_금액) AS 금액 FROM evms UNION ALL SELECT '노무비', SUM(R8_노무비_금액) FROM evms UNION ALL SELECT '경비', SUM(R9_경비_금액) FROM evms"; },
                    title: '비목별 공사비 비중 분석',
                    summary: '전체 공사비를 재료비, 노무비, 경비로 분류한 비중입니다. 건설 프로젝트에서 노무비 비중은 통상 30~40%입니다.',
                    chartType: 'doughnut',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['금액'] }
                },
                {
                    text: '현재까지 집행된 금액을 제외한 잔여 공사비는 얼마인가?',
                    tag: '잔여 예산',
                    sql: function () { return "SELECT SUM(R10_합계_금액) AS 총예산, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 집행액, SUM(R10_합계_금액) - SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 잔여액 FROM evms"; },
                    title: '잔여 공사비 현황',
                    summary: '전체 예산(BAC)에서 실행률 기반 집행액을 차감한 잔여 공사비입니다.',
                    chartType: 'none',
                    kpis: [
                        { label: '총 예산', col: 0, unit: '원', icon: 'fa-wallet' },
                        { label: '집행액', col: 1, unit: '원', icon: 'fa-money-bill-transfer' },
                        { label: '잔여액', col: 2, unit: '원', icon: 'fa-piggy-bank' }
                    ]
                },
                {
                    text: '내년 상반기(1월~6월)에 투입될 예산 계획을 월별로 보여줘.',
                    tag: '특정 기간',
                    sql: function () { var ny = String(Number(thisYear()) + 1); return "SELECT SUBSTR(WHEN2종료일,1,7) AS 월, SUM(R10_합계_금액) AS 계획예산 FROM evms WHERE SUBSTR(WHEN2종료일,1,7) >= '" + ny + "-01' AND SUBSTR(WHEN2종료일,1,7) <= '" + ny + "-06' GROUP BY SUBSTR(WHEN2종료일,1,7) ORDER BY 월"; },
                    title: '내년 상반기 월별 예산 계획',
                    summary: '내년 1~6월까지의 월별 예산 투입 계획입니다. 각 월의 종료 예정 작업 비용을 합산했습니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['계획 예산'] }
                }
            ]
        },
        {
            id: 'schedule', label: '공정/일정 관리', icon: 'fa-calendar-days', color: '#8B5CF6',
            desc: '시간 준수와 관련된 질문',
            questions: [
                {
                    text: '이번 주에 진행 예정인 주요 작업 리스트를 보여줘.',
                    tag: '금주 작업',
                    sql: function () { var w = weekRange(); return "SELECT WHERE2_동 AS 동, HOW2_대공종 AS 공종, HOW3_작업명 AS 작업명, WHEN1_시작일, WHEN2종료일, WHO1_하도급업체 AS 업체, R10_합계_금액 AS 금액 FROM evms WHERE WHEN1_시작일 <= '" + w.end + "' AND WHEN2종료일 >= '" + w.start + "' ORDER BY R10_합계_금액 DESC LIMIT 30"; },
                    title: '금주 진행 예정 주요 작업',
                    summary: '이번 주에 진행 중이거나 시작/종료 예정인 작업 리스트입니다.',
                    chartType: 'none'
                },
                {
                    text: '지하층 골조공사가 끝나고 바로 시작돼야 할 후속 공종은 무엇인가?',
                    tag: '선/후행',
                    sql: function () { return "SELECT DISTINCT HOW2_대공종 AS 후속공종, HOW3_작업명 AS 작업명, WHEN1_시작일, WHEN2종료일, WHO1_하도급업체 AS 업체 FROM evms WHERE WHERE3_층 LIKE '%B%' AND WHEN1_시작일 > (SELECT MAX(WHEN2종료일) FROM evms WHERE WHERE3_층 LIKE '%B%' AND HOW2_대공종 LIKE '%골조%') ORDER BY WHEN1_시작일 LIMIT 20"; },
                    title: '지하층 골조공사 후속 공종',
                    summary: '지하층 골조공사 종료 이후 시작되는 후속 공종 리스트입니다.',
                    chartType: 'none'
                },
                {
                    text: '본관동의 골조공사 완료 예정일(Milestone)은 언제인가?',
                    tag: '마일스톤',
                    sql: function () { return "SELECT WHERE2_동 AS 동, HOW2_대공종 AS 공종, MIN(WHEN1_시작일) AS 시작일, MAX(WHEN2종료일) AS 완료예정일, COUNT(*) AS 작업수, SUM(R10_합계_금액) AS 총금액 FROM evms WHERE WHERE2_동 LIKE '%본관%' AND HOW2_대공종 LIKE '%골조%' GROUP BY WHERE2_동, HOW2_대공종"; },
                    title: '본관동 골조공사 마일스톤',
                    summary: '본관동 골조공사의 시작일과 완료 예정일입니다.',
                    chartType: 'none',
                    kpis: [{ label: '완료 예정일', col: 3, unit: '', icon: 'fa-flag-checkered' }]
                },
                {
                    text: '태양토건㈜은 언제 현장에 투입되어 언제 철수하는가?',
                    tag: '업체 일정',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, MIN(WHEN1_시작일) AS 투입일, MAX(WHEN2종료일) AS 철수일, COUNT(*) AS 작업수, SUM(R10_합계_금액) AS 계약금액 FROM evms WHERE WHO1_하도급업체 LIKE '%태양토건%' GROUP BY WHO1_하도급업체"; },
                    title: '태양토건㈜ 현장 투입 기간',
                    summary: '태양토건㈜의 현장 투입일과 철수일, 담당 작업 수 및 계약 금액입니다.',
                    chartType: 'none',
                    kpis: [
                        { label: '투입일', col: 1, unit: '', icon: 'fa-right-to-bracket' },
                        { label: '철수일', col: 2, unit: '', icon: 'fa-right-from-bracket' },
                        { label: '계약금액', col: 4, unit: '원', icon: 'fa-coins' }
                    ]
                },
                {
                    text: '현재 계획 대비 공정이 지연되고 있는 작업이 있는가?',
                    tag: '공기 지연',
                    sql: function () { return "SELECT WHERE2_동 AS 동, HOW2_대공종 AS 공종, HOW3_작업명 AS 작업명, WHEN2종료일 AS 종료예정, \"WHEN4_실행률(%)\" AS 실행률, WHO1_하도급업체 AS 업체, R10_합계_금액 AS 금액 FROM evms WHERE WHEN2종료일 < '" + today() + "' AND (\"WHEN4_실행률(%)\" IS NULL OR \"WHEN4_실행률(%)\" < 1) AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' ORDER BY R10_합계_금액 DESC LIMIT 30"; },
                    title: '공정 지연 작업 리스트',
                    summary: '종료 예정일이 지났으나 실행률이 100% 미만인 작업입니다. 금액 순으로 정렬되어 중요도가 높은 작업이 상위에 표시됩니다.',
                    chartType: 'none'
                },
                {
                    text: '2026년 3월 기준으로 가장 바쁠 것으로 예상되는 공종은?',
                    tag: '특정 시점',
                    sql: function () { return "SELECT HOW2_대공종 AS 공종, COUNT(*) AS 작업수, SUM(R10_합계_금액) AS 총금액 FROM evms WHERE WHEN1_시작일 <= '2026-03-31' AND WHEN2종료일 >= '2026-03-01' GROUP BY HOW2_대공종 ORDER BY 작업수 DESC LIMIT 10"; },
                    title: '2026년 3월 최다 작업 공종',
                    summary: '2026년 3월에 진행 중인 작업이 가장 많은 공종입니다.',
                    chartType: 'horizontalBar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['작업 수'] }
                }
            ]
        },
        {
            id: 'material', label: '자재/물량 관리', icon: 'fa-boxes-stacked', color: '#F59E0B',
            desc: '자원 조달과 관련된 질문',
            questions: [
                {
                    text: '다음 달에 필요한 레미콘과 철근의 총 소요량은?',
                    tag: '주요 자재',
                    sql: function () { var nm = nextMonth(); return "SELECT HOW4_품명 AS 품명, R1_단위 AS 단위, SUM(R2_수량) AS 소요량, SUM(R10_합계_금액) AS 금액 FROM evms WHERE (HOW4_품명 LIKE '%레미콘%' OR HOW4_품명 LIKE '%콘크리트%' OR HOW4_품명 LIKE '%철근%') AND SUBSTR(WHEN1_시작일,1,7) <= '" + nm + "' AND SUBSTR(WHEN2종료일,1,7) >= '" + nm + "' GROUP BY HOW4_품명, R1_단위 ORDER BY 금액 DESC"; },
                    title: '다음 달 레미콘/철근 소요량',
                    summary: '다음 달 시공 예정인 레미콘과 철근의 총 소요량 및 예상 금액입니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [3], dataLabels: ['금액'] }
                },
                {
                    text: '철근(SD500, D22)이 가장 많이 들어가는 시기는 언제인가?',
                    tag: '투입 시기',
                    sql: function () { return "SELECT SUBSTR(WHEN1_시작일,1,7) AS 월, SUM(R2_수량) AS 물량, SUM(R10_합계_금액) AS 금액 FROM evms WHERE HOW4_품명 LIKE '%철근%' GROUP BY SUBSTR(WHEN1_시작일,1,7) ORDER BY 물량 DESC LIMIT 12"; },
                    title: '월별 철근 투입량 현황',
                    summary: '철근 물량이 가장 많이 투입되는 월을 기준으로 정렬했습니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['물량'] }
                },
                {
                    text: '본관동 3층 바닥 타설에 필요한 콘크리트 물량은 얼마인가?',
                    tag: '공간별 물량',
                    sql: function () { return "SELECT WHERE2_동 AS 동, WHERE3_층 AS 층, HOW4_품명 AS 품명, R1_단위 AS 단위, SUM(R2_수량) AS 물량, SUM(R10_합계_금액) AS 금액 FROM evms WHERE WHERE2_동 LIKE '%본관%' AND WHERE3_층 LIKE '%3%' AND (HOW4_품명 LIKE '%콘크리트%' OR HOW4_품명 LIKE '%레미콘%') GROUP BY WHERE2_동, WHERE3_층, HOW4_품명, R1_단위"; },
                    title: '본관동 3층 콘크리트 물량',
                    summary: '본관동 3층에 필요한 콘크리트 관련 자재 물량입니다.',
                    chartType: 'none'
                },
                {
                    text: '전체 자재 중 금액 비중이 가장 높은 상위 5개 품목은?',
                    tag: '고가 자재',
                    sql: function () { return "SELECT HOW4_품명 AS 품명, SUM(R10_합계_금액) AS 총금액, ROUND(SUM(R10_합계_금액) * 100.0 / (SELECT SUM(R10_합계_금액) FROM evms), 2) AS 비중 FROM evms GROUP BY HOW4_품명 ORDER BY 총금액 DESC LIMIT 5"; },
                    title: '금액 상위 5대 자재',
                    summary: '전체 공사비에서 금액 비중이 가장 높은 상위 5개 품목입니다. ABC 분석의 A 그룹에 해당합니다.',
                    chartType: 'horizontalBar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['총 금액'] }
                },
                {
                    text: '금빛건설㈜이 사용하는 주요 자재 내역을 보여줘.',
                    tag: '업체별 자재',
                    sql: function () { return "SELECT HOW4_품명 AS 품명, R1_단위 AS 단위, SUM(R2_수량) AS 물량, SUM(R10_합계_금액) AS 금액 FROM evms WHERE WHO1_하도급업체 LIKE '%금빛건설%' GROUP BY HOW4_품명, R1_단위 ORDER BY 금액 DESC LIMIT 15"; },
                    title: '금빛건설㈜ 주요 자재',
                    summary: '금빛건설㈜이 사용하는 자재를 금액 순으로 정렬한 내역입니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [3], dataLabels: ['금액'] }
                },
                {
                    text: '다음 분기에 자재비 지출이 가장 큰 달은 언제인가?',
                    tag: '자재비',
                    sql: function () { var nq = nextQuarterRange(); return "SELECT SUBSTR(WHEN2종료일,1,7) AS 월, SUM(R7_재료비_금액) AS 자재비 FROM evms WHERE SUBSTR(WHEN2종료일,1,7) >= '" + nq.start + "' AND SUBSTR(WHEN2종료일,1,7) <= '" + nq.end + "' GROUP BY SUBSTR(WHEN2종료일,1,7) ORDER BY 월"; },
                    title: '다음 분기 월별 자재비',
                    summary: '다음 분기의 월별 자재비 지출 계획입니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['자재비'] }
                }
            ]
        },
        {
            id: 'org', label: '조직/업체 관리', icon: 'fa-building-user', color: '#10B981',
            desc: '업체 관리 및 인력 투입 관련 질문',
            questions: [
                {
                    text: '현재(오늘) 현장에 투입되어 있는 모든 하도급 업체 리스트는?',
                    tag: '투입 현황',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, COUNT(*) AS 작업수, SUM(R10_합계_금액) AS 계약규모 FROM evms WHERE WHEN1_시작일 <= '" + today() + "' AND WHEN2종료일 >= '" + today() + "' AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY 계약규모 DESC"; },
                    title: '현재 투입 하도급 업체',
                    summary: '오늘 기준으로 현장에서 작업 중인 하도급 업체 리스트입니다.',
                    chartType: 'horizontalBar',
                    chartConfig: { labelColumn: 0, dataColumns: [2], dataLabels: ['계약 규모'] }
                },
                {
                    text: '전체 공사비 중 계약 금액이 가장 큰 업체 Top 3는?',
                    tag: '계약 비중',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, SUM(R10_합계_금액) AS 계약금액, ROUND(SUM(R10_합계_금액) * 100.0 / (SELECT SUM(R10_합계_금액) FROM evms), 1) AS 비중 FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY 계약금액 DESC LIMIT 3"; },
                    title: '계약금액 상위 3개 업체',
                    summary: '전체 공사비 기준 계약 금액이 가장 큰 상위 3개 업체입니다.',
                    chartType: 'doughnut',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['계약 금액'] }
                },
                {
                    text: '기계설비 공사를 담당하는 업체들은 어디인가?',
                    tag: '공종별 업체',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, HOW2_대공종 AS 담당공종, COUNT(*) AS 작업수, SUM(R10_합계_금액) AS 금액 FROM evms WHERE HOW1_공사 LIKE '%기계%' AND WHO1_하도급업체 IS NOT NULL GROUP BY WHO1_하도급업체, HOW2_대공종 ORDER BY 금액 DESC"; },
                    title: '기계설비 공사 담당 업체',
                    summary: '기계설비 공사를 수행하는 업체별 담당 공종과 계약 규모입니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [3], dataLabels: ['금액'] }
                },
                {
                    text: '다음 달에 노무비(출력 인원) 투입이 가장 많은 업체는 어디인가?',
                    tag: '노무비/출력',
                    sql: function () { var nm = nextMonth(); return "SELECT WHO1_하도급업체 AS 업체, SUM(R8_노무비_금액) AS 노무비 FROM evms WHERE SUBSTR(WHEN1_시작일,1,7) <= '" + nm + "' AND SUBSTR(WHEN2종료일,1,7) >= '" + nm + "' AND WHO1_하도급업체 IS NOT NULL GROUP BY WHO1_하도급업체 ORDER BY 노무비 DESC LIMIT 10"; },
                    title: '다음 달 노무비 상위 업체',
                    summary: '다음 달에 노무비 투입이 많은 업체 순위입니다.',
                    chartType: 'horizontalBar',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['노무비'] }
                },
                {
                    text: '현재 지상 1층에서 작업 중인 업체는 누구인가?',
                    tag: '작업 구역',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, HOW2_대공종 AS 공종, HOW3_작업명 AS 작업명, WHEN1_시작일, WHEN2종료일, R10_합계_금액 AS 금액 FROM evms WHERE WHERE3_층 LIKE '%1F%' AND WHERE3_층 NOT LIKE '%B1F%' AND WHEN1_시작일 <= '" + today() + "' AND WHEN2종료일 >= '" + today() + "' ORDER BY 금액 DESC"; },
                    title: '지상 1층 작업 중 업체',
                    summary: '현재 지상 1층에서 작업 중인 업체와 수행 작업 리스트입니다. 안전관리에 활용됩니다.',
                    chartType: 'none'
                }
            ]
        },
        {
            id: 'insight', label: '생산성/복합 분석', icon: 'fa-wand-magic-sparkles', color: '#EC4899',
            desc: '6W1H 조합 의사결정 분석 (CUBE Insight)',
            questions: [
                {
                    text: '단위 면적당 공사비가 가장 많이 투입되는 층(Floor)은 어디인가?',
                    tag: '공간 × 비용',
                    sql: function () { return "SELECT WHERE3_층 AS 층, COUNT(*) AS 항목수, SUM(R10_합계_금액) AS 총공사비, SUM(R2_수량) AS 총물량 FROM evms WHERE WHERE3_층 IS NOT NULL AND WHERE3_층 != '' GROUP BY WHERE3_층 ORDER BY 총공사비 DESC"; },
                    title: '층별 공사비 분석',
                    summary: '각 층별 총 공사비를 비교한 결과입니다. 공사비가 높은 층은 복잡도가 높거나 마감 수준이 높은 구역입니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [2], dataLabels: ['총 공사비'] }
                },
                {
                    text: '공사 기간이 가장 길게 잡혀 있는 하도급 업체는 어디인가?',
                    tag: '시간 × 조직',
                    sql: function () { return "SELECT WHO1_하도급업체 AS 업체, MIN(WHEN1_시작일) AS 최초투입, MAX(WHEN2종료일) AS 최종철수, CAST(JULIANDAY(MAX(WHEN2종료일)) - JULIANDAY(MIN(WHEN1_시작일)) AS INTEGER) AS 투입기간일, SUM(R10_합계_금액) AS 계약금액 FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY 투입기간일 DESC LIMIT 10"; },
                    title: '업체별 현장 투입 기간',
                    summary: '현장 투입 기간이 가장 긴 업체 순위입니다. 장기 투입 업체는 프로젝트 핵심 파트너입니다.',
                    chartType: 'horizontalBar',
                    chartConfig: { labelColumn: 0, dataColumns: [3], dataLabels: ['투입 기간(일)'] }
                },
                {
                    text: '철근콘크리트 공사에서 재료비와 노무비의 비율은 어떻게 되는가?',
                    tag: '공종 × 자원',
                    sql: function () { return "SELECT '재료비' AS 비목, SUM(R7_재료비_금액) AS 금액 FROM evms WHERE HOW2_대공종 LIKE '%골조%' OR HOW2_대공종 LIKE '%콘크리트%' UNION ALL SELECT '노무비', SUM(R8_노무비_금액) FROM evms WHERE HOW2_대공종 LIKE '%골조%' OR HOW2_대공종 LIKE '%콘크리트%' UNION ALL SELECT '경비', SUM(R9_경비_금액) FROM evms WHERE HOW2_대공종 LIKE '%골조%' OR HOW2_대공종 LIKE '%콘크리트%'"; },
                    title: '철근콘크리트 비목별 비율',
                    summary: '골조/콘크리트 공사의 재료비, 노무비, 경비 비율입니다.',
                    chartType: 'doughnut',
                    chartConfig: { labelColumn: 0, dataColumns: [1], dataLabels: ['금액'] }
                },
                {
                    text: '특정 기간(예: 8월)에 작업이 집중되어 혼잡이 예상되는 구역은?',
                    tag: '리스크 예측',
                    sql: function () { return "SELECT WHERE2_동 AS 동, WHERE3_층 AS 층, COUNT(*) AS 동시작업수, COUNT(DISTINCT WHO1_하도급업체) AS 업체수, SUM(R10_합계_금액) AS 총금액 FROM evms WHERE WHEN1_시작일 <= '" + thisYear() + "-08-31' AND WHEN2종료일 >= '" + thisYear() + "-08-01' GROUP BY WHERE2_동, WHERE3_층 ORDER BY 동시작업수 DESC LIMIT 15"; },
                    title: '8월 작업 혼잡 예상 구역',
                    summary: '8월에 동시 진행되는 작업이 가장 많은 구역(동/층)입니다. 안전 및 공정 관리에 주의가 필요합니다.',
                    chartType: 'bar',
                    chartConfig: { labelColumn: 0, dataColumns: [2], dataLabels: ['동시 작업 수'] }
                },
                {
                    text: '본관동 프로젝트의 현재 핵심 이슈를 요약해줘.',
                    tag: '종합 요약',
                    sql: function () { return "SELECT '총 예산' AS 항목, SUM(R10_합계_금액) AS 값 FROM evms WHERE WHERE2_동 LIKE '%본관%' UNION ALL SELECT '진행률(EV/BAC)', ROUND(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) * 100.0 / SUM(R10_합계_금액), 1) FROM evms WHERE WHERE2_동 LIKE '%본관%' UNION ALL SELECT '작업 항목 수', COUNT(*) FROM evms WHERE WHERE2_동 LIKE '%본관%' UNION ALL SELECT '투입 업체 수', COUNT(DISTINCT WHO1_하도급업체) FROM evms WHERE WHERE2_동 LIKE '%본관%' UNION ALL SELECT '지연 작업 수', COUNT(*) FROM evms WHERE WHERE2_동 LIKE '%본관%' AND WHEN2종료일 < '" + today() + "' AND (\"WHEN4_실행률(%)\" IS NULL OR \"WHEN4_실행률(%)\" < 1)"; },
                    title: '본관동 프로젝트 현황 요약',
                    summary: '본관동의 핵심 지표를 요약한 결과입니다.',
                    chartType: 'none'
                }
            ]
        }
    ];

    // ── Gemini API 호출 ──────────────────────────────────────

    async function callGeminiAPI(question) {
        if (!CONFIG.apiKey) return null;

        // 모델 폴백 체인
        var models = [CONFIG.model, 'gemini-2.5-flash', 'gemini-2.0-flash'];
        var lastError = null;

        for (var mi = 0; mi < models.length; mi++) {
            var modelName = models[mi];
            var url = CONFIG.baseUrl + modelName + ':generateContent?key=' + CONFIG.apiKey;
            var body = {
                systemInstruction: { parts: [{ text: buildSystemPrompt() }] },
                contents: [{ role: 'user', parts: [{ text: question }] }],
                generationConfig: {
                    temperature: CONFIG.temperature,
                    maxOutputTokens: CONFIG.maxTokens
                }
            };

            try {
                console.log('[AI] Trying model:', modelName);
                var resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!resp.ok) {
                    var errText = await resp.text();
                    console.error('[AI] Model', modelName, 'HTTP', resp.status, errText.substring(0, 300));
                    lastError = modelName + ' → HTTP ' + resp.status;
                    // 404(모델 없음) 또는 429(할당 초과)면 다음 모델 시도
                    if ((resp.status === 404 || resp.status === 429) && mi < models.length - 1) continue;
                    return { error: lastError + ': ' + errText.substring(0, 100) };
                }

                var data = await resp.json();
                console.log('[AI] Response from', modelName, ':', JSON.stringify(data).substring(0, 200));

                // 응답 텍스트 추출
                var text = '';
                if (data.candidates && data.candidates[0] && data.candidates[0].content
                    && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                    text = data.candidates[0].content.parts[0].text || '';
                }

                if (!text) {
                    // 응답은 성공했지만 텍스트가 없음 (안전 필터 등)
                    var blockReason = data.candidates && data.candidates[0] && data.candidates[0].finishReason;
                    lastError = modelName + ': 빈 응답 (finishReason=' + (blockReason || 'unknown') + ')';
                    if (mi < models.length - 1) continue;
                    return { error: lastError };
                }

                // 성공 모델 기억
                if (modelName !== CONFIG.model) {
                    console.log('[AI] Default model updated to:', modelName);
                    CONFIG.model = modelName;
                }

                // JSON 추출 (여러 포맷 대응)
                var jsonStr = '';
                // 방법 1: ```json ... ``` 블록 추출
                var jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
                if (jsonBlock) {
                    jsonStr = jsonBlock[1].trim();
                } else {
                    // 방법 2: { 로 시작하는 JSON 직접 추출
                    var braceStart = text.indexOf('{');
                    var braceEnd = text.lastIndexOf('}');
                    if (braceStart >= 0 && braceEnd > braceStart) {
                        jsonStr = text.substring(braceStart, braceEnd + 1);
                    } else {
                        jsonStr = text.trim();
                    }
                }

                var parsed = JSON.parse(jsonStr);

                // SQL 안전성 검사
                if (parsed.sql && /\b(DROP|DELETE|INSERT|UPDATE|ALTER|CREATE|TRUNCATE)\b/i.test(parsed.sql)) {
                    return { error: '위험한 SQL이 감지되었습니다. SELECT문만 허용됩니다.' };
                }

                console.log('[AI] Parsed SQL:', parsed.sql);
                return parsed;

            } catch (err) {
                console.error('[AI] Model', modelName, 'failed:', err.message);
                lastError = modelName + ': ' + err.message;
                if (mi < models.length - 1) continue;
                return { error: lastError };
            }
        }
        return { error: lastError || 'API 호출 실패' };
    }

    // ── 건설 구어체 → 표준 용어 변환 ──────────────────────────
    var SYNONYMS = [
        ['공구리', '콘크리트'], ['곤구리', '콘크리트'], ['꽁구리', '콘크리트'],
        ['레미콘', '레미콘'], ['생콘', '레미콘'],
        ['빠루', '바'], ['몽키', '렌치'],
        ['비게', '비계'], ['아시바', '비계'],
        ['뿌리방', '기초공사'], ['뿌림방', '기초공사'],
        ['타설', '콘크리트'], ['물량', '수량'],
        ['대금', '합계_금액'], ['공사비', '합계_금액'], ['돈', '금액'],
        ['비용', '금액'], ['지급', '금액'], ['청구', '기성'],
        ['자재', '재료'], ['인부', '노무'],
        ['콘크리트', '콘크리트']
    ];

    function normalizeQuestion(text) {
        var result = text;
        SYNONYMS.forEach(function (pair) {
            if (result.indexOf(pair[0]) >= 0 && pair[0] !== pair[1]) {
                result = result.replace(new RegExp(pair[0], 'g'), pair[1]);
            }
        });
        return result;
    }

    // ── 스마트 동적 SQL 생성기 ─────────────────────────────────

    function smartFallback(question) {
        var q = normalizeQuestion(question).toLowerCase();

        // ── GROUP BY 축 감지 ──
        var groupCol = null, groupLabel = '';
        if (q.indexOf('업체') >= 0 || q.indexOf('하도급') >= 0 || q.indexOf('협력사') >= 0) {
            groupCol = 'WHO1_하도급업체'; groupLabel = '업체';
        } else if (q.indexOf('공종') >= 0 || q.indexOf('공사') >= 0) {
            groupCol = 'HOW2_대공종'; groupLabel = '공종';
        } else if (q.indexOf('동별') >= 0 || q.indexOf('건물') >= 0) {
            groupCol = 'WHERE2_동'; groupLabel = '동';
        } else if (q.indexOf('층별') >= 0 || q.indexOf('층') >= 0 && q.indexOf('별') >= 0) {
            groupCol = 'WHERE3_층'; groupLabel = '층';
        } else if (q.indexOf('월별') >= 0) {
            groupCol = "SUBSTR(WHEN2종료일,1,7)"; groupLabel = '월';
        }

        if (!groupCol) return null; // 축을 감지 못하면 포기

        // ── 날짜 필터 감지 ──
        var dateWhere = '';
        var dateDesc = '';
        var yearMatch = q.match(/(20\d{2})/);
        var yr = yearMatch ? yearMatch[1] : thisYear();

        if (q.indexOf('전반기') >= 0 || q.indexOf('상반기') >= 0 || (q.indexOf('1월') >= 0 && q.indexOf('6월') >= 0)) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-01' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-06'";
            dateDesc = yr + '년 전반기(1~6월)';
        } else if (q.indexOf('후반기') >= 0 || q.indexOf('하반기') >= 0 || (q.indexOf('7월') >= 0 && q.indexOf('12월') >= 0)) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-07' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-12'";
            dateDesc = yr + '년 후반기(7~12월)';
        } else if (q.indexOf('1분기') >= 0 || q.indexOf('1사분기') >= 0) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-01' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-03'";
            dateDesc = yr + '년 1분기';
        } else if (q.indexOf('2분기') >= 0) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-04' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-06'";
            dateDesc = yr + '년 2분기';
        } else if (q.indexOf('3분기') >= 0) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-07' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-09'";
            dateDesc = yr + '년 3분기';
        } else if (q.indexOf('4분기') >= 0) {
            dateWhere = "SUBSTR(WHEN2종료일,1,7) >= '" + yr + "-10' AND SUBSTR(WHEN2종료일,1,7) <= '" + yr + "-12'";
            dateDesc = yr + '년 4분기';
        }
        // 특정 월 감지: N월
        if (!dateWhere) {
            var monthMatch = q.match(/(\d{1,2})월/);
            if (monthMatch) {
                var mm = monthMatch[1].padStart(2, '0');
                dateWhere = "SUBSTR(WHEN2종료일,1,7) = '" + yr + "-" + mm + "'";
                dateDesc = yr + '년 ' + monthMatch[1] + '월';
            }
        }

        // ── 집계 함수 감지 ──
        var measureExpr = 'SUM(R10_합계_금액)';
        var measureLabel = '합계금액';
        var measureUnit = '원';
        if (q.indexOf('재료비') >= 0 || q.indexOf('자재비') >= 0) {
            measureExpr = 'SUM(R7_재료비_금액)'; measureLabel = '재료비';
        } else if (q.indexOf('노무비') >= 0 || q.indexOf('인건비') >= 0) {
            measureExpr = 'SUM(R8_노무비_금액)'; measureLabel = '노무비';
        } else if (q.indexOf('경비') >= 0) {
            measureExpr = 'SUM(R9_경비_금액)'; measureLabel = '경비';
        } else if (q.indexOf('작업수') >= 0 || q.indexOf('작업 수') >= 0 || q.indexOf('항목수') >= 0) {
            measureExpr = 'COUNT(*)'; measureLabel = '작업수'; measureUnit = '건';
        }

        // ── SQL 조립 ──
        var whereClauses = [];
        if (groupCol.indexOf('SUBSTR') < 0) {
            whereClauses.push(groupCol + " IS NOT NULL AND " + groupCol + " != ''");
        }
        if (dateWhere) whereClauses.push(dateWhere);
        var whereStr = whereClauses.length > 0 ? ' WHERE ' + whereClauses.join(' AND ') : '';

        var sql = 'SELECT ' + groupCol + ' AS ' + groupLabel + ', COUNT(*) AS 작업수, ' + measureExpr + ' AS ' + measureLabel +
            ' FROM evms' + whereStr +
            ' GROUP BY ' + groupCol +
            ' ORDER BY ' + measureLabel + ' DESC LIMIT 20';

        var titleParts = [];
        if (dateDesc) titleParts.push(dateDesc);
        titleParts.push(groupLabel + '별 ' + measureLabel + ' 현황');

        return {
            sql: sql,
            title: titleParts.join(' '),
            summary: (dateDesc ? dateDesc + ' 기간 동안 ' : '') + groupLabel + '별로 ' + measureLabel + '을 집계한 결과입니다. 금액이 큰 순서로 정렬되어 있습니다.',
            chartType: 'horizontalBar',
            chartConfig: { labelColumn: 0, dataColumns: [2], dataLabels: [measureLabel] },
            kpis: [],
            isPreset: false,
            isSmart: true
        };
    }

    // ── 규칙 기반 폴백 엔진 ──────────────────────────────────

    function fallbackEngine(question) {
        var q = normalizeQuestion(question).toLowerCase();
        var bestMatch = null;
        var bestScore = 0;

        PRESET_CATEGORIES.forEach(function (cat) {
            cat.questions.forEach(function (preset) {
                var score = 0;
                // 키워드 매칭
                var words = preset.text.replace(/[?？]/g, '').split(/\s+|,/);
                words.forEach(function (w) {
                    if (w.length >= 2 && q.indexOf(w.toLowerCase()) >= 0) score += w.length;
                });
                if (score > bestScore) {
                    bestScore = score;
                    bestMatch = preset;
                }
            });
        });

        if (bestMatch && bestScore >= 4) {
            return {
                sql: typeof bestMatch.sql === 'function' ? bestMatch.sql() : bestMatch.sql,
                title: bestMatch.title,
                summary: bestMatch.summary,
                chartType: bestMatch.chartType || 'none',
                chartConfig: bestMatch.chartConfig || null,
                kpis: bestMatch.kpis || [],
                isPreset: true
            };
        }

        // 스마트 폴백 시도: 키워드 조합으로 동적 SQL 생성
        var smart = smartFallback(question);
        if (smart) return smart;

        // 기본 폴백: 전체 프로젝트 요약
        return {
            sql: "SELECT '총 항목 수' AS 항목, COUNT(*) AS 값 FROM evms UNION ALL SELECT '총 예산(BAC)', SUM(R10_합계_금액) FROM evms UNION ALL SELECT '투입 업체 수', COUNT(DISTINCT WHO1_하도급업체) FROM evms UNION ALL SELECT '평균 실행률(%)', ROUND(AVG(\"WHEN4_실행률(%)\") * 100, 1) FROM evms WHERE \"WHEN4_실행률(%)\" IS NOT NULL",
            title: '프로젝트 전체 요약',
            summary: '질문에 정확히 매칭되는 프리셋이 없어 프로젝트 전체 요약을 제공합니다. Gemini API 키를 입력하면 자유로운 질문이 가능합니다.',
            chartType: 'none',
            kpis: [],
            isPreset: true,
            isFallback: true
        };
    }

    // ── 차트 자동 추천 ───────────────────────────────────────

    function recommendChart(result, hintType) {
        if (hintType && hintType !== 'none') return hintType;
        if (!result || !result.values || result.values.length === 0) return 'none';

        var rows = result.values.length;
        var cols = result.columns.length;

        if (rows === 1 && cols <= 4) return 'none'; // KPI only
        if (rows <= 5 && cols === 2) return 'doughnut';
        if (rows <= 12 && cols >= 2) return 'bar';
        if (rows > 12) return 'line';
        return 'bar';
    }

    // ── SQL 실행 ─────────────────────────────────────────────

    function executeSQL(sql) {
        if (!DB || !DB.isReady()) return { columns: [], values: [], error: 'DB가 준비되지 않았습니다.' };
        try {
            return DB.runQuery(sql);
        } catch (err) {
            return { columns: [], values: [], error: 'SQL 실행 오류: ' + err.message };
        }
    }

    // ── 메인 처리 파이프라인 ──────────────────────────────────

    async function processQuery(question) {
        var startTime = Date.now();
        var analysis = null;

        // 1. Gemini API 시도
        if (CONFIG.apiKey) {
            analysis = await callGeminiAPI(question);
            if (analysis && analysis.error) {
                // API 에러 → 폴백
                var apiError = analysis.error;
                analysis = fallbackEngine(question);
                analysis.apiError = apiError;
            }
        } else {
            // API 키 없음 → 폴백
            analysis = fallbackEngine(question);
        }

        if (!analysis || !analysis.sql) {
            return {
                title: '처리 실패',
                summary: '질문을 처리할 수 없습니다.',
                result: { columns: [], values: [] },
                chartType: 'none',
                elapsed: Date.now() - startTime
            };
        }

        // 2. SQL 실행
        var result = executeSQL(analysis.sql);

        // 3. 차트 타입 결정
        var chartType = recommendChart(result, analysis.chartType);

        return {
            sql: analysis.sql,
            title: analysis.title || '분석 결과',
            summary: analysis.summary || '',
            result: result,
            chartType: chartType,
            chartConfig: analysis.chartConfig || null,
            kpis: analysis.kpis || [],
            isPreset: analysis.isPreset || false,
            isFallback: analysis.isFallback || false,
            apiError: analysis.apiError || null,
            elapsed: Date.now() - startTime
        };
    }

    // ── 전역 내보내기 ────────────────────────────────────────

    window.AIEngine = {
        processQuery: processQuery,
        setApiKey: function (key) { CONFIG.apiKey = key; },
        getApiKey: function () { return CONFIG.apiKey; },
        hasApiKey: function () { return !!CONFIG.apiKey; },
        getPresetCategories: function () { return PRESET_CATEGORIES; },
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        formatPercent: formatPercent,
        executeSQL: executeSQL,
        today: today,
        thisMonth: thisMonth
    };

})();

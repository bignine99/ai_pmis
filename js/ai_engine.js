/**
 * ============================================================
 * CUBE-AI Hybrid Analysis Engine (ai_engine.js)
 * ============================================================
 * - Gemini 2.5 Flash-Lite API 연동 (NL → SQL 변환)
 * - CM이론 기반 하이브리드 분석 (2-Pass 모드)
 * - 12개 건설현장 회의의제 자동 매칭
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

    // ── 대화 기록 (맥락 유지용) ────────────────────────────────
    var conversationHistory = [];
    var MAX_HISTORY = 6; // 최근 3쌍 (user+model)

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

    function buildSystemPrompt(agendaContext) {
        // ── 1. 핵심 컬럼의 실제 데이터 샘플을 DB에서 동적으로 조회 ──
        var sampleData = '';
        try {
            var samples = {
                'WHERE2_동': "SELECT DISTINCT WHERE2_동 FROM evms WHERE WHERE2_동 IS NOT NULL AND WHERE2_동 != '' ORDER BY WHERE2_동",
                'WHERE3_층': "SELECT DISTINCT WHERE3_층 FROM evms WHERE WHERE3_층 IS NOT NULL AND WHERE3_층 != '' ORDER BY WHERE3_층",
                'HOW1_공사': "SELECT DISTINCT HOW1_공사 FROM evms WHERE HOW1_공사 IS NOT NULL ORDER BY HOW1_공사",
                'HOW2_대공종': "SELECT DISTINCT HOW2_대공종 FROM evms WHERE HOW2_대공종 IS NOT NULL ORDER BY HOW2_대공종",
                'HOW3_작업명 (상위 30)': "SELECT HOW3_작업명, COUNT(*) as cnt FROM evms WHERE HOW3_작업명 IS NOT NULL GROUP BY HOW3_작업명 ORDER BY cnt DESC LIMIT 30",
                'HOW4_품명 (상위 40)': "SELECT HOW4_품명, COUNT(*) as cnt FROM evms WHERE HOW4_품명 IS NOT NULL GROUP BY HOW4_품명 ORDER BY cnt DESC LIMIT 40",
                'WHO1_하도급업체': "SELECT DISTINCT WHO1_하도급업체 FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' ORDER BY WHO1_하도급업체",
                'R1_단위': "SELECT DISTINCT R1_단위 FROM evms WHERE R1_단위 IS NOT NULL ORDER BY R1_단위"
            };
            for (var key in samples) {
                var r = executeSQL(samples[key]);
                if (r && r.values && r.values.length > 0) {
                    var vals = r.values.map(function (row) { return row[0]; }).join(', ');
                    sampleData += '  - ' + key + ': ' + vals + '\n';
                }
            }
        } catch (e) { console.warn('[AI] Failed to build sample data:', e); }

        // ── 2. 실제 데이터 행 샘플 (5행) ──
        var sampleRows = '';
        try {
            var rowQuery = "SELECT WHERE2_동, WHERE3_층, HOW1_공사, HOW2_대공종, HOW3_작업명, HOW4_품명, HOW5_규격, R1_단위, R2_수량, R10_합계_금액 FROM evms WHERE HOW4_품명 IS NOT NULL AND R2_수량 > 0 LIMIT 5";
            var rowResult = executeSQL(rowQuery);
            if (rowResult && rowResult.values && rowResult.values.length > 0) {
                sampleRows += '  ' + rowResult.columns.join(' | ') + '\n';
                rowResult.values.forEach(function (row) {
                    sampleRows += '  ' + row.join(' | ') + '\n';
                });
            }
        } catch (e) { console.warn('[AI] Failed to build sample rows:', e); }

        // ── 3. 동적 Q&A 예시 생성 (실제 DB 결과 기반) ──
        var qaExamples = '';
        try {
            var qaPairs = [
                {
                    q: '본관동 가설공사 총 금액은?',
                    sql: "SELECT SUM(R10_합계_금액) AS 총금액 FROM evms WHERE WHERE2_동 LIKE '%본관%' AND HOW2_대공종 LIKE '%가설%'",
                    desc: 'WHERE(본관) + HOW(가설) → R(금액)'
                },
                {
                    q: '동별 구조부 먹매김 물량은?',
                    sql: "SELECT WHERE2_동, SUM(R2_수량) AS 물량, R1_단위 FROM evms WHERE HOW4_품명 LIKE '%먹매김%' GROUP BY WHERE2_동, R1_단위 ORDER BY 물량 DESC",
                    desc: 'HOW(먹매김) → GROUP BY WHERE(동) → R(수량)'
                },
                {
                    q: '금빛건설의 전체 도급 금액은?',
                    sql: "SELECT WHO1_하도급업체, SUM(R10_합계_금액) AS 총금액 FROM evms WHERE WHO1_하도급업체 LIKE '%금빛%'",
                    desc: 'WHO(금빛건설) → R(금액)'
                }
            ];
            qaPairs.forEach(function (qa) {
                var result = executeSQL(qa.sql);
                var answer = '(결과 없음)';
                if (result && result.values && result.values.length > 0) {
                    if (result.values.length === 1) {
                        answer = result.columns.map(function (col, i) {
                            var v = result.values[0][i];
                            return col + '=' + (typeof v === 'number' ? formatNumber(v) : v);
                        }).join(', ');
                    } else {
                        answer = result.values.length + '건 결과';
                    }
                }
                qaExamples += '  Q: "' + qa.q + '" [' + qa.desc + ']\n';
                qaExamples += '  SQL: ' + qa.sql + '\n';
                qaExamples += '  A: ' + answer + '\n\n';
            });
        } catch (e) { console.warn('[AI] Failed to build Q&A examples:', e); }

        // ── 4. 시스템 프롬프트 조합 ──
        var prompt = '# 역할\n' +
            '당신은 건설사업관리(CM) 전문 컨설턴트이자 SQL 전문가입니다.\n' +
            '건설 데이터에 대한 자연어 질문을 SQL로 변환하고, CM이론에 기반한 분석을 제공합니다.\n\n' +

            '# CUBE 데이터 프레임워크\n' +
            '이 시스템은 CUBE 기술을 활용하여 건설 데이터를 5W1H(6하원칙) 구조로 관리합니다.\n' +
            '"금빛건설이 본관동 3층에 설치한 철근 물량과 재료비는?" 같은 자연어 질문에 답변할 수 있습니다.\n\n' +

            '## 데이터 구조 (독립변수 + 종속변수)\n' +
            '- 독립변수: WHERE(공간), HOW(공종), WHEN(시간), WHO(조직)\n' +
            '- 종속변수: R(수량, 단가, 금액)\n' +
            '- 컬럼명의 숫자는 Level of Detail(정보수준)을 의미: HOW1 > HOW2 (HOW1이 HOW2를 포함)\n\n' +

            '## DB 스키마\n' +
            '테이블: evms (인천소방학교 이전 신축공사)\n\n' +

            '### WHERE (공간정보) — 어디에?\n' +
            '- WHERE1_프로젝트 (TEXT): 프로젝트명 (Level 1: 최상위)\n' +
            '- WHERE2_동 (TEXT): 건물 동 (Level 2: 프로젝트 > 동)\n' +
            '- WHERE3_층 (TEXT): 층 (Level 3: 동 > 층)\n\n' +

            '### HOW (공종정보) — 어떻게?\n' +
            '- HOW1_공사 (TEXT): 공사 구분 (Level 1: 최상위, 예: A_건축공사)\n' +
            '- HOW2_대공종 (TEXT): 대공종 (Level 2: 공사 > 대공종, 예: A02_가설공사)\n' +
            '- HOW3_작업명 (TEXT): 작업명/세공종 (Level 3)\n' +
            '- HOW4_품명 (TEXT): 품명/자재명 (Level 4) ★ 핵심 검색 대상\n' +
            '- HOW5_규격 (TEXT): 규격 (Level 5)\n' +
            '- HOW6_세부작업명 (TEXT): 상세 작업\n\n' +

            '### WHEN (시간정보) — 언제?\n' +
            '- WHEN1_시작일 (TEXT, YYYY-MM-DD): 작업 시작일\n' +
            '- WHEN2종료일 (TEXT, YYYY-MM-DD): 작업 종료일\n' +
            '- "WHEN3_기간(일)" (REAL): 작업 기간 (일수) — ★큰따옴표 필수\n' +
            '- "WHEN4_실행률(%)" (REAL): 실행률 (0~1, 0.74=74%) — ★큰따옴표 필수\n\n' +

            '### WHO (조직정보) — 누가?\n' +
            '- WHO1_하도급업체 (TEXT): 하도급업체명\n\n' +

            '### R (종속변수) — 수량/단가/금액\n' +
            '- R1_단위 (TEXT): 단위\n' +
            '- R2_수량 (REAL): 수량 ★ 물량 질문의 답\n' +
            '- R3_재료비_단가, R4_노무비_단가, R5_경비_단가, R6_합계_단가 (INTEGER)\n' +
            '- R7_재료비_금액 (INTEGER): 재료비\n' +
            '- R8_노무비_금액 (INTEGER): 노무비\n' +
            '- R9_경비_금액 (INTEGER): 경비\n' +
            '- R10_합계_금액 (INTEGER): 합계금액 ★ 공사비 질문의 답\n\n' +

            '## 실제 데이터 값 목록\n' +
            sampleData + '\n' +

            '## 실제 데이터 행 예시\n' +
            sampleRows + '\n' +

            '## 질문→SQL 변환 예시 (실제 결과 포함)\n' +
            qaExamples +

            '## 추가 SQL 패턴\n' +
            '- 동별 집계: SELECT WHERE2_동, SUM(R2_수량) AS 물량 FROM evms WHERE HOW4_품명 LIKE \'%키워드%\' GROUP BY WHERE2_동 ORDER BY 물량 DESC\n' +
            '- 공종별 금액: SELECT HOW2_대공종, SUM(R10_합계_금액) AS 금액 FROM evms GROUP BY HOW2_대공종 ORDER BY 금액 DESC\n' +
            '- 업체별 실적: SELECT WHO1_하도급업체, SUM(R10_합계_금액) AS 금액 FROM evms GROUP BY WHO1_하도급업체 ORDER BY 금액 DESC\n' +
            '- 층별 물량: SELECT WHERE3_층, SUM(R2_수량) FROM evms WHERE WHERE2_동 LIKE \'%본관%\' AND HOW4_품명 LIKE \'%키워드%\' GROUP BY WHERE3_층\n' +
            '- 기간 필터: SELECT ... WHERE WHEN1_시작일 >= \'2026-06-01\' AND WHEN2종료일 <= \'2026-12-31\'\n' +
            '- 기성액: SELECT SUM(R10_합계_금액 * COALESCE("WHEN4_실행률(%)", 0)) AS 기성액 FROM evms\n\n' +

            '# CM 핵심 이론 (Construction Management Theories)\n' +
            '데이터를 해석할 때 아래 이론을 활용하여 전문적인 분석을 제공하세요.\n\n' +

            '## EVM (Earned Value Management, 기성관리)\n' +
            '- BAC(총예산) = SUM(R10_합계_금액) — 전체 도급 금액\n' +
            '- EV(획득가치) = SUM(R10_합계_금액 * "WHEN4_실행률(%)") — 실제 완료된 공사의 가치\n' +
            '- SPI(공정수행지수) = EV / PV → 1.0 미만이면 공기 지연, 초과면 앞당김\n' +
            '- CPI(원가수행지수) = EV / AC → 1.0 미만이면 예산 초과\n' +
            '- EAC(준공예상원가) = BAC / CPI\n' +
            '- ETC(잔여투입비) = EAC - AC\n' +
            '- TCPI(잔여성과지수) = 남은 작업 / 남은 예산\n\n' +

            '## CPM (Critical Path Method, 주공정법)\n' +
            '- 주공정: 전체 공기를 결정하는 최장 경로의 작업들\n' +
            '- "WHEN3_기간(일)"이 길고, 실행률이 낮은 작업 = 주공정 지연 후보\n' +
            '- Float(여유시간): 비주공정의 지연 허용 여분\n' +
            '- Crashing: 인력/장비 집중 투입으로 주공정 단축\n' +
            '- Fast Tracking: 선후행 작업을 중첩 수행하여 기간 단축\n\n' +

            '## VE (Value Engineering, 가치공학)\n' +
            '- VE = 기능(Function) / 비용(Cost)\n' +
            '- 동일 기능을 낮은 비용으로 달성하는 대안 공법\n' +
            '- 적용: 현장타설→PC부재, OSC(탈현장시공), 모듈러\n\n' +

            '## 원가관리 핵심\n' +
            '- 도급 = 발주처 계약 금액, 실행 = 실제 투입 원가\n' +
            '- 실행율 = 실행원가/도급금액×100% (100% 초과=적자)\n' +
            '- 이익 = 도급 - 실행\n' +
            '- 기성 = 시공 완료량에 대한 대가 청구\n' +
            '- 과기성(Over-billing) = 실제보다 많이 청구\n\n' +

            '## 만회공정 (Catch-up Schedule)\n' +
            '- 돌관공사(Crashing): 야간/휴일 작업, 인력 추가 투입\n' +
            '- Fast Tracking: 공정 중첩, 선행 미완 상태에서 후행 착수\n' +
            '- 공법변경: PC, OSC, 모듈러 등 기간 단축 공법 도입\n' +
            '- 자원 재배치: 비주공정 → 주공정으로 인력/장비 이동\n\n' +

            '## 리스크 관리\n' +
            '- Escalation: 물가변동(자재/노무비 상승) 반영 청구\n' +
            '- Claim: 발주처 귀책 시 추가 비용/공기 청구\n' +
            '- EOT(Extension of Time): 공기연장\n' +
            '- LD(지체상금): 시공사 귀책 공기지연 시 배상\n\n' +

            '# SQL 작성 규칙\n' +
            '1. SELECT문만 생성. INSERT/UPDATE/DELETE 절대 금지\n' +
            '2. 괄호 포함 컬럼은 큰따옴표 필수: "WHEN3_기간(일)", "WHEN4_실행률(%)"\n' +
            '3. ★★★ 품명/작업명/규격/동 검색은 반드시 LIKE \'%키워드%\' 사용 (= 절대 금지) ★★★\n' +
            '   - 값이 "01_본관동", "A02_가설공사" 형태로 접두번호가 있으므로 LIKE 필수\n' +
            '4. 금액 단위는 "원"\n' +
            '5. 날짜 형식: YYYY-MM-DD\n' +
            '6. "이번 달" = SUBSTR(WHEN2종료일,1,7) = \'' + thisMonth() + '\'\n' +
            '7. "올해" = SUBSTR(WHEN2종료일,1,4) = \'' + thisYear() + '\'\n' +
            '8. "오늘" = \'' + today() + '\'\n' +
            '9. "다음 달" = SUBSTR(WHEN1_시작일,1,7) = \'' + nextMonth() + '\'\n' +
            '10. 기성액 = SUM(R10_합계_금액 * COALESCE("WHEN4_실행률(%)", 0))\n' +
            '11. 현장 비속어/구어체 → 정식 용어 변환표:\n' +
            '  공구리/곤구리→콘크리트, 아시바→비계, 데모도→잡부, 노가다→노동, 빠루→지렛대\n' +
            '  삐까→마감, 나라시→고르기, 시마이→마무리, 구배→경사, 다루끼→각재\n' +
            '  야리까다→규준틀, 바라시→해체, 스미→먹줄, 와꾸→거푸집, 함바→현장식당\n' +
            '  함마→망치, 겐노→쇠망치, 데나오시→재시공, 하쓰리→쪼기, 후까시→여유분\n' +
            '  호리→기초파기, 우마→작업대, 세빠다이→간격재, 다데→수직, 요꼬→수평\n' +
            '  포크레인→굴착기, 레미콘/생콘→레디믹스트 콘크리트, 뿌레카→유압브레이커\n' +
            '  앙카→앵커, 그라인다→연삭기, 빠이브→콘크리트 진동기, 스리브→관통슬리브\n' +
            '  타설→콘크리트 타설, 철근→봉강, 가라→가조립/임시\n' +
            '12. "상반기"=1~6월, "하반기"=7~12월\n' +
            '13. "물량"이라는 단어 → R2_수량의 합계\n' +
            '14. "공사비/금액/비용"이라는 단어 → R10_합계_금액의 합계\n' +
            '15. "재료비"만 따로 → R7_재료비_금액, "노무비"만 따로 → R8_노무비_금액\n\n' +

            '# DB 데이터 구조 가이드라인 (★★ 필수 참조 ★★)\n' +
            '이 DB는 건설 내역서의 도급내역을 CUBE 구조로 변환한 것입니다.\n\n' +

            '## 도급 자재 vs 관급 자재\n' +
            '- 품명에 "(도급)"이 붙은 항목 = 발주처가 직접 구매·지급하는 **관급자재**\n' +
            '  → R3~R10 비용이 **모두 0**인 것이 정상 (데이터 오류 아님!)\n' +
            '  → R2_수량(물량)만 기록됨\n' +
            '- 대표: 철근콘크리트용봉강(도급), 레미콘(도급), GC DECKPLATE(도급)\n' +
            '- 해당 자재의 비용은 HOW2_대공종=\'B09_관급자재비\'에 총괄 계상됨\n' +
            '  예: 이형철근(SD400/SD500) → 관급자재비 항목에 금액 존재\n\n' +

            '## 자재 동의어 매핑 (★★ SQL 검색 핵심 ★★)\n' +
            '사용자 표현과 DB 품명이 다릅니다:\n' +
            '- 철근/이형철근 → DB 품명: "철근콘크리트용봉강(도급)" (동/층별 물량 존재)\n' +
            '- 이형철근(SD400) → DB 품명: "이형철근(SD400)" (00_공통에만, 관급자재비)\n' +
            '- 콘크리트/레미콘 → "레미콘(도급)"(물량) 또는 "철근콘크리트 타설"(시공비)\n' +
            '- 거푸집 → "합판거푸집 설치 및 해체" 또는 "유로폼 설치 및 해체"\n' +
            '- 데크 → "GC DECKPLATE(도급)"(물량) 또는 "데크 설치비"(시공비)\n\n' +

            '## 철근 데이터의 이중 구조 (★★★ 가장 중요 ★★★)\n' +
            '같은 철근이 두 곳에 다른 형태로 존재합니다:\n' +
            '[1] 관급자재비: WHERE2_동=\'00_공통\', HOW4_품명=\'이형철근(SD400/SD500)\'\n' +
            '    → 총괄 물량+금액, 동/층 구분 없음\n' +
            '[2] 도급항목: WHERE2_동=\'01_본관동\' 등, HOW4_품명=\'철근콘크리트용봉강(도급)\'\n' +
            '    → 동/층별 배분 물량, 금액=0\n\n' +
            '따라서:\n' +
            '- 이형철근 "총 물량과 자재비" → HOW4_품명 LIKE \'%이형철근%\'\n' +
            '- 이형철근 "동별/층별 물량" → HOW4_품명 LIKE \'%봉강%\' (도급 항목 조회)\n' +
            '- 철근 "동별 물량 비교" → HOW4_품명 LIKE \'%봉강%\' + GROUP BY WHERE2_동\n' +
            '- 본관동 3층 "철근 물량" → WHERE2_동 LIKE \'%본관%\' AND WHERE3_층 LIKE \'%3%\' AND HOW4_품명 LIKE \'%봉강%\'\n\n' +

            '## 규격(HOW5_규격) 특수 용어\n' +
            '- 하치장상차도: 공장 가공 후 현장 야적장까지 운반·도착 포함 조건\n' +
            '- HD-10~HD-25: 이형철근 직경 (D10=10mm, D25=25mm)\n' +
            '- SH-16~SH-25: 고강도(SD500) 이형철근 직경\n' +
            '- SD350/400, SD500: 철근 강도 등급 (항복강도 MPa)\n' +
            '- (도급)/(관급): 발주처 직접 구매·지급 자재\n' +
            '- Type-2: 철근 가공 유형\n\n' +

            '## WHERE2_동 = \'00_공통\'\n' +
            '특정 동에 배분되지 않은 공통 항목 (관급자재비, 토목, 조경 등)\n' +
            '동별 집계 시 00_공통은 별도 취급 필요\n\n';

        // ── 5. 회의의제 매칭 컨텍스트 동적 추가 ──
        if (agendaContext) {
            prompt += '# 관련 회의의제 컨텍스트\n' +
                '이 질문은 건설현장 정기 회의에서 자주 논의되는 주제입니다.\n' +
                '아래 분석 프레임워크를 참고하여 답변하세요.\n\n' +
                agendaContext + '\n\n';
        }

        // ── 6. 응답 형식 ──
        prompt += '# 응답 형식\n' +
            '반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 포함하지 마세요.\n' +
            '```json\n' +
            '{\n' +
            '  "sql": "SELECT ...",\n' +
            '  "title": "분석 제목 (한국어)",\n' +
            '  "summary": "분석 결과에 대한 인사이트 (2~3문장, 한국어)",\n' +
            '  "chartType": "bar|line|pie|doughnut|horizontalBar|none",\n' +
            '  "chartConfig": { "labelColumn": 0, "dataColumns": [1], "dataLabels": ["금액"] },\n' +
            '  "kpis": [{ "label": "KPI명", "valueExpression": "sum", "unit": "원|건|%", "icon": "fa-coins" }],\n' +
            '  "queryType": "data|hybrid|consulting"\n' +
            '}\n' +
            '```\n' +
            '## queryType 판별 기준\n' +
            '- "data": 단순 데이터 조회 질문 (물량, 금액, 목록 등)\n' +
            '- "hybrid": 데이터 + 분석/해석이 필요한 질문 (지연 분석, 실행율 점검, 만회 대책 등)\n' +
            '- "consulting": 이론/전략 중심 질문 (VE 검토, 클레임 전략, 리스크 관리 등)\n';

        return prompt;
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

    // ── 12개 회의의제 매칭 시스템 (Stage ④) ────────────────

    var MEETING_AGENDAS = [
        {
            id: 'execution_rate', label: '실행율 점검',
            keywords: ['실행율', '실행률', '원가율', '도급대비', '투입원가', '실행예산'],
            context: '회의의제: 도급 대비 실행율 점검\n분석 포인트:\n1. 공종별 실행율 편차 확인 (계획 vs 실제)\n2. 항목별 원가 분석 (노무비, 재료비, 경비)\n3. 재시공(데나오시) 비용 별도 집계\n4. ETC/EAC 예측 및 만회 대책',
            supportSql: "SELECT HOW2_대공종, SUM(R10_합계_금액) AS 도급금액, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 기성액, ROUND(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) * 100.0 / NULLIF(SUM(R10_합계_금액), 0), 1) AS 진행률 FROM evms GROUP BY HOW2_대공종 ORDER BY 도급금액 DESC"
        },
        {
            id: 'cost_analysis', label: '투입비 분석',
            keywords: ['인건비', '자재비', '외주비', '장비비', '투입비', '비목별', '노무비 초과', '재료비 초과'],
            context: '회의의제: 투입비(Cost) 항목별 상세 분석\n분석 포인트:\n1. 재료비/노무비/경비 비율 분석\n2. 공종별 비목 구성비 비교\n3. 이상 비목 식별 및 원인 분석\n4. BIM 기반 물량 산출 및 재고 관리 강화',
            supportSql: "SELECT '재료비' AS 비목, SUM(R7_재료비_금액) AS 금액 FROM evms UNION ALL SELECT '노무비', SUM(R8_노무비_금액) FROM evms UNION ALL SELECT '경비', SUM(R9_경비_금액) FROM evms"
        },
        {
            id: 'loss_analysis', label: '적자 공종 분석',
            keywords: ['적자', '빨간현장', '원가초과', '손실', '적자공종', '실행온'],
            context: '회의의제: 적자 공종(빨간현장 요인) 집중 관리\n분석 포인트:\n1. 원가율 100% 초과 공종 식별\n2. 손실 유형: 설계누락, 시공효율저하, 자재가폭등, 하도급 역량부족\n3. VE(가치공학) 적용 대안 공법 검토\n4. 하도급 재협상 및 직영 전환 가능성',
            supportSql: "SELECT HOW2_대공종, SUM(R10_합계_금액) AS 도급, SUM(R7_재료비_금액) + SUM(R8_노무비_금액) + SUM(R9_경비_금액) AS 실행 FROM evms GROUP BY HOW2_대공종 ORDER BY 도급 DESC"
        },
        {
            id: 'profit_forecast', label: '이익 산출',
            keywords: ['이익', '손익', 'EAC', 'ETC', '준공원가', '잔여', '예상이익'],
            context: '회의의제: 확정 이익 및 예상 이익 산출\n분석 포인트:\n1. 현재 시점 확정 이익 (기성수익 - 투입원가)\n2. 잔여 공사 투입비(ETC) 정밀 추산\n3. 준공 시점 최종 원가율(EAC) 도출\n4. 낙관적/비관적 시나리오 분석',
            supportSql: "SELECT '총예산(BAC)' AS 항목, SUM(R10_합계_금액) AS 값 FROM evms UNION ALL SELECT '기성액(EV)', SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) FROM evms UNION ALL SELECT '잔여예산', SUM(R10_합계_금액) - SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) FROM evms"
        },
        {
            id: 'billing', label: '기성 산출',
            keywords: ['기성', '검측', '진도율', '청구', '과기성', '승인'],
            context: '회의의제: 매월 검측 기반 기성 산출 및 확정\n분석 포인트:\n1. 공종별 진도율 산정 (전체 계획 대비 실적)\n2. 과기성(Over-billing) 차단\n3. 하도급 청구액 적정성 검토\n4. 차월 기성 목표 설정',
            supportSql: "SELECT WHO1_하도급업체, SUM(R10_합계_금액) AS 도급액, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 기성액 FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY 도급액 DESC"
        },
        {
            id: 'cash_flow', label: '수금 관리',
            keywords: ['수금', '미수금', '자금', '현금흐름', '입금', '지급'],
            context: '회의의제: 발주처 청구 및 수금 현황 관리\n분석 포인트:\n1. 수금 예정일 확정 및 입금 관리\n2. 하도급 기성 지급 연계\n3. 노무비 우선 배정\n4. 미청구 기성 발굴 및 조기 청구',
            supportSql: "SELECT WHERE2_동, SUM(R10_합계_금액) AS 도급액, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 기성액 FROM evms GROUP BY WHERE2_동 ORDER BY 도급액 DESC"
        },
        {
            id: 'escalation', label: '물가 변동',
            keywords: ['물가', '에스컬레이션', '단가상승', '물가변동', '증액'],
            context: '회의의제: 물가 변동(Escalation) 반영 및 증액 요청\n분석 포인트:\n1. 계약 조건 및 법적 근거 검토\n2. 비목별 가격 상승률 데이터 산출\n3. 증액 요청 논리 및 증빙 자료 준비\n4. 하도급사 물가 연동제 적용',
            supportSql: "SELECT HOW2_대공종, SUM(R7_재료비_금액) AS 재료비, SUM(R8_노무비_금액) AS 노무비, SUM(R9_경비_금액) AS 경비 FROM evms GROUP BY HOW2_대공종 ORDER BY 재료비 DESC"
        },
        {
            id: 'design_change', label: '설계변경',
            keywords: ['설변', '설계변경', '추가물량', '누락', '정산', '신규단가'],
            context: '회의의제: 추가/누락 물량 정산 및 설계변경\n분석 포인트:\n1. 도면 누락 및 오류 식별\n2. 현장 여건 변화(연약지반, 암반 등) 확인\n3. 물량 산출서 재검증\n4. 클레임 방어 및 정산 합의서 작성',
            supportSql: "SELECT HOW3_작업명, SUM(R2_수량) AS 총수량, SUM(R10_합계_금액) AS 금액, COUNT(*) AS 항목수 FROM evms GROUP BY HOW3_작업명 ORDER BY 금액 DESC LIMIT 15"
        },
        {
            id: 'eot', label: '공기 연장',
            keywords: ['EOT', '공기지연', '간접비', '보상', '연장', '지체상금'],
            context: '회의의제: 공기 연장에 따른 비용(EOT) 산출\n분석 포인트:\n1. 지연 사유 규명 및 책임 소재\n2. 간접비 증가분 실비 산출\n3. 증빙 자료(RFI, 공문) 구축\n4. 만회공정 비용 vs 공기연장 간접비 비교',
            supportSql: "SELECT WHO1_하도급업체, MIN(WHEN1_시작일) AS 최초투입, MAX(WHEN2종료일) AS 최종철수, CAST(JULIANDAY(MAX(WHEN2종료일))-JULIANDAY(MIN(WHEN1_시작일)) AS INTEGER) AS 투입기간일 FROM evms WHERE WHO1_하도급업체 IS NOT NULL GROUP BY WHO1_하도급업체 ORDER BY 투입기간일 DESC"
        },
        {
            id: 'cpm_delay', label: 'CPM/공정 지연',
            keywords: ['지연', '공기', '만회', '돌관', 'CPM', '주공정', '공정지연', 'Float'],
            context: '회의의제: CPM 지연 분석 및 만회 공정\n분석 포인트:\n1. 실행률이 낮은 작업 식별 (지연 후보)\n2. 기간이 긴 작업 = 주공정 후보\n3. 만회 대책: Crashing, Fast Tracking, 공법변경\n4. SPI 기반 공기 예측',
            supportSql: "SELECT HOW3_작업명, SUM(\"WHEN3_기간(일)\") AS 총기간, AVG(\"WHEN4_실행률(%)\") AS 평균실행률, SUM(R10_합계_금액) AS 금액 FROM evms WHERE \"WHEN4_실행률(%)\" < 1 AND \"WHEN4_실행률(%)\" IS NOT NULL GROUP BY HOW3_작업명 ORDER BY 총기간 DESC LIMIT 10"
        },
        {
            id: 'evm_spi', label: 'S-Curve/EVM',
            keywords: ['SPI', 'CPI', 'S커브', '진도율', 'EVM', '기성관리', '공정수행지수', 'BCWP'],
            context: '회의의제: EVM 지수 점검 및 지연 진단\n분석 포인트:\n1. PV/AC/EV 현황 분석\n2. SPI(공정수행지수) 점검 — 1.0 미만 시 심각도 평가\n3. CPI(원가수행지수) 복합 진단\n4. TCPI 검토 및 만회 자원 투입 계획',
            supportSql: "SELECT '총예산(BAC)' AS 지표, SUM(R10_합계_금액) AS 값 FROM evms UNION ALL SELECT '획득가치(EV)', SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) FROM evms"
        },
        {
            id: 'productivity', label: '생산성',
            keywords: ['생산성', '공수', '인력', '효율', '유휴', '가동률', '장비'],
            context: '회의의제: 공종별 일일 생산성 측정\n분석 포인트:\n1. 투입 자원 대비 산출물 정량화\n2. 작업 대기/유휴 시간 분석\n3. 간섭 공종 조정 및 자원 최적화\n4. 스마트 기술 활용 전략',
            supportSql: "SELECT WHO1_하도급업체, COUNT(*) AS 작업항목수, SUM(R2_수량) AS 총수량, SUM(R10_합계_금액) AS 금액, ROUND(AVG(\"WHEN4_실행률(%)\") * 100, 1) AS 평균진행률 FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY 금액 DESC"
        }
    ];

    function matchAgenda(question) {
        var matched = [];
        MEETING_AGENDAS.forEach(function (agenda) {
            var score = 0;
            agenda.keywords.forEach(function (kw) {
                if (question.indexOf(kw) >= 0) score++;
            });
            if (score > 0) matched.push({ agenda: agenda, score: score });
        });
        matched.sort(function (a, b) { return b.score - a.score; });
        if (matched.length > 0) {
            console.log('[AI] 회의의제 매칭:', matched[0].agenda.label, '(score:', matched[0].score + ')');
            return matched[0].agenda;
        }
        return null;
    }

    // ── 2-Pass 분석용 프롬프트 및 API 호출 (Stage ③) ──────

    function buildAnalysisPrompt() {
        return '# 역할\n' +
            '당신은 건설현장 프로젝트 매니저(PM)를 보좌하는 건설사업관리(CM) 전문 컨설턴트입니다.\n' +
            '단순 데이터 나열이 아닌, **실제 현장 보고서 수준의 상세한 분석 리포트**를 작성합니다.\n' +
            '보고 대상은 현장소장 또는 PM이며, 의사결정에 직접 활용할 수 있는 수준이어야 합니다.\n\n' +

            '# 핵심 원칙\n' +
            '1. **정량적 분석**: 반드시 조회 데이터의 실제 업체명, 금액, 비율을 인용하세요.\n' +
            '2. **계산 수행**: SPI, CPI, EAC, Cost Slope 등을 직접 계산하여 수치로 제시하세요.\n' +
            '3. **실행 중심**: "열심히 한다"가 아니라, 구체적 대상/방법/투입량/비용을 정량적으로 제시하세요.\n' +
            '4. **비용-일정 트레이드오프**: 대책의 추가 비용과 지연 시 손실을 비교 분석하세요.\n' +
            '5. **데이터 근거**: 모든 주장에 데이터 출처(업체명, 금액, %)를 명시하세요.\n\n' +

            '# 분석 프레임워크 (6단계)\n\n' +

            '## 1단계: 현황 진단 (situation) — 10문장 이상\n' +
            '- 조회된 데이터에서 핵심 수치를 인용하여 현재 상황을 진단합니다.\n' +
            '- 상위/하위 3개 항목(업체/공종)을 구체적으로 언급합니다.\n' +
            '- 가능하면 SPI, CPI를 계산합니다: SPI = EV/PV, CPI = EV/AC\n' +
            '- 지연 일수, 초과 비용 등을 추정합니다.\n' +
            '- 원인을 다각도로 분석합니다 (자원, 환경, 설계, 하도급 등).\n\n' +

            '## 2단계: 전략별 대책 (strategies) — 3개 이상의 전략\n' +
            '각 전략에 대해 다음을 모두 포함합니다:\n' +
            '- **전략 제목**: [전략 1] 작업시간 연장, [전략 2] 공법변경 등\n' +
            '- **대상**: 구체적 업체명, 공종명, 자재명\n' +
            '- **실행 방안**: 무엇을 어떻게 할 것인지 구체적으로\n' +
            '- **기대 효과**: 정량적 효과 (일일 시공량 X→Y, 공기 Z일 단축 등)\n' +
            '- **추가 비용**: 원 단위로 추정 (야간수당 X원/주, 재료비 차액 등)\n\n' +

            '## 3단계: 비용-일정 트레이드오프 (tradeoff)\n' +
            '- 1일 단축 비용(Cost Slope) 산출\n' +
            '- 만회에 필요한 총 추가 비용 산출\n' +
            '- 지체상금(LD) 또는 간접비와의 비교 분석\n' +
            '- 경제성 판단 결론 (투입 vs 미투입)\n\n' +

            '## 4단계: 최종 의사결정 제안 (recommendation)\n' +
            '- 즉시 실행 사항 (이번 주)\n' +
            '- 단기 조치 (2주 내)\n' +
            '- 모니터링 계획 (일일/주간 보고 체계)\n' +
            '- 승인 요청 사항 (계약 변경, 자재 발주 등)\n\n' +

            '## 5단계: 리스크 경고 (risk)\n' +
            '- 만회 실패 시 연쇄 영향 (후속 공종, 준공일)\n' +
            '- 비용 초과 리스크\n' +
            '- 품질 저하 리스크\n\n' +

            '## 6단계: 시뮬레이션 결과 (simulation)\n' +
            '- 만회 대책 미적용 시 예상 결과\n' +
            '- 만회 대책 적용 시 예상 결과\n' +
            '- 핵심 지표 변화 예측\n\n' +

            '# CM 이론 참조\n' +
            '- EVM: BAC = 총예산, EV = 획득가치, PV = 계획가치, AC = 실투입비\n' +
            '  SPI = EV/PV (1.0 미만 = 지연), CPI = EV/AC (1.0 미만 = 초과)\n' +
            '  EAC = BAC/CPI, ETC = EAC - AC, TCPI = (BAC-EV)/(BAC-AC)\n' +
            '- CPM: 주공정 = 여유일(Float) 0인 경로, Crashing = 비용 투입으로 기간 단축\n' +
            '  Fast Tracking = 선후행 작업 병행, Cost Slope = (Crash Cost - Normal Cost)/(Normal Duration - Crash Duration)\n' +
            '- VE: Value = Function/Cost, 동일 기능 저비용 대안 검토\n' +
            '- 원가: 도급액 = 계약금, 실행액 = 실투입비, 실행율 = 실행/도급×100\n' +
            '- 지체상금: 일반적으로 계약금의 0.05~0.1%/일\n\n' +

            '# 응답 형식 (JSON)\n' +
            '반드시 아래 JSON 형식으로만 응답하세요. 각 필드를 최대한 상세하게 작성합니다.\n' +
            '```json\n' +
            '{\n' +
            '  "reportTitle": "[보고서] 분석 제목 (예: 골조공사 공기만회 대책)",\n' +
            '  "situation": "현황 진단 — 10문장 이상, 구체적 업체명/수치 인용, SPI/CPI 계산 포함",\n' +
            '  "strategies": [\n' +
            '    {\n' +
            '      "title": "[전략 1] 전략 제목",\n' +
            '      "target": "대상 업체/공종/자재",\n' +
            '      "action": "실행 방안 상세 설명",\n' +
            '      "effect": "기대 효과 (정량적)",\n' +
            '      "cost": "추가 비용 추정"\n' +
            '    }\n' +
            '  ],\n' +
            '  "tradeoff": "비용-일정 트레이드오프 분석 (Cost Slope, 총 추가비용 vs 지체상금 비교)",\n' +
            '  "recommendation": "최종 의사결정 제안 — 즉시/단기/모니터링/승인 사항",\n' +
            '  "risk": "리스크 경고 — 연쇄 영향, 비용/품질 리스크",\n' +
            '  "simulation": "만회 전/후 비교 시뮬레이션 결과"\n' +
            '}\n' +
            '```\n' +
            '⚠ strategies 배열은 반드시 3개 이상의 전략을 포함하세요.\n' +
            '⚠ 모든 수치는 데이터에서 직접 인용하고, 계산 과정을 명시하세요.\n';
    }

    function formatResultAsText(result) {
        if (!result || !result.values || result.values.length === 0) return '(데이터 없음)';
        var text = result.columns.join(' | ') + '\n';
        var maxRows = Math.min(result.values.length, 25);
        for (var i = 0; i < maxRows; i++) {
            text += result.values[i].map(function (v) {
                return v == null ? '' : (typeof v === 'number' ? formatNumber(v) : String(v));
            }).join(' | ') + '\n';
        }
        if (result.values.length > maxRows) {
            text += '... 외 ' + (result.values.length - maxRows) + '건';
        }
        return text;
    }

    async function callGeminiAnalysis(question, sqlResult, pass1, supportData) {
        if (!CONFIG.apiKey) return null;

        var analysisPrompt = buildAnalysisPrompt();

        // 데이터 요약 통계 추가
        var dataSummary = '';
        if (sqlResult.values && sqlResult.values.length > 0) {
            var numCols = sqlResult.columns.length;
            for (var ci = 0; ci < numCols; ci++) {
                var colVals = sqlResult.values.map(function (r) { return r[ci]; }).filter(function (v) { return typeof v === 'number'; });
                if (colVals.length > 0) {
                    var total = colVals.reduce(function (a, b) { return a + b; }, 0);
                    var avg = total / colVals.length;
                    var minV = Math.min.apply(null, colVals);
                    var maxV = Math.max.apply(null, colVals);
                    dataSummary += sqlResult.columns[ci] + ': 합계=' + formatNumber(Math.round(total)) +
                        ', 평균=' + formatNumber(Math.round(avg)) +
                        ', 최소=' + formatNumber(Math.round(minV)) +
                        ', 최대=' + formatNumber(Math.round(maxV)) + '\n';
                }
            }
        }

        var dataContext = '■ 사용자 질문: ' + question + '\n\n' +
            '■ 조회된 데이터 (' + sqlResult.values.length + '건):\n' +
            formatResultAsText(sqlResult) + '\n\n' +
            '■ 데이터 통계 요약:\n' + (dataSummary || '(수치 컬럼 없음)') + '\n' +
            '■ 실행된 SQL: ' + pass1.sql;

        if (pass1.title) {
            dataContext += '\n■ Pass 1 분석 제목: ' + pass1.title;
        }
        if (pass1.summary) {
            dataContext += '\n■ Pass 1 요약: ' + pass1.summary;
        }

        if (supportData && supportData.values && supportData.values.length > 0) {
            dataContext += '\n\n■ 보조 데이터 (' + supportData.values.length + '건):\n' +
                formatResultAsText(supportData);
        }

        dataContext += '\n\n■ 프로젝트 기본정보: 건설현장 EVMS 데이터(step6_evms01.csv), ' +
            '컬럼: WHO(업체), WHAT(용도), WHERE(위치), WHEN(일정), HOW(공종), R(비용)\n' +
            '■ 오늘 날짜: ' + today();

        var url = CONFIG.baseUrl + CONFIG.model + ':generateContent?key=' + CONFIG.apiKey;
        var body = {
            systemInstruction: { parts: [{ text: analysisPrompt }] },
            contents: [{ role: 'user', parts: [{ text: dataContext }] }],
            generationConfig: { temperature: 0.4, maxOutputTokens: 8192 }
        };

        try {
            console.log('[AI] Pass 2: CM 컨설팅 분석 요청 (enhanced)...');
            var resp = await fetch(url, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });

            if (!resp.ok) {
                console.error('[AI] Pass 2 HTTP error:', resp.status);
                return null;
            }

            var data = await resp.json();
            var text = '';
            if (data.candidates && data.candidates[0] && data.candidates[0].content
                && data.candidates[0].content.parts && data.candidates[0].content.parts[0]) {
                text = data.candidates[0].content.parts[0].text || '';
            }

            if (!text) return null;

            // JSON 추출
            var jsonStr = '';
            var jsonBlock = text.match(/```json\s*([\s\S]*?)```/);
            if (jsonBlock) {
                jsonStr = jsonBlock[1].trim();
            } else {
                var bs = text.indexOf('{');
                var be = text.lastIndexOf('}');
                if (bs >= 0 && be > bs) jsonStr = text.substring(bs, be + 1);
                else jsonStr = text.trim();
            }

            var parsed = JSON.parse(jsonStr);

            // 하위 호환: strategies가 없으면 recommendation에서 변환
            if (!parsed.strategies && parsed.recommendation) {
                parsed.strategies = [];
            }

            console.log('[AI] ✅ Pass 2 컨설팅 분석 완료:', Object.keys(parsed).join(', '));
            if (parsed.strategies) {
                console.log('[AI]   전략 수:', parsed.strategies.length);
            }
            return parsed;

        } catch (err) {
            console.error('[AI] Pass 2 분석 실패:', err.message);
            return null;
        }
    }

    // ── Gemini API 호출 (기존 + agendaContext) ──────────────

    async function callGeminiAPI(question, agendaContext) {
        if (!CONFIG.apiKey) return null;

        // 모델 폴백 체인 (중복 제거)
        var modelCandidates = [CONFIG.model, 'gemini-2.0-flash', 'gemini-2.0-flash-lite', 'gemini-1.5-flash'];
        var models = [];
        var seen = {};
        modelCandidates.forEach(function (m) {
            if (!seen[m]) { seen[m] = true; models.push(m); }
        });

        var lastError = null;

        for (var mi = 0; mi < models.length; mi++) {
            var modelName = models[mi];
            var url = CONFIG.baseUrl + modelName + ':generateContent?key=' + CONFIG.apiKey;

            // 대화 맥락을 포함한 contents 구성
            var contents = [];
            // 이전 대화 기록 추가
            conversationHistory.forEach(function (msg) {
                contents.push(msg);
            });
            // 현재 질문 추가
            contents.push({ role: 'user', parts: [{ text: question }] });

            console.log('[AI] Conversation context:', contents.length, 'messages (history:', conversationHistory.length, ')');

            var body = {
                systemInstruction: { parts: [{ text: (function () { var p = buildSystemPrompt(agendaContext); console.log('[AI] System prompt length:', p.length, 'chars'); return p; })() }] },
                contents: contents,
                generationConfig: {
                    temperature: CONFIG.temperature,
                    maxOutputTokens: CONFIG.maxTokens
                }
            };

            try {
                console.log('[AI] Trying model:', modelName, '(' + (mi + 1) + '/' + models.length + ')');
                var resp = await fetch(url, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify(body)
                });

                if (!resp.ok) {
                    var errText = await resp.text();
                    console.error('[AI] Model', modelName, 'HTTP', resp.status, errText.substring(0, 300));
                    lastError = modelName + ' → HTTP ' + resp.status;

                    // API 키 자체가 무효한 경우 → 다른 모델 시도해도 의미 없음, 즉시 반환
                    if (errText.indexOf('API_KEY_INVALID') >= 0 || errText.indexOf('leaked') >= 0) {
                        return { error: 'API 키가 유효하지 않습니다. Google AI Studio에서 새 키를 발급받아 주세요.' };
                    }

                    // 400(잘못된 요청), 403(권한없음), 404(모델없음), 429(할당초과) → 다른 모델 시도
                    if ((resp.status === 400 || resp.status === 403 || resp.status === 404 || resp.status === 429) && mi < models.length - 1) {
                        console.log('[AI] Retryable error (' + resp.status + '), trying next model...');
                        continue;
                    }
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
                    console.log('[AI] ✅ Default model updated to:', modelName);
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

                console.log('[AI] ✅ Parsed SQL:', parsed.sql);
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
        var matchedAgenda = null;

        // 0. 회의의제 매칭 (Stage ④)
        matchedAgenda = matchAgenda(question);
        var agendaContext = matchedAgenda ? matchedAgenda.context : null;

        // 1. Gemini API 시도 (agendaContext 전달)
        if (CONFIG.apiKey) {
            analysis = await callGeminiAPI(question, agendaContext);
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

        // 2-1. SQL 실행 에러 확인
        var summaryText = analysis.summary || '';
        if (result.error) {
            summaryText += '\n⚠ SQL 실행 오류: ' + result.error;
            console.error('[AI] SQL execution error:', result.error);
        }

        // 2-2. 실제 결과 기반 요약문 생성 (환각 방지)
        if (result.values && result.values.length > 0 && !result.error) {
            summaryText = generateResultSummary(analysis.title || '', result, analysis.summary);
        }

        // 3. 차트 타입 결정
        var chartType = recommendChart(result, analysis.chartType);

        // 3-1. KPI 자동생성 (비어있을 때)
        var kpis = analysis.kpis || [];
        if (kpis.length === 0 && result.values && result.values.length > 0) {
            kpis = generateAutoKpis(result);
        }

        // ── 4. 2-Pass 분석 모드 (Stage ③) ──
        var cmAnalysis = null;
        var queryType = analysis.queryType || 'data';

        // hybrid 또는 consulting이면 Pass 2 실행
        if (CONFIG.apiKey && (queryType === 'hybrid' || queryType === 'consulting')
            && result.values && result.values.length > 0 && !result.error) {

            // 보조 데이터: 매칭된 의제의 supportSql 실행
            var supportData = null;
            if (matchedAgenda && matchedAgenda.supportSql) {
                try {
                    supportData = executeSQL(matchedAgenda.supportSql);
                    if (supportData.error) {
                        console.warn('[AI] Support SQL error:', supportData.error);
                        supportData = null;
                    } else {
                        console.log('[AI] 보조 데이터:', supportData.values.length, '건');
                    }
                } catch (e) {
                    console.warn('[AI] Support SQL exception:', e.message);
                }
            }

            // Pass 2: CM 분석 호출
            cmAnalysis = await callGeminiAnalysis(question, result, analysis, supportData);

            if (cmAnalysis) {
                console.log('[AI] ✅ 하이브리드 분석 완료 (queryType:', queryType + ')');
            } else {
                console.warn('[AI] Pass 2 분석 실패 — 데이터만 반환');
            }
        }

        // ── 대화 기록 저장 (맥락 유지) ──
        if (CONFIG.apiKey && analysis.sql) {
            // 사용자 질문 저장
            conversationHistory.push({
                role: 'user',
                parts: [{ text: question }]
            });
            // AI 응답 요약 저장 (SQL + 결과 요약)
            var historyResponse = 'SQL: ' + analysis.sql;
            if (result.values && result.values.length > 0) {
                historyResponse += '\n결과: ' + result.values.length + '건';
                if (result.values.length <= 3) {
                    historyResponse += ' → ' + result.columns.join(', ') + ': ';
                    result.values.forEach(function (row) {
                        historyResponse += row.join(', ') + '; ';
                    });
                }
            }
            if (cmAnalysis && cmAnalysis.situation) {
                historyResponse += '\n분석: ' + cmAnalysis.situation;
            }
            conversationHistory.push({
                role: 'model',
                parts: [{ text: historyResponse }]
            });
            // 최대 기록 수 유지 (2개씩 = 1쌍)
            while (conversationHistory.length > MAX_HISTORY) {
                conversationHistory.shift();
                conversationHistory.shift();
            }
            console.log('[AI] Conversation history updated:', conversationHistory.length, 'messages');
        }

        return {
            sql: analysis.sql,
            title: analysis.title || '분석 결과',
            summary: summaryText,
            result: result,
            chartType: chartType,
            chartConfig: analysis.chartConfig || null,
            kpis: kpis,
            isPreset: analysis.isPreset || false,
            isFallback: analysis.isFallback || false,
            apiError: analysis.apiError || null,
            sqlError: result.error || null,
            queryType: queryType,
            analysis: cmAnalysis,
            matchedAgenda: matchedAgenda ? matchedAgenda.label : null,
            elapsed: Date.now() - startTime
        };
    }


    // ── 실제 결과 기반 요약문 생성 ───────────────────────

    function generateResultSummary(title, result, aiSummary) {
        var cols = result.columns;
        var vals = result.values;
        var parts = [];

        if (vals.length === 1 && cols.length <= 5) {
            // 단일 행 결과: 각 컬럼-값 표시
            cols.forEach(function (col, i) {
                var v = vals[0][i];
                if (v != null) {
                    var formatted = (typeof v === 'number') ? formatNumber(v) : String(v);
                    parts.push(col + ': ' + formatted);
                }
            });
            return '조회 결과 — ' + parts.join(' | ');
        } else if (vals.length <= 10) {
            // 소규모 결과: 첫 행 요약 + 행 수
            var firstCol = cols[0] || '';
            var lastCol = cols[cols.length - 1] || '';
            var topItem = vals[0][0];
            var topVal = vals[0][cols.length - 1];
            var topFormatted = (typeof topVal === 'number') ? formatNumber(topVal) : String(topVal || '');
            return '프로젝트 데이터에서 ' + vals.length + '건의 결과를 찾았습니다. 상위 항목: ' + topItem + ' (' + lastCol + ' ' + topFormatted + ')';
        } else {
            return '총 ' + formatNumber(vals.length) + '건의 데이터가 조회되었습니다.';
        }
    }

    // ── KPI 자동 생성 ──────────────────────────────────

    function generateAutoKpis(result) {
        var kpis = [];
        var cols = result.columns;
        var vals = result.values;
        var icons = ['fa-chart-simple', 'fa-coins', 'fa-layer-group', 'fa-percent', 'fa-building'];

        // 단일 행: 각 컬럼을 KPI로
        if (vals.length === 1 && cols.length <= 6) {
            cols.forEach(function (col, i) {
                var v = vals[0][i];
                if (v != null) {
                    var unit = '';
                    var colLower = col.toLowerCase();
                    if (colLower.indexOf('금액') >= 0 || colLower.indexOf('공사비') >= 0 || colLower.indexOf('예산') >= 0 || colLower.indexOf('노무비') >= 0 || colLower.indexOf('재료비') >= 0) unit = '원';
                    else if (colLower.indexOf('%') >= 0 || colLower.indexOf('비율') >= 0 || colLower.indexOf('실행률') >= 0) unit = '%';
                    kpis.push({ label: col, col: i, icon: icons[i % icons.length], unit: unit });
                }
            });
        } else {
            // 다중 행: 행 수 + 첫번째 숫자 컬럼 합계
            kpis.push({ label: '조회 결과', col: -1, icon: 'fa-list', unit: '건', value: vals.length });
            cols.forEach(function (col, i) {
                if (i === 0) return;
                if (typeof vals[0][i] === 'number' && kpis.length < 4) {
                    var sum = 0;
                    vals.forEach(function (row) { sum += (row[i] || 0); });
                    var unit = '';
                    var colLower = col.toLowerCase();
                    if (colLower.indexOf('금액') >= 0 || colLower.indexOf('공사비') >= 0) unit = '원';
                    kpis.push({ label: col + ' 합계', col: -1, icon: icons[kpis.length % icons.length], unit: unit, value: sum });
                }
            });
        }
        return kpis;
    }

    // ── 전역 내보내기 ────────────────────────────────────────

    // ── 관리자 키 (난독화: 문자열 뒤집기) ─────────────────
    // ⚠ git commit 시 주의
    var _AK = 'gKTvSvVg_KxDDNx6uQgdPzK7N7NTMpCBDySazIA';

    window.AIEngine = {
        processQuery: processQuery,
        setApiKey: function (key) { CONFIG.apiKey = key; },
        getApiKey: function () { return CONFIG.apiKey; },
        hasApiKey: function () { return !!CONFIG.apiKey; },
        getAdminKey: function () { try { return _AK.split('').reverse().join(''); } catch (e) { return null; } },
        getPresetCategories: function () { return PRESET_CATEGORIES; },
        clearHistory: function () { conversationHistory = []; console.log('[AI] Conversation history cleared'); },
        formatCurrency: formatCurrency,
        formatNumber: formatNumber,
        formatPercent: formatPercent,
        executeSQL: executeSQL,
        today: today,
        thisMonth: thisMonth
    };

})();

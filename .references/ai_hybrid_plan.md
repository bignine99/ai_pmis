# AI 하이브리드 분석 모드 구현 계획

> **목표**: 데이터 질의(NL2SQL)만 가능하던 AI를 **"데이터 + CM이론 + 분석적 판단"**이  
> 결합된 건설사업관리 전문 AI로 확장한다.
>
> **현재**: "동별 철근 물량?" → SQL → 숫자 결과  
> **목표**: "공정 지연 작업 분석 및 공기 만회 대책?" → SQL로 데이터 수집 → CM이론 기반 해석 → 구조화된 분석 보고서

---

## 전체 아키텍처

```
┌─────────────────────────────────────────────────────────┐
│                    사용자 질문                            │
└──────────────────────┬──────────────────────────────────┘
                       ▼
              ┌────────────────┐
              │  질문 유형 판별  │  ← ④ 회의의제 매칭
              │  (data / hybrid │
              │   / consulting) │
              └───┬────────┬───┘
           data   │        │  hybrid / consulting
                  ▼        ▼
        ┌──────────┐  ┌──────────────────────┐
        │  기존 모드  │  │   하이브리드 모드       │
        │  NL2SQL   │  │                      │
        │  → 결과    │  │  [Pass 1] SQL 생성    │  ← ①②
        └──────────┘  │  → DB 조회 → 데이터    │
                      │                      │
                      │  [Pass 2] 데이터 +     │  ← ③
                      │  CM이론 → 분석 보고서   │
                      └──────────────────────┘
```

---

## 단계 ① CM이론 프롬프트 확장

### 목표
시스템 프롬프트에 **건설사업관리 핵심 이론**을 추가하여,  
Gemini가 데이터를 해석할 때 이론적 근거를 활용하도록 한다.

### 수정 파일
- `js/ai_engine.js` → `buildSystemPrompt()`

### 추가할 CM이론 내용

```
# CM 핵심 이론 (Construction Management Theories)

## 1. EVM (Earned Value Management, 기성관리)
- PV (Planned Value, 계획가치) = 계획된 공사의 화폐적 가치
- AC (Actual Cost, 실제원가) = 실제 투입된 비용
- EV (Earned Value, 획득가치) = 완료된 공사의 화폐적 가치
- SPI (공정수행지수) = EV / PV → 1.0 미만이면 공정 지연
- CPI (원가수행지수) = EV / AC → 1.0 미만이면 원가 초과
- EAC (준공예상원가) = AC + (BAC - EV) / CPI
- ETC (잔여투입비) = EAC - AC
- 우리 DB에서의 계산:
  * BAC = SUM(R10_합계_금액)
  * EV = SUM(R10_합계_금액 * "WHEN4_실행률(%)")
  * SPI ≈ EV / (시간비율 × BAC)

## 2. CPM (Critical Path Method, 주공정법)
- 주공정: 전체 공기를 결정하는 최장 경로
- Float(여유시간): 비주공정의 지연 허용 여분
- Crashing: 자원 집중 투입으로 주공정 단축
- Fast Tracking: 선후행 작업을 중첩 수행
- 우리 DB에서의 적용:
  * WHEN1_시작일, WHEN2종료일로 기간 산출
  * "WHEN3_기간(일)"이 긴 작업 = 주공정 후보

## 3. VE (Value Engineering, 가치공학)
- 동일 기능을 낮은 비용으로 달성하는 대안 공법
- VE = 기능(Function) / 비용(Cost)
- 적용 사례: 현장타설→PC부재, OSC(탈현장시공), 모듈러

## 4. 원가관리 핵심 개념
- 도급 = 발주처가 지급하는 계약 금액
- 실행 = 실제 투입 원가 (재료비+노무비+경비)
- 실행율 = 실행원가 / 도급금액 × 100%
- 이익 = 도급 - 실행 (실행율 100% 초과 = 적자)
- 기성 = 시공 완료량에 대한 대가 청구

## 5. 만회공정 (Catch-up Schedule)
- 돌관공사(Crashing): 야간/휴일 작업, 인력 추가
- Fast Tracking: 공정 중첩, 선행 미완 상태에서 후행 착수
- 공법변경: PC, OSC, 모듈러 등 기간 단축 공법
- 자원 재배치: 비주공정 → 주공정으로 인력/장비 이동

## 6. 리스크 관리
- 물가변동(Escalation): 자재/노무비 상승 반영
- 클레임(Claim): 발주처 귀책 시 추가 비용/기간 청구
- EOT(Extension of Time): 발주처 사유 공기연장
- 지체상금(LD): 시공사 귀책 공기지연 시 발주처 배상
```

### 프롬프트 토큰 관리
- 현재 프롬프트: ~3,000자
- CM이론 추가: ~2,500자
- 동적 데이터: ~1,500자
- **총 ~7,000자** → Gemini의 입력 한도 (1M 토큰) 내 충분

### 작업 내용
1. `buildSystemPrompt()`에 CM이론 섹션 추가
2. 이론과 DB 컬럼의 연결 관계 명시
3. "이론 기반 분석" 지시문 추가

---

## 단계 ② 응답 형식 확장 (analysis 필드)

### 목표
Gemini 응답 JSON에 **`analysis`** 필드를 추가하여,  
SQL 결과만이 아닌 **이론 기반 해석 텍스트**를 함께 받는다.

### 수정 파일
- `js/ai_engine.js` → 시스템 프롬프트의 응답 형식 섹션
- `js/pages/ai_analysis.js` → Summary 탭 렌더링

### 변경 전 응답 형식
```json
{
  "sql": "SELECT ...",
  "title": "분석 제목",
  "summary": "2~3문장 요약",
  "chartType": "bar",
  "chartConfig": {},
  "kpis": []
}
```

### 변경 후 응답 형식
```json
{
  "sql": "SELECT ...",
  "title": "분석 제목",
  "summary": "데이터 요약 (2~3문장)",
  "analysis": {
    "situation": "현재 상황 진단 (데이터 기반)",
    "theory": "적용 CM이론 및 근거",
    "recommendation": "맞춤형 제안/대책",
    "risk": "리스크 요소 및 주의사항"
  },
  "chartType": "bar",
  "chartConfig": {},
  "kpis": [],
  "queryType": "data | hybrid | consulting"
}
```

### UI 변경 (Summary 탭)

```
┌─────────────────────────────────────────┐
│ 📊 데이터 요약                           │
│ "5건의 결과를 찾았습니다..."              │
├─────────────────────────────────────────┤
│ 🔍 현황 진단                             │  ← analysis.situation
│ "SPI 0.85로 공정 지연 상태입니다..."      │
├─────────────────────────────────────────┤
│ 📚 이론 근거                             │  ← analysis.theory
│ "EVM 기법에 의하면 SPI < 1.0은..."       │
├─────────────────────────────────────────┤
│ 💡 제안 및 대책                           │  ← analysis.recommendation
│ "1. 돌관공사 검토 2. 자원 재배치..."     │
├─────────────────────────────────────────┤
│ ⚠ 리스크                                │  ← analysis.risk
│ "야간 작업 시 안전사고 리스크 증가..."    │
└─────────────────────────────────────────┘
```

### 작업 내용
1. 시스템 프롬프트의 응답 형식에 `analysis` 필드 추가
2. `processQuery()` 에서 `analysis` 파싱 및 저장
3. `ai_analysis.js` → `renderSummary()` 에서 분석 섹션 렌더링
4. `style.css`에 분석 카드 스타일 추가

---

## 단계 ③ 2-Pass 분석 모드

### 목표
복잡한 질문에 대해 **1차: 데이터 수집 → 2차: 분석 해석**의  
2단계 처리를 수행한다.

### 수정 파일
- `js/ai_engine.js` → 새 함수 `callGeminiAnalysis()`
- `js/ai_engine.js` → `processQuery()` 분기 로직

### 처리 흐름

```
사용자: "공정 지연 작업 분석 및 만회 대책"

[Pass 1 — NL2SQL]
→ Gemini에 질문 전송 (기존 시스템 프롬프트)
→ 응답: {
    "sql": "SELECT HOW3_작업명, ... ORDER BY SPI ASC",
    "queryType": "hybrid"
  }
→ SQL 실행 → 결과 데이터 확보

[queryType이 "hybrid"인 경우 Pass 2 진행]

[Pass 2 — Analysis]
→ 새로운 프롬프트 구성:
  * 역할: CM 컨설턴트
  * 입력: Pass 1의 SQL 결과 데이터 (JSON)
  * 입력: 사용자 원래 질문
  * 입력: CM이론 참조
→ Gemini에 전송
→ 응답: {
    "analysis": {
      "situation": "...",
      "theory": "...",
      "recommendation": "...",
      "risk": "..."
    }
  }
→ Pass 1 결과와 병합하여 최종 응답 구성
```

### 핵심 코드 구조

```javascript
async function processQuery(question) {
    // Pass 1: NL2SQL (기존)
    var analysis = await callGeminiAPI(question);
    var result = executeSQL(analysis.sql);
    
    // queryType 판별
    if (analysis.queryType === 'hybrid' || analysis.queryType === 'consulting') {
        // Pass 2: CM 분석
        var cmAnalysis = await callGeminiAnalysis(question, result, analysis);
        analysis.analysis = cmAnalysis;
    }
    
    return { ...analysis, result: result };
}

async function callGeminiAnalysis(question, sqlResult, pass1) {
    var analysisPrompt = buildAnalysisPrompt(); // CM 컨설턴트 역할 프롬프트
    
    var dataContext = '사용자 질문: ' + question + '\n' +
        '조회된 데이터 (' + sqlResult.values.length + '건):\n' +
        formatResultAsText(sqlResult) + '\n' +
        'SQL: ' + pass1.sql;
    
    // Gemini에 분석 요청 (응답형식 = analysis JSON)
    var body = {
        systemInstruction: { parts: [{ text: analysisPrompt }] },
        contents: [{ role: 'user', parts: [{ text: dataContext }] }]
    };
    
    // ... API 호출 ...
    return parsedAnalysis;
}
```

### 분석용 프롬프트 (`buildAnalysisPrompt()`)

```
# 역할
당신은 건설사업관리(CM) 전문 컨설턴트입니다.
데이터 분석 결과를 CM이론에 근거하여 해석하고,
실무적인 대책과 리스크를 제시합니다.

# 분석 프레임워크
1. 현황 진단: 데이터가 의미하는 현장 상황
2. 이론 적용: EVM, CPM, VE 등 관련 CM이론
3. 대책 제시: 실행 가능한 구체적 조치
4. 리스크 경고: 주의해야 할 부정적 시나리오

# 응답 형식 (JSON)
{
  "situation": "현재 상황 진단 (3~5문장)",
  "theory": "적용된 CM이론 설명 (2~3문장)",
  "recommendation": "1. 첫째 대책\n2. 둘째 대책\n3. 셋째 대책",
  "risk": "리스크 요소 (2~3문장)"
}
```

### 토큰/비용 고려
- Pass 1: ~7,000 input + ~500 output = ~7,500 토큰
- Pass 2: ~3,000 input + ~1,000 output = ~4,000 토큰
- **hybrid 질문당 총 ~11,500 토큰** (Gemini Flash 무료 한도 내)
- data 질문은 기존대로 1-pass만 수행 → 추가 비용 없음

### 작업 내용
1. `buildAnalysisPrompt()` 함수 신규 작성
2. `callGeminiAnalysis()` 함수 신규 작성
3. `processQuery()` 에서 `queryType` 분기 로직 추가
4. `formatResultAsText()` 유틸리티 함수 작성
5. 로딩 UX: "데이터 수집 중..." → "분석 생성 중..." 2단계 표시

---

## 단계 ④ 회의의제 자동 매칭

### 목표
사용자 질문의 **의도를 분류**하여,  
관련 **회의의제 패턴**을 자동으로 참조 컨텍스트로 제공한다.

### 수정 파일
- `js/ai_engine.js` → 새 모듈 `MEETING_AGENDAS`
- `js/ai_engine.js` → `processQuery()` 내 매칭 로직

### 회의의제 카테고리 (12개)

| # | 카테고리 | 키워드 | 데이터 소스 |
|---|----------|--------|-------------|
| 1 | 실행율 점검 | 실행율, 원가율, 도급대비 | R10, R7~R9 |
| 2 | 투입비 분석 | 인건비, 자재비, 외주비, 장비비 | R7, R8, R9 |
| 3 | 적자 공종 | 적자, 빨간현장, 원가초과, 손실 | R10, HOW2 |
| 4 | 이익 산출 | 이익, 손익, EAC, ETC | R10, WHEN4 |
| 5 | 기성 산출 | 기성, 검측, 진도율 | WHEN4, R10 |
| 6 | 수금 관리 | 청구, 수금, 미수금, 자금 | R10 |
| 7 | 물가 변동 | 물가, 에스컬레이션, 단가 상승 | R3~R6 |
| 8 | 설계변경 | 설변, 추가물량, 누락, 정산 | R2, R10 |
| 9 | 공기 연장 | EOT, 공기지연, 간접비, 보상 | WHEN1~3 |
| 10 | CPM 분석 | 주공정, 지연, Float, 돌관 | WHEN1~3 |
| 11 | S-Curve/EVM | SPI, CPI, S커브, 진도율 | WHEN4, R10 |
| 12 | 생산성 | 생산성, 공수, 인력, 효율 | R2, WHO1 |

### 매칭 로직

```javascript
var MEETING_AGENDAS = [
    {
        id: 'execution_rate',
        label: '실행율 점검',
        keywords: ['실행율', '실행률', '원가율', '도급대비', '투입원가'],
        // 이 의제가 매칭되면 시스템 프롬프트에 추가되는 컨텍스트
        context: '이 질문은 "도급 대비 실행율 점검" 회의의제에 해당합니다.\n' +
                 '분석 포인트:\n' +
                 '1. 공종별 실행율 편차 확인 (계획 vs 실제)\n' +
                 '2. 항목별 원가 분석 (노무비, 자재비, 외주비, 장비비)\n' +
                 '3. 재시공(데나오시) 비용 별도 집계\n' +
                 '4. ETC/EAC 예측 및 만회 대책\n',
        // 자동으로 실행할 보조 SQL
        supportSqls: [
            "SELECT HOW2_대공종, SUM(R10_합계_금액) AS 도급금액, SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) AS 기성액 FROM evms GROUP BY HOW2_대공종 ORDER BY 도급금액 DESC"
        ]
    },
    {
        id: 'delay_analysis',
        label: 'CPM/공정 지연 분석',
        keywords: ['지연', '공기', '만회', '돌관', 'CPM', '주공정', '공정지연'],
        context: '이 질문은 "CPM 지연 분석 및 만회 공정" 회의의제에 해당합니다.\n' +
                 '분석 포인트:\n' +
                 '1. 실행률이 낮은 작업 식별 (지연 후보)\n' +
                 '2. 기간이 긴 작업 = 주공정 후보\n' +
                 '3. 만회 대책: Crashing, Fast Tracking, 공법변경\n' +
                 '4. SPI 기반 공기 예측\n',
        supportSqls: [
            "SELECT HOW3_작업명, SUM(\"WHEN3_기간(일)\") AS 총기간, AVG(\"WHEN4_실행률(%)\") AS 평균실행률, SUM(R10_합계_금액) AS 금액 FROM evms WHERE \"WHEN4_실행률(%)\" < 1 AND \"WHEN4_실행률(%)\" IS NOT NULL GROUP BY HOW3_작업명 ORDER BY 총기간 DESC LIMIT 10"
        ]
    },
    // ... 나머지 10개 카테고리
];

function matchAgenda(question) {
    var matched = [];
    MEETING_AGENDAS.forEach(function(agenda) {
        var score = 0;
        agenda.keywords.forEach(function(kw) {
            if (question.indexOf(kw) >= 0) score++;
        });
        if (score > 0) matched.push({ agenda: agenda, score: score });
    });
    matched.sort(function(a, b) { return b.score - a.score; });
    return matched.length > 0 ? matched[0].agenda : null;
}
```

### 통합 흐름

```
사용자: "현재 공정 지연 상태를 분석하고 만회 대책을 수립해줘"

1. matchAgenda() → "CPM/공정 지연 분석" 매칭 (keywords: 지연, 만회)

2. Pass 1 프롬프트에 agenda.context 추가
   → Gemini가 회의의제 맥락을 이해하고 정확한 SQL 생성
   → queryType: "hybrid" 반환

3. supportSqls 자동 실행 → 보조 데이터 수집
   → 지연 작업 목록, SPI 계산 등

4. Pass 2에 보조 데이터도 함께 전달
   → CM이론(CPM, EVM) 기반 분석 생성
   → Crashing/Fast Tracking 만회 대책 제시
```

### 작업 내용
1. `MEETING_AGENDAS` 배열 정의 (12개 카테고리)
2. `matchAgenda()` 키워드 매칭 함수 작성
3. `processQuery()` 에서 매칭된 의제의 context를 프롬프트에 동적 추가
4. `supportSqls` 자동 실행 및 결과 병합
5. 의제 매칭 결과를 UI에 표시 ("📋 관련 회의의제: CPM 분석")

---

## 단계별 작업 일정 및 의존성

```
단계 ①  ─────┐
(CM이론 추가)  │
              ├──── 단계 ②  ────┐
단계 ④  ─────┘  (응답형식 확장)  │
(의제 매칭)                     ├──── 단계 ③
                                │  (2-Pass 모드)
                                │
                             최종 통합 테스트
```

### 단계별 예상 소요

| 단계 | 작업 | 수정 파일 | 예상 시간 |
|------|------|-----------|-----------|
| ① | CM이론 프롬프트 추가 | ai_engine.js | 15분 |
| ② | analysis 응답 형식 + UI | ai_engine.js, ai_analysis.js, style.css | 30분 |
| ③ | 2-Pass 분석 모드 | ai_engine.js | 30분 |
| ④ | 회의의제 매칭 12종 | ai_engine.js | 30분 |
| 통합 | 테스트 및 디버깅 | 전체 | 15분 |

---

## 테스트 시나리오

### 기존 data 모드 (변경 없음)
```
Q: "동별 철근 물량?"
→ queryType: "data"
→ SQL → 결과 테이블 → 차트
```

### hybrid 모드 (신규)
```
Q: "공정 지연 작업 분석 및 공기 만회 대책을 수립해줘"
→ queryType: "hybrid"
→ Pass 1: 지연 작업 SQL → 데이터 테이블
→ Pass 2: CM이론 기반 분석
  - 현황: "SPI 0.85, 7개 작업 지연 중"
  - 이론: "CPM 기법에 의하면..."
  - 대책: "1. 본관동 작업설비부산물 돌관공사 2. ..."
  - 리스크: "야간 작업 시 안전사고 증가..."
```

### consulting 모드 (신규)
```
Q: "이 현장의 적자 공종 원인과 VE를 통한 개선 방안은?"
→ queryType: "consulting"
→ Pass 1: 실행율 초과 공종 SQL → 데이터
→ Pass 2: VE이론 기반 분석
  - 현황: "골조공사 실행율 108%, 마감공사 112%"
  - 이론: "VE(가치공학)에 의하면..."
  - 대책: "1. PC부재 전환 2. 하도급 재협상..."
  - 리스크: "품질 저하 가능성..."
```

### 의제 매칭 테스트
```
Q: "하도급별 투입비 초과 분석해줘"
→ 의제 매칭: "투입비(Cost) 항목별 상세 분석"
→ context 추가: 인건비/자재비/외주비 분석 프레임워크
→ 보조 SQL 자동 실행: 업체별 비목별 금액 집계
```

---

## 참조 문서

| 문서 | 경로 | 용도 |
|------|------|------|
| AI 프롬프트 참조 | `ai_prompt.md` | 현재 시스템 프롬프트 구조 |
| 현장 비속어 사전 | `.raw_db/현장대표비속어.txt` | 비속어 변환 (67개) |
| 건설현장 회의의제 | `.raw_db/건설현장 회의의제.txt` | 12개 의제 카테고리 원본 |

---

> **작성일**: 2026-02-18  
> **상태**: ✅ 구현 완료 (v=28)  
> **완료 내역**:  
> - ① CM이론 프롬프트: EVM, CPM, VE, 원가관리, 만회공정, 리스크 6개 이론 추가  
> - ② 응답형식 확장: analysis{situation,theory,recommendation,risk} + queryType 필드  
> - ③ 2-Pass 분석: callGeminiAnalysis() + buildAnalysisPrompt() + formatResultAsText()  
> - ④ 회의의제 매칭: 12개 카테고리(MEETING_AGENDAS) + matchAgenda() + supportSql 자동 실행  
> - UI: CM 분석 카드 4종(현황/이론/제안/리스크) + 의제 배지 + queryType 배지  
> - CSS: .ai-cm-analysis, .ai-cm-card(4색 테마), .ai-agenda-badge, .ai-query-badge  
> - 캐시: v=27 → v=28

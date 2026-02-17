# EVMS Dashboard 수정 작업 기록
**프로젝트**: `c:\Users\cho\Desktop\Temp\05 Code\260216_evms_dashborad`  
**작업일**: 2026-02-16 (일)  
**작업 시간**: 대략 15:00 ~ 21:52  

---

## 📌 캐시 방지 (중요!)
- `index.html`의 모든 `<script>` 태그에 `?v=3` 캐시 방지 파라미터 추가됨
- 변경 후 반드시 **index.html을 새로 열거나** `?v=N` 번호를 올려야 브라우저가 새 코드를 로드함
- `file://` 프로토콜에서는 `Ctrl+F5`로도 캐시가 풀리지 않을 수 있음

---

## 1. 원가관리 페이지 (`js/pages/cost.js`) 전면 재구성

### 1.1 최종 레이아웃 구조 (상단 → 하단)

```
ROW 1: [현행 집행률 게이지]     [예산 vs 실적]          [Cost Variance 바차트]
ROW 2: [비용구성 도넛]          [월 자금소요 계획]       [Top 4 중점 관리 공종]
ROW 3: [공사별 비용 도넛]       [전체 상위70% 대공종]   [건축 상위8개 대공종]
ROW 4: [토목 상위8개]           [조경 상위8개]           [기계설비 상위8개]
ROW 5: [비용 상위 15 테이블 (전체 폭)]
```

### 1.2 카드별 상세 변경 내역

#### 카드 1: 현행 집행률 (이전: 집행률)
- 제목: "집행률" → "현행 집행률"로 변경
- Canvas 게이지 차트로 AC/BAC 비율 시각화
- 스택 바 차트: 건축/토목/조경/기계설비별 예산 vs 집행 비교

#### 카드 2: 예산 vs 실적
- 실행예산 편성률 프로그레스 바
- 타겟: 85~90% 기준
- 상위 5개 공종 손익 현황 테이블 (공종명, 도급액, 실투입, 손익)

#### 카드 3: Cost Variance (CV) 바 차트 (이전: CPI 숫자 표시)
- **변경**: CPI 큰 숫자 → 월별 Cost Variance 바 차트로 교체
- 6개월 데이터: 과거 3개월 + 현재월 + 미래 2개월
- 양수(EV > AC) = 초록, 음수(EV < AC) = 빨강
- 헤더에 CPI 수치 + 상태 알림(양호/주의/경고) 컴팩트 표시
- EAC(완료시추정) 값 표시
- **차트 ID**: `cost-cv-bar`
- **CV 계산**: cmEv = cmPv * 0.92, cmAc = cmEv * 1.04, cmCv = cmEv - cmAc

#### 카드 4: 비용 구성 (재료/노무/경비) 도넛
- 기존 유지 (위치만 변경)
- **차트 ID**: `cost-composition-donut`

#### 카드 5: 월 자금 소요 계획 (신규)
- 다음 달 예정 금액 (큰 숫자, 파란색)
- 향후 3개월 월별 예정 금액 리스트
- **추가 정보 (하단)**:
  - 3개월 평균 대비 차이
  - 누적 집행 예정 (evms.ac + sum3m)
  - 잔여 예산 (evms.bac - evms.ac)
  - ℹ️ 안내문: "준공일 기준 완료 예정 작업의 합계금액으로 산출됩니다..."
- **쿼리**: `SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = 'YYYY-MM'`

#### 카드 6: Top 4 중점 관리 공종 (이전: Top 3)
- 상위 4개 대공종 표시 (이전: 3개)
- 아이콘: 🏆(파랑), 🥈(보라), 🥉(시안), ⭐(앰버)
- 개별 비율 프로그레스 바 + 전체 대비 비중

#### 카드 7: 공사별 비용 도넛 (이전: "공사구분별 비용")
- 제목: "공사구분별 비용" → "공사 별 비용"으로 변경
- **차트 ID**: `cost-const-pie`

#### 카드 8: 전체 상위 70% 주요 대공종
- 제목: "상위 70% 주요 대공종" → "전체 상위 70% 주요 대공종"
- 수평 바 차트
- **차트 ID**: `cost-trade-bar`

#### 카드 9~12: 공사구분별 상위 8개 대공종 (건축/토목/조경/기계설비)
- 각각 수평 바 차트
- **차트 ID**: `cost-arch-bar`, `cost-civil-bar`, `cost-land-bar`, `cost-mech-bar`
- 공사구분별 필터링: `getCostByTradeFiltered(prefix)` 함수 사용 (db_modules.js에 추가됨)
- 각 차트는 `filterTop8(data)` 헬퍼로 상위 8개만 표시

#### 카드 13: 비용 상위 15 테이블 (전체 폭)
- 전체 폭으로 변경 (이전: 기계설비와 2칸 분할)

### 1.3 DB 모듈 변경 (`js/db_modules.js`)

#### 추가된 함수:
```javascript
// 공사구분 필터링된 대공종 비용 조회
function getCostByTradeFiltered(constructionPrefix) {
    // HOW2_대공종 LIKE 'prefix%' 로 필터링
    // 반환: HOW2_대공종, material, labor, expense, total
    // ORDER BY total DESC
}
```

#### 수정된 exports:
```javascript
getCostByTradeFiltered: getCostByTradeFiltered
```

---

## 2. 공정관리 페이지 (`js/pages/schedule.js`) 전면 재구성

### 2.1 섹션 헤더 삭제
- `Components.createSectionHeader('공정관리', '공사 일정 및 공기 분석')` 호출 제거
- 글로벌 헤더에서 이미 페이지 제목이 표시되므로 중복 제거

### 2.2 최종 레이아웃 구조

```
ROW 1: [총 작업 건수]  [월 최대 작업]  [공사 기간]  (3단 KPI 카드)

┌─ 탭 카드 ──────────────────────────────────────────────┐
│ [마일스톤] [개략] [전체] [분기 (2026 1Q)] [주간 (2/16~22)] │
│                                                         │
│ ┌─ Gantt Chart Container ────────────────────────────┐  │
│ │ (탭에 따라 내용 변경)                                │  │
│ └────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────┘

ROW 3: [월별 작업 건수 추이]  [공종별 평균 공기]  [월별 예산 투입 추이]  (3단)
ROW 4: [공종별 일정 상세 테이블 (전체 폭)]
```

### 2.3 Gantt 차트 시스템

#### 5가지 공정표 탭:

| 탭 ID | 명칭 | Activity 기준 | 항목 수 | 특징 |
|--------|------|--------------|---------|------|
| `milestone` | 마일스톤 | Key Events | 5개 | ◆ 다이아몬드 마커, Duration=0 |
| `outline` | 개략 | HOW3_작업명 | 20개 | 바 차트 |
| `full` | 전체 | HOW3_작업명 | 50개 | 바 차트 |
| `quarter` | 분기 | HOW3_작업명 | 40개 | 현재 분기 자동 필터 |
| `week` | 주간 | HOW3_작업명 | 20개 | 현재 주간 자동 필터 |

#### buildGantt() 함수 (일반 바 차트 공정표)
- `containerId`: 렌더링할 DOM ID
- `rows`: `[{name, s(시작타임스탬프), e(종료타임스탬프), cnt}]`
- `viewStart`, `viewEnd`: 보기 범위 (분기/주간용)
- 기능:
  - 월 눈금 자동 생성
  - 🔴 오늘 마커 (빨간 세로선)
  - 바 hover 시 기간 상세 표시
  - 짝홀수 줄 교대 배경색
  - 바 안에 일수(d) 표시 (공간 충분 시)

#### buildMilestoneGantt() 함수 (마일스톤 전용) ← **오늘 완성**
- ◆ 다이아몬드 마커로 이정표 표시
- 색상 구분: 🟢 착공(start), 🔵 주요 이벤트(mid), 🔴 준공(end)
- Plan Date 컬럼 별도 표시
- 마일스톤 간 그라데이션 연결선
- 이전 마일스톤 대비 일수 자동 계산
- 범례: ◆착공 ◆주요이벤트 ◆준공 ─오늘

### 2.4 DB 모듈 변경 (`js/db_modules.js`)

#### 추가된 함수:
```javascript
// Gantt 활동 유연 조회
function getGanttActivities(groupBy, limit, dateWhere) {
    // groupBy: 'HOW3_작업명', 'HOW2_대공종', 'HOW1_공사' 등
    // limit: 최대 항목 수
    // dateWhere: 날짜 필터 조건 (분기/주간용)
    // 반환: {columns, values} - [groupBy값, MIN(시작일), MAX(종료일), COUNT]
}

// 프로젝트 마일스톤 자동 도출
function getProjectMilestones() {
    // 5개 마일스톤을 DB에서 자동 도출:
    // 1. 착공 (Notice to Proceed) - MIN(WHEN1_시작일)
    // 2. 토공사 완료 (Earthwork Finish) - MAX(종료일) WHERE 토공/흙막이/기초
    // 3. 골조 상량 (Top Out) - MAX(종료일) WHERE 철근콘크리트/골조/콘크리트/철골
    // 4. 수전 및 시운전 (Commissioning) - MAX(종료일) WHERE 기계/전기/설비/배관/덕트
    // 5. 사용승인 및 준공 (Handover) - MAX(WHEN2종료일)
    // 반환: [{name, date, type('start'|'mid'|'end')}]
    // 중복 날짜 자동 제거
}
```

#### 수정된 exports:
```javascript
getGanttActivities: getGanttActivities,
getProjectMilestones: getProjectMilestones
```

### 2.5 헬퍼 함수 (schedule.js 내)
```javascript
// 날짜 문자열 → 타임스탬프
function parseDate(str) { ... }

// DB 쿼리 결과 → Gantt 데이터 배열 변환
function queryToGantt(result, nameIdx) {
    // result.values에서 [name, startDate, endDate, count] 추출
    // parseDate()로 타임스탬프 변환
    // 반환: [{name, s, e, cnt}]
}
```

---

## 3. 변경된 파일 목록

| 파일 | 변경 유형 | 주요 내용 |
|------|----------|----------|
| `index.html` | 수정 | 스크립트 `?v=3` 캐시 방지 파라미터 추가 |
| `js/db_modules.js` | 수정 | `getCostByTradeFiltered`, `getGanttActivities`, `getProjectMilestones` 함수 추가 |
| `js/pages/cost.js` | 대규모 수정 | 전체 레이아웃 재구성 (13개 카드), CV 차트, 월 자금소요, Top4 카드 추가 |
| `js/pages/schedule.js` | 전체 재작성 | Gantt 차트 시스템 (5탭), 마일스톤 렌더러, KPI 3단 배치 |
| `css/style.css` | 변경 없음 | - |
| `js/app.js` | 변경 없음 | - |
| `js/components.js` | 변경 없음 | - |

---

## 4. 알려진 이슈 및 주의사항

### 4.1 EVMS 데이터 시뮬레이션
- `calculateEvmsMetrics()`에서 EV, AC는 시뮬레이션 값 사용:
  - `EV = PV * 0.92`
  - `AC = EV * 1.04`
- Cost Variance 차트의 월별 CV도 동일 시뮬레이션 로직 사용
- 실제 EV/AC 데이터가 별도로 존재하면 교체 필요

### 4.2 브라우저 캐시
- `file://` 프로토콜은 캐시가 매우 강력함
- 반드시 `?v=N` 번호를 올리거나 새 탭에서 열어야 반영됨
- 현재 버전: `?v=3`

### 4.3 공정표 데이터 의존성
- 모든 Gantt 차트는 `WHEN1_시작일`, `WHEN2종료일` 컬럼에 의존
- NULL이거나 빈 문자열인 행은 자동 제외
- 날짜 형식: `YYYY-MM-DD` (ISO 8601)

---

## 5. ~~⏭️ 내일 작업 계획 (TODO)~~ → ✅ 2/17 완료

### 5.1 ✅ 개략 공정표 수정 (완료)
- **변경 전**: `HOW3_작업명` 기준 20개 항목을 단순 바 차트로 표시
- **변경 후**: 건설 실무형 공정표로 전면 재구성
  - ✅ `HOW1_공사` 구분별 **색상 그룹핑** (아이콘 + 컬러 팔레트)
  - ✅ **그룹 헤더**: 공사 구분별 아이콘, 작업 수, 기간, 비용 합계
  - ✅ 바 차트에 **진행률 표시** (오늘 기준 경과 비율, 색상 점 인디케이터)
  - ✅ **비용 비중 미니바** (각 작업의 비용 비중 시각화)
  - ✅ 계층적 구조: `HOW1_공사 > HOW3_작업명` 계층 표시

### 5.2 ✅ 나머지 공정표 수정 (완료)
- ✅ **전체 공정표** (50개): 동일 건설 실무형 스타일 적용
- ✅ **분기 공정표** (40개): 현재 분기 자동 필터 + 건설 실무형 스타일
- ✅ **주간 공정표** (20개): 현재 주간 자동 필터 + 건설 실무형 스타일

### 5.3 ✅ 기타 미완료 작업 (완료)
- ✅ 물량관리, 조직관리, EVMS, 생산성관리 4개 페이지 **섹션 헤더 삭제**
- ✅ KPI 카드 3단 → **4단** 변경 (공기 진행률 KPI, 공사기간 KPI 추가)

---

## 6. 2026-02-17 작업 상세

### 6.1 `js/db_modules.js` 변경
#### 추가된 함수:
```javascript
// 계층적 Gantt 데이터 조회 (개략/전체/분기/주간용)
function getHierarchicalGantt(limit, dateWhere) {
    // HOW1_공사, HOW3_작업명 기준 GROUP BY
    // 진행률(progress) 자동 계산: 오늘 기준 경과 비율
    // 반환: [{group, name, startDate, endDate, count, totalCost, progress}]
}
```

### 6.2 `js/pages/schedule.js` 전면 재작성
#### 핵심 변경:
- `buildGantt()` → `buildConstructionGantt()` 로 교체
  - 공사 구분별 색상 팔레트 (`GROUP_COLORS` 객체)
  - 그룹 헤더 행 (아이콘, 작업 수, 기간, 비용)
  - 진행률 바 (배경 바 + 진행률 채움)
  - 비용 비중 미니바 컬럼
  - 진행 상태 색상 점 (완료=초록, 진행중=파랑, 초기=노랑, 미착수=회색)
- KPI 카드 3단 → 4단 변경
  - 기존: 총 작업 건수, 월 최대 작업, 공사 기간
  - 추가: **공기 진행률** (프로그레스 바 + 경과/잔여일 표시)
  - 추가: **공사 기간** (시작일~종료일 표시)
- 개략/전체/분기/주간 모두 `buildConstructionGantt()` 사용
- 마일스톤은 기존 `buildMilestoneGantt()` 유지

### 6.3 섹션 헤더 삭제 (4개 페이지)
| 파일 | 삭제된 코드 |
|------|-----------|
| `quantity.js` | `Components.createSectionHeader('물량관리', ...)` |
| `organization.js` | `Components.createSectionHeader('조직관리', ...)` |
| `evms.js` | `Components.createSectionHeader('기성/진도관리 (EVMS)', ...)` |
| `productivity.js` | `Components.createSectionHeader('생산성관리', ...)` |

### 6.4 캐시 방지 업데이트
- `index.html`: `?v=3` → `?v=4` (모든 스크립트 태그)

---

## 7. 프로젝트 구조 참고

```
260216_evms_dashborad/
├── index.html              ← 메인 HTML (스크립트 로드, ?v=4)
├── css/style.css           ← 글로벌 스타일
├── js/
│   ├── app.js              ← SPA 라우터 + Components (createChart, createCardHeader 등)
│   ├── db_modules.js       ← SQLite 쿼리 모듈 ★ getHierarchicalGantt 추가
│   ├── components.js       ← (미사용, app.js에 통합됨)
│   └── pages/
│       ├── overview.js     ← 프로젝트 개요 페이지
│       ├── cost.js         ← 원가관리 페이지 (2/16 수정)
│       ├── schedule.js     ← 공정관리 페이지 ★ 2/17 건설 실무형 전면 재작성
│       ├── quantity.js     ← 물량관리 페이지 (2/17 섹션 헤더 삭제)
│       ├── organization.js ← 조직관리 페이지 (2/17 섹션 헤더 삭제)
│       ├── evms.js         ← 기성/진도 (EVMS) 페이지 (2/17 섹션 헤더 삭제)
│       └── productivity.js ← 생산성관리 페이지 (2/17 섹션 헤더 삭제)
└── output/
    └── project_db.sqlite   ← SQLite DB 파일
```

---

*최초 작성: 2026-02-16 21:52 KST*  
*업데이트: 2026-02-17 10:40 KST*

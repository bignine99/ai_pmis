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
*업데이트: 2026-02-18 21:47 KST*

---

## 8. 2026-02-18 작업 상세

### 8.1 AI 엔진 로직 개선 (`js/ai_engine.js`)

#### 8.1.1 데이터 정렬 로직 수정 (smartFallback)
- **문제**: 동(동별)/층(층별) 데이터가 금액순(DESC)으로 정렬되어 가독성 저하
- **해결**: 차원 컬럼(동/층/월)과 속성 컬럼(업체/공종)을 구분하여 정렬 방식 분리
  - **차원 컬럼**: `ORDER BY WHERE2_동, WHERE3_층` (자연 순서)
  - **속성 컬럼**: `ORDER BY 합계금액 DESC` (금액순)
- **복합 그룹핑**: `동별+층별` 복합 감지 추가 (`GROUP BY WHERE2_동, WHERE3_층`)

#### 8.1.2 분기/월 날짜 범위 수정
- **문제**: "이번 분기" 쿼리가 Q2(4~6월)로 잘못 매핑
- **해결**: 동적 날짜 함수 연결
  - `"이번 분기"` → `thisQuarterRange()` (현재: 2026 Q1 = 1~3월)
  - `"다음 분기"` → `nextQuarterRange()`
  - `"이번 달"` → `thisMonth()`
  - `"다음 달"` → `nextMonth()`
- **규칙 강화**: 기성액(진행률) 계산 시 반드시 `WHEN2종료일` 기준 필터링

#### 8.1.3 System Prompt 업데이트
- ★★ ORDER BY 규칙 ★★ 추가 (규칙 #20)
- 분기/월 동적 날짜 매핑 추가 (규칙 #10, #11)
- 기성액 계산 규칙 강화 (규칙 #12)

### 8.2 AI 채팅 결과 저장 및 복원 (`js/pages/ai_analysis.js`)

#### 8.2.1 결과 스냅샷 저장
- AI 응답 시 `currentResult`를 `msg.extra.resultSnapshot`에 자동 저장
- `saveChatState()`로 sessionStorage에 영속화

#### 8.2.2 채팅 버블 클릭 → 결과 복원
- AI 메시지 버블을 클릭하면 해당 시점의 결과(차트, 테이블, KPI)를 캔버스에 재로드
- 선택된 메시지에 `.selected` 시각 강조
- 클릭 힌트 텍스트 표시: "💡 클릭하면 이 결과를 다시 볼 수 있습니다"

### 8.3 AI Report 인쇄 기능 (`js/pages/ai_report.js`)
- 주간 보고서에 인쇄/PDF 버튼 추가
- AI 자동 생성 코멘트 섹션 추가

### 8.4 위험 알림 배지 (`js/app.js`)
- 사이드바 네비게이션에 동적 위험 알림 배지 추가
  - **진도관리(EVMS)**: SPI < 0.8 고위험 작업 수
  - **AI Report**: 지연 작업 수
- 배지 빨간색 펄스 애니메이션

### 8.5 7가지 UI/UX 프리미엄 개선

#### ① 사이드바 3D 회전 큐브
- **초기**: 프로젝트 정보 헤더 (이름, 기간, 진행률 프로그레스바)
- **최종**: 3D 회전 데이터 큐브 (WHO/WHEN/WHERE/WHAT/HOW/WHY)
- 큐브 크기: 40×40px, 컨테이너 80px
- 15초/1회전, hover 시 5초 가속
- 배경: `var(--bg-sidebar)` → 라이트/다크 모두 자연스러운 테마 대응
- 하단에 "AI Data Cube" 라벨 텍스트

#### ② AI 채팅 타이핑 애니메이션
- 메시지 전송 시 `•••` 블링킹 인디케이터 표시 (`showTypingIndicator()`)
- 응답 수신 후 페이드아웃 제거 (`removeTypingIndicator()`)
- 모든 메시지에 `messageAppear` 슬라이드업 애니메이션

#### ③ Data Grid 테이블 개선
- **Zebra striping**: 짝수행 배경색 (라이트:`rgba(59,130,246,0.02)`, 다크:`0.04`)
- **Row hover**: 왼쪽 파란 보더 + 배경 하이라이트
- **숫자 셀 분류**: `num-cell`(우측정렬, tabular-nums), `currency-cell`(파란색, 볼드)
- **정렬 헤더**: hover 시 accent 색상 전환

#### ④ AI Report 탭 인디케이터
- CSS 클래스 `.rpt-tab-dot` / `.generated` 준비
- 생성 완료: 초록색 + 글로우 / 미완료: 회색
- 탭 전환 시 `fadeSlideUp` 애니메이션

#### ⑤ KPI 카운트업 애니메이션
- `window.animateCountUp(element, targetValue, duration, suffix)` 전역 함수
- easeOutQuart 커브, 기본 800ms
- 완료 후 `countupFlash` 효과 (accent → inherit 페이드)
- 금액(원/억/만) 값은 포맷팅 복잡성으로 카운트업 제외

#### ⑥ 차트 툴팁 커스터마이징
- 다크 배경 (`rgba(15,23,42,0.95)`)
- 확대 폰트, 색상 박스, 큰 패딩
- `afterLabel` 콜백: **"전체 대비 XX%"** 비율 자동 계산 표시

#### ⑦ 다크모드 정교화
- AI 버블: `rgba(30,41,59,0.95)` + 서브틀 보더
- 유저 메시지: 블루 그라데이션 (`#1e40af → #1d4ed8`)
- 카드/KPI: `rgba(71,85,105,0.3)` 보더 + 미세 글로우
- 테이블: 다크 헤더, 서브틀 보더
- 큐브 영역: 테마 자동 대응

### 8.6 변경된 파일 목록

| 파일 | 변경 사항 |
|------|----------|
| `css/style.css` | +270줄 UI/UX 개선 CSS (큐브, 타이핑, 그리드, 탭, 카운트업, 툴팁, 다크모드) |
| `index.html` | 사이드바 3D 큐브 HTML, CSS 버전 v32 |
| `js/app.js` | 위험 알림 배지, `animateCountUp()` 전역 함수 |
| `js/ai_engine.js` | ORDER BY 로직, 날짜 범위 수정, System Prompt 업데이트 |
| `js/pages/ai_analysis.js` | 타이핑 인디케이터, 결과 스냅샷, 데이터 셀 클래스, KPI 카운트업, 차트 툴팁 |
| `js/pages/ai_report.js` | 인쇄 버튼, AI 코멘트 섹션 |

### 8.7 캐시 방지 업데이트
- `index.html`: CSS `?v=32` (이전: v29 이하)

---

## 9. 프로젝트 구조 최신 (2026-02-18 기준)

```
260216_evms_dashborad/
├── index.html              ← 메인 HTML (CSS v32, 사이드바 3D 큐브)
├── css/style.css           ← 글로벌 스타일 ★ UI/UX 개선 CSS 270줄 추가
├── js/
│   ├── app.js              ← SPA 라우터 + 위험배지 + animateCountUp
│   ├── ai_engine.js        ← AI SQL 엔진 ★ 정렬/날짜/프롬프트 수정
│   ├── db_modules.js       ← SQLite 쿼리 모듈
│   ├── components.js       ← (미사용, app.js에 통합됨)
│   └── pages/
│       ├── overview.js     ← 프로젝트 개요
│       ├── cost.js         ← 원가관리 (2/16)
│       ├── schedule.js     ← 공정관리 (2/17)
│       ├── quantity.js     ← 물량관리
│       ├── organization.js ← 조직관리
│       ├── evms.js         ← 기성/진도 (EVMS)
│       ├── productivity.js ← 생산성관리
│       ├── ai_analysis.js  ← AI 분석 채팅 ★ 2/18 타이핑/카운트업/툴팁
│       ├── ai_report.js    ← AI 리포트 ★ 2/18 인쇄/코멘트
│       └── cube_view.js    ← 큐브 뷰 (피벗 테이블)
├── .references/
│   └── modification_processes.md ← 이 파일
└── output/
    └── project_db.sqlite   ← SQLite DB
```

---

*최초 작성: 2026-02-16 21:52 KST*  
*업데이트: 2026-02-17 10:40 KST*  
*업데이트: 2026-02-18 21:47 KST*  
*업데이트: 2026-02-19 19:07 KST*

---

## 10. 2026-02-19 작업 상세

### 10.1 랜딩 페이지 전면 개편

#### 10.1.1 동적 배경 애니메이션 (`js/landing_bg.js` — **신규 파일**)

회사 홈페이지([ninetynine99.co.kr](https://www.ninetynine99.co.kr/))의 시각 기술을 분석하여 3가지를 결합 적용:

| 기술 | 설명 |
|------|------|
| **Data Flow** | 파티클 간 반투명 연결선 (120px 이내) |
| **Wave Pulse** | 사인파 곡선 3줄 (굵은/보통/얇은 차별화) |
| **Floating Particles** | 70개 브랜드 컬러 파티클 (맥동 효과) |

**파라미터 최종값:**
- 파티클: 70개, 크기 0.5~10px, 속도 vx 1.1 / vy 0.85
- 웨이브: 3줄, 굵기 3.5px / 2.0px / 0.7px, 속도 0.006~0.014
- 연결선: 거리 120px 이내, alpha 0.2, lineWidth 0.8
- 캔버스 opacity: 0.85

**성능 최적화:**
- 랜딩 페이지 숨김 시 `cancelAnimationFrame`으로 자동 중단
- 다시 표시 시 `init()` + `animate()` 재개
- MutationObserver로 `style` 속성 변경 감지

#### 10.1.2 Stats 카운터 섹션 (신규)
```html
[10] 분석 모듈  |  [6] 차원 데이터 (5W1H)  |  [300+] 분석 지표·차트  |  [₩0] 서버 비용
```
- Intersection Observer로 뷰포트 진입 시 0에서 목표값까지 카운트업 애니메이션
- easeOutCubic 커브, 1800ms 지속시간
- 그라데이션 텍스트 (파란→시안)

#### 10.1.3 How it Works 3-Step 섹션 (신규)
```
STEP 01          →          STEP 02          →          STEP 03
DB 파일 로드              AI 큐브 자동 변환         대시보드 즉시 사용
```
- 그라데이션 아이콘 (64×64px, border-radius 20px)
- 화살표 구분자, 모바일에서 세로 배치 + 화살표 90° 회전

#### 10.1.4 Dashboard Preview 섹션 (신규)
- macOS 스타일 윈도우 프레임 (빨/노/초 트래픽 라이트)
- 좌측 사이드바 Mock: 10개 메뉴 항목 (프로젝트 개요~AI Report)
- 우측 메인 영역:
  - KPI 카드 4개 (공정률 72.3%, SPI 0.94, CPI 1.02, EAC ₩187억)
  - 차트 Mock: 바 차트 (CSS var `--h`로 높이 지정) + 라인 차트 (SVG mask)

#### 10.1.5 스크롤 Reveal 애니메이션
- `.landing-reveal` 클래스: 초기 `opacity:0; translateY(40px)`
- Intersection Observer (threshold 0.15, root: `#landing-page`)
- 진입 시 `.revealed` 클래스 추가 → `opacity:1; translateY(0)` 전환
- 적용 섹션: API Key, Pipeline, Features, Tech Stack, CTA + 신규 3개

#### 10.1.6 푸터 버전 뱃지 업데이트
- `v3.1 · Last Updated 2026.02.19` 뱃지 추가
- `.landing-footer-version`: pill 형태, 배경 `#F0F0F2`

#### 10.1.7 배경 점(모눈) 패턴 삭제
- **삭제**: `radial-gradient(circle, #d2d2d7 1px, transparent 1px)` + `background-size: 32px 32px`
- **변경**: 단색 배경 `background: #FBFBFD`

### 10.2 파이프라인 다이어그램 글래스모피즘

#### 10.2.1 감싸는 카드 (`.pipeline-diagram`)
- **이전**: `background: linear-gradient(180deg, #f5f5f7 0%, #ffffff 50%, #f5f5f7 100%)`
- **이후**: `background: rgba(245, 245, 247, 0.1)` + `backdrop-filter: blur(4px)` + `border: rgba(232, 232, 237, 0.25)`

#### 10.2.2 개별 노드 (`.pipeline-node`)
- **이전**: `background: #fff` (불투명)
- **이후**: `background: rgba(255, 255, 255, 0.2)` + `backdrop-filter: blur(10px)` + `border: rgba(210, 210, 215, 0.25)`

→ 배경 파티클/웨이브가 카드를 통해 비쳐 보이는 효과

### 10.3 EVMS 데이터 통합 (`step7_evms_04`)

#### 10.3.1 신규 파일
- `.raw_db/step7_evms_04.csv` — EVMS 4차 데이터
- `.raw_db/csv_to_sqlite_v4.py` — v4 DB 변환 스크립트

#### 10.3.2 EVMS 페이지 수정 (`js/pages/evms.js`)
- step7 데이터의 새로운 컬럼 매핑 반영

### 10.4 공정관리 페이지 수정 (`js/pages/schedule.js`)

#### 10.4.1 주간 공정표 필터 수정
- **문제**: 주간 공정표가 날짜 필터링 없이 전체 데이터를 표시
- **해결**: `WHEN1_시작일`/`WHEN2종료일`로 현재 주간 범위 필터링 적용

### 10.5 네비게이션 개선 (`js/app.js`)

#### 10.5.1 항상 프로젝트 개요로 시작
- 랜딩 페이지에서 "대시보드 시작" 클릭 시 항상 `#/overview`로 이동
- DB 이미 로드된 상태에서 재진입 시에도 `window.location.hash = '#/overview'`
- 두 경로 모두 프로젝트 개요가 첫 화면

### 10.6 Program Spec 섹션 업데이트 (`index.html`)
- Frontend: `HTML5 / CSS3 / JavaScript (ES6)` → `HTML5 / CSS3 / Vanilla JS`
- Backend: `SQL.js (SQLite in Browser)` 유지
- AI Engine: `Google Gemini 2.0 Flash` → `Gemini 2.0 Flash`
- Deployment: `GitHub Pages (Static)` → `Vercel (Static Hosting)`

### 10.7 Vercel 배포

- **배포 URL**: `https://ai-pmis.vercel.app/`
- **Git 저장소**: `bignine99/ai_pmis` (GitHub)
- **배포 방식**: Vercel 자동 배포 (Git Push → 자동 빌드)
- **회사 홈페이지 연결**: 기존 네이버 클라우드 서버 홈페이지에 링크 버튼 추가 방식 권장

### 10.8 Git 커밋 기록
```
[main f58ff3d] Landing page: dynamic bg animation, glassmorphism pipeline, 
stats counter, how-it-works, dashboard preview, scroll reveal, 
Program Spec update, version badge, always start at overview

9 files changed, 10,492 insertions(+), 75 deletions(-)
 create mode 100644 .raw_db/csv_to_sqlite_v4.py
 create mode 100644 .raw_db/step7_evms_04.csv
 create mode 100644 js/landing_bg.js
```

### 10.9 변경된 파일 목록

| 파일 | 변경 유형 | 주요 내용 |
|------|----------|----------|
| `css/style.css` | 대규모 수정 | 글래스모피즘, 스크롤 reveal, Stats/How/Preview/Footer 신규 CSS (+350줄), 모눈 패턴 삭제 |
| `index.html` | 대규모 수정 | 새 섹션 3개 (Stats, How, Preview), 동적 배경 캔버스, Program Spec 수정, 푸터 버전 뱃지, landing-reveal 클래스, CSS v52 |
| `js/landing_bg.js` | **신규** | 파티클/웨이브/연결선 배경 애니메이션 + 스크롤 Reveal Observer + 카운트업 애니메이션 |
| `js/app.js` | 수정 | 항상 `#/overview`로 시작 (2곳) |
| `js/org_charts.js` | 수정 | 조직도 관련 수정 반영 |
| `js/pages/evms.js` | 수정 | step7 데이터 매핑 |
| `js/pages/schedule.js` | 수정 | 주간 공정표 필터 수정 |
| `.raw_db/csv_to_sqlite_v4.py` | **신규** | DB v4 변환 스크립트 |
| `.raw_db/step7_evms_04.csv` | **신규** | EVMS 4차 데이터 |

### 10.10 캐시 방지 업데이트
- `index.html`: CSS `?v=52`, `landing_bg.js ?v=5` (이전: 없음)

---

## 11. 프로젝트 구조 최신 (2026-02-19 기준)

```
260216_evms_dashborad/
├── index.html              ← 메인 HTML (CSS v52, 랜딩 전면 개편)
├── css/style.css           ← 글로벌 스타일 ★ 글래스모피즘/Reveal/신규 섹션 CSS
├── js/
│   ├── app.js              ← SPA 라우터 + 위험배지 + animateCountUp ★ 항상 overview 시작
│   ├── ai_engine.js        ← AI SQL 엔진
│   ├── db_modules.js       ← SQLite 쿼리 모듈
│   ├── landing_bg.js       ← ★ 신규: 동적 배경 + 스크롤 Reveal + 카운트업
│   ├── org_charts.js       ← 조직도 차트
│   ├── components.js       ← (미사용, app.js에 통합됨)
│   └── pages/
│       ├── overview.js     ← 프로젝트 개요
│       ├── cost.js         ← 원가관리 (2/16)
│       ├── schedule.js     ← 공정관리 ★ 주간 필터 수정
│       ├── quantity.js     ← 물량관리
│       ├── organization.js ← 조직관리
│       ├── evms.js         ← 기성/진도 (EVMS) ★ step7 데이터
│       ├── productivity.js ← 생산성관리
│       ├── ai_analysis.js  ← AI 분석 채팅
│       ├── ai_report.js    ← AI 리포트
│       └── cube_view.js    ← 큐브 뷰 (피벗 테이블)
├── .raw_db/
│   ├── csv_to_sqlite_v4.py ← ★ 신규: DB v4 변환 스크립트
│   └── step7_evms_04.csv   ← ★ 신규: EVMS 4차 데이터
├── .references/
│   └── modification_processes.md ← 이 파일
└── output/
    └── project_db_v3.sqlite ← SQLite DB (v3)
```


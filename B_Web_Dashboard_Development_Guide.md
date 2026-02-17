# EVMS 웹 대시보드 개발 가이드 (Detailed Version 2.0)

이 문서는 `step6_evms01.csv`에서 파생된 SQLite 데이터베이스(`project_db.sqlite`)를 활용하여 종합 건설사업관리 시스템을 구축하기 위한 **상세 기술 명세서**입니다. 관리 분야별(원가/공정/수량/EV)로 필요한 **핵심 기능(Function)** 과 이를 구현하기 위한 **SQL 쿼리**를 구체적으로 정의합니다.

---

## 🏗️ 개발 환경 및 아키텍처

*   **Database:** `output/project_db.sqlite` (SQLite WASM 연동)
*   **Frontend:** HTML5, Bootstrap 5, Chart.js, sql.js
*   **Folder Structure:**
    *   `index.html` (메인 대시보드)
    *   `js/app.js` (어플리케이션 로직)
    *   `js/db_modules.js` (SQL 쿼리 함수 모음 - **핵심**)
    *   `css/style.css` (스타일)

---

## � 관리 분야별 핵심 함수 및 SQL 명세 (Core Logic)

다음 함수들은 자바스크립트(`db_modules.js`) 내에 구현되어야 하며, AI 챗봇이 Function Calling을 통해 호출할 수도 있습니다.

### � A. 원가관리 (Cost Management)

1.  **`get_cost_summary(level)`**
    *   **설명:** 전체 공사비를 지정된 레벨(동, 공종, 업체)로 집계.
    *   **SQL Template:**
        ```sql
        SELECT {level}, SUM(R10_합계_금액) as amount 
        FROM evms 
        GROUP BY {level} 
        ORDER BY amount DESC;
        ```
    *   **활용:** "동별 공사비 보여줘", "업체별 도급액 순위 알려줘"

2.  **`get_top_n_items(n)`**
    *   **설명:** 가장 비싼 상위 N개 아이템 추출. (Pareto Analysis)
    *   **SQL Template:**
        ```sql
        SELECT WHERE2_동, HOW3_작업명, HOW4_품명, R10_합계_금액 
        FROM evms 
        ORDER BY R10_합계_금액 DESC 
        LIMIT {n};
        ```

### 📐 B. 수량관리 (Quantity Management)

3.  **`get_material_quantity(keyword)`**
    *   **설명:** 특정 자재(품명)의 총 물량을 층별로 집계.
    *   **SQL Template:**
        ```sql
        SELECT WHERE3_층, SUM(R2_수량) as qty, R1_단위 
        FROM evms 
        WHERE HOW4_품명 LIKE '%{keyword}%' 
        GROUP BY WHERE3_층;
        ```
    *   **활용:** "층별 철근콘크리트 물량표 보여줘", "레미콘 총 물량은?"

### 📅 C. 공정관리 (Schedule Management)

4.  **`get_monthly_schedule(year, month)`**
    *   **설명:** 해당 월에 진행(Start~End 사이)되는 작업 목록 조회.
    *   **SQL Template:**
        ```sql
        SELECT HOW3_작업명, WHEN1_시작일, WHEN2종료일 
        FROM evms 
        WHERE WHEN1_시작일 <= '{year}-{month}-31' 
          AND WHEN2종료일 >= '{year}-{month}-01'
        ORDER BY WHEN1_시작일;
        ```

5.  **`get_schedule_progress(cutoff_date)`**
    *   **설명:** 특정일 기준 완료되었어야 할 작업(PV)의 진행률 계산. (S-Curve 기초 데이터)

### 📈 D. EVMS (Earned Value) 지표

6.  **`calculate_evms_metrics(cutoff_date)`**
    *   **설명:** 계획(PV) 대비 실적(EV) 분석. (현재 실적 데이터는 없으므로 시뮬레이션 지원 필요)
    *   **Logic:**
        *   **PV (Planned Value):** `cutoff_date` 이전에 종료된 모든 작업의 금액 합계.
        *   **BAC (Total Budget):** 전체 공사비 `SELECT SUM(R10_합계_금액)`.
        *   **Planned %:** PV / BAC * 100.

---

## 🤖 AI 챗봇 및 Function Calling 구현 가이드

사용자가 자연어 질문을 입력하면, 시스템은 아래 3단계로 처리합니다.

1.  **Intent Classification (의도 파악):**
    *   Prompt: "사용자의 질문이 원가, 공정, 수량 중 무엇에 관한 것인가?"
2.  **SQL Generation (Text-to-SQL):**
    *   Prompt: "다음 테이블 스키마를 참고하여 질문에 답하는 SQLite Query를 작성하라."
    *   Schema Hint:
        *   `WHERE2_동`: 건물 (본관동, 주차장)
        *   `HOW2_대공종`: 공종 (A03_철근콘크리트공사...)
        *   `R10_합계_금액`: 금액 (Cost)
3.  **Execution & Response:**
    *   JS에서 `sql.js`로 쿼리 실행 → 결과 JSON을 LLM에게 전달 → "친절한 문장"으로 변환하여 출력.

### � 개발 시나리오 (To-Do)

1.  **Step 7 스크립트 실행:** `step7_create_db.py`를 실행하여 최신 `evms01.csv`가 반영된 DB 파일을 생성합니다.
2.  **HTML 태그 구성:** 상단 탭(Tabs)과 하단 컨텐츠 영역(Divs)을 구성합니다.
3.  **JS 함수 구현:** 위에서 정의한 `get_cost_summary` 등의 함수를 `db_modules.js`에 작성합니다.
4.  **UI 바인딩:** 버튼 클릭 시 해당 JS 함수가 호출되고, 결과를 테이블(`<table>`)이나 차트(`<canvas>`)에 뿌려줍니다.

이 가이드를 따르면 복잡한 EVMS 시스템도 체계적으로 구축할 수 있습니다.

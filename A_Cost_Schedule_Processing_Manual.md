# 건설 공정-내역 통합 데이터 처리 매뉴얼 (Detailed Version 2.0)

이 문서는 건설 프로젝트의 내역서(Cost)와 공정표(Schedule)를 통합하여 EVMS 데이터베이스를 구축하기 위한 **상세 데이터 전처리 가이드**입니다. 각 단계별로 **실제 사용된 파이썬 스크립트(.py)** 와 **참조 문서(.md)** 를 명시하여, 향후 동일한 작업 수행 시 LLM이 코드를 즉시 참조하고 재현할 수 있도록 합니다.

---

## 📂 프로젝트 파일 구조 및 참조 맵 (Reference Map)

작업 시작 전, 아래 파일들이 해당 경로에 존재하는지 확인하십시오.

| 단계 (Step) | 작업 내용 | 실행 스크립트 (Source Code) | 로직 문서 (Logic Doc) | 결과물 (Output) |
|:---:|:---|:---|:---|:---|
| **Step 3** | 건축 내역 동/층별 분할 | `step3_floor_split.py` | `a_floor_split_logic.md` (가정) | `step3_arch_split.csv` |
| **Step 4** | 전 공종 통합 | `step4_integrate.py` | `b_integration_logic.md` (가정) | `step4_floor_cost_schedule.csv` |
| **Step 5** | 표준 분류 적용 | `step5_standardize.py` | `e_standardize.md` | `step5_standardized_cost_schedule.csv` |
| **Step 6** | 하도급업체 배정 | `step6_assign_subcontractor.py` | (본 문서 참조) | `step6_evms01.csv` |
| **Step 7** | DB 파일 생성 | `step7_create_db.py` | `B_Web_Dashboard...md` | `project_db.sqlite` |

> **Tip:** LLM에게 작업을 지시할 때, "Step 5 작업을 수행해줘. 상세 로직은 `step5_standardize.py`와 `e_standardize.md`를 참고해." 라고 구체적으로 명시하십시오.

---

## ⚙️ 상세 처리 로직 (Detailed Processing Logic)

### Step 5: 표준 분류 체계 적용 (Standardization)
*   **참조 파일:**
    *   **Code:** `step5_standardize.py` (핵심 함수: `make_activity_name`, 매핑 딕셔너리 `FIELD_MAP`, `FACILITY_MAP`)
    *   **Doc:** `e_standardize.md` (표준 코드 정의서)
*   **주요 로직:**
    1.  **Code Mapping:**
        *   `WHERE1_프로젝트`: 입력값 유지
        *   `HOW1_공사`: `FIELD_MAP`을 사용하여 '건축'→`A`, '토목'→`B` 등으로 변환.
        *   `WHERE2_동`: `FACILITY_MAP`을 사용하여 '본관동', '주차장' 등을 표준 명칭으로 통일.
    2.  **대공종(Major Trade) 정제:**
        *   숫자 접두어 제거 (`re` 모듈 사용 권장): "01. 가설공사" → "가설공사".
        *   `TRADE_MAP`을 통해 표준 코드(A01, B01...) 부여.
        *   유사 공종 통합: 기계설비의 경우 `step5_standardize.py` 내의 `MECH_TRADE_MAP`을 참조하여 다수의 유사 명칭을 표준 대공종 하나로 매핑.
    3.  **작업명(Activity Name) 생성:**
        *   `{시설명} {층} {대공종명}` 형식으로 유니크한 작업명 생성.

### Step 6: 하도급업체 배정 (Subcontractor Assigning)
*   **참조 파일:**
    *   **Code:** `step6_assign_subcontractor.py`
*   **핵심 로직 (Python Dictionary & Function):**
    1.  **Dictionary Lookup:** `SUBCONTRACTOR_MAP` 딕셔너리를 사용하여 `HOW2_대공종` 코드를 업체명으로 변환.
    2.  **Conditional Logic (조건부 로직):**
        *   `A03_철근콘크리트공사`는 단순 매핑 불가. `classify_a03(item_name)` 함수를 사용하여 `HOW4_품명` 내 키워드('철근', '레미콘')를 검색, 3개 업체('(주)동성철근', '천마시멘트(주)', '(주)거창')로 분기 처리.
    3.  **Default Value:** 매핑되지 않는 항목은 `DEFAULT_COMPANY` (금빛건설)로 할당.

### Step 7: DBMS 최적화 (Optimization)
*   **참조 파일:**
    *   **Code:** `step7_create_db.py`
*   **목적:** 웹 대시보드 성능 향상을 위해 CSV를 SQLite로 변환.
*   **Schema:** 모든 컬럼을 `TEXT` 또는 `REAL`(숫자) 타입으로 저장.
*   **Indexing:** `WHERE2_동`, `HOW2_대공종`, `WHO1_하도급업체`, `WHEN1_시작일` 컬럼에 대해 반드시 Index(`CREATE INDEX`)를 생성하여 조회 속도 확보.

---

## 📊 데이터 정합성 검증 (Validation Checkpoints)

각 스텝 완료 후 다음 사항을 반드시 검증하십시오.

1.  **Row Count Check:** Step 4 → 5 → 6 진행 간 전체 행(Row) 수가 변하지 않아야 함. (약 7,891행 유지)
2.  **Sum Check:** `R10_합계_금액`의 총합이 원본 엑셀 파일의, 총 공사비와 일치하는지 확인.
3.  **Null Check:** `WHO1_하도급업체` 컬럼에 빈 값(Null)이 없는지 확인. (기본값 채우기 로직 작동 확인)
4.  **Encoding:** 한글 깨짐 방지를 위해 파일 입출력 시 `encoding='utf-8-sig'` 옵션 필수 사용.

이 매뉴얼은 데이터 처리 단계의 **재현성(Reproducibility)** 을 보장하기 위해 작성되었습니다.

/**
 * ============================================================
 * 공용 UI 컴포넌트 (Shared Components)
 * ============================================================
 * 
 * 역할: 여러 페이지에서 반복 사용되는 UI 요소들을 함수로 만들어 재사용합니다.
 * - KPI 카드, 데이터 테이블, 차트, 필터 등
 */

/**
 * 숫자를 한국 원화(₩) 형식으로 변환합니다.
 * 예: 1234567 → "₩1,234,567"
 */
export function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '-';
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency',
        currency: 'KRW',
        maximumFractionDigits: 0
    }).format(amount);
}

/**
 * 숫자를 콤마 형식으로 변환합니다.
 * 예: 1234567.89 → "1,234,567.89"
 */
export function formatNumber(num, decimals = 0) {
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('ko-KR', {
        minimumFractionDigits: decimals,
        maximumFractionDigits: decimals
    });
}

/**
 * KPI 카드 HTML을 생성합니다.
 * @param {string} title - 카드 제목 (예: "총 예산")
 * @param {string} value - 표시할 값 (예: "₩24,933,576,239")
 * @param {string} icon - Font Awesome 아이콘 클래스 (예: "fa-won-sign")
 * @param {string} color - 테마 색상 ('blue','green','amber','rose','purple')
 */
export function createKPICard(title, value, icon = 'fa-chart-bar', color = 'blue') {
    const colorMap = {
        blue: { bg: 'rgba(59,130,246,0.1)', text: '#3b82f6' },
        green: { bg: 'rgba(16,185,129,0.1)', text: '#10b981' },
        amber: { bg: 'rgba(245,158,11,0.1)', text: '#f59e0b' },
        rose: { bg: 'rgba(239,68,68,0.1)', text: '#ef4444' },
        purple: { bg: 'rgba(139,92,246,0.1)', text: '#8b5cf6' },
        cyan: { bg: 'rgba(6,182,212,0.1)', text: '#06b6d4' },
    };
    const c = colorMap[color] || colorMap.blue;

    return `
    <div class="glass-card stat-card p-4">
        <div class="d-flex justify-content-between align-items-start">
            <div>
                <div class="stat-title">${title}</div>
                <div class="stat-value" style="background:linear-gradient(135deg,${c.text},${c.text}cc);-webkit-background-clip:text;-webkit-text-fill-color:transparent;">${value}</div>
            </div>
            <div class="rounded-3 d-flex align-items-center justify-content-center" style="width:48px;height:48px;background:${c.bg}">
                <i class="fa-solid ${icon}" style="color:${c.text};font-size:1.25rem;"></i>
            </div>
        </div>
    </div>`;
}

/**
 * 데이터 테이블 HTML을 생성합니다.
 * @param {Array<string>} columns - 열 이름 배열
 * @param {Array<Array>} rows - 2차원 행 데이터 배열
 * @param {Object} options - { id, maxRows, formatColumns }
 */
export function createDataTable(columns, rows, options = {}) {
    const { id = 'data-table', maxRows = 50 } = options;
    const displayRows = rows.slice(0, maxRows);

    let html = `<div class="table-responsive"><table class="table table-hover align-middle" id="${id}">`;

    // 헤더
    html += '<thead><tr>';
    columns.forEach((col, i) => {
        html += `<th class="small fw-semibold text-muted">${col}</th>`;
    });
    html += '</tr></thead>';

    // 바디
    html += '<tbody>';
    displayRows.forEach(row => {
        html += '<tr>';
        row.forEach(cell => {
            html += `<td class="small">${cell !== null && cell !== undefined ? cell : '-'}</td>`;
        });
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    if (rows.length > maxRows) {
        html += `<p class="text-muted small mt-2">전체 ${rows.length}건 중 상위 ${maxRows}건 표시</p>`;
    }

    return html;
}

/**
 * 섹션 헤더 HTML을 생성합니다.
 * @param {string} title - 페이지 제목
 * @param {string} subtitle - 부제목
 */
export function createSectionHeader(title, subtitle = '') {
    return `
    <div class="mb-4">
        <h3 class="fw-bold mb-1">${title}</h3>
        ${subtitle ? `<p class="text-muted mb-0">${subtitle}</p>` : ''}
    </div>`;
}

/**
 * 탭 네비게이션을 생성합니다.
 * @param {Array<{id, label}>} tabs - 탭 정의 배열
 * @param {Function} onTabChange - 탭 변경 시 콜백(id)
 */
export function createTabs(tabs, containerId = 'tab-container') {
    let html = `<ul class="nav nav-pills mb-4" id="${containerId}">`;
    tabs.forEach((tab, i) => {
        html += `<li class="nav-item">
            <button class="nav-link tab-pill ${i === 0 ? 'active' : ''}" data-tab-id="${tab.id}">${tab.label}</button>
        </li>`;
    });
    html += '</ul>';
    return html;
}

/**
 * Chart.js 차트를 생성하는 헬퍼 함수
 * @param {string} canvasId - canvas 요소의 ID
 * @param {string} type - 차트 유형 ('bar','doughnut','line','pie','radar')
 * @param {Object} data - Chart.js 데이터 객체
 * @param {Object} extraOptions - 추가 옵션
 * @returns {Chart} Chart.js 인스턴스
 */
export function createChart(canvasId, type, data, extraOptions = {}) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return null;

    // 기존 차트가 있으면 제거
    const existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    const defaultOptions = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: {
                labels: {
                    color: getComputedStyle(document.documentElement).getPropertyValue('--text-muted').trim() || '#94a3b8',
                    font: { family: 'Inter', size: 11 }
                }
            },
            tooltip: {
                backgroundColor: 'rgba(15,23,42,0.9)',
                titleFont: { family: 'Inter' },
                bodyFont: { family: 'Inter' },
                cornerRadius: 8,
                padding: 12,
            }
        },
        scales: {}
    };

    // bar와 line 차트에만 axes 추가
    if (type === 'bar' || type === 'line') {
        defaultOptions.scales = {
            x: {
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148,163,184,0.1)' }
            },
            y: {
                ticks: { color: '#94a3b8', font: { size: 10 } },
                grid: { color: 'rgba(148,163,184,0.1)' }
            }
        };
    }

    const mergedOptions = { ...defaultOptions, ...extraOptions };
    if (extraOptions.plugins) {
        mergedOptions.plugins = { ...defaultOptions.plugins, ...extraOptions.plugins };
    }
    if (extraOptions.scales) {
        mergedOptions.scales = { ...defaultOptions.scales, ...extraOptions.scales };
    }

    return new Chart(canvas, { type, data, options: mergedOptions });
}

/**
 * 미리 정의된 차트 색상 팔레트
 */
export const CHART_COLORS = [
    'rgba(59, 130, 246, 0.85)',   // Blue
    'rgba(16, 185, 129, 0.85)',   // Green
    'rgba(245, 158, 11, 0.85)',   // Amber
    'rgba(239, 68, 68, 0.85)',    // Rose
    'rgba(139, 92, 246, 0.85)',   // Purple
    'rgba(6, 182, 212, 0.85)',    // Cyan
    'rgba(236, 72, 153, 0.85)',   // Pink
    'rgba(34, 197, 94, 0.85)',    // Emerald
    'rgba(249, 115, 22, 0.85)',   // Orange
    'rgba(168, 85, 247, 0.85)',   // Violet
    'rgba(20, 184, 166, 0.85)',   // Teal
    'rgba(251, 191, 36, 0.85)',   // Yellow
];

export const CHART_COLORS_LIGHT = CHART_COLORS.map(c => c.replace('0.85', '0.15'));

/**
 * 로딩 스피너를 표시합니다.
 */
export function showLoading() {
    return `<div class="d-flex justify-content-center align-items-center py-5">
        <div class="spinner-border text-primary" role="status">
            <span class="visually-hidden">Loading...</span>
        </div>
    </div>`;
}

/**
 * 에러 메시지를 표시합니다.
 */
export function showError(message) {
    return `<div class="alert alert-danger d-flex align-items-center" role="alert">
        <i class="fa-solid fa-circle-exclamation me-2"></i>${message}
    </div>`;
}

/**
 * DB 미연결 시 안내 메시지
 */
export function showDbNotReady() {
    return `<div class="text-center py-5">
        <i class="fa-solid fa-database fa-3x text-muted mb-3"></i>
        <h5 class="text-muted">Database Not Connected</h5>
        <p class="text-muted small">output/project_db.sqlite 파일을 확인해 주세요.</p>
    </div>`;
}

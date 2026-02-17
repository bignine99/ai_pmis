/**
 * ============================================================
 * Main Application (메인 앱) — KPI Skill 기반 리디자인
 * ============================================================
 * 역할: 
 * 1. sql.js로 SQLite DB를 로드
 * 2. SPA 라우터에 7개 페이지를 등록
 * 3. 테마(다크/라이트) 전환 관리
 * 4. 사이드바 토글 관리
 */

// ─── 앱 초기화 ──────────────────────────────────────────

(async function main() {
    console.log('[APP] Starting EVMS Dashboard...');

    var contentArea = document.getElementById('content-area');
    var loadingScreen = document.getElementById('loading-screen');

    // == 안전장치: 15초 이상 로딩되면 강제 해제 ==
    var loadingTimeout = setTimeout(function () {
        console.warn('[APP] Loading timeout! Force-hiding loading screen.');
        hideLoading();
        if (contentArea) {
            contentArea.innerHTML =
                '<div class="text-center py-5">' +
                '<i class="fa-solid fa-triangle-exclamation fa-3x mb-3" style="color:var(--warning)"></i>' +
                '<h4 style="color:var(--text-primary)">로딩 시간 초과</h4>' +
                '<p style="color:var(--text-secondary)">데이터베이스 로드에 실패했습니다.</p>' +
                '<p style="color:var(--text-muted)" class="small">F12 키를 눌러 Console 탭에서 오류를 확인해 주세요.</p>' +
                '</div>';
        }
    }, 15000);

    function hideLoading() {
        if (loadingScreen) {
            loadingScreen.style.opacity = '0';
            setTimeout(function () { loadingScreen.style.display = 'none'; }, 300);
        }
    }

    try {
        // 1. 데이터베이스 초기화
        console.log('[APP] Step 1: Initializing database...');
        var dbLoaded = await DB.initDatabase('output/project_db_v3.sqlite');
        clearTimeout(loadingTimeout);

        if (!dbLoaded) {
            console.error('[APP] Database load returned false.');
            hideLoading();
            contentArea.innerHTML =
                '<div class="text-center py-5">' +
                '<i class="fa-solid fa-database fa-3x mb-3" style="color:var(--text-muted)"></i>' +
                '<h4 style="color:var(--text-primary)">Database Load Failed</h4>' +
                '<p style="color:var(--text-secondary)">output/project_db.sqlite 파일을 확인해 주세요.</p>' +
                '</div>';
            return;
        }

        console.log('[APP] Step 2: DB loaded OK. Setting up routes...');

        // 2. SPA 라우터
        var routes = {
            '/overview': renderOverviewPage,
            '/cost': renderCostPage,
            '/schedule': renderSchedulePage,
            '/quantity': renderQuantityPage,
            '/organization': renderOrganizationPage,
            '/evms': renderEvmsPage,
            '/productivity': renderProductivityPage,
            '/ai': renderAiAnalysisPage,
            '/cube': renderCubeViewPage
        };

        function handleRoute() {
            var hash = window.location.hash.slice(1) || '/overview';
            console.log('[APP] Navigating to:', hash);
            var renderFn = routes[hash] || routes['/overview'];

            contentArea.style.opacity = '0';
            contentArea.style.transform = 'translateY(10px)';

            setTimeout(function () {
                try {
                    if (renderFn) renderFn(contentArea);
                } catch (err) {
                    console.error('[APP] Page render error:', err);
                    contentArea.innerHTML = Components.showError('페이지 렌더링 오류: ' + err.message);
                }
                updateActiveNav(hash);
                // Update page title in global header
                var pgNames = { '/overview': '프로젝트 개요', '/cost': '원가관리', '/schedule': '공정관리', '/quantity': '자재관리', '/organization': '조직관리', '/evms': '진도관리', '/productivity': '생산성관리', '/ai': 'AI Analysis', '/cube': 'CUBE View' };
                var pgEl = document.getElementById('gh-page-name');
                if (pgEl) pgEl.textContent = pgNames[hash] || '프로젝트 개요';
                contentArea.style.transition = 'opacity 0.4s ease, transform 0.4s ease';
                contentArea.style.opacity = '1';
                contentArea.style.transform = 'translateY(0)';
                // Trigger count-up animation on KPI values
                setTimeout(function () {
                    if (typeof animateCountUp === 'function') animateCountUp();
                }, 100);
            }, 150);
        }

        function updateActiveNav(path) {
            document.querySelectorAll('.nav-link[data-section]').forEach(function (link) {
                link.classList.remove('active');
                if ('/' + link.getAttribute('data-section') === path) {
                    link.classList.add('active');
                }
            });
        }

        window.addEventListener('hashchange', handleRoute);

        // 3. 글로벌 헤더 렌더링
        try {
            console.log('[APP] Rendering global header...');
            renderGlobalHeader();
            console.log('[APP] Global header rendered OK');
        } catch (hErr) {
            console.error('[APP] Global header error:', hErr);
        }

        // 4. 로딩 완료 → 초기 페이지 렌더링
        console.log('[APP] Step 3: Hiding loading screen, rendering first page...');
        hideLoading();
        handleRoute();

        // 4. 사이드바 네비게이션 이벤트
        document.querySelectorAll('.nav-link[data-section]').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var section = link.getAttribute('data-section');
                window.location.hash = '/' + section;
            });
        });

        // 5. 테마 토글
        var themeToggle = document.getElementById('theme-toggle');
        if (themeToggle) {
            var savedTheme = localStorage.getItem('evms-theme') || 'light';
            document.documentElement.setAttribute('data-theme', savedTheme);
            updateThemeIcon(savedTheme);

            themeToggle.addEventListener('click', function () {
                var current = document.documentElement.getAttribute('data-theme');
                var next = current === 'dark' ? 'light' : 'dark';
                document.documentElement.setAttribute('data-theme', next);
                localStorage.setItem('evms-theme', next);
                updateThemeIcon(next);
            });
        }

        // 6. 사이드바 모바일 토글
        var sidebarToggle = document.getElementById('sidebar-toggle');
        var sidebar = document.getElementById('sidebar');
        if (sidebarToggle && sidebar) {
            sidebarToggle.addEventListener('click', function () {
                sidebar.classList.toggle('show');
            });
            document.querySelectorAll('.nav-link[data-section]').forEach(function (link) {
                link.addEventListener('click', function () {
                    if (window.innerWidth < 992) sidebar.classList.remove('show');
                });
            });
        }

        console.log('[APP] ✅ Dashboard ready!');

    } catch (error) {
        clearTimeout(loadingTimeout);
        console.error('[APP] Fatal error during init:', error);
        hideLoading();
        if (contentArea) {
            contentArea.innerHTML =
                '<div class="text-center py-5">' +
                '<i class="fa-solid fa-bug fa-3x mb-3" style="color:var(--danger)"></i>' +
                '<h4 style="color:var(--text-primary)">Initialization Error</h4>' +
                '<p style="color:var(--text-secondary)">' + error.message + '</p>' +
                '</div>';
        }
    }
})();

function updateThemeIcon(theme) {
    var icon = document.querySelector('#theme-toggle i');
    if (icon) {
        icon.className = theme === 'dark' ? 'fa-solid fa-sun' : 'fa-solid fa-moon';
    }
}

// ─── Components 함수들 (KPI Skill 기반) ──────────────────

function formatCurrency(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '-';
    if (Math.abs(amount) >= 1e8) return (amount / 1e8).toFixed(1) + '억원';
    if (Math.abs(amount) >= 1e4) return (amount / 1e4).toFixed(0) + '만원';
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency', currency: 'KRW', maximumFractionDigits: 0
    }).format(amount);
}

function formatCurrencyFull(amount) {
    if (amount === null || amount === undefined || isNaN(amount)) return '-';
    return new Intl.NumberFormat('ko-KR', {
        style: 'currency', currency: 'KRW', maximumFractionDigits: 0
    }).format(amount);
}

function formatNumber(num, decimals) {
    decimals = decimals || 0;
    if (num === null || num === undefined || isNaN(num)) return '-';
    return Number(num).toLocaleString('ko-KR', {
        minimumFractionDigits: decimals, maximumFractionDigits: decimals
    });
}

/**
 * KPI Card (Skill: 5-7개 이내, 트렌드 표시, 의미있는 색상)
 */
function createKPICard(title, value, icon, accent, trend, trendDir) {
    icon = icon || 'fa-chart-bar';
    accent = accent || 'blue';
    var trendHtml = '';
    if (trend) {
        trendDir = trendDir || 'neutral';
        trendHtml = '<div class="kpi-trend ' + trendDir + '">' + trend + '</div>';
    }
    return '<div class="kpi-card kpi-accent-' + accent + '">' +
        '<div class="d-flex justify-content-between align-items-start">' +
        '<div style="min-width:0;flex:1">' +
        '<div class="kpi-label">' + title + '</div>' +
        '<div class="kpi-value">' + value + '</div>' +
        trendHtml +
        '</div>' +
        '<div class="kpi-icon"><i class="fa-solid ' + icon + '"></i></div>' +
        '</div>' +
        '</div>';
}

function createDataTable(columns, rows, options) {
    options = options || {};
    var id = options.id || 'data-table';
    var maxRows = options.maxRows || 50;
    var displayRows = rows.slice(0, maxRows);
    var html = '<div class="table-responsive"><table class="table table-hover align-middle mb-0" id="' + id + '">';
    html += '<thead><tr>';
    columns.forEach(function (col) { html += '<th>' + col + '</th>'; });
    html += '</tr></thead><tbody>';
    displayRows.forEach(function (row) {
        html += '<tr>';
        row.forEach(function (cell) { html += '<td>' + (cell !== null && cell !== undefined ? cell : '-') + '</td>'; });
        html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (rows.length > maxRows) html += '<p style="color:var(--text-muted)" class="small mt-2">' + rows.length + '건 중 상위 ' + maxRows + '건 표시</p>';
    return html;
}

function createSectionHeader(title, subtitle) {
    subtitle = subtitle || '';
    return '<div class="section-header"><h3>' + title + '</h3>' +
        (subtitle ? '<p>' + subtitle + '</p>' : '') + '</div>';
}

function createCardHeader(title, iconClass) {
    iconClass = iconClass || '';
    return '<div class="card-header-row"><h6>' +
        (iconClass ? '<i class="fa-solid ' + iconClass + '"></i>' : '') +
        title + '</h6></div>';
}

function createAlertBanner(message, level) {
    level = level || 'info';
    var icons = { success: 'fa-circle-check', warning: 'fa-triangle-exclamation', danger: 'fa-circle-xmark', info: 'fa-circle-info' };
    return '<div class="alert-banner alert-' + level + '">' +
        '<i class="fa-solid ' + (icons[level] || icons.info) + '"></i>' +
        '<span>' + message + '</span></div>';
}

function createTabs(tabs, containerId) {
    containerId = containerId || 'tab-container';
    var html = '<ul class="nav nav-pills mb-4" id="' + containerId + '">';
    tabs.forEach(function (tab, i) {
        html += '<li class="nav-item"><button class="nav-link tab-pill ' + (i === 0 ? 'active' : '') + '" data-tab-id="' + tab.id + '">' + tab.label + '</button></li>';
    });
    html += '</ul>';
    return html;
}

function createChart(canvasId, type, data, extraOptions) {
    extraOptions = extraOptions || {};
    var canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn('[Chart] Canvas not found:', canvasId); return null; }
    var existingChart = Chart.getChart(canvas);
    if (existingChart) existingChart.destroy();

    var gridColor = '#F1F5F9';
    var tickColor = '#64748B';
    var defaultOpts = {
        responsive: true, maintainAspectRatio: false,
        animation: { duration: 800, easing: 'easeOutQuart' },
        plugins: {
            legend: { labels: { color: tickColor, font: { family: 'Noto Sans KR', size: 11, weight: '500' }, usePointStyle: true, pointStyle: 'circle', padding: 16 } },
            tooltip: {
                backgroundColor: '#FFFFFF',
                titleColor: '#0F172A',
                bodyColor: '#475569',
                titleFont: { family: 'Noto Sans KR', weight: '700', size: 12 },
                bodyFont: { family: 'Noto Sans KR', size: 11 },
                cornerRadius: 8, padding: 12,
                borderColor: '#E2E8F0', borderWidth: 1,
                displayColors: true,
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
            }
        },
        scales: {}
    };
    if (type === 'bar' || type === 'line') {
        defaultOpts.scales = {
            x: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor, drawBorder: false } },
            y: { ticks: { color: tickColor, font: { size: 10 } }, grid: { color: gridColor, drawBorder: false }, beginAtZero: true }
        };
    }
    var merged = Object.assign({}, defaultOpts, extraOptions);
    if (extraOptions.plugins) merged.plugins = Object.assign({}, defaultOpts.plugins, extraOptions.plugins);
    if (extraOptions.scales) merged.scales = Object.assign({}, defaultOpts.scales, extraOptions.scales);
    return new Chart(canvas, { type: type, data: data, options: merged });
}

var CHART_COLORS = [
    '#3B82F6', '#10B981', '#F59E0B',
    '#F43F5E', '#8B5CF6', '#0EA5E9',
    '#F97316', '#06B6D4', '#6366F1',
    '#EC4899', '#84CC16', '#A855F7'
];
var CHART_COLORS_LIGHT = [
    'rgba(59,130,246,0.12)', 'rgba(16,185,129,0.12)', 'rgba(245,158,11,0.12)',
    'rgba(244,63,94,0.12)', 'rgba(139,92,246,0.12)', 'rgba(14,165,233,0.12)',
    'rgba(249,115,22,0.12)', 'rgba(6,182,212,0.12)', 'rgba(99,102,241,0.12)',
    'rgba(236,72,153,0.12)', 'rgba(132,204,22,0.12)', 'rgba(168,85,247,0.12)'
];

function showLoading() {
    return '<div class="d-flex justify-content-center py-5"><div class="loading-spinner"></div></div>';
}
function showError(msg) {
    return '<div class="alert-banner alert-danger"><i class="fa-solid fa-circle-xmark"></i><span>' + msg + '</span></div>';
}
function showDbNotReady() {
    return '<div class="text-center py-5"><i class="fa-solid fa-database fa-3x mb-3 d-block" style="color:var(--text-muted)"></i>' +
        '<h5 style="color:var(--text-secondary)">Database Not Connected</h5>' +
        '<p style="color:var(--text-muted)" class="small">output/project_db.sqlite 파일을 확인해 주세요.</p></div>';
}

/**
 * Count-up animation for KPI values
 */
function animateCountUp() {
    var elements = document.querySelectorAll('.kpi-value');
    elements.forEach(function (el) {
        var text = el.textContent || '';
        var match = text.match(/([^0-9]*?)([-+]?[0-9][0-9,]*\.?[0-9]*)(.*$)/);
        if (!match) return;
        var prefix = match[1];
        var numStr = match[2].replace(/,/g, '');
        var suffix = match[3];
        var target = parseFloat(numStr);
        if (isNaN(target) || target === 0) return;
        var isDecimal = numStr.indexOf('.') >= 0;
        var decimals = isDecimal ? (numStr.split('.')[1] || '').length : 0;
        var duration = 1200;
        var startTime = null;
        el.textContent = prefix + '0' + suffix;
        function step(ts) {
            if (!startTime) startTime = ts;
            var progress = Math.min((ts - startTime) / duration, 1);
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = target * eased;
            if (isDecimal) {
                el.textContent = prefix + current.toFixed(decimals).replace(/\B(?=(\d{3})+(?!\d))/g, ',') + suffix;
            } else {
                el.textContent = prefix + Math.floor(current).toLocaleString('ko-KR') + suffix;
            }
            if (progress < 1) window.requestAnimationFrame(step);
        }
        window.requestAnimationFrame(step);
    });
}

/**
 * SVG Gauge Chart — Data Visualization Architect Skill
 * For Progress / SPI display. Not a pie chart!
 * @param {object} opts - { value, max, label, unit, color, size }
 * @returns {string} HTML
 */
function createGauge(opts) {
    var value = opts.value || 0;
    var max = opts.max || 100;
    var label = opts.label || '';
    var unit = opts.unit || '%';
    var color = opts.color || 'var(--accent-bright)';
    var size = opts.size || 120;
    var trackColor = opts.trackColor || 'rgba(148,163,184,0.08)';
    var strokeWidth = opts.strokeWidth || 8;
    var radius = (size - strokeWidth) / 2;
    var circumference = 2 * Math.PI * radius;
    var percent = Math.min(value / max, 1);
    var offset = circumference * (1 - percent);
    var displayVal = typeof opts.displayValue !== 'undefined' ? opts.displayValue : value;

    return '<div class="gauge-container" style="width:' + size + 'px;height:' + size + 'px">' +
        '<svg width="' + size + '" height="' + size + '" viewBox="0 0 ' + size + ' ' + size + '">' +
        '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" ' +
        'fill="none" stroke="' + trackColor + '" stroke-width="' + strokeWidth + '"/>' +
        '<circle cx="' + (size / 2) + '" cy="' + (size / 2) + '" r="' + radius + '" ' +
        'fill="none" stroke="' + color + '" stroke-width="' + strokeWidth + '" ' +
        'stroke-dasharray="' + circumference + '" stroke-dashoffset="' + offset + '" ' +
        'stroke-linecap="round" style="transition:stroke-dashoffset 1.2s cubic-bezier(0.4,0,0.2,1);' +
        'filter:drop-shadow(0 0 4px ' + color + ')"/>' +
        '</svg>' +
        '<div class="gauge-value" style="color:' + color + '">' + displayVal + '<span style="font-size:0.55em;opacity:0.7">' + unit + '</span></div>' +
        (label ? '<div class="gauge-label">' + label + '</div>' : '') +
        '</div>';
}

/**
 * Bullet Graph — Plan vs Actual comparison
 * @param {object} opts - { actual, plan, max, label, color }
 * @returns {string} HTML
 */
function createBulletGraph(opts) {
    var actual = opts.actual || 0;
    var plan = opts.plan || 100;
    var max = opts.max || Math.max(plan * 1.2, actual * 1.2);
    var label = opts.label || '';
    var color = opts.color || 'var(--accent)';
    var actualPct = (actual / max * 100).toFixed(1);
    var planPct = (plan / max * 100).toFixed(1);

    return '<div style="margin-bottom:10px">' +
        (label ? '<div style="font-size:0.72rem;color:var(--text-secondary);margin-bottom:4px;display:flex;justify-content:space-between">' +
            '<span>' + label + '</span>' +
            '<span style="font-family:var(--font-mono);font-weight:600;color:var(--text-primary)">' +
            actual.toLocaleString('ko-KR') + ' / ' + plan.toLocaleString('ko-KR') + '</span></div>' : '') +
        '<div class="bullet-graph">' +
        '<div class="bullet-range" style="width:100%;background:' + color + '"></div>' +
        '<div class="bullet-actual" style="width:' + actualPct + '%;background:' + color + '"></div>' +
        '<div class="bullet-target" style="left:' + planPct + '%"></div>' +
        '</div></div>';
}

/**
 * Area Chart with gradient fill — Data Visualization Architect Skill
 * Stacked area with gradient fill fading to transparent at bottom + dashed forecast line
 */
function createAreaGradientChart(canvasId, labels, datasets, extraOptions) {
    extraOptions = extraOptions || {};
    var canvas = document.getElementById(canvasId);
    if (!canvas) { console.warn('[Chart] Canvas not found:', canvasId); return null; }

    // Create gradient fills after canvas is in DOM
    var ctx = canvas.getContext('2d');
    var processedDatasets = datasets.map(function (ds, i) {
        var baseColor = ds.borderColor || CHART_COLORS[i % CHART_COLORS.length];
        // Create gradient fill
        var gradient = ctx.createLinearGradient(0, 0, 0, canvas.parentElement ? canvas.parentElement.clientHeight || 300 : 300);
        var rgb = baseColor.match(/\d+/g);
        if (rgb && rgb.length >= 3) {
            gradient.addColorStop(0, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.25)');
            gradient.addColorStop(1, 'rgba(' + rgb[0] + ',' + rgb[1] + ',' + rgb[2] + ',0.02)');
        }

        return Object.assign({}, ds, {
            fill: ds.fill !== false ? true : false,
            backgroundColor: ds.isForecast ? 'transparent' : (ds.backgroundColor || gradient),
            borderWidth: ds.borderWidth || 2,
            borderDash: ds.isForecast ? [6, 4] : (ds.borderDash || []),
            tension: ds.tension || 0.35,
            pointRadius: ds.pointRadius || 0,
            pointHoverRadius: ds.pointHoverRadius || 4
        });
    });

    return createChart(canvasId, 'line', {
        labels: labels,
        datasets: processedDatasets
    }, Object.assign({
        interaction: { mode: 'index', intersect: false },
        plugins: { filler: { propagate: false } }
    }, extraOptions));
}

// ─── Components 전역 등록 ────────────────────────────────
window.Components = {
    formatCurrency: formatCurrency,
    formatCurrencyFull: formatCurrencyFull,
    formatNumber: formatNumber,
    createKPICard: createKPICard,
    createDataTable: createDataTable,
    createSectionHeader: createSectionHeader,
    createCardHeader: createCardHeader,
    createAlertBanner: createAlertBanner,
    createTabs: createTabs,
    createChart: createChart,
    createGauge: createGauge,
    createBulletGraph: createBulletGraph,
    createAreaGradientChart: createAreaGradientChart,
    CHART_COLORS: CHART_COLORS,
    CHART_COLORS_LIGHT: CHART_COLORS_LIGHT,
    showLoading: showLoading,
    showError: showError,
    showDbNotReady: showDbNotReady,
    animateCountUp: animateCountUp
};
console.log('[APP] Components registered on window.');

// ═══ Global Header Renderer ══════════════════════════════
function renderGlobalHeader() {
    var headerEl = document.getElementById('global-header');
    console.log('[HEADER] headerEl:', headerEl, 'DB.isReady:', DB.isReady());
    if (!headerEl || !DB.isReady()) return;

    var today = new Date().toISOString().slice(0, 10);
    console.log('[HEADER] today:', today);

    // ─ EVMS 진도율 ─
    var evms = DB.calculateEvmsMetrics(today);
    console.log('[HEADER] evms:', evms);
    var actualPct = evms.bac > 0 ? (evms.ev / evms.bac * 100) : 0;
    var spiColor = evms.spi >= 1 ? '#10B981' : evms.spi >= 0.9 ? '#F59E0B' : '#EF4444';

    // ─ 준공예정일 D-day ─
    var endDate = DB.runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''") || '';
    var dDay = '';
    if (endDate) {
        var diff = Math.ceil((new Date(endDate) - new Date()) / (1000 * 60 * 60 * 24));
        dDay = 'D-' + diff;
    }

    // ─ 금주 주요 작업 ─
    var todayObj = new Date();
    var dayOw = todayObj.getDay();
    var monOff = dayOw === 0 ? -6 : 1 - dayOw;
    var mon = new Date(todayObj); mon.setDate(todayObj.getDate() + monOff);
    var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
    var monStr = mon.toISOString().slice(0, 10);
    var sunStr = sun.toISOString().slice(0, 10);

    var weekTasks = DB.runQuery(
        "SELECT DISTINCT WHERE2_동, HOW3_작업명 FROM evms " +
        "WHERE WHEN1_시작일 >= '" + monStr + "' AND WHEN1_시작일 <= '" + sunStr + "' " +
        "AND WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
        "ORDER BY WHERE2_동 LIMIT 5"
    );
    var taskText = '예정 작업 없음';
    if (weekTasks.values && weekTasks.values.length > 0) {
        taskText = weekTasks.values.map(function (t) {
            return (t[0] || '') + ' ' + (t[1] || '');
        }).join(' / ');
    }

    headerEl.innerHTML =
        // ─ Main header card ─
        '<div class="gh-card">' +
        // 1. Title
        '<div class="gh-cell">' +
        '<i class="fa-solid fa-building" style="color:var(--accent);font-size:0.82rem"></i>' +
        '<span class="gh-title">인천소방학교 이전 신축공사 PMIS</span>' +
        '</div>' +
        '<div class="gh-divider"></div>' +
        '<div class="gh-cell">' +
        '<span id="gh-page-name" style="font-size:0.82rem;font-weight:700;color:#6b7280;letter-spacing:0.05em">프로젝트 개요</span>' +
        '</div>' +
        '<div class="gh-divider"></div>' +
        // 2. Week tasks
        '<div class="gh-cell" style="margin-left:auto">' +
        '<i class="fa-solid fa-calendar-week" style="color:var(--success);font-size:0.72rem"></i>' +
        '<div>' +
        '<div class="gh-label">금주 주요 작업</div>' +
        '<div class="gh-value" style="font-size:0.7rem;overflow:hidden;text-overflow:ellipsis;max-width:280px">' + taskText + '</div>' +
        '</div></div>' +
        '<div class="gh-divider"></div>' +
        // 3. Weather
        '<div class="gh-cell" id="gh-weather">' +
        '<i class="fa-solid fa-cloud-sun" style="color:var(--info);font-size:0.82rem"></i>' +
        '<div>' +
        '<div class="gh-label">현장 날씨</div>' +
        '<div class="gh-value" style="font-size:0.7rem">로딩중...</div>' +
        '</div></div>' +
        '<div class="gh-divider"></div>' +
        // 4. Progress
        '<div class="gh-cell">' +
        '<div style="width:32px;height:32px;border-radius:50%;border:3px solid ' + spiColor + ';display:flex;align-items:center;justify-content:center">' +
        '<span style="font-size:0.6rem;font-weight:800;color:' + spiColor + '">' + actualPct.toFixed(0) + '%</span>' +
        '</div>' +
        '<div>' +
        '<div class="gh-label">진도율</div>' +
        '<div class="gh-value" style="font-size:0.7rem">SPI ' + evms.spi.toFixed(2) + '</div>' +
        '</div></div>' +
        '<div class="gh-divider"></div>' +
        // 5. D-day
        '<div class="gh-cell">' +
        '<i class="fa-solid fa-flag-checkered" style="color:var(--warning);font-size:0.72rem"></i>' +
        '<div>' +
        '<div class="gh-label">준공예정</div>' +
        '<div class="gh-value" style="color:var(--accent)">' + dDay + '</div>' +
        '</div></div>' +
        '</div>' +

        // ─ Marquee bar ─
        '<div class="gh-marquee">' +
        '<div class="gh-marquee-inner" id="gh-marquee-track">' +
        '<span class="gh-marquee-text">' +
        '<span class="kw-glow">㈜나인티나인</span>은 <span class="kw-glow">CUBE</span> 엔진으로 사업정보를 완벽히 동기화합니다. ' +
        '데이터는 쌓아두는 것이 아니라, 활용할 때 비로소 자산이 됩니다. ' +
        '이제 더 이상 데이터를 찾지 말고, <span class="kw-glow">AI와 대화</span>하십시오. ' +
        '사용자 질문에 AI가 복잡한 현장 현황을 <span class="kw-glow">데이터와 차트로 요약</span>하여 ' +
        '사업관리자의 <span class="kw-glow">최적의 의사결정</span>을 지원합니다.' +
        '&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;✦&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;&nbsp;' +
        '</span>' +
        '</div></div>';

    // ─ 마키 끊김 없는 연속 스크롤 ─
    (function initMarquee() {
        var track = document.getElementById('gh-marquee-track');
        if (!track) return;
        var firstSpan = track.querySelector('.gh-marquee-text');
        if (!firstSpan) return;

        // 1) 원본 텍스트 너비 측정
        var spanW = firstSpan.offsetWidth;
        var containerW = track.parentElement.offsetWidth;

        // 2) 화면을 넘길 만큼 복제본 추가 (최소 3장)
        var copies = Math.max(3, Math.ceil(containerW / spanW) + 2);
        for (var c = 0; c < copies; c++) {
            track.appendChild(firstSpan.cloneNode(true));
        }

        // 3) 픽셀 기반 연속 스크롤 (requestAnimationFrame)
        var offset = 0;
        var speed = 1.2; // px per frame (~72px/sec at 60fps)

        function step() {
            offset -= speed;
            if (offset <= -spanW) offset += spanW;
            track.style.transform = 'translateX(' + offset + 'px)';
            requestAnimationFrame(step);
        }
        requestAnimationFrame(step);
    })();

    // ─ 날씨 비동기 로드 ─
    (function () {
        var wEl = document.getElementById('gh-weather');
        if (!wEl) return;
        fetch('https://api.open-meteo.com/v1/forecast?latitude=37.46&longitude=126.71&current=temperature_2m,weather_code&timezone=Asia%2FSeoul')
            .then(function (r) { return r.json(); })
            .then(function (d) {
                var cur = d.current;
                if (!cur) return;
                var temp = Math.round(cur.temperature_2m);
                var wMap = {
                    0: ['맑음', 'fa-sun'], 1: ['맑음', 'fa-sun'], 2: ['구름', 'fa-cloud-sun'], 3: ['흐림', 'fa-cloud'],
                    45: ['안개', 'fa-smog'], 48: ['안개', 'fa-smog'],
                    51: ['이슬비', 'fa-cloud-rain'], 53: ['이슬비', 'fa-cloud-rain'], 55: ['이슬비', 'fa-cloud-rain'],
                    61: ['비', 'fa-cloud-showers-heavy'], 63: ['비', 'fa-cloud-showers-heavy'], 65: ['폭우', 'fa-cloud-showers-heavy'],
                    71: ['눈', 'fa-snowflake'], 73: ['눈', 'fa-snowflake'], 75: ['폭설', 'fa-snowflake'],
                    80: ['소나기', 'fa-cloud-rain'], 95: ['뇌우', 'fa-bolt']
                };
                var w = wMap[cur.weather_code] || ['알 수 없음', 'fa-cloud'];
                wEl.innerHTML =
                    '<i class="fa-solid ' + w[1] + '" style="color:var(--info);font-size:0.82rem"></i>' +
                    '<div><div class="gh-label">인천 날씨</div>' +
                    '<div class="gh-value" style="font-size:0.7rem">' + temp + '°C · ' + w[0] + '</div></div>';
            })
            .catch(function () {
                wEl.querySelector('.gh-value').textContent = '연결 실패';
            });
    })();
}


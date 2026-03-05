/**
 * ============================================================
 * Page 6: 진도관리 (EVMS)
 * ============================================================
 * - 종합 현황판 (Project Health Check) with half-circle gauge meters
 * - SVG Gauge Charts for SPI / CPI / Progress Rate
 * - S-Curve area gradient chart
 * - Bullet graphs & EVMS summary
 */

/**
 * 반원형 게이지 차트 생성 (바늘 포인터 + 색상 구간)
 * @param {object} opts - { value, min, max, label, subLabel, unit, zones, size }
 * zones: [{ from, to, color }]
 */
function createHalfGauge(opts) {
    var value = opts.value || 0;
    var min = opts.min || 0;
    var max = opts.max || 1.5;
    var label = opts.label || '';
    var subLabel = opts.subLabel || '';
    var displayValue = opts.displayValue !== undefined ? opts.displayValue : value.toFixed(2);
    var size = opts.size || 180;
    var statusColor = opts.statusColor || '#64748B';
    var statusIcon = opts.statusIcon || '';
    var statusText = opts.statusText || '';

    // SVG dimensions
    var cx = 100, cy = 95;
    var r = 75;
    var strokeW = 18;

    // Zones (default for SPI/CPI: 0.7 ~ 1.3)
    var zones = opts.zones || [
        { from: 0.7, to: 0.85, color: '#EF4444' },   // Critical (red)
        { from: 0.85, to: 0.95, color: '#F97316' },   // High (orange)
        { from: 0.95, to: 1.0, color: '#FBBF24' },    // Medium (yellow)
        { from: 1.0, to: 1.1, color: '#84CC16' },     // Low (light green)
        { from: 1.1, to: 1.3, color: '#22C55E' }      // Very Low (green)
    ];

    // Convert value to angle (180 degrees = min to max, left to right)
    function valToAngle(v) {
        var clamped = Math.max(min, Math.min(max, v));
        var pct = (clamped - min) / (max - min);
        return -180 + pct * 180; // -180 (left) to 0 (right)
    }

    // Arc path helper
    function arcPath(startAngle, endAngle, radius) {
        var s = startAngle * Math.PI / 180;
        var e = endAngle * Math.PI / 180;
        var x1 = cx + radius * Math.cos(s);
        var y1 = cy + radius * Math.sin(s);
        var x2 = cx + radius * Math.cos(e);
        var y2 = cy + radius * Math.sin(e);
        var largeArc = (endAngle - startAngle) > 180 ? 1 : 0;
        return 'M ' + x1 + ' ' + y1 + ' A ' + radius + ' ' + radius + ' 0 ' + largeArc + ' 1 ' + x2 + ' ' + y2;
    }

    // Build zone arcs
    var arcs = '';
    zones.forEach(function (z) {
        var a1 = valToAngle(z.from);
        var a2 = valToAngle(z.to);
        arcs += '<path d="' + arcPath(a1, a2, r) + '" fill="none" stroke="' + z.color + '" stroke-width="' + strokeW + '" stroke-linecap="butt"/>';
    });

    // Tick marks and labels
    var ticks = '';
    var tickCount = 6;
    for (var i = 0; i <= tickCount; i++) {
        var tickVal = min + (max - min) * i / tickCount;
        var tickAngle = valToAngle(tickVal) * Math.PI / 180;
        var outerR = r + strokeW / 2 + 3;
        var innerR = r + strokeW / 2 - 2;
        var labelR = r + strokeW / 2 + 12;
        var tx1 = cx + outerR * Math.cos(tickAngle);
        var ty1 = cy + outerR * Math.sin(tickAngle);
        var tx2 = cx + innerR * Math.cos(tickAngle);
        var ty2 = cy + innerR * Math.sin(tickAngle);
        var lx = cx + labelR * Math.cos(tickAngle);
        var ly = cy + labelR * Math.sin(tickAngle);
        ticks += '<line x1="' + tx1 + '" y1="' + ty1 + '" x2="' + tx2 + '" y2="' + ty2 + '" stroke="#94A3B8" stroke-width="1.5"/>';
        ticks += '<text x="' + lx + '" y="' + (ly + 3) + '" text-anchor="middle" font-size="7" fill="#94A3B8" font-family="\'Noto Sans KR\', sans-serif">' + tickVal.toFixed(1) + '</text>';
    }

    // Needle — draw at 0 rotation (pointing left = -180°), animate via CSS
    var needleAngle = valToAngle(value); // target angle
    var needleLen = r - 8;
    // Draw needle pointing LEFT (-180°) as the base position
    var baseAngleRad = -Math.PI; // -180 degrees = pointing left
    var nx = cx + needleLen * Math.cos(baseAngleRad);
    var ny = cy + needleLen * Math.sin(baseAngleRad);
    var baseL = (-180 + 90) * Math.PI / 180;
    var baseR2 = (-180 - 90) * Math.PI / 180;
    var bw = 4;
    var bx1 = cx + bw * Math.cos(baseL);
    var by1 = cy + bw * Math.sin(baseL);
    var bx2 = cx + bw * Math.cos(baseR2);
    var by2 = cy + bw * Math.sin(baseR2);

    // Unique ID for this gauge
    var gaugeId = 'gauge-' + Math.random().toString(36).substr(2, 8);

    // Rotation needed: from -180 to needleAngle = (needleAngle - (-180)) = needleAngle + 180
    var rotDeg = needleAngle + 180;

    // Spring bounce keyframes — overshoot and oscillate
    var kf = '@keyframes ' + gaugeId + '-bounce {' +
        '0% { transform: rotate(0deg); }' +
        '25% { transform: rotate(' + (rotDeg * 1.15).toFixed(1) + 'deg); }' +
        '40% { transform: rotate(' + (rotDeg * 0.90).toFixed(1) + 'deg); }' +
        '55% { transform: rotate(' + (rotDeg * 1.06).toFixed(1) + 'deg); }' +
        '70% { transform: rotate(' + (rotDeg * 0.97).toFixed(1) + 'deg); }' +
        '85% { transform: rotate(' + (rotDeg * 1.01).toFixed(1) + 'deg); }' +
        '100% { transform: rotate(' + rotDeg.toFixed(1) + 'deg); }' +
        '}';

    var needle = '<style>' + kf + '</style>' +
        '<g style="transform-origin:' + cx + 'px ' + cy + 'px;animation:' + gaugeId + '-bounce 1.8s cubic-bezier(0.22,1,0.36,1) forwards">' +
        '<polygon points="' + nx + ',' + ny + ' ' + bx1 + ',' + by1 + ' ' + bx2 + ',' + by2 + '" fill="var(--text-primary)" />' +
        '<circle cx="' + cx + '" cy="' + cy + '" r="6" fill="var(--text-primary)" stroke="var(--bg-card)" stroke-width="2"/>' +
        '</g>';

    // Zone labels
    var zoneLabels = '';
    if (opts.zoneLabels) {
        opts.zoneLabels.forEach(function (zl) {
            var za = valToAngle(zl.at) * Math.PI / 180;
            var zr = r - strokeW / 2 - 8;
            var zx = cx + zr * Math.cos(za);
            var zy = cy + zr * Math.sin(za);
            zoneLabels += '<text x="' + zx + '" y="' + (zy + 2) + '" text-anchor="middle" font-size="6" fill="#64748B" font-weight="600" font-family="\'Noto Sans KR\', sans-serif">' + zl.text + '</text>';
        });
    }

    // Value bounce animation
    var valBounceKf = '@keyframes ' + gaugeId + '-valBounce {' +
        '0% { transform: translateY(8px); opacity: 0; }' +
        '30% { transform: translateY(-4px); opacity: 1; }' +
        '50% { transform: translateY(2px); }' +
        '70% { transform: translateY(-1px); }' +
        '100% { transform: translateY(0); opacity: 1; }' +
        '}';

    var svg = '<svg viewBox="0 0 200 130" width="' + size + '" xmlns="http://www.w3.org/2000/svg">' +
        '<style>' + valBounceKf + '</style>' +
        arcs + ticks + zoneLabels + needle +
        '<g style="animation:' + gaugeId + '-valBounce 1.2s 0.6s both">' +
        '<text id="' + gaugeId + '-val" data-target="' + displayValue + '" x="' + cx + '" y="' + (cy + 24) + '" text-anchor="middle" font-size="20" font-weight="800" fill="' + statusColor + '" font-family="\'JetBrains Mono\', monospace">0</text>' +
        '</g>' +
        '</svg>';

    return '<div style="text-align:center">' +
        svg +
        '<div style="font-size:0.8rem;font-weight:700;color:var(--text-primary);margin-top:2px">' + label + '</div>' +
        '<div style="font-size:0.62rem;color:var(--text-muted);margin-top:1px">' + subLabel + '</div>' +
        '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:3px 10px;border-radius:12px;background:' + statusColor + '18;font-size:0.6rem;font-weight:600;color:' + statusColor + '">' +
        statusIcon + ' ' + statusText +
        '</div>' +
        '</div>';
}

/**
 * 공정률 게이지 (Planned vs Actual vs Forecast 표시)
 */
function createProgressGauge(planned, actual, forecast) {
    var max = 100;
    var min = 0;

    var statusColor, statusText, statusIcon;
    var diff = actual - planned;
    if (diff >= 0) {
        statusColor = '#22C55E'; statusText = '계획 대비 +' + diff.toFixed(1) + '%'; statusIcon = '🟢';
    } else if (diff >= -5) {
        statusColor = '#F59E0B'; statusText = '계획 대비 ' + diff.toFixed(1) + '%'; statusIcon = '🟡';
    } else {
        statusColor = '#EF4444'; statusText = '계획 대비 ' + diff.toFixed(1) + '%'; statusIcon = '🔴';
    }

    return createHalfGauge({
        value: actual,
        min: 0,
        max: 100,
        label: '현재 공정률',
        subLabel: '계획 ' + planned.toFixed(1) + '% / 실적 ' + actual.toFixed(1) + '%',
        displayValue: actual.toFixed(1) + '%',
        statusColor: statusColor,
        statusText: statusText,
        statusIcon: statusIcon,
        zones: [
            { from: 0, to: 20, color: '#EF4444' },
            { from: 20, to: 40, color: '#F97316' },
            { from: 40, to: 60, color: '#FBBF24' },
            { from: 60, to: 80, color: '#84CC16' },
            { from: 80, to: 100, color: '#22C55E' }
        ]
    });
}

function renderEvmsPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var today = new Date().toISOString().split('T')[0];
    var metrics = DB.calculateEvmsMetrics(today);
    var pvTimeline = DB.getMonthlyCumulativePV();
    var evTimeline = DB.getMonthlyEV();

    var spiOk = metrics.spi >= 1.0;
    var cpiOk = metrics.cpi >= 1.0;

    // SPI status
    var spiStatusColor, spiStatusText, spiStatusIcon;
    if (metrics.spi >= 1.0) {
        spiStatusColor = '#22C55E'; spiStatusText = '양호 — 공기 단축'; spiStatusIcon = '🟢';
    } else if (metrics.spi >= 0.95) {
        spiStatusColor = '#FBBF24'; spiStatusText = '주의 — 소폭 지연'; spiStatusIcon = '🟡';
    } else if (metrics.spi >= 0.85) {
        spiStatusColor = '#F97316'; spiStatusText = '경고 — 공기 지연'; spiStatusIcon = '🟠';
    } else {
        spiStatusColor = '#EF4444'; spiStatusText = '위험 — 심각한 지연'; spiStatusIcon = '🔴';
    }

    // CPI status
    var cpiStatusColor, cpiStatusText, cpiStatusIcon;
    if (metrics.cpi >= 1.0) {
        cpiStatusColor = '#22C55E'; cpiStatusText = '양호 — 원가 절감'; cpiStatusIcon = '🟢';
    } else if (metrics.cpi >= 0.95) {
        cpiStatusColor = '#FBBF24'; cpiStatusText = '주의 — 소폭 초과'; cpiStatusIcon = '🟡';
    } else if (metrics.cpi >= 0.85) {
        cpiStatusColor = '#F97316'; cpiStatusText = '경고 — 예산 초과'; cpiStatusIcon = '🟠';
    } else {
        cpiStatusColor = '#EF4444'; cpiStatusText = '위험 — 심각한 초과'; cpiStatusIcon = '🔴';
    }

    // Progress
    var progressPct = metrics.bac > 0 ? (metrics.ev / metrics.bac * 100) : 0;
    var plannedPct = metrics.bac > 0 ? (metrics.pv / metrics.bac * 100) : 0;
    var forecastPct = progressPct * 1.02; // simplified forecast

    // SPI Gauge
    var spiGaugeHtml = createHalfGauge({
        value: metrics.spi,
        min: 0.7,
        max: 1.3,
        label: 'SPI (일정성과지수)',
        subLabel: 'EV ÷ PV = ' + Components.formatCurrency(metrics.ev) + ' ÷ ' + Components.formatCurrency(metrics.pv),
        displayValue: metrics.spi.toFixed(3),
        statusColor: spiStatusColor,
        statusText: spiStatusText,
        statusIcon: spiStatusIcon,
        zones: [
            { from: 0.7, to: 0.85, color: '#EF4444' },
            { from: 0.85, to: 0.95, color: '#F97316' },
            { from: 0.95, to: 1.0, color: '#FBBF24' },
            { from: 1.0, to: 1.1, color: '#84CC16' },
            { from: 1.1, to: 1.3, color: '#22C55E' }
        ],
        zoneLabels: [
            { at: 0.775, text: '위험' },
            { at: 0.9, text: '경고' },
            { at: 0.975, text: '주의' },
            { at: 1.05, text: '양호' },
            { at: 1.2, text: '우수' }
        ]
    });

    // CPI Gauge
    var cpiGaugeHtml = createHalfGauge({
        value: metrics.cpi,
        min: 0.7,
        max: 1.3,
        label: 'CPI (원가성과지수)',
        subLabel: 'EV ÷ AC = ' + Components.formatCurrency(metrics.ev) + ' ÷ ' + Components.formatCurrency(metrics.ac),
        displayValue: metrics.cpi.toFixed(3),
        statusColor: cpiStatusColor,
        statusText: cpiStatusText,
        statusIcon: cpiStatusIcon,
        zones: [
            { from: 0.7, to: 0.85, color: '#EF4444' },
            { from: 0.85, to: 0.95, color: '#F97316' },
            { from: 0.95, to: 1.0, color: '#FBBF24' },
            { from: 1.0, to: 1.1, color: '#84CC16' },
            { from: 1.1, to: 1.3, color: '#22C55E' }
        ],
        zoneLabels: [
            { at: 0.775, text: '위험' },
            { at: 0.9, text: '경고' },
            { at: 0.975, text: '주의' },
            { at: 1.05, text: '양호' },
            { at: 1.2, text: '우수' }
        ]
    });

    // Progress Gauge
    var progressGaugeHtml = createProgressGauge(plannedPct, progressPct, forecastPct);

    // Overall project health
    var healthCount = (spiOk ? 1 : 0) + (cpiOk ? 1 : 0);
    var healthColor, healthText, healthBg;
    if (healthCount === 2) {
        healthColor = '#22C55E'; healthText = '🟢 프로젝트 양호'; healthBg = 'rgba(34,197,94,0.08)';
    } else if (healthCount === 1) {
        healthColor = '#F59E0B'; healthText = '🟡 부분 주의 필요'; healthBg = 'rgba(245,158,11,0.08)';
    } else {
        healthColor = '#EF4444'; healthText = '🔴 긴급 점검 필요'; healthBg = 'rgba(239,68,68,0.08)';
    }

    container.innerHTML =

        // ════ 상단 컨트롤 영역 ════
        '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">' +
        '<button id="evms-this-week-btn" class="glass-btn btn-primary" style="background:#3B82F6; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-weight:600; font-size:0.75rem; cursor:pointer; display:flex; align-items:center; gap:6px; transition:transform 0.1s; box-shadow:0 4px 6px -1px rgba(59, 130, 246, 0.3);" onmouseover="this.style.transform=\'translateY(-1px)\'" onmouseout="this.style.transform=\'none\'">' +
        '<i class="fa-solid fa-calendar-check"></i> 금주의 진도관리' +
        '</button>' +
        '</div>' +

        // ══════ 종합 현황판 (Project Health Check) ══════
        '<div class="glass-card" style="padding:20px 24px;margin-bottom:16px">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:16px;flex-wrap:wrap;gap:8px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<i class="fa-solid fa-heart-pulse" style="font-size:1.1rem;color:var(--accent)"></i>' +
        '<span style="font-size:0.9rem;font-weight:800;color:var(--text-primary)">종합 현황판 (Project Health Check)</span>' +
        '</div>' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div style="padding:5px 16px;border-radius:20px;background:' + healthBg + ';font-size:0.72rem;font-weight:700;color:' + healthColor + '">' + healthText + '</div>' +
        '</div>' +
        '</div>' +

        // 게이지 3개
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:20px;align-items:start">' +
        '<div style="text-align:center">' + spiGaugeHtml + '</div>' +
        '<div style="text-align:center">' + cpiGaugeHtml + '</div>' +
        '<div style="text-align:center">' + progressGaugeHtml + '</div>' +
        '</div>' +
        '</div>' +

        // ── Row 1: Core EVMS KPI cards ──
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +
        '<div>' + Components.createKPICard('BAC (총예산)', Components.formatCurrency(metrics.bac), 'fa-bullseye', 'blue', '기준: ' + today, 'neutral') + '</div>' +
        '<div>' + Components.createKPICard('PV (계획가치)', Components.formatCurrency(metrics.pv), 'fa-calendar-days', 'info', '\u00A0', 'neutral') + '</div>' +
        '<div>' + Components.createKPICard('EV (실현가치)', Components.formatCurrency(metrics.ev), 'fa-chart-line', 'green', '실행률 기반' + (metrics.progressStats && metrics.progressStats.withProgress ? ' (' + metrics.progressStats.withProgress + '건 입력)' : ''), 'neutral') + '</div>' +
        '<div>' + Components.createKPICard('AC (실제비용)', Components.formatCurrency(metrics.ac), 'fa-receipt', 'amber', '실투입 추정 (EV×1.05)', 'neutral') + '</div>' +
        '</div>' +

        // ── Row 2: SV / CV / EAC / TCPI ──
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +
        '<div>' + Components.createKPICard('SV (일정차이)', Components.formatCurrency(metrics.sv), 'fa-arrows-left-right', metrics.sv >= 0 ? 'green' : 'orange', metrics.sv >= 0 ? '일정 앞서감' : '일정 뒤처짐', metrics.sv >= 0 ? 'up' : 'down') + '</div>' +
        '<div>' + Components.createKPICard('CV (비용차이)', Components.formatCurrency(metrics.cv), 'fa-arrows-up-down', metrics.cv >= 0 ? 'green' : 'orange', metrics.cv >= 0 ? '비용 절감' : '비용 초과', metrics.cv >= 0 ? 'up' : 'down') + '</div>' +
        '<div>' + Components.createKPICard('EAC (완료시 예상)', Components.formatCurrency(metrics.eac), 'fa-flag-checkered', metrics.eac <= metrics.bac ? 'green' : 'red', '\u00A0', 'neutral') + '</div>' +
        '<div>' + Components.createKPICard('TCPI (잔여효율)', metrics.bac > metrics.ev ? ((metrics.bac - metrics.ev) / (metrics.bac - metrics.ac)).toFixed(3) : 'N/A', 'fa-crosshairs', 'purple', '\u00A0', 'neutral') + '</div>' +
        '</div>' +

        // ── S-Curve ──
        '<div class="glass-card" style="padding:16px;margin-bottom:12px">' +
        Components.createCardHeader('S-Curve (누적 PV / EV / AC)', 'fa-chart-area') +
        '<div style="height:350px"><canvas id="evms-scurve"></canvas></div>' +
        '</div>' +

        // ── Row 3: 분석지표 + 예상지표 ──
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +

        // ═══ 분석지표 카드 ═══
        '<div class="glass-card" style="padding:16px">' +
        Components.createCardHeader('분석지표 (Performance Analysis)', 'fa-chart-bar') +
        '<div style="padding:8px 0">' +

        // Bullet Graphs
        Components.createBulletGraph({ actual: metrics.ev, plan: metrics.pv, max: metrics.bac, label: 'EV vs PV (가치)', color: 'var(--success)' }) +
        Components.createBulletGraph({ actual: metrics.ac, plan: metrics.pv, max: metrics.bac, label: 'AC vs PV (비용)', color: 'var(--warning)' }) +
        Components.createBulletGraph({ actual: progressPct, plan: plannedPct, max: 100, label: '공정률 (실적 ' + progressPct.toFixed(1) + '% / 계획 ' + plannedPct.toFixed(1) + '%)', color: 'var(--accent)' }) +

        '<div style="margin-top:14px;border-top:1px solid var(--border-default);padding-top:12px">' +

        // SPI
        buildAnalysisRow(
            'SPI (일정성과지수)',
            metrics.spi.toFixed(3),
            spiStatusColor,
            'EV ÷ PV = ' + Components.formatCurrency(metrics.ev) + ' ÷ ' + Components.formatCurrency(metrics.pv),
            metrics.spi >= 1.0 ? '공기 단축 중 — 계획보다 빠르게 진행' : (metrics.spi >= 0.95 ? '소폭 지연 — 회복 가능 수준' : '공기 지연 — 만회대책 필요'),
            metrics.spi >= 1.0 ? '🟢' : (metrics.spi >= 0.95 ? '🟡' : '🔴')
        ) +

        // CPI
        buildAnalysisRow(
            'CPI (원가성과지수)',
            metrics.cpi.toFixed(3),
            cpiStatusColor,
            'EV ÷ AC = ' + Components.formatCurrency(metrics.ev) + ' ÷ ' + Components.formatCurrency(metrics.ac),
            metrics.cpi >= 1.0 ? '원가 절감 중 — 예산 이내 집행' : (metrics.cpi >= 0.95 ? '소폭 초과 — 관리 강화 필요' : '예산 초과 — 원가 절감 조치 시급'),
            metrics.cpi >= 1.0 ? '🟢' : (metrics.cpi >= 0.95 ? '🟡' : '🔴')
        ) +

        // SV
        buildAnalysisRow(
            'SV (일정차이)',
            Components.formatCurrency(metrics.sv),
            metrics.sv >= 0 ? '#22C55E' : '#EF4444',
            'EV − PV = ' + Components.formatCurrency(metrics.ev) + ' − ' + Components.formatCurrency(metrics.pv),
            metrics.sv >= 0 ? '양수(+) → 일정이 계획보다 앞서고 있음' : '음수(−) → 일정이 계획보다 뒤처지고 있음',
            metrics.sv >= 0 ? '🟢' : '🔴'
        ) +

        // CV
        buildAnalysisRow(
            'CV (원가차이)',
            Components.formatCurrency(metrics.cv),
            metrics.cv >= 0 ? '#22C55E' : '#EF4444',
            'EV − AC = ' + Components.formatCurrency(metrics.ev) + ' − ' + Components.formatCurrency(metrics.ac),
            metrics.cv >= 0 ? '양수(+) → 예산보다 적게 사용 중' : '음수(−) → 예산보다 많이 사용 중',
            metrics.cv >= 0 ? '🟢' : '🔴'
        ) +

        '</div></div></div>' +

        // ═══ 예상지표 카드 ═══
        (function () {
            // 예상지표 계산
            var eac = metrics.eac;
            var vac = metrics.bac - eac;  // VAC = BAC - EAC
            var tcpi = (metrics.bac > metrics.ev && metrics.bac > metrics.ac) ? ((metrics.bac - metrics.ev) / (metrics.bac - metrics.ac)) : 0;

            // 프로젝트 기간 가져오기
            var projSpan = DB.runQuery("SELECT MIN(WHEN1_시작일) as sd, MAX(WHEN2종료일) as ed FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''");
            var projStart = '', projEnd = '', contractDays = 0;
            if (projSpan.values && projSpan.values.length > 0) {
                projStart = projSpan.values[0][0] || '';
                projEnd = projSpan.values[0][1] || '';
                if (projStart && projEnd) {
                    contractDays = Math.round((new Date(projEnd) - new Date(projStart)) / (1000 * 60 * 60 * 24));
                }
            }

            // 예상연장기간 = (계약공기 ÷ SPI) - 계약공기
            var estimatedDuration = metrics.spi > 0 ? Math.round(contractDays / metrics.spi) : contractDays;
            var extensionDays = estimatedDuration - contractDays;
            var estimatedEnd = '';
            if (projStart && contractDays > 0 && metrics.spi > 0) {
                var newEnd = new Date(projStart);
                newEnd.setDate(newEnd.getDate() + estimatedDuration);
                estimatedEnd = newEnd.toISOString().split('T')[0];
            }

            return '<div class="glass-card" style="padding:16px">' +
                Components.createCardHeader('예상지표 (Forecast Indicators)', 'fa-crystal-ball fa-solid fa-wand-magic-sparkles') +
                '<div style="padding:8px 0">' +

                // 기본 정보
                '<div style="display:grid;grid-template-columns:1fr 1fr;gap:6px;margin-bottom:14px">' +
                buildForecastInfoBox('기준일', today) +
                buildForecastInfoBox('계약공기', contractDays + '일') +
                buildForecastInfoBox('착공일', projStart) +
                buildForecastInfoBox('계약 준공일', projEnd) +
                '</div>' +

                '<div style="border-top:1px solid var(--border-default);padding-top:12px">' +

                // EAC
                buildAnalysisRow(
                    'EAC (완료시점 예상원가)',
                    Components.formatCurrency(eac),
                    eac <= metrics.bac ? '#22C55E' : '#EF4444',
                    'BAC ÷ CPI = ' + Components.formatCurrency(metrics.bac) + ' ÷ ' + metrics.cpi.toFixed(3),
                    eac <= metrics.bac ? '예산 이내 완공 가능' : '현 추세라면 예산 ' + Components.formatCurrency(eac - metrics.bac) + ' 초과 예상',
                    eac <= metrics.bac ? '🟢' : '🔴'
                ) +

                // VAC
                buildAnalysisRow(
                    'VAC (완료시점 원가차이)',
                    Components.formatCurrency(vac),
                    vac >= 0 ? '#22C55E' : '#EF4444',
                    'BAC − EAC = ' + Components.formatCurrency(metrics.bac) + ' − ' + Components.formatCurrency(eac),
                    vac >= 0 ? '양수(+) → 잔여 예산 여유 ' + Components.formatCurrency(vac) : '음수(−) → 추가 예산 ' + Components.formatCurrency(Math.abs(vac)) + ' 필요',
                    vac >= 0 ? '🟢' : '🔴'
                ) +

                // TCPI
                buildAnalysisRow(
                    'TCPI (잔여효율지수)',
                    tcpi > 0 ? tcpi.toFixed(3) : 'N/A',
                    tcpi <= 1.0 ? '#22C55E' : (tcpi <= 1.1 ? '#F59E0B' : '#EF4444'),
                    '(BAC − EV) ÷ (BAC − AC) = ' + Components.formatCurrency(metrics.bac - metrics.ev) + ' ÷ ' + Components.formatCurrency(metrics.bac - metrics.ac),
                    tcpi <= 1.0 ? '현재 효율 유지하면 예산 내 완공 가능' : (tcpi <= 1.1 ? '약간의 효율 개선이 필요' : '높은 효율 개선 필요 — 달성 곤란'),
                    tcpi <= 1.0 ? '🟢' : (tcpi <= 1.1 ? '🟡' : '🔴')
                ) +

                // 예상연장기간
                '<div style="margin-top:10px;padding:12px 14px;border-radius:10px;background:' + (extensionDays <= 0 ? 'rgba(34,197,94,0.06)' : 'rgba(239,68,68,0.06)') + ';border:1px solid ' + (extensionDays <= 0 ? 'rgba(34,197,94,0.15)' : 'rgba(239,68,68,0.15)') + '">' +
                '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px">' +
                '<span style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">📅 예상연장기간</span>' +
                '<span style="font-size:0.95rem;font-weight:800;font-family:\'JetBrains Mono\',monospace;color:' + (extensionDays <= 0 ? '#22C55E' : '#EF4444') + '">' + (extensionDays > 0 ? '+' : '') + extensionDays + '일</span>' +
                '</div>' +
                '<div style="font-size:0.58rem;color:var(--text-muted);margin-bottom:4px;font-family:\'JetBrains Mono\',monospace">' +
                '계약공기 ÷ SPI − 계약공기 = ' + contractDays + ' ÷ ' + metrics.spi.toFixed(3) + ' − ' + contractDays + ' = ' + extensionDays + '일' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--text-muted)">' +
                '예상 공사기간: <b>' + estimatedDuration + '일</b> (계약: ' + contractDays + '일)' +
                '</div>' +
                '<div style="font-size:0.6rem;color:var(--text-muted)">' +
                '예상 준공일: <b style="color:' + (extensionDays <= 0 ? '#22C55E' : '#EF4444') + '">' + estimatedEnd + '</b> (계약: ' + projEnd + ')' +
                '</div>' +
                (extensionDays > 0 ? '<div style="font-size:0.58rem;color:#EF4444;margin-top:4px;font-weight:600">⚠ 현 추세 유지 시 ' + extensionDays + '일 공기 연장 예상</div>' : '<div style="font-size:0.58rem;color:#22C55E;margin-top:4px;font-weight:600">✓ 계약 공기 내 준공 가능</div>') +
                '</div>' +

                '</div></div></div>';
        })() +

        '</div>';

    // ── S-Curve Chart with Today Line ──
    if (pvTimeline.values.length > 0) {
        // 월별 EV 매핑 생성 (실행률 기반)
        var evByMonth = {};
        if (evTimeline && evTimeline.values) {
            evTimeline.values.forEach(function (r) {
                evByMonth[r[0]] = r[1] || 0;
            });
        }

        var cumulativePV = 0, cumulativeEV = 0, cumulativeAC = 0;
        var monthLabels = [], pvData = [], evData = [], acData = [];
        pvTimeline.values.forEach(function (r) {
            var month = r[0];
            cumulativePV += r[1];
            cumulativeEV += (evByMonth[month] || 0);
            cumulativeAC += (evByMonth[month] || 0) * 1.05;
            monthLabels.push(month);
            pvData.push(cumulativePV);
            evData.push(cumulativeEV);
            acData.push(cumulativeAC);
        });

        // 오늘 날짜의 월(YYYY-MM) 찾기
        var todayMonth = today.substring(0, 7);
        var todayIdx = -1;
        for (var ti = 0; ti < monthLabels.length; ti++) {
            if (monthLabels[ti] >= todayMonth) { todayIdx = ti; break; }
        }
        if (todayIdx < 0) todayIdx = monthLabels.length - 1;

        // 현재 시점의 누적 EV / AC
        var currentEV = todayIdx >= 0 ? evData[todayIdx] : 0;
        var currentAC = todayIdx >= 0 ? acData[todayIdx] : 0;
        var lastIdx = monthLabels.length - 1;

        // 예측 곡선: EV → BAC, AC → EAC (마지막 월에 도달)
        var targetEV = metrics.bac;  // 궁극적으로 BAC 달성
        var targetAC = metrics.eac;  // 궁극적으로 EAC 도달
        var forecastMonths = lastIdx - todayIdx; // 남은 월 수

        // EV/AC를 실측(오늘까지)과 예상(오늘 이후)으로 분리
        var evActual = [], evForecast = [];
        var acActual = [], acForecast = [];

        for (var di = 0; di <= lastIdx; di++) {
            if (di <= todayIdx) {
                // 실측 구간 (실선)
                evActual.push(evData[di]);
                acActual.push(acData[di]);
                // 연결점: 오늘 시점에서 예측선과 연결
                if (di === todayIdx) {
                    evForecast.push(evData[di]);
                    acForecast.push(acData[di]);
                } else {
                    evForecast.push(null);
                    acForecast.push(null);
                }
            } else {
                // 예측 구간 (점선) — 선형 보간: 현재값 → 목표값
                evActual.push(null);
                acActual.push(null);
                var t = (di - todayIdx) / forecastMonths; // 0~1 진행률
                // S자 곡선 보간 (easeInOut) — 자연스러운 S-Curve
                var eased = t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2;
                evForecast.push(currentEV + (targetEV - currentEV) * eased);
                acForecast.push(currentAC + (targetAC - currentAC) * eased);
            }
        }

        // 오늘 수직선 플러그인
        var todayLinePlugin = {
            id: 'todayLine',
            afterDraw: function (chart) {
                var xScale = chart.scales.x;
                var yScale = chart.scales.y;
                if (!xScale || !yScale) return;
                var x = xScale.getPixelForValue(todayIdx);
                var ctx = chart.ctx;
                ctx.save();
                ctx.beginPath();
                ctx.setLineDash([6, 4]);
                ctx.lineWidth = 2;
                ctx.strokeStyle = '#EF4444';
                ctx.moveTo(x, yScale.top);
                ctx.lineTo(x, yScale.bottom);
                ctx.stroke();
                ctx.setLineDash([]);
                // 라벨
                ctx.fillStyle = '#EF4444';
                ctx.font = 'bold 10px "Noto Sans KR", sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText('Today', x, yScale.top - 6);
                ctx.fillText(todayMonth, x, yScale.top - 18);
                ctx.restore();
            }
        };

        var scurveCanvas = document.getElementById('evms-scurve');
        if (scurveCanvas) {
            var existingChart = Chart.getChart(scurveCanvas);
            if (existingChart) existingChart.destroy();

            var sCtx = scurveCanvas.getContext('2d');
            var h = scurveCanvas.parentElement ? scurveCanvas.parentElement.clientHeight || 300 : 300;

            // PV 그래디언트
            var pvGrad = sCtx.createLinearGradient(0, 0, 0, h);
            pvGrad.addColorStop(0, 'rgba(96,165,250,0.18)');
            pvGrad.addColorStop(1, 'rgba(96,165,250,0.02)');

            // EV 그래디언트
            var evGrad = sCtx.createLinearGradient(0, 0, 0, h);
            evGrad.addColorStop(0, 'rgba(52,211,153,0.18)');
            evGrad.addColorStop(1, 'rgba(52,211,153,0.02)');

            new Chart(scurveCanvas, {
                type: 'line',
                data: {
                    labels: monthLabels,
                    datasets: [
                        {
                            label: 'PV (계획)',
                            data: pvData,
                            borderColor: 'rgba(96,165,250,1)',
                            backgroundColor: pvGrad,
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 4
                        },
                        {
                            label: 'EV (실현)',
                            data: evActual,
                            borderColor: 'rgba(52,211,153,1)',
                            backgroundColor: evGrad,
                            borderWidth: 2.5,
                            fill: true,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            spanGaps: false
                        },
                        {
                            label: 'EV (예측)',
                            data: evForecast,
                            borderColor: 'rgba(52,211,153,0.6)',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [6, 4],
                            fill: false,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            spanGaps: true
                        },
                        {
                            label: 'AC (실적)',
                            data: acActual,
                            borderColor: 'rgba(251,146,60,1)',
                            backgroundColor: 'transparent',
                            borderWidth: 2.5,
                            fill: false,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            spanGaps: false
                        },
                        {
                            label: 'AC (예측)',
                            data: acForecast,
                            borderColor: 'rgba(251,146,60,0.5)',
                            backgroundColor: 'transparent',
                            borderWidth: 2,
                            borderDash: [6, 4],
                            fill: false,
                            tension: 0.35,
                            pointRadius: 0,
                            pointHoverRadius: 4,
                            spanGaps: true
                        }
                    ]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    interaction: { mode: 'index', intersect: false },
                    plugins: {
                        legend: {
                            position: 'top',
                            labels: {
                                filter: function (item) {
                                    // '예측' 범례는 숨기기 (실선만 보이게)
                                    return item.text.indexOf('예측') < 0;
                                },
                                font: { size: 11 },
                                usePointStyle: true,
                                pointStyle: 'circle',
                                padding: 16
                            }
                        },
                        tooltip: {
                            callbacks: {
                                label: function (ctx) {
                                    var val = ctx.parsed.y;
                                    if (val === null) return null;
                                    var name = ctx.dataset.label.replace(' (예측)', '');
                                    return name + ': ' + (val / 1e8).toFixed(1) + '억';
                                }
                            }
                        }
                    },
                    scales: {
                        x: { ticks: { maxRotation: 45, font: { size: 9 } }, grid: { display: false } },
                        y: {
                            ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; }, font: { family: 'JetBrains Mono', size: 10 } },
                            grid: { color: 'rgba(148,163,184,0.05)' }
                        }
                    }
                },
                plugins: [todayLinePlugin]
            });
        }
    }

    // ── 게이지 숫자 스크롤 애니메이션 ──
    setTimeout(function () {
        var gaugeVals = document.querySelectorAll('[id$="-val"][data-target]');
        gaugeVals.forEach(function (el) {
            var targetStr = el.getAttribute('data-target');
            var suffix = targetStr.replace(/[\d.\-]/g, ''); // '%' 같은 접미사
            var targetNum = parseFloat(targetStr);
            if (isNaN(targetNum)) { el.textContent = targetStr; return; }

            var totalFrames = 40;
            var frame = 0;
            var decimals = (targetStr.indexOf('.') >= 0) ? (targetStr.split('.')[1] || '').replace(/[^\d]/g, '').length : 0;

            function animate() {
                frame++;
                var progress = frame / totalFrames;
                // Easing: ease-out bounce
                var eased = 1 - Math.pow(1 - progress, 3);
                // Value + random jitter that decreases over time
                var jitter = (1 - eased) * targetNum * 0.3 * (Math.random() - 0.5);
                var current = targetNum * eased + jitter;

                if (frame >= totalFrames) {
                    el.textContent = targetStr; // exact final value
                } else {
                    el.textContent = current.toFixed(decimals) + suffix;
                    requestAnimationFrame(animate);
                }
            }
            animate();
        });
    }, 600);

    // ── 금주의 진도관리 버튼 이벤트 ──
    var weekEvmsBtn = document.getElementById('evms-this-week-btn');
    if (weekEvmsBtn) {
        weekEvmsBtn.addEventListener('click', showThisWeekEvms);
    }

    function showThisWeekEvms() {
        var todayDate = new Date();
        var day = todayDate.getDay();
        var diff = todayDate.getDate() - day + (day === 0 ? -6 : 1); // Monday
        var monday = new Date(todayDate.getTime());
        monday.setDate(diff);
        var sunday = new Date(todayDate.getTime());
        sunday.setDate(diff + 6);

        var sd = monday.toISOString().slice(0, 10);
        var ed = sunday.toISOString().slice(0, 10);

        var valid = "WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";
        var sql = "SELECT WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, HOW5_규격, SUM(R10_합계_금액) as amt, MAX(\"WHEN4_실행률(%)\") as prog " +
            "FROM evms WHERE " + valid + " " +
            "AND WHEN1_시작일 <= '" + ed + "' AND WHEN2종료일 >= '" + sd + "' " +
            "GROUP BY WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, HOW5_규격 " +
            "ORDER BY WHERE2_동, HOW2_대공종, HOW3_작업명";

        var data = DB.runQuery(sql);

        var mainContent = document.querySelector('.main-content');
        var wrapLeft = 0;
        var wrapWidth = '100vw';
        if (mainContent) {
            var rect = mainContent.getBoundingClientRect();
            wrapLeft = rect.left;
            wrapWidth = rect.width + 'px';
        }

        var overlay = document.createElement('div');
        overlay.className = 'ai-modal-overlay';
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = wrapLeft + 'px';
        overlay.style.width = wrapWidth;
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.5)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '999';
        overlay.style.backdropFilter = 'blur(4px)';

        var modal = document.createElement('div');
        modal.className = 'glass-card ai-modal';
        modal.style.width = '96%';
        modal.style.maxWidth = '1600px';
        modal.style.height = '85vh';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.padding = '20px';
        modal.style.background = 'var(--bg-card)';
        modal.style.border = '1px solid var(--border)';
        modal.style.borderRadius = '12px';
        modal.style.boxShadow = '0 20px 60px rgba(0, 0, 0, 0.2)';
        modal.style.animation = 'fadeIn 0.2s ease';

        var resizeListener = function () {
            if (mainContent) {
                var newRect = mainContent.getBoundingClientRect();
                overlay.style.left = newRect.left + 'px';
                overlay.style.width = newRect.width + 'px';
            }
        };
        window.addEventListener('resize', resizeListener);

        var header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';
        header.innerHTML = '<h3 style="margin:0; font-size:1.2rem; color:var(--text-primary); display:flex; align-items:center;"><i class="fa-solid fa-list-check" style="color:#3B82F6; margin-right:8px;"></i> 금주의 진도관리 (' + sd + ' ~ ' + ed + ')' +
            '<span style="font-size:0.75rem; color:var(--text-muted); font-weight:normal; margin-left:12px; border:1px solid var(--border); padding:4px 8px; border-radius:4px;">조회 건수: ' + (data.values ? data.values.length : 0) + '건</span></h3>' +
            '<div style="display:flex; align-items:center; gap:10px;">' +
            '<button id="evms-update-btn" style="padding:6px 16px; border-radius:8px; font-size:0.8rem; font-weight:700; background:#22C55E; color:#fff; border:none; cursor:pointer; transition: opacity 0.2s;" onmouseover="this.style.opacity=\'0.8\'" onmouseout="this.style.opacity=\'1\'"><i class="fa-solid fa-cloud-arrow-up"></i> 최종 업데이트</button>' +
            '<button id="close-evms-modal" style="background:none; border:none; color:var(--text-muted); font-size:1.4rem; cursor:pointer; padding:4px; transition:color 0.2s;"><i class="fa-solid fa-times"></i></button>' +
            '</div>';

        var tableWrapper = document.createElement('div');
        tableWrapper.style.flex = '1';
        tableWrapper.style.overflowY = 'auto';
        tableWrapper.style.border = '1px solid var(--border)';
        tableWrapper.style.borderRadius = '8px';
        tableWrapper.style.background = 'var(--bg-base)';

        if (!data.values || data.values.length === 0) {
            tableWrapper.innerHTML = '<div style="padding:60px; text-align:center; color:var(--text-muted); font-size:0.9rem;">해당 기간에 진행 중인 작업 내역이 없습니다. (시작일/종료일 데이터 부족 혹은 일정 없음)</div>';
        } else {
            var thStyle = 'text-align:left; padding:12px 14px; color:var(--text-secondary); font-weight:700; border-bottom:1px solid var(--border); position:sticky; top:0; background:var(--bg-card); z-index:10; font-size:0.75rem;';
            var tdStyle = 'padding:10px 14px; font-size:0.75rem; border-bottom:1px solid var(--border); color:var(--text-primary);';

            var tableHTML = '<table style="width:100%; border-collapse:collapse;">' +
                '<thead><tr>' +
                '<th style="' + thStyle + ' width:10%">동</th>' +
                '<th style="' + thStyle + ' width:12%">대공종</th>' +
                '<th style="' + thStyle + ' width:22%">작업명</th>' +
                '<th style="' + thStyle + ' width:18%">품명</th>' +
                '<th style="' + thStyle + ' width:14%">규격</th>' +
                '<th style="' + thStyle + ' width:12%; text-align:right;">합계 금액</th>' +
                '<th style="' + thStyle + ' width:12%; text-align:center;">실행률 (%)</th>' +
                '</tr></thead><tbody>';

            var totalAmt = 0;
            data.values.forEach(function (row, idx) {
                totalAmt += (row[5] || 0);
                var prog = (row[6] !== null && row[6] !== undefined) ? Math.round(row[6] * 100) : 0;
                tableHTML += '<tr style="transition:background 0.2s; cursor:default;" onmouseover="this.style.background=\'var(--bg-active)\'" onmouseout="this.style.background=\'transparent\'">' +
                    '<td style="' + tdStyle + '">' + (row[0] || '-') + '<input type="hidden" class="evms-row-key" data-idx="' + idx + '" data-col0="' + (row[0] || '') + '" data-col1="' + (row[1] || '') + '" data-col2="' + (row[2] || '') + '" data-col3="' + (row[3] || '') + '" data-col4="' + (row[4] || '') + '"></td>' +
                    '<td style="' + tdStyle + '">' + (row[1] || '-') + '</td>' +
                    '<td style="' + tdStyle + '"><div style="max-height:3em; overflow:hidden;" title="' + (row[2] || '') + '">' + (row[2] || '-') + '</div></td>' +
                    '<td style="' + tdStyle + 'color:var(--text-secondary);"><div style="max-height:3em; overflow:hidden;" title="' + (row[3] || '') + '">' + (row[3] || '') + '</div></td>' +
                    '<td style="' + tdStyle + 'color:var(--text-secondary);"><div style="max-height:3em; overflow:hidden;" title="' + (row[4] || '') + '">' + (row[4] || '') + '</div></td>' +
                    '<td style="' + tdStyle + ' text-align:right; font-weight:600; font-family:\'JetBrains Mono\', monospace; color:var(--accent);">' + (row[5] ? row[5].toLocaleString() : '0') + '</td>' +
                    '<td style="' + tdStyle + ' text-align:center;"><input type="number" class="evms-prog-input" data-idx="' + idx + '" value="' + prog + '" min="0" max="100" style="width:70px; text-align:right; padding:4px 8px; border:1px solid var(--border); border-radius:4px; font-family:\'JetBrains Mono\', monospace; background:var(--bg-input); color:var(--text-primary); outline:none;"></td>' +
                    '</tr>';
            });

            tableHTML += '</tbody><tfoot style="position:sticky; bottom:0; background:var(--bg-card); z-index:10;">' +
                '<tr>' +
                '<td colspan="5" style="padding:12px 14px; font-weight:800; text-align:right; border-top:2px solid var(--border); color:var(--text-primary);">총 합계 금액</td>' +
                '<td style="padding:12px 14px; font-weight:800; text-align:right; border-top:2px solid var(--border); font-family:\'JetBrains Mono\', monospace; color:var(--accent);">' + totalAmt.toLocaleString() + '</td>' +
                '<td style="padding:12px 14px; border-top:2px solid var(--border);"></td>' +
                '</tr>' +
                '</tfoot></table>';

            tableWrapper.innerHTML = tableHTML;
        }

        modal.appendChild(header);
        modal.appendChild(tableWrapper);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        var closeBtn = document.getElementById('close-evms-modal');
        function closeModal() {
            window.removeEventListener('resize', resizeListener);
            if (document.body.contains(overlay)) {
                document.body.removeChild(overlay);
            }
        }
        closeBtn.addEventListener('click', closeModal);
        overlay.addEventListener('click', function (e) {
            if (e.target === overlay) closeModal();
        });

        // "최종 업데이트" 이벤트
        var updateBtn = document.getElementById('evms-update-btn');
        if (updateBtn) {
            updateBtn.addEventListener('click', function () {
                if (!confirm("현재 화면에 보이는 실행률로 일괄 업데이트 및 CSV 파일을 생성하시겠습니까? (이 작업 후 전체 데이터가 새로고침됩니다.)")) {
                    return;
                }

                var btn = this;
                var oldHtml = btn.innerHTML;
                btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> 처리 중...';
                btn.disabled = true;

                // UI block 방지를 위해 setTimeout 내에서 처리
                setTimeout(function () {
                    try {
                        // 1. 모든 입력된값 수집
                        var inputs = tableWrapper.querySelectorAll('.evms-prog-input');
                        var sqls = [];

                        inputs.forEach(function (inp) {
                            var v = parseFloat(inp.value);
                            if (isNaN(v)) return;
                            var valDec = v / 100;
                            var idx = inp.getAttribute('data-idx');
                            var keyEl = tableWrapper.querySelector('input.evms-row-key[data-idx="' + idx + '"]');
                            if (keyEl) {
                                var col0 = keyEl.getAttribute('data-col0').replace(/'/g, "''");
                                var col1 = keyEl.getAttribute('data-col1').replace(/'/g, "''");
                                var col2 = keyEl.getAttribute('data-col2').replace(/'/g, "''");
                                var col3 = keyEl.getAttribute('data-col3').replace(/'/g, "''");
                                var col4 = keyEl.getAttribute('data-col4').replace(/'/g, "''");

                                var upSql = "UPDATE evms SET \"WHEN4_실행률(%)\" = " + valDec + " " +
                                    "WHERE IFNULL(WHERE2_동,'') = '" + col0 + "' " +
                                    "AND IFNULL(HOW2_대공종,'') = '" + col1 + "' " +
                                    "AND IFNULL(HOW3_작업명,'') = '" + col2 + "' " +
                                    "AND IFNULL(HOW4_품명,'') = '" + col3 + "' " +
                                    "AND IFNULL(HOW5_규격,'') = '" + col4 + "'";
                                sqls.push(upSql);
                            }
                        });

                        // 2. DB 업데이트
                        if (sqls.length > 0) {
                            // Run sequentially
                            for (var i = 0; i < sqls.length; i++) {
                                DB.runQuery(sqls[i]);
                            }
                        }

                        // 3. CSV 생성 및 다운로드
                        var allDataObj = DB.runQuery("SELECT * FROM evms");
                        if (allDataObj && allDataObj.columns && allDataObj.values) {
                            var cols = allDataObj.columns;
                            var vals = allDataObj.values;

                            var csvRows = [];
                            var headerStr = cols.map(function (c) {
                                var s = String(c);
                                if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) return '"' + s.replace(/"/g, '""') + '"';
                                return s;
                            }).join(',');
                            csvRows.push(headerStr);

                            vals.forEach(function (r) {
                                var rowStr = r.map(function (val) {
                                    if (val === null || val === undefined) return '';
                                    var s = String(val);
                                    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) return '"' + s.replace(/"/g, '""') + '"';
                                    return s;
                                }).join(',');
                                csvRows.push(rowStr);
                            });

                            var csvContent = "\ufeff" + csvRows.join("\n"); // Add BOM
                            var blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
                            var link = document.createElement("a");
                            var url = URL.createObjectURL(blob);
                            var now = new Date();
                            var yyyy = now.getFullYear();
                            var mm = String(now.getMonth() + 1).padStart(2, '0');
                            var dd = String(now.getDate()).padStart(2, '0');
                            var filename = "evms_" + yyyy + mm + dd + ".csv";

                            link.setAttribute("href", url);
                            link.setAttribute("download", filename);
                            link.style.visibility = 'hidden';
                            document.body.appendChild(link);
                            link.click();
                            document.body.removeChild(link);

                            alert('업데이트가 완료되었으며, 최신 데이터가 ' + filename + ' 파일로 다운로드되었습니다.\n(변경된 내용은 앱 전체 보드에 즉시 반영됩니다.)');
                        } else {
                            alert('DB에서 최신 데이터를 가져오는 데 문제가 발생했습니다.');
                        }

                        // 모달 닫기
                        closeModal();

                        // 4. 앱 데이터 재조회 및 화면 갱신
                        var contentArea = document.getElementById('content-area');
                        if (contentArea) {
                            window.renderEvmsPage(contentArea);
                        }

                    } catch (e) {
                        console.error('Update failed:', e);
                        alert('업데이트 중 오류가 발생했습니다: ' + e.message);
                        btn.innerHTML = oldHtml;
                        btn.disabled = false;
                    }
                }, 50); // slight delay to show loading state
            });
        }
    }
}

function buildEvmsMetricRow(label, value) {
    return '<div class="evms-metric-row"><span class="label">' + label + '</span><span class="value">' + value + '</span></div>';
}

/** 분석지표 행: 지표명, 값, 색상, 수식, 해석, 상태아이콘 */
function buildAnalysisRow(title, value, color, formula, description, icon) {
    return '<div style="padding:8px 0;border-bottom:1px solid var(--border-default)">' +
        '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">' +
        '<span style="font-size:0.68rem;font-weight:700;color:var(--text-primary)">' + icon + ' ' + title + '</span>' +
        '<span style="font-size:0.82rem;font-weight:800;font-family:\'JetBrains Mono\',monospace;color:' + color + '">' + value + '</span>' +
        '</div>' +
        '<div style="font-size:0.55rem;color:var(--text-muted);font-family:\'JetBrains Mono\',monospace;margin-bottom:2px;background:var(--bg-secondary);padding:2px 6px;border-radius:4px;display:inline-block">' + formula + '</div>' +
        '<div style="font-size:0.58rem;color:' + color + ';margin-top:2px;font-weight:500">' + description + '</div>' +
        '</div>';
}

/** 예상지표 정보 박스 */
function buildForecastInfoBox(label, value) {
    return '<div style="padding:6px 10px;border-radius:8px;background:var(--bg-secondary);text-align:center">' +
        '<div style="font-size:0.55rem;color:var(--text-muted);margin-bottom:2px">' + label + '</div>' +
        '<div style="font-size:0.7rem;font-weight:700;color:var(--text-primary);font-family:\'JetBrains Mono\',monospace">' + value + '</div>' +
        '</div>';
}

window.renderEvmsPage = renderEvmsPage;


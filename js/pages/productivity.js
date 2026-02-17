/**
 * ============================================================
 * Page 7: 생산성관리 (Productivity Management)
 * ============================================================
 * 2026-02-17 전면 재작성:
 *   핵심 질문: "우리가 계획된 속도만큼 빠르게, 끊김 없이 일하고 있는가?"
 *
 *   1. 생산 속도 (Production Velocity) — 콤보 차트
 *   2. 노무비 투입 강도 (Labor Cost Intensity) — 히트맵
 *   3. 금액적 생산성 (Financial Productivity) — 게이지
 *   4. 병목 공정 분석 (Bottleneck Analysis) — 유휴 공정 리스트
 *   5. 하도급 업체별 공기 준수율 (Duration Adherence) — 가로 막대
 */

function renderProductivityPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var today = new Date();
    var todayStr = today.toISOString().slice(0, 10);

    // ── 실제 DB에서 기본 데이터 로드 ──
    var metrics = DB.calculateEvmsMetrics(todayStr);
    var prodByTrade = DB.getProductivityByTrade();
    var subSummary = DB.getSubcontractorSummary();
    var schedData = DB.getSubcontractorSchedule();

    // ── KPI 집계 ──
    var spi = metrics.spi || 0;
    var cpi = metrics.cpi || 0;
    var monthlyBillingRate = metrics.bac > 0 ? (metrics.ev / metrics.bac * 100) : 0;

    // 시뮬레이션: 일일 생산 속도 (Plan vs Actual)
    var materialSPI = spi * 0.95 + 0.05; // 자재 소진 기반 SPI

    // ══ HTML 빌드 ══
    container.innerHTML =

        // ── KPI Summary (4단) ──
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +
        Components.createKPICard('자재 소진 SPI', materialSPI.toFixed(3), 'fa-gauge-high', materialSPI >= 1 ? 'green' : 'orange', materialSPI >= 1 ? '생산 정상' : '생산 지연', materialSPI >= 1 ? 'up' : 'down') +
        Components.createKPICard('일일 기성 속도', (metrics.ev / 365 / 1e4).toFixed(0) + '만/일', 'fa-bolt', 'blue', '\u00A0', 'neutral') +
        Components.createKPICard('노무비 투입률', ((metrics.ac * 0.45) / metrics.bac * 100).toFixed(1) + '%', 'fa-users-gear', 'amber', '\u00A0', 'neutral') +
        Components.createKPICard('공기 준수율', (95 + spi * 3).toFixed(1) + '%', 'fa-clock-rotate-left', 'purple', '\u00A0', 'neutral') +
        '</div>' +

        // ── Row 1: 생산 속도 (full width) ──
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('생산 속도 — 주요 자재 일일 시공량 (Production Velocity)', 'fa-chart-column') +
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">' +
        '<div style="height:280px"><canvas id="prod-vel-concrete"></canvas></div>' +
        '<div style="height:280px"><canvas id="prod-vel-rebar"></canvas></div>' +
        '<div style="height:280px"><canvas id="prod-vel-formwork"></canvas></div>' +
        '</div>' +
        '<div style="margin-top:8px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.5rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">' +
        '<i class="fa-solid fa-lightbulb" style="color:#F59E0B"></i>' +
        '자재 소진율 = 생산성의 대리 지표 (Proxy Metric). 자재가 소비되었다면 그만큼 누군가가 일한 것입니다.' +
        '</div>' +
        '</div>' +

        // ── Row 2: 노무비 히트맵 + 금액적 생산성 게이지 ──
        '<div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:12px">' +

        // Card 2: 노무비 투입 강도 히트맵
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('노무비 투입 강도 (Labor Cost Intensity)', 'fa-fire') +
        '<div id="prod-labor-heatmap"></div>' +
        '</div>' +

        // Card 3: 금액적 생산성 게이지
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('금액적 생산성 — 기성 속도 (Billing Velocity)', 'fa-gauge') +
        '<div id="prod-billing-gauge"></div>' +
        '</div>' +

        '</div>' +

        // ── Row 3: 병목 공정 + 공기 준수율 ──
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +

        // Card 4: 병목 공정 분석
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('병목 공정 분석 (Bottleneck Analysis)', 'fa-triangle-exclamation') +
        '<div id="prod-bottleneck"></div>' +
        '</div>' +

        // Card 5: 업체별 공기 준수율
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('하도급 업체별 공기 준수율 (Duration Adherence)', 'fa-ranking-star') +
        '<div style="height:360px"><canvas id="prod-adherence-bar"></canvas></div>' +
        '</div>' +

        '</div>';

    // ══════════════════════════════════════════
    // 1. 생산 속도 콤보 차트 (3개 자재)
    // ══════════════════════════════════════════
    buildVelocityChart('prod-vel-concrete', '레미콘 (m³/일)', 50, 'rgba(59,130,246,', spi);
    buildVelocityChart('prod-vel-rebar', '철근 (Ton/일)', 30, 'rgba(16,185,129,', spi);
    buildVelocityChart('prod-vel-formwork', '거푸집 (m²/일)', 120, 'rgba(245,158,11,', spi);

    // ══════════════════════════════════════════
    // 2. 노무비 투입 강도 히트맵
    // ══════════════════════════════════════════
    buildLaborHeatmap('prod-labor-heatmap', metrics);

    // ══════════════════════════════════════════
    // 3. 금액적 생산성 게이지
    // ══════════════════════════════════════════
    buildBillingGauge('prod-billing-gauge', metrics);

    // ══════════════════════════════════════════
    // 4. 병목 공정 분석
    // ══════════════════════════════════════════
    buildBottleneckAnalysis('prod-bottleneck');

    // ══════════════════════════════════════════
    // 5. 업체별 공기 준수율
    // ══════════════════════════════════════════
    buildAdherenceChart('prod-adherence-bar', subSummary, schedData);
}

// ──────────────────────────────────────────
// 1. 생산 속도 콤보 차트
// ──────────────────────────────────────────
function buildVelocityChart(canvasId, title, planQty, colorBase, spi) {
    var labels = [];
    var planData = [];
    var actualData = [];
    var cumPlanData = [];
    var cumActualData = [];
    var cumPlan = 0, cumActual = 0;

    // 최근 20일 시뮬레이션
    for (var i = 19; i >= 0; i--) {
        var d = new Date();
        d.setDate(d.getDate() - i);
        labels.push((d.getMonth() + 1) + '/' + d.getDate());

        // 주말 감안
        var isWeekend = (d.getDay() === 0 || d.getDay() === 6);
        var plan = isWeekend ? planQty * 0.3 : planQty + Math.round((Math.random() - 0.5) * planQty * 0.2);
        var actual = isWeekend ? plan * 0.2 : Math.round(plan * (spi * 0.85 + Math.random() * 0.3));

        planData.push(plan);
        actualData.push(actual);
        cumPlan += plan;
        cumActual += actual;
        cumPlanData.push(cumPlan);
        cumActualData.push(cumActual);
    }

    Components.createChart(canvasId, 'bar', {
        labels: labels,
        datasets: [
            {
                label: '계획',
                data: planData,
                backgroundColor: colorBase + '0.25)',
                borderColor: colorBase + '0.6)',
                borderWidth: 1,
                borderRadius: 3,
                maxBarThickness: 14,
                order: 2
            },
            {
                label: '실적',
                data: actualData,
                backgroundColor: colorBase + '0.7)',
                borderColor: colorBase + '1)',
                borderWidth: 1,
                borderRadius: 3,
                maxBarThickness: 14,
                order: 2
            },
            {
                label: '누적 계획',
                data: cumPlanData,
                type: 'line',
                borderColor: '#94A3B8',
                borderDash: [4, 3],
                borderWidth: 1.5,
                pointRadius: 0,
                fill: false,
                yAxisID: 'y1',
                order: 1
            },
            {
                label: '누적 실적',
                data: cumActualData,
                type: 'line',
                borderColor: colorBase + '1)',
                borderWidth: 2,
                pointRadius: 0,
                fill: false,
                yAxisID: 'y1',
                order: 1
            }
        ]
    }, {
        plugins: {
            title: { display: true, text: title, font: { size: 11, weight: '700' }, color: '#64748B', padding: { bottom: 8 } },
            legend: { display: false }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 7 }, maxRotation: 45 } },
            y: { position: 'left', grid: { color: 'rgba(148,163,184,0.06)' }, ticks: { font: { size: 8 } } },
            y1: { position: 'right', grid: { display: false }, ticks: { font: { size: 7 }, color: '#94A3B8' } }
        }
    });
}

// ──────────────────────────────────────────
// 2. 노무비 투입 강도 히트맵
// ──────────────────────────────────────────
function buildLaborHeatmap(containerId, metrics) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var totalLabor = metrics.ac * 0.45; // 총 노무비 추정
    var projDays = 365; // 프로젝트 기간

    // 9주 데이터 시뮬레이션
    var weeks = [];
    var maxIntensity = 0;
    var dayLabels = ['월', '화', '수', '목', '금', '토', '일'];

    for (var w = 0; w < 9; w++) {
        var weekData = [];
        var baseDate = new Date();
        baseDate.setDate(baseDate.getDate() - (8 - w) * 7);
        var weekLabel = (baseDate.getMonth() + 1) + '/' + baseDate.getDate() + '주';

        for (var d = 0; d < 7; d++) {
            // 주말은 낮은 강도
            var isWeekend = (d >= 5);
            var base = totalLabor / projDays;
            var seasonal = 1 + 0.3 * Math.sin(w / 9 * Math.PI * 2); // 계절 변동
            var intensity = base * seasonal * (isWeekend ? 0.15 : (0.7 + Math.random() * 0.6));
            weekData.push(intensity);
            if (intensity > maxIntensity) maxIntensity = intensity;
        }
        weeks.push({ label: weekLabel, data: weekData });
    }

    var cellW = 80, cellH = 28, labelW = 50, headerH = 20, gap = 2;

    var html = '<div style="overflow-x:auto">';

    // 요일 헤더
    html += '<div style="display:flex;align-items:center;margin-bottom:2px">';
    html += '<div style="min-width:' + labelW + 'px"></div>';
    dayLabels.forEach(function (dl) {
        html += '<div style="width:' + cellW + 'px;text-align:center;font-size:0.48rem;color:var(--text-muted);font-weight:600">' + dl + '</div>';
    });
    html += '</div>';

    // 히트맵 그리드
    weeks.forEach(function (wk, wi) {
        html += '<div style="display:flex;align-items:center;margin-bottom:' + gap + 'px">';
        html += '<div style="min-width:' + labelW + 'px;font-size:0.48rem;color:var(--text-muted);text-align:right;padding-right:6px">' + wk.label + '</div>';

        wk.data.forEach(function (val, di) {
            var ratio = maxIntensity > 0 ? val / maxIntensity : 0;
            var hue, sat, lum;
            // 높은 강도 = 빨간색, 낮은 강도 = 파란색
            if (ratio > 0.7) { hue = 0; sat = 70 + ratio * 20; lum = 55 - ratio * 15; }
            else if (ratio > 0.4) { hue = 30; sat = 60 + ratio * 20; lum = 60 - ratio * 10; }
            else { hue = 210; sat = 40 + ratio * 30; lum = 80 - ratio * 20; }

            var bg = 'hsl(' + hue + ',' + sat.toFixed(0) + '%,' + lum.toFixed(0) + '%)';
            var valLabel = (val / 1e4).toFixed(0) + '만';
            var isToday = (wi === 8 && di === (new Date().getDay() + 6) % 7);

            html += '<div title="' + wk.label + ' ' + dayLabels[di] + ': ' + valLabel + '" style="' +
                'width:' + cellW + 'px;height:' + cellH + 'px;' +
                'background:' + bg + ';' +
                'border-radius:3px;margin:1px;' +
                'display:flex;align-items:center;justify-content:center;' +
                'font-size:0.42rem;font-weight:600;color:' + (ratio > 0.5 ? 'rgba(255,255,255,0.9)' : 'rgba(0,0,0,0.4)') + ';' +
                (isToday ? 'outline:2px solid #EF4444;outline-offset:-1px;' : '') +
                'cursor:default' +
                '">' + (ratio > 0.15 ? valLabel : '') + '</div>';
        });
        html += '</div>';
    });

    html += '</div>';

    // 범례
    html += '<div style="display:flex;align-items:center;gap:8px;margin-top:8px;font-size:0.48rem;color:var(--text-muted)">';
    html += '<span>낮음</span>';
    var gradientStops = ['hsl(210,50%,78%)', 'hsl(30,60%,60%)', 'hsl(0,75%,50%)'];
    html += '<div style="display:flex;gap:1px">';
    gradientStops.forEach(function (c) {
        html += '<div style="width:20px;height:8px;background:' + c + ';border-radius:2px"></div>';
    });
    html += '</div>';
    html += '<span>높음 (인력 집중 투입 시기)</span>';
    html += '<span style="margin-left:auto;display:flex;align-items:center;gap:3px"><span style="width:8px;height:8px;border:2px solid #EF4444;border-radius:2px;display:inline-block"></span> 오늘</span>';
    html += '</div>';

    // 인사이트
    html += '<div style="margin-top:8px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">';
    html += '<i class="fa-solid fa-circle-info" style="color:#3B82F6"></i>';
    html += '노무비 강도가 높은 주간에 현장이 한산하다면 → 생산성 문제 발생을 의심하세요.';
    html += '</div>';

    el.innerHTML = html;
}

// ──────────────────────────────────────────
// 3. 금액적 생산성 게이지
// ──────────────────────────────────────────
function buildBillingGauge(containerId, metrics) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var spi = metrics.spi || 0;
    var cpi = metrics.cpi || 0;

    // 월별 기성 속도 시뮬레이션
    var months = [];
    for (var m = 5; m >= 0; m--) {
        var d = new Date();
        d.setMonth(d.getMonth() - m);
        var label = (d.getMonth() + 1) + '월';
        var mSpi = spi * (0.85 + Math.random() * 0.3);
        months.push({ label: label, spi: Math.round(mSpi * 100) / 100 });
    }

    var html = '';

    // 속도계 (SVG 게이지)
    var gaugeValue = spi;
    var cx = 100, cy = 90, r = 70;

    function valToAngle(v) {
        var clamped = Math.max(0.5, Math.min(1.5, v));
        return -180 + (clamped - 0.5) / 1.0 * 180;
    }

    function arcPath(a1, a2) {
        var s = a1 * Math.PI / 180, e = a2 * Math.PI / 180;
        return 'M ' + (cx + r * Math.cos(s)) + ' ' + (cy + r * Math.sin(s)) +
            ' A ' + r + ' ' + r + ' 0 ' + (a2 - a1 > 180 ? 1 : 0) + ' 1 ' +
            (cx + r * Math.cos(e)) + ' ' + (cy + r * Math.sin(e));
    }

    var gaugeId = 'pg-' + Math.random().toString(36).substr(2, 6);
    var needleAngle = valToAngle(gaugeValue);
    var rotDeg = needleAngle + 180;

    var kf = '@keyframes ' + gaugeId + '-b{' +
        '0%{transform:rotate(0deg)}' +
        '25%{transform:rotate(' + (rotDeg * 1.12).toFixed(1) + 'deg)}' +
        '50%{transform:rotate(' + (rotDeg * 0.92).toFixed(1) + 'deg)}' +
        '75%{transform:rotate(' + (rotDeg * 1.03).toFixed(1) + 'deg)}' +
        '100%{transform:rotate(' + rotDeg.toFixed(1) + 'deg)}' +
        '}';

    var needleRad = -Math.PI;
    var nxBase = cx + 60 * Math.cos(needleRad);
    var nyBase = cy + 60 * Math.sin(needleRad);
    var bL = (-90) * Math.PI / 180;
    var bR = (-270) * Math.PI / 180;
    var bx1 = cx + 4 * Math.cos(bL), by1 = cy + 4 * Math.sin(bL);
    var bx2 = cx + 4 * Math.cos(bR), by2 = cy + 4 * Math.sin(bR);

    var statusColor = gaugeValue >= 1.0 ? '#10B981' : gaugeValue >= 0.9 ? '#F59E0B' : '#EF4444';
    var statusText = gaugeValue >= 1.0 ? '생산성 양호' : gaugeValue >= 0.9 ? '주의 필요' : '생산성 저하';

    html += '<div style="text-align:center;margin-bottom:8px">';
    html += '<svg viewBox="0 0 200 120" width="220" xmlns="http://www.w3.org/2000/svg">';
    html += '<style>' + kf + '</style>';
    html += '<path d="' + arcPath(-180, -144) + '" fill="none" stroke="#EF4444" stroke-width="14" stroke-linecap="butt"/>';
    html += '<path d="' + arcPath(-144, -108) + '" fill="none" stroke="#F97316" stroke-width="14" stroke-linecap="butt"/>';
    html += '<path d="' + arcPath(-108, -72) + '" fill="none" stroke="#FBBF24" stroke-width="14" stroke-linecap="butt"/>';
    html += '<path d="' + arcPath(-72, -36) + '" fill="none" stroke="#84CC16" stroke-width="14" stroke-linecap="butt"/>';
    html += '<path d="' + arcPath(-36, 0) + '" fill="none" stroke="#22C55E" stroke-width="14" stroke-linecap="butt"/>';
    html += '<g style="transform-origin:' + cx + 'px ' + cy + 'px;animation:' + gaugeId + '-b 1.6s cubic-bezier(0.22,1,0.36,1) forwards">';
    html += '<polygon points="' + nxBase + ',' + nyBase + ' ' + bx1 + ',' + by1 + ' ' + bx2 + ',' + by2 + '" fill="var(--text-primary)"/>';
    html += '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="var(--text-primary)" stroke="var(--bg-card)" stroke-width="2"/>';
    html += '</g>';
    html += '<text x="' + cx + '" y="' + (cy + 20) + '" text-anchor="middle" font-size="18" font-weight="800" fill="' + statusColor + '" font-family="\'JetBrains Mono\',monospace">' + gaugeValue.toFixed(3) + '</text>';
    html += '</svg>';
    html += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-primary)">월간 SPI (Billing Velocity)</div>';
    html += '<div style="display:inline-flex;align-items:center;gap:4px;margin-top:4px;padding:3px 10px;border-radius:12px;background:' + statusColor + '18;font-size:0.58rem;font-weight:600;color:' + statusColor + '">' + statusText + '</div>';
    html += '</div>';

    // 월별 SPI 미니차트
    html += '<div style="margin-top:8px">';
    html += '<div style="font-size:0.55rem;font-weight:700;color:var(--text-muted);margin-bottom:6px">월별 기성 속도 추이</div>';
    months.forEach(function (m) {
        var barW = Math.min(m.spi / 1.3 * 100, 100);
        var barColor = m.spi >= 1.0 ? '#10B981' : m.spi >= 0.9 ? '#F59E0B' : '#EF4444';
        html += '<div style="display:flex;align-items:center;gap:6px;margin-bottom:3px">';
        html += '<span style="min-width:30px;font-size:0.5rem;color:var(--text-muted);text-align:right">' + m.label + '</span>';
        html += '<div style="flex:1;height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden">';
        html += '<div style="width:' + barW + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.6s"></div>';
        html += '</div>';
        html += '<span style="min-width:36px;font-size:0.5rem;font-weight:700;color:' + barColor + ';font-family:\'JetBrains Mono\',monospace">' + m.spi.toFixed(2) + '</span>';
        html += '</div>';
    });
    html += '</div>';

    // 인사이트
    html += '<div style="margin-top:8px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">';
    html += '<i class="fa-solid fa-circle-info" style="color:#3B82F6"></i>';
    html += '인원 수와 무관하게, 돈(Value)을 만들어내는 속도가 빠르면 생산성이 높음.';
    html += '</div>';

    el.innerHTML = html;
}

// ──────────────────────────────────────────
// 4. 병목 공정 분석
// ──────────────────────────────────────────
function buildBottleneckAnalysis(containerId) {
    var el = document.getElementById(containerId);
    if (!el) return;

    // 가상 병목 데이터
    var bottlenecks = [
        { predecessor: '기초 철근 배근', successor: '기초 거푸집 설치', delay: 3, impact: '거푸집 팀 3일간 대기 (생산성 0)', severity: 'high', cost: 1200 },
        { predecessor: '지하 콘크리트 타설', successor: '지하 방수공사', delay: 5, impact: '방수팀 5일간 유휴 (양생 대기)', severity: 'high', cost: 2100 },
        { predecessor: '철골 제작', successor: '철골 현장 설치', delay: 2, impact: '설치팀 2일 대기 (공장 출하 지연)', severity: 'medium', cost: 800 },
        { predecessor: '외벽 미장', successor: '외벽 도장', delay: 1, impact: '도장팀 1일 대기 (건조 시간)', severity: 'low', cost: 350 },
        { predecessor: '전기 배관', successor: '배선 작업', delay: 4, impact: '배선팀 4일 대기 (배관 미완)', severity: 'high', cost: 1500 },
        { predecessor: '설비 배관', successor: '보온 작업', delay: 2, impact: '보온팀 2일 대기', severity: 'medium', cost: 600 },
        { predecessor: '마감 타일', successor: '실리콘 시공', delay: 1, impact: '시공팀 1일 대기', severity: 'low', cost: 200 }
    ];

    var severityColors = { high: '#EF4444', medium: '#F59E0B', low: '#10B981' };
    var severityLabels = { high: '심각', medium: '주의', low: '경미' };
    var severityIcons = { high: '🔴', medium: '🟡', low: '🟢' };

    var totalLoss = bottlenecks.reduce(function (s, b) { return s + b.cost; }, 0);
    var totalDays = bottlenecks.reduce(function (s, b) { return s + b.delay; }, 0);

    var html = '';

    // 요약
    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:8px;margin-bottom:10px">';
    html += '<div style="padding:8px;background:rgba(239,68,68,0.06);border-radius:8px;text-align:center">';
    html += '<div style="font-size:0.5rem;color:var(--text-muted)">총 유휴 일수</div>';
    html += '<div style="font-size:1rem;font-weight:800;color:#EF4444;font-family:\'JetBrains Mono\',monospace">' + totalDays + '일</div>';
    html += '</div>';
    html += '<div style="padding:8px;background:rgba(245,158,11,0.06);border-radius:8px;text-align:center">';
    html += '<div style="font-size:0.5rem;color:var(--text-muted)">예상 손실 비용</div>';
    html += '<div style="font-size:1rem;font-weight:800;color:#F59E0B;font-family:\'JetBrains Mono\',monospace">' + (totalLoss / 1e4 >= 100 ? (totalLoss / 1e4).toFixed(0) + '만' : totalLoss.toLocaleString()) + '원</div>';
    html += '</div>';
    html += '<div style="padding:8px;background:rgba(59,130,246,0.06);border-radius:8px;text-align:center">';
    html += '<div style="font-size:0.5rem;color:var(--text-muted)">병목 공정 수</div>';
    html += '<div style="font-size:1rem;font-weight:800;color:#3B82F6;font-family:\'JetBrains Mono\',monospace">' + bottlenecks.length + '건</div>';
    html += '</div>';
    html += '</div>';

    // 병목 리스트
    bottlenecks.sort(function (a, b) { return b.delay - a.delay; });

    bottlenecks.forEach(function (b, idx) {
        var sc = severityColors[b.severity];
        html += '<div style="padding:8px 10px;margin-bottom:4px;border-left:3px solid ' + sc + ';background:' + sc + '08;border-radius:0 6px 6px 0">';

        // 헤더
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:3px">';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<span style="font-size:0.48rem;padding:1px 6px;border-radius:3px;background:' + sc + '18;color:' + sc + ';font-weight:700">' + severityIcons[b.severity] + ' ' + severityLabels[b.severity] + '</span>';
        html += '<span style="font-size:0.58rem;font-weight:700;color:var(--text-primary)">' + b.predecessor + '</span>';
        html += '<span style="font-size:0.5rem;color:var(--text-muted)">→</span>';
        html += '<span style="font-size:0.58rem;font-weight:600;color:var(--text-secondary)">' + b.successor + '</span>';
        html += '</div>';
        html += '<span style="font-size:0.6rem;font-weight:800;color:' + sc + ';font-family:\'JetBrains Mono\',monospace">+' + b.delay + '일</span>';
        html += '</div>';

        // 영향
        html += '<div style="font-size:0.48rem;color:var(--text-muted)">' + b.impact + ' · 예상 손실 ' + (b.cost / 1e4).toFixed(0) + '만원</div>';
        html += '</div>';
    });

    // 인사이트
    html += '<div style="margin-top:8px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">';
    html += '<i class="fa-solid fa-triangle-exclamation" style="color:#EF4444"></i>';
    html += '생산성을 저해하는 요소는 "느린 작업"이 아니라 "멈춘 작업"입니다. 작업 간섭으로 인한 유휴 시간을 최소화하세요.';
    html += '</div>';

    el.innerHTML = html;
}

// ──────────────────────────────────────────
// 5. 하도급 업체별 공기 준수율
// ──────────────────────────────────────────
function buildAdherenceChart(canvasId, subSummary, schedData) {
    if (!subSummary || !subSummary.values || subSummary.values.length === 0) return;

    var companies = subSummary.values.slice(0, 10);

    // 가상 공기 준수율 생성
    var labels = [];
    var adherenceData = [];
    var bgColors = [];

    companies.forEach(function (r, idx) {
        var name = r[0];
        // 회사별 시뮬레이션된 공기 준수율
        var seed = ((r[3] || 0) % 100) / 100;
        var adherence;
        if (idx === 0) adherence = 92 + seed * 5;  // 금빛건설 — 우수
        else if (idx % 3 === 0) adherence = 105 + seed * 10; // 일부 초과
        else adherence = 88 + seed * 12;

        adherence = Math.round(adherence * 10) / 10;
        labels.push(name);
        adherenceData.push(adherence);

        if (adherence <= 95) bgColors.push('rgba(16,185,129,0.7)');      // 우수 (단축)
        else if (adherence <= 100) bgColors.push('rgba(59,130,246,0.7)'); // 정상
        else if (adherence <= 110) bgColors.push('rgba(245,158,11,0.7)'); // 주의
        else bgColors.push('rgba(239,68,68,0.7)');                       // 초과
    });

    Components.createChart(canvasId, 'bar', {
        labels: labels,
        datasets: [{
            label: '공기 준수율 (%)',
            data: adherenceData,
            backgroundColor: bgColors,
            borderRadius: 4,
            maxBarThickness: 20
        }]
    }, {
        indexAxis: 'y',
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: function (ctx) {
                        var v = ctx.parsed.x;
                        var status = v <= 95 ? '우수 (기간 단축)' : v <= 100 ? '정상' : v <= 110 ? '주의 (기간 연장)' : '초과 (생산성 저조)';
                        return ctx.label + ': ' + v.toFixed(1) + '% — ' + status;
                    }
                }
            },
            annotation: {
                annotations: {
                    baseline: {
                        type: 'line',
                        xMin: 100,
                        xMax: 100,
                        borderColor: '#EF444480',
                        borderWidth: 2,
                        borderDash: [4, 3],
                        label: {
                            display: true,
                            content: '100% 기준',
                            position: 'start',
                            font: { size: 9 },
                            color: '#EF4444'
                        }
                    }
                }
            }
        },
        scales: {
            x: {
                min: 70,
                max: 130,
                ticks: { callback: function (v) { return v + '%'; }, font: { size: 9 } },
                grid: { color: 'rgba(148,163,184,0.06)' }
            },
            y: { grid: { display: false }, ticks: { font: { size: 10 } } }
        }
    });
}

window.renderProductivityPage = renderProductivityPage;

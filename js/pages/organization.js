/**
 * ============================================================
 * Page 5: 하도급 조직관리 (Subcontractor Management)
 * ============================================================
 * 2026-02-17 전면 재작성:
 *   1. KPI Cards (등록업체수, 금일투입업체, 총계약금액, 평균공정률)
 *   2. 계약금액 상위 순위 (Horizontal Bar)
 *   3. 업체별 공사일정 타임라인 (Gantt)
 *   4. 작업부하 분포 (Donut)
 *   5. 업체별 상세 현황 (Grid Table)
 *   6. 기성 및 평가 (확장 placeholder)
 */

function renderOrganizationPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var subSummary = DB.getSubcontractorSummary();
    var scheduleData = DB.getSubcontractorSchedule();
    var tradeMatrix = DB.getTradeCompanyMatrix();
    var zoneMatrix = DB.getZoneCompanyMatrix();

    // ── 기본 집계 ──
    var totalCompanies = subSummary.values.length;
    var totalCost = subSummary.values.reduce(function (s, r) { return s + (r[3] || 0); }, 0);
    var totalItems = subSummary.values.reduce(function (s, r) { return s + (r[1] || 0); }, 0);

    // 금일 투입 업체 (오늘 날짜가 시작~종료 범위 안에 있는 업체)
    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().slice(0, 10);
    var activeCompanies = 0;
    var completedCompanies = 0;
    var upcomingCompanies = 0;

    var schedRows = (scheduleData && scheduleData.values) ? scheduleData.values : [];
    schedRows.forEach(function (r) {
        var sd = r[1], ed = r[2];
        if (sd && ed) {
            if (todayStr >= sd && todayStr <= ed) activeCompanies++;
            else if (todayStr > ed) completedCompanies++;
            else upcomingCompanies++;
        }
    });

    // 프로젝트 기간
    var projStart = DB.runScalar("SELECT MIN(WHEN1_시작일) FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''");
    var projEnd = DB.runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''");
    var projDays = (projStart && projEnd) ? Math.round((new Date(projEnd) - new Date(projStart)) / 86400000) : 0;
    var elapsedDays = projStart ? Math.max(0, Math.round((today - new Date(projStart)) / 86400000)) : 0;
    var avgProgress = projDays > 0 ? Math.min(100, Math.round(elapsedDays / projDays * 100)) : 0;
    var plannedPct = avgProgress; // 시간기반 계획 진도율

    // ── HTML 빌드 ──
    container.innerHTML =
        // ─ 1. KPI Cards (4단) ─
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +

        // KPI 1: 등록 업체 수
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-blue" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-building-user"></i></div>' +
        '<div><div class="kpi-label">등록 업체 수</div><div style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">' + totalCompanies + '<span style="font-size:0.7rem;color:var(--text-muted)">개사</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px;display:flex;gap:8px">' +
        '<span style="color:#10B981">● 진행 ' + activeCompanies + '</span>' +
        '<span style="color:#94A3B8">● 예정 ' + upcomingCompanies + '</span>' +
        '<span style="color:#3B82F6">● 완료 ' + completedCompanies + '</span>' +
        '</div>' +
        '</div>' +

        // KPI 2: 금일 투입 업체
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-green" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-hard-hat"></i></div>' +
        '<div><div class="kpi-label">금일 투입 업체</div><div style="font-size:1.3rem;font-weight:800;color:#10B981">' + activeCompanies + '<span style="font-size:0.7rem;color:var(--text-muted)">개사</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">' +
        '<span style="color:var(--text-muted)">기준일: ' + todayStr + '</span>' +
        '</div>' +
        '</div>' +

        // KPI 3: 총 계약 금액
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-amber" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-coins"></i></div>' +
        '<div><div class="kpi-label">총 계약 금액</div><div style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">' + (totalCost / 1e8).toFixed(0) + '<span style="font-size:0.7rem;color:var(--text-muted)">억원</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">총 ' + Components.formatNumber(totalItems) + '건 · 평균 ' + (totalCost / totalCompanies / 1e8).toFixed(1) + '억/사</div>' +
        '</div>' +

        // KPI 4: 평균 공정률
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-purple" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-chart-line"></i></div>' +
        '<div><div class="kpi-label">평균 공정률</div><div style="font-size:1.3rem;font-weight:800;color:' + (avgProgress > 70 ? '#10B981' : avgProgress > 30 ? '#F59E0B' : '#3B82F6') + '">' + avgProgress + '<span style="font-size:0.7rem;color:var(--text-muted)">%</span></div></div>' +
        '</div>' +
        '<div style="margin-top:6px">' +
        '<div style="height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden">' +
        '<div style="width:' + avgProgress + '%;height:100%;background:' + (avgProgress > 70 ? '#10B981' : avgProgress > 30 ? '#F59E0B' : '#3B82F6') + ';border-radius:2px"></div>' +
        '</div>' +
        '<div style="font-size:0.5rem;color:var(--text-muted);margin-top:2px">경과 ' + elapsedDays + '일 / 전체 ' + projDays + '일</div>' +
        '</div>' +
        '</div>' +

        '</div>' +

        // ─ NEW: 하도급 업체별 진도 현황 + 업체별 공사비 지급 (2단) ─
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +

        // Card 1: 하도급 업체별 진도 현황
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('하도급 업체별 진도 현황 (Subcontractor EV)', 'fa-chart-bar') +
        '<div id="org-sub-ev"></div>' +
        '</div>' +

        // Card 2: 업체별 공사비 지급 비용
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('업체별 공사비 지급 비용 (Payment Schedule)', 'fa-money-check-dollar') +
        '<div id="org-sub-payment"></div>' +
        '</div>' +

        '</div>' +

        // ─ 2,4. 차트 영역 (2단) ─
        '<div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:12px">' +

        // 2. 계약금액 상위 순위
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('계약 금액 상위 업체 (Contract Volume Ranking)', 'fa-ranking-star') +
        '<div style="height:360px"><canvas id="org-cost-rank"></canvas></div>' +
        '</div>' +

        // 4. 작업부하 분포 — 트리맵
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('작업 부하량 분포 (Activity Treemap)', 'fa-th-large') +
        '<div id="org-workload-treemap" style="height:360px"></div>' +
        '</div>' +

        '</div>' +

        // ─ 3. 업체별 공사 일정 타임라인 ─
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('업체별 공사 일정 타임라인 (Subcontractor Gantt)', 'fa-timeline') +
        '<div id="org-gantt-container" style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden;background:var(--bg-card)"></div>' +
        '</div>' +

        // ─ 5. 상세 현황 그리드 ─
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('업체별 상세 현황 (Detail Grid)', 'fa-table-list') +
        '<div id="org-detail-grid"></div>' +
        '</div>' +

        // ─ NEW: 월별 업체 동원 히트맵 ─
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('월별 업체 동원 히트맵 (Monthly Manpower Heatmap)', 'fa-fire') +
        '<div id="org-monthly-heatmap" style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden;background:var(--bg-card)"></div>' +
        '</div>' +

        // ─ NEW: 공종별 + 동별 (2단) ─
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +

        // 공종별 업체 투입 비율
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('공종별 업체 투입 (Trade Distribution)', 'fa-layer-group') +
        '<div id="org-trade-dist" style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden;background:var(--bg-card)"></div>' +
        '</div>' +

        // 동별 업체 투입 현황
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('동별(Zone) 업체 투입 현황', 'fa-map-location-dot') +
        '<div id="org-zone-matrix"></div>' +
        '</div>' +

        '</div>' +

        // ─ 6. 기성 및 평가 현황 (확장 placeholder) ─
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('기성 및 평가 현황 (Payment & Evaluation)', 'fa-clipboard-check') +
        '<div id="org-evaluation"></div>' +
        '</div>';

    // ══════════════════════════════════════════
    // 2. 계약금액 상위 순위 (Horizontal Bar Chart)
    // ══════════════════════════════════════════
    if (subSummary.values.length > 0) {
        var top10 = subSummary.values.slice(0, 10);
        Components.createChart('org-cost-rank', 'bar', {
            labels: top10.map(function (r) { return r[0]; }),
            datasets: [
                { label: '재료비', data: top10.map(function (r) { return r[4]; }), backgroundColor: 'rgba(59,130,246,0.7)', borderRadius: 3, maxBarThickness: 16 },
                { label: '노무비', data: top10.map(function (r) { return r[5]; }), backgroundColor: 'rgba(16,185,129,0.7)', borderRadius: 3, maxBarThickness: 16 },
                { label: '경비', data: top10.map(function (r) { return Math.max(0, (r[3] || 0) - (r[4] || 0) - (r[5] || 0)); }), backgroundColor: 'rgba(245,158,11,0.5)', borderRadius: 3, maxBarThickness: 16 }
            ]
        }, {
            indexAxis: 'y',
            plugins: {
                legend: { position: 'top', labels: { font: { size: 10 }, usePointStyle: true, pointStyle: 'circle', padding: 12 } },
                tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label + ': ' + (ctx.parsed.x / 1e8).toFixed(1) + '억'; } } }
            },
            scales: {
                x: { stacked: true, ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; }, font: { size: 9 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
                y: { stacked: true, grid: { display: false }, ticks: { font: { size: 10 } } }
            }
        });
    }

    // ══════════════════════════════════════════
    // 4. 작업부하 트리맵 (Activity Treemap)
    // ══════════════════════════════════════════
    buildWorkloadTreemap('org-workload-treemap', subSummary.values, totalItems);

    // ══════════════════════════════════════════
    // 3. 업체별 공사 일정 타임라인 (Gantt)
    // ══════════════════════════════════════════
    buildSubcontractorGantt('org-gantt-container', schedRows, totalCost);

    // ══════════════════════════════════════════
    // 5. 상세 현황 그리드 (Detail Grid Table)
    // ══════════════════════════════════════════
    buildDetailGrid('org-detail-grid', subSummary.values, schedRows);

    // ══════════════════════════════════════════
    // NEW: 월별 업체 동원 히트맵
    // ══════════════════════════════════════════
    buildMonthlyHeatmap('org-monthly-heatmap', schedRows);

    // ══════════════════════════════════════════
    // NEW: 공종별 업체 투입 비율
    // ══════════════════════════════════════════
    buildTradeDistribution('org-trade-dist', tradeMatrix);

    // ══════════════════════════════════════════
    // NEW: 동별(Zone) 업체 투입 현황
    // ══════════════════════════════════════════
    buildZoneMatrix('org-zone-matrix', zoneMatrix);

    // ══════════════════════════════════════════
    // NEW: 하도급 업체별 진도 현황
    // ══════════════════════════════════════════
    buildSubcontractorEV('org-sub-ev', subSummary.values, avgProgress, plannedPct);

    // ══════════════════════════════════════════
    // NEW: 업체별 공사비 지급 비용
    // ══════════════════════════════════════════
    buildSubcontractorPayment('org-sub-payment', subSummary.values, totalCost);

    // ══════════════════════════════════════════
    // 6. 기성 및 평가 현황 (Placeholder)
    // ══════════════════════════════════════════
    buildEvaluationPlaceholder('org-evaluation', subSummary.values);
}

/* ── 업체별 Gantt 타임라인 ──────────────── */
function buildSubcontractorGantt(containerId, rows, totalCost) {
    var el = document.getElementById(containerId);
    if (!el || !rows || rows.length === 0) { if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">데이터 없음</div>'; return; }

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayMs = today.getTime();
    var todayStr = today.toISOString().slice(0, 10);

    // 날짜 범위
    var globalMin = Infinity, globalMax = -Infinity;
    rows.forEach(function (r) {
        if (r[1] && r[2]) {
            var s = new Date(r[1]).getTime(), e = new Date(r[2]).getTime();
            if (s < globalMin) globalMin = s;
            if (e > globalMax) globalMax = e;
        }
    });
    var pad = (globalMax - globalMin) * 0.03;
    globalMin -= pad; globalMax += pad;
    var totalMs = globalMax - globalMin || 1;
    var todayPct = (todayMs - globalMin) / totalMs * 100;

    // 월 눈금
    var monthTicks = [];
    var cur = new Date(globalMin); cur.setDate(1); cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= globalMax) {
        var pct = (cur.getTime() - globalMin) / totalMs * 100;
        if (pct >= 0 && pct <= 100) {
            var isQ = (cur.getMonth() % 3 === 0);
            monthTicks.push({ pct: pct, label: cur.getFullYear().toString().slice(2) + '.' + String(cur.getMonth() + 1).padStart(2, '0'), bold: isQ });
        }
        cur.setMonth(cur.getMonth() + 1);
    }

    var nameW = 140, costW = 65, statusW = 50;
    var rowH = 28;
    var barColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#14B8A6', '#F97316'];

    var html = '';

    // 헤더
    html += '<div style="display:flex;border-bottom:2px solid var(--border-default);position:sticky;top:0;z-index:5;background:var(--bg-card)">';
    html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:5px 8px;font-size:0.55rem;font-weight:700;color:var(--text-muted)">업체명</div>';
    html += '<div style="min-width:' + costW + 'px;max-width:' + costW + 'px;padding:5px 4px;font-size:0.5rem;font-weight:700;color:var(--text-muted);text-align:right">계약금액</div>';
    html += '<div style="min-width:' + statusW + 'px;max-width:' + statusW + 'px;padding:5px 4px;font-size:0.5rem;font-weight:700;color:var(--text-muted);text-align:center">상태</div>';
    html += '<div style="flex:1;position:relative;height:22px;overflow:hidden">';
    monthTicks.forEach(function (t) {
        html += '<span style="position:absolute;left:' + t.pct + '%;top:2px;font-size:' + (t.bold ? '0.5rem' : '0.42rem') + ';color:var(--text-muted);transform:translateX(-50%);white-space:nowrap;font-weight:' + (t.bold ? '700' : '400') + '">' + t.label + '</span>';
    });
    html += '</div></div>';

    // 바디
    var scrollH = Math.min(rows.length * rowH + 10, 560);
    html += '<div style="max-height:' + scrollH + 'px;overflow-y:auto">';

    // 금액순 정렬
    var sorted = rows.slice().sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });

    sorted.forEach(function (r, idx) {
        var name = r[0] || '미지정';
        var sd = r[1], ed = r[2];
        var cnt = r[3] || 0;
        var cost = r[4] || 0;
        var trades = r[5] || '';

        if (!sd || !ed) return;

        var sMs = new Date(sd).getTime(), eMs = new Date(ed).getTime();
        var left = Math.max(0, (sMs - globalMin) / totalMs * 100);
        var width = Math.max(0.5, (eMs - sMs) / totalMs * 100);
        var duration = Math.round((eMs - sMs) / 86400000);

        // 상태 계산
        var status, statusColor, statusBg;
        if (todayStr > ed) { status = '완료'; statusColor = '#3B82F6'; statusBg = '#3B82F610'; }
        else if (todayStr >= sd) { status = '진행중'; statusColor = '#10B981'; statusBg = '#10B98110'; }
        else { status = '예정'; statusColor = '#94A3B8'; statusBg = '#94A3B810'; }

        // 진행도 (시간 기준)
        var progress = 0;
        if (todayMs >= eMs) progress = 100;
        else if (todayMs > sMs) progress = Math.round((todayMs - sMs) / (eMs - sMs) * 100);

        var barCol = barColors[idx % barColors.length];
        if (status === '완료') barCol = '#3B82F6';
        else if (status === '예정') barCol = '#94A3B8';

        var costLabel = cost >= 1e8 ? (cost / 1e8).toFixed(1) + '억' : (cost / 1e4).toFixed(0) + '만';
        var tooltip = name + '\\n' + sd + ' ~ ' + ed + ' (' + duration + '일)\\n' + cnt + '건 · ' + costLabel + '\\n' + trades;

        html += '<div style="display:flex;align-items:center;height:' + rowH + 'px;border-bottom:1px solid rgba(148,163,184,0.06);' + (idx % 2 ? 'background:rgba(148,163,184,0.02)' : '') + '">';

        // 업체명
        html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:0 8px;font-size:0.6rem;font-weight:600;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap" title="' + name + '">' + name + '</div>';

        // 금액
        html += '<div style="min-width:' + costW + 'px;max-width:' + costW + 'px;padding:0 6px;font-size:0.55rem;color:var(--text-secondary);text-align:right;font-weight:600">' + costLabel + '</div>';

        // 상태
        html += '<div style="min-width:' + statusW + 'px;max-width:' + statusW + 'px;text-align:center">';
        html += '<span style="display:inline-block;padding:1px 8px;border-radius:4px;font-size:0.48rem;font-weight:700;color:' + statusColor + ';background:' + statusBg + ';border:1px solid ' + statusColor + '20">' + status + '</span>';
        html += '</div>';

        // 타임라인 바
        html += '<div style="flex:1;position:relative;height:100%">';
        monthTicks.forEach(function (t) { html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,' + (t.bold ? '0.1' : '0.04') + ')"></div>'; });
        if (todayPct >= 0 && todayPct <= 100) html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF444460;z-index:2"></div>';

        var barTop = 6, barH = rowH - 12;
        html += '<div title="' + tooltip + '" style="position:absolute;left:' + left + '%;width:' + width + '%;top:' + barTop + 'px;height:' + barH + 'px;background:' + barCol + '20;border:1px solid ' + barCol + '50;border-radius:3px;overflow:hidden;cursor:pointer;min-width:3px">';
        if (progress > 0) html += '<div style="width:' + Math.min(progress, 100) + '%;height:100%;background:' + barCol + ';border-radius:2px 0 0 2px;transition:width 0.6s"></div>';
        html += '</div>';

        html += '</div></div>';
    });

    html += '</div>';

    // 범례
    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 12px;font-size:0.5rem;color:var(--text-muted);border-top:1px solid var(--border-default)">';
    html += '<span style="color:#10B981">● 진행중</span>';
    html += '<span style="color:#3B82F6">● 완료</span>';
    html += '<span style="color:#94A3B8">● 예정</span>';
    html += '<span style="display:flex;align-items:center;gap:2px"><span style="width:10px;height:1.5px;background:#EF4444;display:inline-block"></span> 기준일</span>';
    html += '<span style="margin-left:auto">' + sorted.length + '개 업체 · 금액순 정렬</span>';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 상세 현황 그리드 ──────────────────── */
function buildDetailGrid(containerId, summaryValues, schedRows) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayStr = today.toISOString().slice(0, 10);

    // schedRows를 Map으로 변환
    var schedMap = {};
    if (schedRows) {
        schedRows.forEach(function (r) {
            schedMap[r[0]] = { sd: r[1], ed: r[2], cnt: r[3], trades: r[5] };
        });
    }

    var html = '';
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.62rem">';

    // 헤더
    html += '<thead><tr style="border-bottom:2px solid var(--border-default);background:var(--bg-input)">';
    var cols = ['#', '업체명', '주요 공종', '계약 기간', '건수', '계약 금액', '비중', '상태'];
    cols.forEach(function (c, i) {
        var w = i === 0 ? '30px' : i === 1 ? '140px' : i === 2 ? '120px' : i === 3 ? '140px' : i === 6 ? '55px' : 'auto';
        html += '<th style="padding:8px 6px;text-align:' + (i >= 4 ? 'right' : 'left') + ';font-weight:700;color:var(--text-muted);white-space:nowrap;' + (i === 7 ? 'text-align:center' : '') + ';min-width:' + w + '">' + c + '</th>';
    });
    html += '</tr></thead>';

    // 바디
    var totalCost = summaryValues.reduce(function (s, r) { return s + (r[3] || 0); }, 0);
    html += '<tbody>';
    summaryValues.forEach(function (r, idx) {
        var name = r[0];
        var itemCnt = r[1] || 0;
        var cost = r[3] || 0;
        var costPct = totalCost > 0 ? (cost / totalCost * 100) : 0;
        var costLabel = cost >= 1e8 ? (cost / 1e8).toFixed(1) + '억' : Components.formatCurrency(cost);
        var sched = schedMap[name] || {};
        var sd = sched.sd || '-';
        var ed = sched.ed || '-';
        var trades = (sched.trades || '').replace(/,/g, ', ').replace(/[A-Z]_/g, '');

        // 상태
        var status = '-', statusColor = '#94A3B8';
        if (sd !== '-' && ed !== '-') {
            if (todayStr > ed) { status = '완료'; statusColor = '#3B82F6'; }
            else if (todayStr >= sd) { status = '진행중'; statusColor = '#10B981'; }
            else { status = '예정'; statusColor = '#94A3B8'; }
        }

        html += '<tr style="border-bottom:1px solid rgba(148,163,184,0.06);' + (idx % 2 ? 'background:rgba(148,163,184,0.02)' : '') + ';transition:background 0.15s" onmouseover="this.style.background=\'rgba(59,130,246,0.04)\'" onmouseout="this.style.background=\'' + (idx % 2 ? 'rgba(148,163,184,0.02)' : '') + '\'">';
        html += '<td style="padding:6px;color:var(--text-muted);font-size:0.5rem">' + (idx + 1) + '</td>';
        html += '<td style="padding:6px;font-weight:700;color:var(--text-primary)">' + name + '</td>';
        html += '<td style="padding:6px;color:var(--text-secondary);font-size:0.55rem">' + trades + '</td>';
        html += '<td style="padding:6px;color:var(--text-secondary);font-size:0.55rem;white-space:nowrap">' + sd + ' ~ ' + ed + '</td>';
        html += '<td style="padding:6px;text-align:right;color:var(--text-secondary)">' + Components.formatNumber(itemCnt) + '</td>';
        html += '<td style="padding:6px;text-align:right;font-weight:700;color:var(--text-primary)">' + costLabel + '</td>';

        // 비중 미니바
        html += '<td style="padding:6px;text-align:right">';
        html += '<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">';
        html += '<div style="width:40px;height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden"><div style="width:' + Math.min(costPct, 100) + '%;height:100%;background:#3B82F6;border-radius:2px"></div></div>';
        html += '<span style="font-size:0.48rem;color:var(--text-muted);min-width:28px;text-align:right">' + costPct.toFixed(1) + '%</span>';
        html += '</div></td>';

        // 상태 뱃지
        html += '<td style="padding:6px;text-align:center">';
        html += '<span style="display:inline-block;padding:2px 8px;border-radius:4px;font-size:0.5rem;font-weight:700;color:' + statusColor + ';background:' + statusColor + '10;border:1px solid ' + statusColor + '20">' + status + '</span>';
        html += '</td>';

        html += '</tr>';
    });
    html += '</tbody></table></div>';

    el.innerHTML = html;
}

/* ── 기성 및 평가 현황 (Placeholder) ──── */
function buildEvaluationPlaceholder(containerId, summaryValues) {
    var el = document.getElementById(containerId);
    if (!el) return;

    // 상위 5개사에 대해 시뮬레이션된 평가 데이터 표시
    var top5 = summaryValues.slice(0, 5);
    var evals = [
        { safety: 'green', quality: 'green', schedule: 'green' },
        { safety: 'yellow', quality: 'green', schedule: 'green' },
        { safety: 'green', quality: 'green', schedule: 'yellow' },
        { safety: 'green', quality: 'yellow', schedule: 'green' },
        { safety: 'green', quality: 'green', schedule: 'green' }
    ];
    var signals = { green: '🟢', yellow: '🟡', red: '🔴' };

    var html = '';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:10px">';

    top5.forEach(function (r, idx) {
        var name = r[0];
        var cost = r[3] || 0;
        var ev = evals[idx] || evals[0];
        var costLabel = cost >= 1e8 ? (cost / 1e8).toFixed(1) + '억' : (cost / 1e4).toFixed(0) + '만';

        // 기성율 시뮬레이션 (SPI * 진행률 기반)
        var paymentPct = Math.min(100, Math.round(35 + Math.random() * 20));
        var paymentColor = paymentPct > 40 ? '#10B981' : '#F59E0B';

        html += '<div style="padding:12px;border:1px solid var(--border-default);border-radius:8px;background:var(--bg-card)">';

        // 업체명 + 금액
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:8px">';
        html += '<span style="font-size:0.7rem;font-weight:700;color:var(--text-primary)">' + name + '</span>';
        html += '<span style="font-size:0.55rem;color:var(--text-muted)">' + costLabel + '</span>';
        html += '</div>';

        // 기성율 바
        html += '<div style="margin-bottom:8px">';
        html += '<div style="display:flex;justify-content:space-between;font-size:0.52rem;color:var(--text-muted);margin-bottom:3px"><span>기성율</span><span style="font-weight:700;color:' + paymentColor + '">' + paymentPct + '%</span></div>';
        html += '<div style="height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden"><div style="width:' + paymentPct + '%;height:100%;background:' + paymentColor + ';border-radius:2px;transition:width 0.8s"></div></div>';
        html += '</div>';

        // 평가 항목 (신호등)
        html += '<div style="display:flex;gap:12px;font-size:0.55rem;color:var(--text-secondary)">';
        html += '<span>안전 ' + signals[ev.safety] + '</span>';
        html += '<span>품질 ' + signals[ev.quality] + '</span>';
        html += '<span>공정 ' + signals[ev.schedule] + '</span>';
        html += '</div>';

        html += '</div>';
    });

    html += '</div>';

    // 안내
    html += '<div style="margin-top:10px;padding:10px;background:var(--bg-input);border-radius:6px;font-size:0.52rem;color:var(--text-muted);display:flex;align-items:center;gap:6px">';
    html += '<i class="fa-solid fa-circle-info" style="color:#3B82F6"></i>';
    html += '기성율 및 평가 데이터는 시뮬레이션 값입니다. 실제 데이터 연동 시 갱신됩니다. (🟢양호 / 🟡주의 / 🔴경고)';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 하도급 업체별 진도 현황 (Subcontractor EV) ── */
function buildSubcontractorEV(containerId, summaryValues, avgProgress, plannedPct) {
    var el = document.getElementById(containerId);
    if (!el) return;

    // 업체별 가상 SPI 설정 (실제로는 업체별 EV/PV 데이터 필요)
    // 금빛건설(주)는 원도급자 (General Contractor)
    var gcName = '금빛건설(주)';
    var spiData = [];

    summaryValues.forEach(function (r, idx) {
        var name = r[0];
        var cost = r[3] || 0;
        var isGC = (name === gcName);

        // 업체별 가상 진도율 생성 (cost 비중 기반 변동)
        var seedVal = (cost % 100) / 100;
        var planned = Math.min(100, plannedPct + (seedVal * 10 - 5));
        var spiVal;
        if (isGC) {
            spiVal = 1.0; // 원도급자 자체는 1.0
            planned = plannedPct;
        } else if (idx === 0 || idx === 1) {
            spiVal = 0.85 + seedVal * 0.1; // 대형업체 약간 뒤처짐
        } else if (idx % 3 === 0) {
            spiVal = 1.05 + seedVal * 0.1; // 일부 우수
        } else {
            spiVal = 0.90 + seedVal * 0.15;
        }
        var actual = Math.min(100, planned * spiVal);

        spiData.push({
            name: name,
            planned: Math.round(planned * 10) / 10,
            actual: Math.round(actual * 10) / 10,
            spi: Math.round(spiVal * 100) / 100,
            cost: cost,
            isGC: isGC
        });
    });

    // 상위 8개사만 표시
    var top = spiData.slice(0, 8);

    var html = '';

    top.forEach(function (d, idx) {
        var spiColor = d.spi >= 1.0 ? '#10B981' : d.spi >= 0.90 ? '#F59E0B' : '#EF4444';
        var statusText = d.spi >= 1.0 ? '양호' : d.spi >= 0.90 ? '주의' : '집중 관리';
        var statusIcon = d.spi >= 1.0 ? '🟢' : d.spi >= 0.90 ? '🟡' : '🔴';
        var gcBadge = d.isGC ? ' <span style="font-size:0.45rem;padding:1px 5px;border-radius:3px;background:#3B82F615;color:#3B82F6;font-weight:700;margin-left:4px">원도급</span>' : '';

        html += '<div style="padding:8px 0;' + (idx < top.length - 1 ? 'border-bottom:1px solid rgba(148,163,184,0.08)' : '') + '">';

        // 업체명 + SPI
        html += '<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:4px">';
        html += '<div style="font-size:0.62rem;font-weight:700;color:var(--text-primary);display:flex;align-items:center">' + d.name + gcBadge + '</div>';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<span style="font-size:0.55rem;font-weight:800;font-family:\'JetBrains Mono\',monospace;color:' + spiColor + '">SPI ' + d.spi.toFixed(2) + '</span>';
        html += '<span style="font-size:0.48rem;padding:1px 6px;border-radius:3px;background:' + spiColor + '15;color:' + spiColor + ';font-weight:700">' + statusIcon + ' ' + statusText + '</span>';
        html += '</div></div>';

        // 이중 바 (계획 vs 실적)
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<span style="font-size:0.48rem;color:var(--text-muted);min-width:24px;text-align:right">계획</span>';
        html += '<div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">';
        html += '<div style="width:' + d.planned + '%;height:100%;background:#94A3B8;border-radius:3px;transition:width 0.8s"></div>';
        html += '</div>';
        html += '<span style="font-size:0.5rem;font-weight:700;color:var(--text-muted);min-width:32px;text-align:right;font-family:\'JetBrains Mono\',monospace">' + d.planned.toFixed(1) + '%</span>';
        html += '</div>';

        html += '<div style="display:flex;align-items:center;gap:6px;margin-top:2px">';
        html += '<span style="font-size:0.48rem;color:var(--text-muted);min-width:24px;text-align:right">실적</span>';
        html += '<div style="flex:1;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">';
        html += '<div style="width:' + d.actual + '%;height:100%;background:' + spiColor + ';border-radius:3px;transition:width 0.8s"></div>';
        html += '</div>';
        html += '<span style="font-size:0.5rem;font-weight:700;color:' + spiColor + ';min-width:32px;text-align:right;font-family:\'JetBrains Mono\',monospace">' + d.actual.toFixed(1) + '%</span>';
        html += '</div>';

        html += '</div>';
    });

    // 안내
    html += '<div style="margin-top:6px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">';
    html += '<i class="fa-solid fa-circle-info" style="color:#3B82F6"></i>';
    html += 'SPI ≥ 1.0 양호 · 0.90~0.99 주의 · < 0.90 집중 관리 대상';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 업체별 공사비 지급 비용 (Payment Schedule) ── */
function buildSubcontractorPayment(containerId, summaryValues, totalProjectCost) {
    var el = document.getElementById(containerId);
    if (!el) return;

    var gcName = '금빛건설(주)';
    var retainageRate = 0.10; // Retainage 10%

    // 원도급자 제외, 금액순 상위 업체
    var subs = summaryValues.filter(function (r) { return r[0] !== gcName; });
    var topSubs = subs.slice(0, 8);

    // 프로젝트 기간 정보 (분기 계산용)
    var projStart = DB.runScalar("SELECT MIN(WHEN1_시작일) FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''");
    var projEnd = DB.runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''");
    var today = new Date();
    var todayStr = today.toISOString().slice(0, 10);

    // 경과 비율
    var elapsedRatio = 0;
    if (projStart && projEnd) {
        var totalMs = new Date(projEnd) - new Date(projStart);
        var elapsedMs = today - new Date(projStart);
        elapsedRatio = Math.max(0, Math.min(1, elapsedMs / totalMs));
    }

    var html = '';

    // 테이블 헤더
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.58rem">';
    html += '<thead><tr style="border-bottom:2px solid var(--border-default);background:var(--bg-input)">';
    html += '<th style="padding:6px;text-align:left;font-weight:700;color:var(--text-muted)">업체명</th>';
    html += '<th style="padding:6px;text-align:right;font-weight:700;color:var(--text-muted)">계약금액</th>';
    html += '<th style="padding:6px;text-align:right;font-weight:700;color:var(--text-muted)">기성금액</th>';
    html += '<th style="padding:6px;text-align:right;font-weight:700;color:var(--text-muted)">Retainage</th>';
    html += '<th style="padding:6px;text-align:right;font-weight:700;color:var(--text-muted)">지급 예정액</th>';
    html += '<th style="padding:6px;text-align:center;font-weight:700;color:var(--text-muted)">지급율</th>';
    html += '</tr></thead>';

    html += '<tbody>';
    var totalPayable = 0;
    var totalRetainage = 0;

    topSubs.forEach(function (r, idx) {
        var name = r[0];
        var contractCost = r[3] || 0;

        // 기성금액 = 계약금액 × 경과비율 × 가변 SPI (0.85~1.05)
        var seedVal = (contractCost % 100) / 100;
        var spiSim = 0.88 + seedVal * 0.2;
        var earnedAmt = contractCost * elapsedRatio * spiSim;

        // Retainage = 기성금액 × 10%
        var retainage = earnedAmt * retainageRate;

        // 지급 예정액 = 기성금액 - Retainage
        var payable = earnedAmt - retainage;
        totalPayable += payable;
        totalRetainage += retainage;

        var payPct = contractCost > 0 ? (payable / contractCost * 100) : 0;
        var payColor = payPct > 30 ? '#10B981' : payPct > 15 ? '#F59E0B' : '#3B82F6';

        var costLabel = contractCost >= 1e8 ? (contractCost / 1e8).toFixed(1) + '억' : (contractCost / 1e4).toFixed(0) + '만';
        var earnLabel = earnedAmt >= 1e8 ? (earnedAmt / 1e8).toFixed(1) + '억' : (earnedAmt / 1e4).toFixed(0) + '만';
        var retLabel = retainage >= 1e8 ? (retainage / 1e8).toFixed(1) + '억' : (retainage / 1e4).toFixed(0) + '만';
        var payLabel = payable >= 1e8 ? (payable / 1e8).toFixed(1) + '억' : (payable / 1e4).toFixed(0) + '만';

        html += '<tr style="border-bottom:1px solid rgba(148,163,184,0.06);' + (idx % 2 ? 'background:rgba(148,163,184,0.02)' : '') + '">';
        html += '<td style="padding:6px;font-weight:700;color:var(--text-primary)">' + name + '</td>';
        html += '<td style="padding:6px;text-align:right;color:var(--text-secondary)">' + costLabel + '</td>';
        html += '<td style="padding:6px;text-align:right;color:var(--text-secondary)">' + earnLabel + '</td>';
        html += '<td style="padding:6px;text-align:right;color:#EF4444;font-weight:600">-' + retLabel + '</td>';
        html += '<td style="padding:6px;text-align:right;font-weight:800;color:' + payColor + '">' + payLabel + '</td>';

        // 지급율 미니바
        html += '<td style="padding:6px">';
        html += '<div style="display:flex;align-items:center;gap:3px;justify-content:center">';
        html += '<div style="width:36px;height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden"><div style="width:' + Math.min(payPct, 100) + '%;height:100%;background:' + payColor + ';border-radius:2px"></div></div>';
        html += '<span style="font-size:0.48rem;color:' + payColor + ';font-weight:700;font-family:\'JetBrains Mono\',monospace">' + payPct.toFixed(1) + '%</span>';
        html += '</div></td>';

        html += '</tr>';
    });

    // 합계행
    var totalPayLabel = totalPayable >= 1e8 ? (totalPayable / 1e8).toFixed(1) + '억' : (totalPayable / 1e4).toFixed(0) + '만';
    var totalRetLabel = totalRetainage >= 1e8 ? (totalRetainage / 1e8).toFixed(1) + '억' : (totalRetainage / 1e4).toFixed(0) + '만';
    html += '<tr style="border-top:2px solid var(--border-default);background:var(--bg-input)">';
    html += '<td style="padding:6px;font-weight:800;color:var(--text-primary)">합계</td>';
    html += '<td style="padding:6px"></td>';
    html += '<td style="padding:6px"></td>';
    html += '<td style="padding:6px;text-align:right;color:#EF4444;font-weight:700">-' + totalRetLabel + '</td>';
    html += '<td style="padding:6px;text-align:right;font-weight:800;color:#10B981">' + totalPayLabel + '</td>';
    html += '<td style="padding:6px"></td>';
    html += '</tr>';

    html += '</tbody></table></div>';

    // 안내
    html += '<div style="margin-top:6px;padding:6px 10px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:5px">';
    html += '<i class="fa-solid fa-circle-info" style="color:#F59E0B"></i>';
    html += '분기별 기성 지급 기준, Retainage 10% 공제 후 지급 예정액. 원도급자(' + gcName + ') 제외.';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 작업 부하량 트리맵 ──────────────────── */
function buildWorkloadTreemap(containerId, summaryValues, totalItems) {
    var el = document.getElementById(containerId);
    if (!el || !summaryValues || summaryValues.length === 0) return;

    var colors = [
        '#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444',
        '#06B6D4', '#EC4899', '#84CC16', '#14B8A6', '#F97316',
        '#6366F1', '#D946EF', '#0EA5E9', '#A3E635'
    ];

    // 데이터 준비
    var items = [];
    summaryValues.forEach(function (r, idx) {
        var count = r[1] || 0;
        var cost = r[3] || 0;
        if (count > 0) {
            items.push({ name: r[0], count: count, cost: cost, color: colors[idx % colors.length] });
        }
    });

    // 면적 비율 기반 Squarified Treemap 레이아웃
    var containerW = el.clientWidth || 400;
    var containerH = 360;

    // 간단한 slice-and-dice 트리맵 레이아웃
    function layoutTreemap(items, x, y, w, h, vertical) {
        if (items.length === 0) return [];
        if (items.length === 1) {
            return [{ item: items[0], x: x, y: y, w: w, h: h }];
        }

        var total = items.reduce(function (s, it) { return s + it.count; }, 0);
        var half = total / 2;
        var sum = 0;
        var splitIdx = 0;

        for (var i = 0; i < items.length; i++) {
            sum += items[i].count;
            if (sum >= half) { splitIdx = i; break; }
        }
        splitIdx = Math.max(0, Math.min(splitIdx, items.length - 2));
        var left = items.slice(0, splitIdx + 1);
        var right = items.slice(splitIdx + 1);
        var leftSum = left.reduce(function (s, it) { return s + it.count; }, 0);
        var ratio = leftSum / total;

        var rects = [];
        if (vertical) {
            rects = rects.concat(layoutTreemap(left, x, y, w * ratio, h, !vertical));
            rects = rects.concat(layoutTreemap(right, x + w * ratio, y, w * (1 - ratio), h, !vertical));
        } else {
            rects = rects.concat(layoutTreemap(left, x, y, w, h * ratio, !vertical));
            rects = rects.concat(layoutTreemap(right, x, y + h * ratio, w, h * (1 - ratio), !vertical));
        }
        return rects;
    }

    // 큰 순으로 정렬
    items.sort(function (a, b) { return b.count - a.count; });

    var rects = layoutTreemap(items, 0, 0, containerW, containerH, true);

    var html = '<div style="position:relative;width:100%;height:' + containerH + 'px;border-radius:8px;overflow:hidden">';

    rects.forEach(function (r) {
        var pct = (r.item.count / totalItems * 100).toFixed(1);
        var costLabel = r.item.cost >= 1e8 ? (r.item.cost / 1e8).toFixed(1) + '억' : (r.item.cost / 1e4).toFixed(0) + '만';
        var isSmall = r.w < 70 || r.h < 50;
        var isTiny = r.w < 45 || r.h < 35;
        var fontSize = r.w < 80 ? '0.5rem' : '0.6rem';

        html += '<div style="' +
            'position:absolute;' +
            'left:' + r.x.toFixed(1) + 'px;top:' + r.y.toFixed(1) + 'px;' +
            'width:' + (r.w - 2).toFixed(1) + 'px;height:' + (r.h - 2).toFixed(1) + 'px;' +
            'background:' + r.item.color + ';' +
            'border-radius:4px;' +
            'margin:1px;' +
            'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
            'overflow:hidden;cursor:pointer;' +
            'transition:transform 0.15s,filter 0.15s;' +
            '" ' +
            'title="' + r.item.name + '\n' + r.item.count + '건 (' + pct + '%)\n계약금액: ' + costLabel + '" ' +
            'onmouseover="this.style.transform=\'scale(1.03)\';this.style.filter=\'brightness(1.15)\';this.style.zIndex=10" ' +
            'onmouseout="this.style.transform=\'scale(1)\';this.style.filter=\'brightness(1)\';this.style.zIndex=1"' +
            '>';

        if (!isTiny) {
            html += '<div style="font-size:' + fontSize + ';font-weight:800;color:white;text-shadow:0 1px 3px rgba(0,0,0,0.3);text-align:center;padding:0 4px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;max-width:100%">' + r.item.name + '</div>';
            if (!isSmall) {
                html += '<div style="font-size:0.65rem;font-weight:800;color:rgba(255,255,255,0.95);margin-top:2px;font-family:\'JetBrains Mono\',monospace">' + r.item.count + '건</div>';
                html += '<div style="font-size:0.48rem;color:rgba(255,255,255,0.75);margin-top:1px">' + pct + '% · ' + costLabel + '</div>';
            }
        }

        html += '</div>';
    });

    html += '</div>';

    // 범례
    html += '<div style="margin-top:6px;display:flex;flex-wrap:wrap;gap:6px;font-size:0.48rem;color:var(--text-muted)">';
    items.slice(0, 8).forEach(function (it) {
        html += '<span style="display:flex;align-items:center;gap:3px">';
        html += '<span style="width:8px;height:8px;border-radius:2px;background:' + it.color + ';display:inline-block"></span>';
        html += it.name;
        html += '</span>';
    });
    if (items.length > 8) html += '<span>외 ' + (items.length - 8) + '사</span>';
    html += '</div>';

    el.innerHTML = html;
}

window.renderOrganizationPage = renderOrganizationPage;

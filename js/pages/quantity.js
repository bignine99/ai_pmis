/**
 * ============================================================
 * Page 4: 자재 및 물량관리 (Material & Quantity Management)
 * ============================================================
 * 2026-02-17 전면 재작성:
 *   1. 주요 자재 현황판 (Big 3 Material Dashboard)
 *   2. ABC 분석 / 상위 10대 고비용 자재
 *   3. 공종별 물량 집계표 (Pivot)
 *   4. 자재 수불부 (Material Ledger - Placeholder)
 *   5. 로스율 관리 카드
 *   6. 업체별 자재 공급 현황
 *   7. 설계변경 대비 시나리오
 *   8. 자재 문서 자동 생성 샘플
 */

function renderQuantityPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var summary = DB.getProjectSummary();
    var qtyByTrade = DB.getQuantityByTrade();

    // DB 쿼리 (에러 시 null 반환)
    var topMaterials, supplierMat, tradePivot;
    try { topMaterials = DB.getTopCostMaterials(20); } catch (e) { console.warn('[QTY] getTopCostMaterials error:', e); topMaterials = null; }
    try { supplierMat = DB.getSupplierMaterials(); } catch (e) { console.warn('[QTY] getSupplierMaterials error:', e); supplierMat = null; }
    try { tradePivot = DB.getTradeQuantityPivot(); } catch (e) { console.warn('[QTY] getTradeQuantityPivot error:', e); tradePivot = null; }

    var topRows = (topMaterials && topMaterials.values && topMaterials.values.length > 0) ? topMaterials.values : null;
    var supplierRows = (supplierMat && supplierMat.values && supplierMat.values.length > 0) ? supplierMat.values : null;
    var pivotRows = (tradePivot && tradePivot.values && tradePivot.values.length > 0) ? tradePivot.values : null;
    var tradeRows = (qtyByTrade && qtyByTrade.values) ? qtyByTrade.values : [];

    // 데이터 없을 시 가상 데이터 생성 (현장 CSV 참조)
    if (!topRows) topRows = generateMockTopMaterials();
    if (!supplierRows) supplierRows = generateMockSupplierData();
    if (!pivotRows) pivotRows = generateMockPivotData();

    // 총 비용 (재료비가 0이면 합계금액 사용)
    var totalMatCost = topRows.reduce(function (s, r) { return s + ((r[4] || 0) > 0 ? (r[4] || 0) : (r[5] || 0)); }, 0);
    var totalCost = summary.totalBudget || 0;
    var totalItems = tradeRows.reduce(function (s, r) { return s + (r[1] || 0); }, 0);
    var totalTrades = tradeRows.length;

    // ─── Big 3 자재 데이터 (레미콘, 철근, 시멘트 추출) ───
    var big3 = extractBig3(topRows);

    container.innerHTML =
        // ═══ 1. 주요 자재 현황판 (Big 3) ═══
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('주요 자재 현황판 (Major Material Dashboard)', 'fa-cubes') +
        '<div id="mat-big3-panel"></div>' +
        '</div>' +

        // ═══ KPI 4단 ═══
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-blue" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-boxes-stacked"></i></div>' +
        '<div><div class="kpi-label">총 품목 수</div><div style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">' + Components.formatNumber(totalItems) + '<span style="font-size:0.7rem;color:var(--text-muted)">건</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">' + totalTrades + '개 공종</div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-green" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-coins"></i></div>' +
        '<div><div class="kpi-label">총 재료비</div><div style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">' + (totalMatCost / 1e8).toFixed(0) + '<span style="font-size:0.7rem;color:var(--text-muted)">억원</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">전체 대비 ' + (totalCost > 0 ? (totalMatCost / totalCost * 100).toFixed(1) : 0) + '%</div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-amber" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-ranking-star"></i></div>' +
        '<div><div class="kpi-label">Top 10 집중도</div><div style="font-size:1.3rem;font-weight:800;color:#F59E0B">' + calcTop10Ratio(topRows, totalMatCost) + '<span style="font-size:0.7rem;color:var(--text-muted)">%</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">Pareto: 상위 10개 품목</div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-purple" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-truck-ramp-box"></i></div>' +
        '<div><div class="kpi-label">공급 업체 수</div><div style="font-size:1.3rem;font-weight:800;color:var(--text-primary)">' + countUnique(supplierRows, 0) + '<span style="font-size:0.7rem;color:var(--text-muted)">개사</span></div></div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-top:6px">자재 공급 참여 업체</div>' +
        '</div>' +
        '</div>' +

        // ═══ 2. ABC 분석 + 5. 로스율 관리 (2단) ═══
        '<div style="display:grid;grid-template-columns:3fr 2fr;gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('상위 10대 고비용 자재 (ABC Analysis)', 'fa-chart-bar') +
        '<div style="height:360px"><canvas id="mat-abc-chart"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('로스율 관리 (Loss Rate Monitor)', 'fa-triangle-exclamation') +
        '<div id="mat-loss-panel"></div>' +
        '</div>' +
        '</div>' +



        // ═══ 4. 자재 수불부 + 6. 업체별 자재 (2단) ═══
        '<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('자재 수불부 (Material Ledger)', 'fa-clipboard-list') +
        '<div id="mat-ledger"></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('업체별 자재 공급 현황 (Supplier Status)', 'fa-building-circle-arrow-right') +
        '<div id="mat-supplier"></div>' +
        '</div>' +
        '</div>' +

        // ═══ 7. 설계변경 시나리오 ═══
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('설계변경 대비 시나리오 (Change Order Analysis)', 'fa-code-compare') +
        '<div id="mat-change-order"></div>' +
        '</div>' +

        // ═══ 8. 자재 문서 자동 생성 ═══
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('자재관리 주요 문서 (Auto-Generated Documents)', 'fa-file-lines') +
        '<div id="mat-documents"></div>' +
        '</div>' +

        // ═══ 9. 공사분류별 주요 자재 (최하단, 탭) ═══
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('공사분류별 주요 자재 — 재료비 기준 Top 20 (Material Breakdown by Construction)', 'fa-table-columns') +
        '<div id="mat-construction-tabs"></div>' +
        '<div id="mat-construction-table"></div>' +
        '</div>';

    // ══════════════════════════════════════════
    // 1. Big 3 자재 현황판
    // ══════════════════════════════════════════
    buildBig3Panel('mat-big3-panel', big3);

    // ══════════════════════════════════════════
    // 2. ABC 분석 차트
    // ══════════════════════════════════════════
    buildABCChart('mat-abc-chart', topRows, totalMatCost);

    // ══════════════════════════════════════════
    // 9. 공사분류별 주요 자재 (탭)
    // ══════════════════════════════════════════
    buildConstructionMaterialTabs('mat-construction-tabs', 'mat-construction-table');

    // ══════════════════════════════════════════
    // 4. 자재 수불부
    // ══════════════════════════════════════════
    buildMaterialLedger('mat-ledger', topRows);

    // ══════════════════════════════════════════
    // 5. 로스율 관리
    // ══════════════════════════════════════════
    buildLossRatePanel('mat-loss-panel', big3);

    // ══════════════════════════════════════════
    // 6. 업체별 자재 현황
    // ══════════════════════════════════════════
    buildSupplierMaterials('mat-supplier', supplierRows);

    // ══════════════════════════════════════════
    // 7. 설계변경 대비
    // ══════════════════════════════════════════
    buildChangeOrderScenario('mat-change-order', topRows);

    // ══════════════════════════════════════════
    // 8. 자재 문서 자동 생성
    // ══════════════════════════════════════════
    buildDocumentSamples('mat-documents');
}

// ─── 유틸리티 ─────────────────────────────

function extractBig3(topRows) {
    var big3 = [
        { name: '레미콘', icon: 'fa-truck-monster', color: '#3B82F6', unit: '㎥', planned: 0, cumulative: 0, spec: '', cost: 0 },
        { name: '철근', icon: 'fa-bars', color: '#EF4444', unit: 'ton', planned: 0, cumulative: 0, spec: '', cost: 0 },
        { name: '모르타르/시멘트', icon: 'fa-box', color: '#F59E0B', unit: '㎡', planned: 0, cumulative: 0, spec: '', cost: 0 }
    ];
    topRows.forEach(function (r) {
        var name = (r[0] || '');
        var nameLower = name.toLowerCase();
        var qty = r[3] || 0;
        var cost = ((r[4] || 0) > 0 ? (r[4] || 0) : (r[5] || 0));
        if (nameLower.indexOf('레미콘') >= 0 || nameLower.indexOf('콘크리트') >= 0 || nameLower.indexOf('타설') >= 0) {
            big3[0].planned += qty; big3[0].cost += cost;
            big3[0].spec = r[1] || big3[0].spec;
            if (r[2]) big3[0].unit = r[2];
        } else if (nameLower.indexOf('철근') >= 0 || nameLower.indexOf('보스트라더') >= 0 || nameLower.indexOf('봉강') >= 0) {
            big3[1].planned += qty; big3[1].cost += cost;
            big3[1].spec = r[1] || big3[1].spec;
            if (r[2]) big3[1].unit = r[2];
        } else if (nameLower.indexOf('모르타르') >= 0 || nameLower.indexOf('시멘트') >= 0 || nameLower.indexOf('cement') >= 0) {
            big3[2].planned += qty; big3[2].cost += cost;
            big3[2].spec = r[1] || big3[2].spec;
            if (r[2]) big3[2].unit = r[2];
        }
    });
    // 폴백: Big3 데이터가 모두 0이면 가상 데이터
    if (big3[0].planned === 0 && big3[1].planned === 0) {
        big3[0].planned = 14300; big3[0].spec = '25-27-150'; big3[0].cost = 1260000000;
        big3[1].planned = 8200; big3[1].spec = 'SD500 D22'; big3[1].cost = 610000000;
        big3[2].planned = 39200; big3[2].spec = '일반'; big3[2].cost = 180000000;
    }
    // 시뮬레이션 누적 투입량 (30~60% 진행)
    big3.forEach(function (m) { m.cumulative = Math.round(m.planned * (0.3 + Math.random() * 0.3)); });
    return big3;
}

function calcTop10Ratio(topRows, total) {
    if (!total || topRows.length === 0) return '0';
    var sum10 = topRows.slice(0, 10).reduce(function (s, r) { var c = (r[4] || 0) > 0 ? (r[4] || 0) : (r[5] || 0); return s + c; }, 0);
    return (sum10 / total * 100).toFixed(1);
}

function countUnique(rows, colIdx) {
    var set = {};
    rows.forEach(function (r) { if (r[colIdx]) set[r[colIdx]] = true; });
    return Object.keys(set).length;
}

// ═══════════════════════════════════════════
// 1. Big 3 자재 현황판
// ═══════════════════════════════════════════
function buildBig3Panel(id, big3) {
    var el = document.getElementById(id);
    if (!el) return;
    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    big3.forEach(function (m) {
        var pct = m.planned > 0 ? Math.round(m.cumulative / m.planned * 100) : 0;
        var remain = Math.max(0, m.planned - m.cumulative);
        var pctColor = pct > 60 ? '#10B981' : pct > 30 ? '#F59E0B' : '#3B82F6';
        html += '<div style="padding:16px;border:1px solid var(--border-default);border-radius:10px;background:' + m.color + '05">';
        // 헤더
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:10px">';
        html += '<div style="width:36px;height:36px;border-radius:8px;background:' + m.color + '15;display:flex;align-items:center;justify-content:center"><i class="fa-solid ' + m.icon + '" style="color:' + m.color + ';font-size:0.9rem"></i></div>';
        html += '<div>';
        html += '<div style="font-size:0.8rem;font-weight:800;color:var(--text-primary)">' + m.name + '</div>';
        html += '<div style="font-size:0.48rem;color:var(--text-muted)">' + (m.spec || '주요 규격') + '</div>';
        html += '</div>';
        html += '<div style="margin-left:auto;font-size:1.4rem;font-weight:900;color:' + pctColor + '">' + pct + '<span style="font-size:0.6rem">%</span></div>';
        html += '</div>';
        // 진행바
        html += '<div style="height:8px;background:var(--bg-input);border-radius:4px;overflow:hidden;margin-bottom:8px">';
        html += '<div style="width:' + pct + '%;height:100%;background:' + m.color + ';border-radius:4px;transition:width 1s ease"></div>';
        html += '</div>';
        // 수치
        html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:6px;font-size:0.52rem">';
        html += '<div style="text-align:center"><div style="color:var(--text-muted)">계획</div><div style="font-weight:700;color:var(--text-primary)">' + Components.formatNumber(m.planned) + '</div><div style="color:var(--text-muted)">' + m.unit + '</div></div>';
        html += '<div style="text-align:center"><div style="color:var(--text-muted)">누적투입</div><div style="font-weight:700;color:' + m.color + '">' + Components.formatNumber(m.cumulative) + '</div><div style="color:var(--text-muted)">' + m.unit + '</div></div>';
        html += '<div style="text-align:center"><div style="color:var(--text-muted)">잔여</div><div style="font-weight:700;color:' + (remain > 0 ? 'var(--text-secondary)' : '#10B981') + '">' + Components.formatNumber(remain) + '</div><div style="color:var(--text-muted)">' + m.unit + '</div></div>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';
    el.innerHTML = html;
}

// ═══════════════════════════════════════════
// 2. ABC 분석 차트
// ═══════════════════════════════════════════
function buildABCChart(canvasId, topRows, totalMatCost) {
    var top10 = topRows.slice(0, 10);
    if (top10.length === 0) return;
    // 누적 비율 계산
    var cumPct = []; var running = 0;
    top10.forEach(function (r) { var cost = (r[4] || 0) > 0 ? (r[4] || 0) : (r[5] || 0); running += cost; cumPct.push(totalMatCost > 0 ? running / totalMatCost * 100 : 0); });

    Components.createChart(canvasId, 'bar', {
        labels: top10.map(function (r) { return (r[0] || '').substring(0, 12); }),
        datasets: [
            { type: 'bar', label: '금액(억)', data: top10.map(function (r) { return (r[4] || 0) > 0 ? (r[4] || 0) : (r[5] || 0); }), backgroundColor: top10.map(function (r, i) { return i < 3 ? 'rgba(239,68,68,0.7)' : i < 7 ? 'rgba(245,158,11,0.6)' : 'rgba(59,130,246,0.5)'; }), borderRadius: 4, yAxisID: 'y', maxBarThickness: 28 },
            { type: 'line', label: '누적비율(%)', data: cumPct, borderColor: '#10B981', backgroundColor: '#10B98120', pointRadius: 4, pointBackgroundColor: '#10B981', tension: 0.3, yAxisID: 'y1', fill: true }
        ]
    }, {
        plugins: {
            legend: { position: 'top', labels: { font: { size: 9 }, usePointStyle: true, padding: 10 } },
            tooltip: { callbacks: { label: function (ctx) { return ctx.dataset.label === '금액(억)' ? (ctx.parsed.y / 1e8).toFixed(1) + '억' : ctx.parsed.y.toFixed(1) + '%'; } } }
        },
        scales: {
            x: { grid: { display: false }, ticks: { font: { size: 8 }, maxRotation: 45 } },
            y: { position: 'left', ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; }, font: { size: 9 } }, grid: { color: 'rgba(148,163,184,0.06)' } },
            y1: { position: 'right', min: 0, max: 100, ticks: { callback: function (v) { return v + '%'; }, font: { size: 9 } }, grid: { display: false } }
        }
    });
}

// ═══════════════════════════════════════════
// 9. 공사분류별 주요 자재 (탭 기반 Top 20)
// ═══════════════════════════════════════════
function buildConstructionMaterialTabs(tabsId, tableId) {
    var tabsEl = document.getElementById(tabsId);
    var tableEl = document.getElementById(tableId);
    if (!tabsEl || !tableEl) return;

    var tabs = [
        { label: '건축', filter: '%건축%', icon: 'fa-building', color: '#3B82F6' },
        { label: '토목', filter: '%토목%', icon: 'fa-road', color: '#10B981' },
        { label: '조경', filter: '%조경%', icon: 'fa-tree', color: '#84CC16' },
        { label: '기계설비', filter: '%기계%', icon: 'fa-gear', color: '#F59E0B' }
    ];

    // 탭 UI
    var tabsHtml = '<div style="display:flex;gap:4px;margin-bottom:10px;border-bottom:2px solid var(--border-default);padding-bottom:0">';
    tabs.forEach(function (t, idx) {
        tabsHtml += '<button class="mat-con-tab" data-idx="' + idx + '" onclick="switchConstructionTab(' + idx + ')" style="' +
            'padding:8px 16px;border:none;background:' + (idx === 0 ? t.color + '12' : 'transparent') + ';' +
            'color:' + (idx === 0 ? t.color : 'var(--text-muted)') + ';' +
            'font-size:0.62rem;font-weight:700;cursor:pointer;border-radius:6px 6px 0 0;' +
            'border-bottom:2px solid ' + (idx === 0 ? t.color : 'transparent') + ';' +
            'margin-bottom:-2px;transition:all 0.2s;display:flex;align-items:center;gap:5px' +
            '">' +
            '<i class="fa-solid ' + t.icon + '" style="font-size:0.55rem"></i>' + t.label +
            '</button>';
    });
    tabsHtml += '</div>';
    tabsEl.innerHTML = tabsHtml;

    // 탭 데이터 및 색상을 전역에 저장
    window._matConTabs = tabs;
    window._matConTableId = tableId;

    // 첫 번째 탭 렌더링
    renderConstructionTab(0, tableEl);
}

function renderConstructionTab(idx, tableEl) {
    if (!tableEl) tableEl = document.getElementById(window._matConTableId);
    if (!tableEl) return;

    var tab = window._matConTabs[idx];
    var data;
    try {
        data = DB.getTopMaterialsByConstruction(tab.filter, 20);
    } catch (e) {
        data = null;
    }

    var rows = (data && data.values && data.values.length > 0) ? data.values : null;

    // 폴백: DB에 데이터 없으면 가상 데이터
    if (!rows) {
        rows = getMockConstructionData(idx);
    }

    var totalMat = rows.reduce(function (s, r) { return s + (r[4] || 0); }, 0);

    var html = '<div style="max-height:480px;overflow-y:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.58rem">';
    html += '<thead><tr style="border-bottom:2px solid var(--border-default);background:var(--bg-input);position:sticky;top:0;z-index:2">';
    ['#', '품명', '규격', '단위', '수량', '재료비', '합계금액', '비중', '건수'].forEach(function (c, i) {
        html += '<th style="padding:6px;text-align:' + (i >= 4 ? 'right' : 'left') + ';font-weight:700;color:var(--text-muted);white-space:nowrap">' + c + '</th>';
    });
    html += '</tr></thead><tbody>';

    rows.forEach(function (r, rowIdx) {
        var matCost = r[4] || 0;
        var totalCost = r[5] || 0;
        var ratio = totalMat > 0 ? (matCost / totalMat * 100) : 0;
        var fmtMat = matCost >= 1e8 ? (matCost / 1e8).toFixed(2) + '억' : (matCost / 1e4).toFixed(0) + '만';
        var fmtTotal = totalCost >= 1e8 ? (totalCost / 1e8).toFixed(2) + '억' : (totalCost / 1e4).toFixed(0) + '만';

        var rowBg = rowIdx < 3 ? 'rgba(' + hexToRgb(tab.color) + ',0.04)' : '';

        html += '<tr style="border-bottom:1px solid rgba(148,163,184,0.06);background:' + rowBg + '">';
        html += '<td style="padding:5px 6px;color:var(--text-muted);font-weight:600;width:28px">' + (rowIdx + 1) + '</td>';
        html += '<td style="padding:5px 6px;font-weight:700;color:var(--text-primary)">' + (r[0] || '-') + '</td>';
        html += '<td style="padding:5px 6px;color:var(--text-secondary);font-size:0.5rem">' + (r[1] || '-') + '</td>';
        html += '<td style="padding:5px 6px;color:var(--text-secondary)">' + (r[2] || '-') + '</td>';
        html += '<td style="padding:5px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace">' + Components.formatNumber(r[3] || 0) + '</td>';
        html += '<td style="padding:5px 6px;text-align:right;font-weight:600;color:' + tab.color + ';font-family:\'JetBrains Mono\',monospace">' + fmtMat + '</td>';
        html += '<td style="padding:5px 6px;text-align:right;font-family:\'JetBrains Mono\',monospace">' + fmtTotal + '</td>';

        // 비중 바
        html += '<td style="padding:5px 6px;text-align:right;width:80px">';
        html += '<div style="display:flex;align-items:center;gap:4px;justify-content:flex-end">';
        html += '<div style="width:40px;height:5px;background:var(--bg-input);border-radius:3px;overflow:hidden">';
        html += '<div style="width:' + Math.min(ratio, 100) + '%;height:100%;background:' + tab.color + ';border-radius:3px"></div>';
        html += '</div>';
        html += '<span style="font-size:0.48rem;min-width:28px;color:var(--text-muted)">' + ratio.toFixed(1) + '%</span>';
        html += '</div></td>';

        html += '<td style="padding:5px 6px;text-align:right;color:var(--text-muted)">' + (r[6] || 0) + '</td>';
        html += '</tr>';
    });

    html += '</tbody></table></div>';

    // 합계
    var totalAll = rows.reduce(function (s, r) { return s + (r[5] || 0); }, 0);
    var totalMatFmt = totalMat >= 1e8 ? (totalMat / 1e8).toFixed(1) + '억원' : (totalMat / 1e4).toFixed(0) + '만원';
    var totalAllFmt = totalAll >= 1e8 ? (totalAll / 1e8).toFixed(1) + '억원' : (totalAll / 1e4).toFixed(0) + '만원';

    html += '<div style="display:flex;gap:16px;margin-top:8px;padding:8px 12px;background:' + tab.color + '08;border-radius:6px;font-size:0.55rem">';
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-muted)">표시 품목:</span><span style="font-weight:700;color:var(--text-primary)">' + rows.length + '건</span></div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-muted)">재료비 소계:</span><span style="font-weight:700;color:' + tab.color + '">' + totalMatFmt + '</span></div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><span style="color:var(--text-muted)">합계금액:</span><span style="font-weight:700;color:var(--text-primary)">' + totalAllFmt + '</span></div>';
    html += '</div>';

    tableEl.innerHTML = html;
}

function hexToRgb(hex) {
    hex = hex.replace('#', '');
    return parseInt(hex.substr(0, 2), 16) + ',' + parseInt(hex.substr(2, 2), 16) + ',' + parseInt(hex.substr(4, 2), 16);
}

window.switchConstructionTab = function (idx) {
    // 탭 스타일 업데이트
    var btns = document.querySelectorAll('.mat-con-tab');
    var tabs = window._matConTabs;
    btns.forEach(function (btn, i) {
        var t = tabs[i];
        if (i === idx) {
            btn.style.background = t.color + '12';
            btn.style.color = t.color;
            btn.style.borderBottom = '2px solid ' + t.color;
        } else {
            btn.style.background = 'transparent';
            btn.style.color = 'var(--text-muted)';
            btn.style.borderBottom = '2px solid transparent';
        }
    });
    renderConstructionTab(idx);
};

function getMockConstructionData(idx) {
    // 가상 데이터: [품명, 규격, 단위, 수량, 재료비, 합계금액, 건수]
    var mockData = {
        0: [ // 건축
            ['레미콘(도급)', '25-27-150', '㎥', 14300, 1260000000, 1440000000, 51],
            ['철근콘크리트용봉강(도급)', 'SD500 D22', 'ton', 8200, 610000000, 750000000, 87],
            ['FC패널', '12mm', '㎡', 4200, 520000000, 580000000, 38],
            ['합판거푸집 설치 및 해체', '12mm', '㎡', 28500, 195000000, 340000000, 56],
            ['모르타르 바름', '일반', '㎡', 39200, 285000000, 380000000, 246],
            ['방수시트', 'TPO 1.5mm', '㎡', 4800, 165000000, 210000000, 28],
            ['유리문', '강화유리 12T', '조', 420, 215000000, 260000000, 76],
            ['수성페인트 롤러칠', 'KS M 6010', '㎡', 8900, 145000000, 195000000, 59],
            ['타일붙임', '300x300', '㎡', 5200, 58000000, 82000000, 35],
            ['절연재(비드폼)', '100T', '㎡', 4100, 52000000, 72000000, 44],
            ['석고보드 (9.5T)', '9.5mm', '㎡', 12400, 48000000, 68000000, 38],
            ['0.5B 벽돌', '190×90×57', '매', 85000, 42500000, 62000000, 32],
            ['1.0B 벽돌', '190×90×57', '매', 42000, 37800000, 55000000, 28],
            ['시멘트', '보통포틀랜드', 'kg', 320000, 35200000, 42000000, 95],
            ['수밀코킹(실리콘)', '중성', 'm', 12300, 125000000, 155000000, 57],
            ['AL 창호', 'PJ창 900x1200', '조', 380, 31000000, 45000000, 42],
            ['천장틀(T-BAR)', 'T25', '㎡', 6800, 28000000, 38000000, 25],
            ['MDF 문틀', '합성수지', '조', 240, 26000000, 36000000, 18],
            ['골재(모래)', '세척사', '㎥', 8500, 25500000, 31000000, 52],
            ['합성수지판(PVC)', '1.5T', '㎡', 3200, 22400000, 29000000, 16]
        ],
        1: [ // 토목
            ['레미콘(토목)', '24-24-150', '㎥', 6200, 520000000, 610000000, 35],
            ['철근(SD400)', 'D16~D25', 'ton', 3100, 248000000, 310000000, 42],
            ['PHC파일', '400φ L=12m', '본', 480, 192000000, 248000000, 15],
            ['흙막이(CIP)', 'D600 L=15m', '본', 120, 168000000, 215000000, 8],
            ['되메우기', '사질토', '㎥', 18500, 148000000, 182000000, 28],
            ['터파기', '기계', '㎥', 22000, 0, 165000000, 25],
            ['아스콘포장', 'T=50', '㎡', 8200, 98400000, 128000000, 12],
            ['거푸집(토목)', '합판12mm', '㎡', 6800, 95200000, 142000000, 22],
            ['잡석다짐', 'T=200', '㎡', 4500, 67500000, 82000000, 15],
            ['콘크리트 수로관', 'D600', 'm', 850, 59500000, 78000000, 18],
            ['방수(토목)', '아스팔트계', '㎡', 3200, 48000000, 62000000, 10],
            ['배수관(PE)', 'D200', 'm', 1200, 42000000, 55000000, 22],
            ['맨홀', '1호', '개소', 35, 38500000, 48000000, 35],
            ['철근망', 'D10@200', '㎡', 5400, 32400000, 42000000, 18],
            ['인사이드 중공관', 'D300', 'm', 680, 28500000, 38000000, 12],
            ['지오텍스타일', '부직포 300g', '㎡', 12000, 24000000, 32000000, 8],
            ['벤토나이트 매트', 't=5mm', '㎡', 2800, 22400000, 28000000, 6],
            ['경계석', '150x150x1000', 'm', 1500, 18000000, 25000000, 15],
            ['PE관(오수)', 'D150', 'm', 950, 14250000, 19000000, 18],
            ['사다리 트렌치', 'W300', 'm', 420, 12600000, 16000000, 8]
        ],
        2: [ // 조경
            ['수목(느티나무)', 'H5.0xB15', '주', 25, 75000000, 92000000, 25],
            ['수목(소나무)', 'H4.0xR12', '주', 35, 52500000, 68000000, 35],
            ['잔디(들잔디)', 'T=30', '㎡', 8500, 42500000, 55000000, 12],
            ['화강석 포장', '300x300', '㎡', 2800, 39200000, 52000000, 15],
            ['데크(방부목)', 't=30', '㎡', 1200, 33600000, 45000000, 8],
            ['수목(왕벚나무)', 'H4.5xB12', '주', 18, 27000000, 35000000, 18],
            ['투수블록 포장', '200x100', '㎡', 3500, 24500000, 32000000, 10],
            ['관목(철쭉)', 'H0.3xW0.3', '주', 3500, 21000000, 28000000, 5],
            ['경계석(화강석)', '150x200', 'm', 850, 17000000, 22000000, 12],
            ['관목(사철나무)', 'H0.4xW0.3', '주', 2200, 15400000, 20000000, 5],
            ['관수시설', 'PE 25A', '식', 1, 14000000, 18000000, 3],
            ['벤치(스틸)', 'L=1800', '조', 15, 12000000, 15000000, 15],
            ['볼라드', 'SUS', '개', 28, 9800000, 12000000, 28],
            ['잔디블록', '500x500', '㎡', 1500, 9000000, 12000000, 6],
            ['파고라', '철재', '조', 3, 8400000, 11000000, 3],
            ['어린이놀이시설', '종합', '식', 1, 7500000, 9800000, 1],
            ['수목지주목', 'H=1.5', '본', 85, 5100000, 6800000, 5],
            ['조경토', '양토', '㎥', 650, 3900000, 5200000, 8],
            ['배수판', 'H=20', '㎡', 800, 3200000, 4200000, 4],
            ['멀칭재', '소나무 바크', '㎡', 1200, 2400000, 3200000, 3]
        ],
        3: [ // 기계설비
            ['일반배관용 STS강관 이음쇠', 'KS D 3595', '개', 16500, 230000000, 290000000, 329],
            ['오수처리시설', 'SS상당', '개소', 2, 410000000, 450000000, 5],
            ['배수용 경질염화비닐 이음관', 'KS M 3410', '개', 13800, 180000000, 240000000, 278],
            ['파이프슈', 'SUS304', '개', 3600, 98000000, 125000000, 61],
            ['관보온(고무발포)', '25A 이상', 'm', 18200, 88000000, 115000000, 96],
            ['U자형볼트/너트', 'SUS304', '조', 6800, 72000000, 95000000, 55],
            ['일반배관용 STS 강관', 'KS D 3576', 'm', 8500, 65000000, 88000000, 52],
            ['수밀코킹(설비)', '우레탄', 'm', 5400, 43200000, 58000000, 32],
            ['보온재(유리면)', '25K T50', '㎡', 4200, 37800000, 48000000, 28],
            ['에어컨실외기 거치대', 'SUS', '조', 180, 32400000, 42000000, 22],
            ['도장(설비배관)', '조합페인트', '㎡', 6500, 28000000, 38000000, 25],
            ['플랜지', 'SOP 80A', '개', 420, 25200000, 32000000, 35],
            ['게이트밸브', 'KS 80A', '개', 320, 22400000, 28000000, 42],
            ['체크밸브', '50A', '개', 280, 19600000, 25000000, 38],
            ['덕트(아연도)', '600x400', '㎡', 3800, 19000000, 28000000, 18],
            ['소화배관(흑관)', 'D65', 'm', 2200, 15400000, 22000000, 28],
            ['케이블 트레이', 'W300', 'm', 1800, 14400000, 19000000, 15],
            ['방진기초', 'Spring형', '조', 45, 11250000, 15000000, 12],
            ['배수트랩', 'SUS D50', '개', 380, 9500000, 12000000, 25],
            ['온수분배기', '7회로', '조', 85, 8500000, 11000000, 8]
        ]
    };
    return mockData[idx] || mockData[0];
}

// ═══════════════════════════════════════════
// 4. 자재 수불부 (Placeholder with simulated data)
// ═══════════════════════════════════════════
function buildMaterialLedger(id, topRows) {
    var el = document.getElementById(id);
    if (!el) return;
    // 주요 자재 5개에 대해 시뮬레이션된 입출고 데이터 생성
    var materials = topRows.slice(0, 5);
    var html = '';
    // 검색 바
    html += '<div style="display:flex;gap:8px;margin-bottom:10px;align-items:center">';
    html += '<input type="text" id="ledger-search" placeholder="자재명 검색..." style="flex:1;padding:6px 10px;border:1px solid var(--border-default);border-radius:6px;font-size:0.6rem;background:var(--bg-input);color:var(--text-primary)" oninput="filterLedger(this.value)">';
    html += '<span style="font-size:0.5rem;color:var(--text-muted)">시뮬레이션 데이터</span>';
    html += '</div>';

    html += '<div id="ledger-body" style="max-height:300px;overflow-y:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.55rem">';
    html += '<thead><tr style="border-bottom:2px solid var(--border-default);background:var(--bg-input);position:sticky;top:0">';
    ['일자', '품명', '규격', '입고(In)', '출고(Out)', '재고(Stock)'].forEach(function (c, i) {
        html += '<th style="padding:5px 4px;text-align:' + (i >= 3 ? 'right' : 'left') + ';font-weight:700;color:var(--text-muted)">' + c + '</th>';
    });
    html += '</tr></thead><tbody>';

    var today = new Date();
    var runningStock = {};
    materials.forEach(function (m) {
        var name = m[0] || '';
        runningStock[name] = 0;
        // 최근 5일간 입출고
        for (var d = 4; d >= 0; d--) {
            var dt = new Date(today); dt.setDate(dt.getDate() - d);
            var dtStr = dt.toISOString().slice(5, 10);
            var inQty = Math.round(Math.random() * 50 + 10);
            var outQty = Math.round(Math.random() * 30 + 5);
            runningStock[name] += inQty - outQty;
            var stock = Math.max(0, runningStock[name]);
            html += '<tr class="ledger-row" data-name="' + name.toLowerCase() + '" style="border-bottom:1px solid rgba(148,163,184,0.04)">';
            html += '<td style="padding:4px;color:var(--text-muted)">' + dtStr + '</td>';
            html += '<td style="padding:4px;color:var(--text-primary);font-weight:600">' + name.substring(0, 10) + '</td>';
            html += '<td style="padding:4px;color:var(--text-secondary);font-size:0.48rem">' + (m[1] || '-') + '</td>';
            html += '<td style="padding:4px;text-align:right;color:#10B981;font-weight:600">+' + inQty + '</td>';
            html += '<td style="padding:4px;text-align:right;color:#EF4444;font-weight:600">-' + outQty + '</td>';
            html += '<td style="padding:4px;text-align:right;font-weight:700;color:var(--text-primary)">' + stock + '</td>';
            html += '</tr>';
        }
    });
    html += '</tbody></table></div>';

    html += '<div style="margin-top:8px;padding:8px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:4px">';
    html += '<i class="fa-solid fa-qrcode" style="color:#3B82F6"></i>';
    html += '실제 운영 시 모바일 QR 스캔으로 현장 반입 즉시 입고 처리 가능';
    html += '</div>';
    el.innerHTML = html;
}

// ═══════════════════════════════════════════
// 5. 로스율 관리
// ═══════════════════════════════════════════
function buildLossRatePanel(id, big3) {
    var el = document.getElementById(id);
    if (!el) return;
    // 시뮬레이션 로스율 데이터
    var lossData = [
        { name: '레미콘', allowance: 3, actual: 4.2, icon: 'fa-truck-monster', color: '#3B82F6' },
        { name: '철근', allowance: 3, actual: 5.1, icon: 'fa-bars', color: '#EF4444' },
        { name: '시멘트', allowance: 2, actual: 1.8, icon: 'fa-box', color: '#F59E0B' },
        { name: '거푸집', allowance: 5, actual: 3.5, icon: 'fa-shapes', color: '#8B5CF6' },
        { name: '타일', allowance: 3, actual: 3.8, icon: 'fa-table-cells', color: '#06B6D4' }
    ];

    var html = '';
    lossData.forEach(function (l) {
        var isOver = l.actual > l.allowance;
        var statusColor = isOver ? '#EF4444' : '#10B981';
        var statusIcon = isOver ? 'fa-circle-exclamation' : 'fa-circle-check';
        var diff = (l.actual - l.allowance).toFixed(1);

        html += '<div style="display:flex;align-items:center;gap:8px;padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.06)">';
        html += '<div style="width:24px;height:24px;border-radius:6px;background:' + l.color + '15;display:flex;align-items:center;justify-content:center"><i class="fa-solid ' + l.icon + '" style="font-size:0.55rem;color:' + l.color + '"></i></div>';
        html += '<div style="flex:1;min-width:50px"><div style="font-size:0.6rem;font-weight:700;color:var(--text-primary)">' + l.name + '</div></div>';
        // 할증률
        html += '<div style="text-align:right;min-width:38px"><div style="font-size:0.45rem;color:var(--text-muted)">할증</div><div style="font-size:0.6rem;font-weight:600;color:var(--text-secondary)">' + l.allowance + '%</div></div>';
        // 실제
        html += '<div style="text-align:right;min-width:38px"><div style="font-size:0.45rem;color:var(--text-muted)">실제</div><div style="font-size:0.6rem;font-weight:700;color:' + statusColor + '">' + l.actual + '%</div></div>';
        // 상태
        html += '<div style="min-width:20px;text-align:center"><i class="fa-solid ' + statusIcon + '" style="color:' + statusColor + ';font-size:0.7rem"></i></div>';
        html += '</div>';
    });

    html += '<div style="margin-top:10px;display:flex;gap:8px;font-size:0.48rem;color:var(--text-muted)">';
    html += '<span><i class="fa-solid fa-circle-check" style="color:#10B981"></i> 허용 내</span>';
    html += '<span><i class="fa-solid fa-circle-exclamation" style="color:#EF4444"></i> 초과 (관리 필요)</span>';
    html += '</div>';
    el.innerHTML = html;
}

// ═══════════════════════════════════════════
// 6. 업체별 자재 공급 현황
// ═══════════════════════════════════════════
function buildSupplierMaterials(id, supplierRows) {
    var el = document.getElementById(id);
    if (!el) return;
    // 업체별 그룹화
    var suppliers = {}; var supplierOrder = [];
    supplierRows.forEach(function (r) {
        var s = r[0] || '미지정';
        if (!suppliers[s]) { suppliers[s] = { items: [], totalCost: 0 }; supplierOrder.push(s); }
        suppliers[s].items.push({ name: r[1], qty: r[2], unit: r[3], cost: r[4] || 0, cnt: r[5] });
        suppliers[s].totalCost += (r[4] || 0);
    });
    // 금액순 정렬
    supplierOrder.sort(function (a, b) { return suppliers[b].totalCost - suppliers[a].totalCost; });

    var html = '<div style="max-height:350px;overflow-y:auto">';
    supplierOrder.slice(0, 8).forEach(function (sName, idx) {
        var s = suppliers[sName];
        var costLabel = s.totalCost >= 1e8 ? (s.totalCost / 1e8).toFixed(1) + '억' : (s.totalCost / 1e4).toFixed(0) + '만';
        var topItems = s.items.slice(0, 3).map(function (i) { return i.name; }).join(', ');

        html += '<div style="padding:8px 0;border-bottom:1px solid rgba(148,163,184,0.06)">';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<span style="font-size:0.48rem;color:var(--text-muted);min-width:16px">' + (idx + 1) + '</span>';
        html += '<div style="flex:1">';
        html += '<div style="font-size:0.6rem;font-weight:700;color:var(--text-primary)">' + sName + '</div>';
        html += '<div style="font-size:0.45rem;color:var(--text-muted);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + topItems + ' 외</div>';
        html += '</div>';
        html += '<div style="text-align:right">';
        html += '<div style="font-size:0.6rem;font-weight:700;color:var(--text-primary)">' + costLabel + '</div>';
        html += '<div style="font-size:0.42rem;color:var(--text-muted)">' + s.items.length + '종</div>';
        html += '</div>';
        html += '</div></div>';
    });
    html += '</div>';
    if (supplierOrder.length > 8) {
        html += '<div style="padding:6px 0;font-size:0.48rem;color:var(--text-muted);text-align:center">+ ' + (supplierOrder.length - 8) + '개 업체 더 있음</div>';
    }
    html += '<div style="margin-top:8px;padding:8px;background:var(--bg-input);border-radius:6px;font-size:0.48rem;color:var(--text-muted);display:flex;align-items:center;gap:4px">';
    html += '<i class="fa-solid fa-magnifying-glass-dollar" style="color:#F59E0B"></i>';
    html += '기성 청구 시 업체 청구량 vs 실제 반입량 교차 검증(Cross-Check) 활용';
    html += '</div>';
    el.innerHTML = html;
}

// ═══════════════════════════════════════════
// 7. 설계변경 대비 시나리오
// ═══════════════════════════════════════════
function buildChangeOrderScenario(id, topRows) {
    var el = document.getElementById(id);
    if (!el) return;

    // 상위 5개 자재에 대해 설계변경 시나리오 시뮬레이션
    var scenarios = [
        { item: '레미콘', spec: '25-27-150', original: 14300, changed: 15800, unit: '㎥', reason: '지하층 구조변경으로 물량 증가' },
        { item: '철근(SD500)', spec: 'SH-22', original: 8200, changed: 8200, unit: 'ton', reason: '변경 없음' },
        { item: 'FC패널', spec: '12mm', original: 12500, changed: 11200, unit: '㎡', reason: '외장재 마감재 변경으로 감소' },
        { item: '오수처리시설', spec: '', original: 2, changed: 3, unit: '개소', reason: '환경영향평가 결과 추가 설치' },
        { item: '방수시트', spec: 'TPO 1.5mm', original: 4800, changed: 5600, unit: '㎡', reason: '옥상 추가 방수 보강' }
    ];

    var html = '';
    // 요약
    var totalOriginal = 0, totalChanged = 0;
    var changeItems = scenarios.filter(function (s) { return s.original !== s.changed; });

    html += '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:10px;margin-bottom:12px">';
    html += '<div style="padding:10px;background:var(--bg-input);border-radius:8px;text-align:center"><div style="font-size:0.48rem;color:var(--text-muted)">변경 항목</div><div style="font-size:1.1rem;font-weight:800;color:#F59E0B">' + changeItems.length + '<span style="font-size:0.6rem">건</span></div></div>';
    html += '<div style="padding:10px;background:var(--bg-input);border-radius:8px;text-align:center"><div style="font-size:0.48rem;color:var(--text-muted)">증가 항목</div><div style="font-size:1.1rem;font-weight:800;color:#EF4444">' + scenarios.filter(function (s) { return s.changed > s.original; }).length + '<span style="font-size:0.6rem">건</span></div></div>';
    html += '<div style="padding:10px;background:var(--bg-input);border-radius:8px;text-align:center"><div style="font-size:0.48rem;color:var(--text-muted)">감소 항목</div><div style="font-size:1.1rem;font-weight:800;color:#10B981">' + scenarios.filter(function (s) { return s.changed < s.original; }).length + '<span style="font-size:0.6rem">건</span></div></div>';
    html += '</div>';

    // 테이블
    html += '<div style="overflow-x:auto">';
    html += '<table style="width:100%;border-collapse:collapse;font-size:0.58rem">';
    html += '<thead><tr style="border-bottom:2px solid var(--border-default);background:var(--bg-input)">';
    ['품명', '규격', '당초', '변경', '증감', '증감율', '변경사유'].forEach(function (c, i) {
        html += '<th style="padding:6px;text-align:' + (i >= 2 && i <= 5 ? 'right' : 'left') + ';font-weight:700;color:var(--text-muted);white-space:nowrap">' + c + '</th>';
    });
    html += '</tr></thead><tbody>';

    scenarios.forEach(function (s) {
        var diff = s.changed - s.original;
        var pct = s.original > 0 ? (diff / s.original * 100).toFixed(1) : 0;
        var diffColor = diff > 0 ? '#EF4444' : diff < 0 ? '#10B981' : 'var(--text-muted)';
        var diffPrefix = diff > 0 ? '+' : '';
        var pctPrefix = parseFloat(pct) > 0 ? '+' : '';

        html += '<tr style="border-bottom:1px solid rgba(148,163,184,0.06)">';
        html += '<td style="padding:6px;font-weight:700;color:var(--text-primary)">' + s.item + '</td>';
        html += '<td style="padding:6px;color:var(--text-secondary);font-size:0.5rem">' + s.spec + '</td>';
        html += '<td style="padding:6px;text-align:right">' + Components.formatNumber(s.original) + ' <span style="font-size:0.42rem;color:var(--text-muted)">' + s.unit + '</span></td>';
        html += '<td style="padding:6px;text-align:right;font-weight:700">' + Components.formatNumber(s.changed) + ' <span style="font-size:0.42rem;color:var(--text-muted)">' + s.unit + '</span></td>';
        html += '<td style="padding:6px;text-align:right;font-weight:700;color:' + diffColor + '">' + diffPrefix + Components.formatNumber(diff) + '</td>';
        html += '<td style="padding:6px;text-align:right;font-weight:700;color:' + diffColor + '">' + pctPrefix + pct + '%</td>';
        html += '<td style="padding:6px;color:var(--text-secondary);font-size:0.5rem">' + s.reason + '</td>';
        html += '</tr>';
    });
    html += '</tbody></table></div>';

    html += '<div style="margin-top:10px;padding:8px;background:#F59E0B08;border:1px solid #F59E0B20;border-radius:6px;font-size:0.52rem;color:var(--text-secondary);display:flex;align-items:flex-start;gap:6px">';
    html += '<i class="fa-solid fa-lightbulb" style="color:#F59E0B;margin-top:2px"></i>';
    html += '<div>위 시나리오는 <b>임의 작성된 설계변경 예시</b>입니다. 실제 설계변경 발생 시 [당초 vs 변경 vs 실적] 3단 비교를 통해 원가 영향을 분석하고, 변경 승인 이력을 관리합니다.</div>';
    html += '</div>';
    el.innerHTML = html;
}

// ═══════════════════════════════════════════
// 8. 자재 문서 자동 생성 샘플
// ═══════════════════════════════════════════
function buildDocumentSamples(id) {
    var el = document.getElementById(id);
    if (!el) return;

    var docs = [
        {
            title: '자재 승인 요청서', icon: 'fa-file-signature', color: '#3B82F6',
            desc: '현장 반입 전 자재의 품질/규격 승인을 요청하는 문서',
            fields: ['공사명', '자재명', '규격/사양', '제조사', '수량', 'KS인증 여부', '시험성적서 첨부', '사용 위치', '요청일', '승인자'],
            sample: '공사명: OO현장 관사동 건축공사\n자재명: 레미콘 (25-27-150)\n제조사: OO레미콘(주)\n수량: 120㎥\nKS인증: KS F 4009\n사용위치: 관사동 2F 슬래브\n요청일: 2026-02-17'
        },
        {
            title: '검수 조서', icon: 'fa-clipboard-check', color: '#10B981',
            desc: '반입된 자재의 수량 및 품질을 검수하여 기록하는 문서',
            fields: ['검수일', '자재명', '규격', '발주 수량', '입고 수량', '합격/불합격', '비고', '검수자', '확인자'],
            sample: '검수일: 2026-02-17\n자재명: 철근 SD500 (D22)\n발주 수량: 50ton\n입고 수량: 50ton\n합격 여부: 합격\n검수자: 홍길동 (품질팀)'
        },
        {
            title: '자재 반출 확인서', icon: 'fa-truck-arrow-right', color: '#F59E0B',
            desc: '현장 외부로 자재 반출 시 사유와 수량을 기록하는 문서',
            fields: ['반출일', '자재명', '수량', '반출사유', '반출처', '확인자'],
            sample: '반출일: 2026-02-17\n자재명: 잔여 거푸집 합판\n수량: 120장\n반출사유: 타 현장 전용\n확인자: 김현장 (공무팀)'
        }
    ];

    var html = '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px">';
    docs.forEach(function (doc) {
        html += '<div style="border:1px solid var(--border-default);border-radius:10px;overflow:hidden;background:var(--bg-card)">';
        // 헤더
        html += '<div style="padding:12px;background:' + doc.color + '08;border-bottom:1px solid var(--border-default)">';
        html += '<div style="display:flex;align-items:center;gap:8px">';
        html += '<div style="width:32px;height:32px;border-radius:8px;background:' + doc.color + '15;display:flex;align-items:center;justify-content:center"><i class="fa-solid ' + doc.icon + '" style="color:' + doc.color + ';font-size:0.8rem"></i></div>';
        html += '<div>';
        html += '<div style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">' + doc.title + '</div>';
        html += '<div style="font-size:0.45rem;color:var(--text-muted)">' + doc.desc + '</div>';
        html += '</div></div></div>';
        // 필드 목록
        html += '<div style="padding:10px 12px">';
        html += '<div style="font-size:0.48rem;font-weight:700;color:var(--text-muted);margin-bottom:4px">포함 항목</div>';
        doc.fields.forEach(function (f) {
            html += '<div style="font-size:0.5rem;color:var(--text-secondary);padding:1px 0"><span style="color:' + doc.color + ';margin-right:4px">•</span>' + f + '</div>';
        });
        html += '</div>';
        // 샘플 미리보기
        html += '<div style="padding:8px 12px;background:var(--bg-input);font-family:monospace;font-size:0.42rem;color:var(--text-muted);white-space:pre-line;line-height:1.5;max-height:100px;overflow-y:auto">' + doc.sample + '</div>';
        // 버튼
        html += '<div style="padding:8px 12px;text-align:center">';
        html += '<button onclick="generateDocSample(\'' + doc.title + '\')" style="padding:5px 14px;background:' + doc.color + ';color:#fff;border:none;border-radius:6px;font-size:0.55rem;font-weight:600;cursor:pointer;transition:opacity 0.2s" onmouseover="this.style.opacity=0.85" onmouseout="this.style.opacity=1"><i class="fa-solid fa-file-export" style="margin-right:3px"></i>양식 생성</button>';
        html += '</div>';
        html += '</div>';
    });
    html += '</div>';

    el.innerHTML = html;
}

// ─── 글로벌 유틸 함수 ───────────────────
window.toggleTradeGroup = function (headerRow) {
    var icon = headerRow.querySelector('i');
    var next = headerRow.nextElementSibling;
    var isOpen = icon.style.transform === 'rotate(90deg)';
    icon.style.transform = isOpen ? '' : 'rotate(90deg)';
    while (next && next.classList.contains('trade-detail-row')) {
        next.style.display = isOpen ? 'none' : '';
        next = next.nextElementSibling;
    }
};

window.filterLedger = function (keyword) {
    var rows = document.querySelectorAll('.ledger-row');
    var kw = keyword.toLowerCase();
    rows.forEach(function (r) {
        r.style.display = !kw || r.getAttribute('data-name').indexOf(kw) >= 0 ? '' : 'none';
    });
};

window.generateDocSample = function (title) {
    alert('📄 ' + title + ' 양식이 생성되었습니다.\n\n실제 구현 시 PDF/Excel로 다운로드됩니다.');
};

window.renderQuantityPage = renderQuantityPage;

// ═══════════════════════════════════════════
// 가상 데이터 생성기 (DB 에러 시 폴백)
// 현장 CSV 데이터 참조 기반 시뮤레이션
// ═══════════════════════════════════════════
function generateMockTopMaterials() {
    // [HOW4_품명, HOW5_규격, R1_단위, qty, mat_cost, total_cost, cnt]
    return [
        ['레미콘(도급)', '25-27-150', '㎥', 14300, 1260000000, 1440000000, 51],
        ['철근콘크리트용봉강(도급)', 'SD500 D22', 'ton', 8200, 610000000, 750000000, 87],
        ['FC패널', '12mm', '㎡', 4200, 520000000, 580000000, 38],
        ['오수처리시설', 'SS상당', '개소', 2, 410000000, 450000000, 5],
        ['모르타르 바름', '일반', '㎡', 39200, 285000000, 380000000, 246],
        ['일반배관용 STS강관 이음쇠', 'KS D 3595', '개', 16500, 230000000, 290000000, 329],
        ['유리문', '강화유리 12T', '조', 420, 215000000, 260000000, 76],
        ['합판거푸집 설치 및 해체', '12mm', '㎡', 28500, 195000000, 340000000, 56],
        ['배수용 경질염화비닐 이음관', 'KS M 3410', '개', 13800, 180000000, 240000000, 278],
        ['방수시트', 'TPO 1.5mm', '㎡', 4800, 165000000, 210000000, 28],
        ['수성페인트 롤러칠', 'KS M 6010', '㎡', 8900, 145000000, 195000000, 59],
        ['수밀코킹(실리콘)', '중성', 'm', 12300, 125000000, 155000000, 57],
        ['노무비', '철근공', '인', 4500, 0, 320000000, 75],
        ['파이프슈', 'SUS304', '개', 3600, 98000000, 125000000, 61],
        ['관보온(고무발포)', '25A 이상', 'm', 18200, 88000000, 115000000, 96],
        ['U자형볼트/너트', 'SUS304', '조', 6800, 72000000, 95000000, 55],
        ['일반배관용 스테인리스 강관', 'KS D 3576', 'm', 8500, 65000000, 88000000, 52],
        ['콘크리트면 정리', '일반', '㎡', 32000, 0, 180000000, 62],
        ['타일붙임', '300x300', '㎡', 5200, 58000000, 82000000, 35],
        ['절연재', '비드폼 100T', '㎡', 4100, 52000000, 72000000, 44]
    ];
}

function generateMockSupplierData() {
    // [WHO1, HOW4_품명, qty, R1_단위, mat_cost, cnt]
    return [
        ['금빛건설㈜', '레미콘(도급)', 14300, '㎥', 1260000000, 51],
        ['금빛건설㈜', '합판거푸집 설치 및 해체', 28500, '㎡', 195000000, 56],
        ['금빛건설㈜', '노무비', 4500, '인', 0, 75],
        ['동성철근', '철근콘크리트용봉강(도급)', 8200, 'ton', 610000000, 87],
        ['㈜한경유리', '유리문', 420, '조', 215000000, 76],
        ['㈜한경유리', 'FC패널', 4200, '㎡', 520000000, 38],
        ['대성설비', '일반배관용 STS강관 이음쇠', 16500, '개', 230000000, 329],
        ['대성설비', '파이프슈', 3600, '개', 98000000, 61],
        ['대성설비', '관보온(고무발포)', 18200, 'm', 88000000, 96],
        ['미래방수', '방수시트', 4800, '㎡', 165000000, 28],
        ['목원도장', '수성페인트 롤러칠', 8900, '㎡', 145000000, 59],
        ['목원도장', '수밀코킹(실리콘)', 12300, 'm', 125000000, 57],
        ['삼화환경', '오수처리시설', 2, '개소', 410000000, 5]
    ];
}

function generateMockPivotData() {
    // [HOW2_대공종, HOW4_품명, HOW5_규격, R1_단위, qty, mat_cost, total_cost, cnt]
    return [
        ['A01_가설공사', '합판거푸집 설치 및 해체', '12mm', '㎡', 28500, 195000000, 340000000, 56],
        ['A01_가설공사', '비계', '-', '식', 1, 0, 85000000, 12],
        ['A02_토공사', '토공사', '일반', '㎥', 12000, 0, 150000000, 28],
        ['A03_철근콘크리트', '레미콘(도급)', '25-27-150', '㎥', 14300, 1260000000, 1440000000, 51],
        ['A03_철근콘크리트', '철근콘크리트용봉강(도급)', 'SD500 D22', 'ton', 8200, 610000000, 750000000, 87],
        ['A03_철근콘크리트', '콘크리트면 정리', '일반', '㎡', 32000, 0, 180000000, 62],
        ['A04_조적공사', '모르타르 바름', '일반', '㎡', 39200, 285000000, 380000000, 246],
        ['A05_방수공사', '방수시트', 'TPO 1.5mm', '㎡', 4800, 165000000, 210000000, 28],
        ['A06_수장공사', 'FC패널', '12mm', '㎡', 4200, 520000000, 580000000, 38],
        ['A06_수장공사', '유리문', '강화유리 12T', '조', 420, 215000000, 260000000, 76],
        ['A07_도장공사', '수성페인트 롤러칠', 'KS M 6010', '㎡', 8900, 145000000, 195000000, 59],
        ['A08_타일공사', '타일붙임', '300x300', '㎡', 5200, 58000000, 82000000, 35],
        ['C01_기계배관', '일반배관용 STS강관 이음쇠', 'KS D 3595', '개', 16500, 230000000, 290000000, 329],
        ['C01_기계배관', '배수용 경질염화비닐 이음관', 'KS M 3410', '개', 13800, 180000000, 240000000, 278],
        ['C01_기계배관', '파이프슈', 'SUS304', '개', 3600, 98000000, 125000000, 61],
        ['C01_기계배관', '관보온(고무발포)', '25A 이상', 'm', 18200, 88000000, 115000000, 96],
        ['C02_위생배관', '수밀코킹(실리콘)', '중성', 'm', 12300, 125000000, 155000000, 57],
        ['D01_오수처리', '오수처리시설', 'SS상당', '개소', 2, 410000000, 450000000, 5]
    ];
}

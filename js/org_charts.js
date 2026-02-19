/**
 * 조직관리 추가 차트 컴포넌트
 * 1. 월별 업체 동원 히트맵 (Monthly Heatmap)
 * 2. 공종별 업체 투입 비율 (Trade Distribution)
 * 3. 동별 업체 투입 현황 (Zone Matrix)
 */

/* ══════════════════════════════════════════
 * 1. 월별 업체 동원 히트맵
 * ══════════════════════════════════════════ */
function buildMonthlyHeatmap(containerId, schedRows) {
    var el = document.getElementById(containerId);
    if (!el || !schedRows || schedRows.length === 0) { if (el) el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">데이터 없음</div>'; return; }

    var today = new Date(); today.setHours(0, 0, 0, 0);

    // 전체 월 범위 생성
    var allMonths = [];
    var globalMinDate = null, globalMaxDate = null;
    schedRows.forEach(function (r) {
        if (r[1] && r[2]) {
            if (!globalMinDate || r[1] < globalMinDate) globalMinDate = r[1];
            if (!globalMaxDate || r[2] > globalMaxDate) globalMaxDate = r[2];
        }
    });
    if (!globalMinDate) return;

    var cur = new Date(globalMinDate); cur.setDate(1);
    var end = new Date(globalMaxDate); end.setDate(28);
    while (cur <= end) {
        allMonths.push({ year: cur.getFullYear(), month: cur.getMonth(), label: cur.getFullYear().toString().slice(2) + '.' + String(cur.getMonth() + 1).padStart(2, '0') });
        cur.setMonth(cur.getMonth() + 1);
    }

    // 업체별 월 활성 여부 계산 (금액순 정렬)
    var sorted = schedRows.slice().sort(function (a, b) { return (b[4] || 0) - (a[4] || 0); });
    var companies = [];
    sorted.forEach(function (r) {
        var name = r[0], sd = r[1], ed = r[2], cost = r[4] || 0;
        if (!sd || !ed) return;
        var sDate = new Date(sd); sDate.setDate(1);
        var eDate = new Date(ed);
        var active = {};
        allMonths.forEach(function (m) {
            var mStart = new Date(m.year, m.month, 1);
            var mEnd = new Date(m.year, m.month + 1, 0);
            if (new Date(sd) <= mEnd && new Date(ed) >= mStart) {
                active[m.label] = true;
            }
        });
        companies.push({ name: name, cost: cost, active: active });
    });

    // 월별 동시 투입 업체수 집계
    var monthCounts = {};
    allMonths.forEach(function (m) {
        monthCounts[m.label] = 0;
        companies.forEach(function (c) { if (c.active[m.label]) monthCounts[m.label]++; });
    });
    var maxCount = Math.max.apply(null, Object.values(monthCounts).concat([1]));

    // 오늘 해당 월
    var todayLabel = today.getFullYear().toString().slice(2) + '.' + String(today.getMonth() + 1).padStart(2, '0');

    var cellW = 36, nameW = 130, rowH = 22;

    var html = '';
    // 스크롤 래퍼
    html += '<div style="overflow-x:auto">';
    html += '<table style="border-collapse:collapse;font-size:0.5rem;white-space:nowrap;width:100%">';

    // 헤더 (월)
    html += '<thead><tr style="position:sticky;top:0;z-index:3;background:var(--bg-card)">';
    html += '<th style="position:sticky;left:0;z-index:4;background:var(--bg-card);min-width:' + nameW + 'px;padding:4px 6px;text-align:left;font-weight:700;color:var(--text-muted);border-bottom:2px solid var(--border-default)">업체명</th>';
    allMonths.forEach(function (m) {
        var isToday = (m.label === todayLabel);
        var isQ = ((m.month) % 3 === 0);
        html += '<th style="min-width:' + cellW + 'px;padding:4px 1px;text-align:center;font-weight:' + (isQ ? '700' : '400') + ';color:' + (isToday ? '#EF4444' : 'var(--text-muted)') + ';border-bottom:2px solid var(--border-default);font-size:' + (isQ ? '0.5rem' : '0.42rem') + '">' + m.label + '</th>';
    });
    html += '</tr></thead>';

    // 바디 (업체 행)
    html += '<tbody>';
    companies.forEach(function (c, idx) {
        html += '<tr style="' + (idx % 2 ? 'background:rgba(148,163,184,0.02)' : '') + '">';
        var costLabel = c.cost >= 1e8 ? (c.cost / 1e8).toFixed(0) + '억' : '';
        html += '<td style="position:sticky;left:0;z-index:2;background:' + (idx % 2 ? 'rgba(248,250,252,1)' : 'var(--bg-card)') + ';padding:2px 6px;font-weight:600;color:var(--text-primary);border-right:1px solid var(--border-default);overflow:hidden;text-overflow:ellipsis;max-width:' + nameW + 'px" title="' + c.name + '">' +
            '<span style="display:inline-block;max-width:' + (nameW - 35) + 'px;overflow:hidden;text-overflow:ellipsis;vertical-align:middle">' + c.name + '</span>' +
            (costLabel ? '<span style="font-size:0.4rem;color:var(--text-muted);margin-left:3px">' + costLabel + '</span>' : '') +
            '</td>';

        allMonths.forEach(function (m) {
            var isActive = c.active[m.label];
            var isToday = (m.label === todayLabel);
            var bg = isActive ? 'rgba(16,185,129,0.6)' : 'transparent';
            if (isActive && isToday) bg = 'rgba(239,68,68,0.7)';
            html += '<td style="padding:1px 0;text-align:center;border-left:' + (m.month % 3 === 0 ? '1px solid rgba(148,163,184,0.12)' : 'none') + '">';
            if (isActive) html += '<div style="width:' + (cellW - 2) + 'px;height:' + (rowH - 4) + 'px;background:' + bg + ';border-radius:2px;margin:0 auto" title="' + c.name + ' · ' + m.label + '"></div>';
            html += '</td>';
        });
        html += '</tr>';
    });

    // 하단 합계 행 (동시 투입 업체수)
    html += '<tr style="border-top:2px solid var(--border-default);position:sticky;bottom:0;z-index:3;background:var(--bg-card)">';
    html += '<td style="position:sticky;left:0;z-index:4;background:var(--bg-card);padding:4px 6px;font-weight:700;color:var(--text-muted);border-right:1px solid var(--border-default)">동시투입</td>';
    allMonths.forEach(function (m) {
        var cnt = monthCounts[m.label];
        var intensity = cnt / maxCount;
        var bg = intensity > 0.8 ? '#EF444430' : intensity > 0.5 ? '#F59E0B20' : intensity > 0 ? '#10B98115' : 'transparent';
        var color = intensity > 0.8 ? '#EF4444' : intensity > 0.5 ? '#F59E0B' : '#10B981';
        html += '<td style="padding:4px 2px;text-align:center;font-weight:700;color:' + color + ';background:' + bg + ';font-size:0.55rem">' + cnt + '</td>';
    });
    html += '</tr>';

    html += '</tbody></table></div>';

    // 범례
    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 12px;font-size:0.5rem;color:var(--text-muted);border-top:1px solid var(--border-default)">';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:12px;height:8px;background:rgba(16,185,129,0.6);border-radius:2px"></div> 투입 기간</div>';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:12px;height:8px;background:rgba(239,68,68,0.7);border-radius:2px"></div> 현재 월</div>';
    html += '<span style="margin-left:auto">최대 동시 투입: <b style="color:#EF4444">' + maxCount + '개사</b> · 전체 ' + companies.length + '개사 · ' + allMonths.length + '개월</span>';
    html += '</div>';

    el.innerHTML = html;
}

/* ══════════════════════════════════════════
 * 2. 공종별 업체 투입 비율 (Trade Distribution)
 * ══════════════════════════════════════════ */
function buildTradeDistribution(containerId, tradeData) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var rows = (tradeData && tradeData.values) ? tradeData.values : [];
    if (rows.length === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">데이터 없음</div>'; return; }

    // 공종별 그룹화
    var trades = {};
    var tradeOrder = [];
    var allCompanies = {};
    rows.forEach(function (r) {
        var t = (r[0] || '').replace(/^[A-Z]_/, '');
        var c = r[1] || '';
        var cost = r[3] || 0;
        if (!trades[t]) { trades[t] = { total: 0, companies: [] }; tradeOrder.push(t); }
        trades[t].total += cost;
        trades[t].companies.push({ name: c, cost: cost });
        allCompanies[c] = (allCompanies[c] || 0) + cost;
    });

    var tradeColors = { '건축공사': '#3B82F6', '토목공사': '#10B981', '조경공사': '#84CC16', '기계설비공사': '#F59E0B' };
    var totalCost = Object.values(trades).reduce(function (s, t) { return s + t.total; }, 0);

    var html = '';
    html += '<div style="overflow-y:auto;max-height:400px">';

    tradeOrder.forEach(function (tName, tIdx) {
        var t = trades[tName];
        var tradePct = totalCost > 0 ? (t.total / totalCost * 100).toFixed(1) : 0;
        var tColor = tradeColors[tName] || Components.CHART_COLORS[tIdx % Components.CHART_COLORS.length];
        var costLabel = t.total >= 1e8 ? (t.total / 1e8).toFixed(1) + '억' : (t.total / 1e4).toFixed(0) + '만';

        // 공종 헤더
        html += '<div style="padding:8px 10px;border-bottom:1px solid var(--border-default);background:' + tColor + '08">';
        html += '<div style="display:flex;align-items:center;gap:8px;margin-bottom:6px">';
        html += '<div style="width:4px;height:24px;background:' + tColor + ';border-radius:2px"></div>';
        html += '<div style="flex:1">';
        html += '<div style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">' + tName + '</div>';
        html += '<div style="font-size:0.48rem;color:var(--text-muted)">' + t.companies.length + '개 업체 · ' + costLabel + ' (' + tradePct + '%)</div>';
        html += '</div>';
        html += '</div>';

        // 업체별 바
        var top5 = t.companies.sort(function (a, b) { return b.cost - a.cost; }).slice(0, 5);
        var maxCost = top5[0] ? top5[0].cost : 1;
        top5.forEach(function (c) {
            var pct = (c.cost / maxCost * 100);
            var cLabel = c.cost >= 1e8 ? (c.cost / 1e8).toFixed(1) + '억' : (c.cost / 1e4).toFixed(0) + '만';
            var shareStr = t.total > 0 ? (c.cost / t.total * 100).toFixed(0) + '%' : '-';
            html += '<div style="display:flex;align-items:center;gap:6px;padding:2px 10px 2px 22px">';
            html += '<span style="min-width:100px;font-size:0.55rem;color:var(--text-secondary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.name + '</span>';
            html += '<div style="flex:1;height:12px;background:var(--bg-input);border-radius:3px;overflow:hidden">';
            html += '<div style="width:' + pct + '%;height:100%;background:' + tColor + '80;border-radius:3px;transition:width 0.6s"></div>';
            html += '</div>';
            html += '<span style="min-width:35px;font-size:0.52rem;font-weight:600;color:var(--text-primary);text-align:right">' + cLabel + '</span>';
            html += '<span style="min-width:26px;font-size:0.45rem;color:var(--text-muted);text-align:right">' + shareStr + '</span>';
            html += '</div>';
        });
        if (t.companies.length > 5) {
            html += '<div style="padding:2px 10px 2px 22px;font-size:0.45rem;color:var(--text-muted)">+ ' + (t.companies.length - 5) + '개 업체 더 있음</div>';
        }

        html += '</div>';
    });

    html += '</div>';

    // 인사이트 요약
    var topCompany = Object.entries(allCompanies).sort(function (a, b) { return b[1] - a[1]; })[0];
    if (topCompany) {
        html += '<div style="padding:8px 12px;border-top:1px solid var(--border-default);font-size:0.52rem;color:var(--text-muted);display:flex;align-items:center;gap:4px">';
        html += '<i class="fa-solid fa-lightbulb" style="color:#F59E0B"></i>';
        html += '<b>' + topCompany[0] + '</b>이 ' + (topCompany[1] / 1e8).toFixed(1) + '억으로 최대 비중 · 대체 업체 확보 검토 필요';
        html += '</div>';
    }

    el.innerHTML = html;
}

/* ══════════════════════════════════════════
 * 3. 동별(Zone) 업체 투입 현황
 * ══════════════════════════════════════════ */
function buildZoneMatrix(containerId, zoneData) {
    var el = document.getElementById(containerId);
    if (!el) return;
    var rows = (zoneData && zoneData.values) ? zoneData.values : [];
    if (rows.length === 0) { el.innerHTML = '<div style="padding:20px;text-align:center;color:var(--text-muted)">데이터 없음</div>'; return; }

    // Zone별 그룹화
    var zones = {};
    var zoneOrder = [];
    rows.forEach(function (r) {
        var z = r[0] || '미분류';
        var c = r[1] || '';
        var cnt = r[2] || 0;
        var cost = r[3] || 0;
        if (!zones[z]) { zones[z] = { total: 0, count: 0, companies: [] }; zoneOrder.push(z); }
        zones[z].total += cost;
        zones[z].count += cnt;
        zones[z].companies.push({ name: c, cnt: cnt, cost: cost });
    });

    var zoneColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4'];
    var totalCost = Object.values(zones).reduce(function (s, z) { return s + z.total; }, 0);

    var html = '';
    html += '<div style="display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:10px">';

    zoneOrder.forEach(function (zName, zIdx) {
        var z = zones[zName];
        var zColor = zoneColors[zIdx % zoneColors.length];
        var zonePct = totalCost > 0 ? (z.total / totalCost * 100).toFixed(1) : 0;
        var costLabel = z.total >= 1e8 ? (z.total / 1e8).toFixed(1) + '억' : (z.total / 1e4).toFixed(0) + '만';
        var displayName = zName.replace(/^\d+_/, '');

        html += '<div style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden;background:var(--bg-card)">';

        // Zone 헤더
        html += '<div style="padding:10px 12px;background:' + zColor + '08;border-bottom:1px solid var(--border-default)">';
        html += '<div style="display:flex;align-items:center;gap:6px">';
        html += '<div style="width:28px;height:28px;border-radius:6px;background:' + zColor + '20;display:flex;align-items:center;justify-content:center"><i class="fa-solid fa-building" style="font-size:0.7rem;color:' + zColor + '"></i></div>';
        html += '<div>';
        html += '<div style="font-size:0.7rem;font-weight:700;color:var(--text-primary)">' + displayName + '</div>';
        html += '<div style="font-size:0.48rem;color:var(--text-muted)">' + z.companies.length + '개사 · ' + costLabel + ' (' + zonePct + '%)</div>';
        html += '</div>';
        html += '</div>';

        // 비중 바
        html += '<div style="margin-top:6px;height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">';
        html += '<div style="width:' + zonePct + '%;height:100%;background:' + zColor + ';border-radius:3px;transition:width 0.6s"></div>';
        html += '</div>';
        html += '</div>';

        // 업체 리스트 (상위 5)
        html += '<div style="padding:6px 10px;max-height:140px;overflow-y:auto">';
        var top5 = z.companies.sort(function (a, b) { return b.cost - a.cost; }).slice(0, 5);
        top5.forEach(function (c, i) {
            var cCost = c.cost >= 1e8 ? (c.cost / 1e8).toFixed(1) + '억' : (c.cost / 1e4).toFixed(0) + '만';
            var sharePct = z.total > 0 ? (c.cost / z.total * 100).toFixed(0) : 0;
            html += '<div style="display:flex;align-items:center;gap:4px;padding:3px 0;' + (i < top5.length - 1 ? 'border-bottom:1px solid rgba(148,163,184,0.06)' : '') + '">';
            html += '<span style="font-size:0.48rem;color:var(--text-muted);min-width:12px">' + (i + 1) + '</span>';
            html += '<span style="flex:1;font-size:0.55rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap">' + c.name + '</span>';
            html += '<span style="font-size:0.5rem;font-weight:600;color:var(--text-secondary)">' + cCost + '</span>';
            html += '<span style="font-size:0.42rem;color:var(--text-muted);min-width:22px;text-align:right">' + sharePct + '%</span>';
            html += '</div>';
        });
        if (z.companies.length > 5) {
            html += '<div style="font-size:0.42rem;color:var(--text-muted);padding-top:3px">+ ' + (z.companies.length - 5) + '개 업체</div>';
        }
        html += '</div>';

        html += '</div>';
    });

    html += '</div>';

    // 인사이트
    var maxZone = zoneOrder.reduce(function (max, z) { return zones[z].companies.length > (max ? zones[max].companies.length : 0) ? z : max; }, null);
    if (maxZone) {
        html += '<div style="margin-top:8px;padding:8px 12px;background:var(--bg-input);border-radius:6px;font-size:0.52rem;color:var(--text-muted);display:flex;align-items:center;gap:4px">';
        html += '<i class="fa-solid fa-triangle-exclamation" style="color:#F59E0B"></i>';
        html += '<b>' + maxZone.replace(/^\d+_/, '') + '</b>에 ' + zones[maxZone].companies.length + '개사 집중 투입 → 안전관리 · 양중기 배치 강화 필요';
        html += '</div>';
    }

    el.innerHTML = html;
}

window.buildMonthlyHeatmap = buildMonthlyHeatmap;
window.buildTradeDistribution = buildTradeDistribution;
window.buildZoneMatrix = buildZoneMatrix;

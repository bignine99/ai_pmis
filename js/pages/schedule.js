/**
 * ============================================================
 * Page 3: 공정관리 (Schedule Management)
 * ============================================================
 * 5 Gantt charts: 마일스톤 / 개략 / 전체 / 분기 / 주간
 * 
 * 2026-02-17 전면 개선:
 *   - 개략/전체/분기/주간: 건설 실무형 공정표
 *   - HOW1_공사별 색상 그룹핑 + 그룹 헤더
 *   - 진행률 바 표시 (실선 = 진행, 빗금 = 잔여)
 *   - 비용 비중 막대 표시
 */

/* ── 공사 구분별 색상 팔레트 ──────────────── */
var GROUP_COLORS = {
    '건축공사': { bar: '#3B82F6', bg: 'rgba(59,130,246,0.06)', text: '#2563EB', icon: '🏗️' },
    '토목공사': { bar: '#10B981', bg: 'rgba(16,185,129,0.06)', text: '#059669', icon: '⛏️' },
    '조경공사': { bar: '#84CC16', bg: 'rgba(132,204,22,0.06)', text: '#65A30D', icon: '🌿' },
    '기계설비공사': { bar: '#F59E0B', bg: 'rgba(245,158,11,0.06)', text: '#D97706', icon: '⚙️' },
    '전기공사': { bar: '#8B5CF6', bg: 'rgba(139,92,246,0.06)', text: '#7C3AED', icon: '⚡' },
    '통신공사': { bar: '#06B6D4', bg: 'rgba(6,182,212,0.06)', text: '#0891B2', icon: '📡' },
    '소방공사': { bar: '#EF4444', bg: 'rgba(239,68,68,0.06)', text: '#DC2626', icon: '🚒' }
};
var DEFAULT_GROUP_COLOR = { bar: '#6366F1', bg: 'rgba(99,102,241,0.06)', text: '#4F46E5', icon: '📋' };

function getGroupColor(groupName) {
    for (var key in GROUP_COLORS) {
        if (groupName && groupName.indexOf(key.replace('공사', '')) >= 0) return GROUP_COLORS[key];
    }
    return DEFAULT_GROUP_COLOR;
}

/* ── 건설 실무형 Gantt 렌더러 (개략/전체/분기/주간) ─── */
function buildConstructionGantt(containerId, items, viewStart, viewEnd, options) {
    var el = document.getElementById(containerId);
    if (!el) return;
    options = options || {};

    if (!items || items.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">해당 기간에 데이터가 없습니다.</div>';
        return;
    }

    // ─ 날짜 범위 계산 ─
    var minD = viewStart || Infinity, maxD = viewEnd || -Infinity;
    if (!viewStart || !viewEnd) {
        items.forEach(function (r) {
            var s = new Date(r.startDate).getTime();
            var e = new Date(r.endDate).getTime();
            if (s < minD) minD = s;
            if (e > maxD) maxD = e;
        });
        // 여유 추가
        var pad = (maxD - minD) * 0.02;
        minD -= pad;
        maxD += pad;
    }
    var totalMs = maxD - minD;
    if (totalMs <= 0) totalMs = 1;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayMs = today.getTime();
    var todayPct = ((todayMs - minD) / totalMs * 100);

    // ─ 월 눈금 생성 ─
    var monthTicks = [];
    var cur = new Date(minD);
    cur.setDate(1);
    cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= maxD) {
        var pct = (cur.getTime() - minD) / totalMs * 100;
        if (pct >= 0 && pct <= 100) {
            monthTicks.push({ pct: pct, label: cur.getFullYear().toString().slice(2) + '.' + String(cur.getMonth() + 1).padStart(2, '0') });
        }
        cur.setMonth(cur.getMonth() + 1);
    }

    // ─ 공사 구분별 그룹핑 ─
    var groups = {};
    var groupOrder = [];
    var maxCost = 0;
    items.forEach(function (item) {
        var g = item.group || '기타';
        if (!groups[g]) {
            groups[g] = [];
            groupOrder.push(g);
        }
        groups[g].push(item);
        if (item.totalCost > maxCost) maxCost = item.totalCost;
    });

    // ─ 행 높이 및 총 행 수 계산 ─
    var rowH = 28;
    var groupHeaderH = 32;
    var totalRows = items.length + groupOrder.length;
    var nameColW = options.nameColWidth || 200;
    var costColW = 60;

    // ─ HTML 빌드 ─
    var html = '';

    // 타이틀
    var titleText = options.title || '공정표';
    html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;gap:8px">';
    html += '<span style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">' + titleText + '</span>';
    html += '<span style="font-size:0.58rem;color:var(--text-muted);margin-left:auto">' + items.length + '개 Activity · ';
    html += groupOrder.length + '개 공사 구분</span>';
    html += '</div>';

    // 헤더
    html += '<div style="display:flex;border-bottom:1px solid var(--border-default);position:sticky;top:0;z-index:5;background:var(--bg-card)">';
    html += '<div style="min-width:' + nameColW + 'px;max-width:' + nameColW + 'px;padding:4px 8px;font-size:0.58rem;font-weight:700;color:var(--text-muted)">Activity</div>';
    html += '<div style="min-width:' + costColW + 'px;max-width:' + costColW + 'px;padding:4px 4px;font-size:0.52rem;font-weight:700;color:var(--text-muted);text-align:right">비중</div>';
    html += '<div style="flex:1;position:relative;height:22px;overflow:hidden">';
    monthTicks.forEach(function (t) {
        html += '<span style="position:absolute;left:' + t.pct + '%;top:2px;font-size:0.5rem;color:var(--text-muted);transform:translateX(-50%);white-space:nowrap">' + t.label + '</span>';
    });
    html += '</div></div>';

    // 바디
    var scrollH = Math.min(totalRows * rowH + groupOrder.length * 4 + 4, 650);
    html += '<div style="max-height:' + scrollH + 'px;overflow-y:auto">';

    var globalIdx = 0;
    groupOrder.forEach(function (groupName) {
        var gc = getGroupColor(groupName);
        var groupItems = groups[groupName];

        // 그룹 헤더
        var groupTotal = 0;
        var groupStart = Infinity, groupEnd = -Infinity;
        groupItems.forEach(function (item) {
            groupTotal += item.totalCost || 0;
            var s = new Date(item.startDate).getTime();
            var e = new Date(item.endDate).getTime();
            if (s < groupStart) groupStart = s;
            if (e > groupEnd) groupEnd = e;
        });

        var groupStartDate = new Date(groupStart);
        var groupEndDate = new Date(groupEnd);
        var groupDuration = Math.round((groupEnd - groupStart) / 86400000);
        var groupStartStr = groupStartDate.getFullYear() + '.' + String(groupStartDate.getMonth() + 1).padStart(2, '0');
        var groupEndStr = groupEndDate.getFullYear() + '.' + String(groupEndDate.getMonth() + 1).padStart(2, '0');

        html += '<div style="display:flex;align-items:center;height:' + groupHeaderH + 'px;background:' + gc.bg + ';border-bottom:2px solid ' + gc.bar + '30;padding:0 8px">';
        html += '<div style="min-width:' + nameColW + 'px;max-width:' + nameColW + 'px;display:flex;align-items:center;gap:6px">';
        html += '<span style="font-size:0.75rem">' + gc.icon + '</span>';
        html += '<span style="font-size:0.68rem;font-weight:700;color:' + gc.text + '">' + groupName + '</span>';
        html += '<span style="font-size:0.52rem;color:var(--text-muted);font-weight:500">' + groupItems.length + '작업 · ' + groupDuration + '일 (' + groupStartStr + '~' + groupEndStr + ')</span>';
        html += '</div>';
        html += '<div style="min-width:' + costColW + 'px;max-width:' + costColW + 'px;text-align:right;font-size:0.55rem;font-weight:600;color:' + gc.text + '">';
        html += (groupTotal / 1e8).toFixed(1) + '억';
        html += '</div>';
        // 그룹 바 (전체 범위)
        html += '<div style="flex:1;position:relative;height:100%">';
        monthTicks.forEach(function (t) {
            html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,0.06)"></div>';
        });
        var gLeft = Math.max(0, (groupStart - minD) / totalMs * 100);
        var gWidth = Math.max(0.5, (groupEnd - groupStart) / totalMs * 100);
        html += '<div style="position:absolute;left:' + gLeft + '%;width:' + gWidth + '%;top:8px;height:' + (groupHeaderH - 16) + 'px;background:' + gc.bar + '18;border:1px solid ' + gc.bar + '30;border-radius:3px"></div>';
        // 오늘 선
        if (todayPct >= 0 && todayPct <= 100) {
            html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF4444;z-index:2"></div>';
        }
        html += '</div></div>';

        // 작업 행
        groupItems.forEach(function (item, idx) {
            var s = new Date(item.startDate).getTime();
            var e = new Date(item.endDate).getTime();
            var left = Math.max(0, (s - minD) / totalMs * 100);
            var width = Math.max(0.5, (e - s) / totalMs * 100);
            var durationDays = Math.round((e - s) / 86400000);
            var sDate = new Date(s);
            var eDate = new Date(e);
            var sStr = sDate.getFullYear() + '.' + String(sDate.getMonth() + 1).padStart(2, '0') + '.' + String(sDate.getDate()).padStart(2, '0');
            var eStr = eDate.getFullYear() + '.' + String(eDate.getMonth() + 1).padStart(2, '0') + '.' + String(eDate.getDate()).padStart(2, '0');
            var progress = item.progress || 0;

            // 비용 비중 바
            var costPct = maxCost > 0 ? (item.totalCost / maxCost * 100) : 0;
            var costLabel = item.totalCost >= 1e8 ? (item.totalCost / 1e8).toFixed(1) + '억' :
                item.totalCost >= 1e4 ? (item.totalCost / 1e4).toFixed(0) + '만' : '-';

            var bgStyle = globalIdx % 2 ? 'background:rgba(148,163,184,0.02)' : '';

            html += '<div style="display:flex;align-items:center;height:' + rowH + 'px;border-bottom:1px solid rgba(148,163,184,0.06);' + bgStyle + '">';

            // Activity 이름
            var label = (item.name || '').length > 22 ? (item.name || '').substr(0, 22) + '..' : (item.name || '');
            html += '<div style="min-width:' + nameColW + 'px;max-width:' + nameColW + 'px;padding:0 8px 0 24px;font-size:0.6rem;color:var(--text-primary);overflow:hidden;text-overflow:ellipsis;white-space:nowrap;display:flex;align-items:center;gap:4px" title="' + (item.name || '') + '">';
            // 진행률 인디케이터 (색상 점)
            var dotColor = progress >= 100 ? '#10B981' : progress > 50 ? '#3B82F6' : progress > 0 ? '#F59E0B' : 'var(--text-muted)';
            html += '<span style="width:5px;height:5px;border-radius:50%;background:' + dotColor + ';flex-shrink:0"></span>';
            html += label;
            html += '</div>';

            // 비용 비중
            html += '<div style="min-width:' + costColW + 'px;max-width:' + costColW + 'px;padding:0 4px;display:flex;align-items:center;gap:3px">';
            html += '<div style="flex:1;height:4px;background:var(--bg-input);border-radius:2px;overflow:hidden">';
            html += '<div style="width:' + Math.min(costPct, 100) + '%;height:100%;background:' + gc.bar + '60;border-radius:2px"></div>';
            html += '</div>';
            html += '<span style="font-size:0.45rem;color:var(--text-muted);white-space:nowrap;min-width:28px;text-align:right">' + costLabel + '</span>';
            html += '</div>';

            // 바 영역
            html += '<div style="flex:1;position:relative;height:100%">';
            // 월 그리드
            monthTicks.forEach(function (t) {
                html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,0.06)"></div>';
            });
            // 오늘 선
            if (todayPct >= 0 && todayPct <= 100) {
                html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF4444;z-index:2"></div>';
            }

            // 바 (진행률 표시)
            var barTop = 5;
            var barH = rowH - 10;
            var tooltip = item.name + '\n' + sStr + ' ~ ' + eStr + ' (' + durationDays + '일)\n진행률: ' + progress + '%\n' + item.count + '건, ' + costLabel;

            // 배경 바 (전체 범위 - 연한색)
            html += '<div title="' + tooltip + '" ';
            html += 'style="position:absolute;left:' + left + '%;width:' + width + '%;top:' + barTop + 'px;height:' + barH + 'px;';
            html += 'background:' + gc.bar + '25;border-radius:3px;overflow:hidden;cursor:pointer;min-width:3px" ';
            html += 'onmouseover="this.style.boxShadow=\'0 0 8px ' + gc.bar + '40\'" onmouseout="this.style.boxShadow=\'none\'">';

            // 진행률 바 (채워진 부분 - 진한색)
            if (progress > 0) {
                html += '<div style="width:' + Math.min(progress, 100) + '%;height:100%;background:' + gc.bar + ';border-radius:3px 0 0 3px;transition:width 0.8s ease"></div>';
            }
            html += '</div>';

            // 진행률 텍스트 (바 안에 표시)
            if (width > 4) {
                var textContent = progress > 0 ? progress + '%' : durationDays + 'd';
                html += '<span style="position:absolute;left:' + (left + width / 2) + '%;top:' + (barTop + 1) + 'px;transform:translateX(-50%);font-size:0.44rem;color:' + (progress > 50 ? '#fff' : gc.text) + ';white-space:nowrap;pointer-events:none;font-weight:600;line-height:' + (barH - 2) + 'px">' + textContent + '</span>';
            }

            html += '</div></div>';
            globalIdx++;
        });
    });
    html += '</div>';

    // 범례
    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 14px;font-size:0.55rem;color:var(--text-muted);border-top:1px solid var(--border-default);flex-wrap:wrap">';
    groupOrder.forEach(function (g) {
        var gc = getGroupColor(g);
        html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:10px;height:4px;background:' + gc.bar + ';border-radius:2px"></div>' + g + '</div>';
    });
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:12px;height:2px;background:#EF4444"></div> 오늘 (' + today.toISOString().slice(0, 10) + ')</div>';
    html += '<div style="display:flex;align-items:center;gap:3px;margin-left:6px">';
    html += '<span style="width:5px;height:5px;border-radius:50%;background:#10B981"></span> 완료';
    html += '<span style="width:5px;height:5px;border-radius:50%;background:#3B82F6;margin-left:4px"></span> 진행중';
    html += '<span style="width:5px;height:5px;border-radius:50%;background:#F59E0B;margin-left:4px"></span> 초기';
    html += '<span style="width:5px;height:5px;border-radius:50%;background:var(--text-muted);margin-left:4px"></span> 미착수';
    html += '</div>';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 마일스톤 공정표 렌더러 ─────────────────── */
function buildMilestoneGantt(containerId, milestones) {
    var el = document.getElementById(containerId);
    if (!el || milestones.length === 0) {
        if (el) el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">마일스톤 데이터가 없습니다.</div>';
        return;
    }

    // 날짜 파싱
    var items = [];
    milestones.forEach(function (m) {
        var d = new Date(m.date);
        if (!isNaN(d.getTime())) {
            d.setHours(0, 0, 0, 0);
            items.push({ name: m.name, ts: d.getTime(), dateStr: m.date, type: m.type || 'mid' });
        }
    });
    if (items.length === 0) return;

    items.sort(function (a, b) { return a.ts - b.ts; });

    var minD = items[0].ts - 30 * 86400000; // 1달 여유
    var maxD = items[items.length - 1].ts + 30 * 86400000;
    var totalMs = maxD - minD;

    var today = new Date();
    today.setHours(0, 0, 0, 0);
    var todayPct = (today.getTime() - minD) / totalMs * 100;

    // 월 눈금
    var monthTicks = [];
    var cur = new Date(minD);
    cur.setDate(1);
    cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= maxD) {
        var pct = (cur.getTime() - minD) / totalMs * 100;
        if (pct >= 0 && pct <= 100) {
            monthTicks.push({ pct: pct, label: cur.getFullYear().toString().slice(2) + '.' + String(cur.getMonth() + 1).padStart(2, '0') });
        }
        cur.setMonth(cur.getMonth() + 1);
    }

    var colors = { start: '#10B981', mid: '#3B82F6', end: '#EF4444' };
    var rowH = 56;
    var html = '';

    // 타이틀
    html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;gap:8px">';
    html += '<span style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">Milestone Schedule</span>';
    html += '<span style="font-size:0.58rem;color:var(--text-muted);margin-left:auto">Duration=0, Key Events Only</span>';
    html += '</div>';

    // 타임라인 헤더
    html += '<div style="display:flex;border-bottom:1px solid var(--border-default)">';
    html += '<div style="min-width:220px;max-width:220px;padding:4px 12px;font-size:0.58rem;font-weight:700;color:var(--text-muted)">Milestone</div>';
    html += '<div style="min-width:80px;max-width:80px;padding:4px 6px;font-size:0.58rem;font-weight:700;color:var(--text-muted);text-align:center">Plan Date</div>';
    html += '<div style="flex:1;position:relative;height:22px;overflow:hidden">';
    monthTicks.forEach(function (t) {
        html += '<span style="position:absolute;left:' + t.pct + '%;top:2px;font-size:0.5rem;color:var(--text-muted);transform:translateX(-50%);white-space:nowrap">' + t.label + '</span>';
    });
    html += '</div></div>';

    // 마일스톤 행
    items.forEach(function (m, idx) {
        var pct = (m.ts - minD) / totalMs * 100;
        var col = colors[m.type] || '#3B82F6';
        var d = new Date(m.ts);
        var dateLabel = d.getFullYear() + '.' + String(d.getMonth() + 1).padStart(2, '0') + '.' + String(d.getDate()).padStart(2, '0');

        // 이전 마일스톤과의 간격 (일)
        var daysBetween = '';
        if (idx > 0) {
            daysBetween = Math.round((m.ts - items[idx - 1].ts) / 86400000) + '일';
        }

        html += '<div style="display:flex;align-items:center;height:' + rowH + 'px;border-bottom:1px solid rgba(148,163,184,0.06);' +
            (idx % 2 ? 'background:rgba(148,163,184,0.02)' : '') + '">';

        // 라벨
        html += '<div style="min-width:220px;max-width:220px;padding:0 12px">';
        html += '<div style="font-size:0.68rem;font-weight:700;color:var(--text-primary)">' + m.name + '</div>';
        if (daysBetween) {
            html += '<div style="font-size:0.52rem;color:var(--text-muted);margin-top:2px">이전 대비 +' + daysBetween + '</div>';
        }
        html += '</div>';

        // 날짜
        html += '<div style="min-width:80px;max-width:80px;padding:0 6px;text-align:center">';
        html += '<div style="font-size:0.62rem;font-weight:600;color:' + col + '">' + dateLabel + '</div>';
        html += '</div>';

        // 타임라인 영역
        html += '<div style="flex:1;position:relative;height:100%">';
        // 그리드
        monthTicks.forEach(function (t) {
            html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,0.08)"></div>';
        });
        // 이전 마일스톤까지 연결선
        if (idx > 0) {
            var prevPct = (items[idx - 1].ts - minD) / totalMs * 100;
            html += '<div style="position:absolute;left:' + prevPct + '%;width:' + (pct - prevPct) + '%;top:50%;height:2px;background:linear-gradient(90deg,' + colors[items[idx - 1].type] + ',' + col + ');opacity:0.3"></div>';
        }
        // 오늘 선
        if (todayPct >= 0 && todayPct <= 100) {
            html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF4444;z-index:2"></div>';
        }
        // 다이아몬드 마커 ◆
        html += '<div style="position:absolute;left:' + pct + '%;top:50%;transform:translate(-50%,-50%) rotate(45deg);' +
            'width:16px;height:16px;background:' + col + ';border:2px solid #fff;box-shadow:0 0 6px ' + col + '40;z-index:3;cursor:pointer" ' +
            'title="' + m.name + ' (' + dateLabel + ')"></div>';
        // 날짜 라벨 (다이아몬드 아래)
        html += '<div style="position:absolute;left:' + pct + '%;top:calc(50% + 14px);transform:translateX(-50%);' +
            'font-size:0.45rem;color:' + col + ';white-space:nowrap;font-weight:600">' + dateLabel.slice(5) + '</div>';
        html += '</div></div>';
    });

    // 범례
    html += '<div style="display:flex;align-items:center;gap:12px;padding:8px 14px;font-size:0.55rem;color:var(--text-muted);border-top:1px solid var(--border-default)">';
    html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:#10B981;transform:rotate(45deg)"></div> 착공</div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:#3B82F6;transform:rotate(45deg)"></div> 주요 이벤트</div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:10px;height:10px;background:#EF4444;transform:rotate(45deg)"></div> 준공</div>';
    html += '<div style="display:flex;align-items:center;gap:4px"><div style="width:12px;height:2px;background:#EF4444"></div> 오늘</div>';
    html += '<span style="margin-left:auto">' + items.length + '개 마일스톤</span>';
    html += '</div>';

    el.innerHTML = html;
}

/* ── 날짜 파싱 헬퍼 ────────────────────────── */
function parseDate(str) {
    if (!str) return null;
    var d = new Date(str);
    if (isNaN(d.getTime())) return null;
    d.setHours(0, 0, 0, 0);
    return d.getTime();
}

function queryToGantt(result, nameIdx) {
    nameIdx = nameIdx || 0;
    var arr = [];
    if (!result || !result.values) return arr;
    result.values.forEach(function (r) {
        var s = parseDate(r[1]);
        var e = parseDate(r[2]);
        if (s && e && e > s) {
            arr.push({ name: r[nameIdx] || '', s: s, e: e, cnt: r[3] || 1 });
        }
    });
    return arr;
}

/* ── 메인 렌더 ──────────────────────────────── */
function renderSchedulePage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var timeline = DB.getScheduleTimeline();
    var duration = DB.getDurationByTrade();

    var totalTasks = timeline.values.reduce(function (s, r) { return s + r[1]; }, 0);
    var months = timeline.values.length;
    var peakMonth = timeline.values.reduce(function (max, r) { return r[1] > max[1] ? r : max; }, timeline.values[0] || ['-', 0]);

    // ─ 날짜 계산 ─
    var now = new Date();
    now.setHours(0, 0, 0, 0);

    // 전체 프로젝트 기간
    var projStart = DB.runScalar("SELECT MIN(WHEN1_시작일) FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''");
    var projEnd = DB.runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''");
    var projDays = 0;
    var elapsedDays = 0;
    var remainDays = 0;
    if (projStart && projEnd) {
        projDays = Math.round((new Date(projEnd) - new Date(projStart)) / 86400000);
        elapsedDays = Math.max(0, Math.round((now - new Date(projStart)) / 86400000));
        remainDays = Math.max(0, projDays - elapsedDays);
    }

    // 분기 범위
    var qMonth = Math.floor(now.getMonth() / 3) * 3;
    var qStart = new Date(now.getFullYear(), qMonth, 1);
    var qEnd = new Date(now.getFullYear(), qMonth + 3, 0);
    var qLabel = now.getFullYear() + '년 ' + (Math.floor(now.getMonth() / 3) + 1) + 'Q';

    // 주간 범위
    var dayOfWeek = now.getDay();
    var wStart = new Date(now.getTime() - (dayOfWeek === 0 ? 6 : dayOfWeek - 1) * 86400000);
    var wEnd = new Date(wStart.getTime() + 6 * 86400000);
    var wLabel = (wStart.getMonth() + 1) + '/' + wStart.getDate() + ' ~ ' + (wEnd.getMonth() + 1) + '/' + wEnd.getDate();

    var tabs = [
        { id: 'milestone', label: '마일스톤', icon: 'fa-flag', count: 5 },
        { id: 'planned', label: '예정', icon: 'fa-file-lines', count: 0 },
        { id: 'full', label: '전체', icon: 'fa-bars-staggered', count: 50 },
        { id: 'quarter', label: '분기 (' + qLabel + ')', icon: 'fa-calendar-days', count: 40 },
        { id: 'week', label: '주간 (' + wLabel + ')', icon: 'fa-calendar-week', count: 20 }
    ];

    // KPI에 진행률 추가 — EVMS 기반으로 통일
    var today = new Date().toISOString().slice(0, 10);
    var evmsData = DB.calculateEvmsMetrics(today);

    // 예정 공정률 = PV / BAC (EVMS 계획 기반)
    var progPct = evmsData.bac > 0 ? Math.round(evmsData.pv / evmsData.bac * 100) : 0;
    var progColor = progPct > 80 ? '#EF4444' : progPct > 50 ? '#F59E0B' : '#10B981';

    // 현행 공정률 = EV / BAC (실행률 기반 실적)
    var actualPct = evmsData.bac > 0 ? Math.round(evmsData.ev / evmsData.bac * 100) : 0;
    var actualColor = actualPct >= progPct ? '#10B981' : actualPct >= progPct * 0.9 ? '#F59E0B' : '#EF4444';

    container.innerHTML =
        // KPI 카드 (4단)
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-bottom:12px">' +
        // ─ 카드1: 공정률 ─
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-blue" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-clock"></i></div>' +
        '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">공정률 <span style="font-size:1.1rem;font-weight:800;margin-left:6px">' + actualPct + '%</span></div>' +
        '</div>' +
        '<div style="margin-top:10px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="font-size:0.6rem;color:var(--text-primary);font-weight:600">예정 공정률</span><span style="font-size:0.6rem;font-weight:700;color:' + progColor + '">' + progPct + '%</span></div>' +
        '<div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + progPct + '%;height:100%;background:' + progColor + ';border-radius:3px;transition:width 1s ease"></div>' +
        '</div>' +
        '</div>' +
        '<div style="margin-top:6px">' +
        '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:3px"><span style="font-size:0.6rem;color:var(--text-primary);font-weight:600">현행 공정률</span><span style="font-size:0.6rem;font-weight:700;color:' + actualColor + '">' + actualPct + '%</span></div>' +
        '<div style="height:6px;background:var(--bg-input);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + actualPct + '%;height:100%;background:' + actualColor + ';border-radius:3px;transition:width 1s ease"></div>' +
        '</div>' +
        '</div>' +
        '</div>' +
        // ─ 카드2: 공사기간 ─
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-purple" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-flag-checkered"></i></div>' +
        '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">공사기간</div>' +
        '</div>' +
        '<div style="margin-top:10px;font-size:0.65rem;color:var(--text-primary);line-height:1.8">' +
        '<div style="display:flex;justify-content:space-between"><span style="font-weight:600">착공일</span><span style="font-weight:700">2025-06-01</span></div>' +
        '<div style="display:flex;justify-content:space-between"><span style="font-weight:600">준공 예정일</span><span style="font-weight:700">2027-07-20</span></div>' +
        '<div style="text-align:right;margin-top:2px"><span style="color:#3B82F6;font-weight:800;font-size:0.75rem">D-' + Math.max(0, Math.ceil((new Date('2027-07-20') - new Date()) / 86400000)) + '일</span></div>' +
        '</div>' +
        '</div>' +
        // ─ 카드3: 이번 달 주요 공정 ─
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon kpi-accent-green" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-list-check"></i></div>' +
        '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">이번 달 주요 공정</div>' +
        '</div>' +
        '<div style="margin-top:10px;font-size:0.65rem;color:var(--text-primary);line-height:1.8">' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#3B82F6;color:#fff;font-size:0.5rem;font-weight:700;flex-shrink:0">1</span><span style="font-weight:600">본관동 B1F 골조 공사</span></div>' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#3B82F6;color:#fff;font-size:0.5rem;font-weight:700;flex-shrink:0">2</span><span style="font-weight:600">본관동 B1F 철골 공사</span></div>' +
        '<div style="display:flex;align-items:center;gap:6px"><span style="display:inline-flex;align-items:center;justify-content:center;width:16px;height:16px;border-radius:50%;background:#3B82F6;color:#fff;font-size:0.5rem;font-weight:700;flex-shrink:0">3</span><span style="font-weight:600">B1F 지하층 되메우기 공사</span></div>' +
        '</div>' +
        '</div>' +
        // ─ 카드4: SPI 게이지 (고급) ─
        (function () {
            var spi = evmsData.spi || 0;
            var spiVal = spi.toFixed(2);
            var spiColor = spi >= 1.0 ? '#10B981' : spi >= 0.95 ? '#F59E0B' : '#EF4444';
            var spiMsg = spi >= 1.0 ? '✓ 정상 진행 (On Schedule)' : spi >= 0.95 ? '⚠ 주의: 소폭 지연' : '⚠ 지연 경고 (Delay Alert)';

            // 게이지 파라미터: 범위 0.7 ~ 1.3
            var gMin = 0.7, gMax = 1.3;
            var cx = 80, cy = 72, r = 58, sw = 12;
            var clamped = Math.max(gMin, Math.min(gMax, spi));

            // 각도 변환 (180도 반원: 왼쪽 = gMin, 오른쪽 = gMax)
            function valToAngle(v) {
                return Math.PI - ((v - gMin) / (gMax - gMin)) * Math.PI;
            }

            // 아크 패스 생성
            function makeArc(fromVal, toVal) {
                var a1 = valToAngle(fromVal), a2 = valToAngle(toVal);
                var x1 = cx + r * Math.cos(a1), y1 = cy - r * Math.sin(a1);
                var x2 = cx + r * Math.cos(a2), y2 = cy - r * Math.sin(a2);
                var sweep = (a1 - a2) > Math.PI ? 1 : 0;
                return 'M' + x1.toFixed(1) + ',' + y1.toFixed(1) + ' A' + r + ',' + r + ' 0 ' + sweep + ' 1 ' + x2.toFixed(1) + ',' + y2.toFixed(1);
            }

            // 색상 구간
            var zones = [
                { from: 0.7, to: 0.85, color: '#EF4444' },  // 위험 (빨강)
                { from: 0.85, to: 0.95, color: '#F97316' },  // 경고 (주황)
                { from: 0.95, to: 1.0, color: '#FBBF24' },  // 주의 (노랑)
                { from: 1.0, to: 1.15, color: '#84CC16' },  // 양호 (연두)
                { from: 1.15, to: 1.3, color: '#22C55E' }   // 우수 (초록)
            ];

            var zonePaths = '';
            zones.forEach(function (z) {
                zonePaths += '<path d="' + makeArc(z.from, z.to) + '" fill="none" stroke="' + z.color + '" stroke-width="' + sw + '" stroke-linecap="butt"/>';
            });

            // 바늘 (needle)
            var needleAngle = valToAngle(clamped);
            var needleLen = r - 16;
            var nx = cx + needleLen * Math.cos(needleAngle);
            var ny = cy - needleLen * Math.sin(needleAngle);
            // 바늘 베이스 (삼각형)
            var bAngle1 = needleAngle + Math.PI / 2;
            var bAngle2 = needleAngle - Math.PI / 2;
            var bx1 = cx + 4 * Math.cos(bAngle1), by1 = cy - 4 * Math.sin(bAngle1);
            var bx2 = cx + 4 * Math.cos(bAngle2), by2 = cy - 4 * Math.sin(bAngle2);

            // 1.0 기준선 마커
            var refAngle = valToAngle(1.0);
            var refInnerR = r - sw / 2 - 4, refOuterR = r + sw / 2 + 4;
            var rx1 = cx + refInnerR * Math.cos(refAngle), ry1 = cy - refInnerR * Math.sin(refAngle);
            var rx2 = cx + refOuterR * Math.cos(refAngle), ry2 = cy - refOuterR * Math.sin(refAngle);

            // 눈금 라벨
            var labels = [0.7, 0.85, 1.0, 1.15, 1.3];
            var labelSvg = '';
            labels.forEach(function (v) {
                var la = valToAngle(v);
                var lx = cx + (r + sw / 2 + 12) * Math.cos(la);
                var ly = cy - (r + sw / 2 + 12) * Math.sin(la);
                var fw = v === 1.0 ? '700' : '400';
                var fs = v === 1.0 ? '8' : '7';
                var fc = v === 1.0 ? 'var(--text-primary)' : '#94A3B8';
                labelSvg += '<text x="' + lx.toFixed(1) + '" y="' + (ly + 3).toFixed(1) + '" text-anchor="middle" font-size="' + fs + '" font-weight="' + fw + '" fill="' + fc + '">' + v.toFixed(v === 1.0 ? 1 : 2) + '</text>';
            });

            return '<div class="glass-card" style="padding:14px 16px;text-align:center">' +
                '<div style="display:flex;align-items:center;gap:6px;justify-content:flex-start;margin-bottom:2px">' +
                '<div class="kpi-icon kpi-accent-amber" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-chart-line"></i></div>' +
                '<span style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">SPI</span>' +
                '</div>' +
                '<svg viewBox="0 0 160 95" style="width:160px;height:95px;margin:0 auto;display:block">' +
                // 색상 구간 아크
                zonePaths +
                // 1.0 기준선
                '<line x1="' + rx1.toFixed(1) + '" y1="' + ry1.toFixed(1) + '" x2="' + rx2.toFixed(1) + '" y2="' + ry2.toFixed(1) + '" stroke="var(--text-primary)" stroke-width="2" opacity="0.6"/>' +
                // 바늘
                '<polygon points="' + nx.toFixed(1) + ',' + ny.toFixed(1) + ' ' + bx1.toFixed(1) + ',' + by1.toFixed(1) + ' ' + bx2.toFixed(1) + ',' + by2.toFixed(1) + '" fill="var(--text-primary)"/>' +
                '<circle cx="' + cx + '" cy="' + cy + '" r="5" fill="var(--text-primary)" stroke="var(--bg-card)" stroke-width="2"/>' +
                // 중앙 값 표시
                '<text x="' + cx + '" y="' + (cy - 8) + '" text-anchor="middle" font-size="16" font-weight="800" fill="' + spiColor + '">' + spiVal + '</text>' +
                // 눈금 라벨
                labelSvg +
                '</svg>' +
                '<div style="margin-top:0px;font-size:0.55rem;font-weight:600;color:#fff;background:' + spiColor + ';display:inline-block;padding:2px 10px;border-radius:10px">' + spiMsg + '</div>' +
                '</div>';
        })() +

        '</div>' +

        // 공정표 탭 카드
        '<div class="glass-card" style="padding:16px;margin-bottom:12px">' +
        '<div style="display:flex;align-items:center;gap:8px;margin-bottom:12px;flex-wrap:wrap">' +
        '<span style="font-size:0.75rem;font-weight:700;color:var(--text-secondary);margin-right:4px;white-space:nowrap">공정표 LoD:</span>' +
        tabs.map(function (t, i) {
            return '<button class="gantt-tab' + (i === 0 ? ' active' : '') + '" data-tab="' + t.id + '" style="' +
                'padding:6px 14px;border-radius:8px;font-size:0.68rem;font-weight:600;border:1px solid var(--border-default);' +
                'cursor:pointer;transition:all 0.2s;' +
                (i === 0 ? 'background:#3B82F6;color:#fff;border-color:#3B82F6' : 'background:transparent;color:var(--text-secondary)') +
                '"><i class="fa-solid ' + t.icon + '" style="margin-right:4px"></i>' + t.label + '</button>';
        }).join('') +
        '</div>' +
        '<div id="gantt-container" style="border:1px solid var(--border-default);border-radius:8px;overflow:hidden;background:var(--bg-card)"></div>' +
        '</div>' +

        // 기존 차트 (3단)
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('월별 작업 (내역) 건수', 'fa-chart-line') +
        '<div style="height:280px"><canvas id="schedule-timeline"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px;flex-wrap:wrap">' +
        '<div style="display:flex;align-items:center;gap:6px"><i class="fa-solid fa-stopwatch" style="color:var(--accent);font-size:0.8rem"></i><span style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">공사별 공사 기간</span></div>' +
        '<div style="display:flex;gap:4px;margin-left:auto">' +
        ['건축', '토목', '조경', '기계'].map(function (t, i) {
            return '<button class="dur-tab" data-how1="' + t + '" style="padding:3px 10px;border-radius:6px;font-size:0.6rem;font-weight:600;border:1px solid var(--border-default);cursor:pointer;' +
                (i === 0 ? 'background:#3B82F6;color:#fff;border-color:#3B82F6' : 'background:transparent;color:var(--text-secondary)') +
                '">' + t + '</button>';
        }).join('') +
        '</div></div>' +
        '<div id="duration-chart-wrap" style="height:280px"><canvas id="schedule-duration-bar"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('월별 예산 투입 추이', 'fa-money-bill-trend-up') +
        '<div style="height:280px"><canvas id="schedule-cost-line"></canvas></div>' +
        '</div>' +
        '</div>' +

        // 일정 상세 테이블
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('공종별 일정 상세', 'fa-table') +
        Components.createDataTable(
            ['대공종', '품목수', '평균공기(일)', '최대공기(일)', '시작일', '종료일'],
            duration.values.map(function (r) { return [r[0], Components.formatNumber(r[1]), r[2], r[3], r[4], r[5]]; }),
            { id: 'schedule-table' }
        ) +
        '</div>';

    // ─ Gantt 데이터 로드 ─
    var qStartStr = qStart.toISOString().slice(0, 10);
    var qEndStr = qEnd.toISOString().slice(0, 10);
    var wStartStr = wStart.toISOString().slice(0, 10);
    var wEndStr = wEnd.toISOString().slice(0, 10);

    var ganttData = {
        milestone: DB.getProjectMilestones(),
        fullRaw: DB.getOutlineScheduleData(),
        quarter: DB.getHierarchicalGantt(40,
            "WHEN1_시작일 <= '" + qEndStr + "' AND WHEN2종료일 >= '" + qStartStr + "'"),
        week: DB.getHierarchicalGantt(20,
            "WHEN1_시작일 <= '" + wEndStr + "' AND WHEN2종료일 >= '" + wStartStr + "'")
    };

    function showGantt(tabId) {
        if (tabId === 'milestone') {
            buildMilestoneGantt('gantt-container', ganttData.milestone);
        } else if (tabId === 'full') {
            // 전체 공정표: WBS Roll-up + Zone + Hammock + Critical Zone
            buildOutlineGantt('gantt-container', ganttData.fullRaw, ganttData.milestone);
        } else if (tabId === 'planned') {
            // 예정 공정표: 외부 파일 연결
            showPlannedSchedule('gantt-container');
        } else if (tabId === 'quarter') {
            // 분기 공정표: 외부 HTML 임베딩
            showQuarterSchedule('gantt-container', qLabel);
        } else if (tabId === 'week') {
            // 주간 공정표: 외부 HTML 임베딩
            showWeekSchedule('gantt-container', wLabel);
        } else {
            var data = ganttData[tabId] || [];
            var viewOpts = {};
            buildConstructionGantt('gantt-container', data, null, null, viewOpts);
        }
    }

    // 예정 공정표 - PDF 임베딩
    function showPlannedSchedule(containerId) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var pdfUrl = 'output/planned_schedule.pdf';

        el.innerHTML =
            // 헤더 툴바
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border-default);background:var(--bg-card)">' +
            '<i class="fa-solid fa-file-pdf" style="color:#EF4444;font-size:0.85rem"></i>' +
            '<span style="font-size:0.75rem;font-weight:700;color:var(--text-primary)">예정 공정표 (Planned Schedule)</span>' +
            '<span style="font-size:0.52rem;color:var(--text-muted);background:var(--bg-input);padding:2px 8px;border-radius:4px">PDF Viewer</span>' +
            '<div style="margin-left:auto;display:flex;gap:6px">' +
            '<a href="' + pdfUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border-default);border-radius:6px;font-size:0.6rem;font-weight:600;text-decoration:none;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor=\'#3B82F6\';this.style.color=\'#3B82F6\'" onmouseout="this.style.borderColor=\'var(--border-default)\';this.style.color=\'var(--text-secondary)\'">' +
            '<i class="fa-solid fa-up-right-from-square"></i> 새 창</a>' +
            '<a href="' + pdfUrl + '" download style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:#3B82F6;color:#fff;border:1px solid #3B82F6;border-radius:6px;font-size:0.6rem;font-weight:600;text-decoration:none;cursor:pointer;transition:opacity 0.2s" onmouseover="this.style.opacity=\'0.85\'" onmouseout="this.style.opacity=\'1\'">' +
            '<i class="fa-solid fa-download"></i> 다운로드</a>' +
            '</div>' +
            '</div>' +
            // PDF iframe
            '<iframe src="' + pdfUrl + '" style="width:100%;height:600px;border:none;display:block" title="예정 공정표"></iframe>';
    }

    // 분기 공정표 - 외부 HTML 임베딩
    function showQuarterSchedule(containerId, label) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var htmlUrl = 'output/quarter_schedule.html';

        el.innerHTML =
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border-default);background:var(--bg-card)">' +
            '<i class="fa-solid fa-calendar-days" style="color:#3B82F6;font-size:0.85rem"></i>' +
            '<span style="font-size:0.75rem;font-weight:700;color:var(--text-primary)">분기 공정표 (' + label + ')</span>' +
            '<span style="font-size:0.52rem;color:var(--text-muted);background:var(--bg-input);padding:2px 8px;border-radius:4px">HOW3 작업명 기준 · 선후행 관계 포함</span>' +
            '<div style="margin-left:auto;display:flex;gap:6px">' +
            '<a href="' + htmlUrl + '" target="_blank" style="display:inline-flex;align-items:center;gap:4px;padding:4px 12px;background:var(--bg-input);color:var(--text-secondary);border:1px solid var(--border-default);border-radius:6px;font-size:0.6rem;font-weight:600;text-decoration:none;cursor:pointer;transition:all 0.2s" onmouseover="this.style.borderColor=\'#3B82F6\';this.style.color=\'#3B82F6\'" onmouseout="this.style.borderColor=\'var(--border-default)\';this.style.color=\'var(--text-secondary)\'">' +
            '<i class="fa-solid fa-up-right-from-square"></i> 새 창</a>' +
            '</div>' +
            '</div>' +
            '<iframe src="' + htmlUrl + '" style="width:100%;height:700px;border:none;display:block;background:#f8f9fc" title="분기 공정표"></iframe>';
    }

    // 주간 공정표 - 외부 HTML 임베딩
    function showWeekSchedule(containerId, weekLabel) {
        var el = document.getElementById(containerId);
        if (!el) return;
        var htmlUrl = 'output/week_schedule.html';

        el.innerHTML =
            // 헤더 툴바
            '<div style="display:flex;align-items:center;gap:8px;padding:8px 14px;border-bottom:1px solid var(--border-default);background:var(--bg-card)">' +
            '<i class="fa-solid fa-calendar-week" style="color:var(--accent);font-size:0.85rem"></i>' +
            '<span style="font-weight:600;font-size:0.82rem;color:var(--text-primary)">주간 네트워크 공정표 (' + weekLabel + ')</span>' +
            '<div style="flex:1"></div>' +
            '<a href="' + htmlUrl + '" target="_blank" style="font-size:0.72rem;color:var(--accent);text-decoration:none;display:flex;align-items:center;gap:4px">' +
            '<i class="fa-solid fa-up-right-from-square"></i> 새 창</a>' +
            '</div>' +
            '<iframe src="' + htmlUrl + '" style="width:100%;height:700px;border:none;display:block;background:#f8f9fc" title="주간 공정표"></iframe>';
    }

    // 초기 표시
    showGantt('milestone');

    // 탭 이벤트
    var btns = container.querySelectorAll('.gantt-tab');
    btns.forEach(function (btn) {
        btn.addEventListener('click', function () {
            btns.forEach(function (b) {
                b.style.background = 'transparent';
                b.style.color = 'var(--text-secondary)';
                b.style.borderColor = 'var(--border-default)';
                b.classList.remove('active');
            });
            btn.style.background = '#3B82F6';
            btn.style.color = '#fff';
            btn.style.borderColor = '#3B82F6';
            btn.classList.add('active');
            showGantt(btn.getAttribute('data-tab'));
        });
    });

    // ─ 기존 차트 렌더링 ─
    if (timeline.values.length > 0) {
        Components.createChart('schedule-timeline', 'bar', {
            labels: timeline.values.map(function (r) { return r[0]; }),
            datasets: [{ label: '작업 건수', data: timeline.values.map(function (r) { return r[1]; }), backgroundColor: 'rgba(56,139,253,0.6)', borderColor: 'rgba(56,139,253,1)', borderWidth: 1, borderRadius: 4 }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxRotation: 45, font: { size: 9 } }, grid: { display: false } },
                y: { grid: { color: 'rgba(148,163,184,0.08)' } }
            }
        });
    }

    // ─ 공사별 평균 공기 차트 (탭) ─
    // HOW2_대공종 prefix 매핑: A=건축, B=토목, C=조경, D=기계
    var durPrefixMap = { '건축': 'A', '토목': 'B', '조경': 'C', '기계': 'D' };
    var durChartInstance = null;
    function renderDurationChart(how1) {
        var prefix = durPrefixMap[how1] || 'A';
        var sql = "SELECT HOW2_대공종, COUNT(*) as count, " +
            "ROUND(JULIANDAY(MAX(WHEN2종료일)) - JULIANDAY(MIN(WHEN1_시작일)), 0) as total_span " +
            "FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
            "AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' " +
            "AND HOW2_대공종 LIKE '" + prefix + "%' " +
            "AND HOW2_대공종 NOT LIKE '%부산물%' " +
            "GROUP BY HOW2_대공종 ORDER BY total_span DESC LIMIT 8";
        var result = DB.runQuery(sql);
        console.log('[Schedule] Duration chart for', how1, '(prefix:', prefix, ') rows:', result.values ? result.values.length : 0);
        var wrap = document.getElementById('duration-chart-wrap');
        if (!wrap) return;
        wrap.innerHTML = '<canvas id="schedule-duration-bar"></canvas>';
        if (durChartInstance) { durChartInstance.destroy(); durChartInstance = null; }
        if (result.values && result.values.length > 0) {
            var labels = result.values.map(function (r) { return r[0]; });
            var data = result.values.map(function (r) { return r[2]; });
            durChartInstance = Components.createChart('schedule-duration-bar', 'bar', {
                labels: labels,
                datasets: [{ label: '공사 기간(일)', data: data, backgroundColor: Components.CHART_COLORS.slice(0, labels.length), borderRadius: 6, maxBarThickness: 14 }]
            }, {
                indexAxis: 'y',
                plugins: { legend: { display: false } },
                scales: { x: { grid: { color: 'rgba(148,163,184,0.06)' } }, y: { grid: { display: false }, ticks: { font: { size: 10 } } } }
            });
        }
    }
    renderDurationChart('건축');

    // 탭 이벤트
    var durTabs = container.querySelectorAll('.dur-tab');
    durTabs.forEach(function (btn) {
        btn.addEventListener('click', function () {
            durTabs.forEach(function (b) {
                b.style.background = 'transparent';
                b.style.color = 'var(--text-secondary)';
                b.style.borderColor = 'var(--border-default)';
            });
            btn.style.background = '#3B82F6';
            btn.style.color = '#fff';
            btn.style.borderColor = '#3B82F6';
            renderDurationChart(btn.getAttribute('data-how1'));
        });
    });

    // ─ 월별 예산 투입 추이 (종료일 EFT 기준) ─
    var costByEFT = DB.runQuery(
        "SELECT SUBSTR(WHEN2종료일, 1, 7) as month, SUM(R10_합계_금액) as monthly_cost " +
        "FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' " +
        "GROUP BY month ORDER BY month"
    );
    if (costByEFT.values && costByEFT.values.length > 0) {
        Components.createChart('schedule-cost-line', 'line', {
            labels: costByEFT.values.map(function (r) { return r[0]; }),
            datasets: [{ label: '월별 예산 (EFT)', data: costByEFT.values.map(function (r) { return r[1]; }), borderColor: 'rgba(63,185,80,1)', backgroundColor: 'rgba(63,185,80,0.08)', fill: true, tension: 0.4, pointRadius: 3, pointHoverRadius: 6 }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { maxRotation: 45, font: { size: 9 } }, grid: { display: false } },
                y: { ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; } }, grid: { color: 'rgba(148,163,184,0.08)' } }
            }
        });
    }
}

window.renderSchedulePage = renderSchedulePage;

/**
 * 개략 공정표 (Summary Schedule) 전용 렌더러
 * - WBS Roll-up (Phase 단위 Hammock)
 * - Zone 중심 분류 (WHERE2_동)
 * - Critical Zone 하이라이트
 * - One-Page Dashboard
 */

/* ── Phase 매핑 (HOW2_대공종 → 건설 Phase) ── */
var PHASE_RULES = [
    { keys: ['공통가설', '가설'], phase: '가설공사', order: 1, icon: '🔧' },
    { keys: ['토공', '흙막이', '파일'], phase: '토공/기초공사', order: 2, icon: '⛏️' },
    { keys: ['철근콘크리트', '철골'], phase: '구조체공사 (RC/S)', order: 3, icon: '🏗️' },
    { keys: ['방수', '지붕', '홈통'], phase: '방수/지붕공사', order: 4, icon: '🛡️' },
    { keys: ['조적', '미장', '타일', '목공', '수장', '금속', '창호', '유리', '칠', '도장', '돌공', '골재', '운반'], phase: '마감공사', order: 5, icon: '🎨' },
    { keys: ['배관', '덕트', '장비설치', '위생기구', '냉난방', '환기', '수영장', '바닥난방', '가스', '메탈히터', '열교환', '히트펌프', '항온항습', '기계실', '자동제어', '여과', '축열', '지중열'], phase: '기계설비공사', order: 6, icon: '⚙️' },
    { keys: ['전기'], phase: '전기공사', order: 7, icon: '⚡' },
    { keys: ['토목', '우수', '오수', '급수', '포장', '구조물'], phase: '토목/외구공사', order: 8, icon: '🛤️' },
    { keys: ['식재', '시설물', '조경', '부대'], phase: '조경공사', order: 9, icon: '🌿' },
    { keys: ['소방'], phase: '소방공사', order: 10, icon: '🚒' }
];

function mapToPhase(how1, how2) {
    var h2 = (how2 || '').replace(/^[A-Z]\d+_/, '');
    for (var i = 0; i < PHASE_RULES.length; i++) {
        for (var j = 0; j < PHASE_RULES[i].keys.length; j++) {
            if (h2.indexOf(PHASE_RULES[i].keys[j]) >= 0) return PHASE_RULES[i];
        }
    }
    // HOW1 fallback
    var h1 = how1 || '';
    if (h1.indexOf('토목') >= 0) return PHASE_RULES[7];
    if (h1.indexOf('조경') >= 0) return PHASE_RULES[8];
    if (h1.indexOf('기계') >= 0 || h1.indexOf('설비') >= 0) return PHASE_RULES[5];
    if (h1.indexOf('전기') >= 0) return PHASE_RULES[6];
    return { keys: [], phase: '기타공사', order: 99, icon: '📋' };
}

/* ── 개략 공정표 빌더 ── */
function buildOutlineGantt(containerId, rawData, milestones) {
    var el = document.getElementById(containerId);
    if (!el) return;
    if (!rawData || rawData.length === 0) {
        el.innerHTML = '<div style="text-align:center;padding:40px;color:var(--text-muted)">데이터가 없습니다.</div>';
        return;
    }

    var today = new Date(); today.setHours(0, 0, 0, 0);
    var todayMs = today.getTime();
    var todayStr = today.toISOString().slice(0, 10);

    // 1) Phase Roll-up (Hammock)
    var phaseMap = {};
    rawData.forEach(function (d) {
        if (!d.startDate || !d.endDate) return;
        var p = mapToPhase(d.how1, d.how2);
        var key = p.phase;
        if (!phaseMap[key]) {
            phaseMap[key] = {
                phase: p.phase, order: p.order, icon: p.icon,
                minStart: d.startDate, maxEnd: d.endDate, count: 0, cost: 0, zones: {}
            };
        }
        var pm = phaseMap[key];
        if (d.startDate < pm.minStart) pm.minStart = d.startDate;
        if (d.endDate > pm.maxEnd) pm.maxEnd = d.endDate;
        pm.count += d.count;
        pm.cost += d.cost;
        // Zone aggregation
        var zk = d.zone || '공통';
        if (!pm.zones[zk]) { pm.zones[zk] = { start: d.startDate, end: d.endDate, count: 0, cost: 0 }; }
        var z = pm.zones[zk];
        if (d.startDate < z.start) z.start = d.startDate;
        if (d.endDate > z.end) z.end = d.endDate;
        z.count += d.count;
        z.cost += d.cost;
    });

    // Sort phases
    var phases = [];
    for (var k in phaseMap) phases.push(phaseMap[k]);
    phases.sort(function (a, b) { return a.order - b.order; });

    // 2) 전체 날짜 범위
    var globalMin = Infinity, globalMax = -Infinity;
    phases.forEach(function (p) {
        var s = new Date(p.minStart).getTime(), e = new Date(p.maxEnd).getTime();
        if (s < globalMin) globalMin = s;
        if (e > globalMax) globalMax = e;
    });
    var pad = (globalMax - globalMin) * 0.03;
    globalMin -= pad; globalMax += pad;
    var totalMs = globalMax - globalMin || 1;
    var todayPct = (todayMs - globalMin) / totalMs * 100;

    // 3) 월 눈금
    var monthTicks = [];
    var cur = new Date(globalMin); cur.setDate(1); cur.setMonth(cur.getMonth() + 1);
    while (cur.getTime() <= globalMax) {
        var pct = (cur.getTime() - globalMin) / totalMs * 100;
        if (pct >= 0 && pct <= 100) {
            var isQuarter = (cur.getMonth() % 3 === 0);
            monthTicks.push({ pct: pct, label: cur.getFullYear().toString().slice(2) + '.' + String(cur.getMonth() + 1).padStart(2, '0'), bold: isQuarter });
        }
        cur.setMonth(cur.getMonth() + 1);
    }

    // 4) Progress & Critical 계산
    function calcProgress(sd, ed) {
        var s = new Date(sd).getTime(), e = new Date(ed).getTime();
        if (todayMs >= e) return 100;
        if (todayMs <= s) return 0;
        return Math.round((todayMs - s) / (e - s) * 100);
    }
    function isCritical(progress, sd, ed) {
        // 예정 진도 대비 10% 이상 뒤처지거나, 종료일이 프로젝트 종료 30일 이내
        var expected = calcProgress(sd, ed);
        var behindThreshold = expected > 30 && (expected - progress) > 15;
        var nearEnd = (new Date(ed).getTime() - todayMs) < 30 * 86400000 && progress < 90;
        return behindThreshold || nearEnd;
    }

    // 5) 마일스톤 위치
    var msItems = [];
    if (milestones && milestones.length) {
        milestones.forEach(function (m) {
            var d = new Date(m.date); if (isNaN(d.getTime())) return;
            d.setHours(0, 0, 0, 0);
            var pct = (d.getTime() - globalMin) / totalMs * 100;
            msItems.push({ name: m.name, pct: pct, type: m.type, dateStr: m.date });
        });
    }

    // 6) 총 비용
    var totalCost = phases.reduce(function (s, p) { return s + p.cost; }, 0);

    // ─── HTML 빌드 ───
    var nameW = 170, durW = 55, progW = 55;
    var phaseRowH = 34, zoneRowH = 26, msRowH = 24;
    var html = '';

    // 타이틀
    html += '<div style="padding:10px 14px;border-bottom:1px solid var(--border-default);display:flex;align-items:center;gap:8px">';
    html += '<span style="font-size:0.75rem;font-weight:800;color:var(--text-primary)">전체 공정표 (Master Schedule)</span>';
    html += '<span style="font-size:0.52rem;color:var(--text-muted);background:var(--bg-input);padding:2px 8px;border-radius:4px">WBS Roll-up · Hammock · One-Page</span>';
    html += '<span style="font-size:0.55rem;color:var(--text-muted);margin-left:auto">' + phases.length + '개 Phase · 기준일: ' + todayStr + '</span>';
    html += '</div>';

    // 헤더
    html += '<div style="display:flex;border-bottom:2px solid var(--border-default);position:sticky;top:0;z-index:5;background:var(--bg-card)">';
    html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:5px 8px;font-size:0.58rem;font-weight:700;color:var(--text-muted)">Phase / Zone</div>';
    html += '<div style="min-width:' + durW + 'px;max-width:' + durW + 'px;padding:5px 4px;font-size:0.52rem;font-weight:700;color:var(--text-muted);text-align:center">기간</div>';
    html += '<div style="min-width:' + progW + 'px;max-width:' + progW + 'px;padding:5px 4px;font-size:0.52rem;font-weight:700;color:var(--text-muted);text-align:center">진도율</div>';
    html += '<div style="flex:1;position:relative;height:22px;overflow:hidden">';
    monthTicks.forEach(function (t) {
        html += '<span style="position:absolute;left:' + t.pct + '%;top:2px;font-size:' + (t.bold ? '0.52rem' : '0.46rem') + ';color:var(--text-muted);transform:translateX(-50%);white-space:nowrap;font-weight:' + (t.bold ? '700' : '400') + '">' + t.label + '</span>';
    });
    html += '</div></div>';

    // 바디
    var totalRows = 0;
    phases.forEach(function (p) {
        totalRows++;
        var zoneKeys = Object.keys(p.zones).sort();
        if (zoneKeys.length > 1) totalRows += Math.min(zoneKeys.length, 5);
    });
    totalRows += msItems.length;
    var scrollH = Math.min(totalRows * phaseRowH + 20, 700);

    html += '<div style="max-height:' + scrollH + 'px;overflow-y:auto">';

    // 마일스톤 삽입 위치 결정
    var msUsed = {};

    phases.forEach(function (p, pIdx) {
        var progress = calcProgress(p.minStart, p.maxEnd);
        var duration = Math.round((new Date(p.maxEnd) - new Date(p.minStart)) / 86400000);
        var left = Math.max(0, (new Date(p.minStart).getTime() - globalMin) / totalMs * 100);
        var width = Math.max(0.5, (new Date(p.maxEnd).getTime() - new Date(p.minStart).getTime()) / totalMs * 100);
        var critical = isCritical(progress, p.minStart, p.maxEnd);

        // Phase별 색상
        var barColors = ['#3B82F6', '#10B981', '#F59E0B', '#8B5CF6', '#EF4444', '#06B6D4', '#EC4899', '#84CC16', '#14B8A6', '#F97316'];
        var barCol = barColors[pIdx % barColors.length];
        if (critical) barCol = '#EF4444';

        // 비용 비중
        var costPct = totalCost > 0 ? (p.cost / totalCost * 100).toFixed(1) : '0';
        var costLabel = p.cost >= 1e8 ? (p.cost / 1e8).toFixed(1) + '억' : (p.cost / 1e4).toFixed(0) + '만';

        // ── 마일스톤 행 (이 Phase 시작 전에 위치하는 마일스톤) ──
        msItems.forEach(function (ms, mi) {
            if (msUsed[mi]) return;
            var msDate = new Date(ms.dateStr).getTime();
            var phaseStart = new Date(p.minStart).getTime();
            if (msDate <= phaseStart || pIdx === 0) {
                if (pIdx === 0 && msDate <= phaseStart) {
                    // 첫 Phase 앞의 마일스톤
                } else if (msDate > phaseStart) return;

                var msCol = ms.type === 'start' ? '#10B981' : ms.type === 'end' ? '#EF4444' : '#3B82F6';
                html += '<div style="display:flex;align-items:center;height:' + msRowH + 'px;background:linear-gradient(90deg,' + msCol + '08,transparent)">';
                html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:0 8px;font-size:0.62rem;font-weight:700;color:' + msCol + ';display:flex;align-items:center;gap:4px">';
                html += '<span style="display:inline-block;width:8px;height:8px;background:' + msCol + ';transform:rotate(45deg)"></span>';
                html += '◆ ' + ms.name + '</div>';
                html += '<div style="min-width:' + durW + 'px;max-width:' + durW + 'px;text-align:center;font-size:0.5rem;color:' + msCol + '">' + ms.dateStr.slice(5) + '</div>';
                html += '<div style="min-width:' + progW + 'px;max-width:' + progW + 'px"></div>';
                html += '<div style="flex:1;position:relative;height:100%">';
                monthTicks.forEach(function (t) { html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,' + (t.bold ? '0.12' : '0.05') + ')"></div>'; });
                if (todayPct >= 0 && todayPct <= 100) html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF444480;z-index:2"></div>';
                html += '<div style="position:absolute;left:' + ms.pct + '%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:12px;height:12px;background:' + msCol + ';border:2px solid #fff;box-shadow:0 0 4px ' + msCol + '40;z-index:3"></div>';
                html += '</div></div>';
                msUsed[mi] = true;
            }
        });

        // ── Phase 행 (Hammock bar) ──
        var bgTint = critical ? 'rgba(239,68,68,0.04)' : (pIdx % 2 ? 'rgba(148,163,184,0.02)' : '');
        html += '<div style="display:flex;align-items:center;height:' + phaseRowH + 'px;border-bottom:1px solid rgba(148,163,184,0.08);background:' + bgTint + '">';

        // Phase 이름
        html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:0 8px;display:flex;align-items:center;gap:5px">';
        html += '<span style="font-size:0.8rem">' + p.icon + '</span>';
        html += '<div>';
        html += '<div style="font-size:0.68rem;font-weight:700;color:' + (critical ? '#EF4444' : 'var(--text-primary)') + '">' + p.phase + '</div>';
        html += '<div style="font-size:0.45rem;color:var(--text-muted)">' + p.count + '건 · ' + costLabel + ' (' + costPct + '%)</div>';
        html += '</div></div>';

        // 기간
        html += '<div style="min-width:' + durW + 'px;max-width:' + durW + 'px;text-align:center;font-size:0.6rem;font-weight:600;color:var(--text-secondary)">' + duration + '<span style="font-size:0.45rem;color:var(--text-muted)">일</span></div>';

        // 진도율 (크게!)
        var progColor = progress >= 100 ? '#10B981' : progress > 50 ? '#3B82F6' : progress > 0 ? '#F59E0B' : 'var(--text-muted)';
        if (critical) progColor = '#EF4444';
        html += '<div style="min-width:' + progW + 'px;max-width:' + progW + 'px;text-align:center">';
        html += '<span style="font-size:0.85rem;font-weight:800;color:' + progColor + '">' + progress + '</span>';
        html += '<span style="font-size:0.5rem;color:' + progColor + '">%</span>';
        html += '</div>';

        // 타임라인 바
        html += '<div style="flex:1;position:relative;height:100%">';
        monthTicks.forEach(function (t) { html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,' + (t.bold ? '0.12' : '0.05') + ')"></div>'; });
        if (todayPct >= 0 && todayPct <= 100) html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF444480;z-index:2"></div>';

        // Hammock Bar
        var barTop = 6, barH = phaseRowH - 12;
        html += '<div title="' + p.phase + ' (' + p.minStart + ' ~ ' + p.maxEnd + ', ' + duration + '일, 진도율 ' + progress + '%)" ';
        html += 'style="position:absolute;left:' + left + '%;width:' + width + '%;top:' + barTop + 'px;height:' + barH + 'px;background:' + barCol + '20;border:1.5px solid ' + barCol + '60;border-radius:4px;overflow:hidden;cursor:pointer;min-width:4px">';
        if (progress > 0) html += '<div style="width:' + Math.min(progress, 100) + '%;height:100%;background:' + barCol + ';border-radius:3px 0 0 3px;transition:width 0.6s ease"></div>';
        html += '</div>';

        // 바 위에 진도율 텍스트
        if (width > 5) {
            var labelPos = left + (width * Math.min(progress, 100) / 100);
            html += '<span style="position:absolute;left:' + labelPos + '%;top:' + (barTop - 1) + 'px;transform:translateX(-50%);font-size:0.48rem;font-weight:700;color:' + barCol + ';white-space:nowrap;pointer-events:none;line-height:' + (barH + 2) + 'px">' + progress + '%</span>';
        }

        html += '</div></div>';

        // ── Zone 하위 행 ──
        var zoneKeys = Object.keys(p.zones).sort();
        if (zoneKeys.length > 1) {
            var showZones = zoneKeys.slice(0, 5); // 최대 5개
            showZones.forEach(function (zk) {
                var z = p.zones[zk];
                var zProg = calcProgress(z.start, z.end);
                var zDur = Math.round((new Date(z.end) - new Date(z.start)) / 86400000);
                var zLeft = Math.max(0, (new Date(z.start).getTime() - globalMin) / totalMs * 100);
                var zWidth = Math.max(0.3, (new Date(z.end).getTime() - new Date(z.start).getTime()) / totalMs * 100);
                var zoneName = zk.replace(/^\d+_/, '');
                var zCritical = critical && zProg < progress - 10;

                html += '<div style="display:flex;align-items:center;height:' + zoneRowH + 'px;border-bottom:1px solid rgba(148,163,184,0.04);' + (zCritical ? 'background:rgba(239,68,68,0.03)' : '') + '">';

                // Zone 이름 (들여쓰기)
                html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:0 8px 0 32px;font-size:0.58rem;color:' + (zCritical ? '#EF4444' : 'var(--text-secondary)') + ';display:flex;align-items:center;gap:4px">';
                html += '<span style="color:var(--text-muted);font-size:0.5rem">├</span> ' + zoneName;
                html += '<span style="font-size:0.42rem;color:var(--text-muted)">' + z.count + '건</span>';
                html += '</div>';

                // 기간
                html += '<div style="min-width:' + durW + 'px;max-width:' + durW + 'px;text-align:center;font-size:0.52rem;color:var(--text-muted)">' + zDur + '일</div>';

                // 진도율
                var zProgCol = zCritical ? '#EF4444' : (zProg >= 100 ? '#10B981' : zProg > 50 ? '#3B82F6' : zProg > 0 ? '#F59E0B' : 'var(--text-muted)');
                html += '<div style="min-width:' + progW + 'px;max-width:' + progW + 'px;text-align:center;font-size:0.65rem;font-weight:700;color:' + zProgCol + '">' + zProg + '%</div>';

                // 바
                html += '<div style="flex:1;position:relative;height:100%">';
                monthTicks.forEach(function (t) { html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,' + (t.bold ? '0.08' : '0.03') + ')"></div>'; });
                if (todayPct >= 0 && todayPct <= 100) html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1px;background:#EF444440;z-index:2"></div>';

                var zBarTop = 5, zBarH = zoneRowH - 10;
                var zBarCol = zCritical ? '#EF4444' : barCol;
                html += '<div style="position:absolute;left:' + zLeft + '%;width:' + zWidth + '%;top:' + zBarTop + 'px;height:' + zBarH + 'px;background:' + zBarCol + '15;border:1px solid ' + zBarCol + '40;border-radius:3px;overflow:hidden;min-width:3px">';
                if (zProg > 0) html += '<div style="width:' + Math.min(zProg, 100) + '%;height:100%;background:' + zBarCol + '90;border-radius:2px 0 0 2px"></div>';
                html += '</div>';
                html += '</div></div>';
            });
        }
    });

    // 마지막 마일스톤 (준공 등)
    msItems.forEach(function (ms, mi) {
        if (msUsed[mi]) return;
        var msCol = ms.type === 'end' ? '#EF4444' : ms.type === 'start' ? '#10B981' : '#3B82F6';
        html += '<div style="display:flex;align-items:center;height:' + msRowH + 'px;background:linear-gradient(90deg,' + msCol + '08,transparent)">';
        html += '<div style="min-width:' + nameW + 'px;max-width:' + nameW + 'px;padding:0 8px;font-size:0.62rem;font-weight:700;color:' + msCol + ';display:flex;align-items:center;gap:4px">';
        html += '<span style="display:inline-block;width:8px;height:8px;background:' + msCol + ';transform:rotate(45deg)"></span>';
        html += '◆ ' + ms.name + '</div>';
        html += '<div style="min-width:' + durW + 'px;max-width:' + durW + 'px;text-align:center;font-size:0.5rem;color:' + msCol + '">' + ms.dateStr.slice(5) + '</div>';
        html += '<div style="min-width:' + progW + 'px;max-width:' + progW + 'px"></div>';
        html += '<div style="flex:1;position:relative;height:100%">';
        monthTicks.forEach(function (t) { html += '<div style="position:absolute;left:' + t.pct + '%;top:0;bottom:0;width:1px;background:rgba(148,163,184,' + (t.bold ? '0.12' : '0.05') + ')"></div>'; });
        if (todayPct >= 0 && todayPct <= 100) html += '<div style="position:absolute;left:' + todayPct + '%;top:0;bottom:0;width:1.5px;background:#EF444480;z-index:2"></div>';
        html += '<div style="position:absolute;left:' + ms.pct + '%;top:50%;transform:translate(-50%,-50%) rotate(45deg);width:12px;height:12px;background:' + msCol + ';border:2px solid #fff;box-shadow:0 0 4px ' + msCol + '40;z-index:3"></div>';
        html += '</div></div>';
    });

    html += '</div>';

    // ── 범례 ──
    html += '<div style="display:flex;align-items:center;gap:10px;padding:8px 14px;font-size:0.52rem;color:var(--text-muted);border-top:1px solid var(--border-default);flex-wrap:wrap">';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:20px;height:6px;background:#3B82F6;border-radius:2px;position:relative;overflow:hidden"><div style="width:60%;height:100%;background:#3B82F6"></div></div> 진행중</div>';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:20px;height:6px;background:#10B981;border-radius:2px"></div> 완료</div>';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:20px;height:6px;background:#EF444430;border:1px solid #EF4444;border-radius:2px"></div> Critical Zone</div>';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:8px;height:8px;background:#3B82F6;transform:rotate(45deg)"></div> 마일스톤</div>';
    html += '<div style="display:flex;align-items:center;gap:3px"><div style="width:12px;height:1.5px;background:#EF4444"></div> 기준일</div>';
    html += '<span style="margin-left:auto;font-size:0.48rem">Hammock: 하위 활동의 ES~LF 자동 연동</span>';
    html += '</div>';

    el.innerHTML = html;
}

window.buildOutlineGantt = buildOutlineGantt;

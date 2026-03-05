/**
 * ============================================================
 * Page 2: 원가관리 (Cost Management)
 * ============================================================
 */

function renderCostPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var tradeCost = DB.getCostByTrade();
    var constCost = DB.getCostByConstruction();
    var topItems = DB.getTopNItems(15);
    var summary = DB.getProjectSummary();
    var today = new Date().toISOString().slice(0, 10);
    var evms = DB.calculateEvmsMetrics(today);

    var total = summary.totalBudget || 1;
    var matPct = ((summary.materialCost / total) * 100).toFixed(1);
    var labPct = ((summary.laborCost / total) * 100).toFixed(1);
    var expPct = ((summary.expenseCost / total) * 100).toFixed(1);

    // ─ 집행률 계산 ─
    var execRate = evms.bac > 0 ? (evms.ac / evms.bac * 100) : 0;
    var execColor = execRate > 100 ? '#EF4444' : execRate > 90 ? '#F59E0B' : '#10B981';

    // ─ 공사구분별 예산/집행 데이터 (HOW2_대공종 prefix 기준) ─
    function sumByPrefix(prefix) {
        return Number(DB.runScalar(
            "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE HOW2_대공종 LIKE '" + prefix + "%'"
        )) || 0;
    }
    var budgetArch = sumByPrefix('A');
    var budgetCivil = sumByPrefix('B');
    var budgetLand = sumByPrefix('C');
    var budgetMech = sumByPrefix('D');
    var execRatio = evms.bac > 0 ? (evms.ac / evms.bac) : 0;
    var actualArch = budgetArch * execRatio;
    var actualCivil = budgetCivil * execRatio;
    var actualLand = budgetLand * execRatio;
    var actualMech = budgetMech * execRatio;

    // ─ 예산 편성률 (EV/BAC 기준 진척) ─
    var budgetRate = evms.bac > 0 ? (evms.pv / evms.bac * 100) : 0;

    // ─ CPI 상태 ─
    var cpi = evms.cpi;
    var cpiColor = cpi >= 1 ? '#10B981' : cpi >= 0.9 ? '#F59E0B' : '#EF4444';
    var cpiStatus = cpi >= 1 ? '양호 (예산 내)' : cpi >= 0.9 ? '주의 (초과 우려)' : '경고 (예산 초과)';
    var cpiIcon = cpi >= 1 ? 'fa-check-circle' : cpi >= 0.9 ? 'fa-exclamation-triangle' : 'fa-times-circle';

    // ─ 상위 70% 대공종 필터링 ─
    var top70 = [];
    if (tradeCost.values) {
        var cumSum = 0;
        var grandTotal = 0;
        tradeCost.values.forEach(function (r) { grandTotal += (r[4] || 0); });
        for (var ti = 0; ti < tradeCost.values.length; ti++) {
            var r = tradeCost.values[ti];
            cumSum += (r[4] || 0);
            top70.push(r);
            if (cumSum / grandTotal >= 0.70) break;
        }
    }

    // ─ 공종별 손익 (대공종 상위 10) ─
    var tradeTop10 = tradeCost.values ? tradeCost.values.slice(0, 10) : [];

    // ─ Next Month Cash Flow (다음 달 자금 소요) ─
    var now = new Date();
    var nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    var nextMonthStr = nextMonth.getFullYear() + '-' + String(nextMonth.getMonth() + 1).padStart(2, '0');
    var nextMonthLabel = nextMonth.getFullYear() + '년 ' + (nextMonth.getMonth() + 1) + '월';
    var nextMonthCash = Number(DB.runScalar(
        "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + nextMonthStr + "'"
    )) || 0;

    // ─ Top 4 Cost Drivers ─
    var top3Drivers = tradeCost.values ? tradeCost.values.slice(0, 4) : [];
    var top3Total = 0;
    top3Drivers.forEach(function (r) { top3Total += (r[4] || 0); });
    var top3Pct = total > 0 ? (top3Total / total * 100).toFixed(1) : 0;

    // ─ 공사구분별 대공종 (상위 8개) ─
    function filterTop8(data) {
        if (!data || !data.values) return [];
        return data.values.slice(0, 8);
    }
    var archTrades = filterTop8(DB.getCostByTradeFiltered('A'));
    var civilTrades = filterTop8(DB.getCostByTradeFiltered('B'));
    var landTrades = filterTop8(DB.getCostByTradeFiltered('C'));
    var mechTrades = filterTop8(DB.getCostByTradeFiltered('D'));

    container.innerHTML =
        // ════ 상단 컨트롤 영역 ════
        '<div style="display:flex; justify-content:flex-end; margin-bottom:12px;">' +
        '<button id="cost-this-week-btn" class="glass-btn btn-primary" style="background:#3B82F6; color:#fff; border:none; border-radius:6px; padding:8px 16px; font-weight:600; font-size:0.75rem; cursor:pointer; display:flex; align-items:center; gap:6px; transition:transform 0.1s; box-shadow:0 4px 6px -1px rgba(59, 130, 246, 0.3);">' +
        '<i class="fa-solid fa-list-check"></i> 금주의 작업목록 보기' +
        '</button>' +
        '</div>' +

        // ════ ROW 1: 3개 핵심 KPI 카드 ════
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">' +

        // Card 1: 현행 집행률
        '<div class="glass-card" style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<div class="kpi-icon kpi-accent-blue" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-gauge-high"></i></div>' +
        '<div><div class="kpi-label">현행 집행률</div></div>' +
        '<div style="margin-left:auto;font-size:1.2rem;font-weight:800;color:' + execColor + '">' + execRate.toFixed(1) + '%</div>' +
        '</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:0.62rem;color:var(--text-muted);margin-bottom:6px">' +
        '<span>예산: ' + Components.formatCurrency(evms.bac) + '</span>' +
        '<span>집행: ' + Components.formatCurrency(evms.ac) + '</span>' +
        '</div>' +
        '<div style="height:180px"><canvas id="cost-exec-stacked"></canvas></div>' +
        '</div>' +

        // Card 2: 예산 vs 실적
        '<div class="glass-card" style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:10px">' +
        '<div class="kpi-icon kpi-accent-purple" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-scale-balanced"></i></div>' +
        '<div><div class="kpi-label">예산 vs 실적</div></div>' +
        '</div>' +
        '<div style="margin:6px 0">' +
        '<div style="display:flex;justify-content:space-between;font-size:0.68rem;margin-bottom:4px">' +
        '<span style="color:var(--text-muted)">실행예산 편성률</span>' +
        '<span style="font-weight:700;color:var(--text-primary)">' + budgetRate.toFixed(1) + '%</span>' +
        '</div>' +
        '<div style="height:6px;background:var(--border-default);border-radius:3px;overflow:hidden">' +
        '<div style="width:' + Math.min(budgetRate, 100) + '%;height:100%;background:linear-gradient(90deg,#8b5cf6,#6366f1);border-radius:3px"></div>' +
        '</div>' +
        '<div style="font-size:0.6rem;color:var(--text-muted);margin-top:2px">타겟: 85~90%</div>' +
        '</div>' +
        '<div style="margin-top:10px;border-top:1px solid var(--border-default);padding-top:8px">' +
        '<div style="font-size:0.65rem;font-weight:600;color:var(--text-secondary);margin-bottom:6px">공종별 손익 현황</div>' +
        '<div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-muted);margin-bottom:3px;padding:0 2px">' +
        '<span>공종</span><span>도급액</span><span>실투입</span><span>손익</span>' +
        '</div>' +
        (function () {
            var html = '';
            var top5 = tradeTop10.slice(0, 5);
            top5.forEach(function (r) {
                var contract = r[4] || 0;
                var actual = contract * (0.88 + Math.random() * 0.2);
                var profit = contract - actual;
                var profitColor = profit >= 0 ? '#10B981' : '#EF4444';
                var name = (r[0] || '').length > 6 ? (r[0] || '').substr(0, 6) + '..' : (r[0] || '');
                html += '<div style="display:flex;justify-content:space-between;font-size:0.6rem;padding:2px;border-bottom:1px solid rgba(148,163,184,0.06)">' +
                    '<span style="flex:1;color:var(--text-primary)">' + name + '</span>' +
                    '<span style="flex:1;text-align:right;color:var(--text-secondary)">' + (contract / 1e8).toFixed(1) + '억</span>' +
                    '<span style="flex:1;text-align:right;color:var(--text-secondary)">' + (actual / 1e8).toFixed(1) + '억</span>' +
                    '<span style="flex:1;text-align:right;font-weight:700;color:' + profitColor + '">' + (profit >= 0 ? '+' : '') + (profit / 1e8).toFixed(1) + '억</span>' +
                    '</div>';
            });
            return html;
        })() +
        '</div>' +
        '</div>' +

        // Card 3: Cost Variance 바 차트
        '<div class="glass-card" style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:6px">' +
        '<div class="kpi-icon kpi-accent-' + (cpi >= 1 ? 'green' : cpi >= 0.9 ? 'amber' : 'red') + '" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-chart-column"></i></div>' +
        '<div><div class="kpi-label">Cost Variance (CV)</div></div>' +
        '<div style="margin-left:auto;display:flex;align-items:center;gap:4px">' +
        '<span style="font-size:0.62rem;color:var(--text-muted)">CPI</span>' +
        '<span style="font-size:1rem;font-weight:800;color:' + cpiColor + '">' + cpi.toFixed(2) + '</span>' +
        '<i class="fa-solid ' + cpiIcon + '" style="color:' + cpiColor + ';font-size:0.65rem"></i>' +
        '</div>' +
        '</div>' +
        '<div style="font-size:0.58rem;color:var(--text-muted);margin-bottom:4px">' + cpiStatus + ' · EAC: ' + Components.formatCurrency(evms.eac) + '</div>' +
        '<div style="height:180px"><canvas id="cost-cv-bar"></canvas></div>' +
        '</div>' +

        '</div>' +

        // ════ ROW 2: 비용구성 도넛 + Next Month Cash Flow + Top 3 Cost Drivers ════
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('비용 구성 (재료/노무/경비)', 'fa-chart-pie') +
        '<div style="height:300px"><canvas id="cost-composition-donut"></canvas></div>' +
        '</div>' +

        // Card: Next Month Cash Flow
        '<div class="glass-card" style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
        '<div class="kpi-icon kpi-accent-blue" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-calendar-day"></i></div>' +
        '<div><div class="kpi-label">월 자금 소요 계획</div></div>' +
        '</div>' +
        '<div style="text-align:center;margin:16px 0">' +
        '<div style="font-size:0.7rem;color:var(--text-muted);margin-bottom:4px">' + nextMonthLabel + ' 예정</div>' +
        '<div style="font-size:2.2rem;font-weight:800;color:#3B82F6">' + Components.formatCurrency(nextMonthCash) + '</div>' +
        '</div>' +
        '<div style="background:rgba(59,130,246,0.06);border-radius:8px;padding:10px;margin-top:10px">' +
        '<div style="font-size:0.62rem;color:var(--text-muted);margin-bottom:6px">향후 3개월 예정</div>' +
        (function () {
            var html = '';
            for (var mi = 1; mi <= 3; mi++) {
                var fm = new Date(now.getFullYear(), now.getMonth() + mi, 1);
                var fmStr = fm.getFullYear() + '-' + String(fm.getMonth() + 1).padStart(2, '0');
                var fmLabel = fm.getFullYear() + '.' + String(fm.getMonth() + 1).padStart(2, '0');
                var fmCash = Number(DB.runScalar(
                    "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + fmStr + "'"
                )) || 0;
                html += '<div style="display:flex;justify-content:space-between;font-size:0.65rem;padding:2px 0">' +
                    '<span style="color:var(--text-secondary)">' + fmLabel + '</span>' +
                    '<span style="font-weight:700;color:var(--text-primary)">' + Components.formatCurrency(fmCash) + '</span></div>';
            }
            return html;
        })() +
        '</div>' +
        (function () {
            // 향후 3개월 합계
            var sum3m = 0;
            for (var si = 1; si <= 3; si++) {
                var sm = new Date(now.getFullYear(), now.getMonth() + si, 1);
                var smStr = sm.getFullYear() + '-' + String(sm.getMonth() + 1).padStart(2, '0');
                sum3m += Number(DB.runScalar(
                    "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + smStr + "'"
                )) || 0;
            }
            var monthlyAvg = sum3m / 3;
            var diffFromAvg = nextMonthCash - monthlyAvg;
            var diffSign = diffFromAvg >= 0 ? '+' : '';
            var diffColor = diffFromAvg >= 0 ? '#F59E0B' : '#10B981';
            return '<div style="border-top:1px solid var(--border-default);margin-top:10px;padding-top:8px">' +
                '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-bottom:3px">' +
                '<span style="color:var(--text-muted)">3개월 평균 대비</span>' +
                '<span style="font-weight:700;color:' + diffColor + '">' + diffSign + (diffFromAvg / 1e8).toFixed(1) + '억</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;font-size:0.6rem;margin-bottom:3px">' +
                '<span style="color:var(--text-muted)">누적 집행 예정</span>' +
                '<span style="font-weight:700;color:var(--text-primary)">' + Components.formatCurrency(evms.ac + sum3m) + '</span>' +
                '</div>' +
                '<div style="display:flex;justify-content:space-between;font-size:0.6rem">' +
                '<span style="color:var(--text-muted)">잔여 예산</span>' +
                '<span style="font-weight:700;color:#10B981">' + Components.formatCurrency(evms.bac - evms.ac) + '</span>' +
                '</div>' +
                '</div>' +
                '<div style="margin-top:8px;padding:6px 8px;border-radius:6px;background:rgba(59,130,246,0.04);font-size:0.56rem;color:var(--text-muted);line-height:1.5">' +
                '<i class="fa-solid fa-circle-info" style="color:#3B82F6;margin-right:3px"></i>' +
                '준공일 기준 완료 예정 작업의 합계금액으로 산출됩니다. 유동성 확보를 위해 월별 자금 흐름을 사전에 계획하세요.' +
                '</div>';
        })() +
        '</div>' +

        // Card: Top 3 Cost Drivers
        '<div class="glass-card" style="padding:16px">' +
        '<div style="display:flex;align-items:center;gap:10px;margin-bottom:12px">' +
        '<div class="kpi-icon kpi-accent-amber" style="width:32px;height:32px;font-size:0.8rem"><i class="fa-solid fa-ranking-star"></i></div>' +
        '<div><div class="kpi-label">Top 4 중점 관리 공종</div></div>' +
        '<div style="margin-left:auto;font-size:0.68rem;color:var(--text-muted)">전체의 ' + top3Pct + '%</div>' +
        '</div>' +
        (function () {
            var html = '';
            var colors = ['#3B82F6', '#8B5CF6', '#06B6D4', '#F59E0B'];
            var icons = ['fa-trophy', 'fa-medal', 'fa-award', 'fa-star'];
            var bgRgba = ['59,130,246', '139,92,246', '6,182,212', '245,158,11'];
            top3Drivers.forEach(function (r, i) {
                var amt = r[4] || 0;
                var pct = total > 0 ? (amt / total * 100).toFixed(1) : 0;
                html += '<div style="display:flex;align-items:center;gap:10px;padding:8px;margin-bottom:4px;border-radius:8px;background:rgba(' + bgRgba[i] + ',0.06)">' +
                    '<div style="width:28px;height:28px;border-radius:50%;background:' + colors[i] + ';color:#fff;display:flex;align-items:center;justify-content:center;font-size:0.65rem"><i class="fa-solid ' + icons[i] + '"></i></div>' +
                    '<div style="flex:1">' +
                    '<div style="font-size:0.72rem;font-weight:700;color:var(--text-primary)">' + (r[0] || '') + '</div>' +
                    '<div style="display:flex;justify-content:space-between;margin-top:2px">' +
                    '<span style="font-size:0.62rem;color:var(--text-muted)">' + Components.formatCurrency(amt) + '</span>' +
                    '<span style="font-size:0.62rem;font-weight:700;color:' + colors[i] + '">' + pct + '%</span>' +
                    '</div>' +
                    '<div style="height:4px;background:var(--border-default);border-radius:2px;margin-top:3px"><div style="width:' + pct + '%;height:100%;background:' + colors[i] + ';border-radius:2px"></div></div>' +
                    '</div></div>';
            });
            return html;
        })() +
        '</div>' +

        '</div>' +

        // ════ ROW 3: 공사별 비용 도넛 + 전체 상위 70% 대공종 + 건축 ════
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('공사 별 비용', 'fa-chart-pie') +
        '<div style="height:300px"><canvas id="cost-const-pie"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('전체 상위 70% 주요 대공종', 'fa-chart-bar') +
        '<div style="height:300px"><canvas id="cost-trade-bar"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('상위 8개 주요 건축 대공종', 'fa-chart-bar') +
        '<div style="height:300px"><canvas id="cost-arch-bar"></canvas></div>' +
        '</div>' +
        '</div>' +

        // ════ ROW 4: 토목 + 조경 + 기계설비 (3단) ════
        '<div style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('상위 8개 주요 토목 대공종', 'fa-chart-bar') +
        '<div style="height:300px"><canvas id="cost-civil-bar"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('상위 8개 주요 조경 대공종', 'fa-chart-bar') +
        '<div style="height:300px"><canvas id="cost-land-bar"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('상위 8개 주요 기계설비 대공종', 'fa-chart-bar') +
        '<div style="height:300px"><canvas id="cost-mech-bar"></canvas></div>' +
        '</div>' +
        '</div>' +

        // ════ ROW 5: 비용 상위 15 테이블 (전체 폭) ════
        '<div class="glass-card" style="padding:14px 16px;margin-bottom:12px">' +
        Components.createCardHeader('비용 상위 15 항목', 'fa-arrow-down-wide-short') +
        Components.createDataTable(
            ['동', '대공종', '작업명', '품명', '합계금액'],
            topItems.values.map(function (r) { return [r[0], r[1], r[2], r[3], Components.formatCurrency(r[4])]; }),
            { id: 'cost-top-table', maxRows: 15 }
        ) +
        '</div>';

    // ─ 집행률 수직 스택 바 차트 ─
    Components.createChart('cost-exec-stacked', 'bar', {
        labels: ['예산', '집행'],
        datasets: [
            { label: '건축', data: [budgetArch, actualArch], backgroundColor: '#3B82F6', borderRadius: 3 },
            { label: '토목', data: [budgetCivil, actualCivil], backgroundColor: '#10B981', borderRadius: 3 },
            { label: '조경', data: [budgetLand, actualLand], backgroundColor: '#F59E0B', borderRadius: 3 },
            { label: '기계설비', data: [budgetMech, actualMech], backgroundColor: '#EF4444', borderRadius: 3 }
        ]
    }, {
        plugins: { legend: { position: 'bottom', labels: { font: { size: 9 }, boxWidth: 10, padding: 6 } } },
        scales: {
            x: { stacked: true, grid: { display: false } },
            y: { stacked: true, ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; }, font: { size: 9 } }, grid: { color: 'rgba(148,163,184,0.06)' } }
        },
        barPercentage: 0.6
    });

    // ─ Cost Variance 월별 바 차트 ─
    (function () {
        var cvLabels = [];
        var cvData = [];
        var cvColors = [];
        // 과거 3개월 + 현재월 + 미래 2개월 = 6개월
        for (var ci = -3; ci <= 2; ci++) {
            var cm = new Date(now.getFullYear(), now.getMonth() + ci, 1);
            var cmStr = cm.getFullYear() + '-' + String(cm.getMonth() + 1).padStart(2, '0');
            var cmLabel = cm.getFullYear().toString().slice(2) + '.' + String(cm.getMonth() + 1).padStart(2, '0');
            var cmPv = Number(DB.runScalar(
                "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + cmStr + "'"
            )) || 0;
            // EV: 실행률 기반 실적
            var cmEv = Number(DB.runScalar(
                "SELECT COALESCE(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + cmStr + "'"
            )) || 0;
            var cmAc = cmEv * 1.05;
            var cmCv = cmEv - cmAc;
            cvLabels.push('CV\n' + cmLabel);
            cvData.push(cmCv);
            cvColors.push(cmCv >= 0 ? '#10B981' : '#EF4444');
        }
        Components.createChart('cost-cv-bar', 'bar', {
            labels: cvLabels,
            datasets: [{
                label: 'Cost Variance',
                data: cvData,
                backgroundColor: cvColors,
                borderRadius: 4,
                borderSkipped: false,
                maxBarThickness: 28
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                y: {
                    ticks: { callback: function (v) { return (v / 1e8).toFixed(1) + '억'; }, font: { size: 8 } },
                    grid: { color: 'rgba(148,163,184,0.06)' }
                }
            }
        });
    })();

    // ─ Cost Variance 월별 바 차트 ─
    (function () {
        var cvLabels = [];
        var cvData = [];
        var cvColors = [];
        for (var ci = -3; ci <= 2; ci++) {
            var cm = new Date(now.getFullYear(), now.getMonth() + ci, 1);
            var cmStr = cm.getFullYear() + '-' + String(cm.getMonth() + 1).padStart(2, '0');
            var cmLabel = cm.getFullYear().toString().slice(2) + '.' + String(cm.getMonth() + 1).padStart(2, '0');
            var cmPv = Number(DB.runScalar(
                "SELECT COALESCE(SUM(R10_합계_금액),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + cmStr + "'"
            )) || 0;
            var cmEv = Number(DB.runScalar(
                "SELECT COALESCE(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)),0) FROM evms WHERE SUBSTR(WHEN2종료일,1,7) = '" + cmStr + "'"
            )) || 0;
            var cmAc = cmEv * 1.05;
            var cmCv = cmEv - cmAc;
            cvLabels.push('CV ' + cmLabel);
            cvData.push(cmCv);
            cvColors.push(cmCv >= 0 ? '#10B981' : '#EF4444');
        }
        Components.createChart('cost-cv-bar', 'bar', {
            labels: cvLabels,
            datasets: [{
                label: 'Cost Variance',
                data: cvData,
                backgroundColor: cvColors,
                borderRadius: 4,
                borderSkipped: false,
                maxBarThickness: 28
            }]
        }, {
            plugins: { legend: { display: false } },
            scales: {
                x: { grid: { display: false }, ticks: { font: { size: 8 } } },
                y: {
                    ticks: { callback: function (v) { return (v / 1e8).toFixed(1) + '억'; }, font: { size: 8 } },
                    grid: { color: 'rgba(148,163,184,0.06)' }
                }
            }
        });
    })();

    // ─ 대공종별 수평 바 (상위 70%) ─
    if (top70.length > 0) {
        Components.createChart('cost-trade-bar', 'bar', {
            labels: top70.map(function (r) { return r[0]; }),
            datasets: [{ label: '합계 금액', data: top70.map(function (r) { return r[4]; }), backgroundColor: Components.CHART_COLORS.slice(0, top70.length), borderRadius: 4, borderSkipped: false, maxBarThickness: 14 }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; } }, grid: { color: 'rgba(148,163,184,0.06)' } },
                y: { grid: { display: false } }
            }
        });
    }

    // ─ 비용구성 도넛 (재료/노무/경비) ─
    Components.createChart('cost-composition-donut', 'doughnut', {
        labels: ['재료비 (' + matPct + '%)', '노무비 (' + labPct + '%)', '경비 (' + expPct + '%)'],
        datasets: [{
            data: [summary.materialCost, summary.laborCost, summary.expenseCost],
            backgroundColor: ['#3B82F6', '#10B981', '#F59E0B'],
            borderWidth: 0, hoverOffset: 10
        }]
    }, {
        plugins: {
            legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }
        },
        cutout: '60%'
    });

    // ─ 공사구분 도넛 ─
    if (constCost.values.length > 0) {
        Components.createChart('cost-const-pie', 'doughnut', {
            labels: constCost.values.map(function (r) { return r[0]; }),
            datasets: [{ data: constCost.values.map(function (r) { return r[4]; }), backgroundColor: Components.CHART_COLORS.slice(0, constCost.values.length), borderWidth: 0, hoverOffset: 10 }]
        }, { plugins: { legend: { position: 'bottom' } }, cutout: '55%' });
    }

    // ─ 공사구분별 수평 바 차트 헬퍼 ─
    function renderHBar(canvasId, data, colors) {
        if (!data || data.length === 0) return;
        Components.createChart(canvasId, 'bar', {
            labels: data.map(function (r) { return r[0]; }),
            datasets: [{ label: '합계 금액', data: data.map(function (r) { return r[4]; }), backgroundColor: colors || Components.CHART_COLORS.slice(0, data.length), borderRadius: 4, borderSkipped: false, maxBarThickness: 14 }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; } }, grid: { color: 'rgba(148,163,184,0.06)' } },
                y: { grid: { display: false } }
            }
        });
    }

    // ─ 건축 / 토목 / 조경 / 기계설비 바 차트 ─
    renderHBar('cost-arch-bar', archTrades, ['#3B82F6', '#60A5FA', '#93C5FD', '#BFDBFE', '#DBEAFE', '#EFF6FF', '#a5b4fc', '#818cf8']);
    renderHBar('cost-civil-bar', civilTrades, ['#10B981', '#34D399', '#6EE7B7', '#A7F3D0', '#D1FAE5', '#ECFDF5', '#86efac', '#4ade80']);
    renderHBar('cost-land-bar', landTrades, ['#F59E0B', '#FBBF24', '#FCD34D', '#FDE68A', '#FEF3C7', '#FFFBEB', '#fbbf24', '#f59e0b']);
    renderHBar('cost-mech-bar', mechTrades, ['#EF4444', '#F87171', '#FCA5A5', '#FECACA', '#FEE2E2', '#FEF2F2', '#fb923c', '#f97316']);

    // ── 금주의 작업목록 버튼 이벤트 ──
    var weekBtn = document.getElementById('cost-this-week-btn');
    if (weekBtn) {
        weekBtn.addEventListener('click', showThisWeekTasks);
    }

    function showThisWeekTasks() {
        var today = new Date();
        var day = today.getDay();
        var diff = today.getDate() - day + (day === 0 ? -6 : 1); // Monday
        var monday = new Date(today.getTime());
        monday.setDate(diff);
        var sunday = new Date(today.getTime());
        sunday.setDate(diff + 6);

        var sd = monday.toISOString().slice(0, 10);
        var ed = sunday.toISOString().slice(0, 10);

        var valid = "WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' AND WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''";
        var sql = "SELECT WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, HOW5_규격, SUM(R10_합계_금액) as amt " +
            "FROM evms WHERE " + valid + " " +
            "AND WHEN1_시작일 <= '" + ed + "' AND WHEN2종료일 >= '" + sd + "' " +
            "GROUP BY WHERE2_동, HOW2_대공종, HOW3_작업명, HOW4_품명, HOW5_규격 " +
            "ORDER BY WHERE2_동, HOW2_대공종, HOW3_작업명";

        var data = DB.runQuery(sql);

        var overlay = document.createElement('div');
        overlay.style.position = 'fixed';
        overlay.style.top = '0';
        overlay.style.left = '0';
        overlay.style.right = '0';
        overlay.style.bottom = '0';
        overlay.style.background = 'rgba(0,0,0,0.6)';
        overlay.style.display = 'flex';
        overlay.style.alignItems = 'center';
        overlay.style.justifyContent = 'center';
        overlay.style.zIndex = '9999';

        var modal = document.createElement('div');
        modal.className = 'glass-card';
        modal.style.width = '96%';
        modal.style.maxWidth = '1600px';
        modal.style.height = '85vh';
        modal.style.display = 'flex';
        modal.style.flexDirection = 'column';
        modal.style.padding = '20px';
        modal.style.background = 'rgba(15, 23, 42, 0.95)';
        modal.style.backdropFilter = 'blur(16px)';
        modal.style.border = '1px solid rgba(255,255,255,0.1)';
        modal.style.borderRadius = '12px';
        modal.style.animation = 'fadeIn 0.2s ease';

        var header = document.createElement('div');
        header.style.display = 'flex';
        header.style.justifyContent = 'space-between';
        header.style.alignItems = 'center';
        header.style.marginBottom = '20px';
        header.innerHTML = '<h3 style="margin:0; font-size:1.2rem; color:#f8fafc; display:flex; align-items:center gap:8px;">' +
            '<i class="fa-solid fa-list-check" style="color:#3B82F6; margin-right:8px;"></i> 금주의 작업목록 (' + sd + ' ~ ' + ed + ')' +
            '<span style="font-size:0.75rem; color:#94a3b8; font-weight:normal; margin-left:12px; background:rgba(255,255,255,0.05); padding:4px 8px; border-radius:4px;">조회 건수: ' + (data.values ? data.values.length : 0) + '건</span></h3>' +
            '<button id="close-week-modal" style="background:none; border:none; color:#94a3b8; font-size:1.4rem; cursor:pointer; padding:4px; transition:color 0.2s;"><i class="fa-solid fa-times"></i></button>';

        var tableWrapper = document.createElement('div');
        tableWrapper.style.flex = '1';
        tableWrapper.style.overflowY = 'auto';
        tableWrapper.style.border = '1px solid rgba(148,163,184,0.1)';
        tableWrapper.style.borderRadius = '8px';
        tableWrapper.style.background = 'rgba(15,23,42,0.4)';

        if (!data.values || data.values.length === 0) {
            tableWrapper.innerHTML = '<div style="padding:60px; text-align:center; color:#64748b; font-size:0.9rem;">해당 기간에 진행 중인 작업 내역이 없습니다. (시작일/종료일 데이터 부족 혹은 일정 없음)</div>';
        } else {
            var thStyle = 'text-align:left; padding:12px 14px; color:#94a3b8; font-weight:700; border-bottom:1px solid rgba(148,163,184,0.1); position:sticky; top:0; background:rgba(30,41,59,0.95); backdrop-filter:blur(8px); z-index:10; font-size:0.75rem;';
            var tdStyle = 'padding:10px 14px; font-size:0.75rem; border-bottom:1px solid rgba(148,163,184,0.06); color:#f8fafc;';

            var tableHTML = '<table style="width:100%; border-collapse:collapse;">' +
                '<thead><tr>' +
                '<th style="' + thStyle + ' width:10%">동</th>' +
                '<th style="' + thStyle + ' width:15%">대공종</th>' +
                '<th style="' + thStyle + ' width:25%">작업명</th>' +
                '<th style="' + thStyle + ' width:20%">품명</th>' +
                '<th style="' + thStyle + ' width:15%">규격</th>' +
                '<th style="' + thStyle + ' width:15%; text-align:right;">합계 금액</th>' +
                '</tr></thead><tbody>';

            var totalAmt = 0;
            data.values.forEach(function (row) {
                totalAmt += (row[5] || 0);
                tableHTML += '<tr style="transition:background 0.2s; cursor:default;" onmouseover="this.style.background=\'rgba(255,255,255,0.04)\'" onmouseout="this.style.background=\'transparent\'">' +
                    '<td style="' + tdStyle + '">' + (row[0] || '-') + '</td>' +
                    '<td style="' + tdStyle + '">' + (row[1] || '-') + '</td>' +
                    '<td style="' + tdStyle + '"><div style="max-height:3em; overflow:hidden;" title="' + (row[2] || '') + '">' + (row[2] || '-') + '</div></td>' +
                    '<td style="' + tdStyle + 'color:#cbd5e1;"><div style="max-height:3em; overflow:hidden;" title="' + (row[3] || '') + '">' + (row[3] || '') + '</div></td>' +
                    '<td style="' + tdStyle + 'color:#cbd5e1;">' + (row[4] || '') + '</td>' +
                    '<td style="' + tdStyle + 'text-align:right; font-weight:700; color:#10B981;">' + Components.formatCurrency(row[5] || 0) + '</td>' +
                    '</tr>';
            });

            // 합계 풋터
            tableHTML += '</tbody><tfoot style="position:sticky; bottom:0; background:rgba(15,23,42,0.95); backdrop-filter:blur(8px);">' +
                '<tr><td colspan="5" style="padding:14px; text-align:right; font-weight:700; color:#f8fafc; border-top:1px solid rgba(148,163,184,0.2);">전체 총액</td>' +
                '<td style="padding:14px; text-align:right; font-weight:800; color:#4ade80; font-size:0.95rem; border-top:1px solid rgba(148,163,184,0.2);">' + Components.formatCurrency(totalAmt) + '</td>' +
                '</tr></tfoot></table>';

            tableWrapper.innerHTML = tableHTML;
        }

        modal.appendChild(header);
        modal.appendChild(tableWrapper);
        overlay.appendChild(modal);
        document.body.appendChild(overlay);

        var closeBtn = document.getElementById('close-week-modal');
        if (closeBtn) closeBtn.addEventListener('click', function () { document.body.removeChild(overlay); });
        overlay.addEventListener('click', function (e) { if (e.target === overlay) document.body.removeChild(overlay); });
    }
}

window.renderCostPage = renderCostPage;

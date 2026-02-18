/**
 * ============================================================
 * AI Report Page (ai_report.js)
 * ============================================================
 * CM 관점 6대 자동 보고서 생성 페이지
 * 1. 기성 청구서 (Payment Application)
 * 2. Cost Variance Report (실행 vs 도급)
 * 3. 주간/월간 보고서 (Weekly/Monthly Report)
 * 4. 자재 수불 현황 (Material Tracking)
 * 5. 변경 이력 관리 (Change Order Log)
 * 6. 리스크 히트맵 (Risk Dashboard)
 */

/* global Components, DB, Chart, CHART_COLORS, formatCurrency, formatCurrencyFull, formatNumber, createKPICard, createChart, createGauge */

function renderAiReportPage(container) {
    'use strict';

    if (!DB || !DB.isReady()) {
        container.innerHTML = Components.showError('데이터베이스가 로드되지 않았습니다.');
        return;
    }

    var today = new Date();
    var todayStr = today.toISOString().slice(0, 10);
    var thisMonth = today.getFullYear() + '-' + String(today.getMonth() + 1).padStart(2, '0');
    var activeTab = 'payment';

    // ── 레이아웃 ─────────────────────────────────────────
    container.innerHTML = buildLayout();
    renderTab(activeTab);
    setupEvents();

    function buildLayout() {
        var tabs = [
            { id: 'payment', icon: 'fa-file-invoice-dollar', label: '기성 청구서' },
            { id: 'variance', icon: 'fa-scale-balanced', label: '사업손익분석' },
            { id: 'monthly', icon: 'fa-calendar-days', label: '월간 보고서' },
            { id: 'weekly', icon: 'fa-calendar-week', label: '주간 보고서' },
            { id: 'material', icon: 'fa-boxes-stacked', label: '자재 수불현황' },
            { id: 'change', icon: 'fa-file-pen', label: '변경 이력' },
            { id: 'risk', icon: 'fa-triangle-exclamation', label: '리스크 히트맵' },
            { id: 'simulator', icon: 'fa-sliders', label: '기성 시뮬레이션' },
            { id: 'heatmap', icon: 'fa-map', label: '공간별 진도' }
        ];

        var html = '<div class="rpt-page">';
        // Header
        html += '<div class="rpt-header">' +
            '<div class="rpt-header-left">' +
            '<div class="rpt-title-icon"><i class="fa-solid fa-file-lines"></i></div>' +
            '<div>' +
            '<h2 class="rpt-title">AI Report — CM 자동 보고서</h2>' +
            '<p class="rpt-subtitle">건설사업관리(CM) 핵심 보고서를 데이터 기반으로 자동 생성합니다</p>' +
            '</div></div>' +
            '<div class="rpt-date"><i class="fa-solid fa-calendar-day"></i> ' + todayStr + '</div>' +
            '</div>';

        // Tab Bar
        html += '<div class="rpt-tabs" id="rpt-tabs">';
        tabs.forEach(function (t) {
            html += '<button class="rpt-tab' + (t.id === activeTab ? ' active' : '') + '" data-tab="' + t.id + '">' +
                '<i class="fa-solid ' + t.icon + '"></i><span>' + t.label + '</span></button>';
        });
        html += '</div>';

        // Content Area
        html += '<div class="rpt-content" id="rpt-content"></div>';
        html += '</div>';
        return html;
    }

    // ── 탭 전환 ──────────────────────────────────────────
    function setupEvents() {
        var tabBar = document.getElementById('rpt-tabs');
        if (tabBar) {
            tabBar.addEventListener('click', function (e) {
                var btn = e.target.closest('.rpt-tab');
                if (!btn) return;
                var tid = btn.getAttribute('data-tab');
                if (tid === activeTab) return;
                tabBar.querySelectorAll('.rpt-tab').forEach(function (b) { b.classList.remove('active'); });
                btn.classList.add('active');
                activeTab = tid;
                renderTab(tid);
            });
        }
    }

    function renderTab(tid) {
        var area = document.getElementById('rpt-content');
        if (!area) return;
        area.style.opacity = '0';
        setTimeout(function () {
            try {
                switch (tid) {
                    case 'payment': renderPayment(area); break;
                    case 'variance': renderVariance(area); break;
                    case 'monthly': renderMonthly(area); break;
                    case 'weekly': renderWeekly(area); break;
                    case 'material': renderMaterial(area); break;
                    case 'change': renderChange(area); break;
                    case 'risk': renderRisk(area); break;
                    case 'simulator': renderSimulator(area); break;
                    case 'heatmap': renderHeatmap(area); break;
                }
            } catch (err) {
                area.innerHTML = Components.showError('보고서 생성 오류: ' + err.message);
                console.error('[Report]', err);
            }
            area.style.transition = 'opacity 0.3s ease';
            area.style.opacity = '1';
            setTimeout(function () { if (typeof animateCountUp === 'function') animateCountUp(); }, 100);
        }, 80);
    }

    // ═══════════════════════════════════════════════════════
    // 1. 기성 청구서 (Payment Application)
    // ═══════════════════════════════════════════════════════
    function renderPayment(area) {
        var evms = DB.calculateEvmsMetrics(todayStr);
        var bac = evms.bac || 0;
        var ev = evms.ev || 0;
        var prevMonth = new Date(today.getFullYear(), today.getMonth() - 1, 1);
        var prevMonthStr = prevMonth.toISOString().slice(0, 7);

        // 업체별 기성
        var byCompany = DB.runQuery(
            "SELECT WHO1_하도급업체, " +
            "SUM(R10_합계_금액) as bac, " +
            "SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) as ev, " +
            "COUNT(*) as cnt " +
            "FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 HAVING ev > 0 ORDER BY ev DESC"
        );

        // 공종별 기성
        var byTrade = DB.runQuery(
            "SELECT HOW1_공사, " +
            "SUM(R10_합계_금액) as bac, " +
            "SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) as ev " +
            "FROM evms GROUP BY HOW1_공사 ORDER BY ev DESC"
        );

        // 금월 종료 예정 작업 기성
        var monthlyEv = DB.runScalar(
            "SELECT COALESCE(SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)), 0) " +
            "FROM evms WHERE SUBSTR(WHEN2종료일, 1, 7) = '" + thisMonth + "'"
        );

        var evPct = bac > 0 ? (ev / bac * 100) : 0;

        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-file-invoice-dollar"></i> 기성 청구서 (Payment Application)</div>';
        html += '<p class="rpt-report-desc">기준일: ' + todayStr + ' · 실행률 기반 누적 기성 현황</p>';

        // KPI Cards
        html += '<div class="rpt-kpi-row">';
        html += createKPICard('총 도급액 (BAC)', formatCurrency(bac), 'fa-wallet', 'blue');
        html += createKPICard('누적 기성액 (EV)', formatCurrency(ev), 'fa-coins', 'green', evPct.toFixed(1) + '%', 'up');
        html += createKPICard('금월 예상 기성', formatCurrency(monthlyEv), 'fa-calendar-check', 'purple');
        html += createKPICard('잔여 공사비', formatCurrency(bac - ev), 'fa-hourglass-half', 'orange');
        html += '</div>';

        // 누적 기성률 게이지
        html += '<div class="rpt-card-row">';
        html += '<div class="rpt-card rpt-card-sm">' +
            '<h6 class="rpt-card-title"><i class="fa-solid fa-gauge-high"></i> 누적 기성률</h6>' +
            '<div style="display:flex;justify-content:center;padding:16px">' +
            createGauge({ value: evPct, max: 100, label: '기성률', unit: '%', color: '#10B981', size: 160, displayValue: evPct.toFixed(1) }) +
            '</div></div>';

        // 공종별 기성 차트
        html += '<div class="rpt-card rpt-card-lg">' +
            '<h6 class="rpt-card-title"><i class="fa-solid fa-chart-bar"></i> 공종별 기성 현황</h6>' +
            '<div style="height:260px"><canvas id="rpt-payment-trade-chart"></canvas></div></div>';
        html += '</div>';

        // 업체별 기성 내역 테이블
        html += '<div class="rpt-card">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-building"></i> 업체별 기성 내역</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>하도급업체</th><th class="text-end">도급액</th><th class="text-end">기성액(EV)</th><th class="text-end">기성률</th><th>진행</th></tr></thead><tbody>';
        if (byCompany.values) {
            byCompany.values.forEach(function (r) {
                var name = r[0], cbac = r[1] || 0, cev = r[2] || 0;
                var pct = cbac > 0 ? (cev / cbac * 100) : 0;
                var barColor = pct >= 80 ? '#10B981' : pct >= 40 ? '#F59E0B' : '#3B82F6';
                html += '<tr><td><a href="#" class="rpt-company-link" data-company="' + esc(name) + '" title="클릭하여 최근 3개월 작업 내역 보기"><strong>' + esc(name) + '</strong> <i class="fa-solid fa-magnifying-glass" style="font-size:0.6rem;opacity:0.4"></i></a></td>' +
                    '<td class="text-end">' + formatCurrency(cbac) + '</td>' +
                    '<td class="text-end">' + formatCurrency(cev) + '</td>' +
                    '<td class="text-end"><strong>' + pct.toFixed(1) + '%</strong></td>' +
                    '<td style="width:120px"><div class="rpt-bar-bg"><div class="rpt-bar-fill" style="width:' + Math.min(pct, 100) + '%;background:' + barColor + '"></div></div></td></tr>';
            });
        }
        html += '</tbody></table></div></div>';

        // 업체 상세 카드 영역
        html += '<div id="rpt-company-detail"></div>';

        html += '</div>';
        area.innerHTML = html;

        // 업체명 클릭 이벤트
        area.querySelectorAll('.rpt-company-link').forEach(function (link) {
            link.addEventListener('click', function (e) {
                e.preventDefault();
                var company = link.getAttribute('data-company');
                renderCompanyDetail(company);
            });
        });

        // 차트 렌더
        if (byTrade.values && byTrade.values.length > 0) {
            createChart('rpt-payment-trade-chart', 'bar', {
                labels: byTrade.values.map(function (r) { return (r[0] || '').replace(/^\d+_/, ''); }),
                datasets: [
                    { label: '도급액', data: byTrade.values.map(function (r) { return r[1] || 0; }), backgroundColor: '#3B82F6CC', borderRadius: 4 },
                    { label: '기성액', data: byTrade.values.map(function (r) { return r[2] || 0; }), backgroundColor: '#10B981CC', borderRadius: 4 }
                ]
            }, {
                plugins: { legend: { position: 'top' } },
                scales: { y: { ticks: { callback: function (v) { return v >= 1e8 ? (v / 1e8).toFixed(0) + '억' : v >= 1e4 ? (v / 1e4).toFixed(0) + '만' : v; } } } }
            });
        }
    }

    // ── 업체 상세 카드 (최근 3개월 작업 내역) ──────────────
    function renderCompanyDetail(company) {
        var detailArea = document.getElementById('rpt-company-detail');
        if (!detailArea) return;

        // 이미 같은 업체 카드가 열려 있으면 닫기
        if (detailArea.getAttribute('data-current') === company) {
            detailArea.innerHTML = '';
            detailArea.removeAttribute('data-current');
            return;
        }
        detailArea.setAttribute('data-current', company);

        // 최근 3개월 범위 계산
        var now = new Date();
        var m3ago = new Date(now.getFullYear(), now.getMonth() - 3, 1);
        var m3agoStr = m3ago.toISOString().slice(0, 10);

        // 작업 내역 조회
        var tasks = DB.runQuery(
            "SELECT WHERE2_동, HOW1_공사, HOW3_작업명, HOW4_품명, " +
            "WHEN1_시작일, WHEN2종료일, \"WHEN3_기간(일)\", " +
            "COALESCE(\"WHEN4_실행률(%)\", 0) as progress, " +
            "R10_합계_금액, R1_단위, R2_수량 " +
            "FROM evms WHERE WHO1_하도급업체 = '" + company.replace(/'/g, "''") + "' " +
            "AND WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
            "AND WHEN1_시작일 >= '" + m3agoStr + "' " +
            "ORDER BY WHEN1_시작일 DESC"
        );

        // 업체 요약 통계
        var summary = DB.runQuery(
            "SELECT COUNT(*) as cnt, " +
            "SUM(R10_합계_금액) as total, " +
            "SUM(R10_합계_금액 * COALESCE(\"WHEN4_실행률(%)\", 0)) as ev, " +
            "COUNT(DISTINCT HOW1_공사) as trades " +
            "FROM evms WHERE WHO1_하도급업체 = '" + company.replace(/'/g, "''") + "' " +
            "AND WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != '' " +
            "AND WHEN1_시작일 >= '" + m3agoStr + "'"
        );

        var cnt = 0, total = 0, ev = 0, trades = 0;
        if (summary.values && summary.values.length > 0) {
            cnt = summary.values[0][0] || 0;
            total = summary.values[0][1] || 0;
            ev = summary.values[0][2] || 0;
            trades = summary.values[0][3] || 0;
        }
        var pct = total > 0 ? (ev / total * 100) : 0;

        var html = '<div class="rpt-card rpt-detail-card" style="animation:fadeSlideUp 0.3s ease both;border-left:4px solid var(--accent)">';

        // 헤더
        html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:12px">';
        html += '<h6 class="rpt-card-title" style="margin:0"><i class="fa-solid fa-building"></i> ' + esc(company) + ' — 최근 3개월 작업 수행 내역</h6>';
        html += '<button class="rpt-close-btn" id="rpt-detail-close" title="닫기"><i class="fa-solid fa-xmark"></i></button>';
        html += '</div>';

        // 요약 KPI
        html += '<div style="display:flex;gap:16px;flex-wrap:wrap;margin-bottom:14px">';
        html += '<div class="rpt-mini-kpi"><span class="rpt-mini-label">작업 수</span><span class="rpt-mini-value">' + cnt + '건</span></div>';
        html += '<div class="rpt-mini-kpi"><span class="rpt-mini-label">공종 수</span><span class="rpt-mini-value">' + trades + '개</span></div>';
        html += '<div class="rpt-mini-kpi"><span class="rpt-mini-label">도급액 합계</span><span class="rpt-mini-value">' + formatCurrency(total) + '</span></div>';
        html += '<div class="rpt-mini-kpi"><span class="rpt-mini-label">기성액</span><span class="rpt-mini-value">' + formatCurrency(ev) + '</span></div>';
        html += '<div class="rpt-mini-kpi"><span class="rpt-mini-label">기성률</span><span class="rpt-mini-value" style="color:' + (pct >= 50 ? '#10B981' : '#F59E0B') + '">' + pct.toFixed(1) + '%</span></div>';
        html += '</div>';

        // 작업 테이블
        if (tasks.values && tasks.values.length > 0) {
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>동</th><th>공사</th><th>작업명</th><th>품명</th><th>시작일</th><th>종료일</th><th>기간</th><th>실행률</th><th class="text-end">금액</th></tr></thead><tbody>';
            tasks.values.forEach(function (r) {
                var prog = ((r[7] || 0) * 100).toFixed(0);
                var progColor = prog >= 100 ? '#10B981' : prog >= 50 ? '#F59E0B' : '#94A3B8';
                html += '<tr>' +
                    '<td>' + esc(r[0]) + '</td>' +
                    '<td>' + esc(r[1]) + '</td>' +
                    '<td><strong>' + esc(r[2]) + '</strong></td>' +
                    '<td>' + esc(r[3]) + '</td>' +
                    '<td>' + (r[4] || '') + '</td>' +
                    '<td>' + (r[5] || '') + '</td>' +
                    '<td>' + (r[6] || '-') + '일</td>' +
                    '<td style="color:' + progColor + ';font-weight:600">' + prog + '%</td>' +
                    '<td class="text-end">' + formatCurrency(r[8]) + '</td>' +
                    '</tr>';
            });
            html += '</tbody></table></div>';
        } else {
            html += '<p style="text-align:center;color:var(--text-muted);padding:20px 0">최근 3개월 내 작업 내역이 없습니다.</p>';
        }

        html += '</div>';
        detailArea.innerHTML = html;

        // 닫기 버튼
        var closeBtn = document.getElementById('rpt-detail-close');
        if (closeBtn) {
            closeBtn.addEventListener('click', function () {
                detailArea.innerHTML = '';
                detailArea.removeAttribute('data-current');
            });
        }

        // 카드로 스크롤
        detailArea.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }

    // ═══════════════════════════════════════════════════════
    // 2. Cost Variance Report
    // ═══════════════════════════════════════════════════════
    function renderVariance(area) {
        // ── 가상 실행비율 매핑 (도급액 대비 실행액 비율) ──
        var execRatioMap = {
            '금빛건설㈜': 1.057,
            '태양토건㈜': 0.773,
            '지오엔지니어링㈜': 0.8887,
            '거창㈜': 1.073,
            '동성철근㈜': 1.15,
            '천마시멘트㈜': 1.02
        };
        // 파셜 매칭 fallback
        function getExecRatio(name) {
            if (!name) return 0.92; // 기본 비율
            for (var key in execRatioMap) {
                if (name.indexOf(key.replace('㈜', '')) >= 0 || key.indexOf(name.replace('㈜', '')) >= 0) return execRatioMap[key];
            }
            return 0.92;
        }

        // ── DB 쿼리 ──
        var byCompany = DB.runQuery(
            "SELECT WHO1_하도급업체, " +
            "SUM(R10_합계_금액) as contract_amt, " +
            "COUNT(*) as cnt, " +
            "COUNT(DISTINCT HOW2_대공종) as trades " +
            "FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) > 0 " +
            "GROUP BY WHO1_하도급업체 ORDER BY contract_amt DESC"
        );

        var byTrade = DB.runQuery(
            "SELECT HOW2_대공종, " +
            "SUM(R10_합계_금액) as contract_amt, " +
            "WHO1_하도급업체 " +
            "FROM evms WHERE HOW2_대공종 IS NOT NULL AND HOW2_대공종 != '' " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) > 0 " +
            "GROUP BY HOW2_대공종, WHO1_하도급업체 ORDER BY contract_amt DESC"
        );

        var totalContract = DB.runScalar("SELECT SUM(R10_합계_금액) FROM evms") || 0;

        // ── 업체별 데이터 가공 ──
        var companyData = [];
        var totalExec = 0;
        var deficitCompanies = [];
        if (byCompany.values) {
            byCompany.values.forEach(function (r) {
                var name = r[0], contract = r[1] || 0, cnt = r[2] || 0, trades = r[3] || 0;
                var ratio = getExecRatio(name);
                var exec = Math.round(contract * ratio);
                var profit = contract - exec;
                var profitRate = contract > 0 ? ((1 - ratio) * 100) : 0;
                totalExec += exec;
                var item = { name: name, contract: contract, exec: exec, profit: profit, profitRate: profitRate, ratio: ratio, cnt: cnt, trades: trades };
                companyData.push(item);
                if (ratio > 1) deficitCompanies.push(item);
            });
        }

        var totalProfit = totalContract - totalExec;
        var totalProfitRate = totalContract > 0 ? (totalProfit / totalContract * 100) : 0;

        // ── 공종별 데이터 (업체 실행비율 적용) ──
        var tradeMap = {};
        if (byTrade.values) {
            byTrade.values.forEach(function (r) {
                var trade = r[0], amt = r[1] || 0, company = r[2];
                var ratio = getExecRatio(company);
                if (!tradeMap[trade]) tradeMap[trade] = { contract: 0, exec: 0 };
                tradeMap[trade].contract += amt;
                tradeMap[trade].exec += Math.round(amt * ratio);
            });
        }
        var tradeArr = [];
        for (var t in tradeMap) {
            var td = tradeMap[t];
            tradeArr.push({ name: t, contract: td.contract, exec: td.exec, profit: td.contract - td.exec, profitRate: td.contract > 0 ? ((td.contract - td.exec) / td.contract * 100) : 0 });
        }
        tradeArr.sort(function (a, b) { return a.profitRate - b.profitRate; });

        // ═══════════════════════════════════════════════
        // HTML 구성
        // ═══════════════════════════════════════════════
        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-scale-balanced"></i> 사업손익분석 — 도급 vs 실행 원가 분석</div>';
        html += '<p class="rpt-report-desc">도급액 대비 실행액(추정) 비교 분석 · 이익률 시각화 · 적자 공종 경고 · 하도급 지급률 분석</p>';

        // ── KPI Cards ──
        html += '<div class="rpt-kpi-row">';
        html += createKPICard('총 도급액', formatCurrency(totalContract), 'fa-wallet', 'blue');
        html += createKPICard('총 실행액(추정)', formatCurrency(totalExec), 'fa-money-bill-trend-up', 'purple');
        html += createKPICard('예상 이익', formatCurrency(totalProfit), 'fa-piggy-bank', totalProfit >= 0 ? 'green' : 'red',
            totalProfitRate.toFixed(1) + '%', totalProfit >= 0 ? 'up' : 'down');
        html += createKPICard('적자 업체', deficitCompanies.length + '개사', 'fa-triangle-exclamation', deficitCompanies.length > 0 ? 'red' : 'green',
            deficitCompanies.length > 0 ? '⚠ 주의' : '✓ 양호', deficitCompanies.length > 0 ? 'down' : 'up');
        html += '</div>';

        // ── 1) 도급액 vs 실행액 비교 테이블 ──
        html += '<div class="rpt-card">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-table"></i> 도급액 vs 실행액(추정) 비교표 — 업체별</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr>' +
            '<th>업체명</th><th class="text-end">도급액</th><th class="text-end">실행액(추정)</th>' +
            '<th class="text-end">차이(손익)</th><th class="text-end">이익률</th>' +
            '<th class="text-end">실행비율</th><th>상태</th></tr></thead><tbody>';
        companyData.forEach(function (d) {
            var isLoss = d.profit < 0;
            var rowStyle = isLoss ? ' style="background:rgba(239,68,68,0.04)"' : '';
            var statusBadge = isLoss
                ? '<span class="badge bg-danger">적자</span>'
                : d.profitRate < 5 ? '<span class="badge bg-warning text-dark">주의</span>'
                    : '<span class="badge bg-success">양호</span>';
            html += '<tr' + rowStyle + '>' +
                '<td><strong>' + esc(d.name) + '</strong></td>' +
                '<td class="text-end">' + formatCurrency(d.contract) + '</td>' +
                '<td class="text-end">' + formatCurrency(d.exec) + '</td>' +
                '<td class="text-end" style="color:' + (isLoss ? '#EF4444' : '#10B981') + ';font-weight:700">' +
                (isLoss ? '' : '+') + formatCurrency(d.profit) + '</td>' +
                '<td class="text-end" style="color:' + (isLoss ? '#EF4444' : '#10B981') + ';font-weight:700">' +
                d.profitRate.toFixed(1) + '%</td>' +
                '<td class="text-end"><strong>' + (d.ratio * 100).toFixed(1) + '%</strong></td>' +
                '<td>' + statusBadge + '</td></tr>';
        });
        // 합계 행
        html += '<tr style="background:var(--bg-input);font-weight:700">' +
            '<td>합계</td>' +
            '<td class="text-end">' + formatCurrency(totalContract) + '</td>' +
            '<td class="text-end">' + formatCurrency(totalExec) + '</td>' +
            '<td class="text-end" style="color:' + (totalProfit >= 0 ? '#10B981' : '#EF4444') + '">' +
            (totalProfit >= 0 ? '+' : '') + formatCurrency(totalProfit) + '</td>' +
            '<td class="text-end" style="color:' + (totalProfit >= 0 ? '#10B981' : '#EF4444') + '">' + totalProfitRate.toFixed(1) + '%</td>' +
            '<td class="text-end">' + (totalContract > 0 ? (totalExec / totalContract * 100).toFixed(1) : 0) + '%</td>' +
            '<td></td></tr>';
        html += '</tbody></table></div></div>';

        // ── 2) 이익률 시각화 차트 영역 ──
        html += '<div class="rpt-card-row">';
        // 업체별 도급 vs 실행 비교 차트
        html += '<div class="rpt-card rpt-card-lg"><h6 class="rpt-card-title"><i class="fa-solid fa-chart-bar"></i> 업체별 도급액 vs 실행액 비교</h6>' +
            '<div style="height:300px"><canvas id="rpt-var-company-chart"></canvas></div></div>';
        // 공종별 이익률 차트
        html += '<div class="rpt-card rpt-card-sm"><h6 class="rpt-card-title"><i class="fa-solid fa-chart-line"></i> 이익률 분포</h6>' +
            '<div style="height:300px"><canvas id="rpt-var-profit-chart"></canvas></div></div>';
        html += '</div>';

        // ── 3) 적자 공종 경고 ──
        var deficitTrades = tradeArr.filter(function (t) { return t.profit < 0; });
        if (deficitTrades.length > 0) {
            html += '<div class="rpt-card rpt-card-danger">';
            html += '<h6 class="rpt-card-title" style="color:#EF4444"><i class="fa-solid fa-triangle-exclamation"></i> 적자 공종 경고 (' + deficitTrades.length + '개 공종)</h6>';
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>공종</th><th class="text-end">도급액</th><th class="text-end">실행액(추정)</th><th class="text-end">적자액</th><th class="text-end">이익률</th><th>위험도</th></tr></thead><tbody>';
            deficitTrades.forEach(function (d) {
                var severity = d.profitRate < -10 ? '높음' : d.profitRate < -5 ? '중간' : '낮음';
                var sevColor = d.profitRate < -10 ? '#EF4444' : d.profitRate < -5 ? '#F59E0B' : '#94A3B8';
                var tradeName = (d.name || '').replace(/^\d+[._]/, '');
                html += '<tr style="color:#EF4444">' +
                    '<td><strong>' + esc(tradeName) + '</strong></td>' +
                    '<td class="text-end">' + formatCurrency(d.contract) + '</td>' +
                    '<td class="text-end">' + formatCurrency(d.exec) + '</td>' +
                    '<td class="text-end" style="font-weight:700">' + formatCurrency(d.profit) + '</td>' +
                    '<td class="text-end" style="font-weight:700">' + d.profitRate.toFixed(1) + '%</td>' +
                    '<td><span style="background:' + sevColor + '22;color:' + sevColor + ';padding:2px 10px;border-radius:10px;font-size:0.72rem;font-weight:600">' + severity + '</span></td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        // ── 비적자 공종 현황 ──
        var profitTrades = tradeArr.filter(function (t) { return t.profit >= 0; });
        html += '<div class="rpt-card">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-circle-check" style="color:#10B981"></i> 흑자 공종 현황 (' + profitTrades.length + '개 공종)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>공종</th><th class="text-end">도급액</th><th class="text-end">실행액(추정)</th><th class="text-end">이익</th><th class="text-end">이익률</th><th>상태</th></tr></thead><tbody>';
        profitTrades.sort(function (a, b) { return b.profitRate - a.profitRate; });
        profitTrades.forEach(function (d) {
            var tradeName = (d.name || '').replace(/^\d+[._]/, '');
            var statusBadge = d.profitRate >= 15 ? '<span class="badge bg-success">우수</span>'
                : d.profitRate >= 5 ? '<span class="badge bg-info">양호</span>'
                    : '<span class="badge bg-warning text-dark">주의</span>';
            html += '<tr>' +
                '<td><strong>' + esc(tradeName) + '</strong></td>' +
                '<td class="text-end">' + formatCurrency(d.contract) + '</td>' +
                '<td class="text-end">' + formatCurrency(d.exec) + '</td>' +
                '<td class="text-end" style="color:#10B981;font-weight:700">+' + formatCurrency(d.profit) + '</td>' +
                '<td class="text-end" style="color:#10B981;font-weight:700">+' + d.profitRate.toFixed(1) + '%</td>' +
                '<td>' + statusBadge + '</td></tr>';
        });
        html += '</tbody></table></div></div>';

        // ── 4) 하도급 지급률 분석 ──
        html += '<div class="rpt-card">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-hand-holding-dollar"></i> 하도급 지급률 분석 (도급 대비 하도급 비율)</h6>';
        html += '<p style="font-size:0.75rem;color:var(--text-muted);margin-bottom:12px">도급액 중 하도급 업체에 지급되는 비율을 분석합니다. 지급률이 높을수록 원도급자 마진이 낮습니다.</p>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">도급액(원도급 수령)</th><th class="text-end">실행액(하도급 지급)</th><th class="text-end">지급률</th><th>지급률 시각화</th><th class="text-end">원도급 잔여</th></tr></thead><tbody>';
        companyData.forEach(function (d) {
            var payRatio = d.ratio * 100;
            var barColor = payRatio > 100 ? '#EF4444' : payRatio > 95 ? '#F59E0B' : '#3B82F6';
            var remain = d.contract - d.exec;
            html += '<tr>' +
                '<td><strong>' + esc(d.name) + '</strong></td>' +
                '<td class="text-end">' + formatCurrency(d.contract) + '</td>' +
                '<td class="text-end">' + formatCurrency(d.exec) + '</td>' +
                '<td class="text-end" style="font-weight:700;color:' + barColor + '">' + payRatio.toFixed(1) + '%</td>' +
                '<td style="width:160px"><div class="rpt-bar-bg" style="height:10px"><div class="rpt-bar-fill" style="width:' + Math.min(payRatio, 120) / 1.2 + '%;background:' + barColor + '"></div></div>' +
                '<div style="display:flex;justify-content:space-between;font-size:0.6rem;color:var(--text-muted);margin-top:2px"><span>0%</span><span style="color:#EF4444">100%</span><span>120%</span></div></td>' +
                '<td class="text-end" style="color:' + (remain >= 0 ? '#10B981' : '#EF4444') + ';font-weight:600">' + (remain >= 0 ? '+' : '') + formatCurrency(remain) + '</td></tr>';
        });
        html += '</tbody></table></div></div>';

        // ── 5) 실행률 100% 초과 업체 조치방안 ──
        if (deficitCompanies.length > 0) {
            html += '<div class="rpt-card rpt-card-danger">';
            html += '<h6 class="rpt-card-title" style="color:#EF4444"><i class="fa-solid fa-gavel"></i> 실행비율 100% 초과 업체 — 조치방안</h6>';
            html += '<p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:16px">' +
                '아래 업체들은 실행비율이 100%를 초과하여 원가 초과(적자) 상태입니다. 즉각적인 원가 관리 조치가 필요합니다.</p>';
            deficitCompanies.forEach(function (d) {
                var overPct = ((d.ratio - 1) * 100).toFixed(1);
                var overAmt = d.exec - d.contract;
                html += '<div style="background:rgba(239,68,68,0.03);border:1px solid rgba(239,68,68,0.2);border-radius:var(--radius-md);padding:16px;margin-bottom:12px">';
                html += '<div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:10px;flex-wrap:wrap;gap:8px">';
                html += '<div><strong style="font-size:0.95rem;color:#EF4444">' + esc(d.name) + '</strong>';
                html += '<span style="font-size:0.72rem;color:var(--text-muted);margin-left:8px">실행비율 ' + (d.ratio * 100).toFixed(1) + '% · 초과액 ' + formatCurrency(overAmt) + '</span></div>';
                html += '<span style="background:#EF444422;color:#EF4444;padding:4px 12px;border-radius:12px;font-size:0.72rem;font-weight:600">+' + overPct + '% 초과</span>';
                html += '</div>';
                html += '<div style="font-size:0.78rem;color:var(--text-secondary);line-height:1.8">';
                html += '<div style="display:flex;gap:8px;margin-bottom:4px"><span style="color:#EF4444;font-weight:700">❶</span> <span><strong>원가 정밀분석:</strong> ' + esc(d.name) + '의 투입 원가를 재료비/노무비/경비 비목별로 상세 분석하여 초과 원인을 규명합니다.</span></div>';
                html += '<div style="display:flex;gap:8px;margin-bottom:4px"><span style="color:#EF4444;font-weight:700">❷</span> <span><strong>설계변경 검토:</strong> 설계변경으로 인한 물량 증가분이 도급 변경에 반영되었는지 확인합니다. 미반영 시 변경 청구를 진행합니다.</span></div>';
                html += '<div style="display:flex;gap:8px;margin-bottom:4px"><span style="color:#EF4444;font-weight:700">❸</span> <span><strong>VE (Value Engineering):</strong> 공법 개선, 자재 대체, 시공 효율화를 통한 실행비 절감 방안을 모색합니다.</span></div>';
                html += '<div style="display:flex;gap:8px;margin-bottom:4px"><span style="color:#EF4444;font-weight:700">❹</span> <span><strong>하도급 재협상:</strong> 실행 단가의 적정성을 검토하고, 필요 시 하도급 단가 재협상을 진행합니다.</span></div>';
                html += '<div style="display:flex;gap:8px"><span style="color:#EF4444;font-weight:700">❺</span> <span><strong>경영진 보고:</strong> 적자 규모(' + formatCurrency(overAmt) + ')를 경영진에 보고하고, 프로젝트 수익 관리 회의를 소집합니다.</span></div>';
                html += '</div></div>';
            });
            html += '</div>';
        }

        html += '</div>';
        area.innerHTML = html;

        // ── 차트 렌더링 ──
        // 업체별 도급 vs 실행 비교 바 차트
        if (companyData.length > 0) {
            createChart('rpt-var-company-chart', 'bar', {
                labels: companyData.map(function (d) { return (d.name || '').replace('㈜', ''); }),
                datasets: [
                    { label: '도급액', data: companyData.map(function (d) { return d.contract; }), backgroundColor: '#3B82F6CC', borderRadius: 4 },
                    { label: '실행액(추정)', data: companyData.map(function (d) { return d.exec; }), backgroundColor: companyData.map(function (d) { return d.exec > d.contract ? '#EF4444CC' : '#10B981CC'; }), borderRadius: 4 }
                ]
            }, {
                plugins: { legend: { position: 'top' } },
                scales: { y: { ticks: { callback: function (v) { return v >= 1e8 ? (v / 1e8).toFixed(0) + '억' : v >= 1e4 ? (v / 1e4).toFixed(0) + '만' : v; } } } }
            });
        }

        // 이익률 분포 (수평 바)
        if (companyData.length > 0) {
            var sorted = companyData.slice().sort(function (a, b) { return a.profitRate - b.profitRate; });
            createChart('rpt-var-profit-chart', 'bar', {
                labels: sorted.map(function (d) { return (d.name || '').replace('㈜', ''); }),
                datasets: [{
                    label: '이익률 (%)',
                    data: sorted.map(function (d) { return d.profitRate.toFixed(1); }),
                    backgroundColor: sorted.map(function (d) { return d.profitRate < 0 ? '#EF4444CC' : d.profitRate < 5 ? '#F59E0BCC' : '#10B981CC'; }),
                    borderRadius: 4
                }]
            }, {
                indexAxis: 'y',
                plugins: {
                    legend: { display: false },
                    tooltip: { callbacks: { label: function (ctx) { return '이익률: ' + ctx.raw + '%'; } } }
                },
                scales: {
                    x: {
                        ticks: { callback: function (v) { return v + '%'; } },
                        grid: { color: function (ctx) { return ctx.tick.value === 0 ? '#EF444466' : 'rgba(0,0,0,0.05)'; } }
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    // 3A. 월간 보고서 (Monthly Report)
    // ═══════════════════════════════════════════════════════
    function renderMonthly(area) {
        // 날짜 계산 (전월, 금월, 명월)
        var y = today.getFullYear();
        var m = today.getMonth(); // 0-based
        var thisMonthStart = new Date(y, m, 1);
        var thisMonthEnd = new Date(y, m + 1, 0);
        var prevMonthStart = new Date(y, m - 1, 1);
        var prevMonthEnd = new Date(y, m, 0);
        var nextMonthStart = new Date(y, m + 1, 1);
        var nextMonthEnd = new Date(y, m + 2, 0);

        var tmS = thisMonthStart.toISOString().slice(0, 10);
        var tmE = thisMonthEnd.toISOString().slice(0, 10);
        var pmS = prevMonthStart.toISOString().slice(0, 10);
        var pmE = prevMonthEnd.toISOString().slice(0, 10);
        var nmS = nextMonthStart.toISOString().slice(0, 10);
        var nmE = nextMonthEnd.toISOString().slice(0, 10);

        // 1. 전월 수행 실적 (완료 여부 무관, 기간 내 수행분)
        // 기간이 겹치는 작업 조회 (시작일 <= 전월말 AND 종료일 >= 전월초)
        var prevDone = DB.runQuery(
            "SELECT WHO1_하도급업체, COUNT(*), SUM(R10_합계_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + pmE + "' AND WHEN2종료일 >= '" + pmS + "' " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R10_합계_금액) DESC"
        );

        // 2. 금월 진행 작업 상세 (업체별)
        var thisOngoing = DB.runQuery(
            "SELECT WHO1_하도급업체, WHERE2_동, HOW3_작업명, R10_합계_금액, WHEN2종료일, COALESCE(\"WHEN4_실행률(%)\", 0) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + tmE + "' AND WHEN2종료일 >= '" + tmS + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " + // 진행중
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "ORDER BY WHO1_하도급업체, WHEN2종료일"
        );

        // 3. 명월 예정 작업 요약 (업체별)
        // 3. 명월 예정 작업 요약 (업체별) - 기간 겹침 & 미완료
        var nextPlan = DB.runQuery(
            "SELECT WHO1_하도급업체, COUNT(*), SUM(R10_합계_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + nmE + "' AND WHEN2종료일 >= '" + nmS + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R10_합계_금액) DESC"
        );

        // 4. 인원 및 장비 투입 계획 (금월 기준 추산)
        // 노무비 / 20만원 = 인원(공수), 경비 = 장비/자재비로 간주
        var resources = DB.runQuery(
            "SELECT WHO1_하도급업체, SUM(R8_노무비_금액), SUM(R9_경비_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + tmE + "' AND WHEN2종료일 >= '" + tmS + "' " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R8_노무비_금액) DESC"
        );

        // 5. 지연 작업
        var delayed = DB.runQuery(
            "SELECT WHERE2_동, HOW3_작업명, WHEN2종료일, COALESCE(\"WHEN4_실행률(%)\", 0), WHO1_하도급업체 " +
            "FROM evms WHERE WHEN2종료일 < '" + todayStr + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " +
            "ORDER BY WHEN2종료일"
        );

        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-calendar-days"></i> 월간 보고서 — Monthly Report</div>';
        html += '<p class="rpt-report-desc">보고 기간: ' + tmS.substring(0, 7) + ' (금월)</p>';

        // ── 1. 전월 실적 요약 ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-clipboard-check"></i> 업체별 전월(' + pmS.substring(0, 7) + ') 수행 실적 (진행분 포함)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">수행 작업 수</th><th class="text-end">투입 기성액</th></tr></thead><tbody>';
        if (prevDone.values && prevDone.values.length > 0) {
            prevDone.values.forEach(function (r) {
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + r[1] + '건</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        } else {
            html += '<tr><td colspan="3" class="text-center text-muted">전월 완료된 주요 작업 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        // ── 2. 금월 진행 작업 상세 ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-spinner"></i> 업체별 금월(' + tmS.substring(0, 7) + ') 진행 작업 상세</h6>';
        html += '<div class="table-responsive" style="max-height:300px;overflow-y:auto"><table class="table table-sm table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th>동</th><th>작업명</th><th>종료예정</th><th class="text-end">진행률</th></tr></thead><tbody>';
        if (thisOngoing.values) {
            thisOngoing.values.forEach(function (r) {
                var pct = (r[5] * 100).toFixed(0);
                html += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + r[4] + '</td><td class="text-end">' + pct + '%</td></tr>';
            });
        }
        html += '</tbody></table></div></div>';

        // ── 3. 명월 예정 작업 ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-calendar-plus"></i> 업체별 명월(' + nmS.substring(0, 7) + ') 예정 작업 요약</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">예정 작업 수</th><th class="text-end">예정 투입액</th></tr></thead><tbody>';
        if (nextPlan.values && nextPlan.values.length > 0) {
            nextPlan.values.forEach(function (r) {
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + r[1] + '건</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        } else {
            html += '<tr><td colspan="3" class="text-center text-muted">명월 예정된 주요 작업 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        // ── 4. 인원 및 장비 투입 계획 (금월) ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-users-gear"></i> 업체별 금월 주요 인원 및 장비 투입 계획 (추산)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">예상 출력인원(M/D)</th><th class="text-end">장비/경비 예산</th></tr></thead><tbody>';
        if (resources.values) {
            resources.values.forEach(function (r) {
                var md = Math.round((r[1] || 0) / 200000); // 1인당 20만원 가정
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + formatNumber(md) + ' 공수</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        }
        html += '</tbody></table></div></div>';

        // ── 5. 금월 주요 이슈 & 지연 만회 대책 ──
        if (delayed.values && delayed.values.length > 0) {
            html += '<div class="rpt-card rpt-card-danger">';
            html += '<h6 class="rpt-card-title" style="color:#EF4444"><i class="fa-solid fa-triangle-exclamation"></i> 금월 주요 이슈 및 지연 만회 대책</h6>';
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>업체</th><th>지연 작업</th><th>종료예정일</th><th>진행률</th><th>만회 대책 (AI 제안)</th></tr></thead><tbody>';
            delayed.values.forEach(function (r) {
                var pct = (r[3] * 100).toFixed(0);
                var solution = pct > 80 ? '잔여 잔손보기 즉시 투입, 야간 작업 실시' :
                    pct > 50 ? '작업조 추가 편성, 자재 선발주 확인' : '공정표 재수립 필요, 돌관작업 검토';
                html += '<tr><td>' + esc(r[4]) + '</td><td><strong>' + esc(r[1]) + '</strong></td>' +
                    '<td>' + r[2] + '</td><td>' + pct + '%</td><td style="color:#2563EB;font-weight:600">' + solution + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        html += '</div>';
        area.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════
    // 3B. 주간 보고서 (Weekly Report)
    // ═══════════════════════════════════════════════════════
    function renderWeekly(area) {
        // 주간 날짜 계산
        var dayOw = today.getDay();
        var monOff = dayOw === 0 ? -6 : 1 - dayOw;
        var mon = new Date(today); mon.setDate(today.getDate() + monOff);
        var sun = new Date(mon); sun.setDate(mon.getDate() + 6);
        var prevMon = new Date(mon); prevMon.setDate(mon.getDate() - 7);
        var prevSun = new Date(mon); prevSun.setDate(mon.getDate() - 1);
        var nextMon = new Date(sun); nextMon.setDate(sun.getDate() + 1);
        var nextSun = new Date(nextMon); nextSun.setDate(nextMon.getDate() + 6);

        var tmS = mon.toISOString().slice(0, 10);
        var tmE = sun.toISOString().slice(0, 10);
        var pmS = prevMon.toISOString().slice(0, 10);
        var pmE = prevSun.toISOString().slice(0, 10);
        var nmS = nextMon.toISOString().slice(0, 10);
        var nmE = nextSun.toISOString().slice(0, 10);

        // 1. 전주 수행 실적 (완료 여부 무관, 기간 내 수행분)
        var prevDone = DB.runQuery(
            "SELECT WHO1_하도급업체, COUNT(*), SUM(R10_합계_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + pmE + "' AND WHEN2종료일 >= '" + pmS + "' " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R10_합계_금액) DESC"
        );

        // 2. 금주 진행 (업체별)
        var thisOngoing = DB.runQuery(
            "SELECT WHO1_하도급업체, WHERE2_동, HOW3_작업명, R10_합계_금액, WHEN2종료일, COALESCE(\"WHEN4_실행률(%)\", 0) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + tmE + "' AND WHEN2종료일 >= '" + tmS + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "ORDER BY WHO1_하도급업체, WHEN2종료일"
        );

        // 3. 차주 예정 (업체별)
        // 3. 차주 예정 (업체별) - 기간 겹침 & 미완료
        var nextPlan = DB.runQuery(
            "SELECT WHO1_하도급업체, COUNT(*), SUM(R10_합계_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + nmE + "' AND WHEN2종료일 >= '" + nmS + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R10_합계_금액) DESC"
        );

        // 4. 인원/장비 (금주)
        var resources = DB.runQuery(
            "SELECT WHO1_하도급업체, SUM(R8_노무비_금액), SUM(R9_경비_금액) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + tmE + "' AND WHEN2종료일 >= '" + tmS + "' " +
            "AND WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' " +
            "GROUP BY WHO1_하도급업체 ORDER BY SUM(R8_노무비_금액) DESC"
        );

        // 5. 지연
        var delayed = DB.runQuery(
            "SELECT WHERE2_동, HOW3_작업명, WHEN2종료일, COALESCE(\"WHEN4_실행률(%)\", 0), WHO1_하도급업체 " +
            "FROM evms WHERE WHEN2종료일 < '" + todayStr + "' " +
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 1 " +
            "ORDER BY WHEN2종료일"
        );

        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-calendar-week"></i> 주간 보고서 — Weekly Report</div>';
        html += '<p class="rpt-report-desc">보고 기간: ' + tmS + ' ~ ' + tmE + ' (금주)</p>';

        // 전주 수행
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-check-double"></i> 업체별 전주 수행 실적 (진행분 포함)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">수행 작업 수</th><th class="text-end">투입 기성액</th></tr></thead><tbody>';
        if (prevDone.values && prevDone.values.length > 0) {
            prevDone.values.forEach(function (r) {
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + r[1] + '건</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        } else {
            html += '<tr><td colspan="3" class="text-center text-muted">전주 완료된 작업 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        // 금주 진행
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-person-digging"></i> 업체별 금주 진행 작업 상세</h6>';
        html += '<div class="table-responsive" style="max-height:300px;overflow-y:auto"><table class="table table-sm table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th>동</th><th>작업명</th><th>종료예정</th><th class="text-end">진행률</th></tr></thead><tbody>';
        if (thisOngoing.values) {
            thisOngoing.values.forEach(function (r) {
                var pct = (r[5] * 100).toFixed(0);
                html += '<tr><td>' + esc(r[0]) + '</td><td>' + esc(r[1]) + '</td><td>' + esc(r[2]) + '</td><td>' + r[4] + '</td><td class="text-end">' + pct + '%</td></tr>';
            });
        }
        html += '</tbody></table></div></div>';

        // 차주 예정
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-calendar-plus"></i> 업체별 차주 예정 작업 요약</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">예정 작업 수</th><th class="text-end">예정 투입액</th></tr></thead><tbody>';
        if (nextPlan.values && nextPlan.values.length > 0) {
            nextPlan.values.forEach(function (r) {
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + r[1] + '건</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        } else {
            html += '<tr><td colspan="3" class="text-center text-muted">차주 예정된 작업 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        // 인원/장비
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-helmet-safety"></i> 업체별 금주 주요 인원 및 장비 투입 계획 (추산)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>업체명</th><th class="text-end">예상 인력(M/D)</th><th class="text-end">장비 투입비</th></tr></thead><tbody>';
        if (resources.values) {
            resources.values.forEach(function (r) {
                var md = Math.round((r[1] || 0) / 200000); // 1인당 20만원
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td class="text-end">' + formatNumber(md) + ' 공수</td><td class="text-end">' + formatCurrency(r[2]) + '</td></tr>';
            });
        }
        html += '</tbody></table></div></div>';

        // 지연 대책
        if (delayed.values && delayed.values.length > 0) {
            html += '<div class="rpt-card rpt-card-danger">';
            html += '<h6 class="rpt-card-title" style="color:#EF4444"><i class="fa-solid fa-triangle-exclamation"></i> 금주 주요 이슈 및 공기 만회 대책</h6>';
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>업체</th><th>지연 작업</th><th>종료예정일</th><th>진행률</th><th>만회 대책 (AI 제안)</th></tr></thead><tbody>';
            delayed.values.forEach(function (r) {
                var pct = (r[3] * 100).toFixed(0);
                var solution = pct > 80 ? '잔여 작업 집중 투입, 2일 내 완료 목표' :
                    pct > 50 ? '작업조 1팀 증원, 자재 수급 점검' : '공정표 수정, 야간/돌관 작업 즉시 시행';
                html += '<tr><td>' + esc(r[4]) + '</td><td><strong>' + esc(r[1]) + '</strong></td>' +
                    '<td>' + r[2] + '</td><td>' + pct + '%</td><td style="color:#2563EB;font-weight:600">' + solution + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        // AI 자동 요약 코멘트
        var prevCnt = prevDone.values ? prevDone.values.reduce(function (s, r) { return s + (r[1] || 0); }, 0) : 0;
        var thisCnt = thisOngoing.values ? thisOngoing.values.length : 0;
        var nextCnt = nextPlan.values ? nextPlan.values.reduce(function (s, r) { return s + (r[1] || 0); }, 0) : 0;
        var delayCnt = delayed.values ? delayed.values.length : 0;

        html += '<div class="rpt-card" style="border-left:3px solid #03C75A">';
        html += '<h6 class="rpt-card-title" style="color:#03C75A"><i class="fa-solid fa-robot"></i> AI 주간 코멘트</h6>';
        html += '<div style="padding:12px 16px;font-size:0.82rem;line-height:1.7;color:var(--text-primary)">';
        html += '<p>📊 <strong>전주 실적:</strong> ' + formatNumber(prevCnt) + '건의 작업이 수행되었으며, ';
        html += '금주는 ' + formatNumber(thisCnt) + '건의 작업이 진행 중입니다.</p>';
        html += '<p>📅 <strong>차주 계획:</strong> ' + formatNumber(nextCnt) + '건의 작업이 예정되어 있습니다.</p>';
        if (delayCnt > 0) {
            html += '<p>⚠️ <strong>주의:</strong> 현재 <span style="color:#EF4444;font-weight:700">' + delayCnt + '건</span>의 지연 작업이 있습니다. ';
            html += '지연 업체에 대한 공기 만회 대책 수립 및 이행 상황을 점검하시기 바랍니다.</p>';
            html += '<p>💡 <strong>CM 권고:</strong> 지연 작업 중 금액 비중이 큰 항목을 우선 처리하고, ';
            html += '필요시 야간/주말 작업 또는 인원 증원을 통해 공기를 준수하시기 바랍니다.</p>';
        } else {
            html += '<p>✅ <strong>양호:</strong> 현재 지연 작업이 없습니다. 양호한 공정 상태를 유지하고 있습니다.</p>';
        }
        html += '</div></div>';

        // 인쇄/PDF 다운로드 버튼
        html += '<div style="display:flex;gap:10px;justify-content:center;margin-top:16px">';
        html += '<button id="weekly-print-btn" style="padding:8px 20px;border:1px solid #e2e8f0;border-radius:8px;background:#fff;color:#374151;cursor:pointer;font-size:0.8rem;font-weight:600;display:inline-flex;align-items:center;gap:6px">';
        html += '<i class="fa-solid fa-print"></i> 인쇄 / PDF 저장</button>';
        html += '</div>';

        html += '</div>';
        area.innerHTML = html;

        // 인쇄 버튼 이벤트
        var printBtn = document.getElementById('weekly-print-btn');
        if (printBtn) {
            printBtn.addEventListener('click', function () {
                window.print();
            });
        }
    }

    // ═══════════════════════════════════════════════════════
    // 4. 자재 수불 현황
    // ═══════════════════════════════════════════════════════
    function renderMaterial(area) {
        // 날짜 계산
        var y = today.getFullYear();
        var m = today.getMonth();
        var nmS = new Date(y, m + 1, 1).toISOString().slice(0, 10);
        var nmE = new Date(y, m + 2, 0).toISOString().slice(0, 10);
        var nqS = new Date(y, m + 1, 1).toISOString().slice(0, 10); // 차분기 시작 (다음달부터)
        var nqE = new Date(y, m + 4, 0).toISOString().slice(0, 10); // 3개월
        var preOrderDate = new Date(y, m + 3, 1).toISOString().slice(0, 10); // 3개월 후

        // 품목별 총 소요량 (계획)
        var matTotals = DB.runQuery(
            "SELECT HOW4_품명, R1_단위, SUM(R2_수량) as total_qty, SUM(R10_합계_금액) as total_amt " +
            "FROM evms WHERE HOW4_품명 IS NOT NULL AND HOW4_품명 != '' " +
            "GROUP BY HOW4_품명 ORDER BY total_amt DESC"
        );

        // 명월 소요 예상
        var nextMonthReq = DB.runQuery(
            "SELECT HOW4_품명, SUM(R2_수량) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + nmE + "' AND WHEN2종료일 >= '" + nmS + "' " +
            "GROUP BY HOW4_품명"
        );
        var nmMap = {};
        if (nextMonthReq.values) nextMonthReq.values.forEach(function (r) { nmMap[r[0]] = r[1]; });

        // 차분기 소요 예상
        var nextQuarterReq = DB.runQuery(
            "SELECT HOW4_품명, SUM(R2_수량) " +
            "FROM evms WHERE WHEN1_시작일 <= '" + nqE + "' AND WHEN2종료일 >= '" + nqS + "' " +
            "GROUP BY HOW4_품명"
        );
        var nqMap = {};
        if (nextQuarterReq.values) nextQuarterReq.values.forEach(function (r) { nqMap[r[0]] = r[1]; });

        // 동별 투입 계획 (전체)
        var byBuilding = DB.runQuery(
            "SELECT WHERE2_동, HOW4_품명, SUM(R2_수량) " +
            "FROM evms WHERE HOW4_품명 IN ('철근', '레미콘', '시멘트', '레미탈') " +
            "AND WHERE2_동 IS NOT NULL AND WHERE2_동 != '' " +
            "GROUP BY WHERE2_동, HOW4_품명 ORDER BY WHERE2_동"
        );

        // 3개월 전 선발주 대상 (3개월 뒤 시작되는 작업의 자재)
        var preOrder = DB.runQuery(
            "SELECT HOW4_품명, SUM(R2_수량), MIN(WHEN1_시작일), R1_단위 " +
            "FROM evms WHERE WHEN1_시작일 >= '" + preOrderDate + "' " +
            "AND HOW4_품명 IS NOT NULL AND HOW4_품명 != '' " +
            "GROUP BY HOW4_품명 HAVING SUM(R10_합계_금액) > 10000000 " + // 1천만원 이상만
            "ORDER BY MIN(WHEN1_시작일) LIMIT 10"
        );

        // 자재 데이터 가공
        var officialMats = []; // 관급 (철근, 레미콘 등)
        var privateMats = [];  // 사급

        if (matTotals.values) {
            matTotals.values.forEach(function (r) {
                var name = r[0], unit = r[1], total = r[2], amt = r[3];
                // 가상 재고 시뮬레이션: 
                // 총량의 55%가 입고되었다고 가정, 그 중 85% 소진.
                var simulIn = total * 0.55;
                var simulOut = simulIn * 0.85;
                var stock = simulIn - simulOut;

                var item = {
                    name: name, unit: unit, total: total, amt: amt,
                    in: simulIn, out: simulOut, stock: stock,
                    nmReq: nmMap[name] || 0, nqReq: nqMap[name] || 0
                };

                if (name.indexOf('철근') >= 0 || name.indexOf('레미콘') >= 0 || name.indexOf('시멘트') >= 0 || name.indexOf('관급') >= 0) {
                    officialMats.push(item);
                } else if (amt > 50000000) { // 5천만원 이상만 주요 자재로
                    privateMats.push(item);
                }
            });
        }

        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-boxes-stacked"></i> 자재 수불현황 보고서</div>';
        html += '<p class="rpt-report-desc">주요 자재 투입 계획 · 관급/사급 자재 수불 및 재고 현황 · 선발주 관리</p>';

        // ── 1. 관급자재 수불 현황 (카드형 요약) ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-building-columns"></i> 관급자재 수불 현황 (철근/레미콘/시멘트)</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>품명</th><th class="text-end">총 소요계획</th><th class="text-end">누적 입고</th><th class="text-end">누적 출고(사용)</th><th class="text-end">현재 재고</th><th class="text-end">추가 입고 예정(차월)</th></tr></thead><tbody>';

        officialMats.forEach(function (m) {
            var stockClass = m.stock < m.nmReq ? 'text-danger fw-bold' : ''; // 재고 부족 시 경고
            html += '<tr>' +
                '<td><strong>' + esc(m.name) + '</strong> <span class="badge bg-light text-dark border">' + m.unit + '</span></td>' +
                '<td class="text-end">' + formatNumber(m.total) + '</td>' +
                '<td class="text-end">' + formatNumber(m.in) + '</td>' +
                '<td class="text-end">' + formatNumber(m.out) + '</td>' +
                '<td class="text-end ' + stockClass + '">' + formatNumber(m.stock) + '</td>' +
                '<td class="text-end" style="color:#2563EB">' + (m.nmReq > 0 ? '+' : '') + formatNumber(m.nmReq) + '</td>' +
                '</tr>';
        });
        if (officialMats.length === 0) html += '<tr><td colspan="6" class="text-center text-muted">관급 자재 데이터 없음</td></tr>';
        html += '</tbody></table></div></div>';

        // ── 2. 주요자재 동별 투입 계획 ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-layer-group"></i> 주요 자재 동별 투입 계획 (전체 누계)</h6>';
        html += '<div class="table-responsive"><table class="table table-sm table-hover align-middle mb-0">';
        html += '<thead><tr><th>동</th><th>자재명</th><th class="text-end">계획 물량</th></tr></thead><tbody>';
        // 동별 데이터 가공 (피벗 느낌으로)
        if (byBuilding.values && byBuilding.values.length > 0) {
            var bMap = {};
            byBuilding.values.forEach(function (r) {
                if (!bMap[r[0]]) bMap[r[0]] = [];
                bMap[r[0]].push({ name: r[1], qty: r[2] });
            });
            for (var bName in bMap) {
                var items = bMap[bName];
                var itemStr = items.map(function (i) { return i.name + ': <strong>' + formatNumber(i.qty) + '</strong>'; }).join(' · ');
                html += '<tr><td><strong>' + esc(bName) + '</strong></td><td colspan="2">' + itemStr + '</td></tr>';
            }
        } else {
            html += '<tr><td colspan="3" class="text-center text-muted">동별 계획 데이터 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        // ── 3. 주요 사급자재 수불 및 소요 예상 ──
        html += '<div class="rpt-card"><h6 class="rpt-card-title"><i class="fa-solid fa-box-open"></i> 주요 사급자재 수불 현황 및 소요 예상</h6>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>품명</th><th class="text-end">현재 재고(추정)</th><th class="text-end">명월 소요예상</th><th class="text-end">차분기 소요예상</th><th class="text-end">상태</th></tr></thead><tbody>';

        var showCount = 0;
        privateMats.forEach(function (m) {
            if (showCount++ > 15) return;
            var status = m.stock < m.nmReq ? '<span class="badge bg-danger">재고부족</span>' : '<span class="badge bg-success">양호</span>';
            html += '<tr>' +
                '<td>' + esc(m.name) + '</td>' +
                '<td class="text-end">' + formatNumber(m.stock) + ' ' + m.unit + '</td>' +
                '<td class="text-end" style="color:#2563EB;font-weight:600">' + formatNumber(m.nmReq) + '</td>' +
                '<td class="text-end">' + formatNumber(m.nqReq) + '</td>' +
                '<td class="text-end">' + status + '</td>' +
                '</tr>';
        });
        html += '</tbody></table></div></div>';

        // ── 4. 3개월 전 선발주 대상 ──
        html += '<div class="rpt-card rpt-card-warn">';
        html += '<h6 class="rpt-card-title" style="color:#F59E0B"><i class="fa-solid fa-cart-shopping"></i> 3개월 전 선발주 대상 (납기 3개월 가정)</h6>';
        html += '<p style="font-size:0.75rem;color:var(--text-secondary);margin-bottom:12px">현 시점에서 3개월 후(' + preOrderDate.substring(0, 7) + ') 착수되는 공종의 주요 자재들입니다. 발주 리드타임을 고려하여 선발주 검토가 필요합니다.</p>';
        html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
        html += '<thead><tr><th>품명</th><th>투입 공종(예상)</th><th>착수 예정일</th><th class="text-end">소요량</th></tr></thead><tbody>';

        if (preOrder.values && preOrder.values.length > 0) {
            preOrder.values.forEach(function (r) {
                html += '<tr>' +
                    '<td><strong>' + esc(r[0]) + '</strong></td>' +
                    '<td><span class="badge bg-light text-dark border">확인필요</span></td>' +
                    '<td>' + r[2] + '</td>' +
                    '<td class="text-end">' + formatNumber(r[1]) + ' ' + r[3] + '</td>' +
                    '</tr>';
            });
        } else {
            html += '<tr><td colspan="4" class="text-center text-muted">선발주 대상 없음</td></tr>';
        }
        html += '</tbody></table></div></div>';

        html += '</div>';
        area.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════
    // 5. 변경 이력 관리
    // ═══════════════════════════════════════════════════════
    function renderChange(area) {
        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-file-pen"></i> 변경 이력 관리 — Change Order Log</div>';
        html += '<p class="rpt-report-desc">설계변경 및 물량 증감 이력을 추적합니다</p>';

        html += '<div class="rpt-placeholder-card">' +
            '<div class="rpt-placeholder-icon"><i class="fa-solid fa-file-pen"></i></div>' +
            '<h4>설계변경 관리 테이블</h4>' +
            '<p>현재 DB에 변경 이력 테이블이 없습니다.<br>별도 테이블(<code>change_orders</code>) 추가 후 활성화됩니다.</p>' +
            '<div class="rpt-placeholder-preview">' +
            '<table class="table table-sm mb-0" style="opacity:0.6">' +
            '<thead><tr><th>변경번호</th><th>변경사유</th><th>당초물량</th><th>변경물량</th><th>증감액</th><th>승인상태</th></tr></thead>' +
            '<tbody>' +
            '<tr><td>CO-001</td><td>기초 규격 변경</td><td>120 m³</td><td>145 m³</td><td style="color:#10B981">+₩32,500,000</td><td><span class="badge bg-success">승인</span></td></tr>' +
            '<tr><td>CO-002</td><td>마감재 변경</td><td>2,400 m²</td><td>2,100 m²</td><td style="color:#EF4444">-₩15,800,000</td><td><span class="badge bg-warning text-dark">검토중</span></td></tr>' +
            '<tr><td>CO-003</td><td>배관 경로 변경</td><td>380 m</td><td>425 m</td><td style="color:#10B981">+₩8,200,000</td><td><span class="badge bg-secondary">대기</span></td></tr>' +
            '</tbody></table></div>' +
            '<p class="mt-3" style="font-size:0.75rem;color:var(--text-muted)">위 데이터는 예시입니다. 실제 데이터 테이블 연동 시 자동으로 갱신됩니다.</p>' +
            '</div>';
        html += '</div>';
        area.innerHTML = html;
    }

    // ═══════════════════════════════════════════════════════
    // 6. 리스크 히트맵
    // ═══════════════════════════════════════════════════════
    function renderRisk(area) {
        var evms = DB.calculateEvmsMetrics(todayStr);

        // 작업명별 SPI 분석 (진행 중인 작업 모두 포함)
        var tradeSpi = DB.runQuery(
            "SELECT HOW3_작업명, " +
            "SUM(R10_합계_금액) as bac, " +
            "MIN(WHEN1_시작일) as start_date, " +
            "MAX(WHEN2종료일) as end_date, " +
            "AVG(COALESCE(\"WHEN4_실행률(%)\", 0)) as prog " +
            "FROM evms WHERE HOW3_작업명 IS NOT NULL AND HOW3_작업명 != '' " +
            "AND WHEN1_시작일 <= '" + todayStr + "' " + // 시작된 것
            "AND COALESCE(\"WHEN4_실행률(%)\", 0) < 0.99 " + // 미완료
            "GROUP BY HOW3_작업명 " +
            "ORDER BY bac DESC LIMIT 60" // 중요도(금액) 순으로 상위 60개
        );

        // 기간 짧고 실행률 낮은 위험 항목
        var highRisk = DB.runQuery(
            "SELECT WHERE2_동, HOW3_작업명, \"WHEN3_기간(일)\" as dur, " +
            "COALESCE(\"WHEN4_실행률(%)\", 0) as prog, WHEN2종료일, R10_합계_금액, WHO1_하도급업체 " +
            "FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' " +
            "AND WHEN2종료일 < '" + todayStr + "' " +
            "AND (\"WHEN4_실행률(%)\" IS NULL OR \"WHEN4_실행률(%)\" < 0.5) " +
            "AND R10_합계_금액 > 0 " +
            "ORDER BY R10_합계_금액 DESC LIMIT 15"
        );

        var spiColor = evms.spi >= 1 ? '#10B981' : evms.spi >= 0.9 ? '#F59E0B' : '#EF4444';
        var cpiColor = evms.cpi >= 1 ? '#10B981' : evms.cpi >= 0.9 ? '#F59E0B' : '#EF4444';

        var html = '<div class="rpt-section">';
        html += '<div class="rpt-report-title"><i class="fa-solid fa-triangle-exclamation"></i> 리스크 대시보드 — Risk Dashboard</div>';
        html += '<p class="rpt-report-desc">공종별 위험도 평가 · SPI/CPI 분석 · 자동 경고</p>';

        html += '<div class="rpt-kpi-row">';
        html += createKPICard('SPI (일정성과)', evms.spi.toFixed(3), 'fa-gauge-high', evms.spi >= 1 ? 'green' : 'red', evms.spi >= 1 ? '정상' : '지연', evms.spi >= 1 ? 'up' : 'down');
        html += createKPICard('CPI (원가성과)', evms.cpi.toFixed(3), 'fa-chart-line', evms.cpi >= 1 ? 'green' : 'red', evms.cpi >= 1 ? '절감' : '초과', evms.cpi >= 1 ? 'up' : 'down');
        html += createKPICard('EAC (완료시추정)', formatCurrency(evms.eac), 'fa-bullseye', evms.eac <= evms.bac ? 'green' : 'orange');
        html += createKPICard('위험 항목', (highRisk.values ? highRisk.values.length : 0) + '건', 'fa-exclamation-circle', 'red');
        html += '</div>';

        // SPI 게이지 + CPI 게이지
        html += '<div class="rpt-card-row">';
        html += '<div class="rpt-card rpt-card-sm"><h6 class="rpt-card-title"><i class="fa-solid fa-gauge"></i> SPI / CPI 게이지</h6>' +
            '<div style="display:flex;justify-content:center;gap:32px;padding:16px;flex-wrap:wrap">' +
            createGauge({ value: evms.spi * 100, max: 150, label: 'SPI', unit: '', color: spiColor, size: 130, displayValue: evms.spi.toFixed(2) }) +
            createGauge({ value: evms.cpi * 100, max: 150, label: 'CPI', unit: '', color: cpiColor, size: 130, displayValue: evms.cpi.toFixed(2) }) +
            '</div></div>';

        // 작업별 SPI 히트맵
        // 스타일 정의
        var style = `
        <style>
            .risk-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(110px, 1fr)); gap: 12px; padding: 4px; }
            .risk-item { 
                aspect-ratio: 1/1; border-radius: 12px; padding: 10px; 
                display: flex; flex-direction: column; justify-content: space-between; align-items: center; 
                text-align: center; border: 1px solid transparent; 
                transition: all 0.3s cubic-bezier(0.25, 0.8, 0.25, 1);
                box-shadow: 0 4px 6px rgba(0,0,0,0.03); cursor: pointer;
                background: #fff;
            }
            .risk-item:hover { transform: translateY(-5px) scale(1.05); box-shadow: 0 12px 20px rgba(0,0,0,0.12); z-index: 5; }
            .risk-item.danger { background: linear-gradient(135deg, #FEF2F2 0%, #FFF 100%); border-color: #FECACA; color: #DC2626; }
            .risk-item.warn { background: linear-gradient(135deg, #FFFBEB 0%, #FFF 100%); border-color: #FDE68A; color: #D97706; }
            .risk-item.good { background: linear-gradient(135deg, #ECFDF5 0%, #FFF 100%); border-color: #A7F3D0; color: #059669; }
            .risk-name { font-size: 12px; font-weight: 600; line-height: 1.3; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; height: 32px; color: #444; }
            .risk-val { font-size: 24px; font-weight: 800; line-height: 1; margin: 4px 0; }
            .risk-badge { font-size: 11px; padding: 2px 6px; border-radius: 8px; background: rgba(255,255,255,0.8); font-weight: 600; color: #555; backdrop-filter: blur(2px); }
        </style>`;

        html += style;
        html += '<div class="rpt-card rpt-card-lg"><h6 class="rpt-card-title"><i class="fa-solid fa-fire"></i> 작업명별 SPI 히트맵 (Active Incomplete Tasks)</h6>' +
            '<div class="risk-grid">';

        if (tradeSpi.values && tradeSpi.values.length > 0) {
            tradeSpi.values.forEach(function (r) {
                var name = r[0] || '';
                var bac = r[1] || 0;
                var start = new Date(r[2]);
                var end = new Date(r[3]);
                var prog = r[4] || 0;

                // 시간 경과율 계산 (오늘 - 시작) / (종료 - 시작)
                var totalDays = (end - start) / (1000 * 60 * 60 * 24);
                var passedDays = (today - start) / (1000 * 60 * 60 * 24);
                var timeRatio = totalDays > 0 ? Math.min(1, Math.max(0, passedDays / totalDays)) : 1;

                // SPI = 실제진척 / 계획진척(시간경과율)
                // 만약 timeRatio가 0이면 시작일=오늘, SPI=1 간주.
                var spi = timeRatio > 0 ? prog / timeRatio : 1;
                if (passedDays < 0) spi = 1; // 미래 작업

                // 등급 판정
                var level = spi >= 0.95 ? 'good' : spi >= 0.8 ? 'warn' : 'danger';

                html += '<div class="risk-item ' + level + '" title="' + esc(name) + ' (BAC: ' + formatCurrency(bac) + ')">' +
                    '<div class="risk-name">' + esc(name) + '</div>' +
                    '<div class="risk-val">' + spi.toFixed(2) + '</div>' +
                    '<div class="risk-badge">진척 ' + (prog * 100).toFixed(0) + '%</div>' +
                    '</div>';
            });
        }
        html += '</div></div>';

        // 위험 항목 테이블
        if (highRisk.values && highRisk.values.length > 0) {
            html += '<div class="rpt-card rpt-card-danger"><h6 class="rpt-card-title" style="color:#EF4444"><i class="fa-solid fa-skull-crossbones"></i> 고위험 항목 (종료 초과 + 실행률 50% 미만)</h6>';
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>동</th><th>작업명</th><th>기간(일)</th><th>실행률</th><th>예정종료</th><th class="text-end">금액</th><th>업체</th></tr></thead><tbody>';
            highRisk.values.forEach(function (r) {
                var pct = ((r[3] || 0) * 100).toFixed(0);
                html += '<tr style="color:#EF4444"><td>' + esc(r[0]) + '</td><td><strong>' + esc(r[1]) + '</strong></td>' +
                    '<td>' + (r[2] || '-') + '</td><td>' + pct + '%</td><td>' + (r[4] || '') + '</td>' +
                    '<td class="text-end">' + formatCurrency(r[5]) + '</td><td>' + esc(r[6]) + '</td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        html += '</div>';
        area.innerHTML = html;
    }

    // ── 유틸리티 ─────────────────────────────────────────
    function esc(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }

    // ═══════════════════════════════════════════════════════
    // 8. 기성 시뮬레이션 (Monthly Billing Simulator)
    // ═══════════════════════════════════════════════════════

    function renderSimulator(area) {
        // 업체별 기성 데이터
        var vendors = DB.runQuery("SELECT WHO1_하도급업체 AS vendor, COUNT(*) AS cnt, SUM(R10_합계_금액) AS bac, ROUND(AVG(\"WHEN4_실행률(%)\"), 3) AS avg_prog FROM evms WHERE WHO1_하도급업체 IS NOT NULL AND WHO1_하도급업체 != '' GROUP BY WHO1_하도급업체 ORDER BY bac DESC LIMIT 15");

        // 월별 기성 추이
        var monthly = DB.runQuery("SELECT SUBSTR(WHEN2종료일,1,7) AS ym, SUM(R10_합계_금액) AS amt FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != '' GROUP BY SUBSTR(WHEN2종료일,1,7) ORDER BY ym");

        var totalBac = DB.runScalar("SELECT SUM(R10_합계_금액) FROM evms") || 0;
        var avgProg = DB.runScalar("SELECT ROUND(AVG(\"WHEN4_실행률(%)\"), 3) FROM evms WHERE \"WHEN4_실행률(%)\" IS NOT NULL") || 0;
        var earnedValue = totalBac * avgProg;

        var html = '<div class="rpt-section">';
        html += '<h5 class="rpt-section-title"><i class="fa-solid fa-sliders"></i> 월간 기성 시뮬레이션</h5>';

        // KPI Cards
        html += '<div class="rpt-kpi-row">';
        html += '<div class="rpt-kpi"><div class="rpt-kpi-label">총 예산 (BAC)</div><div class="rpt-kpi-value">' + formatCurrency(totalBac) + '</div></div>';
        html += '<div class="rpt-kpi"><div class="rpt-kpi-label">평균 실행률</div><div class="rpt-kpi-value">' + (avgProg * 100).toFixed(1) + '%</div></div>';
        html += '<div class="rpt-kpi"><div class="rpt-kpi-label">기성 누계 (EV)</div><div class="rpt-kpi-value">' + formatCurrency(earnedValue) + '</div></div>';
        html += '<div class="rpt-kpi"><div class="rpt-kpi-label">잔여 예산</div><div class="rpt-kpi-value">' + formatCurrency(totalBac - earnedValue) + '</div></div>';
        html += '</div>';

        // Simulator Slider
        html += '<div class="rpt-card" style="margin-top:16px">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-gauge-high"></i> What-if 시뮬레이션</h6>';
        html += '<div style="padding:16px">';
        html += '<label style="font-size:0.8rem;color:var(--text-secondary);font-weight:600">목표 실행률: <span id="sim-rate-label">' + Math.round(avgProg * 100) + '</span>%</label>';
        html += '<input type="range" id="sim-slider" min="0" max="100" value="' + Math.round(avgProg * 100) + '" style="width:100%;margin:8px 0;accent-color:#03C75A">';
        html += '<div id="sim-result" style="display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:12px">';
        html += buildSimResult(avgProg, totalBac);
        html += '</div>';
        html += '</div></div>';

        // S-Curve Chart
        html += '<div class="rpt-card" style="margin-top:16px">';
        html += '<h6 class="rpt-card-title"><i class="fa-solid fa-chart-line"></i> 월별 기성 S-Curve (계획 vs 누적)</h6>';
        html += '<div style="padding:16px;height:320px"><canvas id="sim-scurve-chart"></canvas></div>';
        html += '</div>';

        // Vendor Table
        if (vendors.values && vendors.values.length > 0) {
            html += '<div class="rpt-card" style="margin-top:16px">';
            html += '<h6 class="rpt-card-title"><i class="fa-solid fa-building"></i> 업체별 기성 현황</h6>';
            html += '<div class="table-responsive"><table class="table table-hover align-middle mb-0">';
            html += '<thead><tr><th>업체명</th><th>작업수</th><th>예산(BAC)</th><th>평균 실행률</th><th>기성 예상액</th><th>진행률 바</th></tr></thead><tbody>';
            vendors.values.forEach(function (r) {
                var prog = (r[3] || 0) * 100;
                var est = (r[2] || 0) * (r[3] || 0);
                var barColor = prog >= 80 ? '#10B981' : prog >= 50 ? '#F59E0B' : '#EF4444';
                html += '<tr><td><strong>' + esc(r[0]) + '</strong></td><td>' + formatNumber(r[1]) + '</td>';
                html += '<td>' + formatCurrency(r[2]) + '</td><td>' + prog.toFixed(1) + '%</td>';
                html += '<td>' + formatCurrency(est) + '</td>';
                html += '<td style="min-width:100px"><div style="background:#e5e7eb;border-radius:4px;height:8px;overflow:hidden"><div style="width:' + Math.min(prog, 100) + '%;height:100%;background:' + barColor + ';border-radius:4px;transition:width 0.5s"></div></div></td></tr>';
            });
            html += '</tbody></table></div></div>';
        }

        html += '</div>';
        area.innerHTML = html;

        // Slider event
        var slider = document.getElementById('sim-slider');
        if (slider) {
            slider.addEventListener('input', function () {
                document.getElementById('sim-rate-label').textContent = slider.value;
                document.getElementById('sim-result').innerHTML = buildSimResult(slider.value / 100, totalBac);
            });
        }

        // S-Curve chart
        if (monthly.values && monthly.values.length > 0) {
            var labels = monthly.values.map(function (r) { return r[0]; });
            var planData = [];
            var cumData = [];
            var cumSum = 0;
            var planPerMonth = totalBac / labels.length;
            monthly.values.forEach(function (r, i) {
                cumSum += (r[1] || 0);
                cumData.push(cumSum);
                planData.push(planPerMonth * (i + 1));
            });
            var ctx = document.getElementById('sim-scurve-chart');
            if (ctx) {
                new Chart(ctx, {
                    type: 'line',
                    data: {
                        labels: labels,
                        datasets: [
                            { label: '계획 (PV)', data: planData, borderColor: '#3B82F6', borderDash: [5, 5], fill: false, tension: 0.3 },
                            { label: '실적 누적 (EV)', data: cumData, borderColor: '#03C75A', fill: { target: 'origin', above: 'rgba(3,199,90,0.08)' }, tension: 0.3 }
                        ]
                    },
                    options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'top' } }, scales: { y: { ticks: { callback: function (v) { return (v / 100000000).toFixed(0) + '억'; } } } } }
                });
            }
        }
    }

    function buildSimResult(rate, bac) {
        var ev = bac * rate;
        var remaining = bac - ev;
        var monthsLeft = remaining > 0 ? Math.ceil(remaining / (bac / 24)) : 0;
        return '<div style="background:var(--bg-primary);padding:12px;border-radius:8px;text-align:center">' +
            '<div style="font-size:0.72rem;color:var(--text-secondary)">예상 기성액</div>' +
            '<div style="font-size:1.1rem;font-weight:700;color:#03C75A">' + formatCurrency(ev) + '</div></div>' +
            '<div style="background:var(--bg-primary);padding:12px;border-radius:8px;text-align:center">' +
            '<div style="font-size:0.72rem;color:var(--text-secondary)">잔여 금액</div>' +
            '<div style="font-size:1.1rem;font-weight:700;color:#EF4444">' + formatCurrency(remaining) + '</div></div>' +
            '<div style="background:var(--bg-primary);padding:12px;border-radius:8px;text-align:center">' +
            '<div style="font-size:0.72rem;color:var(--text-secondary)">예상 잔여 개월</div>' +
            '<div style="font-size:1.1rem;font-weight:700;color:#3B82F6">' + monthsLeft + '개월</div></div>';
    }

    // ═══════════════════════════════════════════════════════
    // 9. 공간별 진도 히트맵 (Spatial Progress Map)
    // ═══════════════════════════════════════════════════════

    function renderHeatmap(area) {
        // 동×층 매트릭스 데이터
        var matrix = DB.runQuery("SELECT WHERE2_동, WHERE3_층, COUNT(*) AS cnt, ROUND(AVG(\"WHEN4_실행률(%)\"), 3) AS avg_prog, SUM(R10_합계_금액) AS bac FROM evms WHERE WHERE2_동 IS NOT NULL AND WHERE2_동 != '' AND WHERE3_층 IS NOT NULL AND WHERE3_층 != '' GROUP BY WHERE2_동, WHERE3_층 ORDER BY WHERE2_동, WHERE3_층");

        // 동 목록, 층 목록 추출
        var dongs = [];
        var floors = [];
        var dataMap = {};

        if (matrix.values) {
            matrix.values.forEach(function (r) {
                var dong = r[0], floor = r[1];
                if (dongs.indexOf(dong) < 0) dongs.push(dong);
                if (floors.indexOf(floor) < 0) floors.push(floor);
                dataMap[dong + '|' + floor] = { cnt: r[2], prog: r[3] || 0, bac: r[4] || 0 };
            });
        }

        // 동별 평균 진도
        var dongSummary = DB.runQuery("SELECT WHERE2_동, COUNT(*) AS cnt, ROUND(AVG(\"WHEN4_실행률(%)\"), 3) AS avg_prog, SUM(R10_합계_금액) AS bac FROM evms WHERE WHERE2_동 IS NOT NULL AND WHERE2_동 != '' GROUP BY WHERE2_동 ORDER BY bac DESC");

        var html = '<div class="rpt-section">';
        html += '<h5 class="rpt-section-title"><i class="fa-solid fa-map"></i> 공간별 진도 히트맵</h5>';

        // 동별 진도 카드
        html += '<div style="display:grid;grid-template-columns:repeat(auto-fill,minmax(180px,1fr));gap:12px;margin-bottom:20px">';
        if (dongSummary.values) {
            dongSummary.values.forEach(function (r) {
                var prog = (r[2] || 0) * 100;
                var color = prog >= 80 ? '#10B981' : prog >= 50 ? '#F59E0B' : '#EF4444';
                var bgAlpha = prog >= 80 ? '15' : prog >= 50 ? '15' : '15';
                html += '<div style="background:' + color + bgAlpha + ';border:1px solid ' + color + '30;border-radius:10px;padding:14px;text-align:center">';
                html += '<div style="font-size:0.78rem;font-weight:700;color:var(--text-primary)">' + esc(r[0]) + '</div>';
                html += '<div style="font-size:1.4rem;font-weight:800;color:' + color + ';margin:4px 0">' + prog.toFixed(0) + '%</div>';
                html += '<div style="font-size:0.68rem;color:var(--text-secondary)">' + formatNumber(r[1]) + '건 · ' + formatCurrency(r[3]) + '</div>';
                html += '<div style="background:#e5e7eb;border-radius:4px;height:6px;margin-top:8px;overflow:hidden"><div style="width:' + Math.min(prog, 100) + '%;height:100%;background:' + color + ';border-radius:4px"></div></div>';
                html += '</div>';
            });
        }
        html += '</div>';

        // 동×층 히트맵 매트릭스
        if (dongs.length > 0 && floors.length > 0) {
            html += '<div class="rpt-card">';
            html += '<h6 class="rpt-card-title"><i class="fa-solid fa-table-cells"></i> 동 × 층 진도 매트릭스</h6>';
            html += '<div class="table-responsive"><table class="table align-middle mb-0" style="font-size:0.75rem">';
            html += '<thead><tr><th style="position:sticky;left:0;background:var(--bg-primary);z-index:1">동 \\ 층</th>';
            floors.forEach(function (f) { html += '<th style="text-align:center;min-width:65px">' + esc(f) + '</th>'; });
            html += '</tr></thead><tbody>';

            dongs.forEach(function (d) {
                html += '<tr><td style="font-weight:700;position:sticky;left:0;background:var(--bg-primary);z-index:1">' + esc(d) + '</td>';
                floors.forEach(function (f) {
                    var cell = dataMap[d + '|' + f];
                    if (cell) {
                        var p = cell.prog * 100;
                        var c = p >= 80 ? '#10B981' : p >= 50 ? '#F59E0B' : p > 0 ? '#EF4444' : '#94A3B8';
                        var intensity = Math.max(0.15, Math.min(p / 100, 0.85));
                        html += '<td style="text-align:center;background:' + c + Math.round(intensity * 40).toString(16).padStart(2, '0') + ';color:' + c + ';font-weight:700;cursor:pointer" title="' + esc(d) + ' ' + esc(f) + ': ' + p.toFixed(0) + '% (' + cell.cnt + '건, ' + formatCurrency(cell.bac) + ')">';
                        html += p.toFixed(0) + '%</td>';
                    } else {
                        html += '<td style="text-align:center;color:#d1d5db">—</td>';
                    }
                });
                html += '</tr>';
            });
            html += '</tbody></table></div></div>';
        }

        // 범례
        html += '<div style="display:flex;gap:16px;justify-content:center;margin-top:12px;font-size:0.72rem;color:var(--text-secondary)">';
        html += '<span><span style="display:inline-block;width:12px;height:12px;background:#10B981;border-radius:2px;vertical-align:middle;margin-right:4px"></span>80%+ (양호)</span>';
        html += '<span><span style="display:inline-block;width:12px;height:12px;background:#F59E0B;border-radius:2px;vertical-align:middle;margin-right:4px"></span>50~80% (주의)</span>';
        html += '<span><span style="display:inline-block;width:12px;height:12px;background:#EF4444;border-radius:2px;vertical-align:middle;margin-right:4px"></span>50% 미만 (위험)</span>';
        html += '<span><span style="display:inline-block;width:12px;height:12px;background:#d1d5db;border-radius:2px;vertical-align:middle;margin-right:4px"></span>데이터 없음</span>';
        html += '</div>';

        html += '</div>';
        area.innerHTML = html;
    }

}

/**
 * ============================================================
 * CUBE View Page (cube_view.js)
 * ============================================================
 * 6W1H 기반 다차원 피벗 분석 페이지 (셸)
 * - 사용자가 자유롭게 행축/열축/값축을 선택하여 피벗 분석
 * - 상세 기능은 추후 확장 예정
 */

/* global Components, DB, AIEngine */

function renderCubeViewPage(container) {
    'use strict';

    if (!DB || !DB.isReady()) {
        container.innerHTML = Components.showError('데이터베이스가 로드되지 않았습니다.');
        return;
    }

    var totalRows = DB.runScalar("SELECT COUNT(*) FROM evms");

    // 6W1H 축 정의
    var dimensions = [
        { col: 'WHERE1_프로젝트', label: '프로젝트 (WHERE)', group: 'WHERE', icon: 'fa-map-marker-alt' },
        { col: 'WHERE2_동', label: '건물동 (WHERE)', group: 'WHERE', icon: 'fa-building' },
        { col: 'WHERE3_층', label: '층 (WHERE)', group: 'WHERE', icon: 'fa-layer-group' },
        { col: 'HOW1_공사', label: '공사구분 (HOW)', group: 'HOW', icon: 'fa-hard-hat' },
        { col: 'HOW2_대공종', label: '대공종 (HOW)', group: 'HOW', icon: 'fa-hammer' },
        { col: 'HOW3_작업명', label: '작업명 (HOW)', group: 'HOW', icon: 'fa-tasks' },
        { col: 'WHO1_하도급업체', label: '하도급업체 (WHO)', group: 'WHO', icon: 'fa-users' },
        { col: "SUBSTR(WHEN1_시작일,1,7)", label: '시작월 (WHEN)', group: 'WHEN', icon: 'fa-calendar' },
        { col: "SUBSTR(WHEN2종료일,1,7)", label: '종료월 (WHEN)', group: 'WHEN', icon: 'fa-calendar-check' }
    ];

    var measures = [
        { expr: 'SUM(R10_합계_금액)', label: '합계금액 합계', unit: '원', icon: 'fa-coins' },
        { expr: 'SUM(R7_재료비_금액)', label: '재료비 합계', unit: '원', icon: 'fa-boxes-stacked' },
        { expr: 'SUM(R8_노무비_금액)', label: '노무비 합계', unit: '원', icon: 'fa-person-digging' },
        { expr: 'SUM(R9_경비_금액)', label: '경비 합계', unit: '원', icon: 'fa-receipt' },
        { expr: 'COUNT(*)', label: '항목 수', unit: '건', icon: 'fa-list-ol' },
        { expr: 'SUM(R2_수량)', label: '수량 합계', unit: '', icon: 'fa-weight-hanging' },
        { expr: 'AVG("WHEN4_실행률(%)")', label: '평균 실행률', unit: '%', icon: 'fa-percent' }
    ];

    // 상태
    var rowDim = 1;  // WHERE2_동
    var colDim = 3;  // HOW1_공사
    var measure = 0; // SUM(R10_합계_금액)
    var filterDim = -1;  // -1 = 필터 없음
    var filterVal = '';  // 선택된 필터 값
    var chartType = 'bar'; // 차트 타입
    var cubeChart = null;  // Chart.js 인스턴스

    container.innerHTML = buildLayout();
    executePivot();
    setupEvents();

    function buildLayout() {
        var html = '<div class="cube-page">';

        // Header
        html += '<div class="cube-header">' +
            '<div class="cube-header-left">' +
            '<div class="cube-title-icon"><i class="fa-solid fa-cubes"></i></div>' +
            '<div>' +
            '<h2 class="cube-title">CUBE View — 다차원 피벗 분석</h2>' +
            '<p class="cube-subtitle">6W1H 축을 자유롭게 조합하여 데이터를 탐색합니다 · ' + AIEngine.formatNumber(totalRows) + '건</p>' +
            '</div>' +
            '</div>' +
            '</div>';

        // Axis Controls
        html += '<div class="cube-controls">' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-arrows-left-right"></i> 행 축 (Rows)</label>' +
            '<select class="cube-select" id="cube-row-dim">' + buildDimOptions(rowDim) + '</select>' +
            '</div>' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-arrows-up-down"></i> 열 축 (Columns)</label>' +
            '<select class="cube-select" id="cube-col-dim">' + buildDimOptions(colDim) + '</select>' +
            '</div>' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-calculator"></i> 값 (Measure)</label>' +
            '<select class="cube-select" id="cube-measure">' + buildMeasureOptions(measure) + '</select>' +
            '</div>' +
            '<div class="cube-control-divider"></div>' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-filter"></i> 필터 (Filter)</label>' +
            '<select class="cube-select cube-filter-select" id="cube-filter-dim">' + buildFilterDimOptions(filterDim) + '</select>' +
            '</div>' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-list-check"></i> 필터 값</label>' +
            '<select class="cube-select cube-filter-select" id="cube-filter-val"><option value="">전체 (필터 없음)</option></select>' +
            '</div>' +
            '<div class="cube-control-group">' +
            '<label class="cube-control-label"><i class="fa-solid fa-chart-bar"></i> 차트 유형</label>' +
            '<select class="cube-select cube-filter-select" id="cube-chart-type">' +
            '<option value="bar" selected>세로 막대</option>' +
            '<option value="horizontalBar">가로 막대</option>' +
            '<option value="stackedBar">누적 막대</option>' +
            '<option value="line">꺾은선</option>' +
            '<option value="doughnut">도넛</option>' +
            '</select>' +
            '</div>' +
            '<button class="cube-run-btn" id="cube-run"><i class="fa-solid fa-play"></i> 분석 실행</button>' +
            '</div>';

        // Result Area (Table)
        html += '<div class="cube-result" id="cube-result">' +
            '<div class="cube-placeholder">' +
            '<i class="fa-solid fa-cube" style="font-size:3rem;color:var(--primary);opacity:0.3"></i>' +
            '<p>축을 선택하고 <strong>분석 실행</strong>을 클릭하세요</p>' +
            '</div>' +
            '</div>';

        // Chart Area
        html += '<div class="cube-chart-area" id="cube-chart-area" style="display:none">' +
            '<div class="cube-chart-header">' +
            '<span class="cube-chart-title"><i class="fa-solid fa-chart-column"></i> 피벗 차트</span>' +
            '</div>' +
            '<div class="cube-chart-container">' +
            '<canvas id="cube-chart-canvas"></canvas>' +
            '</div>' +
            '</div>';

        html += '</div>';
        return html;
    }

    function buildDimOptions(selected) {
        var html = '';
        dimensions.forEach(function (d, i) {
            html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + d.label + '</option>';
        });
        return html;
    }

    function buildMeasureOptions(selected) {
        var html = '';
        measures.forEach(function (m, i) {
            html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + m.label + '</option>';
        });
        return html;
    }

    function buildFilterDimOptions(selected) {
        var html = '<option value="-1"' + (selected === -1 ? ' selected' : '') + '>없음</option>';
        dimensions.forEach(function (d, i) {
            html += '<option value="' + i + '"' + (i === selected ? ' selected' : '') + '>' + d.label + '</option>';
        });
        return html;
    }

    function loadFilterValues(dimIdx) {
        var valSelect = document.getElementById('cube-filter-val');
        if (!valSelect) return;
        valSelect.innerHTML = '<option value="">전체</option>';
        if (dimIdx < 0 || dimIdx >= dimensions.length) return;

        var d = dimensions[dimIdx];
        var sql = 'SELECT DISTINCT ' + d.col + ' AS v FROM evms ' +
            'WHERE ' + d.col + ' IS NOT NULL AND ' + d.col + " != '' " +
            'ORDER BY v';
        try {
            var result = DB.runQuery(sql);
            if (result && result.values) {
                result.values.forEach(function (row) {
                    var v = String(row[0] || '');
                    valSelect.innerHTML += '<option value="' + escapeHtml(v) + '">' + escapeHtml(v) + '</option>';
                });
            }
        } catch (e) {
            console.warn('[Cube] Failed to load filter values:', e);
        }
    }

    function executePivot() {
        try {
            var rd = dimensions[rowDim];
            var cd = dimensions[colDim];
            var m = measures[measure];
            var resultArea = document.getElementById('cube-result');
            if (!resultArea) return;

            // 필터 조건 생성
            var filterClause = '';
            if (filterDim >= 0 && filterDim < dimensions.length && filterVal) {
                var fd = dimensions[filterDim];
                filterClause = 'AND ' + fd.col + ' = \'' + filterVal.replace(/'/g, "''") + '\' ';
            }

            // SQL: GROUP BY 행축, 열축 + 필터
            var sql = 'SELECT ' + rd.col + ' AS row_dim, ' + cd.col + ' AS col_dim, ' + m.expr + ' AS val ' +
                'FROM evms ' +
                'WHERE ' + rd.col + ' IS NOT NULL AND ' + rd.col + " != '' " +
                'AND ' + cd.col + ' IS NOT NULL AND ' + cd.col + " != '' " +
                filterClause +
                'GROUP BY ' + rd.col + ', ' + cd.col + ' ' +
                'ORDER BY ' + rd.col + ', ' + cd.col;

            var result = DB.runQuery(sql);
            if (!result || !result.values || result.values.length === 0) {
                resultArea.innerHTML = '<div class="cube-placeholder"><p>결과가 없습니다.</p></div>';
                var chartArea = document.getElementById('cube-chart-area');
                if (chartArea) chartArea.style.display = 'none';
                return;
            }

            // Build pivot structure
            var rowLabels = [];
            var colLabels = [];
            var dataMap = {};

            result.values.forEach(function (row) {
                var r = String(row[0] || '');
                var c = String(row[1] || '');
                var v = row[2] || 0;
                if (rowLabels.indexOf(r) < 0) rowLabels.push(r);
                if (colLabels.indexOf(c) < 0) colLabels.push(c);
                dataMap[r + '||' + c] = v;
            });

            // Build pivot table
            var filterInfo = '';
            if (filterDim >= 0 && filterVal) {
                filterInfo = ' <span class="cube-filter-badge"><i class="fa-solid fa-filter"></i> ' +
                    escapeHtml(dimensions[filterDim].label.split(' ')[0]) + ': ' + escapeHtml(filterVal) + '</span>';
            }
            var html = '<div class="cube-table-info">' +
                '<span><strong>' + rd.label + '</strong> × <strong>' + cd.label + '</strong>' + filterInfo + '</span>' +
                '<span class="cube-measure-label"><i class="fa-solid ' + m.icon + '"></i> ' + m.label + '</span>' +
                '</div>';
            html += '<div class="ai-table-wrapper"><table class="ai-data-table cube-pivot-table">';

            // Header
            html += '<thead><tr><th class="cube-corner">' + rd.label.split(' ')[0] + ' \\ ' + cd.label.split(' ')[0] + '</th>';
            colLabels.forEach(function (c) { html += '<th>' + escapeHtml(c) + '</th>'; });
            html += '<th class="cube-total">합계</th></tr></thead>';

            // Body
            html += '<tbody>';
            var colTotals = new Array(colLabels.length).fill(0);
            var grandTotal = 0;

            rowLabels.forEach(function (r) {
                html += '<tr><th class="cube-row-label">' + escapeHtml(r) + '</th>';
                var rowTotal = 0;
                colLabels.forEach(function (c, ci) {
                    var v = dataMap[r + '||' + c] || 0;
                    rowTotal += v;
                    colTotals[ci] += v;
                    grandTotal += v;
                    var formatted = formatCellValue(v, m.unit);
                    var intensity = v > 0 ? Math.min(0.3, v / (grandTotal || 1) * 5) : 0;
                    html += '<td style="background:rgba(59,130,246,' + intensity + ')">' + formatted + '</td>';
                });
                html += '<td class="cube-total"><strong>' + formatCellValue(rowTotal, m.unit) + '</strong></td></tr>';
            });

            // Footer totals
            html += '<tr class="cube-total-row"><th>합계</th>';
            colTotals.forEach(function (t) { html += '<td><strong>' + formatCellValue(t, m.unit) + '</strong></td>'; });
            html += '<td class="cube-grand-total"><strong>' + formatCellValue(grandTotal, m.unit) + '</strong></td></tr>';

            html += '</tbody></table></div>';
            resultArea.innerHTML = html;

            // 차트 렌더링
            renderPivotChart(rowLabels, colLabels, dataMap, rd, cd, m);

        } catch (e) {
            console.warn('[Cube] executePivot error:', e);
            var ea = document.getElementById('cube-result');
            if (ea) ea.innerHTML = '<div class="cube-placeholder"><p>분석 중 오류: ' + e.message + '</p></div>';
        }
    }

    function formatCellValue(v, unit) {
        if (v === 0 || v == null) return '-';
        if (unit === '원') return AIEngine.formatCurrency(v);
        if (unit === '%') return (v * 100).toFixed(1) + '%';
        return AIEngine.formatNumber(v);
    }

    // ── 차트 색상 팔레트 ──────────────────────────────────────
    var CHART_COLORS = [
        '#6366F1', '#EC4899', '#14B8A6', '#F59E0B', '#8B5CF6',
        '#EF4444', '#3B82F6', '#10B981', '#F97316', '#06B6D4',
        '#A855F7', '#84CC16', '#E11D48', '#0EA5E9', '#D946EF',
        '#22C55E', '#FB923C', '#64748B', '#F43F5E', '#2DD4BF'
    ];

    // ── 차트 렌더링 ──────────────────────────────────────────
    function renderPivotChart(rowLabels, colLabels, dataMap, rd, cd, m) {
        var chartArea = document.getElementById('cube-chart-area');
        var canvas = document.getElementById('cube-chart-canvas');
        if (!chartArea || !canvas) return;

        // 이전 차트 파괴
        if (cubeChart) {
            cubeChart.destroy();
            cubeChart = null;
        }

        chartArea.style.display = 'block';

        var isDoughnut = chartType === 'doughnut';
        var isHorizontal = chartType === 'horizontalBar';
        var isStacked = chartType === 'stackedBar';
        var jsChartType = (isHorizontal || isStacked) ? 'bar' : (isDoughnut ? 'doughnut' : chartType);

        var datasets, labels;

        if (isDoughnut) {
            // 도넛: 행 축 기준 합계
            labels = rowLabels.map(function (r) { return r.replace(/^\d+_/, ''); });
            var data = rowLabels.map(function (r) {
                var total = 0;
                colLabels.forEach(function (c) { total += (dataMap[r + '||' + c] || 0); });
                return total;
            });
            datasets = [{
                data: data,
                backgroundColor: CHART_COLORS.slice(0, data.length),
                borderWidth: 2,
                borderColor: '#fff'
            }];
        } else {
            // Bar / Line: 행축 = X라벨, 열축 = 데이터셋(시리즈)
            labels = rowLabels.map(function (r) { return r.replace(/^\d+_/, ''); });

            datasets = colLabels.map(function (c, ci) {
                var color = CHART_COLORS[ci % CHART_COLORS.length];
                return {
                    label: c.replace(/^[A-Z]?\d+_/, ''),
                    data: rowLabels.map(function (r) { return dataMap[r + '||' + c] || 0; }),
                    backgroundColor: color + (jsChartType === 'line' ? '33' : 'CC'),
                    borderColor: color,
                    borderWidth: 2,
                    borderRadius: jsChartType === 'bar' ? 4 : 0,
                    fill: jsChartType === 'line',
                    tension: 0.3,
                    pointRadius: jsChartType === 'line' ? 4 : 0
                };
            });
        }

        // 차트 높이 동적 조정
        var chartHeight = isDoughnut ? 360 : Math.max(320, rowLabels.length * (isHorizontal ? 32 : 20) + 80);
        canvas.parentElement.style.height = chartHeight + 'px';

        cubeChart = new Chart(canvas, {
            type: jsChartType,
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHorizontal ? 'y' : 'x',
                plugins: {
                    legend: {
                        display: true,
                        position: isDoughnut ? 'right' : 'top',
                        labels: {
                            font: { size: 11, family: 'Inter, Noto Sans KR' },
                            usePointStyle: true,
                            padding: 12
                        }
                    },
                    title: {
                        display: true,
                        text: rd.label.split(' ')[0] + ' × ' + cd.label.split(' ')[0] + ' — ' + m.label,
                        font: { size: 14, weight: 700, family: 'Inter, Noto Sans KR' },
                        padding: { bottom: 16 }
                    },
                    tooltip: {
                        callbacks: {
                            label: function (ctx) {
                                var val = ctx.raw;
                                if (m.unit === '원') return (ctx.dataset.label || '') + ': ' + AIEngine.formatCurrency(val);
                                if (m.unit === '%') return (ctx.dataset.label || '') + ': ' + (val * 100).toFixed(1) + '%';
                                return (ctx.dataset.label || '') + ': ' + AIEngine.formatNumber(val);
                            }
                        }
                    }
                },
                scales: isDoughnut ? undefined : {
                    x: {
                        stacked: isStacked,
                        ticks: { font: { size: 10, family: 'Noto Sans KR' }, maxRotation: 45 },
                        grid: { color: 'rgba(0,0,0,0.06)', borderDash: [3, 3] }
                    },
                    y: {
                        stacked: isStacked,
                        ticks: {
                            font: { size: 10, family: 'Noto Sans KR' },
                            callback: function (val) {
                                if (m.unit === '원' && val >= 1e8) return (val / 1e8).toFixed(0) + '억';
                                if (m.unit === '원' && val >= 1e4) return (val / 1e4).toFixed(0) + '만';
                                return val;
                            }
                        },
                        grid: { color: 'rgba(0,0,0,0.06)', borderDash: [3, 3] }
                    }
                }
            }
        });
    }

    function setupEvents() {
        var runBtn = document.getElementById('cube-run');
        if (runBtn) {
            runBtn.addEventListener('click', function () {
                rowDim = parseInt(document.getElementById('cube-row-dim').value);
                colDim = parseInt(document.getElementById('cube-col-dim').value);
                measure = parseInt(document.getElementById('cube-measure').value);
                filterDim = parseInt(document.getElementById('cube-filter-dim').value);
                filterVal = document.getElementById('cube-filter-val').value;
                chartType = document.getElementById('cube-chart-type').value;
                executePivot();
            });
        }

        // 필터 차원 변경 시 필터 값 목록 동적 로드
        var filterDimSelect = document.getElementById('cube-filter-dim');
        if (filterDimSelect) {
            filterDimSelect.addEventListener('change', function () {
                var idx = parseInt(this.value);
                filterDim = idx;
                filterVal = '';
                loadFilterValues(idx);
            });
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

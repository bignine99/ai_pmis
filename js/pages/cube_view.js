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
            '<button class="cube-run-btn" id="cube-run"><i class="fa-solid fa-play"></i> 분석 실행</button>' +
            '</div>';

        // Result Area
        html += '<div class="cube-result" id="cube-result">' +
            '<div class="cube-placeholder">' +
            '<i class="fa-solid fa-cube" style="font-size:3rem;color:var(--primary);opacity:0.3"></i>' +
            '<p>축을 선택하고 <strong>분석 실행</strong>을 클릭하세요</p>' +
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

    function executePivot() {
        var rd = dimensions[rowDim];
        var cd = dimensions[colDim];
        var m = measures[measure];
        var resultArea = document.getElementById('cube-result');
        if (!resultArea) return;

        // SQL: GROUP BY 행축, 열축
        var sql = 'SELECT ' + rd.col + ' AS row_dim, ' + cd.col + ' AS col_dim, ' + m.expr + ' AS val ' +
            'FROM evms ' +
            'WHERE ' + rd.col + ' IS NOT NULL AND ' + rd.col + " != '' " +
            'AND ' + cd.col + ' IS NOT NULL AND ' + cd.col + " != '' " +
            'GROUP BY ' + rd.col + ', ' + cd.col + ' ' +
            'ORDER BY ' + rd.col + ', ' + cd.col;

        var result = DB.runQuery(sql);
        if (!result || result.values.length === 0) {
            resultArea.innerHTML = '<div class="cube-placeholder"><p>결과가 없습니다.</p></div>';
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
        var html = '<div class="cube-table-info">' +
            '<span><strong>' + rd.label + '</strong> × <strong>' + cd.label + '</strong></span>' +
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
    }

    function formatCellValue(v, unit) {
        if (v === 0 || v == null) return '-';
        if (unit === '원') return AIEngine.formatCurrency(v);
        if (unit === '%') return (v * 100).toFixed(1) + '%';
        return AIEngine.formatNumber(v);
    }

    function setupEvents() {
        var runBtn = document.getElementById('cube-run');
        if (runBtn) {
            runBtn.addEventListener('click', function () {
                rowDim = parseInt(document.getElementById('cube-row-dim').value);
                colDim = parseInt(document.getElementById('cube-col-dim').value);
                measure = parseInt(document.getElementById('cube-measure').value);
                executePivot();
            });
        }
    }

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
    }
}

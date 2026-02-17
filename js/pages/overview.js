/**
 * ============================================================
 * Page 1: 프로젝트 개요 (PMIS-Style Project Overview)
 * ============================================================
 * 16:9 viewport layout using CSS Grid (not Bootstrap col-*)
 * ─ 사이드바 260px 제외 후 컨텐츠영역에 맞춤
 */

// ─── 프로젝트 정보 ───────────────────────────────────────
var PROJECT_INFO = {
    name: '인천소방학교 이전 신축공사',
    location: '인천광역시 강화군 양사면 인화리 528-4번지 외 2필지',
    usage: '교육연구시설(교육원)',
    structure: 'RC조 + 철골조',
    scale: '지하1층 / 지상5층',
    maxHeight: '27.3m',
    elevator: '6대',
    parking: '110대',
    finish: 'FC패널 / 로이복층유리',
    siteArea: 29934,
    buildingArea: 5312.69,
    grossFloorArea: 14997.02,
    farArea: 13980.97,
    bcr: 17.75,
    far: 46.71,
    images: [
        { src: '.project_info/Fire_Academy_01.jpg', cap: '전체 조감도' },
        { src: '.project_info/Fire_Academy_02.jpg', cap: '본관동 투시도' },
        { src: '.project_info/Fire_Academy_03.jpg', cap: '훈련시설 투시도' },
        { src: '.project_info/Fire_Academy_04.png', cap: '시설 배치도 1' },
        { src: '.project_info/Fire_Academy_05.png', cap: '시설 배치도 2' }
    ],
    buildings: {
        '본관동': { totalArea: 12234.93, ba: 4281.25 },
        '수난구조및구급훈련센터': { totalArea: 684.98, ba: 397.67 },
        '관리시설': { totalArea: 1064.05, ba: 233.10 },
        '소방종합훈련탑': { totalArea: 119.80, ba: 121.44 },
        '관사동': { totalArea: 893.26, ba: 279.23 }
    }
};

// ─── 동명 매칭 ────────────────────────────────────────────
function matchBuilding(n) {
    var s = (n || '').replace(/\s/g, ''), b = PROJECT_INFO.buildings, k = Object.keys(b);
    if (b[s]) return b[s];
    for (var i = 0; i < k.length; i++) { if (s.indexOf(k[i]) >= 0 || k[i].indexOf(s) >= 0) return b[k[i]]; }
    if (s.indexOf('본관') >= 0 || s.indexOf('생활관') >= 0 || s.indexOf('후생관') >= 0) return b['본관동'];
    if (s.indexOf('수난') >= 0 || s.indexOf('구급') >= 0) return b['수난구조및구급훈련센터'];
    if (s.indexOf('관리') >= 0) return b['관리시설'];
    if (s.indexOf('훈련탑') >= 0 || s.indexOf('소방') >= 0) return b['소방종합훈련탑'];
    if (s.indexOf('관사') >= 0) return b['관사동'];
    return null;
}

function fmtArea(v) { return v.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '㎡'; }
function fmtUC(v) { return (v / 10000).toFixed(1) + '만원/㎡'; }

// ─── 캐러셀 ──────────────────────────────────────────────
var _hi = 0, _ht = null;
window.slideHero = function (d) { _hi = (_hi + d + PROJECT_INFO.images.length) % PROJECT_INFO.images.length; upSlide(); rstTimer(); };
function upSlide() {
    var s = document.getElementById('hero-slides'), ds = document.querySelectorAll('#hero-dots .hero-dot'), c = document.getElementById('hcap');
    if (!s) return;
    s.style.transform = 'translateX(-' + (_hi * 100) + '%)';
    ds.forEach(function (d, i) { d.classList.toggle('active', i === _hi); });
    if (c) c.textContent = PROJECT_INFO.images[_hi].cap;
}
function rstTimer() { if (_ht) clearInterval(_ht); _ht = setInterval(function () { _hi = (_hi + 1) % PROJECT_INFO.images.length; upSlide(); }, 5000); }

function heroHTML() {
    var imgs = PROJECT_INFO.images;
    return '<div class="project-hero" id="project-hero">' +
        '<div class="hero-slides" id="hero-slides">' +
        imgs.map(function (m) { return '<img class="hero-slide" src="' + m.src + '" alt="' + m.cap + '">'; }).join('') +
        '</div><div class="hero-overlay"></div>' +
        '<div class="hero-caption"><h4>' + PROJECT_INFO.name + '</h4><p id="hcap">' + imgs[0].cap + '</p></div>' +
        '<button class="hero-nav prev" onclick="slideHero(-1)"><i class="fa-solid fa-chevron-left"></i></button>' +
        '<button class="hero-nav next" onclick="slideHero(1)"><i class="fa-solid fa-chevron-right"></i></button>' +
        '<div class="hero-dots" id="hero-dots">' +
        imgs.map(function (_, i) { return '<button class="hero-dot' + (i === 0 ? ' active' : '') + '" data-slide="' + i + '"></button>'; }).join('') +
        '</div></div>';
}

// ─── 메타 행 ──────────────────────────────────────────────
function mRow(l, v, m) {
    return '<div class="meta-item-compact"><span class="mc-label">' + l + '</span><span class="mc-value' + (m ? ' mono' : '') + '">' + v + '</span></div>';
}

// ─── KPI 미니 카드 ────────────────────────────────────────
function miniKpi(label, value, icon, accent) {
    return '<div class="kpi-card kpi-accent-' + accent + '" style="padding:12px 14px">' +
        '<div style="display:flex;align-items:center;gap:10px">' +
        '<div class="kpi-icon" style="width:28px;height:28px;font-size:0.8rem"><i class="fa-solid ' + icon + '"></i></div>' +
        '<div style="flex:1;min-width:0">' +
        '<div class="kpi-label" style="margin-bottom:2px">' + label + '</div>' +
        '<div class="kpi-value" style="font-size:1rem">' + value + '</div>' +
        '</div></div></div>';
}

// ═══ 메인 렌더링 ══════════════════════════════════════════
function renderOverviewPage(container) {
    if (!DB.isReady()) { container.innerHTML = Components.showDbNotReady(); return; }

    var S = DB.getProjectSummary();
    var CC = DB.getCostComposition();
    var TI = DB.getTopNItems(8);
    var BC = DB.getCostByBuilding();
    var matP = S.totalBudget > 0 ? ((S.materialCost / S.totalBudget) * 100).toFixed(1) : 0;
    var labP = S.totalBudget > 0 ? ((S.laborCost / S.totalBudget) * 100).toFixed(1) : 0;

    var bucs = [];
    if (BC.values) BC.values.forEach(function (r) {
        var bi = matchBuilding(r[0]);
        if (bi && bi.totalArea > 0) bucs.push({ name: r[0], area: bi.totalArea, cost: r[4] || 0, uc: (r[4] || 0) / bi.totalArea });
    });

    var PI = PROJECT_INFO;

    // ─ 착공일 / 준공예정일 ─
    var startDate = DB.runScalar("SELECT MIN(WHEN1_시작일) FROM evms WHERE WHEN1_시작일 IS NOT NULL AND WHEN1_시작일 != ''") || '-';
    var endDate = DB.runScalar("SELECT MAX(WHEN2종료일) FROM evms WHERE WHEN2종료일 IS NOT NULL AND WHEN2종료일 != ''") || '-';

    container.innerHTML =

        // ════ ROW 1: 이미지(2fr) + 사업개요(3fr) ════
        '<div style="display:grid;grid-template-columns:2fr 3fr;gap:12px;margin-bottom:12px">' +
        heroHTML() +
        // Right (3fr): 사업 개요
        '<div class="glass-card" style="padding:14px 16px;overflow-y:auto">' +
        Components.createCardHeader('사업 개요', 'fa-info-circle') +
        '<div class="meta-compact-grid">' +
        mRow('과업명', PI.name) +
        mRow('소재지', PI.location) +
        mRow('용도', PI.usage) +
        mRow('구조', PI.structure) +
        mRow('규모', PI.scale) +
        mRow('최고높이', PI.maxHeight, 1) +
        mRow('대지면적', fmtArea(PI.siteArea), 1) +
        mRow('건축면적', fmtArea(PI.buildingArea), 1) +
        mRow('연면적', fmtArea(PI.grossFloorArea), 1) +
        mRow('건폐율', PI.bcr + '%', 1) +
        mRow('용적률', PI.far + '%', 1) +
        mRow('주차', PI.parking, 1) +
        mRow('승강기', PI.elevator) +
        mRow('외부마감', PI.finish) +
        mRow('착공일', startDate, 1) +
        mRow('준공예정일', endDate, 1) +
        '</div></div>' +
        '</div>' +

        // ════ ROW 2: KPI 8개 (4+4) ════
        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">' +
        miniKpi('총 공사비', Components.formatCurrency(S.totalBudget), 'fa-coins', 'blue') +
        miniKpi('품목 수', Components.formatNumber(S.totalItems) + '건', 'fa-list-check', 'green') +
        miniKpi('건물', S.totalBuildings + '동', 'fa-building', 'amber') +
        miniKpi('재/노비', matP + '% / ' + labP + '%', 'fa-cubes', 'purple') +
        '</div>' +

        '<div style="display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:12px">' +
        miniKpi('연면적 당', fmtUC(S.totalBudget / PI.grossFloorArea), 'fa-ruler-combined', 'blue') +
        miniKpi('건축면적 당', fmtUC(S.totalBudget / PI.buildingArea), 'fa-vector-square', 'purple') +
        miniKpi('대지면적 당', fmtUC(S.totalBudget / PI.siteArea), 'fa-expand', 'green') +
        miniKpi('용적률산정 당', fmtUC(S.totalBudget / PI.farArea), 'fa-layer-group', 'info') +
        '</div>' +

        // ════ ROW 3: 동별 테이블(55%) + 동별 차트(45%) ════
        '<div style="display:grid;grid-template-columns:55fr 45fr;gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('동별 ㎡당 공사비', 'fa-building') +
        buildTable(bucs) +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('동별 ㎡당 비교', 'fa-chart-bar') +
        '<div style="height:200px"><canvas id="ov-uc-bar"></canvas></div>' +
        '</div>' +
        '</div>' +

        // ════ ROW 4: 도넛(35%) + 적층바(65%) ════
        '<div style="display:grid;grid-template-columns:35fr 65fr;gap:12px;margin-bottom:12px">' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('비용 구성비', 'fa-chart-pie') +
        '<div style="height:200px"><canvas id="ov-pie"></canvas></div>' +
        '</div>' +
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('동별 공사비 분포', 'fa-chart-bar') +
        '<div style="height:200px"><canvas id="ov-bldg-bar"></canvas></div>' +
        '</div>' +
        '</div>' +

        // ════ ROW 5: 상위 항목 테이블 ════
        '<div class="glass-card" style="padding:14px 16px">' +
        Components.createCardHeader('비용 상위 8 항목', 'fa-ranking-star') +
        Components.createDataTable(
            ['동', '대공종', '작업명', '품명', '합계금액'],
            TI.values.map(function (r) { return [r[0], r[1], r[2], r[3], Components.formatCurrency(r[4])]; }),
            { id: 'top-items-tbl' }
        ) +
        '</div>';

    // ─── 캐러셀 시작 ───
    _hi = 0; rstTimer();
    document.querySelectorAll('#hero-dots .hero-dot').forEach(function (d) {
        d.addEventListener('click', function () { _hi = parseInt(this.getAttribute('data-slide')); upSlide(); rstTimer(); });
    });

    // ─── Charts ───
    if (CC.values.length > 0)
        Components.createChart('ov-pie', 'doughnut', {
            labels: CC.values.map(function (r) { return r[0]; }),
            datasets: [{ data: CC.values.map(function (r) { return r[1]; }), backgroundColor: Components.CHART_COLORS.slice(0, 3), borderWidth: 0, hoverOffset: 6 }]
        }, { plugins: { legend: { position: 'bottom', labels: { font: { size: 10 } } } }, cutout: '58%' });

    if (BC.values.length > 0)
        Components.createChart('ov-bldg-bar', 'bar', {
            labels: BC.values.map(function (r) { return r[0]; }),
            datasets: [
                { label: '재료비', data: BC.values.map(function (r) { return r[1]; }), backgroundColor: Components.CHART_COLORS[0], borderRadius: 3 },
                { label: '노무비', data: BC.values.map(function (r) { return r[2]; }), backgroundColor: Components.CHART_COLORS[1], borderRadius: 3 },
                { label: '경비', data: BC.values.map(function (r) { return r[3]; }), backgroundColor: Components.CHART_COLORS[2], borderRadius: 3 }
            ]
        }, {
            plugins: { legend: { position: 'top', labels: { font: { size: 10 } } } },
            scales: {
                x: { stacked: true, grid: { display: false }, ticks: { font: { size: 9 } } },
                y: { stacked: true, ticks: { callback: function (v) { return (v / 1e8).toFixed(0) + '억'; }, font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: 'rgba(148,163,184,0.05)' } }
            }
        });

    if (bucs.length > 0)
        Components.createChart('ov-uc-bar', 'bar', {
            labels: bucs.map(function (b) { return b.name; }),
            datasets: [{
                label: '만원/㎡', data: bucs.map(function (b) { return Math.round(b.uc / 10000); }),
                backgroundColor: bucs.map(function (_, i) { return Components.CHART_COLORS[i % Components.CHART_COLORS.length]; }),
                borderRadius: 5, barPercentage: 0.5
            }]
        }, {
            indexAxis: 'y',
            plugins: { legend: { display: false } },
            scales: {
                x: { ticks: { callback: function (v) { return v + '만'; }, font: { family: 'JetBrains Mono', size: 9 } }, grid: { color: 'rgba(148,163,184,0.05)' } },
                y: { ticks: { font: { size: 9 } }, grid: { display: false } }
            }
        });

}

function buildTable(data) {
    if (!data || !data.length) return '<p style="color:var(--text-muted);font-size:0.75rem;text-align:center;padding:12px">매칭 결과 없음</p>';
    return '<div class="table-responsive" style="position:relative;z-index:2"><table class="table table-hover" style="margin:0;font-size:0.78rem">' +
        '<thead><tr><th>동</th><th style="text-align:right">연면적(㎡)</th><th style="text-align:right">공사비</th><th style="text-align:right">㎡당 단가</th></tr></thead><tbody>' +
        data.map(function (b) {
            return '<tr><td>' + b.name + '</td>' +
                '<td class="mono" style="text-align:right">' + b.area.toLocaleString('ko-KR', { maximumFractionDigits: 0 }) + '</td>' +
                '<td class="mono" style="text-align:right">' + Components.formatCurrency(b.cost) + '</td>' +
                '<td class="mono" style="text-align:right;color:var(--accent-bright);font-weight:700">' + fmtUC(b.uc) + '</td></tr>';
        }).join('') +
        '</tbody></table></div>';
}

window.renderOverviewPage = renderOverviewPage;

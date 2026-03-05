/**
 * ============================================================
 * AI Analysis Page (ai_analysis.js)
 * ============================================================
 * CUBE-AI 기반 대화형 건설사업관리 인텔리전트 분석 페이지
 * - 좌측(30%): 채팅 인터렉션 패널
 * - 우측(70%): 인사이트 캔버스 (Summary, Grid, Chart 탭)
 */

/* global Components, AIEngine, Chart */

function renderAiAnalysisPage(container) {
    'use strict';

    if (!DB || !DB.isReady()) {
        container.innerHTML = Components.showError('데이터베이스가 로드되지 않았습니다.');
        return;
    }

    // ── AI 페이지 전용 레이아웃 활성화 ─────────────────────────
    // content-wrapper의 패딩/overflow를 제거하여 전체 높이를 채움
    container.classList.add('ai-page-active');
    // main-content의 스크롤도 차단 (AI 페이지가 자체 스크롤 관리)
    var mainContent = container.closest('.main-content');
    if (mainContent) mainContent.style.overflowY = 'hidden';

    // 페이지 이탈 시 클래스 제거 + 모달 정리
    function cleanupAiPage() {
        container.classList.remove('ai-page-active');
        if (mainContent) mainContent.style.overflowY = '';
        // body에 추가한 모달 제거
        var mc = document.getElementById('ai-modal-container');
        if (mc) mc.remove();
        window.removeEventListener('hashchange', cleanupAiPage);
    }
    window.addEventListener('hashchange', cleanupAiPage);

    // ── 상태 관리 ────────────────────────────────────────────
    var chatMessages = [];
    var currentResult = null;
    var activeTab = 'summary';
    var chartInstance = null;
    var totalRows = DB.runScalar("SELECT COUNT(*) FROM evms");

    // ── 대화 기록 유지 (SPA 네비게이션 시만) ─────────────────
    // window 전역 변수로 저장 → 다른 메뉴 갔다 돌아와도 유지
    // 새로고침(F5) 시에는 초기화됨
    if (window._aiChatState) {
        chatMessages = window._aiChatState.messages || [];
        currentResult = window._aiChatState.result || null;
    }

    function saveChatState() {
        window._aiChatState = {
            messages: chatMessages,
            result: currentResult
        };
    }

    function clearChat() {
        chatMessages = [];
        currentResult = null;
        window._aiChatState = null;
        renderChatMessages();
        renderWelcomeScreen();
        updateTabBar();
    }

    // ── 레이아웃 렌더링 ──────────────────────────────────────
    container.innerHTML = buildLayout();
    // 모달은 body에 직접 추가 (overflow:hidden에 잘리지 않도록)
    var modalDiv = document.createElement('div');
    modalDiv.id = 'ai-modal-container';
    modalDiv.innerHTML = buildApiKeyModal();
    document.body.appendChild(modalDiv);
    setupEventHandlers();

    // 이전 대화가 있으면 대화 기록 + 마지막 결과 표시, 없으면 Welcome
    if (chatMessages.length > 0) {
        renderChatMessages();
        if (currentResult) {
            activeTab = 'summary';
            updateTabBar();
            renderCanvasContent();
        } else {
            renderWelcomeScreen();
        }
    } else {
        renderWelcomeScreen();
    }
    renderPresetChips();

    // ── 레이아웃 HTML ────────────────────────────────────────

    function buildLayout() {
        return '<div class="ai-layout">' +
            // ── 좌측: 인터랙션 패널 ──
            '<div class="ai-chat-panel">' +
            // Context Bar
            '<div class="ai-context-bar">' +
            '<div class="ai-context-info">' +
            '<i class="fa-solid fa-database" style="color:var(--primary)"></i>' +
            '<span>전체 프로젝트</span>' +
            '<span class="ai-context-badge">' + AIEngine.formatNumber(totalRows) + '건</span>' +
            '</div>' +
            '<button class="ai-settings-btn" id="ai-export-chat" title="대화 내보내기 (텍스트)" style="margin-right:2px">' +
            '<i class="fa-solid fa-file-export"></i>' +
            '</button>' +
            '<button class="ai-settings-btn" id="ai-save-chat" title="대화 저장 (로컬)" style="margin-right:2px">' +
            '<i class="fa-solid fa-floppy-disk"></i>' +
            '</button>' +
            '<button class="ai-settings-btn" id="ai-load-chat" title="저장된 대화 불러오기" style="margin-right:2px">' +
            '<i class="fa-solid fa-folder-open"></i>' +
            '</button>' +
            '<button class="ai-settings-btn" id="ai-clear-chat" title="대화 초기화" style="margin-right:2px">' +
            '<i class="fa-solid fa-trash-can"></i>' +
            '</button>' +
            '<button class="ai-settings-btn" id="ai-settings-btn" title="Gemini API Key 설정"' +
            (AIEngine.hasApiKey() ? ' style="color:#10B981"' : '') + '>' +
            '<i class="fa-solid fa-key"></i>' +
            '</button>' +
            '</div>' +
            // Chat Messages Area
            '<div class="ai-chat-messages" id="ai-chat-messages">' +
            // Welcome message & messages will be added here
            '</div>' +
            // Preset Chips Area
            '<div class="ai-chips-area" id="ai-chips-area">' +
            // Preset category chips
            '</div>' +
            // Input Area
            '<div class="ai-input-area">' +
            '<div class="ai-input-wrapper">' +
            '<input type="text" class="ai-input" id="ai-input" placeholder="건설 데이터에 무엇이든 물어보세요..." autocomplete="off">' +
            '<button class="ai-send-btn" id="ai-send-btn" title="전송">' +
            '<i class="fa-solid fa-paper-plane"></i>' +
            '</button>' +
            '</div>' +
            '<div class="ai-input-hint">' +
            (AIEngine.hasApiKey()
                ? '<i class="fa-solid fa-circle" style="color:#10B981;font-size:6px"></i> Gemini 연결됨'
                : '<i class="fa-solid fa-circle" style="color:#94A3B8;font-size:6px"></i> 프리셋 모드 · <a href="#" id="ai-connect-link">API 키 연결</a>') +
            '</div>' +
            '</div>' +
            '</div>' +
            // ── 우측: 인사이트 캔버스 ──
            '<div class="ai-canvas-panel">' +
            // Tab Bar
            '<div class="ai-tab-bar" id="ai-tab-bar">' +
            '<button class="ai-tab active" data-tab="summary"><i class="fa-solid fa-chart-pie"></i> Summary</button>' +
            '<button class="ai-tab" data-tab="grid"><i class="fa-solid fa-table-cells"></i> Data Grid</button>' +
            '<button class="ai-tab" data-tab="chart"><i class="fa-solid fa-chart-column"></i> Visualization</button>' +
            '</div>' +
            // Canvas Content
            '<div class="ai-canvas-content" id="ai-canvas-content">' +
            // Dynamic content rendered here
            '</div>' +
            '</div>' +
            '</div>';
    }

    function buildApiKeyModal() {
        return '<div class="ai-modal-overlay" id="ai-modal-overlay" style="display:none">' +
            '<div class="ai-modal">' +
            '<div class="ai-modal-header">' +
            '<h3><i class="fa-solid fa-key"></i> Gemini API Key 설정</h3>' +
            '<button class="ai-modal-close" id="ai-modal-close"><i class="fa-solid fa-xmark"></i></button>' +
            '</div>' +
            '<div class="ai-modal-body">' +
            '<p style="color:var(--text-secondary);font-size:0.82rem;margin-bottom:12px">' +
            'Google AI Studio에서 발급받은 Gemini API Key를 입력하세요.<br>' +
            '키는 이 페이지에 있는 동안만 유지되며 저장되지 않습니다.' +
            '</p>' +
            '<div class="ai-key-input-group">' +
            '<input type="password" class="ai-key-input" id="ai-key-input" placeholder="AI...">' +
            '<button class="ai-key-toggle" id="ai-key-toggle"><i class="fa-solid fa-eye"></i></button>' +
            '</div>' +
            '<div class="ai-model-info">' +
            '<span class="ai-model-badge"><i class="fa-solid fa-microchip"></i> Gemini 2.5 Flash-Lite</span>' +
            '<span style="color:var(--text-muted);font-size:0.72rem">NL → SQL 변환에 사용</span>' +
            '</div>' +
            '</div>' +
            '<div style="display:flex;justify-content:flex-end;gap:10px;padding:14px 20px;border-top:1px solid #e2e8f0;align-items:center">' +
            '<button id="ai-key-cancel" style="padding:8px 18px;border:1px solid #e2e8f0;border-radius:8px;background:#f8fafc;color:#64748b;cursor:pointer;font-size:0.8rem;font-weight:600">취소</button>' +
            '<button id="ai-key-save" style="padding:8px 20px;border:none;border-radius:8px;background:#3B82F6;color:#fff;cursor:pointer;font-size:0.8rem;font-weight:600;display:inline-flex;align-items:center;gap:6px"><i class="fa-solid fa-check"></i> 연결</button>' +
            '</div>' +
            '</div>' +
            '</div>';
    }

    // ── Welcome Screen ───────────────────────────────────────

    function renderWelcomeScreen() {
        var canvas = document.getElementById('ai-canvas-content');
        if (!canvas) return;

        var cats = AIEngine.getPresetCategories();
        var catsHtml = '';
        cats.forEach(function (cat) {
            catsHtml += '<div class="ai-welcome-category" data-cat-id="' + cat.id + '">' +
                '<div class="ai-welcome-cat-icon" style="background:' + cat.color + '20;color:' + cat.color + '">' +
                '<i class="fa-solid ' + cat.icon + '"></i>' +
                '</div>' +
                '<div class="ai-welcome-cat-info">' +
                '<div class="ai-welcome-cat-label">' + cat.label + '</div>' +
                '<div class="ai-welcome-cat-desc">' + cat.desc + '</div>' +
                '</div>' +
                '<span class="ai-welcome-cat-count">' + cat.questions.length + '</span>' +
                '</div>';
        });

        canvas.innerHTML = '<div class="ai-welcome">' +
            '<div class="ai-welcome-hero">' +
            '<div class="ai-welcome-icon">' +
            '<i class="fa-solid fa-robot"></i>' +
            '</div>' +
            '<h2 class="ai-welcome-title">CUBE-AI Commander</h2>' +
            '<p class="ai-welcome-subtitle">건설 데이터에 무엇이든 물어보세요</p>' +
            '<p class="ai-welcome-desc">6W1H(Who, When, Where, What, How, Why, Cost) 속성이 통합된<br>CUBE 데이터베이스에서 즉각적인 분석과 인사이트를 제공합니다.</p>' +
            '</div>' +
            '<div class="ai-welcome-categories">' + catsHtml + '</div>' +
            '<div class="ai-welcome-stats">' +
            '<div class="ai-welcome-stat"><span class="ai-stat-value">' + AIEngine.formatNumber(totalRows) + '</span><span class="ai-stat-label">데이터 행</span></div>' +
            '<div class="ai-welcome-stat"><span class="ai-stat-value">25</span><span class="ai-stat-label">분석 컬럼 (6W1H)</span></div>' +
            '<div class="ai-welcome-stat"><span class="ai-stat-value">28</span><span class="ai-stat-label">프리셋 질문</span></div>' +
            '<div class="ai-welcome-stat"><span class="ai-stat-value">' + AIEngine.formatCurrency(DB.runScalar("SELECT SUM(R10_합계_금액) FROM evms")) + '</span><span class="ai-stat-label">총 예산 (BAC)</span></div>' +
            '</div>' +
            '</div>';

        // Welcome 카테고리 클릭 → 좌측 칩 영역에 해당 카테고리 펼치기
        canvas.querySelectorAll('.ai-welcome-category').forEach(function (el) {
            el.addEventListener('click', function () {
                var catId = el.getAttribute('data-cat-id');
                toggleCategory(catId);
            });
        });
    }

    // ── 프리셋 칩 (좌측 하단) ─────────────────────────────────

    function renderPresetChips() {
        var area = document.getElementById('ai-chips-area');
        if (!area) return;

        var cats = AIEngine.getPresetCategories();
        var html = '<div class="ai-chip-categories">';
        cats.forEach(function (cat) {
            html += '<button class="ai-chip-cat" data-cat="' + cat.id + '" style="--cat-color:' + cat.color + '">' +
                '<i class="fa-solid ' + cat.icon + '"></i> ' + cat.label.split(' ')[0] +
                '</button>';
        });
        html += '</div>';
        html += '<div class="ai-chip-questions" id="ai-chip-questions"></div>';
        area.innerHTML = html;

        area.querySelectorAll('.ai-chip-cat').forEach(function (btn) {
            btn.addEventListener('click', function () {
                var catId = btn.getAttribute('data-cat');
                toggleCategory(catId);
            });
        });
    }

    var activeCategory = null;

    function toggleCategory(catId) {
        var qArea = document.getElementById('ai-chip-questions');
        if (!qArea) return;

        // 카테고리 버튼 활성화 토글
        document.querySelectorAll('.ai-chip-cat').forEach(function (b) {
            b.classList.toggle('active', b.getAttribute('data-cat') === catId && activeCategory !== catId);
        });

        if (activeCategory === catId) {
            activeCategory = null;
            qArea.innerHTML = '';
            return;
        }
        activeCategory = catId;

        var cats = AIEngine.getPresetCategories();
        var cat = cats.find(function (c) { return c.id === catId; });
        if (!cat) return;

        var html = '';
        cat.questions.forEach(function (q, idx) {
            html += '<button class="ai-chip-q" data-cat="' + catId + '" data-idx="' + idx + '">' +
                '<span class="ai-chip-tag">' + q.tag + '</span>' +
                '<span class="ai-chip-text">' + q.text + '</span>' +
                '</button>';
        });
        qArea.innerHTML = html;

        // 칩 슬라이드-인 애니메이션
        qArea.querySelectorAll('.ai-chip-q').forEach(function (chip, i) {
            chip.style.animationDelay = (i * 0.04) + 's';
            chip.addEventListener('click', function () {
                var catId2 = chip.getAttribute('data-cat');
                var idx2 = parseInt(chip.getAttribute('data-idx'));
                var cat2 = cats.find(function (c) { return c.id === catId2; });
                if (cat2 && cat2.questions[idx2]) {
                    sendMessage(cat2.questions[idx2].text);
                }
            });
        });
    }

    // ── 채팅 메시지 관리 ─────────────────────────────────────

    function addChatMessage(role, content, extra) {
        var msg = { role: role, content: content, time: new Date(), extra: extra || {} };
        // AI 응답에 해당 result 저장 (이전 대화 클릭 시 복원용)
        if (role === 'ai' && currentResult) {
            msg.extra.resultSnapshot = currentResult;
        }
        chatMessages.push(msg);
        saveChatState();
        renderChatMessages();
    }

    function renderChatMessages() {
        var area = document.getElementById('ai-chat-messages');
        if (!area) return;

        console.log('[AI Chat] Rendering messages, count:', chatMessages.length,
            chatMessages.map(function (m) { return m.role + ':' + (m.content || '').substring(0, 20); }));

        var html = '';
        // Welcome MSG (always first, compact)
        html += '<div class="ai-msg ai-msg-system">' +
            '<div class="ai-msg-avatar"><i class="fa-solid fa-robot"></i></div>' +
            '<div class="ai-msg-bubble">' +
            '<p>안녕하세요! <strong>CUBE-AI</strong>입니다. 건설 데이터에 대해 질문해 주세요.</p>' +
            '</div>' +
            '</div>';

        var lastUserMsgId = null;
        var lastUserQuestion = '';

        chatMessages.forEach(function (msg, idx) {
            var timeStr = msg.time ? (msg.time.getHours() + ':' + String(msg.time.getMinutes()).padStart(2, '0')) : '';
            if (msg.role === 'user') {
                var msgId = 'ai-user-msg-' + idx;
                lastUserMsgId = msgId;
                lastUserQuestion = msg.content || '';
                html += '<div class="ai-msg ai-msg-user" id="' + msgId + '">' +
                    '<div class="ai-msg-bubble">' +
                    '<span class="ai-msg-user-text">' + escapeHtml(msg.content) + '</span>' +
                    '<span class="ai-msg-time">' + timeStr + '</span>' +
                    '</div>' +
                    '<div class="ai-msg-avatar ai-msg-avatar-user"><i class="fa-solid fa-user"></i></div>' +
                    '</div>';
            } else {
                // AI 응답 안에 사용자 질문 인용 포함
                var quoteHtml = '';
                if (lastUserQuestion && msg.extra && msg.extra.title) {
                    quoteHtml = '<div class="ai-msg-quote"><i class="fa-solid fa-quote-left"></i> ' + escapeHtml(lastUserQuestion) + '</div>';
                    lastUserQuestion = ''; // 한 번만 표시
                }
                var hasResult = msg.extra && msg.extra.resultSnapshot;
                var clickStyle = hasResult ? ' style="cursor:pointer;transition:all 0.2s"' : '';
                var clickHint = hasResult ? '<div class="ai-msg-click-hint"><i class="fa-solid fa-arrow-right"></i> 클릭하여 결과 보기</div>' : '';
                html += '<div class="ai-msg ai-msg-ai">' +
                    '<div class="ai-msg-avatar"><i class="fa-solid fa-robot"></i></div>' +
                    '<div class="ai-msg-bubble ai-msg-clickable" data-msg-idx="' + idx + '"' + clickStyle + '>' +
                    quoteHtml +
                    '<div class="ai-msg-title">' + (msg.extra && msg.extra.title ? msg.extra.title : '분석 결과') + '</div>' +
                    '<p>' + (msg.content || '').substring(0, 120) + (msg.content && msg.content.length > 120 ? '...' : '') + '</p>' +
                    (msg.extra && msg.extra.elapsed ? '<div class="ai-msg-meta"><i class="fa-solid fa-clock"></i> ' + msg.extra.elapsed + 'ms · ' + (msg.extra.rows || 0) + '건</div>' : '') +
                    clickHint +
                    '</div>' +
                    '</div>';
            }
        });

        area.innerHTML = html;

        // AI 메시지 클릭 → 해당 결과를 우측 캔버스에 표시
        area.querySelectorAll('.ai-msg-clickable[data-msg-idx]').forEach(function (bubble) {
            bubble.addEventListener('click', function () {
                var msgIdx = parseInt(bubble.getAttribute('data-msg-idx'));
                var msg = chatMessages[msgIdx];
                if (msg && msg.extra && msg.extra.resultSnapshot) {
                    // 현재 result를 해당 메시지의 스냅샷으로 교체
                    currentResult = msg.extra.resultSnapshot;
                    activeTab = 'summary';
                    updateTabBar();
                    renderCanvasContent();
                    // 클릭된 메시지 하이라이트
                    area.querySelectorAll('.ai-msg-bubble').forEach(function (b) { b.classList.remove('ai-msg-selected'); });
                    bubble.classList.add('ai-msg-selected');
                }
            });
            // 호버 효과
            bubble.addEventListener('mouseenter', function () {
                if (bubble.getAttribute('data-msg-idx')) {
                    var msg = chatMessages[parseInt(bubble.getAttribute('data-msg-idx'))];
                    if (msg && msg.extra && msg.extra.resultSnapshot) {
                        bubble.style.borderColor = 'var(--primary)';
                        bubble.style.boxShadow = '0 2px 8px rgba(59,130,246,0.15)';
                    }
                }
            });
            bubble.addEventListener('mouseleave', function () {
                bubble.style.borderColor = '';
                bubble.style.boxShadow = '';
            });
        });

        // 마지막 사용자 메시지가 보이도록 스크롤
        setTimeout(function () {
            if (lastUserMsgId) {
                var userEl = document.getElementById(lastUserMsgId);
                if (userEl) {
                    userEl.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    return;
                }
            }
            area.scrollTop = area.scrollHeight;
        }, 50);
    }

    // ── 타이핑 인디케이터 ────────────────────────────────────

    function showTypingIndicator() {
        var area = document.getElementById('ai-chat-messages');
        if (!area) return;
        // 이미 있으면 중복 방지
        if (area.querySelector('.ai-msg-typing')) return;
        var typingHtml = '<div class="ai-msg ai-msg-ai ai-msg-typing">' +
            '<div class="ai-msg-avatar"><i class="fa-solid fa-robot"></i></div>' +
            '<div class="ai-msg-bubble">' +
            '<div class="ai-typing-indicator">' +
            '<div class="dot"></div><div class="dot"></div><div class="dot"></div>' +
            '</div></div></div>';
        area.insertAdjacentHTML('beforeend', typingHtml);
        area.scrollTop = area.scrollHeight;
    }

    function removeTypingIndicator() {
        var area = document.getElementById('ai-chat-messages');
        if (!area) return;
        var typing = area.querySelector('.ai-msg-typing');
        if (typing) {
            typing.style.opacity = '0';
            typing.style.transform = 'scale(0.95)';
            typing.style.transition = 'all 0.2s ease';
            setTimeout(function () { typing.remove(); }, 200);
        }
    }

    // ── 메시지 전송 & 처리 ───────────────────────────────────

    var isProcessing = false;

    async function sendMessage(text) {
        if (!text || !text.trim()) return;
        if (isProcessing) return; // 중복 전송 방지

        isProcessing = true;
        var input = document.getElementById('ai-input');
        var sendBtn = document.getElementById('ai-send-btn');
        if (input) { input.value = ''; input.disabled = true; input.placeholder = '분석 중...'; }
        if (sendBtn) { sendBtn.disabled = true; sendBtn.style.opacity = '0.5'; }

        // 사용자 메시지 추가
        addChatMessage('user', text.trim());

        // 타이핑 인디케이터 표시
        showTypingIndicator();

        // 로딩 표시
        showCanvasLoading();

        // AI 처리
        try {
            var response = await AIEngine.processQuery(text.trim());
            currentResult = response;
            saveChatState();

            // AI 메시지 추가
            var summary = response.summary || '';
            if (response.apiError) {
                summary += '\n⚠ API 오류: ' + response.apiError + '\n프리셋 모드로 전환되었습니다.';
                console.warn('[AI] API Error detail:', response.apiError);
            }
            // 분석 모드 안내
            if (response.queryType === 'hybrid' && response.analysis) {
                summary += '\n\n🔬 하이브리드 분석 모드: 데이터 조회 + CM이론 기반 분석이 수행되었습니다.';
            } else if (response.queryType === 'consulting' && response.analysis) {
                summary += '\n\n👔 CM 컨설팅 모드: 전문 CM이론에 기반한 분석이 수행되었습니다.';
            }
            if (response.matchedAgenda) {
                summary += '\n📋 관련 회의의제: ' + response.matchedAgenda;
            }
            removeTypingIndicator();
            addChatMessage('ai', summary, {
                title: response.title,
                elapsed: response.elapsed,
                rows: response.result ? response.result.values.length : 0
            });

            // 캔버스 업데이트
            activeTab = 'summary';
            updateTabBar();
            renderCanvasContent();

        } catch (err) {
            removeTypingIndicator();
            addChatMessage('ai', '오류가 발생했습니다: ' + err.message, { title: '처리 오류' });
            console.error('[AI Page] Error:', err);
        } finally {
            isProcessing = false;
            if (input) { input.disabled = false; input.placeholder = '건설 데이터에 무엇이든 물어보세요...'; input.focus(); }
            if (sendBtn) { sendBtn.disabled = false; sendBtn.style.opacity = '1'; }
        }
    }

    // ── 캔버스 렌더링 ────────────────────────────────────────

    function showCanvasLoading() {
        var canvas = document.getElementById('ai-canvas-content');
        if (!canvas) return;
        canvas.innerHTML = '<div class="ai-canvas-loading">' +
            '<div class="ai-loading-spinner"></div>' +
            '<p>데이터를 분석하고 있습니다...</p>' +
            '</div>';
    }

    function renderCanvasContent() {
        if (!currentResult) { renderWelcomeScreen(); return; }

        switch (activeTab) {
            case 'summary': renderSummaryTab(); break;
            case 'grid': renderGridTab(); break;
            case 'chart': renderChartTab(); break;
            default: renderSummaryTab();
        }
    }

    function updateTabBar() {
        document.querySelectorAll('.ai-tab').forEach(function (btn) {
            btn.classList.toggle('active', btn.getAttribute('data-tab') === activeTab);
        });
    }

    // ── Summary 탭 ───────────────────────────────────────────

    function renderSummaryTab() {
        var canvas = document.getElementById('ai-canvas-content');
        if (!canvas || !currentResult) return;

        var r = currentResult;
        var html = '<div class="ai-summary-view">';

        // Title
        html += '<div class="ai-summary-header">' +
            '<h3>' + escapeHtml(r.title) + '</h3>' +
            '<span class="ai-elapsed"><i class="fa-solid fa-bolt"></i> ' + r.elapsed + 'ms</span>' +
            '</div>';

        // KPI Cards
        if (r.kpis && r.kpis.length > 0) {
            html += '<div class="ai-kpi-row">';
            r.kpis.forEach(function (kpi) {
                var val;
                if (kpi.value != null) {
                    val = kpi.value;  // 자동생성 KPI (직접 값)
                } else if (kpi.col >= 0 && r.result && r.result.values.length > 0) {
                    val = r.result.values[0][kpi.col];  // 결과 컬럼 참조
                } else {
                    return;  // 값 없으면 스킵
                }
                var formatted = kpi.unit === '원' ? AIEngine.formatCurrency(val) :
                    kpi.unit === '%' ? (val + '%') :
                        kpi.unit === '건' ? AIEngine.formatNumber(val) + '건' :
                            AIEngine.formatNumber(val);
                if (!kpi.unit && typeof val === 'string') formatted = val;
                var countupAttr = (typeof val === 'number') ? ' data-countup="' + val + '"' : '';
                html += '<div class="ai-kpi-card">' +
                    '<div class="ai-kpi-icon"><i class="fa-solid ' + (kpi.icon || 'fa-chart-simple') + '"></i></div>' +
                    '<div class="ai-kpi-info">' +
                    '<div class="ai-kpi-label">' + kpi.label + '</div>' +
                    '<div class="ai-kpi-value countup-value"' + countupAttr + '>' + formatted + '</div>' +
                    '</div>' +
                    '</div>';
            });
            html += '</div>';
        }

        // Summary Text
        if (r.summary) {
            html += '<div class="ai-summary-text">' +
                '<i class="fa-solid fa-lightbulb"></i>' +
                '<p>' + escapeHtml(r.summary) + '</p>' +
                '</div>';
        }

        // CM Analysis Cards (Stage ② — Enhanced Consultant Report)
        if (r.analysis) {
            // 매칭된 회의의제 배지
            var agendaBadge = '';
            if (r.matchedAgenda) {
                agendaBadge = '<div class="ai-agenda-badge">' +
                    '<i class="fa-solid fa-clipboard-list"></i> 관련 회의의제: <strong>' + escapeHtml(r.matchedAgenda) + '</strong>' +
                    '</div>';
            }

            var queryTypeBadge = '';
            if (r.queryType === 'hybrid') {
                queryTypeBadge = '<span class="ai-query-badge ai-badge-hybrid"><i class="fa-solid fa-layer-group"></i> 하이브리드 분석</span>';
            } else if (r.queryType === 'consulting') {
                queryTypeBadge = '<span class="ai-query-badge ai-badge-consulting"><i class="fa-solid fa-user-tie"></i> CM 컨설팅</span>';
            }

            // 보고서 제목
            var reportTitle = r.analysis.reportTitle || 'CM 전문 분석';

            html += '<div class="ai-cm-analysis">' +
                '<div class="ai-cm-header">' +
                '<h4><i class="fa-solid fa-microscope"></i> ' + escapeHtml(reportTitle) + '</h4>' +
                queryTypeBadge +
                '</div>' +
                agendaBadge;

            // ① 현황 진단
            if (r.analysis.situation) {
                html += '<div class="ai-cm-card ai-cm-situation">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-magnifying-glass-chart"></i> 1. 현황 진단 및 원인 분석</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.situation) + '</div>' +
                    '</div>';
            }

            // ② 전략별 대책 (strategies 배열)
            if (r.analysis.strategies && r.analysis.strategies.length > 0) {
                html += '<div class="ai-cm-card ai-cm-strategies">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-chess"></i> 2. 단계별 만회 대책 및 실행 방안</div>' +
                    '<div class="ai-cm-card-body">';

                r.analysis.strategies.forEach(function (s, idx) {
                    html += '<div class="ai-strategy-item">' +
                        '<div class="ai-strategy-title">' + escapeHtml(s.title || ('[전략 ' + (idx + 1) + ']')) + '</div>';

                    if (s.target) {
                        html += '<div class="ai-strategy-detail">' +
                            '<span class="ai-detail-label"><i class="fa-solid fa-crosshairs"></i> 대상</span>' +
                            '<span class="ai-detail-value">' + escapeHtml(s.target) + '</span></div>';
                    }
                    if (s.action) {
                        html += '<div class="ai-strategy-detail">' +
                            '<span class="ai-detail-label"><i class="fa-solid fa-wrench"></i> 실행 방안</span>' +
                            '<span class="ai-detail-value">' + formatAnalysisText(s.action) + '</span></div>';
                    }
                    if (s.effect) {
                        html += '<div class="ai-strategy-detail ai-detail-effect">' +
                            '<span class="ai-detail-label"><i class="fa-solid fa-chart-line"></i> 기대 효과</span>' +
                            '<span class="ai-detail-value">' + formatAnalysisText(s.effect) + '</span></div>';
                    }
                    if (s.cost) {
                        html += '<div class="ai-strategy-detail ai-detail-cost">' +
                            '<span class="ai-detail-label"><i class="fa-solid fa-coins"></i> 추가 비용</span>' +
                            '<span class="ai-detail-value">' + formatAnalysisText(s.cost) + '</span></div>';
                    }
                    html += '</div>';
                });

                html += '</div></div>';
            }

            // ③ 비용-일정 트레이드오프
            if (r.analysis.tradeoff) {
                html += '<div class="ai-cm-card ai-cm-tradeoff">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-scale-balanced"></i> 3. 비용-일정 트레이드오프 분석</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.tradeoff) + '</div>' +
                    '</div>';
            }

            // ④ 최종 의사결정 제안
            if (r.analysis.recommendation) {
                html += '<div class="ai-cm-card ai-cm-recommendation">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-gavel"></i> 4. 최종 의사결정 제안</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.recommendation) + '</div>' +
                    '</div>';
            }

            // ⑤ 리스크
            if (r.analysis.risk) {
                html += '<div class="ai-cm-card ai-cm-risk">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-triangle-exclamation"></i> 5. 리스크 경고</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.risk) + '</div>' +
                    '</div>';
            }

            // ⑥ 시뮬레이션
            if (r.analysis.simulation) {
                html += '<div class="ai-cm-card ai-cm-simulation">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-flask-vial"></i> 6. 시뮬레이션 결과</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.simulation) + '</div>' +
                    '</div>';
            }

            // 하위 호환: 구형 theory 필드
            if (r.analysis.theory && !r.analysis.strategies) {
                html += '<div class="ai-cm-card ai-cm-theory">' +
                    '<div class="ai-cm-card-header"><i class="fa-solid fa-book-open"></i> 이론 근거</div>' +
                    '<div class="ai-cm-card-body">' + formatAnalysisText(r.analysis.theory) + '</div>' +
                    '</div>';
            }

            html += '</div>';
        }

        // Quick Data Preview (first 10 rows)
        if (r.result && r.result.values.length > 0) {
            html += '<div class="ai-summary-preview">' +
                '<div class="ai-preview-header">' +
                '<span><i class="fa-solid fa-table"></i> 데이터 미리보기 (' + r.result.values.length + '건)</span>' +
                '<button class="ai-btn-link" onclick="document.querySelector(\'[data-tab=grid]\').click()">전체 보기 →</button>' +
                '</div>' +
                buildDataTable(r.result, 10) +
                '</div>';
        }

        // SQL Display
        if (r.sql) {
            html += '<details class="ai-sql-detail" open>' +
                '<summary><i class="fa-solid fa-code"></i> 실행된 SQL 쿼리</summary>' +
                '<pre class="ai-sql-code">' + escapeHtml(r.sql) + '</pre>' +
                '</details>';
        }

        html += '</div>';
        canvas.innerHTML = html;

        // KPI 카운트업 애니메이션 실행
        if (window.animateCountUp) {
            canvas.querySelectorAll('.countup-value[data-countup]').forEach(function (el) {
                var target = parseFloat(el.getAttribute('data-countup'));
                if (!isNaN(target) && target > 0) {
                    var suffix = '';
                    var displayText = el.textContent;
                    // 단위 추출
                    if (displayText.indexOf('원') >= 0 || displayText.indexOf('억') >= 0 || displayText.indexOf('만') >= 0) {
                        // 금액은 포맷팅된 최종 값을 직접 설정 (카운트업 어려움)
                        return;
                    }
                    if (displayText.match(/[건%개EA]/)) {
                        suffix = displayText.replace(/[0-9,.]/g, '').trim();
                    }
                    window.animateCountUp(el, Math.round(target), 900, suffix);
                }
            });
        }
    }

    // ── Data Grid 탭 ─────────────────────────────────────────

    var gridSortCol = -1;
    var gridSortAsc = true;

    function renderGridTab() {
        var canvas = document.getElementById('ai-canvas-content');
        if (!canvas || !currentResult || !currentResult.result) return;

        var r = currentResult.result;
        var html = '<div class="ai-grid-view">';

        html += '<div class="ai-grid-toolbar">' +
            '<span class="ai-grid-count"><i class="fa-solid fa-table-cells"></i> 총 <strong>' + r.values.length + '</strong>건 조회</span>' +
            '<button class="ai-btn-sm" id="ai-export-csv"><i class="fa-solid fa-download"></i> CSV 다운로드</button>' +
            '</div>';

        html += buildDataTable(r, 0, true);
        html += '</div>';
        canvas.innerHTML = html;

        // Sort handlers
        canvas.querySelectorAll('.ai-grid-sortable').forEach(function (th) {
            th.addEventListener('click', function () {
                var colIdx = parseInt(th.getAttribute('data-col'));
                if (gridSortCol === colIdx) {
                    gridSortAsc = !gridSortAsc;
                } else {
                    gridSortCol = colIdx;
                    gridSortAsc = true;
                }
                sortAndRerender();
            });
        });

        // Export CSV
        var exportBtn = document.getElementById('ai-export-csv');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                exportCSV(r);
            });
        }
    }

    function sortAndRerender() {
        if (!currentResult || !currentResult.result) return;
        if (gridSortCol >= 0) {
            currentResult.result.values.sort(function (a, b) {
                var va = a[gridSortCol], vb = b[gridSortCol];
                if (va == null) return 1;
                if (vb == null) return -1;
                if (typeof va === 'number' && typeof vb === 'number') return gridSortAsc ? va - vb : vb - va;
                return gridSortAsc ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
            });
        }
        renderGridTab();
    }

    function buildDataTable(result, maxRows, sortable) {
        if (!result || !result.columns) return '<p>데이터 없음</p>';
        var cols = result.columns;
        var rows = result.values;
        if (maxRows && maxRows > 0) rows = rows.slice(0, maxRows);

        var html = '<div class="ai-table-wrapper"><table class="ai-data-table">';
        html += '<thead><tr>';
        cols.forEach(function (col, idx) {
            if (sortable) {
                var arrow = gridSortCol === idx ? (gridSortAsc ? ' ▲' : ' ▼') : '';
                html += '<th class="ai-grid-sortable" data-col="' + idx + '">' + escapeHtml(col) + arrow + '</th>';
            } else {
                html += '<th>' + escapeHtml(col) + '</th>';
            }
        });
        html += '</tr></thead><tbody>';
        rows.forEach(function (row, ri) {
            html += '<tr>';
            row.forEach(function (cell, ci) {
                var val = cell;
                var cellClass = '';
                if (typeof cell === 'number') {
                    // 금액 컬럼 자동 포맷팅
                    var colName = cols[ci] || '';
                    if (colName.indexOf('금') >= 0 || colName.indexOf('비') >= 0 || colName.indexOf('액') >= 0 || colName.indexOf('원가') >= 0 || colName.indexOf('예산') >= 0) {
                        val = AIEngine.formatCurrency(cell);
                        cellClass = 'currency-cell';
                    } else if (colName.indexOf('률') >= 0 || colName.indexOf('%') >= 0) {
                        val = (cell * 100).toFixed(1) + '%';
                        cellClass = 'num-cell';
                    } else {
                        val = AIEngine.formatNumber(cell);
                        cellClass = 'num-cell';
                    }
                }
                if (val == null) val = '-';
                html += '<td' + (cellClass ? ' class="' + cellClass + '"' : '') + '>' + escapeHtml(String(val)) + '</td>';
            });
            html += '</tr>';
        });
        html += '</tbody></table></div>';
        return html;
    }

    // ── Chart 탭 ─────────────────────────────────────────────

    function renderChartTab() {
        var canvas = document.getElementById('ai-canvas-content');
        if (!canvas || !currentResult || !currentResult.result) return;

        var r = currentResult;
        var result = r.result;

        if (!result.values || result.values.length === 0) {
            canvas.innerHTML = '<div class="ai-chart-empty"><i class="fa-solid fa-chart-column"></i><p>시각화할 데이터가 없습니다.</p></div>';
            return;
        }

        // Chart type buttons
        var types = ['bar', 'horizontalBar', 'line', 'pie', 'doughnut'];
        var typeLabels = { bar: '세로 막대', horizontalBar: '가로 막대', line: '선', pie: '파이', doughnut: '도넛' };
        var typeIcons = { bar: 'fa-chart-column', horizontalBar: 'fa-chart-bar', line: 'fa-chart-line', pie: 'fa-chart-pie', doughnut: 'fa-circle-half-stroke' };

        var html = '<div class="ai-chart-view">';
        html += '<div class="ai-chart-toolbar">';
        types.forEach(function (t) {
            html += '<button class="ai-chart-type-btn' + (r.chartType === t ? ' active' : '') + '" data-chart-type="' + t + '">' +
                '<i class="fa-solid ' + typeIcons[t] + '"></i> ' + typeLabels[t] + '</button>';
        });
        html += '</div>';
        html += '<div class="ai-chart-container"><canvas id="ai-chart-canvas"></canvas></div>';
        html += '</div>';

        canvas.innerHTML = html;

        // Type buttons
        canvas.querySelectorAll('.ai-chart-type-btn').forEach(function (btn) {
            btn.addEventListener('click', function () {
                r.chartType = btn.getAttribute('data-chart-type');
                renderChartTab();
            });
        });

        // Build chart
        buildChart(r.chartType, result, r.chartConfig, r.title);
    }

    function buildChart(type, result, config, title) {
        if (chartInstance) { chartInstance.destroy(); chartInstance = null; }
        var canvasEl = document.getElementById('ai-chart-canvas');
        if (!canvasEl) return;

        var labelCol = config && config.labelColumn != null ? config.labelColumn : 0;
        var dataCols = config && config.dataColumns ? config.dataColumns : [1];
        var dataLabels = config && config.dataLabels ? config.dataLabels : result.columns.slice(1);

        // Special: pie/doughnut with labelColumn=-1 → use dataLabels as labels
        var labels;
        if (labelCol < 0) {
            labels = dataLabels;
        } else {
            labels = result.values.map(function (row) { return row[labelCol] || ''; });
        }

        var colors = [
            '#3B82F6', '#8B5CF6', '#EC4899', '#F59E0B', '#10B981',
            '#6366F1', '#EF4444', '#14B8A6', '#F97316', '#84CC16',
            '#06B6D4', '#E11D48', '#7C3AED', '#0EA5E9', '#D946EF'
        ];

        var datasets = [];
        if (type === 'pie' || type === 'doughnut') {
            var data;
            if (labelCol < 0) {
                // 단일 행, 여러 열
                data = dataCols.map(function (ci) { return result.values[0][ci] || 0; });
            } else {
                data = result.values.map(function (row) { return row[dataCols[0]] || 0; });
            }
            datasets.push({
                data: data,
                backgroundColor: colors.slice(0, data.length),
                borderWidth: 2,
                borderColor: 'var(--bg-card, #fff)'
            });
        } else {
            dataCols.forEach(function (ci, i) {
                datasets.push({
                    label: dataLabels[i] || result.columns[ci] || '',
                    data: result.values.map(function (row) { return row[ci] || 0; }),
                    backgroundColor: colors[i] + '88',
                    borderColor: colors[i],
                    borderWidth: 2,
                    borderRadius: 4,
                    fill: type === 'line'
                });
            });
        }

        var isHorizontal = type === 'horizontalBar';
        var chartType = isHorizontal ? 'bar' : type;

        chartInstance = new Chart(canvasEl, {
            type: chartType,
            data: { labels: labels, datasets: datasets },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                indexAxis: isHorizontal ? 'y' : 'x',
                plugins: {
                    legend: { display: datasets.length > 1 || type === 'pie' || type === 'doughnut', labels: { color: 'var(--text-primary)', font: { size: 11 } } },
                    title: { display: true, text: title || '', color: 'var(--text-primary)', font: { size: 14, weight: 700 } },
                    tooltip: {
                        backgroundColor: 'rgba(15, 23, 42, 0.95)',
                        titleFont: { size: 12, weight: 700 },
                        bodyFont: { size: 11 },
                        padding: 12,
                        cornerRadius: 8,
                        displayColors: true,
                        boxPadding: 4,
                        callbacks: {
                            label: function (ctx) {
                                var val = ctx.raw;
                                if (val == null && ctx.parsed) {
                                    val = isHorizontal ? ctx.parsed.x : ctx.parsed.y;
                                }
                                if (typeof val === 'object') val = ctx.raw;
                                var formatted = AIEngine.formatNumber(val);
                                var prefix = (ctx.dataset.label || '') + ': ';
                                return prefix + formatted;
                            },
                            afterLabel: function (ctx) {
                                // 전체 대비 % 표시
                                var val = ctx.raw;
                                if (val == null && ctx.parsed) {
                                    val = isHorizontal ? ctx.parsed.x : ctx.parsed.y;
                                }
                                if (typeof val !== 'number') return '';
                                var total = ctx.dataset.data.reduce(function (sum, v) { return sum + (v || 0); }, 0);
                                if (total > 0) {
                                    var pct = ((val / total) * 100).toFixed(1);
                                    return '전체 대비 ' + pct + '%';
                                }
                                return '';
                            }
                        }
                    }
                },
                scales: (type !== 'pie' && type !== 'doughnut') ? {
                    x: { ticks: { color: 'var(--text-secondary)', font: { size: 10 } }, grid: { color: 'var(--border)', borderDash: [3, 3] } },
                    y: { ticks: { color: 'var(--text-secondary)', font: { size: 10 } }, grid: { color: 'var(--border)', borderDash: [3, 3] } }
                } : undefined
            }
        });
    }

    // ── CSV Export ────────────────────────────────────────────

    function exportCSV(result) {
        if (!result || !result.columns) return;
        var csv = result.columns.join(',') + '\n';
        result.values.forEach(function (row) {
            csv += row.map(function (cell) {
                if (cell == null) return '';
                var s = String(cell);
                if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0) return '"' + s.replace(/"/g, '""') + '"';
                return s;
            }).join(',') + '\n';
        });
        var blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' });
        var url = URL.createObjectURL(blob);
        var a = document.createElement('a');
        a.href = url;
        a.download = 'cube_ai_result_' + new Date().toISOString().slice(0, 10) + '.csv';
        a.click();
        URL.revokeObjectURL(url);
    }

    // ── 이벤트 핸들러 ────────────────────────────────────────

    function setupEventHandlers() {
        // Send button
        var sendBtn = document.getElementById('ai-send-btn');
        var input = document.getElementById('ai-input');
        if (sendBtn) {
            sendBtn.addEventListener('click', function () {
                sendMessage(input ? input.value : '');
            });
        }
        // Enter key
        if (input) {
            input.addEventListener('keydown', function (e) {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendMessage(input.value);
                }
            });
        }

        // Clear chat button
        var clearBtn = document.getElementById('ai-clear-chat');
        if (clearBtn) {
            clearBtn.addEventListener('click', function () {
                if (chatMessages.length === 0) return;
                clearChat();
            });
        }

        // Export chat as text file
        var exportBtn = document.getElementById('ai-export-chat');
        if (exportBtn) {
            exportBtn.addEventListener('click', function () {
                if (chatMessages.length === 0) { alert('내보낼 대화가 없습니다.'); return; }
                var lines = [];
                lines.push('=== CUBE-AI 대화 기록 ===');
                lines.push('날짜: ' + new Date().toLocaleString('ko-KR'));
                lines.push('프로젝트: 인천소방학교 이전 신축공사');
                lines.push('');
                chatMessages.forEach(function (msg) {
                    var prefix = msg.role === 'user' ? '👤 사용자' : '🤖 AI';
                    lines.push('[' + prefix + '] ' + (msg.title ? msg.title + ': ' : '') + msg.text);
                    if (msg.sql) lines.push('   SQL: ' + msg.sql);
                    lines.push('');
                });
                var blob = new Blob([lines.join('\n')], { type: 'text/plain;charset=utf-8' });
                var url = URL.createObjectURL(blob);
                var a = document.createElement('a');
                a.href = url;
                a.download = 'CUBE-AI_Chat_' + new Date().toISOString().slice(0, 10) + '.txt';
                a.click();
                URL.revokeObjectURL(url);
            });
        }

        // Save chat to LocalStorage
        var saveBtn = document.getElementById('ai-save-chat');
        if (saveBtn) {
            saveBtn.addEventListener('click', function () {
                if (chatMessages.length === 0) { alert('저장할 대화가 없습니다.'); return; }
                var saveData = {
                    timestamp: new Date().toISOString(),
                    messages: chatMessages,
                    result: currentResult
                };
                // Get existing saves
                var saves = JSON.parse(localStorage.getItem('cubeai_chat_saves') || '[]');
                saves.unshift(saveData);
                if (saves.length > 10) saves = saves.slice(0, 10); // max 10 saves
                localStorage.setItem('cubeai_chat_saves', JSON.stringify(saves));
                alert('✅ 대화가 저장되었습니다. (' + saves.length + '개 보관 중)');
            });
        }

        // Load chat from LocalStorage
        var loadBtn = document.getElementById('ai-load-chat');
        if (loadBtn) {
            loadBtn.addEventListener('click', function () {
                var saves = JSON.parse(localStorage.getItem('cubeai_chat_saves') || '[]');
                if (saves.length === 0) { alert('저장된 대화가 없습니다.'); return; }
                var options = saves.map(function (s, i) {
                    var d = new Date(s.timestamp);
                    var label = d.toLocaleString('ko-KR') + ' (' + s.messages.length + '개 메시지)';
                    return (i + 1) + '. ' + label;
                });
                var choice = prompt('불러올 대화를 선택하세요:\n\n' + options.join('\n') + '\n\n번호를 입력하세요:');
                if (!choice) return;
                var idx = parseInt(choice) - 1;
                if (idx < 0 || idx >= saves.length) { alert('잘못된 번호입니다.'); return; }
                chatMessages = saves[idx].messages || [];
                currentResult = saves[idx].result || null;
                saveChatState();
                renderChatMessages();
                if (currentResult) {
                    activeTab = 'summary';
                    updateTabBar();
                    renderCanvasContent();
                } else {
                    renderWelcomeScreen();
                }
            });
        }

        // Tab switching
        document.querySelectorAll('.ai-tab').forEach(function (tab) {
            tab.addEventListener('click', function () {
                activeTab = tab.getAttribute('data-tab');
                updateTabBar();
                renderCanvasContent();
            });
        });

        // API Key modal
        var settingsBtn = document.getElementById('ai-settings-btn');
        var connectLink = document.getElementById('ai-connect-link');
        var modalOverlay = document.getElementById('ai-modal-overlay');
        var modalClose = document.getElementById('ai-modal-close');
        var keyCancel = document.getElementById('ai-key-cancel');
        var keySave = document.getElementById('ai-key-save');
        var keyInput = document.getElementById('ai-key-input');
        var keyToggle = document.getElementById('ai-key-toggle');

        console.log('[AI] Modal elements:', {
            settingsBtn: !!settingsBtn, modalOverlay: !!modalOverlay,
            keySave: !!keySave, keyInput: !!keyInput, keyCancel: !!keyCancel
        });

        function showModal() { if (modalOverlay) modalOverlay.style.display = 'flex'; }
        function hideModal() { if (modalOverlay) modalOverlay.style.display = 'none'; }

        if (settingsBtn) settingsBtn.addEventListener('click', showModal);
        if (connectLink) connectLink.addEventListener('click', function (e) { e.preventDefault(); showModal(); });
        if (modalClose) modalClose.addEventListener('click', hideModal);
        if (keyCancel) keyCancel.addEventListener('click', hideModal);
        if (modalOverlay) modalOverlay.addEventListener('click', function (e) { if (e.target === modalOverlay) hideModal(); });

        // Toggle password visibility
        if (keyToggle && keyInput) {
            keyToggle.addEventListener('click', function () {
                keyInput.type = keyInput.type === 'password' ? 'text' : 'password';
                keyToggle.innerHTML = keyInput.type === 'password' ? '<i class="fa-solid fa-eye"></i>' : '<i class="fa-solid fa-eye-slash"></i>';
            });
        }

        // Save API key (Enter 키로도 저장)
        function saveApiKey() {
            var key = keyInput ? keyInput.value.trim() : '';
            if (!key) { alert('API 키를 입력해주세요.'); return; }
            // 관리자 비밀번호 체크
            if (key === '0172') {
                key = AIEngine.getAdminKey();
                if (!key) { alert('관리자 키가 설정되지 않았습니다.'); return; }
                console.log('[AI] Admin key activated');
            }
            AIEngine.setApiKey(key);
            hideModal();
            console.log('[AI] API Key saved, length:', key.length);
            // Update hint
            var hint = container.querySelector('.ai-input-hint');
            if (hint) {
                hint.innerHTML = '<i class="fa-solid fa-circle" style="color:#10B981;font-size:6px"></i> Gemini 연결됨 · <span style="color:var(--text-muted)">자유 질문 가능</span>';
            }
            // Settings button color change
            if (settingsBtn) settingsBtn.style.color = '#10B981';
            addChatMessage('ai', 'Gemini API가 연결되었습니다! 이제 자유로운 자연어 질문이 가능합니다.', { title: '✅ API 연결 완료' });
        }

        if (keySave) {
            keySave.addEventListener('click', saveApiKey);
        }
        // Enter 키로도 API 키 저장
        if (keyInput) {
            keyInput.addEventListener('keydown', function (e) {
                if (e.key === 'Enter') saveApiKey();
            });
        }
    }

    // ── 유틸리티 ──────────────────────────────────────────────

    function escapeHtml(str) {
        if (!str) return '';
        return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }

    // 분석 텍스트 포맷팅: escapeHtml + 줄바꿈 + **bold** 마크다운 처리
    function formatAnalysisText(str) {
        if (!str) return '';
        var escaped = escapeHtml(String(str));
        // \\n (이스케이프된 리터럴) → <br>
        escaped = escaped.replace(/\\n/g, '<br>');
        // 실제 줄바꿈 → <br>
        escaped = escaped.replace(/\n/g, '<br>');
        // **bold** → <strong>
        escaped = escaped.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        // ` → 불필요, 이미 이스케이프됨
        return escaped;
    }
}

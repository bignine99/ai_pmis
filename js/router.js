/**
 * ============================================================
 * SPA Router (Single Page Application 라우터)
 * ============================================================
 * 
 * 역할: URL의 해시(#) 변경을 감지하여 해당 페이지를 렌더링합니다.
 * 예시: index.html#/cost → 원가관리 페이지 표시
 * 
 * 이 방식은 서버 없이도 브라우저에서 페이지 전환이 가능합니다.
 */

// 등록된 페이지(route) 목록을 저장할 객체
const routes = {};

/**
 * 새로운 페이지(route)를 등록합니다.
 * @param {string} path - URL 경로 (예: '/cost')
 * @param {Function} renderFn - 해당 경로에서 실행할 렌더링 함수
 */
export function addRoute(path, renderFn) {
    routes[path] = renderFn;
}

/**
 * 현재 URL 해시를 읽고, 해당하는 페이지를 렌더링합니다.
 * 예: URL이 index.html#/cost 이면 '/cost'에 등록된 함수 실행
 */
export function navigateTo(path) {
    window.location.hash = path;
}

/**
 * 라우터를 시작합니다. 
 * - 해시 변경 이벤트를 감지
 * - 페이지 로드 시 현재 해시를 확인
 */
export function startRouter() {
    window.addEventListener('hashchange', handleRouteChange);
    // 처음 로드 시에도 라우팅 실행
    handleRouteChange();
}

/**
 * 해시 변경 시 호출되는 내부 함수
 */
function handleRouteChange() {
    // URL에서 해시 부분 추출 (예: '#/cost' → '/cost')
    const hash = window.location.hash.slice(1) || '/overview';

    // 콘텐츠를 표시할 영역
    const contentArea = document.getElementById('content-area');
    if (!contentArea) return;

    // 페이지 전환 애니메이션: 페이드 아웃 → 내용 교체 → 페이드 인
    contentArea.style.opacity = '0';
    contentArea.style.transform = 'translateY(10px)';

    setTimeout(() => {
        // 등록된 라우트가 있으면 실행, 없으면 기본(overview) 실행
        const renderFn = routes[hash] || routes['/overview'];
        if (renderFn) {
            renderFn(contentArea);
        } else {
            contentArea.innerHTML = '<p class="text-muted">페이지를 찾을 수 없습니다.</p>';
        }

        // 사이드바 활성 메뉴 업데이트
        updateActiveNav(hash);

        // 페이드 인 애니메이션
        contentArea.style.transition = 'opacity 0.3s ease, transform 0.3s ease';
        contentArea.style.opacity = '1';
        contentArea.style.transform = 'translateY(0)';
    }, 150);
}

/**
 * 사이드바 네비게이션의 활성(active) 상태를 업데이트합니다.
 */
function updateActiveNav(currentPath) {
    document.querySelectorAll('.nav-link').forEach(link => {
        link.classList.remove('active');
        const section = link.getAttribute('data-section');
        if (currentPath === '/' + section) {
            link.classList.add('active');
        }
    });
}

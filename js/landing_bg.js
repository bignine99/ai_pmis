/**
 * Landing Page Dynamic Background
 * Inspired by Ninetynine website: Wave Pulse + Data Flow + Data Spiral
 */
(function () {
    var canvas = document.getElementById('landing-bg-canvas');
    if (!canvas) return;
    var ctx = canvas.getContext('2d');
    var dpr = window.devicePixelRatio || 1;
    var W, H;
    var particles = [];
    var waves = [];
    var PARTICLE_COUNT = 70;
    var WAVE_COUNT = 3;
    var animId;

    // ── Colors (cyan/teal brand palette) ──
    var colors = [
        'rgba(0, 180, 216, ',   // cyan
        'rgba(72, 202, 228, ',  // light teal
        'rgba(0, 150, 199, ',   // deep cyan
        'rgba(0, 113, 227, ',   // blue
        'rgba(144, 224, 239, '  // pale aqua
    ];

    function resize() {
        W = canvas.width = canvas.offsetWidth * dpr;
        H = canvas.height = canvas.offsetHeight * dpr;
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    }

    // ── Particle ──
    function Particle() {
        this.reset();
    }
    Particle.prototype.reset = function () {
        this.x = Math.random() * (W / dpr);
        this.y = Math.random() * (H / dpr);
        this.r = Math.random() * 9.5 + 0.5;
        this.vx = (Math.random() - 0.5) * 1.1;
        this.vy = (Math.random() - 0.5) * 0.85;
        this.color = colors[Math.floor(Math.random() * colors.length)];
        this.alpha = Math.random() * 0.4 + 0.4;
        this.pulse = Math.random() * Math.PI * 2;
        this.pulseSpeed = Math.random() * 0.02 + 0.01;
    };
    Particle.prototype.update = function () {
        this.x += this.vx;
        this.y += this.vy;
        this.pulse += this.pulseSpeed;
        this.alpha = 0.4 + 0.35 * Math.sin(this.pulse);

        var w = W / dpr, h = H / dpr;
        if (this.x < -10) this.x = w + 10;
        if (this.x > w + 10) this.x = -10;
        if (this.y < -10) this.y = h + 10;
        if (this.y > h + 10) this.y = -10;
    };
    Particle.prototype.draw = function () {
        ctx.beginPath();
        ctx.arc(this.x, this.y, this.r, 0, Math.PI * 2);
        ctx.fillStyle = this.color + this.alpha + ')';
        ctx.fill();
    };

    // ── Wave (Wave Pulse effect) ──
    function Wave(i) {
        this.amplitude = 20 + Math.random() * 30;
        this.wavelength = 300 + Math.random() * 200;
        this.speed = 0.006 + Math.random() * 0.008;
        this.yBase = (H / dpr) * (0.25 + i * 0.25);
        this.phase = Math.random() * Math.PI * 2;
        this.color = colors[i % colors.length];
        // Differentiated: thick / medium / thin
        var thicknesses = [3.5, 2.0, 0.7];
        this.lineWidth = thicknesses[i % 3];
    }
    Wave.prototype.update = function () {
        this.phase += this.speed;
    };
    Wave.prototype.draw = function () {
        var w = W / dpr;
        ctx.beginPath();
        ctx.strokeStyle = this.color + '0.3)';
        ctx.lineWidth = this.lineWidth;
        for (var x = 0; x <= w; x += 3) {
            var y = this.yBase + Math.sin((x / this.wavelength) * Math.PI * 2 + this.phase) * this.amplitude;
            if (x === 0) ctx.moveTo(x, y);
            else ctx.lineTo(x, y);
        }
        ctx.stroke();
    };

    // ── Connection Lines (Data Flow effect) ──
    function drawConnections() {
        var maxDist = 120;
        for (var i = 0; i < particles.length; i++) {
            for (var j = i + 1; j < particles.length; j++) {
                var dx = particles[i].x - particles[j].x;
                var dy = particles[i].y - particles[j].y;
                var dist = Math.sqrt(dx * dx + dy * dy);
                if (dist < maxDist) {
                    var alpha = (1 - dist / maxDist) * 0.2;
                    ctx.beginPath();
                    ctx.moveTo(particles[i].x, particles[i].y);
                    ctx.lineTo(particles[j].x, particles[j].y);
                    ctx.strokeStyle = 'rgba(0, 180, 216, ' + alpha + ')';
                    ctx.lineWidth = 0.8;
                    ctx.stroke();
                }
            }
        }
    }

    // ── Init ──
    function init() {
        resize();
        particles = [];
        waves = [];
        for (var i = 0; i < PARTICLE_COUNT; i++) {
            particles.push(new Particle());
        }
        for (var w = 0; w < WAVE_COUNT; w++) {
            waves.push(new Wave(w));
        }
    }

    // ── Animation Loop ──
    function animate() {
        ctx.clearRect(0, 0, W / dpr, H / dpr);

        // Draw waves
        for (var w = 0; w < waves.length; w++) {
            waves[w].update();
            waves[w].draw();
        }

        // Draw connections
        drawConnections();

        // Draw particles
        for (var i = 0; i < particles.length; i++) {
            particles[i].update();
            particles[i].draw();
        }

        animId = requestAnimationFrame(animate);
    }

    // ── Start ──
    init();
    animate();

    window.addEventListener('resize', function () {
        init();
    });

    // Cleanup when landing page is hidden
    var observer = new MutationObserver(function () {
        var landing = document.getElementById('landing-page');
        if (landing && landing.style.display === 'none') {
            cancelAnimationFrame(animId);
        } else if (landing && landing.style.display !== 'none') {
            init();
            animate();
        }
    });
    var landingEl = document.getElementById('landing-page');
    if (landingEl) {
        observer.observe(landingEl, { attributes: true, attributeFilter: ['style'] });
    }
})();

/* ═══════════════════════════════════════════════════════════════
   SCROLL REVEAL + COUNT-UP ANIMATION
   ═══════════════════════════════════════════════════════════════ */
(function () {
    // Scroll reveal observer
    var revealEls = document.querySelectorAll('.landing-reveal');
    if (!revealEls.length) return;

    var observer = new IntersectionObserver(function (entries) {
        entries.forEach(function (entry) {
            if (entry.isIntersecting) {
                entry.target.classList.add('revealed');
                // Trigger count-up if this section contains stat numbers
                var statNums = entry.target.querySelectorAll('.landing-stat-num[data-target]');
                statNums.forEach(function (el) {
                    if (el.dataset.counted) return;
                    el.dataset.counted = 'true';
                    animateCountUp(el);
                });
                observer.unobserve(entry.target);
            }
        });
    }, {
        root: document.getElementById('landing-page'),
        threshold: 0.15
    });

    revealEls.forEach(function (el) {
        observer.observe(el);
    });

    // Count-up animation
    function animateCountUp(el) {
        var target = parseInt(el.dataset.target, 10);
        var prefix = el.dataset.prefix || '';
        var suffix = el.dataset.suffix || '';
        var duration = 1800; // ms
        var startTime = null;

        function step(timestamp) {
            if (!startTime) startTime = timestamp;
            var progress = Math.min((timestamp - startTime) / duration, 1);
            // Ease out cubic
            var eased = 1 - Math.pow(1 - progress, 3);
            var current = Math.round(eased * target);
            el.textContent = prefix + current + suffix;
            if (progress < 1) {
                requestAnimationFrame(step);
            }
        }
        requestAnimationFrame(step);
    }
})();

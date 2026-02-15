document.addEventListener('DOMContentLoaded', () => {
    initClickSound();
    fetch('config.json')
        .then(r => r.json())
        .then(config => {
            renderDirecting(config);
            renderNetworkSegments(config);
            renderClientele(config);
            renderUGC(config);
            renderReels(config);
            renderProjects(config);
            renderSocial(config);
            renderResume(config);
            renderContact(config);
            initModal();
            initHamburger();
            initScrollButtons();
            initScrollAnimations();
            initScrollProgress();
        })
        .catch(err => console.error('Failed to load config:', err));
});

/* ===== CLICK SOUND EFFECT ===== */
function initClickSound() {
    const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    function playClick() {
        try {
            const osc = audioCtx.createOscillator();
            const gain = audioCtx.createGain();
            osc.connect(gain);
            gain.connect(audioCtx.destination);
            osc.type = 'sine';
            osc.frequency.setValueAtTime(1200, audioCtx.currentTime);
            osc.frequency.exponentialRampToValueAtTime(600, audioCtx.currentTime + 0.08);
            gain.gain.setValueAtTime(0.15, audioCtx.currentTime);
            gain.gain.exponentialRampToValueAtTime(0.001, audioCtx.currentTime + 0.1);
            osc.start(audioCtx.currentTime);
            osc.stop(audioCtx.currentTime + 0.1);
        } catch(e) {}
    }
    document.addEventListener('click', (e) => {
        if (e.target.closest('.btn, .scroll-btn, .nav-link, .video-card, .featured-card, .social-card, .project-card, .follow-btn, .hamburger, .close, .footer-links a, .portfolio-links a, .resume-header-link a')) {
            if (audioCtx.state === 'suspended') audioCtx.resume();
            playClick();
        }
    });
}

/* ===== 3D DODECAHEDRON SCROLL PROGRESS (Canvas) ===== */
function initScrollProgress() {
    const canvas = document.getElementById('dodecaCanvas');
    const label  = document.getElementById('progressLabel');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height, CX = W/2, CY = H/2;

    // Golden ratio
    const phi = (1 + Math.sqrt(5)) / 2;

    // 20 vertices of a dodecahedron (cube + rectangle combos)
    const raw = [
        // 8 cube vertices
        [1,1,1],[-1,1,1],[-1,-1,1],[1,-1,1],
        [1,1,-1],[-1,1,-1],[-1,-1,-1],[1,-1,-1],
        // 4 vertices on YZ plane
        [0, 1/phi, phi],[0,-1/phi, phi],[0, 1/phi,-phi],[0,-1/phi,-phi],
        // 4 vertices on XZ plane
        [1/phi, phi, 0],[-1/phi, phi, 0],[-1/phi,-phi, 0],[1/phi,-phi, 0],
        // 4 vertices on XY plane
        [phi, 0, 1/phi],[phi, 0,-1/phi],[-phi, 0, 1/phi],[-phi, 0,-1/phi]
    ];

    // Scale to fit canvas (radius ~16 in 84px canvas = nice margin)
    const scale = 14;
    const verts = raw.map(v => v.map(c => c * scale));

    // 12 pentagonal faces (vertex indices, ordered for proper winding)
    const faces = [
        [0, 8, 9, 3, 16],   [0,16,17, 4,12],   [0,12,13, 1, 8],
        [1,13, 5,19,18],     [1,18, 2, 9, 8],    [2,18,19, 6,14],
        [2,14,15, 3, 9],     [3,15, 7,17,16],    [4,17, 7,11,10],
        [4,10, 5,13,12],     [5,10,11, 6,19],    [6,11, 7,15,14]
    ];

    // Face colors: red, blue, green, yellow, pink — cycling
    const faceColors = [
        [229,57,53],  [30,136,229], [67,160,71],
        [253,216,53], [233,30,99],  [229,57,53],
        [30,136,229], [67,160,71],  [253,216,53],
        [233,30,99],  [229,57,53],  [30,136,229]
    ];

    // Rotation matrices
    function rotX(v, a) {
        const c=Math.cos(a), s=Math.sin(a);
        return [v[0], v[1]*c - v[2]*s, v[1]*s + v[2]*c];
    }
    function rotY(v, a) {
        const c=Math.cos(a), s=Math.sin(a);
        return [v[0]*c + v[2]*s, v[1], -v[0]*s + v[2]*c];
    }
    function rotZ(v, a) {
        const c=Math.cos(a), s=Math.sin(a);
        return [v[0]*c - v[1]*s, v[0]*s + v[1]*c, v[2]];
    }

    // Idle rotation angles (updated on scroll + idle timer)
    let angleX = 0.4, angleY = 0.3, angleZ = 0;
    let idleT = 0;
    let lastFrame = performance.now();

    function draw() {
        ctx.clearRect(0, 0, W, H);

        // Apply rotation to all vertices
        const rv = verts.map(v => {
            let r = rotX(v, angleX);
            r = rotY(r, angleY);
            r = rotZ(r, angleZ);
            return r;
        });

        // Simple perspective projection
        const focalLen = 120;
        function project(v) {
            const pz = focalLen / (focalLen + v[2]);
            return [CX + v[0] * pz, CY + v[1] * pz, v[2]];
        }

        const projected = rv.map(project);

        // Compute face depth (average Z of rotated verts) + normal for lighting
        const faceData = faces.map((f, i) => {
            let zSum = 0;
            for (const vi of f) zSum += rv[vi][2];
            const avgZ = zSum / f.length;

            // Face normal via cross product of two edges (for backface / lighting)
            const a = rv[f[0]], b = rv[f[1]], c = rv[f[2]];
            const e1 = [b[0]-a[0], b[1]-a[1], b[2]-a[2]];
            const e2 = [c[0]-a[0], c[1]-a[1], c[2]-a[2]];
            const nx = e1[1]*e2[2] - e1[2]*e2[1];
            const ny = e1[2]*e2[0] - e1[0]*e2[2];
            const nz = e1[0]*e2[1] - e1[1]*e2[0];

            return { idx: i, avgZ, nz };
        });

        // Sort back-to-front (painter's algorithm)
        faceData.sort((a, b) => a.avgZ - b.avgZ);

        // Draw faces
        for (const fd of faceData) {
            // Skip back faces (optional — gives solid look)
            if (fd.nz > 0) continue;

            const f = faces[fd.idx];
            const col = faceColors[fd.idx];

            // Lighting: simple diffuse based on face normal z
            const brightness = 0.45 + 0.55 * Math.max(0, -fd.nz / Math.sqrt(
                (function(){ const a=rv[f[0]],b=rv[f[1]],c=rv[f[2]];
                const e1=[b[0]-a[0],b[1]-a[1],b[2]-a[2]];
                const e2=[c[0]-a[0],c[1]-a[1],c[2]-a[2]];
                const nx=e1[1]*e2[2]-e1[2]*e2[1],ny=e1[2]*e2[0]-e1[0]*e2[2],nz=e1[0]*e2[1]-e1[1]*e2[0];
                return nx*nx+ny*ny+nz*nz;})()
            ));

            ctx.beginPath();
            const p0 = projected[f[0]];
            ctx.moveTo(p0[0], p0[1]);
            for (let j = 1; j < f.length; j++) {
                const pj = projected[f[j]];
                ctx.lineTo(pj[0], pj[1]);
            }
            ctx.closePath();

            const r = Math.round(col[0] * brightness);
            const g = Math.round(col[1] * brightness);
            const b2 = Math.round(col[2] * brightness);
            ctx.fillStyle = `rgba(${r},${g},${b2},0.82)`;
            ctx.fill();
            ctx.strokeStyle = `rgba(255,255,255,0.35)`;
            ctx.lineWidth = 0.5;
            ctx.stroke();
        }
    }

    // Idle spin
    function animate(now) {
        const dt = (now - lastFrame) / 1000;
        lastFrame = now;
        idleT += dt;
        angleX += dt * 0.35;
        angleY += dt * 0.5;
        draw();
        requestAnimationFrame(animate);
    }
    requestAnimationFrame(animate);

    // On scroll: boost rotation speed based on scroll velocity + update label
    let prevScroll = window.scrollY;
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
        if (label) label.textContent = pct + '%';

        // Add rotation proportional to scroll delta
        const delta = scrollTop - prevScroll;
        angleX += delta * 0.008;
        angleY += delta * 0.012;
        prevScroll = scrollTop;
    }, { passive: true });
}

/* ===== SCROLL ANIMATIONS (Intersection Observer) ===== */
function initScrollAnimations() {
    // Track scroll direction
    let lastScrollY = window.scrollY;
    let scrollDir = 'down';
    window.addEventListener('scroll', () => {
        scrollDir = window.scrollY >= lastScrollY ? 'down' : 'up';
        lastScrollY = window.scrollY;
    }, { passive: true });

    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry) => {
            if (entry.isIntersecting) {
                // Set direction class BEFORE adding visible so CSS picks up the right transform origin
                if (scrollDir === 'up') {
                    entry.target.classList.add('scroll-up');
                    entry.target.classList.remove('scroll-down');
                } else {
                    entry.target.classList.add('scroll-down');
                    entry.target.classList.remove('scroll-up');
                }
                entry.target.classList.add('visible');
            } else {
                entry.target.classList.remove('visible');
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.anim-fade-up, .anim-stagger').forEach(el => observer.observe(el));

    // Observe scroll rows for 3D grow animation
    const rowObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('anim-visible');
            } else {
                entry.target.classList.remove('anim-visible');
            }
        });
    }, { threshold: 0.05, rootMargin: '0px 0px -20px 0px' });
    document.querySelectorAll('.scroll-row').forEach(el => rowObserver.observe(el));
}

/* ===== SCROLL BUTTONS ===== */
function initScrollButtons() {
    document.querySelectorAll('.scroll-row-wrap').forEach(wrap => {
        const row = wrap.querySelector('.scroll-row');
        const leftBtn = wrap.querySelector('.scroll-left');
        const rightBtn = wrap.querySelector('.scroll-right');
        if (!row) return;
        const scrollAmt = 400;
        if (leftBtn) leftBtn.addEventListener('click', () => row.scrollBy({ left: -scrollAmt, behavior: 'smooth' }));
        if (rightBtn) rightBtn.addEventListener('click', () => row.scrollBy({ left: scrollAmt, behavior: 'smooth' }));
    });
}

/* ===== REELS ===== */
function renderReels(config) {
    const container = document.getElementById('reelsContainer');
    if (!container || !config.videos?.reels) return;
    container.innerHTML = config.videos.reels.map(reel => `
        <div class="reel-card">
            <div class="reel-video">
                <iframe src="https://drive.google.com/file/d/${reel.fileId}/preview"
                    allow="autoplay; encrypted-media" allowfullscreen loading="lazy"></iframe>
            </div>
            <h3>${reel.title}</h3>
            <p>${reel.description}</p>
        </div>
    `).join('');
}

/* ===== FEATURED WORK HELPERS ===== */
function extractYouTubeId(url) {
    let m = url.match(/(?:youtube\.com\/(?:watch\?v=|shorts\/)|youtu\.be\/)([a-zA-Z0-9_-]{11})/);
    return m ? m[1] : null;
}

function getPlatformIcon(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'fa-brands fa-youtube';
    if (url.includes('tiktok.com')) return 'fa-brands fa-tiktok';
    if (url.includes('instagram.com')) return 'fa-brands fa-instagram';
    return 'fa-solid fa-play';
}

function getPlatformLabel(url) {
    if (url.includes('youtube.com') || url.includes('youtu.be')) return 'YouTube';
    if (url.includes('tiktok.com')) return 'TikTok';
    if (url.includes('instagram.com')) return 'Instagram';
    return 'Watch';
}

function buildFeaturedCard(item) {
    const ytId = extractYouTubeId(item.url);
    let thumbHtml;
    if (ytId) {
        thumbHtml = `<img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="${item.title}" loading="lazy"
            onerror="this.src='https://img.youtube.com/vi/${ytId}/mqdefault.jpg'">`;
    } else {
        const icon = getPlatformIcon(item.url);
        thumbHtml = `<div class="thumb-placeholder"><i class="${icon}"></i></div>`;
    }

    const statsHtml = item.stats
        ? `<div class="stats"><i class="fas fa-eye"></i> ${item.stats}</div>`
        : `<div class="stats"><i class="${getPlatformIcon(item.url)}"></i> ${getPlatformLabel(item.url)}</div>`;

    // YouTube videos open in modal; others open externally
    if (ytId) {
        return `
        <div class="featured-card" data-yt-id="${ytId}" style="cursor:pointer">
            <div class="thumb-wrap">
                ${thumbHtml}
                <div class="play-overlay"><i class="fas fa-play-circle"></i></div>
            </div>
            <div class="card-info">
                <h4>${item.title}</h4>
                ${statsHtml}
            </div>
        </div>`;
    }

    return `
        <a href="${item.url}" target="_blank" rel="noopener" class="featured-card">
            <div class="thumb-wrap">
                ${thumbHtml}
                <div class="play-overlay"><i class="fas fa-external-link-alt"></i></div>
            </div>
            <div class="card-info">
                <h4>${item.title}</h4>
                ${statsHtml}
            </div>
        </a>`;
}

/* ===== 1. CONTENT SAMPLES 16:9 (Horizontal UGC) ===== */
function renderDirecting(config) {
    const grid = document.getElementById('horizontalGrid');
    if (!grid || !config.videos?.ugc?.horizontal) return;
    grid.innerHTML = config.videos.ugc.horizontal.map(item => createHorizontalCard(item)).join('');
}

function createHorizontalCard(item) {
    const id = typeof item === 'string' ? item : item.id;
    const title = typeof item === 'string' ? '' : (item.title || '');
    const hasCustomThumb = (typeof item === 'object' && item.thumb);
    const thumbId = hasCustomThumb ? item.thumb : id;
    const thumbUrl = `https://drive.google.com/thumbnail?id=${thumbId}&sz=w640`;
    const fallbackUrl = `https://lh3.googleusercontent.com/d/${thumbId}=w640`;
    const thumbClass = (typeof item === 'object' && item.thumbContain) ? 'thumb logo-thumb' : 'thumb';
    return `
        <div class="video-card horizontal h-scroll-card" data-id="${id}" data-orientation="horizontal">
            <div class="thumb-wrap">
                <img class="${thumbClass}" src="${thumbUrl}" alt="${title}" loading="lazy"
                     onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackUrl}'}else{this.outerHTML='<div class=\\'thumb-placeholder\\'><i class=\\'fas fa-video\\'></i><span>${title}</span></div>'}">
                <div class="play-overlay"><i class="fas fa-play-circle"></i></div>
            </div>
            ${title ? `<div class="card-title">${title}</div>` : ''}
        </div>`;
}

/* ===== 2. NETWORK SEGMENTS (AGT) ===== */
function renderNetworkSegments(config) {
    const row = document.getElementById('networkRow');
    if (!row || !config.featuredWork?.agt) return;
    row.innerHTML = config.featuredWork.agt.items.map(buildFeaturedCard).join('');
}

/* ===== 3. SOCIAL MEDIA CLIENTELE ===== */
function renderClientele(config) {
    const row = document.getElementById('clienteleRow');
    if (!row || !config.featuredWork?.socialMedia) return;
    row.innerHTML = config.featuredWork.socialMedia.items.map(buildFeaturedCard).join('');
}

/* ===== 4. UGC VIDEOS (Vertical) ===== */
function createVideoCard(item, orientation) {
    const id = typeof item === 'string' ? item : item.id;
    const title = typeof item === 'string' ? '' : (item.title || '');
    const thumbUrl = `https://drive.google.com/thumbnail?id=${id}&sz=w800`;
    const fallbackUrl = `https://lh3.googleusercontent.com/d/${id}=w800`;
    return `
        <div class="video-card ${orientation}" data-id="${id}" data-orientation="${orientation}">
            <div class="thumb-wrap">
                <img class="thumb" src="${thumbUrl}" alt="${title}" loading="lazy"
                     onerror="if(!this.dataset.retry){this.dataset.retry='1';this.src='${fallbackUrl}'}else{this.outerHTML='<div class=\\'thumb-placeholder\\'><i class=\\'fas fa-video\\'></i><span>${title}</span></div>'}">
                <div class="play-overlay"><i class="fas fa-play-circle"></i></div>
            </div>
            ${title ? `<div class="card-title">${title}</div>` : ''}
        </div>`;
}

function renderUGC(config) {
    const vGrid = document.getElementById('verticalGrid');
    if (!vGrid || !config.videos?.ugc?.vertical) return;
    const titled = config.videos.ugc.vertical.filter(item => {
        if (typeof item === 'string') return false;
        return item.title && item.title.trim().length > 0;
    });
    vGrid.innerHTML = titled.map(item => createVideoCard(item, 'vertical')).join('');
}

/* ===== PROJECTS ===== */
function renderProjects(config) {
    const grid = document.getElementById('projectsGrid');
    if (!grid || !config.site?.projects) return;
    grid.innerHTML = config.site.projects.map(p => `
        <a href="${p.url}" target="_blank" rel="noopener" class="project-card">
            <div class="project-bg"><i class="fas ${p.icon}"></i></div>
            <h3>${p.name}</h3>
            <p>${p.description}</p>
            <span class="project-link"><i class="fas fa-arrow-right"></i> Visit</span>
        </a>
    `).join('');
}

/* ===== SOCIAL ===== */
function renderSocial(config) {
    const grid = document.getElementById('socialGrid');
    if (!grid || !config.site?.socials) return;
    const s = config.site.socials;
    let cards = '';
    if (s.instagram) {
        cards += `
        <a href="${s.instagram}" target="_blank" rel="noopener" class="social-card">
            <i class="fab fa-instagram"></i>
            <h3>Instagram</h3>
            <p>${s.instagramHandle || '@zac_stern'}</p>
            <span class="follow-btn">Follow</span>
        </a>`;
    }
    if (s.trend) {
        cards += `
        <a href="${s.trend}" target="_blank" rel="noopener" class="social-card">
            <i class="fas fa-bullhorn"></i>
            <h3>Trend.io</h3>
            <p>UGC Creator Profile</p>
            <span class="follow-btn">View Profile</span>
        </a>`;
    }
    grid.innerHTML = cards;
}

/* ===== RESUME ===== */
function renderResume(config) {
    const container = document.getElementById('resumeContainer');
    if (!container || !config.resume) return;
    const r = config.resume;
    let html = '';
    if (r.experience && r.experience.length) {
        html += '<div class="resume-timeline">';
        r.experience.forEach(exp => {
            html += `<div class="resume-item"><div class="role">${exp.role}</div><div class="show">${exp.show}</div><div class="period">${exp.period}</div><div class="desc">${exp.description}</div></div>`;
        });
        html += '</div>';
    }
    if (r.ugcSummary) {
        html += `<div class="resume-ugc"><h4><i class="fas fa-camera"></i> UGC Creator</h4><p>${r.ugcSummary}</p></div>`;
    }
    if (r.education) {
        html += `<div class="resume-education"><h4><i class="fas fa-graduation-cap"></i> Education</h4><p>${r.education}</p></div>`;
    }
    container.innerHTML = html;
}

/* ===== CONTACT ===== */
function renderContact(config) {
    const info = document.getElementById('contactInfo');
    if (!info || !config.site) return;
    const s = config.site;
    let html = '';
    if (s.email) {
        html += `<div class="contact-item"><i class="fas fa-envelope"></i><div><h3>Email</h3><a href="mailto:${s.email}">${s.email}</a></div></div>`;
    }
    if (s.socials?.instagram) {
        html += `<div class="contact-item"><i class="fab fa-instagram"></i><div><h3>Instagram</h3><a href="${s.socials.instagram}" target="_blank">${s.socials.instagramHandle || '@zac_stern'}</a></div></div>`;
    }
    let links = '';
    if (s.socials?.trend) links += `<a href="${s.socials.trend}" target="_blank">Trend.io</a>`;
    if (s.projects) s.projects.forEach(p => { links += `<a href="${p.url}" target="_blank">${p.name}</a>`; });
    if (links) {
        html += `<div class="contact-item"><i class="fas fa-link"></i><div><h3>Portfolio Links</h3><div class="portfolio-links">${links}</div></div></div>`;
    }
    info.innerHTML = html;
}

/* ===== VIDEO MODAL ===== */
function initModal() {
    const modal = document.getElementById('videoModal');
    const iframe = document.getElementById('modalIframe');
    const modalContent = document.getElementById('modalContent');
    const closeBtn = document.getElementById('modalClose');
    if (!modal || !iframe) return;

    document.addEventListener('click', e => {
        // YouTube featured cards — open in modal
        const featuredCard = e.target.closest('.featured-card[data-yt-id]');
        if (featuredCard) {
            e.preventDefault();
            e.stopPropagation();
            const ytId = featuredCard.dataset.ytId;
            iframe.src = `https://www.youtube.com/embed/${ytId}?autoplay=1`;
            modalContent.className = 'modal-content modal-horizontal';
            modal.style.display = 'block';
            document.body.style.overflow = 'hidden';
            return;
        }

        // Drive video cards — open in modal
        const card = e.target.closest('.video-card');
        if (!card) return;
        const fileId = card.dataset.id;
        const orient = card.dataset.orientation;
        if (!fileId) return;
        iframe.src = `https://drive.google.com/file/d/${fileId}/preview`;
        modalContent.className = 'modal-content ' + (orient === 'horizontal' ? 'modal-horizontal' : 'modal-vertical');
        modal.style.display = 'block';
        document.body.style.overflow = 'hidden';
    });

    function closeModal() {
        modal.style.display = 'none';
        iframe.src = '';
        document.body.style.overflow = '';
    }

    closeBtn.addEventListener('click', closeModal);
    modal.addEventListener('click', e => { if (e.target === modal) closeModal(); });
    document.addEventListener('keydown', e => { if (e.key === 'Escape') closeModal(); });
}

/* ===== HAMBURGER MENU ===== */
function initHamburger() {
    const hamburger = document.querySelector('.hamburger');
    const navMenu = document.querySelector('.nav-menu');
    if (!hamburger || !navMenu) return;
    hamburger.addEventListener('click', () => navMenu.classList.toggle('active'));
    navMenu.querySelectorAll('.nav-link').forEach(link => {
        link.addEventListener('click', () => navMenu.classList.remove('active'));
    });
}

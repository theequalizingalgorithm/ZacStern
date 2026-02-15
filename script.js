document.addEventListener('DOMContentLoaded', () => {
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

/* ===== 3D SCROLL PROGRESS INDICATOR ===== */
function initScrollProgress() {
    const cube = document.getElementById('progressCube');
    if (!cube) return;
    const frontFace = cube.querySelector('.front');
    window.addEventListener('scroll', () => {
        const scrollTop = window.scrollY;
        const docHeight = document.documentElement.scrollHeight - window.innerHeight;
        const pct = docHeight > 0 ? Math.round((scrollTop / docHeight) * 100) : 0;
        // Rotate cube based on scroll: full 360° X and Y over the page
        const rotX = (pct / 100) * 360;
        const rotY = (pct / 100) * 720;
        cube.style.transform = `rotateX(${rotX}deg) rotateY(${rotY}deg)`;
        if (frontFace) frontFace.textContent = pct + '%';
    }, { passive: true });
}

/* ===== SCROLL ANIMATIONS (Intersection Observer) ===== */

function initScrollAnimations() {
    const observer = new IntersectionObserver((entries) => {
        entries.forEach((entry, i) => {
            if (entry.isIntersecting) {
                // Stagger children if it's a stagger container
                if (entry.target.classList.contains('anim-stagger')) {
                    const children = entry.target.children;
                    Array.from(children).forEach((child, idx) => {
                        child.style.transitionDelay = `${idx * 0.08}s`;
                    });
                }
                entry.target.classList.add('visible');
                observer.unobserve(entry.target);
            }
        });
    }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

    document.querySelectorAll('.anim-fade-up, .anim-stagger').forEach(el => observer.observe(el));

    // Observe scroll rows for 3D grow animation
    const rowObserver = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.classList.add('anim-visible');
                rowObserver.unobserve(entry.target);
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

function getTikTokThumbnail(url) {
    // Try to use a TikTok oEmbed proxy for thumbnail — returns a placeholder if unavailable
    const m = url.match(/video\/(\d+)/);
    if (m) return `https://www.tiktok.com/oembed?url=${encodeURIComponent(url)}`;
    return null;
}

function buildFeaturedCard(item) {
    const ytId = extractYouTubeId(item.url);
    let thumbHtml;
    if (ytId) {
        // Use maxresdefault with hqdefault fallback
        thumbHtml = `<img src="https://img.youtube.com/vi/${ytId}/hqdefault.jpg" alt="${item.title}" loading="lazy"
            onerror="this.src='https://img.youtube.com/vi/${ytId}/mqdefault.jpg'">`;
    } else {
        // For IG / TikTok — gradient placeholder with platform icon
        const icon = getPlatformIcon(item.url);
        thumbHtml = `<div class="thumb-placeholder"><i class="${icon}"></i></div>`;
    }

    const statsHtml = item.stats
        ? `<div class="stats"><i class="fas fa-eye"></i> ${item.stats}</div>`
        : `<div class="stats"><i class="${getPlatformIcon(item.url)}"></i> ${getPlatformLabel(item.url)}</div>`;

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
    const thumbClass = hasCustomThumb ? 'thumb logo-thumb' : 'thumb';
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
    vGrid.innerHTML = config.videos.ugc.vertical.map(item => createVideoCard(item, 'vertical')).join('');
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

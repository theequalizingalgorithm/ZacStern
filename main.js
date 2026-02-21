// ============================================================
// MAIN.JS — Flat-Mode Portfolio (Frutiger Aero)
// Clean, liquid-glass scrolling experience
// ============================================================

const SECTION_DATA = [
    { id: 'hero',       name: 'Home'             },
    { id: 'directing',  name: 'Content Samples'  },
    { id: 'network',    name: 'Network Segments' },
    { id: 'ugc',        name: 'UGC Content'      },
    { id: 'clientele',  name: 'Clientele'        },
    { id: 'projects',   name: 'Projects'         },
    { id: 'social',     name: 'Social'           },
    { id: 'resume',     name: 'Resume'           },
    { id: 'contact',    name: "Let's Create"     }
];

class App {
    constructor() {
        this.init();
    }

    init() {
        this.hideLoadingScreen();
        this.initFlatMode();
    }

    // ---- Flat Mode Setup ----
    initFlatMode() {
        document.body.classList.add('flat-mode');

        // Hide any 3D remnants
        const canvas = document.getElementById('worldCanvas');
        if (canvas) canvas.style.display = 'none';
        const spacer = document.getElementById('scrollSpacer');
        if (spacer) spacer.style.display = 'none';

        // Show all section panels as normal flow
        document.querySelectorAll('.section-panel').forEach(panel => {
            panel.classList.add('flat-visible');
        });

        // Navigation
        this._initFlatNavigation();

        // Intersection Observer for scroll-reveal animations
        this._initScrollReveal();
    }

    // ---- Flat navigation: dodecahedron label + nav links ----
    _initFlatNavigation() {
        const sectionIds = SECTION_DATA.map(s => s.id);
        let currentIdx = 0;

        const updateLabel = () => {
            const label = document.getElementById('sectionLabel');
            if (label) {
                label.textContent = SECTION_DATA[currentIdx].name;
                label.style.opacity = '1';
            }
        };

        // Determine current section from scroll position
        const detectCurrentSection = () => {
            const panels = sectionIds.map(id =>
                document.querySelector(`.section-panel[data-section="${id}"]`)
            ).filter(Boolean);
            const viewMid = window.scrollY + window.innerHeight * 0.4;
            for (let i = panels.length - 1; i >= 0; i--) {
                if (panels[i].offsetTop <= viewMid) { currentIdx = i; break; }
            }
            updateLabel();
        };

        window.addEventListener('scroll', detectCurrentSection, { passive: true });
        detectCurrentSection();

        // Wire up nav links for smooth scrolling
        document.querySelectorAll('.nav-link, .btn[href^="#"], .footer-links a[href^="#"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                const id = link.getAttribute('href')?.replace('#', '');
                const idx = sectionIds.indexOf(id);
                if (idx >= 0) {
                    currentIdx = idx;
                    const panel = document.querySelector(`.section-panel[data-section="${id}"]`);
                    if (panel) panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
                    document.querySelector('.nav-menu')?.classList.remove('active');
                    updateLabel();
                }
            });
        });
    }

    // ---- Scroll reveal animations ----
    _initScrollReveal() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('revealed');
                    // Stagger children
                    const children = entry.target.querySelectorAll('.video-card, .featured-card, .project-card, .social-card, .reel-card, .contact-item, .resume-item');
                    children.forEach((child, i) => {
                        child.style.transitionDelay = `${i * 0.06}s`;
                        child.classList.add('revealed');
                    });
                }
            });
        }, { threshold: 0.1, rootMargin: '0px 0px -40px 0px' });

        document.querySelectorAll('.section-panel').forEach(panel => {
            observer.observe(panel);
        });
    }

    // ---- Loading Screen ----
    hideLoadingScreen() {
        const screen = document.getElementById('loadingScreen');
        if (screen) {
            screen.style.opacity = '0';
            setTimeout(() => { screen.style.display = 'none'; }, 600);
        }
    }
}

// ===================== LAUNCH =====================
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        setTimeout(() => new App(), 100);
    });
} else {
    setTimeout(() => new App(), 100);
}

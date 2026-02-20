// ============================================================
// MAIN.JS — Entry Point & Orchestrator
// Immersive 3D Scroll-Driven Portfolio Experience
// ============================================================

import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { World } from './scene.js';
import { CameraController } from './camera.js';
import { SectionManager } from './sections.js';

// ===================== CONFIGURATION =====================
const SECTION_DATA = [
    { id: 'hero',       name: 'Home',              pathT: 0.00,  color: 0x0099e6 },
    { id: 'directing',  name: 'Content Samples',   pathT: 0.12,  color: 0x00b4d8 },
    { id: 'network',    name: 'Network Segments',  pathT: 0.24,  color: 0x0077b6 },
    { id: 'ugc',        name: 'UGC Content',       pathT: 0.36,  color: 0x56c596 },
    { id: 'clientele',  name: 'Clientele',         pathT: 0.48,  color: 0x0099e6 },
    { id: 'projects',   name: 'Projects',          pathT: 0.60,  color: 0xd4a84b },
    { id: 'social',     name: 'Social',            pathT: 0.72,  color: 0xf8bbd0 },
    { id: 'resume',     name: 'Resume',            pathT: 0.84,  color: 0x0077b6 },
    { id: 'contact',    name: "Let's Create",      pathT: 0.96,  color: 0x00b4d8 }
];

// Spherical world parameters
const SPHERE_RADIUS = 42;
const PATH_ALTITUDE = 6;

// Generate winding S-curve path around the sphere
// Wobble aligns with billboard positions so each billboard hits center frame
function generateSpiralPath(numPoints) {
    const points = [];
    const r = SPHERE_RADIUS + PATH_ALTITUDE;
    const wobbleAmp = 4; // world-unit lateral S-curve amplitude

    // First pass: generate base spiral control points
    const basePoints = [];
    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const theta = t * Math.PI * 2.8;
        const phi = Math.PI * 0.34 + t * Math.PI * 0.30;
        basePoints.push(new THREE.Vector3(
            r * Math.sin(phi) * Math.cos(theta),
            r * Math.cos(phi),
            r * Math.sin(phi) * Math.sin(theta)
        ));
    }

    // Second pass: apply lateral S-curve wobble
    for (let i = 0; i < numPoints; i++) {
        const t = i / (numPoints - 1);
        const p = basePoints[i];

        // Compute tangent (forward direction)
        const prev = basePoints[Math.max(0, i - 1)];
        const next = basePoints[Math.min(numPoints - 1, i + 1)];
        const tangent = new THREE.Vector3().subVectors(next, prev).normalize();

        // Radial up direction
        const radialUp = p.clone().normalize();

        // Right vector (lateral direction on sphere surface)
        const right = new THREE.Vector3().crossVectors(tangent, radialUp).normalize();

        // cos(t * PI / 0.12) peaks at even-indexed sections (right side)
        // and troughs at odd-indexed sections (left side)
        const wobble = Math.cos(t * Math.PI / 0.12) * wobbleAmp;

        // Apply lateral offset
        const offsetPt = p.clone().addScaledVector(right, wobble);

        // Project back onto sphere shell at correct altitude
        const dir = offsetPt.clone().normalize();
        points.push(dir.multiplyScalar(r));
    }

    return points;
}

// Path control points — spiral around the spherical world
const PATH_POINTS = generateSpiralPath(80);

// ===================== PERFORMANCE DETECTION =====================
function detectPerformanceTier() {
    const canvas = document.createElement('canvas');
    const gl = canvas.getContext('webgl2') || canvas.getContext('webgl');
    if (!gl) return 'low';

    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    const renderer = debugInfo ? gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) : '';

    // Check for mobile / low-end indicators
    const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent);
    const isLowGPU = /SwiftShader|Mesa|Intel HD|Intel\(R\) HD/i.test(renderer);
    const smallScreen = window.innerWidth < 768;

    if (isMobile || isLowGPU || smallScreen) return 'low';
    if (/Intel/i.test(renderer)) return 'medium';
    return 'high';
}

// ===================== MAIN APPLICATION =====================
class App {
    constructor() {
        this.performanceTier = detectPerformanceTier();
        this.isFlat = false; // Accessibility flat-scroll mode
        this.clock = new THREE.Clock();
        this.frameCount = 0;
        this.fpsHistory = [];

        // Check for flat mode preference
        if (localStorage.getItem('flatScrollMode') === 'true') {
            this.isFlat = true;
        }

        this.init();
    }

    init() {
        // If low performance or flat mode, use simplified experience
        if (this.isFlat || this.performanceTier === 'low') {
            this.initFlatMode();
            return;
        }

        this.initThreeJS();
        this.initWorld();
        this.initCamera();
        this.initSections();
        this.initPostProcessing();
        this.initScrollHandler();
        this.initNavigation();
        this.initResizeHandler();
        this.initAccessibilityToggle();
        this.hideLoadingScreen();
        this.animate();
    }

    // ---- Three.js Renderer ----
    initThreeJS() {
        const canvas = document.getElementById('worldCanvas');
        this.renderer = new THREE.WebGLRenderer({
            canvas,
            antialias: this.performanceTier === 'high',
            alpha: false,
            powerPreference: this.performanceTier === 'high' ? 'high-performance' : 'default'
        });
        this.renderer.setSize(window.innerWidth, window.innerHeight);
        this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, this.performanceTier === 'high' ? 2 : 1.5));
        this.renderer.shadowMap.enabled = this.performanceTier !== 'low';
        this.renderer.shadowMap.type = THREE.PCFSoftShadowMap;
        this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
        this.renderer.toneMappingExposure = 1.1;
        this.renderer.outputColorSpace = THREE.SRGBColorSpace;

        this.scene = new THREE.Scene();

        this.camera = new THREE.PerspectiveCamera(
            75,
            window.innerWidth / window.innerHeight,
            0.1,
            1500
        );
        this.camera.position.set(0, 5, 15);
    }

    // ---- 3D World ----
    initWorld() {
        // Create the camera path curve
        this.cameraPath = new THREE.CatmullRomCurve3(PATH_POINTS, false, 'catmullrom', 0.5);

        // Compute section 3D positions from path
        const sectionPositions = SECTION_DATA.map(s => ({
            ...s,
            pos: this.cameraPath.getPoint(s.pathT)
        }));

        this.world = new World(this.scene, this.cameraPath, sectionPositions, SPHERE_RADIUS);
    }

    // ---- Camera Controller ----
    initCamera() {
        this.cameraController = new CameraController(
            this.camera,
            this.cameraPath,
            SECTION_DATA
        );
    }

    // ---- Section Manager ----
    initSections() {
        this.sectionManager = new SectionManager(SECTION_DATA);

        // Navigation callback
        this.sectionManager.setNavigateCallback((direction) => {
            if (this._advanceCooldown || this.transitioning) return;
            this._advanceSection(direction === 'next' ? 1 : -1);
        });
    }

    // ---- Post-Processing ----
    initPostProcessing() {
        if (this.performanceTier === 'low') return;

        this.composer = new EffectComposer(this.renderer);
        this.composer.addPass(new RenderPass(this.scene, this.camera));

        // Bloom for soft dreamy glow (Frutiger Aero)
        const bloomStrength = this.performanceTier === 'high' ? 0.45 : 0.2;
        const bloomPass = new UnrealBloomPass(
            new THREE.Vector2(window.innerWidth, window.innerHeight),
            bloomStrength, // strength
            0.8,           // radius
            0.75           // threshold
        );
        this.composer.addPass(bloomPass);
        this.bloomPass = bloomPass;

        // Output pass for correct color space
        const outputPass = new OutputPass();
        this.composer.addPass(outputPass);
    }

    // ---- Scroll Handler (Section-locked navigation) ----
    initScrollHandler() {
        this.sectionLocked = false;
        this.transitioning = false;
        this._lastLockedSectionId = null;
        this._boundaryAccum = 0;
        this._advanceCooldown = false;

        // Set scroll spacer height
        const spacer = document.getElementById('scrollSpacer');
        if (spacer) {
            const totalHeight = window.innerHeight * (SECTION_DATA.length * 2 + 4);
            spacer.style.height = totalHeight + 'px';
        }

        // Scroll → camera progress mapping (only when NOT locked at section)
        let ticking = false;
        window.addEventListener('scroll', () => {
            if (this.sectionLocked || this.transitioning) return;
            if (!ticking) {
                requestAnimationFrame(() => {
                    const scrollTop = window.scrollY;
                    const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
                    const progress = maxScroll > 0 ? scrollTop / maxScroll : 0;
                    this.cameraController.setTargetProgress(progress);
                    ticking = false;
                });
                ticking = true;
            }
        }, { passive: true });

        // Wheel interception — trap scroll at sections for panel interactivity
        const ADVANCE_THRESHOLD = 120;

        window.addEventListener('wheel', (e) => {
            // During transition, block all wheel
            if (this.transitioning) { e.preventDefault(); return; }
            // If not locked at a section, let normal scroll happen
            if (!this.sectionLocked) return;

            // Allow interaction with scroll-rows (horizontal card carousels)
            const scrollRowWrap = e.target.closest('.scroll-row, .scroll-row-wrap');
            if (scrollRowWrap) {
                const scrollRow = scrollRowWrap.closest('.scroll-row-wrap')?.querySelector('.scroll-row') || scrollRowWrap;
                if (Math.abs(e.deltaX) > Math.abs(e.deltaY)) {
                    return; // native horizontal scroll (trackpad)
                }
                // Convert vertical wheel → horizontal scroll on the row
                e.preventDefault();
                scrollRow.scrollLeft += e.deltaY;
                return;
            }

            if (this._advanceCooldown) { e.preventDefault(); return; }

            e.preventDefault();

            const activeId = this.sectionManager.activeSectionId;
            if (!activeId) return;

            // Normalize deltaY
            let delta = e.deltaY;
            if (e.deltaMode === 1) delta *= 40;
            if (e.deltaMode === 2) delta *= window.innerHeight;

            const panel = document.querySelector(
                `.section-panel[data-section="${activeId}"] .panel-scrollable`
            );

            // No scrollable panel (e.g. hero) — accumulate for section change
            if (!panel || panel.scrollHeight <= panel.clientHeight + 2) {
                this._boundaryAccum += delta;
                if (Math.abs(this._boundaryAccum) >= ADVANCE_THRESHOLD) {
                    this._advanceSection(this._boundaryAccum > 0 ? 1 : -1);
                    this._boundaryAccum = 0;
                }
                return;
            }

            const atTop = panel.scrollTop <= 1;
            const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;

            if ((delta > 0 && atBottom) || (delta < 0 && atTop)) {
                // At boundary — accumulate scroll for section advance
                this._boundaryAccum += delta;
                if (Math.abs(this._boundaryAccum) >= ADVANCE_THRESHOLD) {
                    this._advanceSection(this._boundaryAccum > 0 ? 1 : -1);
                    this._boundaryAccum = 0;
                }
            } else {
                // Scroll within the panel content
                panel.scrollTop += delta;
                this._boundaryAccum = 0;
            }
        }, { passive: false });

        // Touch support — swipe to advance or scroll panel
        let touchStartY = 0;
        let touchStartX = 0;
        let touchBoundaryAccum = 0;

        window.addEventListener('touchstart', (e) => {
            touchStartY = e.touches[0].clientY;
            touchStartX = e.touches[0].clientX;
            touchBoundaryAccum = 0;
        }, { passive: true });

        window.addEventListener('touchmove', (e) => {
            if (this.transitioning) { e.preventDefault(); return; }
            if (!this.sectionLocked) return;

            const touchX = e.touches[0].clientX;
            const touchY = e.touches[0].clientY;
            const deltaX = touchStartX - touchX;
            const delta = touchStartY - touchY; // positive = scroll down

            // Allow horizontal swiping in scroll-rows
            const scrollRow = e.target.closest('.scroll-row, .scroll-row-wrap');
            if (scrollRow && Math.abs(deltaX) > Math.abs(delta)) {
                e.preventDefault();
                const row = scrollRow.closest('.scroll-row-wrap')?.querySelector('.scroll-row') || scrollRow;
                row.scrollLeft += deltaX;
                touchStartX = touchX;
                touchStartY = touchY;
                return;
            }

            e.preventDefault(); // prevent page scroll when locked
            if (this._advanceCooldown) return;

            touchStartX = touchX;
            touchStartY = touchY;

            const activeId = this.sectionManager.activeSectionId;
            if (!activeId) return;

            const panel = document.querySelector(
                `.section-panel[data-section="${activeId}"] .panel-scrollable`
            );

            if (!panel || panel.scrollHeight <= panel.clientHeight + 2) {
                touchBoundaryAccum += delta;
                if (Math.abs(touchBoundaryAccum) >= 60) {
                    this._advanceSection(touchBoundaryAccum > 0 ? 1 : -1);
                    touchBoundaryAccum = 0;
                }
                return;
            }

            const atTop = panel.scrollTop <= 1;
            const atBottom = panel.scrollTop + panel.clientHeight >= panel.scrollHeight - 2;

            if ((delta > 0 && atBottom) || (delta < 0 && atTop)) {
                touchBoundaryAccum += delta;
                if (Math.abs(touchBoundaryAccum) >= 60) {
                    this._advanceSection(touchBoundaryAccum > 0 ? 1 : -1);
                    touchBoundaryAccum = 0;
                }
            } else {
                // Manually scroll the panel (default is prevented)
                panel.scrollTop += delta;
                touchBoundaryAccum = 0;
            }
        }, { passive: false });
    }

    // Advance to next/prev section
    _advanceSection(direction) {
        // Guard against no-op at first/last section
        const currentIdx = this.cameraController.activeSectionIndex;
        if (direction > 0 && currentIdx >= SECTION_DATA.length - 1) return;
        if (direction < 0 && currentIdx <= 0) return;

        this.sectionLocked = false;
        this.transitioning = true;
        this._advanceCooldown = true;
        this._lastLockedSectionId = null; // allow re-lock at any section

        let section;
        if (direction > 0) {
            section = this.cameraController.goToNext();
        } else {
            section = this.cameraController.goToPrev();
        }

        if (section) {
            this.syncScrollToCamera(section.pathT);
        }

        // Cooldown prevents rapid section changes
        setTimeout(() => { this._advanceCooldown = false; }, 600);
        // Transition ends when camera arrives (checked in animate loop)
        setTimeout(() => { this.transitioning = false; }, 1500);
    }

    // Sync scroll position to match camera target
    syncScrollToCamera(targetT) {
        const maxScroll = document.documentElement.scrollHeight - window.innerHeight;
        const targetScroll = targetT * maxScroll;
        window.scrollTo({
            top: targetScroll,
            behavior: 'smooth'
        });
    }

    // ---- Navigation Override ----
    initNavigation() {
        // Helper to navigate by section hash
        const navigateToHash = (href) => {
            const sectionId = href ? href.replace('#', '') : null;
            if (sectionId) {
                this.sectionLocked = false;
                this.transitioning = true;
                this._lastLockedSectionId = null;
                this.cameraController.goToSection(sectionId);
                const section = SECTION_DATA.find(s => s.id === sectionId);
                if (section) {
                    this.syncScrollToCamera(section.pathT);
                }
                document.querySelector('.nav-menu')?.classList.remove('active');
                setTimeout(() => { this.transitioning = false; }, 1500);
            }
        };

        // Override nav links to navigate in 3D
        document.querySelectorAll('.nav-link').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToHash(link.getAttribute('href'));
            });
        });

        // Override hero buttons and any internal anchor links
        document.querySelectorAll('.btn[href^="#"], .footer-links a[href^="#"]').forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                navigateToHash(link.getAttribute('href'));
            });
        });
    }

    // ---- Resize Handler ----
    initResizeHandler() {
        let resizeTimeout;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimeout);
            resizeTimeout = setTimeout(() => {
                const w = window.innerWidth;
                const h = window.innerHeight;

                this.camera.aspect = w / h;
                this.camera.updateProjectionMatrix();
                this.renderer.setSize(w, h);

                if (this.composer) {
                    this.composer.setSize(w, h);
                }

                if (this.bloomPass) {
                    this.bloomPass.resolution.set(w, h);
                }

                // Recalculate scroll spacer height
                const spacer = document.getElementById('scrollSpacer');
                if (spacer) {
                    const totalHeight = h * (SECTION_DATA.length * 2 + 4);
                    spacer.style.height = totalHeight + 'px';
                }
            }, 150);
        });
    }

    // ---- Accessibility Toggle ----
    initAccessibilityToggle() {
        const btn = document.getElementById('flatModeToggle');
        if (btn) {
            btn.addEventListener('click', () => {
                this.isFlat = !this.isFlat;
                localStorage.setItem('flatScrollMode', this.isFlat.toString());
                window.location.reload();
            });
        }
    }

    // ---- Flat Mode (Mobile / Accessibility Fallback) ----
    initFlatMode() {
        document.body.classList.add('flat-mode');

        // Hide 3D canvas
        const canvas = document.getElementById('worldCanvas');
        if (canvas) canvas.style.display = 'none';

        // Hide scroll spacer
        const spacer = document.getElementById('scrollSpacer');
        if (spacer) spacer.style.display = 'none';

        // Show all section panels as regular flow
        document.querySelectorAll('.section-panel').forEach(panel => {
            panel.classList.add('flat-visible');
        });

        // Hide loading screen
        this.hideLoadingScreen();

        // Init accessibility toggle
        this.initAccessibilityToggle();
    }

    // ---- Loading Screen ----
    hideLoadingScreen() {
        const screen = document.getElementById('loadingScreen');
        if (screen) {
            setTimeout(() => {
                screen.style.opacity = '0';
                setTimeout(() => {
                    screen.style.display = 'none';
                }, 600);
            }, 800);
        }
    }

    // ---- Main Animation Loop ----
    animate() {
        requestAnimationFrame(() => this.animate());

        const delta = this.clock.getDelta();
        const elapsed = this.clock.elapsedTime;

        // Adaptive quality — check FPS
        this.frameCount++;
        if (this.frameCount % 60 === 0) {
            const fps = 1 / delta;
            this.fpsHistory.push(fps);
            if (this.fpsHistory.length > 5) this.fpsHistory.shift();
            const avgFps = this.fpsHistory.reduce((a, b) => a + b, 0) / this.fpsHistory.length;

            // Downgrade quality if FPS is low
            if (avgFps < 25 && this.performanceTier !== 'low') {
                this.renderer.setPixelRatio(1);
                if (this.bloomPass) this.bloomPass.strength = 0.1;
            }
        }

        // Update camera — pass billboard target for look-at blending
        let billboardTarget = null;
        const nearestSection = this.cameraController.getActiveSection();
        if (nearestSection) {
            billboardTarget = this.world.getBillboardPosition(nearestSection.id);
        }
        const activeSection = this.cameraController.update(delta, billboardTarget);

        // Update scroll progress UI
        const pct = this.cameraController.getScrollPercent();
        const label = document.getElementById('progressLabel');
        if (label) label.textContent = pct + '%';

        // Update world (animations, clouds, portals)
        this.world.update(delta, this.camera.position);

        // Section locking — when camera arrives at a section, lock interaction
        if (activeSection) {
            if (activeSection.id !== this._lastLockedSectionId) {
                // Just arrived at a new section — lock for interaction
                this.sectionLocked = true;
                this.transitioning = false;
                this._lastLockedSectionId = activeSection.id;
                this._boundaryAccum = 0;

                // Reset panel scroll to top for fresh section entry
                const panel = document.querySelector(
                    `.section-panel[data-section="${activeSection.id}"] .panel-scrollable`
                );
                if (panel) panel.scrollTop = 0;
            }

            this.world.setActiveSection(activeSection.id);
            this.sectionManager.updateActiveSection(activeSection.id, this.cameraController);
        } else {
            this.world.setActiveSection(null);
            this.sectionManager.showTransition();
            this._lastLockedSectionId = null;
        }

        // Render
        if (this.composer) {
            this.composer.render();
        } else {
            this.renderer.render(this.scene, this.camera);
        }
    }
}

// ===================== LAUNCH =====================
// Wait for DOM and fonts to be ready
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        // Small delay to let script.js render content first
        setTimeout(() => new App(), 100);
    });
} else {
    setTimeout(() => new App(), 100);
}

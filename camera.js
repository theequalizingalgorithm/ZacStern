// ============================================================
// CAMERA.JS — Scroll-Driven Cinematic Camera Controller
// Smooth lerp, parallax sway, section snapping
// ============================================================

import * as THREE from 'three';

export class CameraController {
    constructor(camera, path, sectionData) {
        this.camera = camera;
        this.path = path;             // CatmullRomCurve3
        this.sections = sectionData;  // [{id, name, pathT}, ...]

        // Current & target progress along path [0, 1]
        this.currentT = 0;
        this.targetT = 0;

        // Smooth interpolation
        this.lerpSpeed = 1.5;

        // Mouse parallax
        this.mouseX = 0;
        this.mouseY = 0;
        this.parallaxAmount = 0.8;
        this.currentParallaxX = 0;
        this.currentParallaxY = 0;

        // Section snap
        this.snapThreshold = 0.015;
        this.isSnapping = false;
        this.snapTimeout = null;

        // Active section tracking
        this.activeSection = null;
        this.activeSectionIndex = 0;

        // Velocity for inertia
        this.velocity = 0;

        // Camera jib — smooth altitude boost so billboard stays at eye-level
        // Billboard board center is ~3.5 units radially above the default path altitude.
        // When arriving at a section the camera jibs up to meet it.
        this._jibOffset = 0;

        this._initEvents();
    }

    _initEvents() {
        // Mouse parallax
        window.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX / window.innerWidth - 0.5) * 2;
            this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        });

        // Touch parallax (gyroscope-like via touch position)
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                this.mouseX = (e.touches[0].clientX / window.innerWidth - 0.5) * 2;
                this.mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
            }
        }, { passive: true });
    }

    // Called by main.js when scroll position updates
    setTargetProgress(t) {
        this.targetT = Math.max(0, Math.min(1, t));
    }

    // Navigate to specific section
    goToSection(sectionId) {
        const section = this.sections.find(s => s.id === sectionId);
        if (section) {
            this.targetT = section.pathT;
            this.isSnapping = true;
            clearTimeout(this.snapTimeout);
            this.snapTimeout = setTimeout(() => { this.isSnapping = false; }, 1500);
        }
    }

    // Go to next/previous section
    goToNext() {
        const idx = Math.min(this.activeSectionIndex + 1, this.sections.length - 1);
        this.goToSection(this.sections[idx].id);
        return this.sections[idx];
    }

    goToPrev() {
        const idx = Math.max(this.activeSectionIndex - 1, 0);
        this.goToSection(this.sections[idx].id);
        return this.sections[idx];
    }

    // Get current active section based on camera position
    getActiveSection() {
        let closest = null;
        let closestDist = Infinity;
        let closestIdx = 0;

        for (let i = 0; i < this.sections.length; i++) {
            const dist = Math.abs(this.currentT - this.sections[i].pathT);
            if (dist < closestDist) {
                closestDist = dist;
                closest = this.sections[i];
                closestIdx = i;
            }
        }

        this.activeSectionIndex = closestIdx;

        // Only consider "active" if close enough
        if (closestDist < 0.06) {
            this.activeSection = closest;
            return closest;
        }

        this.activeSection = null;
        return null;
    }

    // Get the direction indicator for navigation
    getNavDirection() {
        if (this.activeSectionIndex < this.sections.length - 1) {
            const nextSection = this.sections[this.activeSectionIndex + 1];
            const nextPos = this.path.getPoint(nextSection.pathT);
            const currPos = this.path.getPoint(this.currentT);
            return {
                next: new THREE.Vector3().subVectors(nextPos, currPos).normalize(),
                prev: this.activeSectionIndex > 0
                    ? new THREE.Vector3().subVectors(
                        this.path.getPoint(this.sections[this.activeSectionIndex - 1].pathT),
                        currPos
                    ).normalize()
                    : null,
                hasNext: true,
                hasPrev: this.activeSectionIndex > 0
            };
        }
        return {
            next: null,
            prev: this.activeSectionIndex > 0
                ? new THREE.Vector3().subVectors(
                    this.path.getPoint(this.sections[this.activeSectionIndex - 1].pathT),
                    this.path.getPoint(this.currentT)
                ).normalize()
                : null,
            hasNext: false,
            hasPrev: this.activeSectionIndex > 0
        };
    }

    // ===================== UPDATE (called per frame) =====================
    update(deltaTime, billboardTarget = null) {
        // Smooth lerp current towards target
        const lerpFactor = 1 - Math.exp(-this.lerpSpeed * deltaTime);
        this.currentT += (this.targetT - this.currentT) * lerpFactor;
        this.currentT = Math.max(0, Math.min(0.999, this.currentT));

        // Base position and tangent on path
        const position = this.path.getPoint(this.currentT);
        const tangent  = this.path.getTangent(this.currentT).normalize();

        // Radial up (outward from sphere centre — camera's own local "up")
        const radialUp = position.clone().normalize();

        // Right vector on sphere surface
        const right = new THREE.Vector3().crossVectors(tangent, radialUp).normalize();

        // Lock factor — how close are we to the active section?
        let lockT = 0;
        if (billboardTarget && this.activeSection) {
            const d = Math.abs(this.currentT - this.activeSection.pathT);
            lockT = THREE.MathUtils.smoothstep(1 - d / 0.06, 0, 1);
        }

        // Parallax — fully suppressed when locked (no parallax Y ever causes pitch)
        const pLerp = 1 - Math.exp(-4 * deltaTime);
        const effectiveParallax = this.parallaxAmount * (1 - lockT);
        this.currentParallaxX += (this.mouseX * effectiveParallax       - this.currentParallaxX) * pLerp;
        this.currentParallaxY += (this.mouseY * effectiveParallax * 0.5 - this.currentParallaxY) * pLerp;

        // Start from base path position + horizontal parallax sway only
        const offsetPos = new THREE.Vector3()
            .copy(position)
            .addScaledVector(right, this.currentParallaxX);

        // Bob — killed when locked so it doesn't jitter the panel
        if (lockT < 0.01) {
            const bob = Math.sin(this.currentT * Math.PI * 20) * 0.08;
            offsetPos.addScaledVector(radialUp, bob);
        }

        // ── PHYSICAL HEIGHT LIFT ────────────────────────────────────────────────
        // Move camera's WORLD Y to match the billboard's WORLD Y.
        // That way lookAt(billboard) is perfectly horizontal — zero pitch, no tilt.
        // All previous approaches (dot product, radial scaling) were geometrically
        // wrong. This is the direct solution: same Y → flat forward vector.
        if (lockT > 0.001 && billboardTarget) {
            const yDelta = billboardTarget.y - offsetPos.y;
            this._jibOffset += (yDelta - this._jibOffset) * (1 - Math.exp(-12 * deltaTime));
            offsetPos.y += this._jibOffset * lockT;
        } else {
            this._jibOffset *= Math.exp(-6 * deltaTime);
        }

        this.camera.position.copy(offsetPos);

        // ── LOOK TARGET ─────────────────────────────────────────────────────────
        // Travelling: look slightly ahead on the path.
        // At billboard: look DIRECTLY at billboard center — no blending with path
        // look-ahead (path look-ahead introduced the upward pitch).
        if (lockT > 0.001 && billboardTarget) {
            // Pure direct lookAt — camera is now at the same altitude as the
            // billboard so the forward vector is perpendicular to radialUp: zero pitch.
            this.camera.up.copy(radialUp);
            this.camera.lookAt(billboardTarget);
        } else {
            const lookAheadT  = Math.min(this.currentT + 0.01, 0.999);
            const lookAheadPt = this.path.getPoint(lookAheadT);
            const lookTarget  = new THREE.Vector3()
                .copy(lookAheadPt)
                .addScaledVector(right,    this.currentParallaxX * 0.3)
                .addScaledVector(radialUp, this.currentParallaxY * 0.15);
            this.camera.up.copy(radialUp);
            this.camera.lookAt(lookTarget);
        }

        return this.getActiveSection();
    }

    // Get scroll percentage for UI
    getScrollPercent() {
        return Math.round(this.currentT * 100);
    }

    // Get current path T
    getCurrentT() {
        return this.currentT;
    }

    // Get target path T (for syncing scroll position)
    getTargetT() {
        return this.targetT;
    }
}

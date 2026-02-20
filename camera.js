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

        // Clamp
        this.currentT = Math.max(0, Math.min(0.999, this.currentT));

        // Get position and tangent on path
        const position = this.path.getPoint(this.currentT);
        const tangent = this.path.getTangent(this.currentT).normalize();

        // Look-ahead point (slightly forward on path)
        const lookAheadT = Math.min(this.currentT + 0.01, 0.999);
        const lookAt = this.path.getPoint(lookAheadT);

        // Smooth parallax
        const pLerp = 1 - Math.exp(-4 * deltaTime);
        this.currentParallaxX += (this.mouseX * this.parallaxAmount - this.currentParallaxX) * pLerp;
        this.currentParallaxY += (this.mouseY * this.parallaxAmount * 0.5 - this.currentParallaxY) * pLerp;

        // Radial up vector (away from sphere center) — works correctly on a globe
        const radialUp = position.clone().normalize();

        // Right vector: perpendicular to tangent on the sphere surface
        const right = new THREE.Vector3().crossVectors(tangent, radialUp).normalize();

        // Apply parallax offset along sphere-surface-local axes
        const offsetPos = new THREE.Vector3()
            .copy(position)
            .addScaledVector(right, this.currentParallaxX)
            .addScaledVector(radialUp, this.currentParallaxY * 0.3);

        // Gentle bob along radial direction
        const bob = Math.sin(this.currentT * Math.PI * 20) * 0.08;
        offsetPos.addScaledVector(radialUp, bob);

        // Set camera position
        this.camera.position.copy(offsetPos);

        // LookAt with parallax influence
        const lookTarget = new THREE.Vector3()
            .copy(lookAt)
            .addScaledVector(right, this.currentParallaxX * 0.3)
            .addScaledVector(radialUp, this.currentParallaxY * 0.15);

        // Blend look-at toward billboard when near a section
        if (billboardTarget && this.activeSection) {
            const dist = Math.abs(this.currentT - this.activeSection.pathT);
            const blendT = THREE.MathUtils.smoothstep(1 - dist / 0.06, 0, 1);
            if (blendT > 0.01) {
                lookTarget.lerp(billboardTarget, blendT * 0.65);
            }
        }

        // Set camera up to radial direction so it stays oriented on the globe
        this.camera.up.copy(radialUp);
        this.camera.lookAt(lookTarget);

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

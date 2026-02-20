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

        // Clamp
        this.currentT = Math.max(0, Math.min(0.999, this.currentT));

        // Get position and tangent on path
        const position = this.path.getPoint(this.currentT);
        const tangent = this.path.getTangent(this.currentT).normalize();

        // Look-ahead point (slightly forward on path)
        const lookAheadT = Math.min(this.currentT + 0.01, 0.999);
        const lookAt = this.path.getPoint(lookAheadT);

        // Smooth parallax — reduce when locked at a section
        const pLerp = 1 - Math.exp(-4 * deltaTime);
        let effectiveParallax = this.parallaxAmount;
        if (this.activeSection) {
            const dist = Math.abs(this.currentT - this.activeSection.pathT);
            const lockT = THREE.MathUtils.smoothstep(1 - dist / 0.06, 0, 1);
            effectiveParallax *= (1 - lockT * 0.85); // reduce parallax by 85% when locked
        }
        this.currentParallaxX += (this.mouseX * effectiveParallax - this.currentParallaxX) * pLerp;
        this.currentParallaxY += (this.mouseY * effectiveParallax * 0.5 - this.currentParallaxY) * pLerp;

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

        // --- Dynamic jib: raise camera so billboard is EXACTLY at eye level ---
        // Compute how far the billboard center sits along THIS camera's radial axis.
        // For a level (zero-pitch) gaze we need camera radial altitude == billboard
        // radial altitude. We solve for jib each frame so it is always exact,
        // regardless of lateral offset or sphere curvature.
        let jibTarget = 0;
        if (billboardTarget && this.activeSection) {
            const d = Math.abs(this.currentT - this.activeSection.pathT);
            const lockT = THREE.MathUtils.smoothstep(1 - d / 0.06, 0, 1);
            if (lockT > 0.001) {
                // Project billboard center onto camera's radial-up axis
                const billboardRadial = billboardTarget.dot(radialUp);
                const cameraBaseRadial = position.dot(radialUp); // ≈ |position|
                const perfectJib = billboardRadial - cameraBaseRadial;
                jibTarget = lockT * perfectJib;
            }
        }
        this._jibOffset += (jibTarget - this._jibOffset) * (1 - Math.exp(-6 * deltaTime));
        offsetPos.addScaledVector(radialUp, this._jibOffset);

        // Set camera position
        this.camera.position.copy(offsetPos);

        // LookAt with parallax influence
        const lookTarget = new THREE.Vector3()
            .copy(lookAt)
            .addScaledVector(right, this.currentParallaxX * 0.3)
            .addScaledVector(radialUp, this.currentParallaxY * 0.15);

        // Blend look-at fully toward billboard when near a section.
        // Use blendT (not blendT*0.92) — any residual path look-ahead
        // would tilt the gaze up/down along the spiral curve.
        if (billboardTarget && this.activeSection) {
            const dist = Math.abs(this.currentT - this.activeSection.pathT);
            const blendT = THREE.MathUtils.smoothstep(1 - dist / 0.06, 0, 1);
            if (blendT > 0.001) {
                lookTarget.lerp(billboardTarget, blendT);
            }
        }

        // Camera up: normally the camera's own radialUp.
        // BUT the billboard is ~6 world units off to the side, so its local vertical
        // (offsetDir = billboardTarget.normalize()) is rotated ~7° from radialUp.
        // That 7° mismatch shows up as a ROLL tilt on all billboard text/headers.
        // Fix: blend camera.up toward the billboard's own vertical when locked.
        let cameraUp = radialUp.clone();
        if (billboardTarget && this.activeSection) {
            const dist = Math.abs(this.currentT - this.activeSection.pathT);
            const blendT = THREE.MathUtils.smoothstep(1 - dist / 0.06, 0, 1);
            if (blendT > 0.001) {
                const billboardUp = billboardTarget.clone().normalize();
                cameraUp.lerp(billboardUp, blendT).normalize();
            }
        }
        this.camera.up.copy(cameraUp);
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

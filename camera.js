// ============================================================
// CAMERA.JS — Globe Rotation (Y-Axis) Paradigm
//
// The globe (worldGroup) rotates around the world Y-axis to bring
// each billboard to face the camera.  The camera is nearly static:
//   • Idle:   (0, 0, SPHERE_RADIUS + IDLE_DIST)  looking at origin
//   • Active: dollies in, Y-slides to board centre height,
//             looks at billboard face — perfectly head-on, zero pitch
//   • camera.up = (0,1,0) always — no roll, no tilt, ever
// ============================================================

import * as THREE from 'three';

const IDLE_DIST   = 55;   // camera z offset from sphere centre when browsing
const ACTIVE_DIST = 22;   // camera z offset when docked — billboard fills ~85% of viewport
const BOARD_Y     = 11;   // board centre local-Y inside billboard group (boardH/2)

export class CameraController {
    constructor(camera, worldGroup, sections, sphereRadius) {
        this.camera      = camera;
        this.worldGroup  = worldGroup;
        this.sections    = sections;
        this.sphereRadius = sphereRadius;

        // Navigation state
        this.activeSectionIndex = 0;
        this.activeSection      = null;
        this.isSnapping  = false;
        this.snapTimeout = null;

        // Smooth rotation: target Y angle (radians), current Y angle
        this._targetTheta  = 0;
        this._currentTheta = 0;

        // Camera position lerp
        this._currentZ = sphereRadius + IDLE_DIST;
        this._currentY = 0;

        // Mouse parallax (idle only)
        this.mouseX = 0;
        this.mouseY = 0;
        this._px = 0;
        this._py = 0;

        // Compat properties used by main.js scroll-sync
        this.currentT   = 0;
        this.targetT    = 0;
        this.velocity   = 0;
        this.lerpSpeed  = 3;

        this._initEvents();

        // Start at hero (theta=0)
        this.goToSection(sections[0].id);
        this._currentTheta = this._targetTheta;
        if (this.worldGroup) this.worldGroup.rotation.x = 0;
    }

    _initEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
            this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        });
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length > 0) {
                this.mouseX = (e.touches[0].clientX / window.innerWidth  - 0.5) * 2;
                this.mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
            }
        }, { passive: true });
    }

    // ── Backward-compat stubs ────────────────────────────────────────────────
    setWorldGroup(wg) { this.worldGroup = wg; }
    registerBillboard() {}

    // ── Navigation ───────────────────────────────────────────────────────────

    setTargetProgress(t) {
        this.targetT = Math.max(0, Math.min(1, t));
        const idx = Math.round(this.targetT * (this.sections.length - 1));
        const clamped = Math.max(0, Math.min(this.sections.length - 1, idx));
        if (clamped !== this.activeSectionIndex) {
            this.goToSection(this.sections[clamped].id);
        }
    }

    goToSection(sectionId) {
        const idx = this.sections.findIndex(s => s.id === sectionId);
        if (idx < 0) return;
        this.activeSectionIndex = idx;
        this._targetTheta       = this.sections[idx].theta ?? 0;
        this.currentT           = this.sections[idx].pathT ?? (idx / (this.sections.length - 1));
        this.targetT            = this.currentT;
        this.isSnapping = true;
        clearTimeout(this.snapTimeout);
        this.snapTimeout = setTimeout(() => { this.isSnapping = false; }, 1500);
    }

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

    getNavDirection() {
        return {
            next: null, prev: null,
            hasNext: this.activeSectionIndex < this.sections.length - 1,
            hasPrev: this.activeSectionIndex > 0
        };
    }

    // ── Active section detection ─────────────────────────────────────────────

    getActiveSection() {
        let diff = this._targetTheta - this._currentTheta;
        while (diff >  Math.PI) diff -= Math.PI * 2;
        while (diff < -Math.PI) diff += Math.PI * 2;
        if (Math.abs(diff) < 0.12) {
            this.activeSection = this.sections[this.activeSectionIndex];
            return this.activeSection;
        }
        this.activeSection = null;
        return null;
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────

    update(deltaTime, billboardFaceInfo = null) {
        const R = this.sphereRadius;

        // 1. Rotate globe around X-axis (vertical ferris-wheel spin)
        //    Billboard at local (xOff, sin(θ)*R, cos(θ)*R).
        //    Rotation +θ around X brings it to world (xOff, 0, R) — in front of camera.
        let dTheta = this._targetTheta - this._currentTheta;
        while (dTheta >  Math.PI) dTheta -= Math.PI * 2;
        while (dTheta < -Math.PI) dTheta += Math.PI * 2;
        this._currentTheta += dTheta * (1 - Math.exp(-2.8 * deltaTime));
        if (this.worldGroup) this.worldGroup.rotation.x = this._currentTheta;

        // 2. Lock factor: 0 = rotating, 1 = billboard centered on camera
        const lockT = THREE.MathUtils.smoothstep(1 - Math.abs(dTheta) / 0.25, 0, 1);

        // 3. Dolly camera in/out
        const targetZ = R + (lockT > 0.15 ? ACTIVE_DIST : IDLE_DIST);
        this._currentZ += (targetZ - this._currentZ) * (1 - Math.exp(-3 * deltaTime));

        // 4. Camera Y = 0 always — board arrives at Y=0 after X-rotation
        const targetY = 0;
        this._currentY += (targetY - this._currentY) * (1 - Math.exp(-3 * deltaTime));

        // 4b. Camera X slides toward billboard X when docked
        //     Billboard lateral offset is small (±2), so camera slides a bit to center it
        const activeData = this.sections[this.activeSectionIndex];
        const billboardX = activeData ? (this.activeSectionIndex % 2 === 0 ? 2 : -2) : 0;
        const targetX = lockT * billboardX * 0.5;  // slide 50% toward billboard X

        // 5. Idle parallax (suppressed when billboard active)
        const idleAmt = 1 - lockT;
        this._px += (this.mouseX * 3 * idleAmt - this._px) * (1 - Math.exp(-4 * deltaTime));
        this._py += (this.mouseY * 1.5 * idleAmt - this._py) * (1 - Math.exp(-4 * deltaTime));

        // 6. Set camera position
        this.camera.position.set(
            targetX + this._px * idleAmt,
            this._currentY + this._py * idleAmt,
            this._currentZ
        );
        this.camera.up.set(0, 1, 0);

        // 7. LookAt — active: real billboard face centre; idle: origin
        if (lockT > 0.01 && billboardFaceInfo) {
            this.camera.lookAt(billboardFaceInfo.center);
        } else if (lockT > 0.01) {
            this.camera.lookAt(0, 0, R + 2.75);
        } else {
            this.camera.lookAt(this._px * 0.15, this._py * 0.1, 0);
        }

        return this.getActiveSection();
    }

    // ── Utilities ─────────────────────────────────────────────────────────────

    getScrollPercent() {
        if (this.sections.length <= 1) return 0;
        return Math.round(this.activeSectionIndex / (this.sections.length - 1) * 100);
    }
    getCurrentT() { return this.currentT; }
    getTargetT()  { return this.targetT; }
}

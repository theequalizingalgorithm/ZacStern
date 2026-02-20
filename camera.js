// ============================================================
// CAMERA.JS — Globe-Rotation Paradigm
//
// The WORLD rotates to bring each billboard to the camera.
// The camera is mostly static on the +Z axis:
//   • Dollies forward when a billboard arrives (product-shot framing)
//   • Slides Y to match billboard centre height (guaranteed zero pitch)
//   • camera.up = (0,1,0) always — zero roll, zero tilt, ever
//   • Subtle idle parallax fades out completely when locked on a section
// ============================================================

import * as THREE from 'three';

export class CameraController {
    constructor(camera, sections, sphereRadius) {
        this.camera       = camera;
        this.sections     = sections;
        this.sphereRadius = sphereRadius;

        // worldGroup set after World is constructed via setWorldGroup()
        this.worldGroup = null;

        // Per-section quaternions: rotating worldGroup by Q_i brings section i's
        // billboard to face the camera on the +Z axis.
        this._sectionQuaternions = new Map();

        // Current target world rotation
        this._targetQuat = new THREE.Quaternion();

        // Section tracking
        this.activeSectionIndex = 0;
        this.activeSection      = null;

        // Camera dolly — distance from sphere centre along +Z
        this._idleDist    = 58;
        this._activeDist  = 20;
        this._currentDist = 58;

        // Camera Y — slides to billboard centre world-Y for zero-pitch lookAt
        this._currentY = 0;

        // Idle mouse parallax (fully suppressed when billboard active)
        this.mouseX = 0;
        this.mouseY = 0;

        // API shims kept for main.js scroll-sync compatibility
        this.currentT    = 0;
        this.targetT     = 0;
        this.isSnapping  = false;
        this.snapTimeout = null;
        this.velocity    = 0;
        this.lerpSpeed   = 3;

        this._initEvents();
    }

    _initEvents() {
        window.addEventListener('mousemove', (e) => {
            this.mouseX = (e.clientX / window.innerWidth  - 0.5) * 2;
            this.mouseY = (e.clientY / window.innerHeight - 0.5) * 2;
        });
        window.addEventListener('touchmove', (e) => {
            if (e.touches.length === 1) {
                this.mouseX = (e.touches[0].clientX / window.innerWidth  - 0.5) * 2;
                this.mouseY = (e.touches[0].clientY / window.innerHeight - 0.5) * 2;
            }
        }, { passive: true });
    }

    // ─── SETUP ───────────────────────────────────────────────────────────────

    // Called by main.js once the World (and its worldGroup) is ready.
    setWorldGroup(worldGroup) {
        this.worldGroup = worldGroup;
    }

    // Register initial world-space billboard position so we can compute the
    // quaternion that rotates worldGroup to bring it to face +Z (the camera).
    // Must be called BEFORE any worldGroup rotation (startup, once only).
    registerBillboard(sectionId, worldPos) {
        const dir = worldPos.clone().normalize();
        const q   = new THREE.Quaternion().setFromUnitVectors(dir, new THREE.Vector3(0, 0, 1));
        this._sectionQuaternions.set(sectionId, q);
    }

    // ─── NAVIGATION ──────────────────────────────────────────────────────────

    setTargetProgress(t) {
        this.targetT = Math.max(0, Math.min(1, t));
        let closest = this.sections[0], closestDist = Infinity;
        for (const s of this.sections) {
            const d = Math.abs(t - s.pathT);
            if (d < closestDist) { closestDist = d; closest = s; }
        }
        if (closest.id !== this.sections[this.activeSectionIndex]?.id) {
            this.goToSection(closest.id);
        }
    }

    goToSection(sectionId) {
        const idx = this.sections.findIndex(s => s.id === sectionId);
        if (idx >= 0) {
            this.activeSectionIndex = idx;
            this.currentT = this.sections[idx].pathT;
            this.targetT  = this.currentT;
        }
        const q = this._sectionQuaternions.get(sectionId);
        if (q) this._targetQuat.copy(q);
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

    // ─── ACTIVE SECTION DETECTION ────────────────────────────────────────────

    getActiveSection() {
        if (!this.worldGroup) return null;
        const angle = this.worldGroup.quaternion.angleTo(this._targetQuat);
        if (angle < 0.25) {
            this.activeSection = this.sections[this.activeSectionIndex];
            return this.activeSection;
        }
        this.activeSection = null;
        return null;
    }

    // ─── UPDATE (called every frame) ─────────────────────────────────────────

    update(deltaTime, billboardWorldPos = null) {
        if (!this.worldGroup) return this.getActiveSection();

        // 1. Rotate the WORLD toward the target quaternion.
        //    Globe spins; camera barely moves. Core paradigm shift.
        this.worldGroup.quaternion.slerp(this._targetQuat, 1 - Math.exp(-2.8 * deltaTime));

        // 2. Lock factor: 0 = world still spinning, 1 = billboard fully facing camera
        const angle = this.worldGroup.quaternion.angleTo(this._targetQuat);
        const lockT = THREE.MathUtils.smoothstep(1 - angle / 0.3, 0, 1);

        // 3. Dolly — push camera forward as billboard arrives
        const targetDist = (billboardWorldPos && lockT > 0.15) ? this._activeDist : this._idleDist;
        this._currentDist += (targetDist - this._currentDist) * (1 - Math.exp(-2.5 * deltaTime));

        // 4. Camera Y — physically slide to billboard centre world-Y.
        //    camera.y == billboard.y → lookAt forward vector is purely horizontal.
        //    Zero pitch. Guaranteed. No exceptions.
        const targetY = (billboardWorldPos && lockT > 0.1) ? billboardWorldPos.y : 0;
        this._currentY += (targetY - this._currentY) * (1 - Math.exp(-3 * deltaTime));

        // 5. Idle parallax — zero when billboard active so nothing re-introduces tilt
        const idleStrength = 1 - lockT;
        const px =  this.mouseX * 2.5 * idleStrength;
        const py = -this.mouseY * 1.5 * idleStrength;

        // 6. Camera position: fixed on +Z axis (idle parallax nudges X/Y only)
        this.camera.position.set(
            px,
            this._currentY + py,
            this.sphereRadius + this._currentDist
        );

        // 7. camera.up — always world Y. Never rolls, never tilts.
        this.camera.up.set(0, 1, 0);

        // 8. LookAt
        //    Active: billboard centre. camera.y == billboard.y → zero pitch. ✓
        //    Idle:   globe centre (Y-offset for smooth exit feel).
        if (billboardWorldPos && lockT > 0.01) {
            this.camera.lookAt(billboardWorldPos);
        } else {
            this.camera.lookAt(0, this._currentY, 0);
        }

        return this.getActiveSection();
    }

    // ─── UTILITIES ───────────────────────────────────────────────────────────

    getScrollPercent() {
        if (this.sections.length <= 1) return 0;
        return Math.round(this.activeSectionIndex / (this.sections.length - 1) * 100);
    }

    getCurrentT() { return this.sections[this.activeSectionIndex]?.pathT ?? 0; }
    getTargetT()  { return this.targetT; }
}

// ============================================================
// CAMERA.JS — Path Travel + Face-Normal Dock
//
// Travel mode: camera follows CatmullRom spline around globe.
// Dock mode (section active): camera moves to a position
//   directly in front of the billboard's own face normal.
//   Guaranteed zero pitch: camera.y = billboard_center.y → lookAt
//   forward vector has no Y component → perfectly flat gaze.
//   Guaranteed zero skew: positioned along face normal → billboard
//   is exactly perpendicular to the view ray.
//   Guaranteed zero roll: camera.up = billboard's own world-Y axis.
// ============================================================

import * as THREE from 'three';

// How far in front of the billboard face the camera docks (world units).
const DOCK_DIST = 22;

export class CameraController {
    constructor(camera, path, sections) {
        this.camera   = camera;
        this.path     = path;
        this.sections = sections;

        // Path progress
        this.currentT = 0;
        this.targetT  = 0;
        this.lerpSpeed = 1.8;

        // Active section
        this.activeSectionIndex = 0;
        this.activeSection      = null;
        this.isSnapping  = false;
        this.snapTimeout = null;
        this.velocity    = 0;

        // Dock-mode state — smooth lerp of camera position & up
        this._dockPos     = new THREE.Vector3();  // target camera position in dock mode
        this._dockCenter  = new THREE.Vector3();  // billboard face centre (lookAt target)
        this._dockUp      = new THREE.Vector3(0, 1, 0);
        this._currentPos  = null;  // initialised on first update
        this._currentUp   = new THREE.Vector3(0, 0, 1);

        // Mouse parallax (travel only)
        this.mouseX = 0;
        this.mouseY = 0;
        this._px = 0;
        this._py = 0;

        // worldGroup shim — kept for backward compat but not used for rotation
        this.worldGroup = null;

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

    // ── backward-compat stubs (main.js calls these) ─────────────────────────
    setWorldGroup(wg) { this.worldGroup = wg; }
    registerBillboard() {}  // no-op in path+dock paradigm

    // ── Navigation ───────────────────────────────────────────────────────────

    setTargetProgress(t) {
        this.targetT = Math.max(0, Math.min(1, t));
    }

    goToSection(sectionId) {
        const idx = this.sections.findIndex(s => s.id === sectionId);
        if (idx >= 0) {
            this.activeSectionIndex = idx;
            this.targetT = this.sections[idx].pathT;
        }
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
        let closest = null, closestDist = Infinity, closestIdx = 0;
        for (let i = 0; i < this.sections.length; i++) {
            const d = Math.abs(this.currentT - this.sections[i].pathT);
            if (d < closestDist) { closestDist = d; closest = this.sections[i]; closestIdx = i; }
        }
        this.activeSectionIndex = closestIdx;
        if (closestDist < 0.06) { this.activeSection = closest; return closest; }
        this.activeSection = null;
        return null;
    }

    // ── UPDATE ───────────────────────────────────────────────────────────────
    // billboardFaceInfo = { center, normal, up } from World.getBillboardFaceInfo()
    // or null when no active section.

    update(deltaTime, billboardFaceInfo = null) {
        // ── 1. Advance path progress ─────────────────────────────────────────
        this.currentT += (this.targetT - this.currentT) * (1 - Math.exp(-this.lerpSpeed * deltaTime));
        this.currentT  = Math.max(0, Math.min(0.999, this.currentT));

        const pathPos    = this.path.getPoint(this.currentT);
        const tangent    = this.path.getTangent(this.currentT).normalize();
        const radialUp   = pathPos.clone().normalize();
        const right      = new THREE.Vector3().crossVectors(tangent, radialUp).normalize();

        // ── 2. Lock factor: how settled is the camera at the active section? ─
        let lockT = 0;
        if (billboardFaceInfo && this.activeSection) {
            const d = Math.abs(this.currentT - this.activeSection.pathT);
            lockT = THREE.MathUtils.smoothstep(1 - d / 0.055, 0, 1);
        }

        // ── 3. Idle parallax (fades to zero when docked) ─────────────────────
        const pLerp = 1 - Math.exp(-4 * deltaTime);
        const pAmt  = 0.8 * (1 - lockT);
        this._px += (this.mouseX * pAmt       - this._px) * pLerp;
        this._py += (this.mouseY * pAmt * 0.5 - this._py) * pLerp;

        // ── 4. Travel position (path + parallax) ─────────────────────────────
        const travelPos = pathPos.clone()
            .addScaledVector(right, this._px)
            .addScaledVector(radialUp, this._py * 0.3);

        // ── 5. Dock position (face-normal, Y-snapped) ────────────────────────
        //   • DOCK_DIST world units along billboard face normal → camera is
        //     directly in front of the billboard, perfectly perpendicular.
        //   • Then snap camera.y = center.y so the lookAt vector has ZERO
        //     vertical component → guaranteed zero pitch, zero tilt.
        let dockPos   = travelPos.clone(); // fallback = travel
        let dockLookAt = pathPos.clone();  // fallback = same as travel
        let dockUp     = radialUp.clone();

        if (billboardFaceInfo) {
            const { center, normal, up } = billboardFaceInfo;

            // Ensure normal points toward camera (not away)
            const toCamera = this.camera.position.clone().sub(center);
            const sign     = toCamera.dot(normal) >= 0 ? 1 : -1;
            const faceNorm = normal.clone().multiplyScalar(sign);

            // Camera dock = along face normal, then Y snapped to billboard centre
            const rawDock = center.clone().addScaledVector(faceNorm, DOCK_DIST);
            dockPos   = new THREE.Vector3(rawDock.x, center.y, rawDock.z);
            dockLookAt = center.clone();
            dockUp     = up.clone();
        }

        // ── 6. Blend travel ↔ dock ───────────────────────────────────────────
        if (!this._currentPos) this._currentPos = travelPos.clone();

        const posAlpha = 1 - Math.exp(-3.5 * deltaTime);
        const targetPos = (lockT > 0.001)
            ? dockPos.lerp(travelPos, 1 - lockT)
            : travelPos;
        this._currentPos.lerp(targetPos, posAlpha);

        // camera.up: travel = radialUp, dock = billboard world-up
        this._currentUp.lerp(
            lockT > 0.001 ? dockUp : radialUp,
            1 - Math.exp(-4 * deltaTime)
        ).normalize();

        // ── 7. Set camera ────────────────────────────────────────────────────
        this.camera.position.copy(this._currentPos);
        this.camera.up.copy(this._currentUp);

        // LookAt: travel = path look-ahead, dock = billboard centre
        if (lockT > 0.001 && billboardFaceInfo) {
            // Blend lookAt: travel look-ahead → billboard centre
            const lookAheadPt = this.path.getPoint(Math.min(this.currentT + 0.012, 0.999));
            const blendedLook = lookAheadPt.clone().lerp(billboardFaceInfo.center, lockT);
            this.camera.lookAt(blendedLook);
        } else {
            const lookAheadPt = this.path.getPoint(Math.min(this.currentT + 0.012, 0.999));
            const lookTarget  = lookAheadPt
                .addScaledVector(right, this._px * 0.3)
                .addScaledVector(radialUp, this._py * 0.15);
            this.camera.lookAt(lookTarget);
        }

        return this.getActiveSection();
    }

    // ── Utilities ────────────────────────────────────────────────────────────

    getScrollPercent() { return Math.round(this.currentT * 100); }
    getCurrentT()      { return this.currentT; }
    getTargetT()       { return this.targetT; }
}

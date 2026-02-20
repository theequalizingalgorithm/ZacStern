// ============================================================
// SCENE.JS — 3D Spherical World Environment
// Green valley globe with iridescent road, landmarks, atmosphere
// ============================================================

import * as THREE from 'three';
import {
    skyVertexShader, skyFragmentShader,
    roadVertexShader, roadFragmentShader,
    cloudVertexShader, cloudFragmentShader
} from './shaders/environment.js';

// ---- Noise utilities for terrain ----
function hash2D(x, y) {
    const n = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
    return n - Math.floor(n);
}

function smoothNoise(x, y) {
    const ix = Math.floor(x), iy = Math.floor(y);
    const fx = x - ix, fy = y - iy;
    const ux = fx * fx * (3 - 2 * fx);
    const uy = fy * fy * (3 - 2 * fy);
    const a = hash2D(ix, iy);
    const b = hash2D(ix + 1, iy);
    const c = hash2D(ix, iy + 1);
    const d = hash2D(ix + 1, iy + 1);
    return a + (b - a) * ux + (c - a) * uy + (a - b - c + d) * ux * uy;
}

function fbm(x, y, octaves = 5) {
    let val = 0, amp = 1, freq = 1, max = 0;
    for (let i = 0; i < octaves; i++) {
        val += smoothNoise(x * freq, y * freq) * amp;
        max += amp;
        amp *= 0.48;
        freq *= 2.1;
    }
    return val / max;
}

function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

// ---- Exported World class ----
export class World {
    constructor(scene, cameraPath, sectionPositions, sphereRadius = 80) {
        this.scene = scene;
        this.cameraPath = cameraPath;
        this.sectionPositions = sectionPositions;
        this.sphereRadius = sphereRadius;
        this.time = 0;
        this.clouds = [];
        this.portalMeshes = [];
        this.roadUniforms = null;
        this.cloudMaterials = [];
        this.landmarkMeshes = [];

        // Pre-sample path on sphere surface for road flattening / avoidance
        this._pathSurfaceSamples = [];
        for (let i = 0; i <= 200; i++) {
            const t = i / 200;
            const pt = this.cameraPath.getPoint(t);
            const dir = pt.clone().normalize();
            this._pathSurfaceSamples.push({
                pos: dir.clone().multiplyScalar(this.sphereRadius),
                dir
            });
        }

        this.createLighting();
        this.createSky();
        this.createTerrain();
        this.createClouds();
        this.createRoad();
        this.createPortals();
        this.createAtmosphere();
        this.createDecorations();
    }

    // ===================== LIGHTING =====================
    createLighting() {
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x56c596, 0.6);
        this.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
        sun.position.set(200, 300, 150);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 600;
        sun.shadow.camera.left = -200;
        sun.shadow.camera.right = 200;
        sun.shadow.camera.top = 200;
        sun.shadow.camera.bottom = -200;
        this.scene.add(sun);
        this.scene.add(sun.target);
        this.sunLight = sun;

        const ambient = new THREE.AmbientLight(0xb3e5fc, 0.4);
        this.scene.add(ambient);

        this.cameraLight = new THREE.PointLight(0xffe0b2, 0.3, 60);
        this.cameraLight.position.set(0, 100, 0);
        this.scene.add(this.cameraLight);
    }

    // ===================== SKY DOME =====================
    createSky() {
        const geo = new THREE.SphereGeometry(1400, 32, 32);
        const mat = new THREE.ShaderMaterial({
            vertexShader: skyVertexShader,
            fragmentShader: skyFragmentShader,
            uniforms: {
                topColor:    { value: new THREE.Color(0x3a7bd5) },
                midColor:    { value: new THREE.Color(0x7ec8e3) },
                bottomColor: { value: new THREE.Color(0xd4f1f9) },
                offset:      { value: 20 },
                exponent:    { value: 0.5 }
            },
            side: THREE.BackSide,
            depthWrite: false
        });
        this.skyMesh = new THREE.Mesh(geo, mat);
        this.scene.add(this.skyMesh);
    }

    // ===================== SPHERICAL TERRAIN =====================
    createTerrain() {
        const R = this.sphereRadius;
        const geo = new THREE.SphereGeometry(R, 160, 160);

        const positions = geo.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const y = positions.getY(i);
            const z = positions.getZ(i);

            const r = Math.sqrt(x * x + y * y + z * z);
            if (r === 0) continue;
            const nx = x / r, ny = y / r, nz = z / r;

            // Use spherical coords for noise input
            const theta = Math.atan2(nz, nx);
            const phi = Math.acos(Math.max(-1, Math.min(1, ny)));

            // Terrain height displacement (radial)
            let h = fbm(theta * 4 + 50, phi * 6 + 50, 5) * 4 - 1;
            h += Math.sin(theta * 5) * Math.cos(phi * 4) * 0.8;

            // Flatten near road path (angular distance on sphere)
            let minDist = Infinity;
            for (const pp of this._pathSurfaceSamples) {
                const dot = nx * pp.dir.x + ny * pp.dir.y + nz * pp.dir.z;
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                const arcDist = angle * R;
                if (arcDist < minDist) minDist = arcDist;
            }

            const roadWidth = 4;
            const blendWidth = 10;
            if (minDist < roadWidth + blendWidth) {
                const blend = Math.max(0, (minDist - roadWidth) / blendWidth);
                h = h * smoothstep(0, 1, blend);
            }

            // Apply radial displacement
            const newR = R + h;
            positions.setX(i, nx * newR);
            positions.setY(i, ny * newR);
            positions.setZ(i, nz * newR);

            // Vertex colors: lush green valley
            const greenBase = 0.35 + fbm(theta * 2, phi * 2, 3) * 0.15;
            colors[i * 3]     = 0.16 + Math.random() * 0.05;
            colors[i * 3 + 1] = greenBase + Math.random() * 0.05;
            colors[i * 3 + 2] = 0.13 + Math.random() * 0.04;
        }

        geo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
        geo.computeVertexNormals();

        const mat = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.92,
            metalness: 0.0,
            flatShading: false
        });

        this.terrainMesh = new THREE.Mesh(geo, mat);
        this.terrainMesh.receiveShadow = true;
        this.scene.add(this.terrainMesh);
    }

    // ===================== CLOUDS (orbiting around the globe) =====================
    createClouds() {
        const cloudGeo = new THREE.IcosahedronGeometry(1, 3);
        const R = this.sphereRadius;

        for (let i = 0; i < 35; i++) {
            const mat = new THREE.ShaderMaterial({
                vertexShader: cloudVertexShader,
                fragmentShader: cloudFragmentShader,
                uniforms: {
                    time: { value: 0 },
                    opacity: { value: 0.7 + Math.random() * 0.2 }
                },
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const group = new THREE.Group();
            const puffCount = 3 + Math.floor(Math.random() * 4);
            for (let j = 0; j < puffCount; j++) {
                const puff = new THREE.Mesh(cloudGeo, mat);
                puff.position.set(
                    (Math.random() - 0.5) * 8,
                    (Math.random() - 0.5) * 2,
                    (Math.random() - 0.5) * 6
                );
                const s = 2 + Math.random() * 4;
                puff.scale.set(s * (1 + Math.random() * 0.5), s * 0.4, s * (0.8 + Math.random() * 0.4));
                group.add(puff);
            }

            // Position clouds on a sphere shell above the terrain
            const cloudAlt = R + 25 + Math.random() * 35;
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
            group.position.set(
                cloudAlt * Math.sin(phi) * Math.cos(theta),
                cloudAlt * Math.cos(phi),
                cloudAlt * Math.sin(phi) * Math.sin(theta)
            );

            // Orient cloud to face outward from sphere
            group.lookAt(0, 0, 0);
            group.rotateX(Math.PI);

            group.userData.theta = theta;
            group.userData.phi = phi;
            group.userData.alt = cloudAlt;
            group.userData.speed = 0.003 + Math.random() * 0.005;
            group.userData.wobble = Math.random() * Math.PI * 2;

            this.scene.add(group);
            this.clouds.push(group);
            this.cloudMaterials.push(mat);
        }
    }

    // ===================== IRIDESCENT BRICK ROAD =====================
    createRoad() {
        const pathPoints = this.cameraPath.getSpacedPoints(400);
        const R = this.sphereRadius;
        const roadWidth = 4;
        const roadLift = 0.4;

        const vertices = [];
        const uvs = [];
        const indices = [];
        const normals = [];

        for (let i = 0; i < pathPoints.length; i++) {
            const p = pathPoints[i];
            const t = i / (pathPoints.length - 1);

            // Project point onto sphere surface + small lift
            const dir = p.clone().normalize();
            const surfaceR = R + roadLift;
            const surfPt = dir.clone().multiplyScalar(surfaceR);

            // Get tangent along path (use getTangentAt for arc-length parameterization)
            const tangent = this.cameraPath.getTangentAt(t);
            // Radial up at this point = dir
            const right = new THREE.Vector3().crossVectors(tangent, dir).normalize();

            const leftPt  = new THREE.Vector3().copy(surfPt).addScaledVector(right, -roadWidth / 2);
            const rightPt = new THREE.Vector3().copy(surfPt).addScaledVector(right,  roadWidth / 2);

            vertices.push(leftPt.x, leftPt.y, leftPt.z);
            vertices.push(rightPt.x, rightPt.y, rightPt.z);

            uvs.push(0, t * 30);
            uvs.push(1, t * 30);

            normals.push(dir.x, dir.y, dir.z);
            normals.push(dir.x, dir.y, dir.z);

            if (i < pathPoints.length - 1) {
                const idx = i * 2;
                indices.push(idx, idx + 1, idx + 2);
                indices.push(idx + 1, idx + 3, idx + 2);
            }
        }

        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
        geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
        geo.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
        geo.setIndex(indices);

        this.roadUniforms = {
            time: { value: 0 },
            baseColor: { value: new THREE.Color(0xd4a84b) }
        };

        const mat = new THREE.ShaderMaterial({
            vertexShader: roadVertexShader,
            fragmentShader: roadFragmentShader,
            uniforms: this.roadUniforms,
            side: THREE.DoubleSide
        });

        const road = new THREE.Mesh(geo, mat);
        road.receiveShadow = true;
        this.scene.add(road);

        this.createRoadBorders(pathPoints);
    }

    createRoadBorders(pathPoints) {
        const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.6,
            metalness: 0.4
        });

        const R = this.sphereRadius;
        const roadWidth = 4;
        const spacing = 5;

        for (let i = 0; i < pathPoints.length; i += spacing) {
            const p = pathPoints[i];
            const t = i / (pathPoints.length - 1);

            const dir = p.clone().normalize();
            const surfPt = dir.clone().multiplyScalar(R + 0.5);

            const tangent = this.cameraPath.getTangentAt(t);
            const right = new THREE.Vector3().crossVectors(tangent, dir).normalize();

            for (const side of [-1, 1]) {
                const stone = new THREE.Mesh(stoneGeo, stoneMat);
                stone.position.copy(surfPt).addScaledVector(right, side * roadWidth / 2 * 1.15);
                stone.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, 0);
                stone.castShadow = true;
                this.scene.add(stone);
            }
        }
    }

    // ===================== SECTION LANDMARKS (offset left/right of road) =====================
    createPortals() {
        this.landmarkMeshes = [];
        const R = this.sphereRadius;

        for (let idx = 0; idx < this.sectionPositions.length; idx++) {
            const section = this.sectionPositions[idx];
            // Alternate landmarks left/right of the road
            const side = (idx % 2 === 0) ? 1 : -1;
            const landmark = this.createLandmark(section, side, R);
            this.scene.add(landmark.group);
            this.portalMeshes.push(landmark);
            if (landmark.spinning) this.landmarkMeshes.push(landmark.spinning);
        }
    }

    createLandmark(section, side, R) {
        const group = new THREE.Group();

        // Get path position and tangent
        const pathPt = this.cameraPath.getPoint(section.pathT);
        const tangent = this.cameraPath.getTangent(section.pathT);
        const radialUp = pathPt.clone().normalize();

        // Compute right vector (perpendicular to tangent, on sphere surface)
        const right = new THREE.Vector3().crossVectors(tangent, radialUp).normalize();

        // Offset position: keep billboards clearly left/right of road
        const offsetDist = 12;
        const offsetPt = pathPt.clone().addScaledVector(right, side * offsetDist);

        // Project back onto sphere surface
        const offsetDir = offsetPt.clone().normalize();
        const surfacePos = offsetDir.clone().multiplyScalar(R + 1.2);

        group.position.copy(surfacePos);

        // Orient the group: up = radial outward, face toward road
        const localUp = offsetDir.clone();

        // Forward direction: toward the road point, projected onto sphere tangent plane
        const toRoad = new THREE.Vector3().subVectors(pathPt, surfacePos);
        const localForward = toRoad.clone();
        localForward.addScaledVector(localUp, -localForward.dot(localUp)).normalize();

        const localRight = new THREE.Vector3().crossVectors(localUp, localForward).normalize();

        // Build orientation matrix (columns: right, up, -forward for lookAt convention)
        const m = new THREE.Matrix4();
        m.set(
            localRight.x,  localUp.x,  -localForward.x, 0,
            localRight.y,  localUp.y,  -localForward.y, 0,
            localRight.z,  localUp.z,  -localForward.z, 0,
            0,              0,           0,               1
        );
        group.quaternion.setFromRotationMatrix(m);

        const color = new THREE.Color(section.color || 0x0099e6);

        // ---- BILLBOARD STRUCTURE ----

        // Two thick vertical wooden support posts
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x6b4c3b, roughness: 0.75, metalness: 0.15
        });
        const postGeo = new THREE.CylinderGeometry(0.28, 0.36, 10, 8);
        for (const px of [-4.6, 4.6]) {
            const post = new THREE.Mesh(postGeo, postMat);
            post.position.set(px, 6, 0);
            post.castShadow = true;
            group.add(post);
        }

        // Horizontal cross-brace between posts near ground
        const braceGeo = new THREE.CylinderGeometry(0.12, 0.12, 9.2, 6);
        const brace = new THREE.Mesh(braceGeo, postMat);
        brace.rotation.z = Math.PI / 2;
        brace.position.set(0, 1.4, 0);
        group.add(brace);

        // Diagonal back-braces for structural support
        const diagGeo = new THREE.CylinderGeometry(0.1, 0.1, 6.8, 6);
        for (const px of [-4.1, 4.1]) {
            const diag = new THREE.Mesh(diagGeo, postMat);
            diag.position.set(px, 5.8, -1.8);
            diag.rotation.x = Math.PI * 0.2;
            diag.castShadow = true;
            group.add(diag);
        }

        // Main billboard panel — large and prominent
        const panelGeo = new THREE.BoxGeometry(10, 6, 0.28);
        const panelMat = new THREE.MeshStandardMaterial({
            color: 0xf5f0e8, roughness: 0.4, metalness: 0.05
        });
        const panel = new THREE.Mesh(panelGeo, panelMat);
        panel.position.set(0, 9, 0.2);
        panel.receiveShadow = true;
        panel.castShadow = true;
        group.add(panel);

        // Color accent band across the top of the panel
        const bandGeo = new THREE.BoxGeometry(9.6, 1.6, 0.32);
        const bandMat = new THREE.MeshStandardMaterial({
            color: color, emissive: color, emissiveIntensity: 0.2,
            roughness: 0.25, metalness: 0.5
        });
        const band = new THREE.Mesh(bandGeo, bandMat);
        band.position.set(0, 11.2, 0.3);
        group.add(band);

        // Sturdy wooden frame border around the panel
        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355, roughness: 0.6, metalness: 0.25
        });
        const frameH = new THREE.BoxGeometry(10.4, 0.28, 0.36);
        const frameV = new THREE.BoxGeometry(0.28, 6.4, 0.36);

        const topFrame = new THREE.Mesh(frameH, frameMat);
        topFrame.position.set(0, 12.15, 0.2);
        group.add(topFrame);

        const botFrame = new THREE.Mesh(frameH, frameMat);
        botFrame.position.set(0, 5.85, 0.2);
        group.add(botFrame);

        const lFrame = new THREE.Mesh(frameV, frameMat);
        lFrame.position.set(-5.15, 9, 0.2);
        group.add(lFrame);

        const rFrame = new THREE.Mesh(frameV, frameMat);
        rFrame.position.set(5.15, 9, 0.2);
        group.add(rFrame);

        // Themed 3D icon on top of billboard
        const themedObj = this._createThemedObject(section.id, color);
        themedObj.position.y = 13.8;
        themedObj.scale.setScalar(0.55);
        themedObj.traverse(child => { if (child.isMesh) child.castShadow = true; });
        group.add(themedObj);

        // Spotlights illuminating the billboard face
        const glow = new THREE.PointLight(color, 0.9, 30);
        glow.position.set(0, 9, 4.8);
        group.add(glow);

        // Small ground light at billboard base
        const baseGlow = new THREE.PointLight(color, 0.32, 11);
        baseGlow.position.set(0, 1, 3);
        group.add(baseGlow);

        return {
            group,
            sectionId: section.id,
            pathT: section.pathT,
            spinning: themedObj
        };
    }

    _createThemedObject(sectionId, color) {
        const mat = new THREE.MeshPhysicalMaterial({
            color: color,
            roughness: 0.12,
            metalness: 0.65,
            clearcoat: 1.0,
            clearcoatRoughness: 0.05,
            emissive: color,
            emissiveIntensity: 0.08
        });

        let mesh;
        switch (sectionId) {
            case 'hero': {
                const geo = new THREE.DodecahedronGeometry(3, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'directing': {
                const geo = new THREE.OctahedronGeometry(2.8, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'network': {
                const grp = new THREE.Group();
                const screenGeo = new THREE.BoxGeometry(5, 3.5, 0.3);
                const screen = new THREE.Mesh(screenGeo, mat);
                grp.add(screen);
                const bezelGeo = new THREE.BoxGeometry(5.4, 3.9, 0.1);
                const bezelMat = new THREE.MeshStandardMaterial({
                    color: 0xc0c0c0, roughness: 0.2, metalness: 0.9
                });
                const bezel = new THREE.Mesh(bezelGeo, bezelMat);
                bezel.position.z = -0.15;
                grp.add(bezel);
                const standGeo = new THREE.CylinderGeometry(0.15, 0.15, 2, 8);
                const stand = new THREE.Mesh(standGeo, bezelMat);
                stand.position.y = -2.8;
                grp.add(stand);
                const standBaseGeo = new THREE.CylinderGeometry(1.2, 1.2, 0.15, 16);
                const standBase = new THREE.Mesh(standBaseGeo, bezelMat);
                standBase.position.y = -3.8;
                grp.add(standBase);
                mesh = grp;
                break;
            }
            case 'ugc': {
                const grp = new THREE.Group();
                const phoneGeo = new THREE.BoxGeometry(2.2, 4.2, 0.2);
                const phoneMat = new THREE.MeshPhysicalMaterial({
                    color: 0x1a1a2e, roughness: 0.1, metalness: 0.8,
                    clearcoat: 1, clearcoatRoughness: 0.02
                });
                const phone = new THREE.Mesh(phoneGeo, phoneMat);
                grp.add(phone);
                const screenGeo2 = new THREE.PlaneGeometry(1.9, 3.6);
                const screenMat = new THREE.MeshPhysicalMaterial({
                    color: color, roughness: 0.05, metalness: 0.1,
                    emissive: color, emissiveIntensity: 0.4,
                    transmission: 0.3, thickness: 0.1
                });
                const scr = new THREE.Mesh(screenGeo2, screenMat);
                scr.position.z = 0.11;
                grp.add(scr);
                mesh = grp;
                break;
            }
            case 'clientele': {
                const geo = new THREE.TorusKnotGeometry(2, 0.45, 80, 12, 2, 3);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'projects': {
                const geo = new THREE.IcosahedronGeometry(2.8, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'social': {
                const grp = new THREE.Group();
                const nodeMat = mat;
                const nodePositions = [
                    [0, 0, 0],
                    [2.2, 1, 0.5], [-2, 1.2, -0.3],
                    [1.5, -1.5, 0.8], [-1.8, -1, -0.5],
                    [0.5, 2, -1]
                ];
                const radii = [1.0, 0.6, 0.6, 0.55, 0.55, 0.5];
                nodePositions.forEach((p, i) => {
                    const s = new THREE.Mesh(
                        new THREE.SphereGeometry(radii[i], 16, 16), nodeMat
                    );
                    s.position.set(p[0], p[1], p[2]);
                    grp.add(s);
                });
                const lineMat = new THREE.MeshStandardMaterial({
                    color: color, roughness: 0.3, metalness: 0.7
                });
                for (let i = 1; i < nodePositions.length; i++) {
                    const start = new THREE.Vector3(...nodePositions[0]);
                    const end = new THREE.Vector3(...nodePositions[i]);
                    const d = new THREE.Vector3().subVectors(end, start);
                    const len = d.length();
                    const rod = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.06, 0.06, len, 6), lineMat
                    );
                    rod.position.copy(start).add(d.multiplyScalar(0.5));
                    rod.lookAt(end);
                    rod.rotateX(Math.PI / 2);
                    grp.add(rod);
                }
                mesh = grp;
                break;
            }
            case 'resume': {
                const grp = new THREE.Group();
                const colMat = new THREE.MeshPhysicalMaterial({
                    color: 0xf0e6d3, roughness: 0.35, metalness: 0.3,
                    clearcoat: 0.5
                });
                const shaft = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.9, 1.1, 5, 12), colMat
                );
                grp.add(shaft);
                const capMesh = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.4, 0.9, 0.6, 12), colMat
                );
                capMesh.position.y = 2.8;
                grp.add(capMesh);
                const colBase = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.1, 1.3, 0.5, 12), colMat
                );
                colBase.position.y = -2.75;
                grp.add(colBase);
                const topRing = new THREE.Mesh(
                    new THREE.TorusGeometry(1.3, 0.08, 8, 24), new THREE.MeshStandardMaterial({
                        color: color, emissive: color, emissiveIntensity: 0.3,
                        metalness: 0.9, roughness: 0.1
                    })
                );
                topRing.rotation.x = Math.PI / 2;
                topRing.position.y = 3.2;
                grp.add(topRing);
                mesh = grp;
                break;
            }
            case 'contact': {
                const grp = new THREE.Group();
                const beaconMat = new THREE.MeshPhysicalMaterial({
                    color: color, roughness: 0.1, metalness: 0.7,
                    clearcoat: 1, emissive: color, emissiveIntensity: 0.15
                });
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry(1.5, 4, 12), beaconMat
                );
                grp.add(cone);
                const beaconRing = new THREE.Mesh(
                    new THREE.TorusGeometry(2, 0.25, 8, 32), new THREE.MeshStandardMaterial({
                        color: color, emissive: color, emissiveIntensity: 0.6,
                        metalness: 0.8, roughness: 0.1
                    })
                );
                beaconRing.rotation.x = Math.PI / 2;
                beaconRing.position.y = 1;
                grp.add(beaconRing);
                const ring2 = new THREE.Mesh(
                    new THREE.TorusGeometry(1.3, 0.15, 8, 24), new THREE.MeshStandardMaterial({
                        color: color, emissive: color, emissiveIntensity: 0.4,
                        metalness: 0.8, roughness: 0.1
                    })
                );
                ring2.rotation.x = Math.PI / 2;
                ring2.position.y = 2.2;
                grp.add(ring2);
                mesh = grp;
                break;
            }
            default: {
                const geo = new THREE.SphereGeometry(2.5, 24, 24);
                mesh = new THREE.Mesh(geo, mat);
            }
        }

        return mesh;
    }

    // ===================== ATMOSPHERE =====================
    createAtmosphere() {
        this.scene.fog = new THREE.FogExp2(0xc5e5f5, 0.0003);
    }

    // ===================== DECORATIONS (trees & flowers on sphere) =====================
    createDecorations() {
        const R = this.sphereRadius;
        const treeGeo = new THREE.ConeGeometry(1.5, 5, 6);
        const treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d8f4e, roughness: 0.85 });
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e4c, roughness: 0.9 });

        for (let i = 0; i < 100; i++) {
            // Random point on sphere (mid-latitudes matching path band)
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            // Avoid road area
            let tooClose = false;
            for (const pp of this._pathSurfaceSamples) {
                const dot = dir.dot(pp.dir);
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle * R < 10) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const treeGroup = new THREE.Group();

            const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
            trunk.position.y = 1;
            treeGroup.add(trunk);

            const layers = 2 + Math.floor(Math.random() * 2);
            for (let j = 0; j < layers; j++) {
                const cone = new THREE.Mesh(treeGeo, treeMat);
                cone.position.y = 3 + j * 2.5;
                cone.scale.setScalar(1 - j * 0.2);
                treeGroup.add(cone);
            }

            const h = this._getSurfaceDisplacement(theta, phi);
            const surfPos = dir.clone().multiplyScalar(R + h);
            treeGroup.position.copy(surfPos);

            // Orient tree to stand upright on sphere (local +Y → radial outward)
            const radialDir = surfPos.clone().normalize();
            treeGroup.quaternion.setFromUnitVectors(
                new THREE.Vector3(0, 1, 0), radialDir
            );

            const sc = 0.5 + Math.random() * 0.7;
            treeGroup.scale.setScalar(sc);
            treeGroup.castShadow = true;
            this.scene.add(treeGroup);
        }

        // Flowers on sphere surface
        const flowerColors = [0xff6b9d, 0xffd93d, 0x6bcb77, 0xc084fc, 0xffa07a];
        const flowerGeo = new THREE.SphereGeometry(0.15, 4, 4);

        for (let i = 0; i < 160; i++) {
            const theta = Math.random() * Math.PI * 2;
            const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
            const dir = new THREE.Vector3(
                Math.sin(phi) * Math.cos(theta),
                Math.cos(phi),
                Math.sin(phi) * Math.sin(theta)
            );

            let tooClose = false;
            for (const pp of this._pathSurfaceSamples) {
                const dot = dir.dot(pp.dir);
                const angle = Math.acos(Math.max(-1, Math.min(1, dot)));
                if (angle * R < 6) { tooClose = true; break; }
            }
            if (tooClose) continue;

            const fColor = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            const fMat = new THREE.MeshStandardMaterial({
                color: fColor, emissive: fColor, emissiveIntensity: 0.2, roughness: 0.8
            });
            const flower = new THREE.Mesh(flowerGeo, fMat);

            const h = this._getSurfaceDisplacement(theta, phi);
            flower.position.copy(dir.clone().multiplyScalar(R + h + 0.2));
            this.scene.add(flower);
        }
    }

    // Compute terrain noise displacement at given spherical coords
    _getSurfaceDisplacement(theta, phi) {
        let h = fbm(theta * 4 + 50, phi * 6 + 50, 5) * 4 - 1;
        h += Math.sin(theta * 5) * Math.cos(phi * 4) * 0.8;
        return h;
    }

    // ===================== SET LANDMARK ACTIVE STATE =====================
    setActiveSection(sectionId) {
        for (const portal of this.portalMeshes) {
            portal._isActive = portal.sectionId === sectionId;
        }
    }

    // ===================== UPDATE LOOP =====================
    update(deltaTime, cameraPos) {
        this.time += deltaTime;

        // Update road shader
        if (this.roadUniforms) {
            this.roadUniforms.time.value = this.time;
        }

        // Update cloud materials
        for (const mat of this.cloudMaterials) {
            mat.uniforms.time.value = this.time;
        }

        // Animate clouds — gentle orbit around the globe
        for (const cloud of this.clouds) {
            cloud.userData.theta += cloud.userData.speed * deltaTime;
            const t = cloud.userData.theta;
            const p = cloud.userData.phi;
            const alt = cloud.userData.alt;
            cloud.position.set(
                alt * Math.sin(p) * Math.cos(t),
                alt * Math.cos(p),
                alt * Math.sin(p) * Math.sin(t)
            );
            cloud.lookAt(0, 0, 0);
            cloud.rotateX(Math.PI);
        }

        // Animate landmarks — gentle rotation
        for (const lm of this.landmarkMeshes) {
            if (lm) lm.rotation.y += deltaTime * 0.3;
        }

        // Move camera light near camera
        if (cameraPos) {
            this.cameraLight.position.copy(cameraPos);
        }

        // Sky dome centered on sphere origin
        if (this.skyMesh) {
            this.skyMesh.position.set(0, 0, 0);
        }

        // Sun tracks camera direction so lighting is always good
        if (cameraPos) {
            const sunDir = cameraPos.clone().normalize();
            this.sunLight.position.copy(sunDir.clone().multiplyScalar(300));
            this.sunLight.position.y += 150;
            this.sunLight.target.position.set(0, 0, 0);
            this.sunLight.target.updateMatrixWorld();
        }
    }
}

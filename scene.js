// ============================================================
// SCENE.JS — 3D Spherical World Environment
// Green valley globe with iridescent road, landmarks, atmosphere
// ============================================================

import * as THREE from 'three';
import {
    skyVertexShader, skyFragmentShader,
    roadVertexShader, roadFragmentShader,
    cloudVertexShader, cloudFragmentShader,
    bubbleVertexShader, bubbleFragmentShader
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

        // worldGroup contains everything that rotates with the planet.
        // Lighting and sky stay in scene (world-space fixed).
        this.worldGroup = new THREE.Group();

        this.createLighting();
        this.createSky();
        this.createTerrain();
        this.createClouds();
        this.createRoad();
        this.createPortals();
        this.createAtmosphere();
        this.createDecorations();
        this.createBubbles();

        this.scene.add(this.worldGroup);
    }

    // ===================== LIGHTING =====================
    createLighting() {
        const hemi = new THREE.HemisphereLight(0xB8E4F9, 0x7ecda0, 0.75);
        this.scene.add(hemi);

        const sun = new THREE.DirectionalLight(0xfff8f0, 1.4);
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
                topColor:    { value: new THREE.Color(0x87CEEB) },
                midColor:    { value: new THREE.Color(0xB8E4F9) },
                bottomColor: { value: new THREE.Color(0xE8F6FF) },
                offset:      { value: 20 },
                exponent:    { value: 0.45 }
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
        this.worldGroup.add(this.terrainMesh);
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

            this.worldGroup.add(group);
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
        this.worldGroup.add(road);

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
                this.worldGroup.add(stone);
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
            this.worldGroup.add(landmark.group);
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

        // Offset position: billboard placed beside road, close enough to fill frame
        const offsetDist = 6;
        const offsetPt = pathPt.clone().addScaledVector(right, side * offsetDist);

        // Project back onto sphere surface
        const offsetDir = offsetPt.clone().normalize();
        const surfacePos = offsetDir.clone().multiplyScalar(R + 2.5);

        group.position.copy(surfacePos);

        // Stable orientation: radial up + face toward road center
        group.up.copy(offsetDir);
        group.lookAt(pathPt);

        const color = new THREE.Color(section.color || 0x0099e6);

        // ---- FLAT SECTION-SURFACE BILLBOARD ----
        // 20×14 world units — large enough for HTML panel to fill most of frame
        const boardW = 20;
        const boardH = 14;

        const boardMat = new THREE.MeshStandardMaterial({
            color: 0xf5f0e8,
            roughness: 0.55,
            metalness: 0.03,
            transparent: true,
            opacity: 1.0
        });
        const boardGeo = new THREE.BoxGeometry(boardW, boardH, 0.5);
        const board = new THREE.Mesh(boardGeo, boardMat);
        // Board center Y=7: bottom at Y=0, top at Y=14
        // Camera jibs to R+9.5 when active, aligning with board center
        board.position.set(0, 7.0, 0.1);
        board.receiveShadow = true;
        board.castShadow = true;
        group.add(board);

        const frameMat = new THREE.MeshStandardMaterial({
            color: 0x8b7355,
            roughness: 0.62,
            metalness: 0.2
        });
        // Frame edges: board center Y=7, half-height=7 → top=14, bottom=0
        const frameTop = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.5, 0.4, 0.4), frameMat);
        frameTop.position.set(0, 14.2, 0.1);
        group.add(frameTop);

        const frameBottom = new THREE.Mesh(new THREE.BoxGeometry(boardW + 0.5, 0.4, 0.4), frameMat);
        frameBottom.position.set(0, -0.2, 0.1);
        group.add(frameBottom);

        const frameLeft = new THREE.Mesh(new THREE.BoxGeometry(0.4, boardH + 0.4, 0.4), frameMat);
        frameLeft.position.set(-(boardW / 2 + 0.15), 7.0, 0.1);
        group.add(frameLeft);

        const frameRight = new THREE.Mesh(new THREE.BoxGeometry(0.4, boardH + 0.4, 0.4), frameMat);
        frameRight.position.set(boardW / 2 + 0.15, 7.0, 0.1);
        group.add(frameRight);

        const accent = new THREE.Mesh(
            new THREE.BoxGeometry(boardW - 0.5, 1.1, 0.28),
            new THREE.MeshStandardMaterial({
                color,
                emissive: color,
                emissiveIntensity: 0.18,
                roughness: 0.28,
                metalness: 0.5
            })
        );
        // Accent bar just under the top frame
        accent.position.set(0, 13.3, 0.14);
        group.add(accent);

        const glow = new THREE.PointLight(color, 0.8, 28);
        glow.position.set(0, 7.0, 4.0);
        group.add(glow);

        // Support posts — legs anchoring billboard to the ground
        const postMat = new THREE.MeshStandardMaterial({
            color: 0x6b5b45,
            roughness: 0.75,
            metalness: 0.15
        });
        const postGeo = new THREE.CylinderGeometry(0.22, 0.28, 8, 8);
        const leftPost = new THREE.Mesh(postGeo, postMat);
        leftPost.position.set(-(boardW / 2 - 1.0), -2.0, 0);
        leftPost.castShadow = true;
        group.add(leftPost);

        const rightPost = new THREE.Mesh(postGeo, postMat);
        rightPost.position.set(boardW / 2 - 1.0, -2.0, 0);
        rightPost.castShadow = true;
        group.add(rightPost);

        // Default with visible depth; flattens further when camera approaches
        group.scale.set(1, 1, 0.55);

        return {
            group,
            sectionId: section.id,
            pathT: section.pathT,
            spinning: null,
            board,
            baseQuaternion: group.quaternion.clone()
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

    // ===================== ATMOSPHERE (Frutiger Aero dreamy haze) =====================
    createAtmosphere() {
        this.scene.fog = new THREE.FogExp2(0xdaedfa, 0.0006);
    }

    // ===================== DECORATIONS (flowers on sphere — trees removed for Frutiger Aero) =====================
    createDecorations() {
        const R = this.sphereRadius;

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
            this.worldGroup.add(flower);
        }
    }

    // Compute terrain noise displacement at given spherical coords
    _getSurfaceDisplacement(theta, phi) {
        let h = fbm(theta * 4 + 50, phi * 6 + 50, 5) * 4 - 1;
        h += Math.sin(theta * 5) * Math.cos(phi * 4) * 0.8;
        return h;
    }

    // ===================== FLOATING IRIDESCENT BUBBLES (Frutiger Aero) =====================
    createBubbles() {
        const isMobile = /Mobi|Android|iPhone|iPad/i.test(navigator.userAgent) || window.innerWidth < 768;
        const bubbleCount = isMobile ? 12 : 35;
        const bubbleGeo = new THREE.SphereGeometry(1, 24, 24);
        const R = this.sphereRadius;

        this.bubbles = [];
        this.bubbleMaterials = [];

        for (let i = 0; i < bubbleCount; i++) {
            const mat = new THREE.ShaderMaterial({
                vertexShader: bubbleVertexShader,
                fragmentShader: bubbleFragmentShader,
                uniforms: {
                    time: { value: 0 },
                    opacity: { value: 0.35 + Math.random() * 0.15 }
                },
                transparent: true,
                side: THREE.DoubleSide,
                depthWrite: false
            });

            const size = 0.3 + Math.random() * 2.2;
            const bubble = new THREE.Mesh(bubbleGeo, mat);
            bubble.scale.setScalar(size);

            const theta = Math.random() * Math.PI * 2;
            const phi = Math.PI * 0.2 + Math.random() * Math.PI * 0.6;
            const alt = R + 2 + Math.random() * 30;

            bubble.position.set(
                alt * Math.sin(phi) * Math.cos(theta),
                alt * Math.cos(phi),
                alt * Math.sin(phi) * Math.sin(theta)
            );

            bubble.userData = {
                theta, phi, alt,
                speed: 0.0008 + Math.random() * 0.003,
                driftSpeed: 0.15 + Math.random() * 0.4,
                phase: Math.random() * Math.PI * 2,
                baseAlt: alt
            };

            this.worldGroup.add(bubble);
            this.bubbles.push(bubble);
            this.bubbleMaterials.push(mat);
        }
    }

    // ===================== SET LANDMARK ACTIVE STATE =====================
    setActiveSection(sectionId) {
        for (const portal of this.portalMeshes) {
            portal._isActive = portal.sectionId === sectionId;
        }
    }

    // Get billboard BOARD FACE CENTER in world space for camera look-at blending
    getBillboardPosition(sectionId) {
        const portal = this.portalMeshes.find(p => p.sectionId === sectionId);
        if (!portal || !portal.board) return null;
        portal.board.updateWorldMatrix(true, false);
        const center = new THREE.Vector3(0, 0, 0.35);
        center.applyMatrix4(portal.board.matrixWorld);
        return center;
    }

    // Get the exact face center, face normal, and billboard world-up for dock mode.
    // normal: direction the face points (toward camera / road side).
    // up:     billboard's own world-Y so camera.up can match it (zero apparent roll).
    getBillboardFaceInfo(sectionId) {
        const portal = this.portalMeshes.find(p => p.sectionId === sectionId);
        if (!portal || !portal.board) return null;

        const board = portal.board;
        board.updateWorldMatrix(true, false);

        // Face centre on the +Z face of the board
        const center = new THREE.Vector3(0, 0, 0.35).applyMatrix4(board.matrixWorld);

        // Face normal = board local +Z mapped to world, then subtract the mapped origin
        const origin   = new THREE.Vector3(0, 0, 0).applyMatrix4(board.matrixWorld);
        const normalPt = new THREE.Vector3(0, 0, 1).applyMatrix4(board.matrixWorld);
        const normal   = normalPt.sub(origin).normalize();

        // Billboard world-up = group's local Y in world space
        // Using the group's world quaternion so we get exact orientation
        const groupQuat = new THREE.Quaternion();
        portal.group.getWorldQuaternion(groupQuat);
        const up = new THREE.Vector3(0, 1, 0).applyQuaternion(groupQuat).normalize();

        return { center, normal, up };
    }

    // Get the 4 world-space corners of a billboard's board face
    // Returns { center, topLeft, topRight, bottomLeft, bottomRight } in world coords
    getBillboardCorners(sectionId) {
        const portal = this.portalMeshes.find(p => p.sectionId === sectionId);
        if (!portal || !portal.board) return null;

        const board = portal.board;
        const group = portal.group;

        // Board local dimensions: 20 wide x 14 tall, positioned at (0, 7.0, 0.1)
        const hw = 20 / 2;  // half width = 10
        const hh = 14 / 2;  // half height = 7

        // Local-space corner positions on the FRONT face of the board
        const corners = [
            new THREE.Vector3(-hw, hh, 0.35),   // top-left
            new THREE.Vector3(hw, hh, 0.35),    // top-right
            new THREE.Vector3(-hw, -hh, 0.35),  // bottom-left
            new THREE.Vector3(hw, -hh, 0.35)    // bottom-right
        ];

        // Transform from board local → group local → world
        const boardWorldMatrix = new THREE.Matrix4();
        board.updateWorldMatrix(true, false);
        boardWorldMatrix.copy(board.matrixWorld);

        const worldCorners = corners.map(c => c.clone().applyMatrix4(boardWorldMatrix));

        return {
            topLeft: worldCorners[0],
            topRight: worldCorners[1],
            bottomLeft: worldCorners[2],
            bottomRight: worldCorners[3],
            center: new THREE.Vector3().addVectors(worldCorners[0], worldCorners[3]).multiplyScalar(0.5)
        };
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

        // Animate floating bubbles
        if (this.bubbles) {
            for (const bubble of this.bubbles) {
                const ud = bubble.userData;
                ud.theta += ud.speed * deltaTime;
                // Gentle vertical drift
                const driftAlt = ud.baseAlt + Math.sin(this.time * ud.driftSpeed + ud.phase) * 2;
                bubble.position.set(
                    driftAlt * Math.sin(ud.phi) * Math.cos(ud.theta),
                    driftAlt * Math.cos(ud.phi),
                    driftAlt * Math.sin(ud.phi) * Math.sin(ud.theta)
                );
            }
            for (const mat of this.bubbleMaterials) {
                mat.uniforms.time.value = this.time;
            }
        }

        // Billboard flattening as camera gets close / arrives at section
        if (cameraPos) {
            for (const portal of this.portalMeshes) {
                if (!portal?.group) continue;
                // portal.group is inside worldGroup — need world-space position
                const _gwp = new THREE.Vector3();
                portal.group.getWorldPosition(_gwp);
                const d = _gwp.distanceTo(cameraPos);
                const nearT = THREE.MathUtils.clamp((80 - d) / 55, 0, 1);
                const targetZ = portal._isActive ? 0.08 : THREE.MathUtils.lerp(0.55, 0.15, nearT);
                const targetXY = portal._isActive ? 1.08 : THREE.MathUtils.lerp(1.0, 1.04, nearT);

                // Smoothly face camera as user approaches (not only when active)
                const faceBlend = portal._isActive ? 1 : THREE.MathUtils.smoothstep(nearT, 0.12, 0.95);
                const radialUp = portal.group.position.clone().normalize();

                const camFacingRef = new THREE.Object3D();
                camFacingRef.position.copy(portal.group.position);
                camFacingRef.up.copy(radialUp);
                camFacingRef.lookAt(cameraPos);

                const targetQuat = portal.baseQuaternion
                    ? portal.baseQuaternion.clone().slerp(camFacingRef.quaternion, faceBlend)
                    : camFacingRef.quaternion;
                // Faster rotation when active so billboard faces user squarely
                const slerpRate = portal._isActive ? 0.6 : 0.3;
                portal.group.quaternion.slerp(targetQuat, slerpRate);

                portal.group.scale.x += (targetXY - portal.group.scale.x) * 0.12;
                portal.group.scale.y += (targetXY - portal.group.scale.y) * 0.12;
                portal.group.scale.z += (targetZ - portal.group.scale.z) * 0.14;

                // Fade board face when active so HTML panel replaces it
                if (portal.board && portal.board.material) {
                    // Fade to 0 so the 3D board fully disappears behind the HTML panel
                    const targetOpacity = portal._isActive ? 0.0 : 1.0;
                    portal.board.material.opacity += (targetOpacity - portal.board.material.opacity) * 0.12;
                }
            }
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

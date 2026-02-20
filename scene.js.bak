// ============================================================
// SCENE.JS — 3D World Environment
// Terrain, Sky, Clouds, Road, Portals, Lighting, Atmosphere
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

// ---- Exported World class ----
export class World {
    constructor(scene, cameraPath, sectionPositions) {
        this.scene = scene;
        this.cameraPath = cameraPath;           // CatmullRomCurve3
        this.sectionPositions = sectionPositions; // [{pos: Vector3, ...}, ...]
        this.time = 0;
        this.clouds = [];
        this.portalMeshes = [];
        this.roadUniforms = null;
        this.cloudMaterials = [];
        this.landmarkMeshes = [];

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
        // Hemisphere (sky / ground bounce)
        const hemi = new THREE.HemisphereLight(0x87CEEB, 0x56c596, 0.5);
        this.scene.add(hemi);

        // Directional sunlight
        const sun = new THREE.DirectionalLight(0xfff5e6, 1.2);
        sun.position.set(80, 120, -60);
        sun.castShadow = true;
        sun.shadow.mapSize.set(1024, 1024);
        sun.shadow.camera.near = 0.5;
        sun.shadow.camera.far = 500;
        sun.shadow.camera.left = -150;
        sun.shadow.camera.right = 150;
        sun.shadow.camera.top = 150;
        sun.shadow.camera.bottom = -150;
        this.scene.add(sun);
        this.scene.add(sun.target);
        this.sunLight = sun;

        // Soft ambient fill
        const ambient = new THREE.AmbientLight(0xb3e5fc, 0.35);
        this.scene.add(ambient);

        // Subtle warm point light following camera area
        this.cameraLight = new THREE.PointLight(0xffe0b2, 0.3, 60);
        this.cameraLight.position.set(0, 10, 0);
        this.scene.add(this.cameraLight);
    }

    // ===================== SKY DOME =====================
    createSky() {
        const geo = new THREE.SphereGeometry(800, 32, 32);
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

    // ===================== TERRAIN =====================
    createTerrain() {
        const width = 600, depth = 1400;
        const segW = 128, segD = 256;
        const geo = new THREE.PlaneGeometry(width, depth, segW, segD);
        geo.rotateX(-Math.PI / 2);

        // Get path points for road flattening (sparse sampling)
        const pathSamples = 150;
        const pathPoints2D = [];
        for (let i = 0; i <= pathSamples; i++) {
            const t = i / pathSamples;
            const pt = this.cameraPath.getPoint(t);
            pathPoints2D.push({ x: pt.x, z: pt.z });
        }

        const positions = geo.attributes.position;
        const colors = new Float32Array(positions.count * 3);

        for (let i = 0; i < positions.count; i++) {
            const x = positions.getX(i);
            const z = positions.getZ(i);

            // Base terrain height from noise
            let h = fbm(x * 0.007 + 50, z * 0.005 + 50, 5) * 30 - 8;
            h += Math.sin(x * 0.015) * Math.cos(z * 0.012) * 5;

            // Flatten near road path (quick nearest-neighbor check)
            let minDist = Infinity;
            for (const pp of pathPoints2D) {
                const dx = x - pp.x, dz = z - pp.z;
                const d2 = dx * dx + dz * dz;
                if (d2 < minDist) minDist = d2;
            }
            minDist = Math.sqrt(minDist);
            const roadWidth = 6;
            const blendWidth = 15;
            if (minDist < roadWidth + blendWidth) {
                const blend = Math.max(0, (minDist - roadWidth) / blendWidth);
                const flatH = -1.5;
                h = flatH + (h - flatH) * smoothstep(0, 1, blend);
            }

            positions.setY(i, h);

            // Vertex colors: green with subtle variation
            const greenBase = 0.35 + fbm(x * 0.02, z * 0.02, 3) * 0.15;
            const r = 0.18 + Math.random() * 0.05;
            const g = greenBase + Math.random() * 0.05;
            const b = 0.15 + Math.random() * 0.04;
            colors[i * 3] = r;
            colors[i * 3 + 1] = g;
            colors[i * 3 + 2] = b;
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

    // ===================== CLOUDS =====================
    createClouds() {
        const cloudGeo = new THREE.IcosahedronGeometry(1, 3);

        for (let i = 0; i < 45; i++) {
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

            // Create cloud cluster (3-6 overlapping spheres)
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

            group.position.set(
                (Math.random() - 0.5) * 500,
                55 + Math.random() * 60,
                (Math.random() - 0.5) * 1400
            );

            group.userData.speed = 0.02 + Math.random() * 0.04;
            group.userData.wobble = Math.random() * Math.PI * 2;

            this.scene.add(group);
            this.clouds.push(group);
            this.cloudMaterials.push(mat);
        }
    }

    // ===================== IRIDESCENT BRICK ROAD =====================
    createRoad() {
        // Sample the path to create road geometry
        const pathPoints = this.cameraPath.getSpacedPoints(300);

        // Create road as a flat ribbon along the path
        const roadWidth = 5;
        const vertices = [];
        const uvs = [];
        const indices = [];
        const normals = [];

        for (let i = 0; i < pathPoints.length; i++) {
            const p = pathPoints[i];
            const t = i / (pathPoints.length - 1);

            // Get tangent for perpendicular direction
            const tangent = this.cameraPath.getTangent(t);
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

            const leftPt  = new THREE.Vector3().copy(p).addScaledVector(right, -roadWidth / 2);
            const rightPt = new THREE.Vector3().copy(p).addScaledVector(right,  roadWidth / 2);

            // Position road slightly above terrain
            leftPt.y  = -1.0;
            rightPt.y = -1.0;

            vertices.push(leftPt.x, leftPt.y, leftPt.z);
            vertices.push(rightPt.x, rightPt.y, rightPt.z);

            uvs.push(0, t * 20);
            uvs.push(1, t * 20);

            normals.push(0, 1, 0);
            normals.push(0, 1, 0);

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
            baseColor: { value: new THREE.Color(0xd4a84b) }  // Golden base
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

        // Road border stones
        this.createRoadBorders(pathPoints);
    }

    createRoadBorders(pathPoints) {
        const stoneGeo = new THREE.DodecahedronGeometry(0.3, 0);
        const stoneMat = new THREE.MeshStandardMaterial({
            color: 0xc0c0c0,
            roughness: 0.6,
            metalness: 0.4
        });

        const roadWidth = 5;
        const spacing = 4;

        for (let i = 0; i < pathPoints.length; i += spacing) {
            const p = pathPoints[i];
            const t = i / (pathPoints.length - 1);
            const tangent = this.cameraPath.getTangent(t);
            const up = new THREE.Vector3(0, 1, 0);
            const right = new THREE.Vector3().crossVectors(tangent, up).normalize();

            for (const side of [-1, 1]) {
                const stone = new THREE.Mesh(stoneGeo, stoneMat);
                stone.position.copy(p).addScaledVector(right, side * roadWidth / 2 * 1.1);
                stone.position.y = -0.8;
                stone.rotation.set(Math.random() * 0.5, Math.random() * Math.PI, 0);
                stone.castShadow = true;
                this.scene.add(stone);
            }
        }
    }

    // ===================== SECTION LANDMARKS =====================
    createPortals() {
        this.landmarkMeshes = []; // rotating landmark objects
        for (const section of this.sectionPositions) {
            const landmark = this.createLandmark(section);
            this.scene.add(landmark.group);
            this.portalMeshes.push(landmark);
            if (landmark.spinning) this.landmarkMeshes.push(landmark.spinning);
        }
    }

    createLandmark(section) {
        const group = new THREE.Group();
        group.position.copy(section.pos);

        // Face incoming camera direction
        const tangent = this.cameraPath.getTangent(section.pathT);
        const lookTarget = new THREE.Vector3().copy(section.pos).add(tangent);
        lookTarget.y = section.pos.y;
        group.lookAt(lookTarget);

        const color = new THREE.Color(section.color || 0x0099e6);

        // Base platform — metallic disc
        const baseGeo = new THREE.CylinderGeometry(4, 4.5, 0.4, 24);
        const baseMat = new THREE.MeshStandardMaterial({
            color: 0xe0e0e0, roughness: 0.25, metalness: 0.8
        });
        const base = new THREE.Mesh(baseGeo, baseMat);
        base.position.set(0, -0.6, 0);
        base.receiveShadow = true;
        group.add(base);

        // Accent ring
        const ringGeo = new THREE.TorusGeometry(4.2, 0.1, 8, 48);
        const ringMat = new THREE.MeshStandardMaterial({
            color: color, emissive: color, emissiveIntensity: 0.3,
            roughness: 0.15, metalness: 0.9
        });
        const ring = new THREE.Mesh(ringGeo, ringMat);
        ring.rotation.x = Math.PI / 2;
        ring.position.set(0, -0.3, 0);
        group.add(ring);

        // Create themed 3D object
        const themedObj = this._createThemedObject(section.id, color);
        themedObj.position.y = 6;
        themedObj.traverse(child => { if (child.isMesh) child.castShadow = true; });
        group.add(themedObj);

        // Soft glow point light at landmark
        const glow = new THREE.PointLight(color, 0.6, 20);
        glow.position.set(0, 6, 0);
        group.add(glow);

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
                // Crystalline dodecahedron — matches the scroll indicator
                const geo = new THREE.DodecahedronGeometry(3, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'directing': {
                // Clapperboard / diamond shape — creative vision
                const geo = new THREE.OctahedronGeometry(2.8, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'network': {
                // Monitor / screen shape — broadcast media
                const grp = new THREE.Group();
                const screenGeo = new THREE.BoxGeometry(5, 3.5, 0.3);
                const screen = new THREE.Mesh(screenGeo, mat);
                grp.add(screen);
                // Screen bezel glow
                const bezelGeo = new THREE.BoxGeometry(5.4, 3.9, 0.1);
                const bezelMat = new THREE.MeshStandardMaterial({
                    color: 0xc0c0c0, roughness: 0.2, metalness: 0.9
                });
                const bezel = new THREE.Mesh(bezelGeo, bezelMat);
                bezel.position.z = -0.15;
                grp.add(bezel);
                // Stand
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
                // Smartphone shape — vertical content
                const grp = new THREE.Group();
                const phoneGeo = new THREE.BoxGeometry(2.2, 4.2, 0.2);
                const phoneMat = new THREE.MeshPhysicalMaterial({
                    color: 0x1a1a2e, roughness: 0.1, metalness: 0.8,
                    clearcoat: 1, clearcoatRoughness: 0.02
                });
                const phone = new THREE.Mesh(phoneGeo, phoneMat);
                grp.add(phone);
                // Screen
                const screenGeo = new THREE.PlaneGeometry(1.9, 3.6);
                const screenMat = new THREE.MeshPhysicalMaterial({
                    color: color, roughness: 0.05, metalness: 0.1,
                    emissive: color, emissiveIntensity: 0.4,
                    transmission: 0.3, thickness: 0.1
                });
                const scr = new THREE.Mesh(screenGeo, screenMat);
                scr.position.z = 0.11;
                grp.add(scr);
                mesh = grp;
                break;
            }
            case 'clientele': {
                // Elegant torus knot — interconnected relationships
                const geo = new THREE.TorusKnotGeometry(2, 0.45, 80, 12, 2, 3);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'projects': {
                // Multi-faceted icosahedron — many projects
                const geo = new THREE.IcosahedronGeometry(2.8, 0);
                mesh = new THREE.Mesh(geo, mat);
                break;
            }
            case 'social': {
                // Connected spheres — social network graph
                const grp = new THREE.Group();
                const nodeMat = mat;
                const positions = [
                    [0, 0, 0],
                    [2.2, 1, 0.5], [-2, 1.2, -0.3],
                    [1.5, -1.5, 0.8], [-1.8, -1, -0.5],
                    [0.5, 2, -1]
                ];
                const radii = [1.0, 0.6, 0.6, 0.55, 0.55, 0.5];
                positions.forEach((p, i) => {
                    const s = new THREE.Mesh(
                        new THREE.SphereGeometry(radii[i], 16, 16), nodeMat
                    );
                    s.position.set(p[0], p[1], p[2]);
                    grp.add(s);
                });
                // Connection lines
                const lineMat = new THREE.MeshStandardMaterial({
                    color: color, roughness: 0.3, metalness: 0.7
                });
                for (let i = 1; i < positions.length; i++) {
                    const start = new THREE.Vector3(...positions[0]);
                    const end = new THREE.Vector3(...positions[i]);
                    const dir = new THREE.Vector3().subVectors(end, start);
                    const len = dir.length();
                    const rod = new THREE.Mesh(
                        new THREE.CylinderGeometry(0.06, 0.06, len, 6), lineMat
                    );
                    rod.position.copy(start).add(dir.multiplyScalar(0.5));
                    rod.lookAt(end);
                    rod.rotateX(Math.PI / 2);
                    grp.add(rod);
                }
                mesh = grp;
                break;
            }
            case 'resume': {
                // Classical column / obelisk — professional experience
                const grp = new THREE.Group();
                const colMat = new THREE.MeshPhysicalMaterial({
                    color: 0xf0e6d3, roughness: 0.35, metalness: 0.3,
                    clearcoat: 0.5
                });
                const shaft = new THREE.Mesh(
                    new THREE.CylinderGeometry(0.9, 1.1, 5, 12), colMat
                );
                grp.add(shaft);
                // Capital (top)
                const cap = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.4, 0.9, 0.6, 12), colMat
                );
                cap.position.y = 2.8;
                grp.add(cap);
                // Base
                const colBase = new THREE.Mesh(
                    new THREE.CylinderGeometry(1.1, 1.3, 0.5, 12), colMat
                );
                colBase.position.y = -2.75;
                grp.add(colBase);
                // Accent ring at top
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
                // Beacon / lighthouse — reaching out
                const grp = new THREE.Group();
                const beaconMat = new THREE.MeshPhysicalMaterial({
                    color: color, roughness: 0.1, metalness: 0.7,
                    clearcoat: 1, emissive: color, emissiveIntensity: 0.15
                });
                // Tall cone
                const cone = new THREE.Mesh(
                    new THREE.ConeGeometry(1.5, 4, 12), beaconMat
                );
                grp.add(cone);
                // Glowing ring beacon
                const beacon = new THREE.Mesh(
                    new THREE.TorusGeometry(2, 0.25, 8, 32), new THREE.MeshStandardMaterial({
                        color: color, emissive: color, emissiveIntensity: 0.6,
                        metalness: 0.8, roughness: 0.1
                    })
                );
                beacon.rotation.x = Math.PI / 2;
                beacon.position.y = 1;
                grp.add(beacon);
                // Second smaller ring
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
        this.scene.fog = new THREE.FogExp2(0xc5e5f5, 0.0025);
    }

    // ===================== DECORATIONS =====================
    createDecorations() {
        // Grass tufts / small plants scattered on terrain
        const treeGeo = new THREE.ConeGeometry(1.5, 5, 6);
        const treeTrunkGeo = new THREE.CylinderGeometry(0.2, 0.3, 2, 6);
        const treeMat = new THREE.MeshStandardMaterial({ color: 0x2d8f4e, roughness: 0.85 });
        const trunkMat = new THREE.MeshStandardMaterial({ color: 0x8d6e4c, roughness: 0.9 });

        // Sample path for avoidance
        const pathSamples = [];
        for (let i = 0; i <= 100; i++) {
            const pt = this.cameraPath.getPoint(i / 100);
            pathSamples.push(pt);
        }

        for (let i = 0; i < 120; i++) {
            const x = (Math.random() - 0.5) * 400;
            const z = (Math.random() - 0.5) * 1200;

            // Avoid road area
            let tooClose = false;
            for (const pp of pathSamples) {
                if (Math.sqrt((x - pp.x) ** 2 + (z - pp.z) ** 2) < 12) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const treeGroup = new THREE.Group();

            // Trunk
            const trunk = new THREE.Mesh(treeTrunkGeo, trunkMat);
            trunk.position.y = 1;
            treeGroup.add(trunk);

            // Canopy (2-3 stacked cones)
            const layers = 2 + Math.floor(Math.random() * 2);
            for (let j = 0; j < layers; j++) {
                const cone = new THREE.Mesh(treeGeo, treeMat);
                cone.position.y = 3 + j * 2.5;
                cone.scale.setScalar(1 - j * 0.2);
                treeGroup.add(cone);
            }

            const h = this.getTerrainHeight(x, z);
            treeGroup.position.set(x, h, z);
            const sc = 0.5 + Math.random() * 0.8;
            treeGroup.scale.setScalar(sc);
            treeGroup.castShadow = true;

            this.scene.add(treeGroup);
        }

        // Flowers / grass patches
        const flowerColors = [0xff6b9d, 0xffd93d, 0x6bcb77, 0xc084fc, 0xffa07a];
        const flowerGeo = new THREE.SphereGeometry(0.15, 4, 4);

        for (let i = 0; i < 200; i++) {
            const x = (Math.random() - 0.5) * 350;
            const z = (Math.random() - 0.5) * 1100;

            let tooClose = false;
            for (const pp of pathSamples) {
                if (Math.sqrt((x - pp.x) ** 2 + (z - pp.z) ** 2) < 8) {
                    tooClose = true;
                    break;
                }
            }
            if (tooClose) continue;

            const color = flowerColors[Math.floor(Math.random() * flowerColors.length)];
            const mat = new THREE.MeshStandardMaterial({
                color, emissive: color, emissiveIntensity: 0.2, roughness: 0.8
            });
            const flower = new THREE.Mesh(flowerGeo, mat);
            const h = this.getTerrainHeight(x, z);
            flower.position.set(x, h + 0.2, z);
            this.scene.add(flower);
        }
    }

    getTerrainHeight(x, z) {
        let h = fbm(x * 0.007 + 50, z * 0.005 + 50, 5) * 30 - 8;
        h += Math.sin(x * 0.015) * Math.cos(z * 0.012) * 5;
        return h;
    }

    // ===================== SET LANDMARK ACTIVE STATE =====================
    setActiveSection(sectionId) {
        for (const portal of this.portalMeshes) {
            const isActive = portal.sectionId === sectionId;
            portal._isActive = isActive;
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

        // Animate clouds
        for (const cloud of this.clouds) {
            cloud.position.x += Math.sin(this.time * 0.08 + cloud.userData.wobble) * cloud.userData.speed;
            cloud.position.y += Math.sin(this.time * 0.12 + cloud.userData.wobble * 2) * 0.005;
        }

        // Animate landmarks — gentle rotation
        for (const lm of this.landmarkMeshes) {
            if (lm) lm.rotation.y += deltaTime * 0.3;
        }

        // Move camera light near camera
        if (cameraPos) {
            this.cameraLight.position.copy(cameraPos);
            this.cameraLight.position.y += 5;
        }

        // Move sky dome with camera (so it never ends)
        if (cameraPos) {
            this.skyMesh.position.x = cameraPos.x;
            this.skyMesh.position.z = cameraPos.z;
        }

        // Move sun direction with camera
        if (cameraPos) {
            this.sunLight.position.set(
                cameraPos.x + 80,
                120,
                cameraPos.z - 60
            );
            this.sunLight.target.position.copy(cameraPos);
            this.sunLight.target.updateMatrixWorld();
        }
    }
}

// Utility
function smoothstep(edge0, edge1, x) {
    const t = Math.max(0, Math.min(1, (x - edge0) / (edge1 - edge0)));
    return t * t * (3 - 2 * t);
}

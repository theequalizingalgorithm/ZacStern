// ============================================================
// ENVIRONMENT SHADERS — Sky, Road, Clouds
// Zac Stern Portfolio — Immersive 3D World
// ============================================================

/* ---- SKY GRADIENT ---- */
export const skyVertexShader = /* glsl */ `
varying vec3 vWorldPosition;
void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPosition = worldPos.xyz;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const skyFragmentShader = /* glsl */ `
uniform vec3 topColor;
uniform vec3 midColor;
uniform vec3 bottomColor;
uniform float offset;
uniform float exponent;
varying vec3 vWorldPosition;

void main() {
    float h = normalize(vWorldPosition + vec3(0.0, offset, 0.0)).y;
    vec3 color;
    if (h > 0.0) {
        color = mix(midColor, topColor, pow(clamp(h, 0.0, 1.0), exponent));
    } else {
        color = mix(midColor, bottomColor, pow(clamp(-h, 0.0, 1.0), 0.4));
    }
    gl_FragColor = vec4(color, 1.0);
}
`;

/* ---- IRIDESCENT BRICK ROAD ---- */
export const roadVertexShader = /* glsl */ `
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const roadFragmentShader = /* glsl */ `
uniform float time;
uniform vec3 baseColor;
varying vec2 vUv;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

// Thin-film iridescence approximation
vec3 iridescence(float cosAngle, float thickness) {
    float d = thickness * 2.0 * cosAngle;
    vec3 col;
    col.r = cos(d * 14.0) * 0.5 + 0.5;
    col.g = cos(d * 14.0 + 2.094) * 0.5 + 0.5;
    col.b = cos(d * 14.0 + 4.189) * 0.5 + 0.5;
    return col;
}

// Brick pattern
float brick(vec2 uv) {
    vec2 cell = vec2(10.0, 20.0);
    vec2 p = uv * cell;
    p.x += step(1.0, mod(floor(p.y), 2.0)) * 0.5;
    vec2 f = fract(p);
    float mortar = 0.07;
    float bx = smoothstep(0.0, mortar, f.x) * smoothstep(0.0, mortar, 1.0 - f.x);
    float by = smoothstep(0.0, mortar, f.y) * smoothstep(0.0, mortar, 1.0 - f.y);
    return bx * by;
}

void main() {
    float cosAngle = max(dot(vNormal, vViewDir), 0.0);
    float thickness = 0.45 + 0.08 * sin(time * 0.3 + vWorldPos.x * 0.05);

    vec3 iriColor = iridescence(cosAngle, thickness);
    float brickMask = brick(vUv);

    // Golden-ish brick base with iridescent overlay
    vec3 brickCol = baseColor * (0.8 + 0.2 * brickMask);
    vec3 color = mix(brickCol, iriColor * 0.55 + brickCol * 0.45, 0.55 * brickMask);

    // Fresnel edge glow
    float fresnel = pow(1.0 - cosAngle, 3.0);
    color += iriColor * fresnel * 0.35;

    // Darken mortar gaps
    color *= (0.35 + 0.65 * brickMask);

    // Subtle sparkle
    float sparkle = pow(max(0.0, sin(vWorldPos.x * 37.0 + vWorldPos.z * 23.0 + time * 2.0)), 40.0);
    color += vec3(1.0) * sparkle * 0.15 * brickMask;

    gl_FragColor = vec4(color, 1.0);
}
`;

/* ---- CLOUD VERTEX (for animated clouds) ---- */
export const cloudVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const cloudFragmentShader = /* glsl */ `
uniform float time;
uniform float opacity;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;

void main() {
    float cosAngle = max(dot(vNormal, vViewDir), 0.0);

    // Pearlescent iridescence
    float d = 0.5 * cosAngle + time * 0.05;
    vec3 pearl;
    pearl.r = cos(d * 8.0) * 0.12 + 0.88;
    pearl.g = cos(d * 8.0 + 1.5) * 0.10 + 0.90;
    pearl.b = cos(d * 8.0 + 3.0) * 0.12 + 0.92;

    // Soft edges
    float edgeFade = smoothstep(0.0, 0.4, cosAngle);

    // Slight translucency at edges
    float fresnel = pow(1.0 - cosAngle, 2.5);
    vec3 color = pearl + vec3(0.1, 0.15, 0.25) * fresnel;

    gl_FragColor = vec4(color, opacity * edgeFade);
}
`;

/* ---- PORTAL GLOW SHADER ---- */
export const portalVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    vUv = uv;
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const portalFragmentShader = /* glsl */ `
uniform float time;
uniform vec3 portalColor;
uniform float active;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec2 vUv;
varying vec3 vWorldPos;

void main() {
    float cosAngle = max(dot(vNormal, vViewDir), 0.0);
    float fresnel = pow(1.0 - cosAngle, 2.0);

    // Glass-like appearance
    vec3 glassColor = portalColor * 0.3 + vec3(0.7, 0.85, 1.0) * 0.7;

    // Iridescent highlight
    float d = cosAngle * 3.0 + time * 0.2;
    vec3 iriShift;
    iriShift.r = cos(d * 6.0) * 0.15 + 0.85;
    iriShift.g = cos(d * 6.0 + 2.0) * 0.12 + 0.88;
    iriShift.b = cos(d * 6.0 + 4.0) * 0.15 + 0.90;

    vec3 color = glassColor * iriShift;

    // Active glow
    float glow = active * (0.3 + 0.15 * sin(time * 2.0));
    color += portalColor * glow;

    // Edge glow
    color += portalColor * fresnel * 0.4 * (0.5 + 0.5 * active);

    float alpha = 0.25 + fresnel * 0.5 + active * 0.15;

    gl_FragColor = vec4(color, alpha);
}
`;

/* ---- IRIDESCENT BUBBLE ---- */
export const bubbleVertexShader = /* glsl */ `
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    vec4 worldPos = modelMatrix * vec4(position, 1.0);
    vWorldPos = worldPos.xyz;
    vNormal = normalize(normalMatrix * normal);
    vViewDir = normalize(cameraPosition - worldPos.xyz);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

export const bubbleFragmentShader = /* glsl */ `
uniform float time;
uniform float opacity;
varying vec3 vNormal;
varying vec3 vViewDir;
varying vec3 vWorldPos;

void main() {
    float cosAngle = max(dot(vNormal, vViewDir), 0.0);

    // Thin-film iridescence — rainbow sheen
    float d = cosAngle * 2.5 + time * 0.08 + vWorldPos.y * 0.02;
    vec3 iriColor;
    iriColor.r = cos(d * 10.0) * 0.25 + 0.75;
    iriColor.g = cos(d * 10.0 + 2.094) * 0.2 + 0.8;
    iriColor.b = cos(d * 10.0 + 4.189) * 0.25 + 0.85;

    // Fresnel — bright edges, transparent center
    float fresnel = pow(1.0 - cosAngle, 3.5);

    // Specular highlight
    float specular = pow(max(cosAngle, 0.0), 64.0) * 0.6;

    vec3 color = iriColor * (0.5 + 0.5 * fresnel) + vec3(1.0) * specular;
    float alpha = opacity * (0.08 + fresnel * 0.7);

    gl_FragColor = vec4(color, alpha);
}
`;

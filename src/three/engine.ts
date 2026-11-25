import * as THREE from 'three';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

export type LabEnvTheme = 'colorful' | 'emerald';

let cachedSoftwareGl: boolean | null = null;

export function detectSoftwareGl(): boolean {
  if (cachedSoftwareGl !== null) return cachedSoftwareGl;
  if (typeof document === 'undefined') return false;
  try {
    const gl = document.createElement('canvas').getContext('webgl2');
    if (!gl) {
      cachedSoftwareGl = true;
      return true;
    }
    const ext = gl.getExtension('WEBGL_debug_renderer_info');
    const param = ext ? ext.UNMASKED_RENDERER_WEBGL : gl.RENDERER;
    const gpu = String(gl.getParameter(param) || '');
    gl.getExtension('WEBGL_lose_context')?.loseContext();
    cachedSoftwareGl = /SwiftShader|llvmpipe|softpipe|Software|Basic Render/i.test(gpu);
    return cachedSoftwareGl;
  } catch {
    cachedSoftwareGl = true;
    return true;
  }
}

const backdropTextureCache = new Map<LabEnvTheme, THREE.CanvasTexture>();

export function getBioBackdropTexture(theme: LabEnvTheme): THREE.CanvasTexture {
  const existing = backdropTextureCache.get(theme);
  if (existing) return existing;

  const w = 1024;
  const h = 512;
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d')!;

  if (theme === 'emerald') {
    // Luminous deep emerald dark-field microscopy backdrop (makes blue Streptococcus chains gleam vividly)
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.45, 40, w * 0.5, h * 0.5, w * 0.65);
    bg.addColorStop(0, '#0D6B53');
    bg.addColorStop(0.5, '#064E3B');
    bg.addColorStop(1, '#03251D');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle bioluminescent emerald & seafoam optical light pools
    const blooms = [
      { x: w * 0.22, y: h * 0.25, r: 340, c0: 'rgba(52, 211, 153, 0.34)', c1: 'rgba(16, 185, 129, 0.12)', c2: 'rgba(16, 185, 129, 0)' },
      { x: w * 0.78, y: h * 0.32, r: 360, c0: 'rgba(45, 212, 191, 0.30)', c1: 'rgba(20, 184, 166, 0.10)', c2: 'rgba(20, 184, 166, 0)' },
      { x: w * 0.5, y: h * 0.72, r: 390, c0: 'rgba(110, 231, 183, 0.24)', c1: 'rgba(16, 185, 129, 0.08)', c2: 'rgba(16, 185, 129, 0)' },
    ];
    blooms.forEach((g) => {
      const rg = ctx.createRadialGradient(g.x, g.y, 12, g.x, g.y, g.r);
      rg.addColorStop(0, g.c0);
      rg.addColorStop(0.55, g.c1);
      rg.addColorStop(1, g.c2);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });

    // Soft glowing microscopic bokeh orbs
    for (let i = 0; i < 36; i++) {
      const cx = (i * 211 + 59) % w;
      const cy = (i * 149 + 37) % h;
      const rad = 14 + (i % 6) * 12;
      const rg = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad);
      rg.addColorStop(0, 'rgba(167, 243, 208, 0.22)');
      rg.addColorStop(0.7, 'rgba(52, 211, 153, 0.10)');
      rg.addColorStop(1, 'rgba(52, 211, 153, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  } else {
    // Rich dark-field fluorescence microscopy studio backdrop (deep indigo-navy with aurora light blooms)
    const bg = ctx.createRadialGradient(w * 0.5, h * 0.44, 30, w * 0.5, h * 0.5, w * 0.68);
    bg.addColorStop(0, '#1B355E');
    bg.addColorStop(0.48, '#102142');
    bg.addColorStop(1, '#070F22');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, w, h);

    // Subtle multi-spectral microscopy illumination blooms (cyan, aurora teal, soft orchid, warm gold)
    const blooms = [
      { x: w * 0.2, y: h * 0.24, r: 360, c0: 'rgba(56, 189, 248, 0.28)', c1: 'rgba(14, 165, 233, 0.10)', c2: 'rgba(14, 165, 233, 0)' },
      { x: w * 0.82, y: h * 0.26, r: 350, c0: 'rgba(168, 85, 247, 0.26)', c1: 'rgba(139, 92, 246, 0.09)', c2: 'rgba(139, 92, 246, 0)' },
      { x: w * 0.52, y: h * 0.72, r: 400, c0: 'rgba(45, 212, 191, 0.22)', c1: 'rgba(20, 184, 166, 0.07)', c2: 'rgba(20, 184, 166, 0)' },
      { x: w * 0.78, y: h * 0.78, r: 280, c0: 'rgba(244, 114, 182, 0.20)', c1: 'rgba(236, 72, 153, 0.06)', c2: 'rgba(236, 72, 153, 0)' },
    ];
    blooms.forEach((g) => {
      const rg = ctx.createRadialGradient(g.x, g.y, 12, g.x, g.y, g.r);
      rg.addColorStop(0, g.c0);
      rg.addColorStop(0.55, g.c1);
      rg.addColorStop(1, g.c2);
      ctx.fillStyle = rg;
      ctx.fillRect(0, 0, w, h);
    });

    // Subtle optical microscope reticle ring & depth bokeh
    ctx.strokeStyle = 'rgba(125, 211, 252, 0.07)';
    ctx.lineWidth = 1.5;
    ctx.beginPath();
    ctx.arc(w * 0.5, h * 0.5, h * 0.38, 0, Math.PI * 2);
    ctx.stroke();

    const bokehPalette = [
      ['rgba(186, 230, 253, 0.22)', 'rgba(56, 189, 248, 0.09)'],
      ['rgba(221, 214, 254, 0.20)', 'rgba(168, 85, 247, 0.08)'],
      ['rgba(167, 243, 208, 0.20)', 'rgba(45, 212, 191, 0.08)'],
      ['rgba(254, 240, 138, 0.16)', 'rgba(251, 191, 36, 0.06)'],
    ];
    for (let i = 0; i < 40; i++) {
      const cx = (i * 211 + 59) % w;
      const cy = (i * 149 + 37) % h;
      const rad = 10 + (i % 6) * 11;
      const pair = bokehPalette[i % bokehPalette.length];
      const rg = ctx.createRadialGradient(cx, cy, rad * 0.15, cx, cy, rad);
      rg.addColorStop(0, pair[0]);
      rg.addColorStop(0.7, pair[1]);
      rg.addColorStop(1, 'rgba(0, 0, 0, 0)');
      ctx.fillStyle = rg;
      ctx.beginPath();
      ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  backdropTextureCache.set(theme, tex);
  return tex;
}

export function getThemeFogColor(theme: LabEnvTheme): number {
  return theme === 'emerald' ? 0x053b2d : 0x0d1b38;
}

export interface LabRendererBundle {
  renderer: THREE.WebGLRenderer;
  scene: THREE.Scene;
  isSoftwareGl: boolean;
  envTexture: THREE.Texture;
  maxAnisotropy: number;
}

export function createLabRendererAndScene(
  container: HTMLElement,
  themeOrColor: LabEnvTheme | number = 'colorful',
  fogDensity = 0.026,
  alpha = true,
): LabRendererBundle {
  const isSoftwareGl = detectSoftwareGl();
  const width = Math.max(container.clientWidth, 1);
  const height = Math.max(container.clientHeight, 1);

  const renderer = new THREE.WebGLRenderer({
    antialias: !isSoftwareGl,
    powerPreference: 'high-performance',
    alpha,
  });
  renderer.setSize(width, height, false);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.12;
  renderer.setPixelRatio(isSoftwareGl ? 1 : Math.min(window.devicePixelRatio, 2));
  renderer.shadowMap.enabled = !isSoftwareGl;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;
  if (alpha) {
    renderer.setClearColor(0x000000, 0);
  }
  renderer.domElement.style.display = 'block';
  renderer.domElement.style.position = 'relative';
  renderer.domElement.style.zIndex = '1';
  renderer.domElement.style.width = '100%';
  renderer.domElement.style.height = '100%';
  renderer.domElement.style.outline = 'none';

  const scene = new THREE.Scene();
  if (alpha) {
    // Let the animated CSS biological gradient backdrop flow seamlessly behind the 3D scene
    scene.background = null;
    scene.fog = null;
  } else if (typeof themeOrColor === 'string') {
    scene.background = getBioBackdropTexture(themeOrColor);
    scene.fog = new THREE.FogExp2(getThemeFogColor(themeOrColor), fogDensity);
  } else {
    scene.background = new THREE.Color(themeOrColor);
    scene.fog = new THREE.FogExp2(themeOrColor, fogDensity);
  }

  // Studio environment reflections
  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  const envTarget = pmremGenerator.fromScene(roomEnv, 0.04);
  scene.environment = envTarget.texture;
  scene.environmentIntensity = 0.78;
  roomEnv.dispose();
  pmremGenerator.dispose();

  // Balanced 3-point luminous bio-microscopy lighting rig (<= 3 shadow casters)
  const hemi = new THREE.HemisphereLight(0xf0f9ff, 0x1e293b, 1.35);
  scene.add(hemi);

  const keyLight = new THREE.DirectionalLight(0xfffbf2, 1.95);
  keyLight.position.set(5.5, 7.5, 6.4);
  if (!isSoftwareGl) {
    keyLight.castShadow = true;
    keyLight.shadow.mapSize.set(1024, 1024);
    keyLight.shadow.camera.near = 1;
    keyLight.shadow.camera.far = 25;
    keyLight.shadow.camera.left = -6;
    keyLight.shadow.camera.right = 6;
    keyLight.shadow.camera.top = 6;
    keyLight.shadow.camera.bottom = -6;
    keyLight.shadow.bias = -0.0005;
    keyLight.shadow.normalBias = 0.02;
  }
  scene.add(keyLight);

  const rimLight = new THREE.DirectionalLight(0x67e8f9, 1.1);
  rimLight.position.set(-5.5, 2.5, -5.0);
  scene.add(rimLight);

  const fillLight = new THREE.DirectionalLight(0xfde68a, 0.6);
  fillLight.position.set(-3.5, -4.0, 4.0);
  scene.add(fillLight);

  return {
    renderer,
    scene,
    isSoftwareGl,
    envTexture: envTarget.texture,
    maxAnisotropy: renderer.capabilities.getMaxAnisotropy(),
  };
}

export function createContactShadowDisc(radius = 2.4, opacity = 0.26): THREE.Mesh {
  const size = 256;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createRadialGradient(size / 2, size / 2, size * 0.05, size / 2, size / 2, size * 0.5);
  grad.addColorStop(0, 'rgba(6, 20, 34, 0.7)');
  grad.addColorStop(0.55, 'rgba(6, 20, 34, 0.24)');
  grad.addColorStop(1, 'rgba(6, 20, 34, 0)');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  const tex = new THREE.CanvasTexture(canvas);
  tex.colorSpace = THREE.SRGBColorSpace;
  const geo = new THREE.PlaneGeometry(radius * 2, radius * 2);
  const mat = new THREE.MeshBasicMaterial({
    map: tex,
    transparent: true,
    opacity,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.rotation.x = -Math.PI / 2;
  mesh.position.y = -1.65;
  mesh.renderOrder = -1;
  return mesh;
}

export interface OrganicTexturePair {
  map: THREE.CanvasTexture;
  bumpMap: THREE.CanvasTexture;
}

const textureCache = new Map<string, OrganicTexturePair>();

export function getOrganicTextures(
  baseHex: string,
  highlightHex: string,
  maxAnisotropy = 4,
): OrganicTexturePair {
  const key = `${baseHex}_${highlightHex}`;
  const existing = textureCache.get(key);
  if (existing) return existing;

  const size = 256;
  const colorCanvas = document.createElement('canvas');
  colorCanvas.width = size;
  colorCanvas.height = size;
  const cCtx = colorCanvas.getContext('2d')!;

  const bumpCanvas = document.createElement('canvas');
  bumpCanvas.width = size;
  bumpCanvas.height = size;
  const bCtx = bumpCanvas.getContext('2d')!;

  cCtx.fillStyle = baseHex;
  cCtx.fillRect(0, 0, size, size);

  bCtx.fillStyle = '#808080';
  bCtx.fillRect(0, 0, size, size);

  let seed = 0;
  for (let i = 0; i < key.length; i++) seed = (seed * 31 + key.charCodeAt(i)) % 99991;
  const rand = () => {
    seed = (seed * 16807) % 2147483647;
    return (seed - 1) / 2147483646;
  };

  for (let i = 0; i < 160; i++) {
    const x = rand() * size;
    const y = rand() * size;
    const r = 6 + rand() * 22;

    const cg = cCtx.createRadialGradient(x, y, 0, x, y, r);
    cg.addColorStop(0, i % 2 === 0 ? `${highlightHex}42` : 'rgba(15, 23, 42, 0.12)');
    cg.addColorStop(1, 'rgba(0,0,0,0)');
    cCtx.fillStyle = cg;
    cCtx.beginPath();
    cCtx.arc(x, y, r, 0, Math.PI * 2);
    cCtx.fill();

    const bg = bCtx.createRadialGradient(x, y, 0, x, y, r * 0.85);
    bg.addColorStop(0, i % 2 === 0 ? 'rgba(235,235,235,0.45)' : 'rgba(55,55,55,0.45)');
    bg.addColorStop(1, 'rgba(128,128,128,0)');
    bCtx.fillStyle = bg;
    bCtx.beginPath();
    bCtx.arc(x, y, r * 0.85, 0, Math.PI * 2);
    bCtx.fill();
  }

  const map = new THREE.CanvasTexture(colorCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.anisotropy = Math.min(maxAnisotropy, 8);

  const bumpMap = new THREE.CanvasTexture(bumpCanvas);
  bumpMap.colorSpace = THREE.NoColorSpace;
  bumpMap.wrapS = THREE.RepeatWrapping;
  bumpMap.wrapT = THREE.RepeatWrapping;
  bumpMap.anisotropy = Math.min(maxAnisotropy, 8);

  const pair = { map, bumpMap };
  textureCache.set(key, pair);
  return pair;
}

export interface MicrographTextureSet {
  map: THREE.CanvasTexture;
  normalMap: THREE.CanvasTexture;
  roughnessMap: THREE.CanvasTexture;
}

const micrographCache = new Map<string, MicrographTextureSet>();

/**
 * High-resolution 512x512 seamless procedural SEM micrograph PBR texture set
 * (albedo + cavity AO, Sobel normal map, and ridge-to-crevice roughness map)
 * modeled after purple violet rod-shaped Bacillus electron microscopy.
 */
export function getMicrographRodTextures(
  baseHex = '#7E22CE',
  maxAnisotropy = 4,
): MicrographTextureSet {
  const key = `sem_rod_${baseHex}`;
  const existing = micrographCache.get(key);
  if (existing) return existing;

  const size = 512;
  const heightField = new Float32Array(size * size);

  // Tileable periodic hash-noise + cellular peptidoglycan ridges
  const TWO_PI = Math.PI * 2;
  const hash = (ix: number, iy: number, period: number, salt: number) => {
    const x = ((ix % period) + period) % period;
    const y = ((iy % period) + period) % period;
    const n = Math.sin(x * 127.1 + y * 311.7 + salt * 74.7) * 43758.5453123;
    return n - Math.floor(n);
  };

  const smoothNoise = (u: number, v: number, period: number, salt: number) => {
    const fx = u * period;
    const fy = v * period;
    const ix = Math.floor(fx);
    const iy = Math.floor(fy);
    const tx = fx - ix;
    const ty = fy - iy;
    const sx = tx * tx * (3 - 2 * tx);
    const sy = ty * ty * (3 - 2 * ty);

    const n00 = hash(ix, iy, period, salt);
    const n10 = hash(ix + 1, iy, period, salt);
    const n01 = hash(ix, iy + 1, period, salt);
    const n11 = hash(ix + 1, iy + 1, period, salt);
    const nx0 = n00 + (n10 - n00) * sx;
    const nx1 = n01 + (n11 - n01) * sx;
    return nx0 + (nx1 - nx0) * sy;
  };

  // Multi-octave organic crinkled membrane + wrinkled ridges (domain-warped FBM + ridged noise)
  for (let y = 0; y < size; y++) {
    const v = y / size;
    for (let x = 0; x < size; x++) {
      const u = x / size;
      // Gentle domain warp for natural biological folds (like real bacterial wall ridges)
      const warpX = (smoothNoise(u, v, 8, 1) - 0.5) * 0.14;
      const warpY = (smoothNoise(u, v, 8, 2) - 0.5) * 0.14;
      const wu = u + warpX;
      const wv = v + warpY;

      const f1 = smoothNoise(wu, wv, 10, 3);
      const f2 = smoothNoise(wu, wv, 22, 4);
      const f3 = smoothNoise(wu, wv, 44, 5);
      const f4 = smoothNoise(u, v, 80, 6);

      // Ridged cellular folds (bright sharp wrinkles + deep organic valleys)
      const ridge1 = 1 - Math.abs(f1 * 2 - 1);
      const ridge2 = 1 - Math.abs(f2 * 2 - 1);
      // Subtle transverse peptidoglycan banding along rod axis
      const band = 0.5 + 0.5 * Math.sin(v * TWO_PI * 14 + f1 * 3.4);

      const h =
        ridge1 * ridge1 * 0.38 +
        ridge2 * ridge2 * 0.30 +
        f3 * 0.18 +
        f4 * 0.08 +
        band * 0.06;
      heightField[y * size + x] = Math.max(0, Math.min(1, h));
    }
  }

  const baseColor = new THREE.Color(baseHex);
  const deepCrevice = baseColor.clone().multiplyScalar(0.32).offsetHSL(-0.02, 0.12, -0.06);
  const midBody = baseColor.clone().offsetHSL(0, 0.08, 0.02);
  const brightRidge = new THREE.Color('#E9D5FF').lerp(baseColor, 0.28);
  const crestFrost = new THREE.Color('#F8FAFC');

  const albedoCanvas = document.createElement('canvas');
  albedoCanvas.width = size;
  albedoCanvas.height = size;
  const aCtx = albedoCanvas.getContext('2d')!;
  const aImg = aCtx.createImageData(size, size);

  const normalCanvas = document.createElement('canvas');
  normalCanvas.width = size;
  normalCanvas.height = size;
  const nCtx = normalCanvas.getContext('2d')!;
  const nImg = nCtx.createImageData(size, size);

  const roughCanvas = document.createElement('canvas');
  roughCanvas.width = size;
  roughCanvas.height = size;
  const rCtx = roughCanvas.getContext('2d')!;
  const rImg = rCtx.createImageData(size, size);

  const tmpColor = new THREE.Color();
  const sampleH = (px: number, py: number) =>
    heightField[((py + size) % size) * size + ((px + size) % size)];

  const normalStrength = 5.4;

  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      const idx = y * size + x;
      const pIdx = idx * 4;
      const h = heightField[idx];

      // Albedo with realistic cavity AO in deep crevices & frosted lavender crests
      if (h < 0.42) {
        tmpColor.copy(deepCrevice).lerp(midBody, h / 0.42);
      } else if (h < 0.78) {
        tmpColor.copy(midBody).lerp(brightRidge, (h - 0.42) / 0.36);
      } else {
        tmpColor.copy(brightRidge).lerp(crestFrost, (h - 0.78) / 0.22 * 0.72);
      }

      aImg.data[pIdx] = Math.round(tmpColor.r * 255);
      aImg.data[pIdx + 1] = Math.round(tmpColor.g * 255);
      aImg.data[pIdx + 2] = Math.round(tmpColor.b * 255);
      aImg.data[pIdx + 3] = 255;

      // Sobel tangent-space normal map from heightfield
      const tl = sampleH(x - 1, y - 1);
      const t = sampleH(x, y - 1);
      const tr = sampleH(x + 1, y - 1);
      const l = sampleH(x - 1, y);
      const r = sampleH(x + 1, y);
      const bl = sampleH(x - 1, y + 1);
      const b = sampleH(x, y + 1);
      const br = sampleH(x + 1, y + 1);

      const dX = (tr + 2 * r + br - (tl + 2 * l + bl)) * normalStrength;
      const dY = (bl + 2 * b + br - (tl + 2 * t + tr)) * normalStrength;
      const nx = -dX;
      const ny = -dY;
      const nz = 1.0;
      const invLen = 1 / Math.sqrt(nx * nx + ny * ny + nz * nz);

      nImg.data[pIdx] = Math.round((nx * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 1] = Math.round((ny * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 2] = Math.round((nz * invLen * 0.5 + 0.5) * 255);
      nImg.data[pIdx + 3] = 255;

      // Roughness map: deep crevices rougher (0.86), raised ridges moister (0.28)
      const roughVal = Math.round((0.86 - h * 0.58) * 255);
      rImg.data[pIdx] = roughVal;
      rImg.data[pIdx + 1] = roughVal;
      rImg.data[pIdx + 2] = roughVal;
      rImg.data[pIdx + 3] = 255;
    }
  }

  aCtx.putImageData(aImg, 0, 0);
  nCtx.putImageData(nImg, 0, 0);
  rCtx.putImageData(rImg, 0, 0);

  const map = new THREE.CanvasTexture(albedoCanvas);
  map.colorSpace = THREE.SRGBColorSpace;
  map.wrapS = THREE.RepeatWrapping;
  map.wrapT = THREE.RepeatWrapping;
  map.repeat.set(2, 3);
  map.anisotropy = Math.min(maxAnisotropy, 8);

  const normalMap = new THREE.CanvasTexture(normalCanvas);
  normalMap.colorSpace = THREE.NoColorSpace;
  normalMap.wrapS = THREE.RepeatWrapping;
  normalMap.wrapT = THREE.RepeatWrapping;
  normalMap.repeat.set(2, 3);
  normalMap.anisotropy = Math.min(maxAnisotropy, 8);

  const roughnessMap = new THREE.CanvasTexture(roughCanvas);
  roughnessMap.colorSpace = THREE.NoColorSpace;
  roughnessMap.wrapS = THREE.RepeatWrapping;
  roughnessMap.wrapT = THREE.RepeatWrapping;
  roughnessMap.repeat.set(2, 3);
  roughnessMap.anisotropy = Math.min(maxAnisotropy, 8);

  const set: MicrographTextureSet = { map, normalMap, roughnessMap };
  micrographCache.set(key, set);
  return set;
}

export interface AmbientMicroField {
  group: THREE.Group;
  update: (elapsed: number) => void;
  setTheme: (theme: LabEnvTheme) => void;
}

export function createMicroscopicAmbientField(
  particleCount = 60,
  spread = 14,
  initialTheme: LabEnvTheme = 'colorful',
): AmbientMicroField {
  const group = new THREE.Group();

  const sphereGeo = new THREE.SphereGeometry(0.1, 12, 10);
  const sphereMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.18,
    metalness: 0.02,
    clearcoat: 0.65,
    transparent: true,
    opacity: 0.45,
  });

  const particles = new THREE.InstancedMesh(sphereGeo, sphereMat, particleCount);
  particles.frustumCulled = false;

  const basePositions: THREE.Vector3[] = [];
  const scales: number[] = [];
  const phases: number[] = [];
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();

  for (let i = 0; i < particleCount; i++) {
    const angle = (i / particleCount) * Math.PI * 2 * 3.7;
    const radius = 3.8 + ((i * 1.618) % 1) * (spread * 0.55);
    const y = (((i * 2.718) % 1) - 0.5) * spread * 0.58;
    const pos = new THREE.Vector3(Math.cos(angle) * radius, y, Math.sin(angle) * radius - 1.8);
    basePositions.push(pos);
    const s = 0.5 + ((i * 0.37) % 1) * 1.45;
    scales.push(s);
    phases.push(i * 0.73);

    dummy.position.copy(pos);
    dummy.scale.setScalar(s);
    dummy.updateMatrix();
    particles.setMatrixAt(i, dummy.matrix);
  }
  particles.instanceMatrix.needsUpdate = true;
  particles.computeBoundingSphere();
  group.add(particles);

  // Translucent floating biological micro-rings harmonizing with watercolor wash
  const discGeo = new THREE.TorusGeometry(0.26, 0.11, 12, 22);
  const discMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    roughness: 0.25,
    metalness: 0.02,
    clearcoat: 0.5,
    transparent: true,
    opacity: 0.3,
  });
  const bgDiscs = new THREE.InstancedMesh(discGeo, discMat, 16);
  bgDiscs.frustumCulled = false;
  const discOrigins: THREE.Vector3[] = [];
  const discRots: THREE.Euler[] = [];

  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const r = 6.2 + (i % 3) * 1.9;
    const pos = new THREE.Vector3(Math.cos(a) * r, ((i % 5) - 2) * 1.35, Math.sin(a) * r - 2.6);
    discOrigins.push(pos);
    const rot = new THREE.Euler(i * 0.7, i * 1.1, i * 0.5);
    discRots.push(rot);
    dummy.position.copy(pos);
    dummy.rotation.copy(rot);
    dummy.scale.setScalar(0.8 + (i % 3) * 0.3);
    dummy.updateMatrix();
    bgDiscs.setMatrixAt(i, dummy.matrix);
  }
  bgDiscs.instanceMatrix.needsUpdate = true;
  bgDiscs.computeBoundingSphere();
  group.add(bgDiscs);

  const setTheme = (theme: LabEnvTheme) => {
    const pPalette =
      theme === 'emerald'
        ? [0x6ee7b7, 0x34d399, 0xa7f3d0, 0x86efac, 0x5eead4]
        : [0x38bdf8, 0xf472b6, 0x34d399, 0xfbbf24, 0xc084fc, 0xfb7185];
    for (let i = 0; i < particleCount; i++) {
      color.setHex(pPalette[i % pPalette.length]);
      particles.setColorAt(i, color);
    }
    if (particles.instanceColor) particles.instanceColor.needsUpdate = true;

    const dPalette =
      theme === 'emerald'
        ? [0x10b981, 0x34d399, 0x059669, 0x6ee7b7]
        : [0x38bdf8, 0xf472b6, 0x34d399, 0xfbbf24, 0xa855f7];
    for (let i = 0; i < 16; i++) {
      color.setHex(dPalette[i % dPalette.length]);
      bgDiscs.setColorAt(i, color);
    }
    if (bgDiscs.instanceColor) bgDiscs.instanceColor.needsUpdate = true;
  };

  setTheme(initialTheme);

  const update = (elapsed: number) => {
    for (let i = 0; i < particleCount; i++) {
      const p = basePositions[i];
      const ph = phases[i];
      dummy.position.set(
        p.x + Math.sin(elapsed * 0.35 + ph) * 0.3,
        p.y + Math.cos(elapsed * 0.28 + ph * 1.2) * 0.26,
        p.z + Math.sin(elapsed * 0.22 + ph * 0.7) * 0.22,
      );
      dummy.rotation.set(0, 0, 0);
      dummy.scale.setScalar(scales[i]);
      dummy.updateMatrix();
      particles.setMatrixAt(i, dummy.matrix);
    }
    particles.instanceMatrix.needsUpdate = true;

    for (let i = 0; i < 16; i++) {
      const p = discOrigins[i];
      const r = discRots[i];
      dummy.position.set(
        p.x + Math.cos(elapsed * 0.24 + i) * 0.38,
        p.y + Math.sin(elapsed * 0.28 + i * 1.3) * 0.32,
        p.z,
      );
      dummy.rotation.set(r.x + elapsed * 0.16, r.y + elapsed * 0.2, r.z);
      dummy.scale.setScalar(0.8 + (i % 3) * 0.3);
      dummy.updateMatrix();
      bgDiscs.setMatrixAt(i, dummy.matrix);
    }
    bgDiscs.instanceMatrix.needsUpdate = true;
  };

  return { group, update, setTheme };
}

export function applyBioThemeToScene(
  scene: THREE.Scene,
  ambientField: AmbientMicroField | null,
  theme: LabEnvTheme,
  fogDensity = 0.026,
): void {
  if (scene.background !== null) {
    scene.background = getBioBackdropTexture(theme);
    scene.fog = new THREE.FogExp2(getThemeFogColor(theme), fogDensity);
  }
  ambientField?.setTheme(theme);
}

export interface LoopController {
  stop: () => void;
}

export function startPacedLoop(
  renderer: THREE.WebGLRenderer,
  isSoftwareGl: boolean,
  onFrame: (delta: number, elapsed: number) => void,
): LoopController {
  let stopped = false;
  let rafId = 0;
  let timeoutId = 0;
  let lastTime = performance.now();
  const startTime = lastTime;

  const afterDraw = (cb: () => void) => {
    const gl = renderer.getContext() as WebGL2RenderingContext;
    if (!gl || typeof gl.fenceSync !== 'function') {
      timeoutId = window.setTimeout(cb, 85);
      return;
    }
    const sync = gl.fenceSync(gl.SYNC_GPU_COMMANDS_COMPLETE, 0);
    gl.flush();
    const poll = () => {
      if (stopped) {
        if (sync) gl.deleteSync(sync);
        return;
      }
      const state = sync && gl.getSyncParameter(sync, gl.SYNC_STATUS);
      if (state === gl.UNSIGNALED) {
        timeoutId = window.setTimeout(poll, 5);
      } else {
        if (sync) gl.deleteSync(sync);
        timeoutId = window.setTimeout(cb, 80);
      }
    };
    timeoutId = window.setTimeout(poll, 5);
  };

  const tick = () => {
    if (stopped) return;
    const now = performance.now();
    const delta = Math.min((now - lastTime) / 1000, 0.1);
    const elapsed = (now - startTime) / 1000;
    lastTime = now;

    onFrame(delta, elapsed);

    if (stopped) return;
    if (isSoftwareGl) {
      afterDraw(tick);
    } else {
      rafId = requestAnimationFrame(tick);
    }
  };

  rafId = requestAnimationFrame(tick);

  return {
    stop: () => {
      stopped = true;
      cancelAnimationFrame(rafId);
      clearTimeout(timeoutId);
    },
  };
}

export function attachSafeResizeObserver(
  container: HTMLElement,
  camera: THREE.PerspectiveCamera,
  renderer: THREE.WebGLRenderer,
): () => void {
  let rafId = 0;
  let lastW = Math.max(container.clientWidth, 1);
  let lastH = Math.max(container.clientHeight, 1);

  const applyResize = () => {
    rafId = 0;
    const w = Math.max(container.clientWidth, 1);
    const h = Math.max(container.clientHeight, 1);
    if (w === lastW && h === lastH) return;
    lastW = w;
    lastH = h;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
  };

  const ro = new ResizeObserver(() => {
    if (rafId) cancelAnimationFrame(rafId);
    rafId = requestAnimationFrame(applyResize);
  });
  ro.observe(container);

  return () => {
    if (rafId) cancelAnimationFrame(rafId);
    ro.disconnect();
  };
}

export function disposeObject3D(root: THREE.Object3D): void {
  root.traverse((obj) => {
    const mesh = obj as THREE.Mesh;
    if (mesh.geometry) {
      mesh.geometry.dispose();
    }
    if (mesh.material) {
      const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
      mats.forEach((m) => m.dispose());
    }
  });
}

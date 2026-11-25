import * as THREE from 'three';
import { AnatomyPartId, CoccusVariant, RodVariant, ShapeId } from '../data/bacteriaData';
import { getMicrographRodTextures, getOrganicTextures } from './engine';

export interface AnimatedModelHandle {
  group: THREE.Group;
  update: (delta: number, elapsed: number) => void;
  triggerLinkAnimation?: () => void;
}

// Reusable temp objects outside animation loops
const _vecA = new THREE.Vector3();
const _vecB = new THREE.Vector3();
const _quat = new THREE.Quaternion();
const _up = new THREE.Vector3(0, 1, 0);

/**
 * Helper to create a wavy animated flagellum tube mesh with stored base curve points
 */
interface FlagellumRig {
  mesh: THREE.Mesh;
  basePoints: THREE.Vector3[];
  radius: number;
  phase: number;
  amp: number;
  freq: number;
  length: number;
  origin: THREE.Vector3;
  dir: THREE.Vector3;
}

function createWavyFlagellum(
  origin: THREE.Vector3,
  dir: THREE.Vector3,
  length: number,
  radius: number,
  color: number,
  phase: number,
  amp = 0.22,
  freq = 3.2,
): FlagellumRig {
  const segments = 28;
  const pts: THREE.Vector3[] = [];
  const normDir = dir.clone().normalize();
  const perp1 = new THREE.Vector3(0, 1, 0);
  if (Math.abs(normDir.dot(perp1)) > 0.9) perp1.set(0, 0, 1);
  perp1.cross(normDir).normalize();
  const perp2 = new THREE.Vector3().crossVectors(normDir, perp1).normalize();

  for (let i = 0; i <= segments; i++) {
    const t = i / segments;
    const p = origin.clone().addScaledVector(normDir, t * length);
    const env = Math.sin(t * Math.PI * 0.85) * t;
    p.addScaledVector(perp1, Math.sin(t * Math.PI * freq + phase) * amp * env);
    p.addScaledVector(perp2, Math.cos(t * Math.PI * freq + phase) * amp * 0.55 * env);
    pts.push(p);
  }
  const curve = new THREE.CatmullRomCurve3(pts);
  const geo = new THREE.TubeGeometry(curve, 36, radius, 8, false);
  const mat = new THREE.MeshPhysicalMaterial({
    color,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.35,
  });
  const mesh = new THREE.Mesh(geo, mat);
  mesh.castShadow = true;
  return {
    mesh,
    basePoints: pts,
    radius,
    phase,
    amp,
    freq,
    length,
    origin: origin.clone(),
    dir: normDir,
  };
}

interface LinkableCoccusUnit {
  mesh: THREE.Object3D;
  targetPos: THREE.Vector3;
  spreadPos: THREE.Vector3;
}

interface CoccusSubCluster {
  root: THREE.Group;
  units: LinkableCoccusUnit[];
}

function buildStaphyloCluster(
  colorOverride: string | undefined,
  maxAnisotropy: number,
  cellCount = 14,
): CoccusSubCluster {
  const root = new THREE.Group();
  const baseHex = colorOverride || '#EA580C';
  const tex = getOrganicTextures(baseHex, '#FDE047', maxAnisotropy);

  // Ordered from 2 touching cells out into a dense organic 3D grape cluster (chùm nho), no center round sphere
  const allOffsets: [number, number, number, number][] = [
    [-0.36, 0.0, 0.0, 0.5],
    [0.42, 0.14, 0.1, 0.49],
    [0.02, 0.72, -0.08, 0.48],
    [0.08, -0.66, 0.24, 0.48],
    [-0.78, 0.44, 0.28, 0.46],
    [0.72, -0.46, -0.22, 0.46],
    [-0.68, -0.38, -0.34, 0.45],
    [0.14, 0.16, 0.76, 0.45],
    [-0.14, -0.1, -0.76, 0.45],
    [1.04, 0.02, 0.44, 0.42],
    [-1.08, 0.14, -0.1, 0.41],
    [0.48, 0.88, 0.48, 0.4],
    [-0.5, 0.9, -0.34, 0.4],
    [0.42, -0.88, 0.48, 0.41],
    [-0.58, -0.86, -0.2, 0.4],
    [0.9, 0.56, -0.48, 0.41],
    [-0.82, 0.48, 0.68, 0.39],
    [0.04, 1.18, 0.12, 0.38],
  ];

  const clampedCount = Math.max(2, Math.min(allOffsets.length, Math.round(cellCount)));
  const offsets = allOffsets.slice(0, clampedCount);

  // Compute centroid so small clusters (2..6 cells) remain perfectly centered on stage
  const centroid = new THREE.Vector3();
  offsets.forEach(([x, y, z]) => centroid.add(new THREE.Vector3(x, y, z)));
  centroid.divideScalar(offsets.length);

  const baseGeo = new THREE.SphereGeometry(1, 26, 22);
  const posAttr = baseGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const bump = 1 + 0.042 * Math.sin(vx * 7 + vy * 5) * Math.cos(vz * 6);
    posAttr.setXYZ(i, vx * bump, vy * bump, vz * bump);
  }
  baseGeo.computeVertexNormals();

  const warmPalette = [0xf59e0b, 0xea580c, 0xf97316, 0xd97706, 0xef4444];
  const units: LinkableCoccusUnit[] = [];

  offsets.forEach(([x, y, z, r], idx) => {
    const mat = new THREE.MeshPhysicalMaterial({
      color: colorOverride
        ? new THREE.Color(colorOverride).offsetHSL((idx % 4) * 0.015 - 0.02, 0, (idx % 3) * 0.04 - 0.04)
        : warmPalette[idx % warmPalette.length],
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.052,
      roughness: 0.38 + (idx % 3) * 0.08,
      metalness: 0.03,
      clearcoat: 0.3,
    });
    const m = new THREE.Mesh(baseGeo, mat);
    const targetPos = new THREE.Vector3(x - centroid.x, y - centroid.y, z - centroid.z);
    const spreadDir = targetPos.lengthSq() > 0.01 ? targetPos.clone().normalize() : new THREE.Vector3(idx % 2 === 0 ? -1 : 1, 0.2, 0).normalize();
    const spreadPos = targetPos.clone().addScaledVector(spreadDir, 0.95);
    m.position.copy(targetPos);
    m.scale.setScalar(clampedCount <= 4 ? r * 1.18 : r);
    m.rotation.set(idx * 0.6, idx * 1.1, idx * 0.4);
    m.castShadow = true;
    m.receiveShadow = true;
    root.add(m);
    units.push({ mesh: m, targetPos, spreadPos });
  });

  return { root, units };
}

function buildStreptoChain(
  colorOverride: string | undefined,
  maxAnisotropy: number,
  cellCount = 12,
  spanX?: number,
  curveAmpY = 0.82,
  curveAmpZ = 0.5,
  phaseOffset = 0,
): CoccusSubCluster {
  const root = new THREE.Group();
  const baseHex = colorOverride || '#1D4ED8';
  const tex = getOrganicTextures(baseHex, '#93C5FD', maxAnisotropy);

  const clampedCount = Math.max(2, Math.min(18, Math.round(cellCount)));
  const cellRadius = clampedCount <= 4 ? 0.46 : 0.37;
  // Keep adjacent spheres gently kissing end-to-end regardless of whether count is 2 or 14!
  const stepDist = cellRadius * 1.72;
  const computedSpanX = spanX ?? ((clampedCount - 1) * stepDist) / 2;
  const effectiveAmpY = clampedCount <= 3 ? 0.14 : Math.min(curveAmpY, (clampedCount - 2) * 0.12);
  const effectiveAmpZ = clampedCount <= 3 ? 0.08 : Math.min(curveAmpZ, (clampedCount - 2) * 0.08);

  const bluePalette = [0x1d4ed8, 0x2563eb, 0x0284c7, 0x3b82f6, 0x0ea5e9];
  const sphereGeo = new THREE.SphereGeometry(cellRadius, 28, 22);
  const sheathGeo = new THREE.SphereGeometry(cellRadius * 1.12, 20, 16);
  const sheathMat = new THREE.MeshPhysicalMaterial({
    color: 0x93c5fd,
    roughness: 0.16,
    metalness: 0.02,
    clearcoat: 0.5,
    transparent: true,
    opacity: 0.22,
    depthWrite: false,
  });

  const samplePts: THREE.Vector3[] = [];
  for (let i = 0; i <= 24; i++) {
    const t = (i / 24) * 2 - 1;
    const x = t * computedSpanX;
    const y = Math.sin(t * Math.PI * 1.2 + phaseOffset) * effectiveAmpY;
    const z = Math.cos(t * Math.PI * 1.0 + phaseOffset * 0.7) * effectiveAmpZ;
    samplePts.push(new THREE.Vector3(x, y, z));
  }
  const chainCurve = new THREE.CatmullRomCurve3(samplePts);
  const evenPts = chainCurve.getSpacedPoints(clampedCount - 1);

  const units: LinkableCoccusUnit[] = [];

  evenPts.forEach((targetPos, i) => {
    const cellMat = new THREE.MeshPhysicalMaterial({
      color: colorOverride ? new THREE.Color(colorOverride) : bluePalette[i % bluePalette.length],
      map: tex.map,
      bumpMap: tex.bumpMap,
      bumpScale: 0.03,
      roughness: 0.24,
      metalness: 0.05,
      clearcoat: 0.65,
      clearcoatRoughness: 0.16,
    });

    const cellWrap = new THREE.Group();
    const cell = new THREE.Mesh(sphereGeo, cellMat);
    cell.scale.set(1.04, 0.97, 0.98);
    cell.castShadow = true;
    cell.receiveShadow = true;

    const sheath = new THREE.Mesh(sheathGeo, sheathMat);
    cellWrap.add(cell, sheath);
    cellWrap.position.copy(targetPos);

    const u = i / Math.max(1, clampedCount - 1);
    const tangent = chainCurve.getTangentAt(u).normalize();
    cellWrap.quaternion.setFromUnitVectors(new THREE.Vector3(1, 0, 0), tangent);

    root.add(cellWrap);

    const spreadPos = new THREE.Vector3(
      targetPos.x * 1.42 + (clampedCount === 2 ? (i === 0 ? -0.35 : 0.35) : 0),
      targetPos.y + (i % 2 === 0 ? 0.42 : -0.42),
      targetPos.z + (i % 3 === 0 ? 0.35 : -0.3),
    );
    units.push({ mesh: cellWrap, targetPos, spreadPos });
  });

  return { root, units };
}

/**
 * 1A. Hình cầu – Cầu khuẩn (Coccus):
 * - 'strepto': Liên cầu khuẩn (Streptococcus) — 3 chuỗi tế bào hình cầu màu xanh lam (2 chuỗi dài, 1 chuỗi ngắn)
 * - 'staphylo': Tụ cầu khuẩn (Staphylococcus) — 3 tụ tế bào hình cầu dạng chùm nho (2 tụ nhiều, 1 tụ ít)
 */
export function buildCoccusModel(
  variant: CoccusVariant = 'strepto',
  colorOverride?: string,
  maxAnisotropy = 4,
): AnimatedModelHandle {
  const group = new THREE.Group();
  const clusters: CoccusSubCluster[] = [];

  if (variant === 'staphylo') {
    // 3 clusters: 2 large dense clusters (13 & 10 cells) + 1 small cluster (4 cells)
    const largeClusterA = buildStaphyloCluster(colorOverride, maxAnisotropy, 13);
    largeClusterA.root.position.set(-1.18, 0.14, 0.22);
    largeClusterA.root.scale.setScalar(0.76);
    largeClusterA.root.rotation.set(0.15, 0.25, -0.1);
    group.add(largeClusterA.root);
    clusters.push(largeClusterA);

    const largeClusterB = buildStaphyloCluster(colorOverride, maxAnisotropy, 10);
    largeClusterB.root.position.set(1.36, -0.44, -0.28);
    largeClusterB.root.scale.setScalar(0.72);
    largeClusterB.root.rotation.set(-0.22, -0.45, 0.2);
    group.add(largeClusterB.root);
    clusters.push(largeClusterB);

    const smallCluster = buildStaphyloCluster(colorOverride, maxAnisotropy, 4);
    smallCluster.root.position.set(0.56, 1.32, -0.18);
    smallCluster.root.scale.setScalar(0.74);
    smallCluster.root.rotation.set(0.28, 0.55, 0.14);
    group.add(smallCluster.root);
    clusters.push(smallCluster);
  } else {
    // 3 chains: 2 long graceful chains (11 & 9 cells) + 1 short chain (4 cells)
    const longChainA = buildStreptoChain(colorOverride, maxAnisotropy, 11, 2.55, 0.62, 0.36, 0.2);
    longChainA.root.position.set(-0.15, 0.18, 0.28);
    longChainA.root.scale.setScalar(0.86);
    longChainA.root.rotation.set(0.1, -0.08, 0.12);
    group.add(longChainA.root);
    clusters.push(longChainA);

    const longChainB = buildStreptoChain(colorOverride, maxAnisotropy, 9, 2.15, 0.56, 0.34, 2.15);
    longChainB.root.position.set(-0.22, -1.16, -0.58);
    longChainB.root.scale.setScalar(0.8);
    longChainB.root.rotation.set(0.24, 0.3, -0.2);
    group.add(longChainB.root);
    clusters.push(longChainB);

    const shortChain = buildStreptoChain(colorOverride, maxAnisotropy, 4, 0.92, 0.22, 0.14, 3.8);
    shortChain.root.position.set(1.18, 1.28, -0.36);
    shortChain.root.scale.setScalar(0.84);
    shortChain.root.rotation.set(-0.18, -0.36, 0.26);
    group.add(shortChain.root);
    clusters.push(shortChain);
  }

  // Smooth cell-linking assembly animation state (0 = separate spheres, 1 = linked!)
  let linkTimer = -1;

  const triggerLinkAnimation = () => {
    linkTimer = 0;
  };

  return {
    group,
    triggerLinkAnimation,
    update: (delta, elapsed) => {
      let bondFactor = 1;
      if (linkTimer >= 0) {
        linkTimer += delta;
        if (linkTimer < 0.55) {
          bondFactor = 1 - linkTimer / 0.55;
        } else if (linkTimer < 1.15) {
          bondFactor = 0;
        } else if (linkTimer < 2.85) {
          const t = (linkTimer - 1.15) / 1.7;
          bondFactor = 1 - Math.pow(1 - t, 3);
        } else {
          bondFactor = 1;
          linkTimer = -1;
        }
      }

      clusters.forEach((cl, cIdx) => {
        cl.root.position.y += Math.sin(elapsed * 1.15 + cIdx * 1.6) * 0.0018;
        cl.units.forEach((u) => {
          u.mesh.position.lerpVectors(u.spreadPos, u.targetPos, bondFactor);
        });
      });
    },
  };
}

/**
 * 1B. Trực khuẩn (Bacillus) — 3 identical photorealistic SEM-style purple bumpy rod cells
 */
export function buildBacillusModel(
  colorOverride?: string,
  maxAnisotropy = 4,
  cellCount = 3,
): AnimatedModelHandle {
  const clampedCount = Math.max(2, Math.min(3, Math.round(cellCount)));
  const group = new THREE.Group();
  const baseHex = colorOverride || '#7E22CE';
  const semTex = getMicrographRodTextures(baseHex, maxAnisotropy);

  // Photorealistic SEM PBR material with normal/roughness maps + grazing-angle electron-microscope Fresnel scatter
  const bodyMat = new THREE.MeshPhysicalMaterial({
    color: 0xffffff,
    map: semTex.map,
    normalMap: semTex.normalMap,
    normalScale: new THREE.Vector2(1.75, 1.75),
    roughnessMap: semTex.roughnessMap,
    roughness: 0.92,
    metalness: 0.04,
    clearcoat: 0.35,
    clearcoatRoughness: 0.42,
    sheen: 1.0,
    sheenRoughness: 0.32,
    sheenColor: new THREE.Color('#DDD6FE'),
  });

  // Inject authentic SEM rim scatter (frosted silvery-lavender grazing highlight seen in electron micrographs)
  bodyMat.onBeforeCompile = (shader) => {
    shader.fragmentShader = shader.fragmentShader.replace(
      '#include <dithering_fragment>',
      `
        vec3 semViewDir = normalize(vViewPosition);
        float semFresnel = pow(1.0 - clamp(abs(dot(normalize(normal), semViewDir)), 0.0, 1.0), 2.35);
        vec3 semRimColor = vec3(0.84, 0.78, 1.0);
        gl_FragColor.rgb += semRimColor * semFresnel * 0.48;
        #include <dithering_fragment>
      `,
    );
  };
  bodyMat.customProgramCacheKey = () => 'bacillus_sem_fresnel_v1';

  // Surface membrane micro-vesicle / rough glycocalyx bleb material (slightly brighter frosted violet)
  const noduleMat = new THREE.MeshPhysicalMaterial({
    color: new THREE.Color(baseHex).lerp(new THREE.Color('#DDD6FE'), 0.42),
    normalMap: semTex.normalMap,
    normalScale: new THREE.Vector2(1.1, 1.1),
    roughness: 0.44,
    metalness: 0.02,
    clearcoat: 0.4,
    clearcoatRoughness: 0.35,
    sheen: 0.85,
    sheenColor: new THREE.Color('#F5F3FF'),
  });

  // Ultra-subtle translucent hydrated mucilage veil hugging each rod
  const veilMat = new THREE.MeshPhysicalMaterial({
    color: 0xe9d5ff,
    roughness: 0.22,
    metalness: 0.0,
    transparent: true,
    opacity: 0.11,
    depthWrite: false,
  });

  // Realistic slender Bacillus proportions (~4.2:1 aspect ratio) with organic multi-octave wrinkled relief
  const rodLength = 2.02;
  const rodRadius = 0.34;
  const coreGeo = new THREE.CapsuleGeometry(rodRadius, rodLength, 30, 56);
  const posAttr = coreGeo.attributes.position;
  for (let i = 0; i < posAttr.count; i++) {
    const vx = posAttr.getX(i);
    const vy = posAttr.getY(i);
    const vz = posAttr.getZ(i);
    const radialDist = Math.sqrt(vx * vx + vz * vz);
    const angle = Math.atan2(vz, vx);

    // Subtle organic peptidoglycan micro-furrows, transverse wrinkles & tiny end-cap contour
    const ridgeA = Math.sin(vy * 13.0 + Math.sin(angle * 4.0) * 1.4) * Math.cos(angle * 6.0 - vy * 5.0);
    const ridgeB = Math.sin(vx * 26.0 + vy * 21.0 - vz * 24.0);
    const ridgeC = Math.cos(vy * 32.0 + angle * 9.0) * 0.5;
    // Very gentle natural equatorial growth-constriction hint
    const septumPinch = 1 - 0.028 * Math.exp(-(vy * vy) / 0.045);

    const radialFactor = septumPinch * (1 + 0.048 * ridgeA + 0.024 * ridgeB + 0.014 * ridgeC);
    const axialFactor = 1 + 0.008 * ridgeA;
    // Keep poles smooth without pinch artifacts
    const poleBlend = Math.min(1, radialDist / (rodRadius * 0.28));
    const finalRadial = 1 + (radialFactor - 1) * (0.45 + 0.55 * poleBlend);

    posAttr.setXYZ(i, vx * finalRadial, vy * axialFactor, vz * finalRadial);
  }
  coreGeo.computeVertexNormals();
  coreGeo.computeTangents();

  const veilGeo = new THREE.CapsuleGeometry(rodRadius + 0.032, rodLength + 0.02, 16, 28);

  // Precompute deterministic organic surface micro-nodules (shared identically by every Trực khuẩn cell)
  const noduleGeo = new THREE.IcosahedronGeometry(0.046, 1);
  const noduleCount = 68;
  const noduleMatrices: THREE.Matrix4[] = [];
  const dummy = new THREE.Object3D();
  for (let i = 0; i < noduleCount; i++) {
    const frac = (i + 0.5) / noduleCount;
    const y = (frac - 0.5) * (rodLength + rodRadius * 1.45);
    const theta = i * 2.3999632; // Golden angle distribution for natural non-grid scatter
    const halfL = rodLength / 2;
    let rAtY = rodRadius;
    if (Math.abs(y) > halfL) {
      const dy = Math.abs(y) - halfL;
      rAtY = Math.sqrt(Math.max(0.01, rodRadius * rodRadius - dy * dy));
    }
    const nx = Math.cos(theta);
    const nz = Math.sin(theta);
    const embedR = rAtY * 0.94;
    dummy.position.set(nx * embedR, y, nz * embedR);
    dummy.rotation.set(i * 0.9, i * 1.3, i * 0.5);
    const sx = 0.72 + ((i * 0.618) % 1) * 0.78;
    const sy = 1.05 + ((i * 0.371) % 1) * 0.85;
    const sz = 0.65 + ((i * 0.293) % 1) * 0.65;
    dummy.scale.set(sx, sy, sz);
    dummy.updateMatrix();
    noduleMatrices.push(dummy.matrix.clone());
  }

  const makeIdenticalRod = () => {
    const unit = new THREE.Group();

    const rodBody = new THREE.Group();
    const core = new THREE.Mesh(coreGeo, bodyMat);
    core.castShadow = true;
    core.receiveShadow = true;
    rodBody.add(core);

    const nodules = new THREE.InstancedMesh(noduleGeo, noduleMat, noduleCount);
    noduleMatrices.forEach((mat, idx) => nodules.setMatrixAt(idx, mat));
    nodules.instanceMatrix.needsUpdate = true;
    nodules.computeBoundingSphere();
    nodules.castShadow = true;
    rodBody.add(nodules);

    const veil = new THREE.Mesh(veilGeo, veilMat);
    rodBody.add(veil);

    // Orient capsule horizontally along X axis
    rodBody.rotation.z = Math.PI / 2;
    unit.add(rodBody);

    return unit;
  };

  // Balanced 3D arrangement of 3 identical Trực khuẩn cells (equal scale, natural SEM angles, clear separation)
  const specs: { pos: [number, number, number]; rot: [number, number, number]; phase: number }[] = [
    { pos: [-0.2, 0.22, 0.45], rot: [0.16, 0.26, 0.34], phase: 0 },
    { pos: [0.72, -0.82, -0.26], rot: [-0.24, -0.44, -0.28], phase: 1.9 },
    { pos: [-0.88, 1.02, -0.56], rot: [0.28, -0.52, -0.36], phase: 3.6 },
  ];

  const rods: { mesh: THREE.Group; baseY: number; phase: number }[] = [];
  for (let i = 0; i < clampedCount; i++) {
    const spec = specs[i];
    const rod = makeIdenticalRod();
    rod.position.set(spec.pos[0], spec.pos[1], spec.pos[2]);
    rod.rotation.set(spec.rot[0], spec.rot[1], spec.rot[2]);
    group.add(rod);
    rods.push({ mesh: rod, baseY: spec.pos[1], phase: spec.phase });
  }

  return {
    group,
    update: (_dt, elapsed) => {
      rods.forEach((r, idx) => {
        r.mesh.position.y = r.baseY + Math.sin(elapsed * 1.15 + r.phase) * 0.07;
        r.mesh.rotation.x = specs[idx].rot[0] + Math.sin(elapsed * 0.65 + r.phase) * 0.04;
      });
    },
  };
}

/**
 * 1C. Phẩy khuẩn (Vibrio) — Curved comma-shaped body with animated polar flagellum
 */
export function buildVibrioModel(
  colorOverride?: string,
  maxAnisotropy = 4,
  cellCount = 3,
): AnimatedModelHandle {
  const clampedCount = Math.max(2, Math.min(3, Math.round(cellCount)));
  const group = new THREE.Group();
  const baseHex = colorOverride || '#E11D48';
  const tex = getOrganicTextures(baseHex, '#FECDD3', maxAnisotropy);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 0.032,
    roughness: 0.3,
    metalness: 0.05,
    clearcoat: 0.55,
    clearcoatRoughness: 0.18,
  });

  const sheathMat = new THREE.MeshPhysicalMaterial({
    color: colorOverride || 0xfda4af,
    roughness: 0.2,
    transparent: true,
    opacity: 0.18,
    depthWrite: false,
  });

  const makeVibrio = (scale = 1) => {
    const unit = new THREE.Group();
    const curvePts = [
      new THREE.Vector3(-1.15, -0.32, 0),
      new THREE.Vector3(-0.45, 0.34, 0.08),
      new THREE.Vector3(0.45, 0.32, -0.05),
      new THREE.Vector3(1.12, -0.18, 0),
    ];
    const curve = new THREE.CatmullRomCurve3(curvePts);
    const tubeRadius = 0.42;
    const bodyTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 36, tubeRadius, 22, false), bodyMat);
    bodyTube.castShadow = true;
    bodyTube.receiveShadow = true;
    unit.add(bodyTube);

    // Smooth hemispherical pole caps
    const capGeo = new THREE.SphereGeometry(tubeRadius, 22, 18);
    const capStart = new THREE.Mesh(capGeo, bodyMat);
    capStart.position.copy(curvePts[0]);
    capStart.castShadow = true;
    const capEnd = new THREE.Mesh(capGeo, bodyMat);
    capEnd.position.copy(curvePts[curvePts.length - 1]);
    capEnd.castShadow = true;
    unit.add(capStart, capEnd);

    // Translucent outer capsule
    const outerTube = new THREE.Mesh(new THREE.TubeGeometry(curve, 24, tubeRadius + 0.06, 16, false), sheathMat);
    unit.add(outerTube);

    // Basal body motor ring at posterior end
    const tangentEnd = curve.getTangent(1).normalize();
    const motorRing = new THREE.Mesh(
      new THREE.TorusGeometry(0.14, 0.045, 10, 20),
      new THREE.MeshStandardMaterial({ color: 0xfef08a, roughness: 0.35, metalness: 0.2 }),
    );
    motorRing.position.copy(curvePts[curvePts.length - 1]).addScaledVector(tangentEnd, tubeRadius * 0.92);
    motorRing.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), tangentEnd);
    unit.add(motorRing);

    // Single long polar flagellum
    const flagOrigin = curvePts[curvePts.length - 1].clone().addScaledVector(tangentEnd, tubeRadius * 0.96);
    const flagRig = createWavyFlagellum(
      flagOrigin,
      tangentEnd,
      2.35,
      0.036,
      colorOverride ? 0x059669 : 0xf43f5e,
      0.4,
      0.34,
      3.5,
    );
    const flagPivot = new THREE.Group();
    flagPivot.position.copy(flagOrigin);
    flagRig.mesh.position.sub(flagOrigin);
    flagPivot.add(flagRig.mesh);
    unit.add(flagPivot);

    unit.scale.setScalar(scale);
    return { unit, flagPivot };
  };

  const mainV = makeVibrio(1.0);
  mainV.unit.position.set(-0.25, 0.08, 0.15);
  mainV.unit.rotation.set(0.12, -0.15, 0.16);

  const companionV = makeVibrio(0.68);
  companionV.unit.position.set(1.05, -0.92, -1.05);
  companionV.unit.rotation.set(-0.2, 0.65, -0.3);

  group.add(mainV.unit, companionV.unit);

  let thirdV: { unit: THREE.Group; flagPivot: THREE.Group } | null = null;
  if (clampedCount >= 3) {
    thirdV = makeVibrio(0.64);
    thirdV.unit.position.set(-1.15, 0.98, -1.05);
    thirdV.unit.rotation.set(0.24, -0.55, -0.28);
    group.add(thirdV.unit);
  }

  return {
    group,
    update: (_dt, elapsed) => {
      mainV.unit.position.y = 0.08 + Math.sin(elapsed * 2.1) * 0.09;
      mainV.unit.rotation.z = 0.16 + Math.sin(elapsed * 2.6) * 0.06;
      mainV.flagPivot.rotation.x = Math.sin(elapsed * 6.5) * 0.25;
      mainV.flagPivot.rotation.z = Math.cos(elapsed * 5.8) * 0.2;

      companionV.unit.position.y = -0.92 + Math.cos(elapsed * 1.9) * 0.08;
      companionV.flagPivot.rotation.x = Math.cos(elapsed * 6.0) * 0.26;

      if (thirdV) {
        thirdV.unit.position.y = 0.98 + Math.sin(elapsed * 1.75 + 1.4) * 0.08;
        thirdV.flagPivot.rotation.x = Math.sin(elapsed * 5.6 + 1.1) * 0.24;
      }
    },
  };
}

/**
 * 1D. Xoắn khuẩn (Spirillum / Spirochete) — True 3D corkscrew helix with polar flagella tufts
 */
export function buildSpirillumModel(
  colorOverride?: string,
  maxAnisotropy = 4,
  cellCount = 4,
): AnimatedModelHandle {
  const clampedCount = Math.max(3, Math.min(4, Math.round(cellCount)));
  const group = new THREE.Group();
  const baseHex = colorOverride || '#9A3412';
  const tex = getOrganicTextures(baseHex, '#FED7AA', maxAnisotropy);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 0.035,
    roughness: 0.34,
    metalness: 0.12,
    clearcoat: 0.48,
    clearcoatRoughness: 0.2,
  });

  const makeHelix = (turns: number, length: number, coilRadius: number, tubeRadius: number) => {
    const unit = new THREE.Group();
    const pts: THREE.Vector3[] = [];
    const steps = 110;
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      const x = (t - 0.5) * length;
      // Smoothly taper coil amplitude at ends
      const env = Math.sin(t * Math.PI);
      const r = coilRadius * (0.38 + 0.62 * Math.pow(env, 0.45));
      const angle = t * Math.PI * 2 * turns;
      pts.push(new THREE.Vector3(x, Math.sin(angle) * r, Math.cos(angle) * r));
    }

    const curve = new THREE.CatmullRomCurve3(pts);
    const tubeGeo = new THREE.TubeGeometry(curve, 140, tubeRadius, 14, false);
    const mesh = new THREE.Mesh(tubeGeo, bodyMat);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    unit.add(mesh);

    // Tapered spherical caps at both poles
    const capGeo = new THREE.SphereGeometry(tubeRadius * 1.02, 16, 14);
    const startPt = pts[0];
    const endPt = pts[pts.length - 1];
    const capA = new THREE.Mesh(capGeo, bodyMat);
    capA.position.copy(startPt);
    const capB = new THREE.Mesh(capGeo, bodyMat);
    capB.position.copy(endPt);
    unit.add(capA, capB);

    // Polar tufts of flagella at both ends
    const flagColor = colorOverride ? 0xa855f7 : 0xc2410c;
    const tuftL = new THREE.Group();
    tuftL.position.copy(startPt);
    for (let k = 0; k < 3; k++) {
      const offsetDir = new THREE.Vector3(-1, (k - 1) * 0.24, (k % 2 === 0 ? 0.18 : -0.18)).normalize();
      const f = createWavyFlagellum(new THREE.Vector3(0, 0, 0), offsetDir, 1.05, 0.02, flagColor, k * 1.7, 0.16, 2.8);
      tuftL.add(f.mesh);
    }

    const tuftR = new THREE.Group();
    tuftR.position.copy(endPt);
    for (let k = 0; k < 3; k++) {
      const offsetDir = new THREE.Vector3(1, (k - 1) * 0.24, (k % 2 === 0 ? -0.18 : 0.18)).normalize();
      const f = createWavyFlagellum(new THREE.Vector3(0, 0, 0), offsetDir, 1.05, 0.02, flagColor, k * 2.1, 0.16, 2.8);
      tuftR.add(f.mesh);
    }

    unit.add(tuftL, tuftR);
    return { unit, tuftL, tuftR };
  };

  const mainHelix = makeHelix(5.5, 3.8, 0.34, 0.125);
  mainHelix.unit.position.set(0.05, 0.08, 0.22);
  mainHelix.unit.rotation.set(0.15, 0.2, 0.16);

  const secondaryHelix = makeHelix(4.5, 2.7, 0.24, 0.092);
  secondaryHelix.unit.position.set(-0.62, -1.08, -0.82);
  secondaryHelix.unit.rotation.set(-0.3, 0.72, -0.32);

  const thirdHelix = makeHelix(4.2, 2.55, 0.23, 0.09);
  thirdHelix.unit.position.set(0.82, 1.12, -0.92);
  thirdHelix.unit.rotation.set(0.26, -0.58, 0.3);

  group.add(mainHelix.unit, secondaryHelix.unit, thirdHelix.unit);

  let fourthHelix: { unit: THREE.Group; tuftL: THREE.Group; tuftR: THREE.Group } | null = null;
  if (clampedCount >= 4) {
    fourthHelix = makeHelix(3.8, 2.25, 0.21, 0.084);
    fourthHelix.unit.position.set(-1.45, 0.98, -1.22);
    fourthHelix.unit.rotation.set(-0.18, -0.35, -0.42);
    group.add(fourthHelix.unit);
  }

  return {
    group,
    update: (_dt, elapsed) => {
      // Authentic corkscrew rotation around its long axis
      mainHelix.unit.rotation.x = 0.15 + elapsed * 1.65;
      mainHelix.unit.position.y = 0.08 + Math.sin(elapsed * 1.3) * 0.07;
      mainHelix.tuftL.rotation.x = -elapsed * 3.5;
      mainHelix.tuftR.rotation.x = elapsed * 3.5;

      secondaryHelix.unit.rotation.x = -0.3 + elapsed * 1.4;
      thirdHelix.unit.rotation.x = 0.26 - elapsed * 1.35;
      thirdHelix.unit.position.y = 1.12 + Math.cos(elapsed * 1.15) * 0.06;

      if (fourthHelix) {
        fourthHelix.unit.rotation.x = -0.18 + elapsed * 1.5;
        fourthHelix.unit.position.y = 0.98 + Math.sin(elapsed * 1.25 + 1.8) * 0.06;
      }
    },
  };
}

export function buildShapeByType(
  shapeType: ShapeId,
  rodVariant: RodVariant = 'bacillus',
  coccusVariant: CoccusVariant = 'strepto',
  colorOverride?: string,
  maxAnisotropy = 4,
): AnimatedModelHandle {
  switch (shapeType) {
    case 'coccus':
      return buildCoccusModel(coccusVariant, colorOverride, maxAnisotropy);
    case 'bacillus':
      return rodVariant === 'vibrio'
        ? buildVibrioModel(colorOverride, maxAnisotropy, 3)
        : buildBacillusModel(colorOverride, maxAnisotropy, 3);
    case 'spirillum':
      return buildSpirillumModel(colorOverride, maxAnisotropy, 4);
  }
}

/**
 * Helper to create a cutaway cylindrical capsule shell with visible wall thickness
 * Oriented along the X axis, with cutaway opening facing +Z/+Y quadrant
 */
function createCutawayCapsuleShell(
  outerR: number,
  innerR: number,
  cylLength: number,
  cutStartAngle: number,
  cutArc: number,
  material: THREE.Material,
  edgeMaterial: THREE.Material,
): THREE.Group {
  const shellGroup = new THREE.Group();
  const intactArc = Math.PI * 2 - cutArc;
  const intactStart = cutStartAngle + cutArc;

  // Build using LatheGeometry for outer & inner continuous capsule profile!
  // Lathe revolves around Y axis; we will rotate -PI/2 around Z so Y becomes +X
  const profilePoints = (r: number) => {
    const pts: THREE.Vector2[] = [];
    const halfL = cylLength / 2;
    const capSteps = 14;
    // Bottom hemisphere (-Y -> -halfL - r to -halfL)
    for (let i = 0; i <= capSteps; i++) {
      const a = -Math.PI / 2 + (i / capSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), -halfL + Math.sin(a) * r));
    }
    // Top hemisphere (+halfL to +halfL + r)
    for (let i = 0; i <= capSteps; i++) {
      const a = (i / capSteps) * (Math.PI / 2);
      pts.push(new THREE.Vector2(Math.max(0.001, Math.cos(a) * r), halfL + Math.sin(a) * r));
    }
    return pts;
  };

  const outerGeo = new THREE.LatheGeometry(profilePoints(outerR), 44, intactStart, intactArc);
  const outerMesh = new THREE.Mesh(outerGeo, material);
  outerMesh.rotation.z = -Math.PI / 2;
  outerMesh.castShadow = true;
  outerMesh.receiveShadow = true;
  shellGroup.add(outerMesh);

  if (innerR > 0) {
    const innerMat = material.clone();
    innerMat.side = THREE.BackSide;
    const innerGeo = new THREE.LatheGeometry(profilePoints(innerR), 44, intactStart, intactArc);
    const innerMesh = new THREE.Mesh(innerGeo, innerMat);
    innerMesh.rotation.z = -Math.PI / 2;
    shellGroup.add(innerMesh);

    // Build two solid cross-section edge strips along the cutaway planes so wall thickness is visibly crisp
    const makeRimRibbon = (angle: number) => {
      const oPts = profilePoints(outerR);
      const iPts = profilePoints(innerR);
      const positions: number[] = [];
      const indices: number[] = [];
      const sinA = Math.sin(angle);
      const cosA = Math.cos(angle);
      for (let i = 0; i < oPts.length; i++) {
        // Lathe coordinate convention: x = r * sin(phi), z = r * cos(phi), y = y
        // After rotation.z = -PI/2: X = y, Y = -x = -r*sin(phi), Z = r*cos(phi)
        positions.push(oPts[i].y, -oPts[i].x * sinA, oPts[i].x * cosA);
        positions.push(iPts[i].y, -iPts[i].x * sinA, iPts[i].x * cosA);
      }
      for (let i = 0; i < oPts.length - 1; i++) {
        const a = i * 2;
        const b = a + 1;
        const c = a + 2;
        const d = a + 3;
        indices.push(a, b, c, b, d, c);
      }
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
      geo.setIndex(indices);
      geo.computeVertexNormals();
      const rim = new THREE.Mesh(geo, edgeMaterial);
      return rim;
    };

    shellGroup.add(makeRimRibbon(intactStart));
    shellGroup.add(makeRimRibbon(intactStart + intactArc));
  }

  return shellGroup;
}

/**
 * 2. GIẢI PHẪU VI KHUẨN 3D — 8-part Interactive Cutaway Rod Bacterium
 */
export interface AnatomyModelHandle {
  group: THREE.Group;
  partGroups: Record<AnatomyPartId, THREE.Group>;
  clickableMeshes: THREE.Object3D[];
  setSelectedPart: (partId: AnatomyPartId | null) => void;
  setHoveredPart: (partId: AnatomyPartId | null) => void;
  setVisibilityMap: (map: Record<AnatomyPartId, boolean>) => void;
  setExplodeAmount: (amount: number) => void;
  update: (delta: number, elapsed: number) => void;
  getAnchorWorldPos: (partId: AnatomyPartId, target: THREE.Vector3) => THREE.Vector3;
}

export function buildAnatomyCellModel(maxAnisotropy = 4): AnatomyModelHandle {
  const root = new THREE.Group();
  const cylLen = 2.35;

  // Cutaway facing front-upper-right (+Z, +Y) so student immediately sees inside
  const cutStart = -Math.PI * 0.52;
  const cutArc = Math.PI * 0.68;

  const partGroups = {} as Record<AnatomyPartId, THREE.Group>;
  const partMaterials: Record<AnatomyPartId, THREE.MeshStandardMaterial[]> = {
    cellWall: [],
    cellMembrane: [],
    cytoplasm: [],
    nucleoid: [],
    ribosome: [],
    flagella: [],
    pili: [],
  };
  const clickableMeshes: THREE.Object3D[] = [];

  const registerPart = (partId: AnatomyPartId, grp: THREE.Group) => {
    partGroups[partId] = grp;
    grp.userData.partId = partId;
    grp.traverse((child) => {
      if ((child as THREE.Mesh).isMesh) {
        const mesh = child as THREE.Mesh;
        mesh.userData.partId = partId;
        clickableMeshes.push(mesh);
        const mats = Array.isArray(mesh.material) ? mesh.material : [mesh.material];
        mats.forEach((m) => {
          if (m instanceof THREE.MeshStandardMaterial) {
            partMaterials[partId].push(m);
          }
        });
      }
    });
    root.add(grp);
  };

  // 1. Thành tế bào (Cell Wall) — bright golden-yellow sturdy structural wall
  const wallTex = getOrganicTextures('#EAB308', '#FEF08A', maxAnisotropy);
  const wallMat = new THREE.MeshPhysicalMaterial({
    map: wallTex.map,
    bumpMap: wallTex.bumpMap,
    bumpScale: 0.03,
    roughness: 0.42,
    metalness: 0.04,
    clearcoat: 0.28,
  });
  const wallEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xfacc15,
    roughness: 0.5,
    side: THREE.DoubleSide,
  });
  const cellWallGroup = createCutawayCapsuleShell(0.89, 0.78, cylLen, cutStart, cutArc, wallMat, wallEdgeMat);
  registerPart('cellWall', cellWallGroup);

  // 3. Màng tế bào (Cell Membrane) — smooth coral-orange inner lining
  const membraneMat = new THREE.MeshPhysicalMaterial({
    color: 0xf97316,
    roughness: 0.35,
    metalness: 0.05,
    clearcoat: 0.35,
  });
  const membraneEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xfb923c,
    roughness: 0.4,
    side: THREE.DoubleSide,
  });
  const cellMembraneGroup = createCutawayCapsuleShell(0.77, 0.70, cylLen, cutStart, cutArc, membraneMat, membraneEdgeMat);
  registerPart('cellMembrane', cellMembraneGroup);

  // 4. Tế bào chất (Cytoplasm) — warm soft interior gel bed filling intact half
  const cytoplasmGroup = new THREE.Group();
  const cytoMat = new THREE.MeshPhysicalMaterial({
    color: 0xfde68a,
    roughness: 0.38,
    metalness: 0.02,
    transparent: true,
    opacity: 0.82,
  });
  const cytoEdgeMat = new THREE.MeshStandardMaterial({
    color: 0xfef3c7,
    roughness: 0.45,
    side: THREE.DoubleSide,
  });
  // Slightly deeper cut so nucleoid & ribosomes pop out cleanly
  const cytoShell = createCutawayCapsuleShell(0.69, 0.04, cylLen * 0.99, cutStart - 0.05, cutArc + 0.1, cytoMat, cytoEdgeMat);
  cytoplasmGroup.add(cytoShell);
  registerPart('cytoplasm', cytoplasmGroup);

  // 5. Vùng nhân (Nucleoid) — intricate coiled royal-purple 3D DNA tangle right in center
  const nucleoidGroup = new THREE.Group();
  const dnaPoints: THREE.Vector3[] = [];
  const dnaSteps = 220;
  for (let i = 0; i <= dnaSteps; i++) {
    const t = (i / dnaSteps) * Math.PI * 2;
    const x = Math.sin(t * 3.0) * 0.92 + Math.cos(t * 7.0) * 0.24;
    const y = Math.cos(t * 5.0) * 0.27 + Math.sin(t * 11.0) * 0.09;
    const z = Math.sin(t * 4.0) * 0.26 + Math.cos(t * 9.0) * 0.08;
    dnaPoints.push(new THREE.Vector3(x, y, z));
  }
  const dnaCurve = new THREE.CatmullRomCurve3(dnaPoints, true);
  const dnaGeo = new THREE.TubeGeometry(dnaCurve, 260, 0.052, 10, true);
  const dnaMat = new THREE.MeshPhysicalMaterial({
    color: 0x7c3aed,
    roughness: 0.28,
    metalness: 0.08,
    clearcoat: 0.55,
  });
  const dnaMesh = new THREE.Mesh(dnaGeo, dnaMat);
  dnaMesh.castShadow = true;
  nucleoidGroup.add(dnaMesh);

  // Secondary intertwined DNA loop for dense chromosome volume
  const dnaPoints2: THREE.Vector3[] = [];
  for (let i = 0; i <= 140; i++) {
    const t = (i / 140) * Math.PI * 2;
    const x = Math.cos(t * 2.0 + 0.6) * 0.85 + Math.sin(t * 6.0) * 0.18;
    const y = Math.sin(t * 4.0 + 1.1) * 0.24;
    const z = Math.cos(t * 5.0 + 0.4) * 0.24;
    dnaPoints2.push(new THREE.Vector3(x, y, z));
  }
  const dnaMesh2 = new THREE.Mesh(
    new THREE.TubeGeometry(new THREE.CatmullRomCurve3(dnaPoints2, true), 180, 0.04, 8, true),
    new THREE.MeshPhysicalMaterial({
      color: 0x9333ea,
      roughness: 0.32,
      clearcoat: 0.45,
    }),
  );
  nucleoidGroup.add(dnaMesh2);
  registerPart('nucleoid', nucleoidGroup);

  // 6. Ribosome — scattered bi-lobed coral-magenta protein synthesis granules
  const ribosomeGroup = new THREE.Group();
  const riboMat = new THREE.MeshPhysicalMaterial({
    color: 0xe11d48,
    roughness: 0.32,
    metalness: 0.06,
    clearcoat: 0.4,
  });
  const riboGeo = new THREE.SphereGeometry(0.058, 12, 10);
  const riboCount = 52;
  const riboInst = new THREE.InstancedMesh(riboGeo, riboMat, riboCount);
  const dummy = new THREE.Object3D();
  for (let i = 0; i < riboCount; i++) {
    const frac = i / riboCount;
    const x = (frac - 0.5) * 2.55 + Math.sin(i * 4.1) * 0.12;
    const angle = i * 2.39996;
    const rad = 0.24 + ((i * 0.618) % 1) * 0.34;
    const y = Math.sin(angle) * rad;
    const z = Math.cos(angle) * rad;
    // Keep ribosomes slightly clear of nucleoid core
    const distCore = Math.sqrt(y * y + z * z);
    const boost = distCore < 0.28 && Math.abs(x) < 0.9 ? 1.45 : 1.0;
    dummy.position.set(x, y * boost, z * boost);
    dummy.scale.set(1.15, 0.85, 0.95);
    dummy.rotation.set(i, i * 0.7, i * 0.3);
    dummy.updateMatrix();
    riboInst.setMatrixAt(i, dummy.matrix);
  }
  riboInst.instanceMatrix.needsUpdate = true;
  riboInst.computeBoundingSphere();
  ribosomeGroup.add(riboInst);
  registerPart('ribosome', ribosomeGroup);

  // 7. Roi (Flagella) — 4 animated undulating teal whips anchored at +X pole
  const flagellaGroup = new THREE.Group();
  const flagPivot = new THREE.Group();
  flagPivot.position.set(cylLen / 2 + 0.82, 0, 0);
  const flagSpecs = [
    { offset: [0, 0.14, 0.1], dir: [1, 0.22, 0.14], len: 2.55, phase: 0.0 },
    { offset: [0, -0.14, 0.12], dir: [1, -0.24, 0.18], len: 2.35, phase: 1.6 },
    { offset: [0, 0.06, -0.15], dir: [1, 0.08, -0.22], len: 2.65, phase: 3.2 },
    { offset: [0, -0.08, -0.12], dir: [1, -0.14, -0.14], len: 2.15, phase: 4.7 },
  ];
  const flagMeshes: THREE.Group[] = [];
  const basalMat = new THREE.MeshStandardMaterial({ color: 0x0f766e, roughness: 0.35, metalness: 0.2 });

  flagSpecs.forEach((spec) => {
    const sub = new THREE.Group();
    const orig = new THREE.Vector3(spec.offset[0], spec.offset[1], spec.offset[2]);
    const dir = new THREE.Vector3(spec.dir[0], spec.dir[1], spec.dir[2]).normalize();
    const basal = new THREE.Mesh(new THREE.TorusGeometry(0.08, 0.028, 8, 16), basalMat);
    basal.position.copy(orig);
    basal.quaternion.setFromUnitVectors(new THREE.Vector3(0, 0, 1), dir);
    sub.add(basal);

    const rig = createWavyFlagellum(orig, dir, spec.len, 0.036, 0x0d9488, spec.phase, 0.28, 3.3);
    sub.add(rig.mesh);
    flagPivot.add(sub);
    flagMeshes.push(sub);
  });
  flagellaGroup.add(flagPivot);
  registerPart('flagella', flagellaGroup);

  // 8. Lông bám (Pili / Fimbriae) — radial fine attachment filaments across the intact outer surface
  const piliGroup = new THREE.Group();
  const pilusMat = new THREE.MeshStandardMaterial({
    color: 0x10b981,
    roughness: 0.45,
    metalness: 0.05,
  });
  // Curved short hair geometry
  const pilusCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(0, 0, 0),
    new THREE.Vector3(0.04, 0.18, 0.02),
    new THREE.Vector3(-0.02, 0.36, 0.04),
  ]);
  const pilusGeo = new THREE.TubeGeometry(pilusCurve, 8, 0.015, 6, false);

  const validPiliTransforms: THREE.Matrix4[] = [];
  const intactStart = cutStart + cutArc;
  const intactEnd = cutStart + Math.PI * 2;

  for (let i = 0; i < 110; i++) {
    const u = ((i / 110) - 0.5) * (cylLen + 1.55);
    const phi = ((i * 2.39996) % (Math.PI * 2));
    // Check angle lies in intact region (skip cutaway opening so interior stays clean)
    let normPhi = phi;
    while (normPhi < cutStart) normPhi += Math.PI * 2;
    if (normPhi < intactStart + 0.1 || normPhi > intactEnd - 0.1) continue;

    const halfL = cylLen / 2;
    const outerR = 0.89;
    let rAtX = outerR;
    let nx = 0;
    if (Math.abs(u) > halfL) {
      const dx = Math.abs(u) - halfL;
      if (dx >= outerR * 0.92) continue;
      rAtX = Math.sqrt(Math.max(0.01, outerR * outerR - dx * dx));
      nx = Math.sign(u) * (dx / outerR);
    }
    const ny = -Math.sin(normPhi) * (rAtX / outerR);
    const nz = Math.cos(normPhi) * (rAtX / outerR);

    dummy.position.set(u, -Math.sin(normPhi) * rAtX, Math.cos(normPhi) * rAtX);
    _vecA.set(nx, ny, nz).normalize();
    _quat.setFromUnitVectors(_up, _vecA);
    dummy.quaternion.copy(_quat);
    dummy.scale.setScalar(0.85 + (i % 4) * 0.12);
    dummy.updateMatrix();
    validPiliTransforms.push(dummy.matrix.clone());
  }

  const piliInst = new THREE.InstancedMesh(pilusGeo, pilusMat, validPiliTransforms.length);
  validPiliTransforms.forEach((m, idx) => piliInst.setMatrixAt(idx, m));
  piliInst.instanceMatrix.needsUpdate = true;
  piliInst.computeBoundingSphere();
  piliGroup.add(piliInst);
  registerPart('pili', piliGroup);

  // Subtle tilt for textbook 3/4 presentation
  root.rotation.set(0.14, -0.22, -0.1);

  // State tracking for smooth damping
  let selectedPart: AnatomyPartId | null = null;
  let hoveredPart: AnatomyPartId | null = null;
  let targetExplode = 0;
  let currentExplode = 0;

  const baseScale: Record<AnatomyPartId, number> = {
    cellWall: 1,
    cellMembrane: 1,
    cytoplasm: 1,
    nucleoid: 1,
    ribosome: 1,
    flagella: 1,
    pili: 1,
  };

  const anchorMap: Record<AnatomyPartId, THREE.Vector3> = {
    cellWall: new THREE.Vector3(-0.78, 0.78, 0.48),
    cellMembrane: new THREE.Vector3(0.45, 0.68, 0.46),
    cytoplasm: new THREE.Vector3(0.92, -0.32, 0.44),
    nucleoid: new THREE.Vector3(0.02, 0.1, 0.3),
    ribosome: new THREE.Vector3(-0.62, -0.22, 0.42),
    flagella: new THREE.Vector3(2.85, -0.05, 0.08),
    pili: new THREE.Vector3(-1.55, -0.78, 0.34),
  };

  const explodeOffsets: Record<AnatomyPartId, THREE.Vector3> = {
    cellWall: new THREE.Vector3(-0.26, 0.28, -0.26),
    cellMembrane: new THREE.Vector3(-0.08, 0.1, -0.1),
    cytoplasm: new THREE.Vector3(0, -0.05, 0),
    nucleoid: new THREE.Vector3(0.08, 0.12, 0.38),
    ribosome: new THREE.Vector3(0.04, -0.1, 0.24),
    flagella: new THREE.Vector3(0.68, 0, 0),
    pili: new THREE.Vector3(-0.34, 0.36, -0.34),
  };

  const emissiveTarget = new THREE.Color();

  const update = (delta: number, elapsed: number) => {
    currentExplode = THREE.MathUtils.damp(currentExplode, targetExplode, 6, delta);

    // Gentle living breathing float
    root.position.y = Math.sin(elapsed * 1.15) * 0.06;

    // Undulate flagella smoothly
    flagMeshes.forEach((sub, idx) => {
      sub.rotation.x = Math.sin(elapsed * 4.8 + idx * 1.4) * 0.16;
      sub.rotation.z = Math.cos(elapsed * 4.0 + idx * 1.1) * 0.1;
    });

    // Subtle DNA internal shimmer rotation
    nucleoidGroup.rotation.x = Math.sin(elapsed * 0.8) * 0.06;

    // Update highlight glow, gentle scale-up, and exploded position per part
    (Object.keys(partGroups) as AnatomyPartId[]).forEach((pid) => {
      const grp = partGroups[pid];
      const isSelected = selectedPart === pid;
      const isHovered = hoveredPart === pid;

      const targetS = isSelected ? 1.065 : isHovered ? 1.028 : 1.0;
      baseScale[pid] = THREE.MathUtils.damp(baseScale[pid], targetS, 8, delta);
      grp.scale.setScalar(baseScale[pid]);

      const off = explodeOffsets[pid];
      grp.position.set(off.x * currentExplode, off.y * currentExplode, off.z * currentExplode);

      const mats = partMaterials[pid];
      if (isSelected) {
        const pulse = 0.42 + Math.sin(elapsed * 5.0) * 0.16;
        emissiveTarget.setHex(pid === 'nucleoid' ? 0xa855f7 : 0xfbbf24);
        mats.forEach((m) => {
          m.emissive.lerp(emissiveTarget, Math.min(1, delta * 10));
          m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, pulse, 8, delta);
        });
      } else if (isHovered) {
        emissiveTarget.setHex(0x38bdf8);
        mats.forEach((m) => {
          m.emissive.lerp(emissiveTarget, Math.min(1, delta * 10));
          m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0.24, 8, delta);
        });
      } else {
        mats.forEach((m) => {
          m.emissiveIntensity = THREE.MathUtils.damp(m.emissiveIntensity, 0, 8, delta);
        });
      }
    });
  };

  return {
    group: root,
    partGroups,
    clickableMeshes,
    setSelectedPart: (partId) => {
      selectedPart = partId;
    },
    setHoveredPart: (partId) => {
      hoveredPart = partId;
    },
    setVisibilityMap: (map) => {
      (Object.keys(map) as AnatomyPartId[]).forEach((pid) => {
        if (partGroups[pid]) {
          partGroups[pid].visible = map[pid];
        }
      });
    },
    setExplodeAmount: (amount) => {
      targetExplode = THREE.MathUtils.clamp(amount, 0, 1);
    },
    update,
    getAnchorWorldPos: (partId, target) => {
      const base = anchorMap[partId];
      const off = explodeOffsets[partId];
      _vecB.set(
        base.x + off.x * currentExplode,
        base.y + off.y * currentExplode,
        base.z + off.z * currentExplode,
      );
      target.copy(_vecB).applyMatrix4(root.matrixWorld);
      return target;
    },
  };
}

/**
 * 4. MÔ PHỎNG SINH SẢN PHÂN ĐÔI 3D (Binary Fission Interactive System)
 */
export interface DivisionSimHandle {
  group: THREE.Group;
  updateState: (progress: number, generation: number, elapsed: number) => void;
}

export function buildDivisionSystem(maxAnisotropy = 4): DivisionSimHandle {
  const root = new THREE.Group();
  const tex = getOrganicTextures('#0EA5E9', '#BAE6FD', maxAnisotropy);

  const bodyMat = new THREE.MeshPhysicalMaterial({
    map: tex.map,
    bumpMap: tex.bumpMap,
    bumpScale: 0.025,
    roughness: 0.28,
    metalness: 0.04,
    clearcoat: 0.55,
    transparent: true,
    opacity: 0.72,
  });

  const innerWallMat = new THREE.MeshPhysicalMaterial({
    color: 0xfacc15,
    roughness: 0.4,
    transparent: true,
    opacity: 0.42,
  });

  const dnaMat = new THREE.MeshPhysicalMaterial({
    color: 0x7c3aed,
    roughness: 0.26,
    clearcoat: 0.5,
  });

  const septumMat = new THREE.MeshStandardMaterial({
    color: 0xf97316,
    roughness: 0.35,
    emissive: 0xf97316,
    emissiveIntensity: 0.25,
  });

  // Hero dividing cell pair (left half + right half + pinch bridge + twin DNA coils + septum ring)
  const heroGroup = new THREE.Group();
  const halfGeo = new THREE.CapsuleGeometry(0.54, 0.72, 16, 24);
  const innerHalfGeo = new THREE.CapsuleGeometry(0.46, 0.64, 14, 20);

  const leftHalf = new THREE.Group();
  const leftOuter = new THREE.Mesh(halfGeo, bodyMat);
  leftOuter.rotation.z = Math.PI / 2;
  const leftInner = new THREE.Mesh(innerHalfGeo, innerWallMat);
  leftInner.rotation.z = Math.PI / 2;
  leftHalf.add(leftOuter, leftInner);

  const rightHalf = new THREE.Group();
  const rightOuter = new THREE.Mesh(halfGeo, bodyMat);
  rightOuter.rotation.z = Math.PI / 2;
  const rightInner = new THREE.Mesh(innerHalfGeo, innerWallMat);
  rightInner.rotation.z = Math.PI / 2;
  rightHalf.add(rightOuter, rightInner);

  // Coiled DNA unit factory
  const makeDnaCoil = () => {
    const pts: THREE.Vector3[] = [];
    for (let i = 0; i <= 70; i++) {
      const t = (i / 70) * Math.PI * 2;
      pts.push(
        new THREE.Vector3(
          Math.sin(t * 3) * 0.26,
          Math.cos(t * 5) * 0.16,
          Math.sin(t * 4) * 0.16,
        ),
      );
    }
    const geo = new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts, true), 90, 0.036, 8, true);
    return new THREE.Mesh(geo, dnaMat);
  };

  const dnaLeft = makeDnaCoil();
  const dnaRight = makeDnaCoil();

  // Center septum ring (pinches inward during Stage 3)
  const septumRing = new THREE.Mesh(new THREE.TorusGeometry(0.55, 0.042, 12, 32), septumMat);
  septumRing.rotation.y = Math.PI / 2;

  // Polar flagella on each end
  const flagLeft = createWavyFlagellum(new THREE.Vector3(-0.85, 0, 0), new THREE.Vector3(-1, 0.05, 0), 1.25, 0.024, 0x0d9488, 0, 0.16, 3.0);
  const flagRight = createWavyFlagellum(new THREE.Vector3(0.85, 0, 0), new THREE.Vector3(1, -0.05, 0), 1.25, 0.024, 0x0d9488, 2.0, 0.16, 3.0);
  leftHalf.add(flagLeft.mesh);
  rightHalf.add(flagRight.mesh);

  heroGroup.add(leftHalf, rightHalf, dnaLeft, dnaRight, septumRing);
  root.add(heroGroup);

  // Exponential colony pool (up to 16 daughter cells visible across generations 1..4)
  const colonyGroup = new THREE.Group();
  const daughterCells: { grp: THREE.Group; targetPos: THREE.Vector3; rot: THREE.Euler; phase: number }[] = [];
  const dOuterGeo = new THREE.CapsuleGeometry(0.32, 0.56, 12, 18);
  const dDnaGeo = new THREE.TorusKnotGeometry(0.11, 0.032, 36, 6);

  // Precompute 16 well-spaced 3D colony slots around the stage
  const rings = [
    // Gen 1 (2 cells)
    [-1.4, 0.1, 0], [1.4, -0.1, 0],
    // Gen 2 (+2 = 4 cells)
    [-0.95, 1.15, 0.45], [0.95, -1.1, -0.4],
    // Gen 3 (+4 = 8 cells)
    [-2.25, -0.95, 0.6], [2.2, 0.98, -0.55], [-0.15, -1.45, 0.95], [0.2, 1.48, -0.85],
    // Gen 4 (+8 = 16 cells)
    [-2.75, 0.85, -0.65], [2.75, -0.85, 0.72], [-1.75, -1.75, -0.55], [1.75, 1.72, 0.58],
    [-2.15, 1.55, 0.85], [2.15, -1.55, -0.82], [0.0, 0.25, 1.75], [0.0, -0.25, -1.75],
  ];

  rings.forEach(([x, y, z], idx) => {
    const cell = new THREE.Group();
    const outer = new THREE.Mesh(dOuterGeo, bodyMat);
    outer.rotation.z = Math.PI / 2;
    const core = new THREE.Mesh(dDnaGeo, dnaMat);
    cell.add(outer, core);
    cell.visible = false;
    colonyGroup.add(cell);
    daughterCells.push({
      grp: cell,
      targetPos: new THREE.Vector3(x, y, z),
      rot: new THREE.Euler(idx * 0.45, idx * 0.75, idx * 0.35),
      phase: idx * 0.9,
    });
  });

  root.add(colonyGroup);

  const updateState = (progress: number, generation: number, elapsed: number) => {
    // progress is 0..1 within current division cycle
    // Stage 0 (0.00 - 0.22): Single mature cell
    // Stage 1 (0.22 - 0.55): DNA duplicates & cell elongates
    // Stage 2 (0.55 - 0.82): Septum pinches inward
    // Stage 3 (0.82 - 1.00): Two daughter cells separate cleanly

    const showHero = generation <= 1;
    heroGroup.visible = showHero;

    if (showHero) {
      let sep = 0.08;
      let dnaSep = 0.0;
      let dnaRightScale = 0.001;
      let septumVisible = false;
      let septumScale = 1.0;

      if (progress < 0.22) {
        const t = progress / 0.22;
        sep = 0.05 + t * 0.07;
        dnaSep = 0;
        dnaRightScale = 0.001;
      } else if (progress < 0.55) {
        const t = (progress - 0.22) / 0.33;
        sep = 0.12 + t * 0.56;
        dnaSep = t * 0.68;
        dnaRightScale = Math.min(1, t * 2.2);
      } else if (progress < 0.82) {
        const t = (progress - 0.55) / 0.27;
        sep = 0.68 + t * 0.34;
        dnaSep = 0.68 + t * 0.36;
        dnaRightScale = 1.0;
        septumVisible = true;
        septumScale = 1.02 - t * 0.78;
      } else {
        const t = (progress - 0.82) / 0.18;
        sep = 1.02 + t * 0.62;
        dnaSep = 1.04 + t * 0.62;
        dnaRightScale = 1.0;
        septumVisible = t < 0.35;
        septumScale = Math.max(0.08, 0.24 - t * 0.45);
      }

      leftHalf.position.set(-sep, Math.sin(elapsed * 1.8) * 0.04, 0);
      rightHalf.position.set(sep, -Math.sin(elapsed * 1.8) * 0.04, 0);

      dnaLeft.position.set(-dnaSep, leftHalf.position.y, 0);
      dnaLeft.rotation.y = elapsed * 0.9;
      dnaRight.position.set(dnaSep, rightHalf.position.y, 0);
      dnaRight.scale.setScalar(dnaRightScale);
      dnaRight.rotation.y = -elapsed * 0.9;

      septumRing.visible = septumVisible;
      septumRing.scale.setScalar(septumScale);

      flagLeft.mesh.rotation.x = Math.sin(elapsed * 5.0) * 0.18;
      flagRight.mesh.rotation.x = Math.cos(elapsed * 5.0) * 0.18;
    }

    // Exponential colony cells for generations 2, 3, 4 (4, 8, 16 cells!)
    const activeCount = generation <= 1 ? 0 : Math.min(16, Math.pow(2, generation));
    daughterCells.forEach((item, idx) => {
      if (idx < activeCount) {
        item.grp.visible = true;
        const bloom = idx >= activeCount / 2 ? Math.min(1, progress * 2.1 + 0.15) : 1;
        item.grp.position.set(
          item.targetPos.x * (0.45 + 0.55 * bloom) + Math.sin(elapsed * 1.3 + item.phase) * 0.12,
          item.targetPos.y * (0.45 + 0.55 * bloom) + Math.cos(elapsed * 1.15 + item.phase) * 0.12,
          item.targetPos.z * (0.45 + 0.55 * bloom),
        );
        item.grp.rotation.set(
          item.rot.x + elapsed * 0.25,
          item.rot.y + elapsed * 0.32,
          item.rot.z,
        );
        // Subtle elongation pulse before next split
        const stretchX = 1 + Math.sin(progress * Math.PI) * 0.24;
        item.grp.scale.set(bloom * stretchX, bloom, bloom);
      } else {
        item.grp.visible = false;
      }
    });
  };

  return { group: root, updateState };
}

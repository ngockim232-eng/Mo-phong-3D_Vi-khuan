import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { CoccusVariant, RodVariant, ShapeId } from '../data/bacteriaData';
import { buildShapeByType, AnimatedModelHandle } from '../three/bacteriaModels';
import {
  AmbientMicroField,
  applyBioThemeToScene,
  attachSafeResizeObserver,
  createContactShadowDisc,
  createLabRendererAndScene,
  createMicroscopicAmbientField,
  disposeObject3D,
  LabEnvTheme,
  startPacedLoop,
} from '../three/engine';

interface SpecimenStage3DProps {
  shapeType: ShapeId;
  rodVariant?: RodVariant;
  coccusVariant?: CoccusVariant;
  envTheme?: LabEnvTheme;
  colorOverride?: string;
  autoRotate?: boolean;
  resetSignal?: number;
  linkSignal?: number;
  zoomSignal?: { delta: number; seq: number };
  className?: string;
}

export function SpecimenStage3D({
  shapeType,
  rodVariant = 'bacillus',
  coccusVariant = 'strepto',
  envTheme,
  colorOverride,
  autoRotate = true,
  resetSignal = 0,
  linkSignal = 0,
  zoomSignal,
  className = '',
}: SpecimenStage3DProps) {
  const effectiveTheme: LabEnvTheme =
    envTheme ?? (shapeType === 'coccus' && coccusVariant === 'strepto' ? 'emerald' : 'colorful');

  const mountRef = useRef<HTMLDivElement | null>(null);
  const autoRotateRef = useRef(autoRotate);
  autoRotateRef.current = autoRotate;

  const controlsRef = useRef<OrbitControls | null>(null);
  const cameraRef = useRef<THREE.PerspectiveCamera | null>(null);
  const targetCamPosRef = useRef<THREE.Vector3 | null>(null);
  const sceneRef = useRef<THREE.Scene | null>(null);
  const ambientFieldRef = useRef<AmbientMicroField | null>(null);
  const maxAnisoRef = useRef<number>(4);
  const modelHandleRef = useRef<AnimatedModelHandle | null>(null);

  // Initialize WebGL renderer & scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const bundle = createLabRendererAndScene(container, effectiveTheme, 0.018);
    const { renderer, scene, isSoftwareGl, envTexture, maxAnisotropy } = bundle;
    sceneRef.current = scene;
    maxAnisoRef.current = maxAnisotropy;

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      80,
    );
    camera.position.set(0, 1.15, 6.15);
    cameraRef.current = camera;

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.6;
    controls.maxDistance = 11.5;
    controls.enablePan = true;
    controls.autoRotate = !isSoftwareGl && autoRotateRef.current;
    controls.autoRotateSpeed = 1.35;
    controlsRef.current = controls;

    const onControlStart = () => {
      targetCamPosRef.current = null;
    };
    controls.addEventListener('start', onControlStart);

    const contactShadow = createContactShadowDisc(2.5, 0.24);
    scene.add(contactShadow);

    const ambientField = createMicroscopicAmbientField(48, 13, effectiveTheme);
    scene.add(ambientField.group);
    ambientFieldRef.current = ambientField;

    // Mount initial specimen
    const initialModel = buildShapeByType(
      shapeType,
      rodVariant,
      coccusVariant,
      colorOverride,
      maxAnisotropy,
    );
    scene.add(initialModel.group);
    modelHandleRef.current = initialModel;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const onContextLost = (e: Event) => {
      e.preventDefault();
    };
    renderer.domElement.addEventListener('webglcontextlost', onContextLost);

    const detachResize = attachSafeResizeObserver(container, camera, renderer);

    const loop = startPacedLoop(renderer, isSoftwareGl, (delta, elapsed) => {
      controls.autoRotate = !isSoftwareGl && autoRotateRef.current;

      if (targetCamPosRef.current) {
        camera.position.lerp(targetCamPosRef.current, 1 - Math.exp(-6 * delta));
        controls.target.lerp(new THREE.Vector3(0, 0, 0), 1 - Math.exp(-6 * delta));
        if (camera.position.distanceTo(targetCamPosRef.current) < 0.04) {
          targetCamPosRef.current = null;
        }
      }

      controls.update();
      ambientField.update(elapsed);
      if (modelHandleRef.current) {
        modelHandleRef.current.update(delta, elapsed);
        if (isSoftwareGl && autoRotateRef.current) {
          modelHandleRef.current.group.rotation.y += delta * 0.35;
        }
      }
      renderer.render(scene, camera);
    });

    return () => {
      loop.stop();
      detachResize();
      controls.removeEventListener('start', onControlStart);
      renderer.domElement.removeEventListener('webglcontextlost', onContextLost);
      controls.dispose();
      if (modelHandleRef.current) {
        scene.remove(modelHandleRef.current.group);
        disposeObject3D(modelHandleRef.current.group);
        modelHandleRef.current = null;
      }
      disposeObject3D(ambientField.group);
      disposeObject3D(contactShadow);
      envTexture.dispose();
      renderer.dispose();
      ambientFieldRef.current = null;
      sceneRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Switch biological backdrop theme cleanly without recreating WebGLRenderer
  useEffect(() => {
    if (!sceneRef.current) return;
    applyBioThemeToScene(sceneRef.current, ambientFieldRef.current, effectiveTheme, 0.018);
  }, [effectiveTheme]);

  // Swap 3D specimen cleanly when shapeType/variant/count/color changes without recreating WebGLRenderer
  useEffect(() => {
    const scene = sceneRef.current;
    if (!scene) return;

    if (modelHandleRef.current) {
      scene.remove(modelHandleRef.current.group);
      disposeObject3D(modelHandleRef.current.group);
    }

    const nextModel = buildShapeByType(
      shapeType,
      rodVariant,
      coccusVariant,
      colorOverride,
      maxAnisoRef.current,
    );
    scene.add(nextModel.group);
    modelHandleRef.current = nextModel;
    targetCamPosRef.current = new THREE.Vector3(0, 1.15, 6.15);
  }, [shapeType, rodVariant, coccusVariant, colorOverride]);

  // Reset camera smoothly
  useEffect(() => {
    if (resetSignal > 0) {
      targetCamPosRef.current = new THREE.Vector3(0, 1.15, 6.15);
    }
  }, [resetSignal]);

  // Replay 3D intercellular linking animation (for Coccus cluster / chain)
  useEffect(() => {
    if (linkSignal > 0) {
      modelHandleRef.current?.triggerLinkAnimation?.();
    }
  }, [linkSignal]);

  // Zoom button handler
  useEffect(() => {
    if (!zoomSignal || zoomSignal.seq === 0 || !cameraRef.current || !controlsRef.current) return;
    const cam = cameraRef.current;
    const tgt = controlsRef.current.target;
    const dir = cam.position.clone().sub(tgt);
    const nextDist = THREE.MathUtils.clamp(dir.length() + zoomSignal.delta, 2.8, 10.8);
    dir.setLength(nextDist);
    targetCamPosRef.current = tgt.clone().add(dir);
  }, [zoomSignal]);

  return (
    <div className={`relative z-[1] h-full w-full overflow-hidden ${className}`}>
      <div
        ref={mountRef}
        className="h-full w-full cursor-grab active:cursor-grabbing"
        aria-label="Khung quan sát mô hình vi khuẩn 3D tương tác"
      />
    </div>
  );
}

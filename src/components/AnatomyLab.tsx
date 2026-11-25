import { useEffect, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Eye,
  EyeOff,
  Maximize,
  Minimize,
  RotateCcw,
  Tag,
  X,
} from 'lucide-react';
import { ANATOMY_PARTS, AnatomyPartId } from '../data/bacteriaData';
import { AnatomyModelHandle, buildAnatomyCellModel } from '../three/bacteriaModels';
import {
  attachSafeResizeObserver,
  createContactShadowDisc,
  createLabRendererAndScene,
  createMicroscopicAmbientField,
  disposeObject3D,
  startPacedLoop,
} from '../three/engine';
import { labSound } from '../utils/sound';
import { SpeakButton } from './SpeakButton';

interface AnatomyLabProps {
  onBackHome: () => void;
}

const DEFAULT_VISIBILITY: Record<AnatomyPartId, boolean> = {
  cellWall: true,
  cellMembrane: true,
  cytoplasm: true,
  nucleoid: true,
  ribosome: true,
  flagella: true,
  pili: true,
};

interface ScreenPin {
  id: AnatomyPartId;
  x: number;
  y: number;
  visible: boolean;
}

const LAB_FOG_DENSITY = 0.022;
const _projVec = new THREE.Vector3();

export function AnatomyLab({ onBackHome }: AnatomyLabProps) {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const mountRef = useRef<HTMLDivElement | null>(null);
  const anatomyRef = useRef<AnatomyModelHandle | null>(null);

  const [selectedPartId, setSelectedPartId] = useState<AnatomyPartId | null>(null);
  const [visibility, setVisibility] = useState<Record<AnatomyPartId, boolean>>(DEFAULT_VISIBILITY);
  const [explodeAmount, setExplodeAmount] = useState(0);
  const [showLabels, setShowLabels] = useState(true);
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [pins, setPins] = useState<ScreenPin[]>([]);

  const selectedPartRef = useRef<AnatomyPartId | null>(selectedPartId);
  selectedPartRef.current = selectedPartId;
  const visibilityRef = useRef(visibility);
  visibilityRef.current = visibility;
  const showLabelsRef = useRef(showLabels);
  showLabelsRef.current = showLabels;

  // Smooth camera transition targets
  const camTargetPosRef = useRef<THREE.Vector3 | null>(null);
  const camTargetLookRef = useRef<THREE.Vector3 | null>(null);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isFullscreen) {
        setIsFullscreen(false);
        if (document.fullscreenElement) {
          document.exitFullscreen().catch(() => {});
        }
      }
    };
    const onFsChange = () => {
      if (!document.fullscreenElement) {
        setIsFullscreen(false);
      }
    };
    window.addEventListener('keydown', onKeyDown);
    document.addEventListener('fullscreenchange', onFsChange);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('fullscreenchange', onFsChange);
    };
  }, [isFullscreen]);

  const toggleStageFullscreen = () => {
    labSound.playPop();
    if (!isFullscreen) {
      setIsFullscreen(true);
      stageContainerRef.current?.requestFullscreen?.().catch(() => {
        // Fallback to full-viewport CSS overlay when iframe restricts native fullscreen
      });
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const focusPart = (partId: AnatomyPartId) => {
    labSound.playSelect();
    setSelectedPartId(partId);
    const info = ANATOMY_PARTS.find((p) => p.id === partId);
    if (info) {
      camTargetPosRef.current = new THREE.Vector3(...info.cameraPos);
      camTargetLookRef.current = new THREE.Vector3(...info.cameraTarget);
    }
  };

  const resetView = () => {
    labSound.playPop();
    setSelectedPartId(null);
    setExplodeAmount(0);
    setVisibility(DEFAULT_VISIBILITY);
    camTargetPosRef.current = new THREE.Vector3(0.4, 1.45, 5.7);
    camTargetLookRef.current = new THREE.Vector3(0.15, 0, 0);
  };

  const applyLayerPreset = (preset: 'all' | 'openOuter' | 'insideOnly') => {
    labSound.playSelect();
    if (preset === 'all') {
      setVisibility(DEFAULT_VISIBILITY);
      setExplodeAmount(0);
    } else if (preset === 'openOuter') {
      setVisibility({
        cellWall: false,
        cellMembrane: true,
        cytoplasm: true,
        nucleoid: true,
        ribosome: true,
        flagella: true,
        pili: false,
      });
    } else {
      setVisibility({
        cellWall: false,
        cellMembrane: false,
        cytoplasm: true,
        nucleoid: true,
        ribosome: true,
        flagella: false,
        pili: false,
      });
      focusPart('nucleoid');
    }
  };

  const toggleLayer = (partId: AnatomyPartId) => {
    labSound.playPop();
    setVisibility((prev) => ({ ...prev, [partId]: !prev[partId] }));
  };

  // Mount Three.js scene once
  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl, envTexture, maxAnisotropy } = createLabRendererAndScene(
      container,
      'colorful',
      LAB_FOG_DENSITY,
    );

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.05,
      80,
    );
    camera.position.set(0.4, 1.45, 5.7);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 2.8;
    controls.maxDistance = 10.5;
    controls.target.set(0.15, 0, 0);

    const onControlsStart = () => {
      camTargetPosRef.current = null;
      camTargetLookRef.current = null;
    };
    controls.addEventListener('start', onControlsStart);

    const contactShadow = createContactShadowDisc(2.8, 0.24);
    contactShadow.position.y = -1.55;
    scene.add(contactShadow);

    const ambientField = createMicroscopicAmbientField(48, 14, 'colorful');
    scene.add(ambientField.group);

    const anatomy = buildAnatomyCellModel(maxAnisotropy);
    anatomy.setSelectedPart(selectedPartRef.current);
    anatomy.setVisibilityMap(visibilityRef.current);
    scene.add(anatomy.group);
    anatomyRef.current = anatomy;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    // Raycasting with click-vs-drag protection and throttled hover
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let downPos = { x: 0, y: 0 };
    let lastHoverTime = 0;

    const pickPart = (clientX: number, clientY: number): AnatomyPartId | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);

      const visibleMeshes = anatomy.clickableMeshes.filter((m) => {
        const pid = m.userData.partId as AnatomyPartId | undefined;
        return pid ? visibilityRef.current[pid] : true;
      });
      const hits = raycaster.intersectObjects(visibleMeshes, false);
      if (hits.length > 0) {
        const pid = hits[0].object.userData.partId as AnatomyPartId | undefined;
        return pid ?? null;
      }
      return null;
    };

    const onPointerDown = (e: PointerEvent) => {
      downPos = { x: e.clientX, y: e.clientY };
    };

    const onPointerUp = (e: PointerEvent) => {
      const dist = Math.hypot(e.clientX - downPos.x, e.clientY - downPos.y);
      if (dist > 6) return;
      const hitPart = pickPart(e.clientX, e.clientY);
      if (hitPart) {
        focusPart(hitPart);
      }
    };

    const onPointerMove = (e: PointerEvent) => {
      const now = performance.now();
      if (now - lastHoverTime < 55) return;
      lastHoverTime = now;
      const hovered = pickPart(e.clientX, e.clientY);
      anatomy.setHoveredPart(hovered);
      renderer.domElement.style.cursor = hovered ? 'pointer' : 'grab';
    };

    renderer.domElement.addEventListener('pointerdown', onPointerDown);
    renderer.domElement.addEventListener('pointerup', onPointerUp);
    renderer.domElement.addEventListener('pointermove', onPointerMove);

    const detachResize = attachSafeResizeObserver(container, camera, renderer);

    let pinFrameCounter = 0;

    const loop = startPacedLoop(renderer, isSoftwareGl, (delta, elapsed) => {
      if (camTargetPosRef.current && camTargetLookRef.current) {
        const k = 1 - Math.exp(-5.5 * delta);
        camera.position.lerp(camTargetPosRef.current, k);
        controls.target.lerp(camTargetLookRef.current, k);
        if (
          camera.position.distanceTo(camTargetPosRef.current) < 0.04 &&
          controls.target.distanceTo(camTargetLookRef.current) < 0.04
        ) {
          camTargetPosRef.current = null;
          camTargetLookRef.current = null;
        }
      }

      controls.update();
      ambientField.update(elapsed);
      anatomy.update(delta, elapsed);
      renderer.render(scene, camera);

      pinFrameCounter++;
      if (showLabelsRef.current && pinFrameCounter % 2 === 0 && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        anatomy.group.updateMatrixWorld();
        const nextPins: ScreenPin[] = ANATOMY_PARTS.map((part) => {
          const isVis = visibilityRef.current[part.id];
          if (!isVis) return { id: part.id, x: 0, y: 0, visible: false };
          anatomy.getAnchorWorldPos(part.id, _projVec);
          _projVec.project(camera);
          const inFront = _projVec.z < 1 && _projVec.z > -1;
          const sx = (_projVec.x * 0.5 + 0.5) * w;
          const sy = (-_projVec.y * 0.5 + 0.5) * h;
          const inBounds = sx > 28 && sx < w - 28 && sy > 28 && sy < h - 76;
          return { id: part.id, x: sx, y: sy, visible: inFront && inBounds };
        });
        setPins(nextPins);
      }
    });

    return () => {
      loop.stop();
      detachResize();
      controls.removeEventListener('start', onControlsStart);
      renderer.domElement.removeEventListener('pointerdown', onPointerDown);
      renderer.domElement.removeEventListener('pointerup', onPointerUp);
      renderer.domElement.removeEventListener('pointermove', onPointerMove);
      controls.dispose();
      disposeObject3D(anatomy.group);
      disposeObject3D(ambientField.group);
      disposeObject3D(contactShadow);
      envTexture.dispose();
      renderer.dispose();
      anatomyRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    anatomyRef.current?.setSelectedPart(selectedPartId);
  }, [selectedPartId]);

  useEffect(() => {
    anatomyRef.current?.setVisibilityMap(visibility);
  }, [visibility]);

  useEffect(() => {
    anatomyRef.current?.setExplodeAmount(explodeAmount);
  }, [explodeAmount]);

  const activePart = ANATOMY_PARTS.find((p) => p.id === selectedPartId) ?? null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
      {/* Header row */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              labSound.playSelect();
              onBackHome();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap shrink-0"
          >
            <ArrowLeft className="h-4 w-4" />
            Quay lại trang chủ
          </button>
          <div>
            <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
              02. Cấu tạo vi khuẩn 3D
            </h1>
            <p className="text-xs text-slate-600 sm:text-sm">
              Kích chọn trực tiếp từng thành phần trên mô hình 3D để xem tên tiếng Anh, cấu tạo và chức năng
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-Zone Layout */}
      <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        {/* 3D Interactive Cell Structure Stage */}
        <div
          ref={stageContainerRef}
          className={`bio-stage-bg flex flex-col overflow-hidden ${
            isFullscreen
              ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
              : 'relative min-h-[460px] rounded-2xl border border-slate-200 lg:col-span-8 lg:min-h-[600px]'
          }`}
        >
          <div
            ref={mountRef}
            className="relative z-[1] h-full w-full"
            aria-label="Mô hình cấu tạo vi khuẩn 3D"
          />

          {/* Top-right Fullscreen Stage Toggle */}
          <button
            type="button"
            onClick={toggleStageFullscreen}
            className="absolute top-3 right-3 z-20 inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
            title={isFullscreen ? 'Thoát toàn màn hình (Esc)' : 'Xem 3D toàn màn hình'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>

          {/* Floating Bilingual Quick-Info Card on 3D Viewport when a part is clicked */}
          {activePart && (
            <div className="absolute top-3 left-3 z-20 max-w-sm rounded-2xl border border-sky-200 bg-white/95 p-4 shadow-md">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span
                      className="h-3 w-3 rounded-xs shrink-0"
                      style={{ backgroundColor: activePart.colorHex }}
                    />
                    <h2 className="text-base font-bold text-slate-900">{activePart.name}</h2>
                  </div>
                  <div className="mt-0.5 flex items-center gap-1">
                    <p className="text-xs font-semibold text-sky-800">
                      {activePart.englishName}{' '}
                      <span className="font-normal text-slate-500 font-mono-num">
                        {activePart.pronunciation}
                      </span>
                    </p>
                    <SpeakButton term={activePart.englishName} size="xs" />
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedPartId(null)}
                  className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Đóng bảng thông tin nhanh"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <div className="mt-2.5 space-y-2 border-t border-slate-100 pt-2.5 text-xs leading-relaxed">
                <p className="text-slate-700">
                  <strong className="text-slate-900">Cấu tạo: </strong>
                  {activePart.structure}
                </p>
                <p className="text-slate-700">
                  <strong className="text-sky-900">Chức năng: </strong>
                  {activePart.functionText}
                </p>
              </div>
            </div>
          )}

          {/* 3D-to-2D Projected Bilingual Labels */}
          {showLabels && (
            <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
              {pins.map((pin) => {
                if (!pin.visible) return null;
                const info = ANATOMY_PARTS.find((p) => p.id === pin.id);
                if (!info) return null;
                const isSelected = selectedPartId === pin.id;
                return (
                  <button
                    key={pin.id}
                    type="button"
                    onClick={() => focusPart(pin.id)}
                    style={{
                      transform: `translate3d(${pin.x}px, ${pin.y}px, 0) translate(-50%, -50%)`,
                    }}
                    className={`pointer-events-auto absolute top-0 left-0 flex items-center gap-1.5 rounded-lg border px-2 py-1 text-xs font-semibold shadow-sm transition-colors whitespace-nowrap ${
                      isSelected
                        ? 'z-20 border-sky-700 bg-sky-700 text-white'
                        : 'border-slate-300 bg-white/95 text-slate-800 hover:border-sky-500 hover:text-sky-800'
                    }`}
                  >
                    <span
                      className="h-2 w-2 rounded-xs shrink-0"
                      style={{ backgroundColor: isSelected ? '#FFFFFF' : info.colorHex }}
                    />
                    <span>{info.name}</span>
                    <span className={isSelected ? 'text-sky-100 font-normal' : 'text-slate-500 font-normal'}>
                      ({info.englishName})
                    </span>
                  </button>
                );
              })}
            </div>
          )}

          {/* Collapsible Unified Bottom Control Dock */}
          <div className="pointer-events-none absolute inset-x-0 bottom-3 z-20 flex flex-col items-center px-3">
            <button
              type="button"
              onClick={() => setDockCollapsed((v) => !v)}
              className="pointer-events-auto mb-1.5 inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white/95 px-3 py-1 text-xs font-medium text-slate-600 shadow-xs hover:text-slate-900"
            >
              {dockCollapsed ? (
                <>
                  <ChevronUp className="h-3.5 w-3.5" />
                  Hiện thanh công cụ
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Ẩn thanh công cụ
                </>
              )}
            </button>

            {!dockCollapsed && (
              <div className="pointer-events-auto flex w-full max-w-[820px] flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white/95 px-4 py-2.5 shadow-md">
                {/* Exploded View Slider */}
                <label className="flex min-w-[180px] flex-1 items-center gap-2.5 text-xs font-semibold text-slate-700">
                  <span className="whitespace-nowrap">Tách lớp 3D:</span>
                  <input
                    type="range"
                    min={0}
                    max={100}
                    value={Math.round(explodeAmount * 100)}
                    onChange={(e) => setExplodeAmount(Number(e.target.value) / 100)}
                    className="h-1.5 w-full cursor-pointer accent-sky-700"
                  />
                  <span className="w-9 text-right font-mono-num text-sky-800">
                    {Math.round(explodeAmount * 100)}%
                  </span>
                </label>

                {/* Quick Layer Presets */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => applyLayerPreset('all')}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
                  >
                    Toàn bộ
                  </button>
                  <button
                    type="button"
                    onClick={() => applyLayerPreset('openOuter')}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
                  >
                    Mở vỏ ngoài
                  </button>
                  <button
                    type="button"
                    onClick={() => applyLayerPreset('insideOnly')}
                    className="rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
                  >
                    Xem bên trong
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowLabels((v) => !v)}
                    className={`inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-semibold whitespace-nowrap ${
                      showLabels
                        ? 'bg-sky-700 text-white'
                        : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <Tag className="h-3.5 w-3.5" />
                    Chú thích
                  </button>
                  <button
                    type="button"
                    onClick={resetView}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
                    title="Đặt lại mô hình"
                  >
                    <RotateCcw className="h-3.5 w-3.5" />
                    Đặt lại
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Layer Visibility Panel */}
        <aside className="flex flex-col lg:col-span-4">
          {/* 7 Interactive Bilingual Layer Toggles */}
          <div className="flex-1 rounded-2xl border border-slate-200 bg-white p-5">
            <div className="mb-1.5 flex items-baseline justify-between">
              <h3 className="text-base font-bold text-slate-900">
                {ANATOMY_PARTS.length} thành phần cấu tạo (Anh – Việt)
              </h3>
              <span className="text-xs text-slate-500 font-mono-num">
                {Object.values(visibility).filter(Boolean).length}/{ANATOMY_PARTS.length} hiện
              </span>
            </div>
            <p className="mb-3.5 text-xs leading-relaxed text-slate-500">
              Nhấn trực tiếp vào mô hình 3D hoặc tên thành phần để xem cấu tạo & chức năng. Bấm biểu tượng mắt để ẩn/hiện từng lớp.
            </p>

            <div className="space-y-1.5">
              {ANATOMY_PARTS.map((part) => {
                const isVis = visibility[part.id];
                const isSel = selectedPartId === part.id;
                return (
                  <div
                    key={part.id}
                    className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2 transition-colors ${
                      isSel
                        ? 'border-sky-500 bg-sky-50'
                        : 'border-slate-200/80 bg-white hover:border-slate-300'
                    }`}
                  >
                    <button
                      type="button"
                      onClick={() => {
                        if (!isVis) {
                          setVisibility((prev) => ({ ...prev, [part.id]: true }));
                        }
                        focusPart(part.id);
                      }}
                      className="flex flex-1 items-center gap-2.5 text-left min-w-0"
                    >
                      <span
                        className="h-3 w-3 rounded-xs shrink-0"
                        style={{ backgroundColor: part.colorHex }}
                      />
                      <div className="min-w-0 flex-1">
                        <p
                          className={`text-sm font-semibold truncate ${
                            isVis ? 'text-slate-900' : 'text-slate-400 line-through'
                          }`}
                        >
                          {part.name}{' '}
                          <span className="text-xs font-medium text-sky-700">
                            · {part.englishName}
                          </span>
                        </p>
                      </div>
                    </button>

                    <div className="flex items-center gap-0.5 shrink-0">
                      <SpeakButton term={part.englishName} size="sm" />
                      <button
                        type="button"
                        onClick={() => toggleLayer(part.id)}
                        className={`rounded-lg p-1.5 transition-colors shrink-0 ${
                          isVis
                            ? 'text-sky-700 hover:bg-sky-100'
                            : 'text-slate-400 hover:bg-slate-100 hover:text-slate-700'
                        }`}
                        aria-label={isVis ? `Ẩn lớp ${part.name}` : `Hiện lớp ${part.name}`}
                        title={isVis ? `Ẩn ${part.name}` : `Hiện ${part.name}`}
                      >
                        {isVis ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

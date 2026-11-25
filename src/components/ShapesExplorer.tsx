import { useEffect, useRef, useState } from 'react';
import {
  ArrowLeft,
  ChevronDown,
  ChevronUp,
  Link2,
  Maximize,
  Minimize,
  Pause,
  Play,
  RotateCcw,
  ZoomIn,
  ZoomOut,
} from 'lucide-react';
import {
  BACTERIA_SHAPES,
  COCCUS_SUBMODES,
  CoccusVariant,
  ROD_SUBMODES,
  RodVariant,
  ShapeId,
} from '../data/bacteriaData';
import { labSound } from '../utils/sound';
import { SpeakButton } from './SpeakButton';
import { SpecimenStage3D } from './SpecimenStage3D';

interface ShapesExplorerProps {
  onBackHome: () => void;
}

export function ShapesExplorer({ onBackHome }: ShapesExplorerProps) {
  const stageContainerRef = useRef<HTMLDivElement | null>(null);
  const [activeShapeId, setActiveShapeId] = useState<ShapeId>('bacillus');
  const [rodVariant, setRodVariant] = useState<RodVariant>('bacillus');
  const [coccusVariant, setCoccusVariant] = useState<CoccusVariant>('strepto');
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [autoRotate, setAutoRotate] = useState(true);
  const [resetSignal, setResetSignal] = useState(0);
  const [linkSignal, setLinkSignal] = useState(0);
  const [zoomSignal, setZoomSignal] = useState({ delta: 0, seq: 0 });
  const [dockCollapsed, setDockCollapsed] = useState(false);

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
        // Fallback to full-viewport CSS overlay when iframe blocks native Fullscreen API
      });
    } else {
      setIsFullscreen(false);
      if (document.fullscreenElement) {
        document.exitFullscreen().catch(() => {});
      }
    }
  };

  const activeShape = BACTERIA_SHAPES.find((s) => s.id === activeShapeId) ?? BACTERIA_SHAPES[0];
  const activeRodSub = ROD_SUBMODES.find((m) => m.id === rodVariant) ?? ROD_SUBMODES[0];
  const activeCoccusSub =
    COCCUS_SUBMODES.find((m) => m.id === coccusVariant) ?? COCCUS_SUBMODES[0];

  const handleSelectShape = (id: ShapeId) => {
    labSound.playSelect();
    setActiveShapeId(id);
  };

  const handleSelectRodMode = (variant: RodVariant) => {
    labSound.playSelect();
    setRodVariant(variant);
  };

  const handleSelectCoccusMode = (variant: CoccusVariant) => {
    labSound.playSelect();
    setCoccusVariant(variant);
    setTimeout(() => setLinkSignal((s) => s + 1), 80);
  };

  const stageTopSubtitle =
    activeShapeId === 'bacillus'
      ? `${activeShape.englishShape} · ${activeRodSub.enName}`
      : activeShapeId === 'coccus'
      ? `${activeShape.englishShape} · ${activeCoccusSub.enName}`
      : `${activeShape.englishShape} · ${activeShape.scientificName}`;

  const stageTopPronunciation =
    activeShapeId === 'bacillus'
      ? activeRodSub.pronunciation
      : activeShapeId === 'coccus'
      ? activeCoccusSub.pronunciation
      : activeShape.pronunciation;

  const stageTopTitle =
    activeShapeId === 'bacillus'
      ? `${activeRodSub.viName} (${activeRodSub.enName})`
      : activeShapeId === 'coccus'
      ? `${activeCoccusSub.viName} (${activeCoccusSub.enName})`
      : `${activeShape.shapeLabel} – ${activeShape.name}`;

  const stageSpeakTerm =
    activeShapeId === 'bacillus'
      ? `${activeRodSub.enName}`
      : activeShapeId === 'coccus'
      ? `${activeCoccusSub.enName}`
      : `${activeShape.scientificName}`;

  const stageFullEnglishSpeak =
    activeShapeId === 'bacillus'
      ? `${activeShape.englishShape}, ${activeRodSub.enName}`
      : activeShapeId === 'coccus'
      ? `${activeShape.englishShape}, ${activeCoccusSub.enName}`
      : `${activeShape.englishShape}, ${activeShape.scientificName}`;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
      {/* Top Section Header + Back to Home */}
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
              01. Đa dạng vi khuẩn – 3 dạng điển hình 3D
            </h1>
            <p className="text-xs text-slate-600 sm:text-sm">
              Hình que (Trực khuẩn & Phẩy khuẩn) · Hình cầu (Liên cầu & Tụ cầu khuẩn) · Hình xoắn (Xoắn khuẩn)
            </p>
          </div>
        </div>
      </div>

      {/* Main 2-zone Sandbox Layout: 3D Stage (left) + Scientific Info Deck (right) */}
      <div className="grid flex-1 grid-cols-1 gap-5 lg:grid-cols-12 lg:items-stretch">
        {/* Interactive 3D Microscope Stage */}
        <div
          ref={stageContainerRef}
          className={`flex flex-col overflow-hidden ${
            isFullscreen
              ? 'fixed inset-0 z-50 h-screen w-screen rounded-none border-0'
              : 'relative min-h-[450px] rounded-2xl border border-slate-200 lg:col-span-8 lg:min-h-[590px]'
          } ${
            activeShapeId === 'coccus' && coccusVariant === 'strepto'
              ? 'bio-stage-bg bio-stage-bg-emerald'
              : 'bio-stage-bg'
          }`}
        >
          {/* Top-left Bilingual Specimen Readout with English Audio Speaker */}
          <div className="pointer-events-auto absolute top-4 left-4 z-10 max-w-xs rounded-xl border border-slate-200/80 bg-white/95 px-4 py-2.5 shadow-sm">
            <div className="flex items-center justify-between gap-2">
              <p className="text-xs font-semibold text-sky-800">
                {stageTopSubtitle}{' '}
                <span className="font-normal text-slate-500 font-mono-num">
                  {stageTopPronunciation}
                </span>
              </p>
              <SpeakButton term={stageSpeakTerm} size="xs" />
            </div>
            <p className="mt-0.5 text-base font-bold text-slate-900">{stageTopTitle}</p>
            <p className="mt-0.5 text-[11px] text-slate-500 font-mono-num">
              Kích thước: {activeShape.sizeRange}
            </p>
          </div>

          {/* Top-right Fullscreen Stage Toggle */}
          <button
            type="button"
            onClick={toggleStageFullscreen}
            className="absolute top-4 right-4 z-20 inline-flex items-center gap-1.5 rounded-xl border border-slate-200/80 bg-white/95 px-3 py-2 text-xs font-semibold text-slate-800 shadow-sm transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
            title={isFullscreen ? 'Thoát toàn màn hình (Esc)' : 'Xem 3D toàn màn hình'}
          >
            {isFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            {isFullscreen ? 'Thu nhỏ' : 'Toàn màn hình'}
          </button>

          {/* 3D Canvas */}
          <SpecimenStage3D
            shapeType={activeShapeId}
            rodVariant={rodVariant}
            coccusVariant={coccusVariant}
            autoRotate={autoRotate}
            resetSignal={resetSignal}
            linkSignal={linkSignal}
            zoomSignal={zoomSignal}
          />

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
                  Hiện điều khiển
                </>
              ) : (
                <>
                  <ChevronDown className="h-3.5 w-3.5" />
                  Ẩn điều khiển
                </>
              )}
            </button>

            {!dockCollapsed && (
              <div className="pointer-events-auto flex w-full max-w-[840px] flex-col gap-2">
                {/* Contextual 2-Button Sub-Selector Bar: appears immediately when Hình que or Hình cầu is selected */}
                {activeShapeId === 'bacillus' && (
                  <div
                    className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-amber-200/90 bg-white/95 px-3 py-2 shadow-md"
                    role="group"
                    aria-label="Chọn 2 dạng vi khuẩn Hình que"
                  >
                    <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                      Chọn dạng hình que:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {ROD_SUBMODES.map((sub) => {
                        const active = rodVariant === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleSelectRodMode(sub.id)}
                            className={`bio-hover-wiggle rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 sm:text-sm ${
                              active
                                ? sub.id === 'vibrio'
                                  ? 'bg-rose-700 text-white shadow-xs'
                                  : 'bg-purple-700 text-white shadow-xs'
                                : 'border border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-400 hover:bg-white'
                            }`}
                          >
                            {sub.viName}{' '}
                            <span className={active ? 'text-white/85 font-normal' : 'text-slate-500 font-normal'}>
                              ({sub.enName})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                {activeShapeId === 'coccus' && (
                  <div
                    className="flex flex-wrap items-center justify-center gap-2 rounded-2xl border border-sky-200/90 bg-white/95 px-3 py-2 shadow-md"
                    role="group"
                    aria-label="Chọn 2 dạng vi khuẩn Hình cầu"
                  >
                    <span className="text-xs font-semibold text-slate-600 whitespace-nowrap">
                      Chọn dạng hình cầu:
                    </span>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {COCCUS_SUBMODES.map((sub) => {
                        const active = coccusVariant === sub.id;
                        return (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => handleSelectCoccusMode(sub.id)}
                            className={`bio-hover-wiggle rounded-xl px-3.5 py-1.5 text-xs font-bold whitespace-nowrap shrink-0 sm:text-sm ${
                              active
                                ? sub.id === 'staphylo'
                                  ? 'bg-amber-600 text-white shadow-xs'
                                  : 'bg-sky-700 text-white shadow-xs'
                                : 'border border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-400 hover:bg-white'
                            }`}
                          >
                            {sub.viName}{' '}
                            <span className={active ? 'text-white/85 font-normal' : 'text-slate-500 font-normal'}>
                              ({sub.enName})
                            </span>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="flex w-full flex-wrap items-center justify-between gap-2 rounded-2xl border border-slate-200 bg-white/95 p-2 shadow-md">
                  {/* 3 Typical Shape Selector Buttons with English Names */}
                  <div
                    className="flex flex-wrap items-center gap-1"
                    role="tablist"
                    aria-label="Chọn 3 dạng vi khuẩn điển hình"
                  >
                    {BACTERIA_SHAPES.map((shape) => {
                      const active = shape.id === activeShapeId;
                      return (
                        <button
                          key={shape.id}
                          type="button"
                          role="tab"
                          aria-selected={active}
                          onClick={() => handleSelectShape(shape.id)}
                          className={`rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 sm:text-sm ${
                            active
                              ? 'bg-sky-700 text-white shadow-xs'
                              : 'text-slate-700 hover:bg-slate-100'
                          }`}
                        >
                          {shape.shapeLabel}{' '}
                          <span
                            className={
                              active ? 'text-sky-100 font-normal' : 'text-slate-500 font-normal'
                            }
                          >
                            ({shape.englishShape})
                          </span>
                        </button>
                      );
                    })}
                  </div>

                {/* Camera Action Controls */}
                <div className="flex items-center gap-1 border-l border-slate-200 pl-2">
                  {activeShapeId === 'coccus' && (
                    <button
                      type="button"
                      onClick={() => {
                        labSound.playPop();
                        setLinkSignal((s) => s + 1);
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg bg-sky-50 px-2.5 py-1.5 text-xs font-semibold text-sky-800 hover:bg-sky-100 whitespace-nowrap"
                      title="Xem hoạt ảnh các cầu khuẩn liên kết với nhau trong không gian 3D"
                    >
                      <Link2 className="h-3.5 w-3.5" />
                      Mô phỏng liên kết
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setZoomSignal((z) => ({ delta: -1.1, seq: z.seq + 1 }))}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 hover:text-sky-700"
                    title="Phóng to"
                    aria-label="Phóng to mô hình"
                  >
                    <ZoomIn className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setZoomSignal((z) => ({ delta: 1.1, seq: z.seq + 1 }))}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 hover:text-sky-700"
                    title="Thu nhỏ"
                    aria-label="Thu nhỏ mô hình"
                  >
                    <ZoomOut className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => setAutoRotate((v) => !v)}
                    className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 whitespace-nowrap"
                    title={autoRotate ? 'Dừng tự xoay' : 'Tự xoay 360°'}
                  >
                    {autoRotate ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
                    <span className="hidden sm:inline">{autoRotate ? 'Dừng' : 'Tự xoay'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      labSound.playPop();
                      setResetSignal((s) => s + 1);
                    }}
                    className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 hover:text-sky-700"
                    title="Đặt lại góc nhìn"
                    aria-label="Đặt lại góc nhìn"
                  >
                    <RotateCcw className="h-4 w-4" />
                  </button>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Scientific Info Deck: only Đặc điểm hình dạng, Kích thước, Ví dụ đại diện */}
        <aside className="flex flex-col rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-4">
          <div className="space-y-5">
            <div>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-semibold text-sky-700">
                  {stageTopSubtitle}{' '}
                  <span className="font-normal text-slate-500 font-mono-num">
                    {stageTopPronunciation}
                  </span>
                </p>
                <SpeakButton
                  term={stageFullEnglishSpeak}
                  size="sm"
                  label={`Nghe phát âm tiếng Anh: ${stageFullEnglishSpeak}`}
                />
              </div>
              <h2 className="mt-1 text-2xl font-bold text-slate-900">
                {activeShape.shapeLabel} – {activeShape.name}
              </h2>
            </div>

            {/* Sub-selector for Hình que: Trực khuẩn (Bacillus) & Phẩy khuẩn (Vibrio) */}
            {activeShapeId === 'bacillus' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <p className="mb-2 text-xs font-bold text-slate-800">
                  Chọn loại vi khuẩn thuộc nhóm Hình que:
                </p>
                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {ROD_SUBMODES.map((sub) => {
                    const active = rodVariant === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className={`bio-hover-wiggle flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 ${
                          active
                            ? sub.id === 'vibrio'
                              ? 'border-rose-700 bg-rose-700 text-white'
                              : 'border-purple-700 bg-purple-700 text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectRodMode(sub.id)}
                          className="flex flex-1 items-center justify-between gap-2 py-0.5 text-left min-w-0"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{sub.viName}</p>
                            <p
                              className={`text-[11px] ${
                                active ? 'text-white/85' : 'text-sky-700'
                              }`}
                            >
                              {sub.enName}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-mono-num ${
                              active ? 'text-white/80' : 'text-slate-400'
                            }`}
                          >
                            {sub.pronunciation}
                          </span>
                        </button>
                        <SpeakButton
                          term={sub.enName}
                          size="xs"
                          tone={active ? 'inverted' : 'light'}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Reference micrograph image for Trực khuẩn (Bacillus) */}
            {activeShapeId === 'bacillus' && rodVariant === 'bacillus' && (
              <figure className="overflow-hidden rounded-xl border border-purple-200/80 bg-slate-950">
                <img
                  src="/assets/aistudio/image_7425458d.png"
                  alt="Hình ảnh minh họa Trực khuẩn (Bacillus) dưới kính hiển vi"
                  className="h-40 w-full object-cover"
                />
                <figcaption className="bg-purple-50 px-3 py-1.5 text-[11px] font-semibold text-purple-900">
                  Hình ảnh Trực khuẩn (Bacillus)
                </figcaption>
              </figure>
            )}

            {/* Sub-selector for Hình cầu: Liên cầu khuẩn (Streptococcus) & Tụ cầu khuẩn (Staphylococcus) */}
            {activeShapeId === 'coccus' && (
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3.5">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <p className="text-xs font-bold text-slate-800">
                    Tách 2 dạng liên kết Hình cầu:
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      labSound.playPop();
                      setLinkSignal((s) => s + 1);
                    }}
                    className="inline-flex items-center gap-1 text-xs font-semibold text-sky-700 hover:text-sky-900 whitespace-nowrap"
                  >
                    <Link2 className="h-3.5 w-3.5" />
                    Xem liên kết
                  </button>
                </div>

                <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2 lg:grid-cols-1">
                  {COCCUS_SUBMODES.map((sub) => {
                    const active = coccusVariant === sub.id;
                    return (
                      <div
                        key={sub.id}
                        className={`bio-hover-wiggle flex items-center justify-between gap-1.5 rounded-lg border px-2.5 py-1.5 ${
                          active
                            ? sub.id === 'staphylo'
                              ? 'border-amber-600 bg-amber-600 text-white'
                              : 'border-sky-700 bg-sky-700 text-white'
                            : 'border-slate-200 bg-white text-slate-800 hover:border-sky-300'
                        }`}
                      >
                        <button
                          type="button"
                          onClick={() => handleSelectCoccusMode(sub.id)}
                          className="flex flex-1 items-center justify-between gap-2 py-0.5 text-left min-w-0"
                        >
                          <div className="min-w-0">
                            <p className="text-xs font-bold">{sub.viName}</p>
                            <p
                              className={`text-[11px] ${
                                active ? 'text-white/85' : 'text-sky-700'
                              }`}
                            >
                              {sub.enName}
                            </p>
                          </div>
                          <span
                            className={`text-[10px] font-mono-num ${
                              active ? 'text-white/80' : 'text-slate-400'
                            }`}
                          >
                            {sub.pronunciation}
                          </span>
                        </button>
                        <SpeakButton
                          term={sub.enName}
                          size="xs"
                          tone={active ? 'inverted' : 'light'}
                        />
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">Đặc điểm hình dạng</h3>
              <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                {activeShape.morphology}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">Kích thước</h3>
              <p className="mt-1 font-mono-num text-sm font-semibold text-slate-900">
                {activeShape.sizeRange}
              </p>
            </div>

            <div className="border-t border-slate-100 pt-4">
              <h3 className="text-sm font-bold text-slate-900">Ví dụ đại diện</h3>
              <ul className="mt-2 space-y-2.5">
                {activeShape.examples.map((ex) => (
                  <li key={ex.name} className="text-sm">
                    <span className="font-semibold text-slate-900">{ex.name}: </span>
                    <span className="text-slate-600">{ex.note}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </aside>
      </div>
    </div>
  );
}

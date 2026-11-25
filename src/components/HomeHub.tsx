import { useEffect, useRef } from 'react';
import * as THREE from 'three';
import {
  ArrowRight,
  Gamepad2,
  Layers,
  Microscope,
} from 'lucide-react';
import { AppSection } from '../data/bacteriaData';
import {
  buildBacillusModel,
  buildCoccusModel,
  buildSpirillumModel,
  buildVibrioModel,
} from '../three/bacteriaModels';
import {
  attachSafeResizeObserver,
  createLabRendererAndScene,
  createMicroscopicAmbientField,
  disposeObject3D,
  startPacedLoop,
} from '../three/engine';
import { labSound } from '../utils/sound';

interface HomeHubProps {
  onNavigate: (section: AppSection) => void;
}

const HUB_MODULES: {
  id: Exclude<AppSection, 'home'>;
  number: string;
  title: string;
  subtitle: string;
  description: string;
  accent: string;
  icon: typeof Microscope;
}[] = [
  {
    id: 'shapes',
    number: '01.',
    title: 'Đa dạng vi khuẩn',
    subtitle: '3 dạng điển hình 3D',
    description:
      'Khám phá Hình que (Trực khuẩn & Phẩy khuẩn), Hình cầu (Liên cầu & Tụ cầu khuẩn) và Hình xoắn (Xoắn khuẩn) kèm tiếng Anh.',
    accent: 'text-sky-700',
    icon: Microscope,
  },
  {
    id: 'anatomy',
    number: '02.',
    title: 'Cấu tạo vi khuẩn 3D',
    subtitle: '7 thành phần Anh – Việt',
    description:
      'Kích chọn trực tiếp từng thành phần trên mô hình 3D để xem tên tiếng Anh, cấu tạo, chức năng, bật/tắt và tách từng lớp.',
    accent: 'text-amber-700',
    icon: Layers,
  },
  {
    id: 'games',
    number: '03.',
    title: 'Thử thách & Thi đua',
    subtitle: '4 chặng · Bảng xếp hạng',
    description:
      'Chọn lớp và tên từ danh sách lớp, chinh phục câu hỏi trắc nghiệm, kéo thả 3D, nhận diện hình dạng, đoán chức năng và xếp hạng theo điểm cùng thời gian làm bài.',
    accent: 'text-rose-700',
    icon: Gamepad2,
  },
];

export function HomeHub({ onNavigate }: HomeHubProps) {
  const bgMountRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const container = bgMountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl, envTexture, maxAnisotropy } = createLabRendererAndScene(
      container,
      'colorful',
      0.028,
    );

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      45,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      80,
    );
    camera.position.set(0, 0.4, 9.2);

    const ambientField = createMicroscopicAmbientField(60, 18, 'colorful');
    scene.add(ambientField.group);

    // Populate live microscopic world with all 4 real 3D bacterial types gently swimming
    const coccus = buildCoccusModel('strepto', '#0284C7', maxAnisotropy);
    coccus.group.position.set(-4.6, 2.2, -1.2);
    coccus.group.scale.setScalar(0.45);

    const bacillus = buildBacillusModel('#7E22CE', maxAnisotropy);
    bacillus.group.position.set(4.1, 1.5, -0.5);
    bacillus.group.scale.setScalar(0.68);

    const vibrio = buildVibrioModel('#E11D48', maxAnisotropy);
    vibrio.group.position.set(3.8, -2.1, -1.6);
    vibrio.group.scale.setScalar(0.62);

    const spirillum = buildSpirillumModel('#B45309', maxAnisotropy);
    spirillum.group.position.set(-4.2, -2.0, -1.8);
    spirillum.group.scale.setScalar(0.54);

    const staph = buildCoccusModel('staphylo', '#EA580C', maxAnisotropy);
    staph.group.position.set(0.6, 2.9, -3.5);
    staph.group.scale.setScalar(0.42);

    const swimmers = [coccus, bacillus, vibrio, spirillum, staph];
    swimmers.forEach((s) => scene.add(s.group));

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const mouseTarget = { x: 0, y: 0 };
    const onPointerMove = (e: PointerEvent) => {
      mouseTarget.x = (e.clientX / window.innerWidth - 0.5) * 0.7;
      mouseTarget.y = (e.clientY / window.innerHeight - 0.5) * 0.45;
    };
    window.addEventListener('pointermove', onPointerMove);

    const detachResize = attachSafeResizeObserver(container, camera, renderer);

    const loop = startPacedLoop(renderer, isSoftwareGl, (delta, elapsed) => {
      camera.position.x = THREE.MathUtils.damp(camera.position.x, mouseTarget.x, 2.5, delta);
      camera.position.y = THREE.MathUtils.damp(camera.position.y, 0.4 - mouseTarget.y, 2.5, delta);
      camera.lookAt(0, 0, -1);

      ambientField.update(elapsed);
      coccus.update(delta, elapsed);
      bacillus.update(delta, elapsed);
      vibrio.update(delta, elapsed);
      spirillum.update(delta, elapsed);
      staph.update(delta, elapsed);

      coccus.group.rotation.y = elapsed * 0.22;
      bacillus.group.rotation.y = -elapsed * 0.28;
      vibrio.group.rotation.y = elapsed * 0.3;
      staph.group.rotation.y = -elapsed * 0.2;

      renderer.render(scene, camera);
    });

    return () => {
      loop.stop();
      detachResize();
      window.removeEventListener('pointermove', onPointerMove);
      swimmers.forEach((s) => {
        scene.remove(s.group);
        disposeObject3D(s.group);
      });
      disposeObject3D(ambientField.group);
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  return (
    <div className="relative min-h-[calc(100vh-64px)] w-full overflow-x-hidden">
      {/* Live 3D microscopic world over animated biological gradient backdrop */}
      <div
        ref={bgMountRef}
        className="bio-stage-bg fixed inset-0 top-16 z-0 overflow-hidden pointer-events-none"
        aria-hidden="true"
      />

      {/* Foreground interactive laboratory hub */}
      <div className="relative z-10 mx-auto flex max-w-6xl flex-col px-4 py-12 sm:px-6 lg:px-8 lg:py-16">
        {/* Hero section */}
        <div className="mx-auto max-w-3xl text-center">
          <p className="text-sm font-semibold tracking-wide text-sky-300">
            Phòng thí nghiệm vi sinh 3D · Khoa học tự nhiên THCS
          </p>
          <h1 className="text-balance mt-3 text-3xl font-extrabold tracking-tight text-white drop-shadow-xs sm:text-5xl leading-[1.15]">
            Thế Giới Vi Khuẩn – Khám Phá Những Sinh Vật Tí Hon
          </h1>
          <p className="mx-auto mt-4 max-w-2xl text-base leading-relaxed text-slate-200 sm:text-lg">
            Trực tiếp xoay 360°, phóng to và bóc tách từng lớp cấu tạo tế bào vi khuẩn trong không gian 3D sinh động. Tìm hiểu hình dạng, cấu tạo, chức năng kèm thuật ngữ tiếng Anh và chinh phục các thử thách tương tác.
          </p>

          <div className="mt-7 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                onNavigate('anatomy');
              }}
              className="inline-flex items-center gap-2 rounded-xl bg-sky-500 px-6 py-3 text-sm font-bold text-slate-950 shadow-md transition-colors hover:bg-sky-400 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-300 whitespace-nowrap"
            >
              Khám phá cấu tạo 3D
              <ArrowRight className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                onNavigate('shapes');
              }}
              className="inline-flex items-center gap-2 rounded-xl border border-white/30 bg-white/95 px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition-colors hover:bg-white whitespace-nowrap"
            >
              Khám phá 3 dạng vi khuẩn điển hình
            </button>
          </div>
        </div>

        {/* 3 Main Interactive Zones Grid */}
        <section className="mt-14" aria-label="Các khu vực khám phá chính">
          <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2">
            <h2 className="text-lg font-bold text-white">Khu vực học tập tương tác 3D</h2>
            <p className="text-xs text-sky-200">
              Hỗ trợ máy tính · Máy chiếu lớp học · Màn hình cảm ứng điện thoại
            </p>
          </div>

          <div className="grid grid-cols-1 gap-5 md:grid-cols-3">
            {HUB_MODULES.map((mod) => {
              const Icon = mod.icon;
              return (
                <button
                  key={mod.id}
                  type="button"
                  onClick={() => {
                    labSound.playSelect();
                    onNavigate(mod.id);
                  }}
                  className="group flex flex-col justify-between rounded-2xl border border-slate-200/90 bg-white/95 p-6 text-left shadow-xs transition-all duration-150 hover:-translate-y-0.5 hover:border-sky-400 hover:shadow-md focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-700"
                >
                  <div>
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-xs font-semibold text-slate-500">
                        {mod.number} {mod.subtitle}
                      </span>
                      <Icon className={`h-5 w-5 shrink-0 ${mod.accent}`} />
                    </div>
                    <h3 className="mt-2.5 text-lg font-bold text-slate-900 group-hover:text-sky-800 transition-colors">
                      {mod.title}
                    </h3>
                    <p className="mt-2 text-sm leading-relaxed text-slate-600">
                      {mod.description}
                    </p>
                  </div>
                  <div className="mt-6 flex items-center gap-1.5 text-sm font-semibold text-sky-700">
                    <span>Khám phá ngay</span>
                    <ArrowRight className="h-4 w-4 transition-transform group-hover:translate-x-1" />
                  </div>
                </button>
              );
            })}
          </div>
        </section>
      </div>
    </div>
  );
}

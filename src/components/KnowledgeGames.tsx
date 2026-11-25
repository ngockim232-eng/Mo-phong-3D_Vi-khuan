import { useEffect, useMemo, useRef, useState } from 'react';
import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { onIdTokenChanged } from 'firebase/auth';
import { collection, limit, onSnapshot, query, where } from 'firebase/firestore';
import {
  ArrowLeft,
  ArrowRight,
  Award,
  CheckCircle2,
  Clock,
  GraduationCap,
  HelpCircle,
  Lightbulb,
  Play,
  RotateCcw,
  Search,
  Send,
  Trophy,
  UserCheck,
  Users,
  XCircle,
} from 'lucide-react';
import {
  ANATOMY_PARTS,
  AnatomyPartId,
  FUNCTION_GAME_ITEMS,
  MultipleChoiceQuestion,
  PRAISE_MESSAGES,
  QUIZ_QUESTIONS,
  SHAPE_GAME_ITEMS,
} from '../data/bacteriaData';
import {
  auth,
  db,
  handleFirestoreError,
  isTeacherUser,
  OperationType,
  type ClassRoster,
  type CompetitionSectionKey,
  type CustomQuestion,
  type QuestionType,
  type StudentSubmission,
} from '../firebase';
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
import { ClassTop3Leaderboard } from './ClassTop3Leaderboard';
import {
  bestSubmissionsPerStudent,
  CompetitionBoard,
  formatDuration,
  type ActiveStudentSession,
  type BoardTab,
} from './CompetitionBoard';
import { FireworksCanvas } from './FireworksCanvas';
import { SpecimenStage3D } from './SpecimenStage3D';

interface KnowledgeGamesProps {
  onBackHome: () => void;
}

type ChallengeMode = 'quiz' | 'shape' | 'function' | 'dragdrop' | 'leaderboard' | `custom:${string}`;
type ChallengeScreen = 'entry' | 'challenge' | 'board' | 'teacher';

interface FeedbackState {
  type: 'correct' | 'hint';
  message: string;
}

interface ChoiceLockState {
  selectedKey: string;
  correctKey: string;
  isCorrect: boolean;
}

interface ExtendedQuizQuestion extends MultipleChoiceQuestion {
  points: number;
}

const GRADES = [6, 7, 8, 9] as const;

const _proj = new THREE.Vector3();

function randomPraise(): string {
  return PRAISE_MESSAGES[Math.floor(Math.random() * PRAISE_MESSAGES.length)];
}

/**
 * Stage 4: Interactive 3D Drag & Drop Anatomy Labeling (Vietnamese + English)
 */
function DragDropAnatomyGame({
  onCorrect,
  onWrong,
  onCompleteStage,
  nextLabel,
}: {
  onCorrect: (itemKey: string, pts: number, msg: string) => void;
  onWrong: (hint: string) => void;
  onCompleteStage: () => void;
  nextLabel: string;
}) {
  const mountRef = useRef<HTMLDivElement | null>(null);
  const anatomyRef = useRef<AnatomyModelHandle | null>(null);

  const [placed, setPlaced] = useState<Partial<Record<AnatomyPartId, boolean>>>({});
  const [selectedLabel, setSelectedLabel] = useState<AnatomyPartId | null>(null);
  const [pins, setPins] = useState<{ id: AnatomyPartId; x: number; y: number; visible: boolean }[]>([]);

  const [shuffledParts] = useState<AnatomyPartId[]>(() => [
    'nucleoid',
    'flagella',
    'cellWall',
    'ribosome',
    'pili',
    'cellMembrane',
    'cytoplasm',
  ]);

  useEffect(() => {
    const container = mountRef.current;
    if (!container) return;

    const { renderer, scene, isSoftwareGl, envTexture, maxAnisotropy } = createLabRendererAndScene(
      container,
      'colorful',
      0.018,
    );

    container.innerHTML = '';
    container.appendChild(renderer.domElement);

    const camera = new THREE.PerspectiveCamera(
      42,
      Math.max(container.clientWidth, 1) / Math.max(container.clientHeight, 1),
      0.1,
      80,
    );
    camera.position.set(0.3, 1.35, 5.85);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = !isSoftwareGl;
    controls.dampingFactor = 0.06;
    controls.minDistance = 3.2;
    controls.maxDistance = 9.5;
    controls.target.set(0.15, 0, 0);

    const contactShadow = createContactShadowDisc(2.6, 0.16);
    scene.add(contactShadow);
    const ambientField = createMicroscopicAmbientField(40, 14, 'colorful');
    scene.add(ambientField.group);

    const anatomy = buildAnatomyCellModel(maxAnisotropy);
    scene.add(anatomy.group);
    anatomyRef.current = anatomy;

    if (!isSoftwareGl) {
      renderer.compile(scene, camera);
    }

    const detachResize = attachSafeResizeObserver(container, camera, renderer);

    let frameIdx = 0;
    const loop = startPacedLoop(renderer, isSoftwareGl, (delta, elapsed) => {
      controls.update();
      ambientField.update(elapsed);
      anatomy.update(delta, elapsed);
      renderer.render(scene, camera);

      frameIdx++;
      if (frameIdx % 2 === 0 && container) {
        const w = container.clientWidth;
        const h = container.clientHeight;
        anatomy.group.updateMatrixWorld();
        const nextPins = ANATOMY_PARTS.map((part) => {
          anatomy.getAnchorWorldPos(part.id, _proj);
          _proj.project(camera);
          const inFront = _proj.z < 1 && _proj.z > -1;
          const sx = (_proj.x * 0.5 + 0.5) * w;
          const sy = (-_proj.y * 0.5 + 0.5) * h;
          return {
            id: part.id,
            x: sx,
            y: sy,
            visible: inFront && sx > 20 && sx < w - 20 && sy > 20 && sy < h - 20,
          };
        });
        setPins(nextPins);
      }
    });

    return () => {
      loop.stop();
      detachResize();
      controls.dispose();
      disposeObject3D(anatomy.group);
      disposeObject3D(ambientField.group);
      disposeObject3D(contactShadow);
      envTexture.dispose();
      renderer.dispose();
    };
  }, []);

  const attemptPlace = (draggedPartId: AnatomyPartId, targetSlotId: AnatomyPartId) => {
    if (placed[targetSlotId]) return;
    if (draggedPartId === targetSlotId) {
      setPlaced((prev) => ({ ...prev, [targetSlotId]: true }));
      setSelectedLabel(null);
      anatomyRef.current?.setSelectedPart(targetSlotId);
      const info = ANATOMY_PARTS.find((p) => p.id === targetSlotId);
      onCorrect(
        `dragdrop:${targetSlotId}`,
        15,
        `${randomPraise()} Em đã gắn đúng vị trí "${info?.name} (${info?.englishName})"!`,
      );
    } else {
      const targetInfo = ANATOMY_PARTS.find((p) => p.id === targetSlotId);
      onWrong(
        `Chưa chính xác! Gợi ý cho vị trí này: Bộ phận này có chức năng "${targetInfo?.functionText}"`,
      );
    }
  };

  const completedCount = Object.values(placed).filter(Boolean).length;

  return (
    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
      <div className="bio-stage-bg relative min-h-[420px] overflow-hidden rounded-2xl border border-slate-200 lg:col-span-8 lg:min-h-[520px]">
        <div ref={mountRef} className="relative z-[1] h-full w-full" aria-label="Mô hình 3D kéo thả cấu tạo vi khuẩn" />

        <div className="pointer-events-none absolute top-3 left-3 z-10 rounded-xl border border-slate-200 bg-white/95 px-3.5 py-2 text-xs font-semibold text-slate-700 shadow-xs">
          Kéo thẻ tên bên phải thả vào ô số trên mô hình 3D (hoặc bấm chọn thẻ rồi bấm vào ô số)
        </div>

        <div className="pointer-events-none absolute inset-0 z-10 overflow-hidden">
          {pins.map((pin, idx) => {
            if (!pin.visible) return null;
            const info = ANATOMY_PARTS.find((p) => p.id === pin.id)!;
            const isDone = Boolean(placed[pin.id]);
            return (
              <div
                key={pin.id}
                onDragOver={(e) => {
                  if (!isDone) e.preventDefault();
                }}
                onDrop={(e) => {
                  e.preventDefault();
                  const dropped = e.dataTransfer.getData('text/plain') as AnatomyPartId;
                  if (dropped) attemptPlace(dropped, pin.id);
                }}
                onClick={() => {
                  if (isDone) return;
                  if (selectedLabel) {
                    attemptPlace(selectedLabel, pin.id);
                  } else {
                    anatomyRef.current?.setSelectedPart(pin.id);
                    onWrong(
                      `Hãy chọn hoặc kéo một thẻ tên bên phải vào ô số ${idx + 1}. Gợi ý: ${info.functionText}`,
                    );
                  }
                }}
                style={{
                  transform: `translate3d(${pin.x}px, ${pin.y}px, 0) translate(-50%, -50%)`,
                }}
                className={`pointer-events-auto absolute top-0 left-0 cursor-pointer rounded-lg border px-2.5 py-1 text-xs font-bold shadow-sm transition-colors whitespace-nowrap ${
                  isDone
                    ? 'border-emerald-600 bg-emerald-600 text-white'
                    : selectedLabel
                    ? 'border-sky-600 bg-white text-sky-900 ring-2 ring-sky-300'
                    : 'border-slate-400 bg-white/95 text-slate-800 hover:border-sky-600'
                }`}
              >
                {isDone ? `✓ ${info.name} (${info.englishName})` : `Vị trí ${idx + 1}`}
              </div>
            );
          })}
        </div>
      </div>

      <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-4">
        <div>
          <div className="flex items-center justify-between">
            <h3 className="text-base font-bold text-slate-900">Kho thẻ tên (Anh – Việt)</h3>
            <span className="font-mono-num text-xs font-semibold text-sky-800">
              {completedCount}/{ANATOMY_PARTS.length} hoàn thành
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-600">
            Kéo thả trực tiếp lên mô hình 3D hoặc chạm để chọn thẻ rồi bấm vào vị trí tương ứng.
          </p>

          <div className="mt-4 grid grid-cols-1 gap-2 sm:grid-cols-2">
            {shuffledParts.map((pid) => {
              const info = ANATOMY_PARTS.find((p) => p.id === pid)!;
              const isDone = Boolean(placed[pid]);
              const isSelected = selectedLabel === pid;
              return (
                <button
                  key={pid}
                  type="button"
                  draggable={!isDone}
                  disabled={isDone}
                  onDragStart={(e) => {
                    e.dataTransfer.setData('text/plain', pid);
                    setSelectedLabel(pid);
                  }}
                  onClick={() => {
                    if (isDone) return;
                    labSound.playSelect();
                    setSelectedLabel((prev) => (prev === pid ? null : pid));
                  }}
                  className={`flex items-start gap-2 rounded-xl border px-3 py-2.5 text-left transition-all ${
                    isDone
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-700 line-through opacity-75'
                      : isSelected
                      ? 'border-sky-700 bg-sky-700 text-white shadow-sm'
                      : 'cursor-grab border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-400 hover:bg-white active:cursor-grabbing'
                  }`}
                >
                  <span
                    className="mt-1 h-2.5 w-2.5 rounded-xs shrink-0"
                    style={{ backgroundColor: isSelected ? '#FFFFFF' : info.colorHex }}
                  />
                  <div className="min-w-0">
                    <p className="text-xs font-bold truncate">{info.name}</p>
                    <p
                      className={`text-[11px] truncate ${
                        isSelected ? 'text-sky-100' : 'text-slate-500'
                      }`}
                    >
                      {info.englishName}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className="mt-5 border-t border-slate-100 pt-4">
          {completedCount === ANATOMY_PARTS.length ? (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-center">
              <p className="text-sm font-bold text-emerald-900">
                Hoàn thành xuất sắc cả {ANATOMY_PARTS.length}/{ANATOMY_PARTS.length} thành phần tế bào!
              </p>
              <div className="mt-2.5 flex flex-wrap justify-center gap-2">
                <button
                  type="button"
                  onClick={onCompleteStage}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <ArrowRight className="h-3.5 w-3.5" />
                  {nextLabel}
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setPlaced({});
                    setSelectedLabel(null);
                    anatomyRef.current?.setSelectedPart(null);
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-50"
                >
                  <RotateCcw className="h-3.5 w-3.5" />
                  Làm lại chặng này
                </button>
              </div>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => {
                setPlaced({});
                setSelectedLabel(null);
                anatomyRef.current?.setSelectedPart(null);
              }}
              className="inline-flex w-full items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              Làm mới bảng kéo thả
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

export function KnowledgeGames({ onBackHome }: KnowledgeGamesProps) {
  // Teacher session check: when Teacher is signed in, never show student quiz/submission screens!
  const [isTeacherSignedIn, setIsTeacherSignedIn] = useState<boolean>(() =>
    isTeacherUser(auth.currentUser),
  );

  // Firestore real-time state (classes, submissions, teacher custom question types & questions)
  const [classes, setClasses] = useState<ClassRoster[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [customTypes, setCustomTypes] = useState<QuestionType[]>([]);
  const [customQuestions, setCustomQuestions] = useState<CustomQuestion[]>([]);
  const [loadingClasses, setLoadingClasses] = useState(true);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Screen routing state
  const [screen, setScreen] = useState<ChallengeScreen>(() =>
    isTeacherUser(auth.currentUser) ? 'teacher' : 'entry',
  );
  const [boardInitialTab, setBoardInitialTab] = useState<BoardTab>('rankings');
  const [boardInitialClassId, setBoardInitialClassId] = useState<string | undefined>(undefined);
  const [selectedGradeFilter, setSelectedGradeFilter] = useState<number | 'all'>('all');
  const [pickedClassId, setPickedClassId] = useState('');
  const [pickedStudentName, setPickedStudentName] = useState('');
  const [rosterSearch, setRosterSearch] = useState('');

  // Active timed challenge session
  const [activeStudent, setActiveStudent] = useState<ActiveStudentSession | null>(null);
  const [mode, setMode] = useState<ChallengeMode>('quiz');
  const [score, setScore] = useState(0);
  const [streak, setStreak] = useState(0);
  const [bestStreak, setBestStreak] = useState(0);
  const [solvedIds, setSolvedIds] = useState<string[]>([]);
  const [wrongAttempts, setWrongAttempts] = useState(0);
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [sessionResetKey, setSessionResetKey] = useState(0);
  const [burstKey, setBurstKey] = useState(0);
  const [feedback, setFeedback] = useState<FeedbackState | null>(null);

  // Live completion timer
  const [startedAtMs, setStartedAtMs] = useState<number | null>(null);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Per-stage sequential step indices (auto-advance on click)
  const [quizStep, setQuizStep] = useState(0);
  const [shapeStep, setShapeStep] = useState(0);
  const [funcStep, setFuncStep] = useState(0);
  const [customSteps, setCustomSteps] = useState<Record<string, number>>({});
  const [choiceLock, setChoiceLock] = useState<ChoiceLockState | null>(null);
  const autoAdvanceRef = useRef<number | null>(null);
  const wasTeacherSignedInRef = useRef<boolean>(isTeacherUser(auth.currentUser));

  if (fatalError) {
    throw fatalError;
  }

  // Keep Teacher vs Student interface cleanly separated when auth state changes
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (u) => {
      const teacherNow = isTeacherUser(u);
      setIsTeacherSignedIn(teacherNow);
      if (teacherNow) {
        setScreen('teacher');
      } else if (wasTeacherSignedInRef.current) {
        setScreen((prev) => (prev === 'teacher' ? 'entry' : prev));
      }
      wasTeacherSignedInRef.current = teacherNow;
    });
    return unsub;
  }, []);

  // Subscribe to Firestore active classes
  useEffect(() => {
    const q = query(collection(db, 'classes'), where('isActive', '==', true), limit(100));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: ClassRoster[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            teacherUid: String(data.teacherUid ?? ''),
            className: String(data.className ?? ''),
            grade: Number(data.grade ?? 6),
            students: Array.isArray(data.students) ? data.students.map(String) : [],
            isActive: Boolean(data.isActive),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort((a, b) => {
          if (a.grade !== b.grade) return a.grade - b.grade;
          return a.className.localeCompare(b.className, 'vi');
        });
        setClasses(list);
        setLoadingClasses(false);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'classes');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, []);

  // Subscribe to public submissions for the live Top 3 Leaderboard
  useEffect(() => {
    const q = query(collection(db, 'submissions'), where('isPublic', '==', true), limit(500));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: StudentSubmission[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            classId: String(data.classId ?? ''),
            className: String(data.className ?? ''),
            grade: Number(data.grade ?? 6),
            studentName: String(data.studentName ?? ''),
            score: Number(data.score ?? 0),
            correctCount: Number(data.correctCount ?? 0),
            totalQuestions: Number(data.totalQuestions ?? 25),
            accuracy: Number(data.accuracy ?? 0),
            bestStreak: Number(data.bestStreak ?? 0),
            durationSec: typeof data.durationSec === 'number' ? Number(data.durationSec) : 0,
            completedSections: Array.isArray(data.completedSections)
              ? (data.completedSections as CompetitionSectionKey[])
              : [],
            isPublic: Boolean(data.isPublic),
            submittedAt: data.submittedAt ?? null,
          };
        });
        setSubmissions(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'submissions');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, []);

  // Subscribe to Teacher-created custom question types
  useEffect(() => {
    const q = query(collection(db, 'question_types'), where('isActive', '==', true), limit(50));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: QuestionType[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            teacherUid: String(data.teacherUid ?? ''),
            title: String(data.title ?? ''),
            description: String(data.description ?? ''),
            format: data.format === 'true_false' ? 'true_false' : 'multiple_choice',
            pointsPerQuestion: Number(data.pointsPerQuestion ?? 10),
            isActive: Boolean(data.isActive),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort((a, b) => {
          const aT = a.createdAt ? a.createdAt.toMillis() : 0;
          const bT = b.createdAt ? b.createdAt.toMillis() : 0;
          return aT - bT;
        });
        setCustomTypes(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'question_types');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, []);

  // Subscribe to Teacher-created custom questions
  useEffect(() => {
    const q = query(collection(db, 'questions'), where('isActive', '==', true), limit(200));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list: CustomQuestion[] = snap.docs.map((d) => {
          const data = d.data();
          return {
            id: d.id,
            teacherUid: String(data.teacherUid ?? ''),
            categoryId: String(data.categoryId ?? 'quiz'),
            question: String(data.question ?? ''),
            options: Array.isArray(data.options) ? data.options.map(String) : [],
            correctIndex: Number(data.correctIndex ?? 0),
            hint: String(data.hint ?? ''),
            explanation: String(data.explanation ?? ''),
            points: Number(data.points ?? 10),
            isActive: Boolean(data.isActive),
            createdAt: data.createdAt ?? null,
            updatedAt: data.updatedAt ?? null,
          };
        });
        list.sort((a, b) => {
          const aT = a.createdAt ? a.createdAt.toMillis() : 0;
          const bT = b.createdAt ? b.createdAt.toMillis() : 0;
          return aT - bT;
        });
        setCustomQuestions(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'questions');
        } catch (wrapped) {
          setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, []);

  const bestSubmissions = useMemo(() => bestSubmissionsPerStudent(submissions), [submissions]);

  // Combine built-in Chặng 1 quiz questions with teacher-added 'quiz' questions
  const allQuizQuestions = useMemo<ExtendedQuizQuestion[]>(() => {
    const base: ExtendedQuizQuestion[] = QUIZ_QUESTIONS.map((q) => ({ ...q, points: 10 }));
    const extras: ExtendedQuizQuestion[] = customQuestions
      .filter((q) => q.categoryId === 'quiz' && q.options.length >= 2)
      .map((q) => ({
        id: q.id,
        question: q.question,
        options: q.options,
        correctIndex: q.correctIndex,
        hint: q.hint || 'Hãy đọc kỹ lại câu hỏi và ghi nhớ kiến thức bài học.',
        explanation: q.explanation || 'Chính xác!',
        points: q.points,
      }));
    return [...base, ...extras];
  }, [customQuestions]);

  // Active teacher-created custom stages (only categories that have >= 1 active question)
  const customStages = useMemo(() => {
    return customTypes
      .map((qt) => ({
        type: qt,
        questions: customQuestions.filter((q) => q.categoryId === qt.id && q.options.length >= 2),
      }))
      .filter((stage) => stage.questions.length > 0);
  }, [customTypes, customQuestions]);

  const totalChallengesCount = useMemo(() => {
    const customCount = customStages.reduce((acc, s) => acc + s.questions.length, 0);
    return (
      ANATOMY_PARTS.length +
      SHAPE_GAME_ITEMS.length +
      allQuizQuestions.length +
      FUNCTION_GAME_ITEMS.length +
      customCount
    );
  }, [allQuizQuestions.length, customStages]);

  // Live timer effect
  useEffect(() => {
    if (screen !== 'challenge' || !startedAtMs || hasSubmitted) return;
    const tick = () => {
      const secs = Math.max(1, Math.floor((Date.now() - startedAtMs) / 1000));
      setElapsedSec(secs);
    };
    tick();
    const id = window.setInterval(tick, 1000);
    return () => window.clearInterval(id);
  }, [screen, startedAtMs, hasSubmitted]);

  // Cleanup auto-advance timer on unmount
  useEffect(() => {
    return () => {
      if (autoAdvanceRef.current !== null) {
        window.clearTimeout(autoAdvanceRef.current);
      }
    };
  }, []);

  // Auto-select first class when classes arrive
  useEffect(() => {
    if (classes.length === 0) return;
    if (!pickedClassId || !classes.some((c) => c.id === pickedClassId)) {
      setPickedClassId(classes[0].id);
      setPickedStudentName('');
    }
  }, [classes, pickedClassId]);

  const availableGrades = useMemo(() => {
    const set = new Set(classes.map((c) => c.grade));
    return GRADES.filter((g) => set.has(g));
  }, [classes]);

  const filteredClasses = useMemo(() => {
    if (selectedGradeFilter === 'all') return classes;
    return classes.filter((c) => c.grade === selectedGradeFilter);
  }, [classes, selectedGradeFilter]);

  const selectedEntryClass = useMemo(
    () => classes.find((c) => c.id === pickedClassId) ?? null,
    [classes, pickedClassId],
  );

  const filteredEntryStudents = useMemo(() => {
    if (!selectedEntryClass) return [];
    const q = rosterSearch.trim().toLowerCase();
    if (!q) return selectedEntryClass.students;
    return selectedEntryClass.students.filter((name) => name.toLowerCase().includes(q));
  }, [selectedEntryClass, rosterSearch]);

  const clearPendingAdvance = () => {
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
      autoAdvanceRef.current = null;
    }
    setChoiceLock(null);
  };

  const handleStartChallenge = () => {
    if (!selectedEntryClass || !pickedStudentName) return;
    clearPendingAdvance();
    labSound.playSuccess();
    setActiveStudent({
      classId: selectedEntryClass.id,
      className: selectedEntryClass.className,
      grade: selectedEntryClass.grade,
      studentName: pickedStudentName,
    });
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setSolvedIds([]);
    setWrongAttempts(0);
    setHasSubmitted(false);
    setQuizStep(0);
    setShapeStep(0);
    setFuncStep(0);
    setCustomSteps({});
    setFeedback(null);
    setSessionResetKey((k) => k + 1);
    setStartedAtMs(Date.now());
    setElapsedSec(1);
    setMode('quiz');
    setScreen('challenge');
  };

  const handleResetForNewStudent = () => {
    clearPendingAdvance();
    setActiveStudent(null);
    setPickedStudentName('');
    setRosterSearch('');
    setScore(0);
    setStreak(0);
    setBestStreak(0);
    setSolvedIds([]);
    setWrongAttempts(0);
    setHasSubmitted(false);
    setQuizStep(0);
    setShapeStep(0);
    setFuncStep(0);
    setCustomSteps({});
    setStartedAtMs(null);
    setElapsedSec(0);
    setFeedback(null);
    setSessionResetKey((k) => k + 1);
    setScreen('entry');
  };

  const triggerCorrect = (itemKey: string, points: number, message: string) => {
    labSound.playSuccess();
    setBurstKey((k) => k + 1);
    setFeedback({ type: 'correct', message });

    if (!solvedIds.includes(itemKey)) {
      setSolvedIds((prev) => (prev.includes(itemKey) ? prev : [...prev, itemKey]));
      setScore((s) => Math.min(5000, s + points));
      setStreak((st) => {
        const next = st + 1;
        setBestStreak((best) => Math.max(best, next));
        return next;
      });
    }
  };

  const triggerHint = (hint: string) => {
    labSound.playHint();
    setStreak(0);
    setWrongAttempts((w) => w + 1);
    setFeedback({ type: 'hint', message: hint });
  };

  const switchMode = (nextMode: ChallengeMode) => {
    clearPendingAdvance();
    labSound.playSelect();
    setMode(nextMode);
    setFeedback(null);
  };

  const scheduleAutoAdvance = (isCorrect: boolean, advanceFn: () => void) => {
    if (autoAdvanceRef.current !== null) {
      window.clearTimeout(autoAdvanceRef.current);
    }
    const delayMs = isCorrect ? 750 : 1050;
    autoAdvanceRef.current = window.setTimeout(() => {
      advanceFn();
      setChoiceLock(null);
      autoAdvanceRef.current = null;
    }, delayMs);
  };

  const handleAnswerQuiz = (idx: number) => {
    if (choiceLock) return;
    const item = allQuizQuestions[quizStep];
    if (!item) return;
    const isCorrect = idx === item.correctIndex;
    setChoiceLock({
      selectedKey: String(idx),
      correctKey: String(item.correctIndex),
      isCorrect,
    });
    if (isCorrect) {
      triggerCorrect(`quiz:${item.id}`, item.points, `${randomPraise()} ${item.explanation}`);
    } else {
      triggerHint(
        `Chưa chính xác! Đáp án đúng là ${String.fromCharCode(65 + item.correctIndex)}. ${item.hint}`,
      );
    }
    scheduleAutoAdvance(isCorrect, () => {
      setQuizStep((prev) => prev + 1);
    });
  };

  const handleAnswerShape = (opt: string) => {
    if (choiceLock) return;
    const item = SHAPE_GAME_ITEMS[shapeStep];
    if (!item) return;
    const isCorrect = opt === item.correctOption;
    setChoiceLock({
      selectedKey: opt,
      correctKey: item.correctOption,
      isCorrect,
    });
    if (isCorrect) {
      triggerCorrect(`shape:${item.id}`, 10, item.praise);
    } else {
      triggerHint(`Chưa đúng! Đáp án đúng là "${item.correctOption}". ${item.hint}`);
    }
    scheduleAutoAdvance(isCorrect, () => {
      setShapeStep((prev) => prev + 1);
    });
  };

  const handleAnswerFunction = (partId: AnatomyPartId) => {
    if (choiceLock) return;
    const item = FUNCTION_GAME_ITEMS[funcStep];
    if (!item) return;
    const isCorrect = partId === item.correctPartId;
    const correctPart = ANATOMY_PARTS.find((p) => p.id === item.correctPartId)!;
    setChoiceLock({
      selectedKey: partId,
      correctKey: item.correctPartId,
      isCorrect,
    });
    if (isCorrect) {
      triggerCorrect(
        `function:${item.id}`,
        10,
        `${randomPraise()} Đúng là ${correctPart.name} (${correctPart.englishName})!`,
      );
    } else {
      triggerHint(
        `Chưa chính xác! Đáp án đúng là ${correctPart.name} (${correctPart.englishName}). ${item.hint}`,
      );
    }
    scheduleAutoAdvance(isCorrect, () => {
      setFuncStep((prev) => prev + 1);
    });
  };

  const handleAnswerCustomQuestion = (stageId: string, item: CustomQuestion, idx: number) => {
    if (choiceLock) return;
    const isCorrect = idx === item.correctIndex;
    setChoiceLock({
      selectedKey: String(idx),
      correctKey: String(item.correctIndex),
      isCorrect,
    });
    if (isCorrect) {
      triggerCorrect(
        `custom:${stageId}:${item.id}`,
        item.points,
        `${randomPraise()} ${item.explanation || ''}`.trim(),
      );
    } else {
      const rightLabel =
        item.options.length === 2 && item.options[0] === 'Đúng' && item.options[1] === 'Sai'
          ? item.options[item.correctIndex]
          : `${String.fromCharCode(65 + item.correctIndex)}. ${item.options[item.correctIndex]}`;
      triggerHint(`Chưa chính xác! Đáp án đúng là ${rightLabel}. ${item.hint || ''}`.trim());
    }
    scheduleAutoAdvance(isCorrect, () => {
      setCustomSteps((prev) => ({ ...prev, [stageId]: (prev[stageId] ?? 0) + 1 }));
    });
  };

  const correctCount = solvedIds.length;
  const totalAttempts = correctCount + wrongAttempts;
  const accuracy = totalAttempts > 0 ? Math.round((correctCount / totalAttempts) * 100) : 0;

  const completedSections: CompetitionSectionKey[] = [];
  if (solvedIds.some((id) => id.startsWith('dragdrop:'))) completedSections.push('dragdrop');
  if (solvedIds.some((id) => id.startsWith('shape:'))) completedSections.push('shape');
  if (solvedIds.some((id) => id.startsWith('quiz:'))) completedSections.push('quiz');
  if (solvedIds.some((id) => id.startsWith('function:'))) completedSections.push('function');
  if (solvedIds.some((id) => id.startsWith('custom:'))) completedSections.push('custom');

  const quizDone = quizStep >= allQuizQuestions.length;
  const shapeDone = shapeStep >= SHAPE_GAME_ITEMS.length;
  const funcDone = funcStep >= FUNCTION_GAME_ITEMS.length;

  const currentQuizItem = !quizDone ? allQuizQuestions[quizStep] : null;
  const currentShapeItem = !shapeDone ? SHAPE_GAME_ITEMS[shapeStep] : null;
  const currentFuncItem = !funcDone ? FUNCTION_GAME_ITEMS[funcStep] : null;

  const tabs: { id: ChallengeMode; label: string; done?: boolean }[] = [
    {
      id: 'quiz',
      label: `1. Trắc nghiệm (${Math.min(quizStep, allQuizQuestions.length)}/${allQuizQuestions.length})`,
      done: quizDone,
    },
    {
      id: 'shape',
      label: `2. Hình dạng 3D (${Math.min(shapeStep, SHAPE_GAME_ITEMS.length)}/${SHAPE_GAME_ITEMS.length})`,
      done: shapeDone,
    },
    {
      id: 'function',
      label: `3. Đoán chức năng (${Math.min(funcStep, FUNCTION_GAME_ITEMS.length)}/${FUNCTION_GAME_ITEMS.length})`,
      done: funcDone,
    },
    { id: 'dragdrop', label: '4. Kéo thả 3D' },
    ...customStages.map((st, idx) => {
      const step = customSteps[st.type.id] ?? 0;
      const done = step >= st.questions.length;
      return {
        id: `custom:${st.type.id}` as ChallengeMode,
        label: `${5 + idx}. ${st.type.title} (${Math.min(step, st.questions.length)}/${st.questions.length})`,
        done,
      };
    }),
    { id: 'leaderboard', label: `${5 + customStages.length}. Nộp bài & Xếp hạng` },
  ];

  // =========================================================================
  // SCREEN 0: DEDICATED TEACHER PORTAL (NO STUDENT QUIZ / NO SUBMISSION UI!)
  // =========================================================================
  if (screen === 'teacher' || isTeacherSignedIn) {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            {!isTeacherSignedIn ? (
              <button
                type="button"
                onClick={() => {
                  labSound.playSelect();
                  setScreen('entry');
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap shrink-0"
              >
                <ArrowLeft className="h-4 w-4" />
                Về giao diện Học sinh
              </button>
            ) : (
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
            )}
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Cổng Giáo viên · Quản lý lớp, Câu hỏi & Thống kê
              </h1>
              <p className="text-xs text-slate-600 sm:text-sm">
                Quản lý danh sách lớp, bổ sung dạng câu hỏi & câu hỏi thử thách, theo dõi thống kê và bảng xếp hạng
              </p>
            </div>
          </div>
        </div>

        <CompetitionBoard
          score={0}
          correctCount={0}
          totalQuestions={totalChallengesCount}
          accuracy={0}
          bestStreak={0}
          durationSec={0}
          completedSections={[]}
          activeStudent={null}
          initialTab="teacher"
          teacherOnlyMode={true}
          hasSubmitted={false}
          onSubmitted={() => {}}
          onResetForNewStudent={() => setScreen('entry')}
        />
      </div>
    );
  }

  // =========================================================================
  // SCREEN A: STANDALONE PUBLIC RANKINGS VIEW FROM ENTRY
  // =========================================================================
  if (screen === 'board') {
    return (
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                setScreen('entry');
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-sm font-medium text-slate-700 transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap shrink-0"
            >
              <ArrowLeft className="h-4 w-4" />
              Chọn lớp & Bắt đầu thử thách
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                03. Thử thách kiến thức · Bảng xếp hạng Lớp & Khối
              </h1>
              <p className="text-xs text-slate-600 sm:text-sm">
                Xem bảng xếp hạng Top 3 từng lớp, chi tiết theo lớp và thi đua theo khối
              </p>
            </div>
          </div>
        </div>

        <CompetitionBoard
          score={score}
          correctCount={correctCount}
          totalQuestions={totalChallengesCount}
          accuracy={accuracy}
          bestStreak={bestStreak}
          durationSec={elapsedSec}
          completedSections={completedSections}
          activeStudent={null}
          initialTab={boardInitialTab}
          initialRankClassId={boardInitialClassId}
          hasSubmitted={false}
          onSubmitted={() => {}}
          onResetForNewStudent={() => setScreen('entry')}
        />
      </div>
    );
  }

  // =========================================================================
  // SCREEN B: PRE-CHALLENGE CLASS & STUDENT SELECTION (STUDENTS ONLY)
  // =========================================================================
  if (screen === 'entry') {
    const quizTotalPoints = allQuizQuestions.reduce((acc, q) => acc + q.points, 0);

    return (
      <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1280px] flex-col px-4 py-6 sm:px-6 lg:px-8">
        {/* Top Row */}
        <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
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
                03. Thử thách kiến thức & Thi đua lớp học
              </h1>
              <p className="text-xs text-slate-600 sm:text-sm">
                Chọn đúng Lớp học và Họ tên của em từ danh sách để bắt đầu làm bài tính điểm và thời gian
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                setBoardInitialClassId(undefined);
                setBoardInitialTab('rankings');
                setScreen('board');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-3.5 py-2 text-xs font-bold text-amber-900 transition-colors hover:bg-amber-100 whitespace-nowrap"
            >
              <Trophy className="h-4 w-4" />
              Bảng xếp hạng
            </button>
            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                setScreen('teacher');
              }}
              className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-emerald-50 px-3.5 py-2 text-xs font-bold text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap"
            >
              <GraduationCap className="h-4 w-4" />
              Giáo viên (Quản lý)
            </button>
          </div>
        </div>

        {/* 2-Column Balanced Pre-Challenge Setup */}
        <div className="grid grid-cols-1 items-stretch gap-6 lg:grid-cols-12">
          {/* Primary Focus: Select Class & Student Name from Firestore */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-7">
            <div>
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-lg font-bold text-slate-900">
                  Bước chuẩn bị · Chọn lớp và tên học sinh
                </h2>
                <span className="text-xs font-semibold text-slate-500 font-mono-num">
                  {classes.length} lớp đang mở
                </span>
              </div>
              <p className="mt-1 text-sm text-slate-600">
                Học sinh <strong>không cần đăng nhập</strong>. Hãy chọn lớp và bấm vào tên của em trong danh sách lớp bên dưới.
              </p>

              {loadingClasses ? (
                <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-8 text-center text-sm text-slate-600">
                  Đang tải danh sách lớp và học sinh từ hệ thống...
                </div>
              ) : classes.length === 0 ? (
                <div className="mt-6 rounded-xl border border-amber-200 bg-amber-50 p-6">
                  <p className="text-base font-bold text-amber-950">
                    Chưa có danh sách lớp học nào trong hệ thống
                  </p>
                  <p className="mt-1.5 text-sm leading-relaxed text-amber-900">
                    Giáo viên cần đăng nhập vào <strong>Cổng Giáo viên</strong> để nhập danh sách lớp trước khi học sinh chọn tên bắt đầu thử thách.
                  </p>
                  <button
                    type="button"
                    onClick={() => {
                      labSound.playSelect();
                      setScreen('teacher');
                    }}
                    className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
                  >
                    <GraduationCap className="h-4 w-4" />
                    Mở Cổng Giáo viên để nhập danh sách lớp
                  </button>
                </div>
              ) : (
                <div className="mt-5 space-y-5">
                  <div>
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-xs font-bold text-slate-800">1. Chọn Lớp học</span>
                      {availableGrades.length > 1 && (
                        <div className="flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() => setSelectedGradeFilter('all')}
                            className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                              selectedGradeFilter === 'all'
                                ? 'bg-slate-800 text-white'
                                : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                            }`}
                          >
                            Tất cả
                          </button>
                          {availableGrades.map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => {
                                setSelectedGradeFilter(g);
                                const firstInGrade = classes.find((c) => c.grade === g);
                                if (firstInGrade) {
                                  setPickedClassId(firstInGrade.id);
                                  setPickedStudentName('');
                                  setRosterSearch('');
                                }
                              }}
                              className={`rounded-lg px-2.5 py-1 text-xs font-bold transition-colors ${
                                selectedGradeFilter === g
                                  ? 'bg-sky-700 text-white'
                                  : 'bg-slate-100 text-slate-600 hover:bg-slate-200'
                              }`}
                            >
                              Khối {g}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>

                    <div className="mt-2.5 flex flex-wrap gap-2">
                      {filteredClasses.map((cls) => {
                        const isSelected = cls.id === pickedClassId;
                        return (
                          <button
                            key={cls.id}
                            type="button"
                            onClick={() => {
                              labSound.playSelect();
                              setPickedClassId(cls.id);
                              setPickedStudentName('');
                              setRosterSearch('');
                            }}
                            className={`rounded-xl border px-4 py-2.5 text-left transition-all ${
                              isSelected
                                ? 'border-sky-700 bg-sky-700 text-white shadow-xs'
                                : 'border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-400 hover:bg-white'
                            }`}
                          >
                            <p className="text-sm font-bold whitespace-nowrap">Lớp {cls.className}</p>
                            <p
                              className={`text-[11px] font-mono-num whitespace-nowrap ${
                                isSelected ? 'text-sky-100' : 'text-slate-500'
                              }`}
                            >
                              Khối {cls.grade} · {cls.students.length} HS
                            </p>
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  {selectedEntryClass && (
                    <div>
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-bold text-slate-800">
                          2. Chọn Họ và tên của em trong Lớp {selectedEntryClass.className}
                        </span>
                        <div className="relative">
                          <Search className="pointer-events-none absolute top-1/2 left-2.5 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
                          <input
                            type="text"
                            value={rosterSearch}
                            onChange={(e) => setRosterSearch(e.target.value)}
                            placeholder="Tìm tên nhanh..."
                            className="w-44 rounded-lg border border-slate-300 bg-white py-1.5 pr-2.5 pl-8 text-xs text-slate-800 focus:border-sky-600 focus:outline-none sm:w-52"
                          />
                        </div>
                      </div>

                      {filteredEntryStudents.length === 0 ? (
                        <p className="mt-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-center text-xs text-slate-500">
                          Không tìm thấy học sinh nào khớp với “{rosterSearch}”.
                        </p>
                      ) : (
                        <div className="mt-2.5 grid max-h-64 grid-cols-1 gap-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50/70 p-2.5 sm:grid-cols-2">
                          {filteredEntryStudents.map((name, idx) => {
                            const isPicked = pickedStudentName === name;
                            return (
                              <button
                                key={name}
                                type="button"
                                onClick={() => {
                                  labSound.playSelect();
                                  setPickedStudentName(name);
                                }}
                                className={`flex items-center justify-between gap-2 rounded-xl border px-3 py-2.5 text-left text-sm font-semibold transition-all ${
                                  isPicked
                                    ? 'border-sky-700 bg-sky-700 text-white shadow-xs'
                                    : 'border-slate-200 bg-white text-slate-800 hover:border-sky-400 hover:bg-sky-50/60'
                                }`}
                              >
                                <span className="flex items-center gap-2 truncate">
                                  <span
                                    className={`text-xs font-mono-num ${
                                      isPicked ? 'text-sky-200' : 'text-slate-400'
                                    }`}
                                  >
                                    {idx + 1}.
                                  </span>
                                  <span className="truncate">{name}</span>
                                </span>
                                {isPicked && <UserCheck className="h-4 w-4 shrink-0 text-white" />}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {classes.length > 0 && (
              <div className="mt-6 flex flex-wrap items-center justify-between gap-3 border-t border-slate-100 pt-5">
                <div className="text-xs text-slate-600">
                  {pickedStudentName && selectedEntryClass ? (
                    <span>
                      Đã chọn: <strong className="text-slate-900">{pickedStudentName}</strong> ·{' '}
                      <strong className="text-sky-800">Lớp {selectedEntryClass.className}</strong>
                    </span>
                  ) : (
                    <span>Vui lòng chọn tên của em để mở nút bắt đầu</span>
                  )}
                </div>

                <button
                  type="button"
                  disabled={!pickedStudentName || !selectedEntryClass}
                  onClick={handleStartChallenge}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-45 whitespace-nowrap"
                >
                  <Play className="h-4 w-4" />
                  Bắt đầu thử thách
                </button>
              </div>
            )}
          </div>

          {/* Right Info Card: Dynamic Challenge Structure */}
          <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 shadow-xs lg:col-span-5">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Cấu trúc & Cách tính xếp hạng</h2>
              <p className="mt-1 text-sm text-slate-600">
                Thử thách gồm <strong>{totalChallengesCount} nhiệm vụ</strong> chia làm{' '}
                <strong>{4 + customStages.length} chặng</strong>. Câu hỏi sẽ{' '}
                <strong>tự động chuyển tiếp</strong> ngay khi em chọn đáp án.
              </p>

              <div className="mt-5 divide-y divide-slate-100 border-t border-b border-slate-100">
                <div className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-slate-800">Chặng 1 · Trắc nghiệm kiến thức</span>
                  <span className="text-xs font-semibold text-sky-700 font-mono-num">
                    {allQuizQuestions.length} câu · {quizTotalPoints}đ
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-slate-800">Chặng 2 · Nhận diện hình dạng 3D</span>
                  <span className="text-xs font-semibold text-sky-700 font-mono-num">
                    {SHAPE_GAME_ITEMS.length} câu · 50đ
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-slate-800">Chặng 3 · Đoán bộ phận theo chức năng</span>
                  <span className="text-xs font-semibold text-sky-700 font-mono-num">
                    {FUNCTION_GAME_ITEMS.length} câu · 60đ
                  </span>
                </div>
                <div className="flex items-center justify-between py-2.5 text-sm">
                  <span className="font-semibold text-slate-800">Chặng 4 · Kéo thả cấu tạo tế bào 3D</span>
                  <span className="text-xs font-semibold text-sky-700 font-mono-num">
                    {ANATOMY_PARTS.length} vị trí · 120đ
                  </span>
                </div>
                {customStages.map((st, idx) => {
                  const pts = st.questions.reduce((acc, q) => acc + q.points, 0);
                  return (
                    <div key={st.type.id} className="flex items-center justify-between py-2.5 text-sm">
                      <span className="font-semibold text-emerald-900">
                        Chặng {5 + idx} · {st.type.title}
                      </span>
                      <span className="text-xs font-semibold text-emerald-700 font-mono-num">
                        {st.questions.length} câu · {pts}đ
                      </span>
                    </div>
                  );
                })}
              </div>

              <div className="mt-5 space-y-2.5 text-xs leading-relaxed text-slate-600">
                <p className="flex items-start gap-2">
                  <Clock className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <span>
                    <strong>Đồng hồ bấm giờ tự động:</strong> Bắt đầu tính ngay khi em bấm <em>Bắt đầu thử thách</em> và dừng lại khi em bấm <em>Nộp bài</em>.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Trophy className="mt-0.5 h-4 w-4 shrink-0 text-amber-600" />
                  <span>
                    <strong>Tiêu chí xếp hạng:</strong> Học sinh có <strong>số điểm cao hơn</strong> xếp trên; nếu bằng điểm, học sinh có <strong>thời gian hoàn thành nhanh hơn</strong> xếp trên.
                  </span>
                </p>
                <p className="flex items-start gap-2">
                  <Users className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                  <span>
                    <strong>Thi đua Lớp & Khối:</strong> Kết quả được tổng hợp tự động vào bảng xếp hạng của lớp, khối và bảng thống kê của Giáo viên.
                  </span>
                </p>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-2.5 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => {
                  labSound.playSelect();
                  setBoardInitialClassId(undefined);
                  setBoardInitialTab('rankings');
                  setScreen('board');
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 hover:border-amber-400 hover:bg-amber-50 hover:text-amber-900 whitespace-nowrap"
              >
                <Trophy className="h-4 w-4 text-amber-600" />
                Xem bảng xếp hạng
              </button>
              <button
                type="button"
                onClick={() => {
                  labSound.playSelect();
                  setScreen('teacher');
                }}
                className="inline-flex flex-1 items-center justify-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-4 py-2.5 text-xs font-bold text-slate-800 hover:border-emerald-500 hover:bg-emerald-50 hover:text-emerald-900 whitespace-nowrap"
              >
                <GraduationCap className="h-4 w-4 text-emerald-700" />
                Cổng Giáo viên
              </button>
            </div>
          </div>
        </div>

        {/* Live Top 3 Leaderboard per Class right inside Challenge Hub */}
        {classes.length > 0 && (
          <div className="mt-6">
            <ClassTop3Leaderboard
              classes={classes}
              bestSubmissions={bestSubmissions}
              loading={loadingClasses}
              onSelectClassDetail={(clsId) => {
                labSound.playSelect();
                setBoardInitialClassId(clsId);
                setBoardInitialTab('rankings');
                setScreen('board');
              }}
            />
          </div>
        )}
      </div>
    );
  }

  // =========================================================================
  // SCREEN C: ACTIVE TIMED CHALLENGE WORKSPACE (STUDENTS ONLY)
  // =========================================================================
  const activeCustomStageIdx = mode.startsWith('custom:')
    ? customStages.findIndex((s) => `custom:${s.type.id}` === mode)
    : -1;
  const activeCustomStage = activeCustomStageIdx >= 0 ? customStages[activeCustomStageIdx] : null;
  const activeCustomStep = activeCustomStage ? customSteps[activeCustomStage.type.id] ?? 0 : 0;
  const activeCustomDone = activeCustomStage
    ? activeCustomStep >= activeCustomStage.questions.length
    : false;
  const activeCustomQuestion =
    activeCustomStage && !activeCustomDone
      ? activeCustomStage.questions[activeCustomStep]
      : null;

  return (
    <div className="mx-auto flex min-h-[calc(100vh-64px)] max-w-[1440px] flex-col px-4 py-5 sm:px-6 lg:px-8">
      <FireworksCanvas burstKey={burstKey} />

      {/* Top Header + Active Student Identity + Live Timer + Score */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => {
              labSound.playSelect();
              handleResetForNewStudent();
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-700 transition-colors hover:border-sky-400 hover:text-sky-800 whitespace-nowrap shrink-0 sm:text-sm"
          >
            <ArrowLeft className="h-4 w-4" />
            Đổi học sinh
          </button>
          <div>
            <h1 className="text-lg font-bold text-slate-900 sm:text-xl">
              03. Thử thách kiến thức & Thi đua
            </h1>
            {activeStudent && (
              <p className="text-xs font-semibold text-sky-800 sm:text-sm">
                {activeStudent.studentName} · Lớp {activeStudent.className} (Khối {activeStudent.grade})
              </p>
            )}
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-3 text-sm font-semibold text-slate-800 font-mono-num">
          <span className="inline-flex items-center gap-1.5 text-emerald-700">
            <Clock className="h-4 w-4" />
            {formatDuration(elapsedSec)}
          </span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5 text-amber-700">
            <Trophy className="h-4 w-4" />
            Điểm: {score}
          </span>
          <span className="text-slate-300" aria-hidden="true">·</span>
          <span className="inline-flex items-center gap-1.5 text-sky-700">
            <Award className="h-4 w-4" />
            Đúng: {correctCount}/{totalChallengesCount}
          </span>
          {mode !== 'leaderboard' && (
            <button
              type="button"
              onClick={() => switchMode('leaderboard')}
              className="inline-flex items-center gap-1.5 rounded-xl bg-sky-700 px-3.5 py-2 text-xs font-bold text-white shadow-xs transition-colors hover:bg-sky-800 whitespace-nowrap"
            >
              <Send className="h-3.5 w-3.5" />
              {hasSubmitted ? 'Xem xếp hạng' : 'Nộp bài thi đua'}
            </button>
          )}
        </div>
      </div>

      {/* Challenge Stage Tabs (Dynamic: Built-in 1..4 + Teacher Custom Stages + Submit/Ranking) */}
      <div className="mb-4 flex flex-wrap items-center gap-1.5 rounded-2xl border border-slate-200 bg-white p-1.5">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => switchMode(tab.id)}
            className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap sm:text-sm ${
              mode === tab.id
                ? tab.id === 'leaderboard'
                  ? 'bg-amber-600 text-white'
                  : tab.id.startsWith('custom:')
                  ? 'bg-emerald-700 text-white'
                  : 'bg-sky-700 text-white'
                : tab.done
                ? 'bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                : 'text-slate-700 hover:bg-slate-100'
            }`}
          >
            {tab.done && mode !== tab.id && <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />}
            {tab.label}
          </button>
        ))}
      </div>

      {/* Live Feedback Banner */}
      {feedback && mode !== 'leaderboard' && (
        <div
          className={`mb-4 flex items-start gap-3 rounded-xl border px-4 py-3 text-sm ${
            feedback.type === 'correct'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-amber-300 bg-amber-50 text-amber-950'
          }`}
          role="status"
        >
          {feedback.type === 'correct' ? (
            <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
          ) : (
            <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          )}
          <p className="font-medium leading-relaxed">{feedback.message}</p>
        </div>
      )}

      {/* Active Stage Workspace */}
      <div className="flex-1">
        {/* 1. Multiple Choice Scientific Quiz (+ Teacher extras in 'quiz') */}
        {mode === 'quiz' && (
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            {quizDone || !currentQuizItem ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-3 text-xl font-bold text-slate-900">
                  Hoàn thành Chặng 1 · Trắc nghiệm kiến thức!
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Em đã trả lời xong toàn bộ {allQuizQuestions.length} câu hỏi trắc nghiệm. Hãy chuyển sang chặng tiếp theo để tích thêm điểm.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => switchMode('shape')}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                  >
                    Sang Chặng 2: Nhận diện hình dạng 3D
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('leaderboard')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Send className="h-4 w-4" />
                    Nộp bài ngay
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold text-sky-700 font-mono-num">
                  <span>Chặng 1 · Trắc nghiệm kiến thức vi sinh</span>
                  <span>
                    Câu {quizStep + 1} / {allQuizQuestions.length} · +{currentQuizItem.points}đ
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all duration-300"
                    style={{ width: `${((quizStep + 1) / allQuizQuestions.length) * 100}%` }}
                  />
                </div>

                <h2 className="mt-4 text-xl font-bold text-slate-900">{currentQuizItem.question}</h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bấm chọn 1 đáp án — hệ thống sẽ tự động chuyển sang câu tiếp theo
                </p>

                <div className="mt-5 space-y-3">
                  {currentQuizItem.options.map((opt, idx) => {
                    const key = String(idx);
                    const isPicked = choiceLock?.selectedKey === key;
                    const isRightChoice = choiceLock?.correctKey === key;
                    let stateClasses =
                      'border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-500 hover:bg-sky-50';
                    if (choiceLock) {
                      if (isRightChoice) {
                        stateClasses = 'border-emerald-600 bg-emerald-50 text-emerald-950';
                      } else if (isPicked && !choiceLock.isCorrect) {
                        stateClasses = 'border-rose-500 bg-rose-50 text-rose-950';
                      } else {
                        stateClasses = 'border-slate-200 bg-slate-50 text-slate-400 opacity-70';
                      }
                    }

                    return (
                      <button
                        key={`${currentQuizItem.id}_${idx}`}
                        type="button"
                        disabled={Boolean(choiceLock)}
                        onClick={() => handleAnswerQuiz(idx)}
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-3.5 text-left text-sm font-medium transition-colors ${stateClasses}`}
                      >
                        <span className="flex items-start gap-3">
                          <span className="font-mono-num font-bold text-sky-700">
                            {String.fromCharCode(65 + idx)}.
                          </span>
                          <span>{opt}</span>
                        </span>
                        {choiceLock && isRightChoice && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        )}
                        {choiceLock && isPicked && !choiceLock.isCorrect && (
                          <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* 2. Identify 3D Shape */}
        {mode === 'shape' &&
          (shapeDone || !currentShapeItem ? (
            <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-8 text-center">
              <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
              <h2 className="mt-3 text-xl font-bold text-slate-900">
                Hoàn thành Chặng 2 · Nhận diện hình dạng 3D!
              </h2>
              <p className="mt-1.5 text-sm text-slate-600">
                Em đã hoàn thành cả {SHAPE_GAME_ITEMS.length} mẫu quan sát 3D.
              </p>
              <div className="mt-6 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={() => switchMode('function')}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                >
                  Sang Chặng 3: Đoán chức năng
                  <ArrowRight className="h-4 w-4" />
                </button>
                <button
                  type="button"
                  onClick={() => switchMode('leaderboard')}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <Send className="h-4 w-4" />
                  Nộp bài ngay
                </button>
              </div>
            </div>
          ) : (
            <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
              <div
                className={`relative min-h-[380px] overflow-hidden rounded-2xl border border-slate-200 lg:col-span-7 lg:min-h-[480px] ${
                  currentShapeItem.shapeType === 'coccus' &&
                  currentShapeItem.coccusVariant === 'strepto'
                    ? 'bio-stage-bg bio-stage-bg-emerald'
                    : 'bio-stage-bg'
                }`}
              >
                <SpecimenStage3D
                  shapeType={currentShapeItem.shapeType}
                  rodVariant={currentShapeItem.rodVariant}
                  coccusVariant={currentShapeItem.coccusVariant}
                  autoRotate={true}
                />
              </div>
              <div className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-white p-6 lg:col-span-5">
                <div>
                  <div className="flex items-center justify-between text-xs font-semibold text-sky-700 font-mono-num">
                    <span>Chặng 2 · Nhận diện hình dạng 3D</span>
                    <span>
                      Câu {shapeStep + 1} / {SHAPE_GAME_ITEMS.length}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                    <div
                      className="h-full rounded-full bg-sky-600 transition-all duration-300"
                      style={{ width: `${((shapeStep + 1) / SHAPE_GAME_ITEMS.length) * 100}%` }}
                    />
                  </div>

                  <h2 className="mt-3 text-lg font-bold text-slate-900">{currentShapeItem.prompt}</h2>
                  <p className="mt-1 text-xs text-slate-500">
                    Bấm chọn đáp án để tự động chuyển sang mẫu 3D tiếp theo
                  </p>

                  <div className="mt-5 space-y-2.5">
                    {currentShapeItem.options.map((opt) => {
                      const isPicked = choiceLock?.selectedKey === opt;
                      const isRightChoice = choiceLock?.correctKey === opt;
                      let stateClasses =
                        'border-slate-200 bg-slate-50 text-slate-800 hover:border-sky-500 hover:bg-sky-50';
                      if (choiceLock) {
                        if (isRightChoice) {
                          stateClasses = 'border-emerald-600 bg-emerald-50 text-emerald-950';
                        } else if (isPicked && !choiceLock.isCorrect) {
                          stateClasses = 'border-rose-500 bg-rose-50 text-rose-950';
                        } else {
                          stateClasses = 'border-slate-200 bg-slate-50 text-slate-400 opacity-70';
                        }
                      }

                      return (
                        <button
                          key={opt}
                          type="button"
                          disabled={Boolean(choiceLock)}
                          onClick={() => handleAnswerShape(opt)}
                          className={`flex w-full items-center justify-between gap-2 rounded-xl border px-4 py-3 text-left text-sm font-semibold transition-colors ${stateClasses}`}
                        >
                          <span>{opt}</span>
                          {choiceLock && isRightChoice && (
                            <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-600" />
                          )}
                          {choiceLock && isPicked && !choiceLock.isCorrect && (
                            <XCircle className="h-4 w-4 shrink-0 text-rose-600" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
            </div>
          ))}

        {/* 3. Guess Function of Bacterial Organelle */}
        {mode === 'function' && (
          <div className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            {funcDone || !currentFuncItem ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-3 text-xl font-bold text-slate-900">
                  Hoàn thành Chặng 3 · Đoán bộ phận theo chức năng!
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Em đã vượt qua cả {FUNCTION_GAME_ITEMS.length} câu hỏi về chức năng tế bào vi khuẩn.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  <button
                    type="button"
                    onClick={() => switchMode('dragdrop')}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                  >
                    Sang Chặng 4: Kéo thả 3D
                    <ArrowRight className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={() => switchMode('leaderboard')}
                    className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                  >
                    <Send className="h-4 w-4" />
                    Nộp bài ngay
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold text-sky-700 font-mono-num">
                  <span className="inline-flex items-center gap-1.5">
                    <HelpCircle className="h-4 w-4" />
                    Chặng 3 · Đoán tên bộ phận theo chức năng
                  </span>
                  <span>
                    Câu {funcStep + 1} / {FUNCTION_GAME_ITEMS.length}
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-sky-600 transition-all duration-300"
                    style={{ width: `${((funcStep + 1) / FUNCTION_GAME_ITEMS.length) * 100}%` }}
                  />
                </div>

                <div className="mt-4 rounded-xl border border-sky-200 bg-sky-50/70 p-5">
                  <p className="text-xs font-semibold text-sky-800">Chức năng của bộ phận là:</p>
                  <p className="mt-1.5 text-lg font-bold text-slate-900">“{currentFuncItem.clue}”</p>
                </div>

                <p className="mt-5 text-sm font-semibold text-slate-700">
                  Chọn đúng thành phần tế bào tương ứng (tự động chuyển câu sau khi chọn):
                </p>
                <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
                  {ANATOMY_PARTS.map((part) => {
                    const isPicked = choiceLock?.selectedKey === part.id;
                    const isRightChoice = choiceLock?.correctKey === part.id;
                    let stateClasses =
                      'border-slate-200 bg-slate-50 hover:border-sky-500 hover:bg-sky-50';
                    if (choiceLock) {
                      if (isRightChoice) {
                        stateClasses = 'border-emerald-600 bg-emerald-50';
                      } else if (isPicked && !choiceLock.isCorrect) {
                        stateClasses = 'border-rose-500 bg-rose-50';
                      } else {
                        stateClasses = 'border-slate-200 bg-slate-50 opacity-65';
                      }
                    }

                    return (
                      <button
                        key={part.id}
                        type="button"
                        disabled={Boolean(choiceLock)}
                        onClick={() => handleAnswerFunction(part.id)}
                        className={`flex flex-col items-start gap-1.5 rounded-xl border p-3.5 text-left transition-colors ${stateClasses}`}
                      >
                        <div className="flex w-full items-center justify-between">
                          <span
                            className="h-3 w-3 rounded-xs"
                            style={{ backgroundColor: part.colorHex }}
                          />
                          {choiceLock && isRightChoice && (
                            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                          )}
                          {choiceLock && isPicked && !choiceLock.isCorrect && (
                            <XCircle className="h-4 w-4 text-rose-600" />
                          )}
                        </div>
                        <span className="text-sm font-bold text-slate-900">{part.name}</span>
                        <span className="text-xs font-medium text-sky-700">{part.englishName}</span>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* 4. Drag & Drop 3D Anatomy */}
        {mode === 'dragdrop' && (
          <DragDropAnatomyGame
            key={sessionResetKey}
            onCorrect={triggerCorrect}
            onWrong={triggerHint}
            onCompleteStage={() =>
              switchMode(
                customStages.length > 0 ? (`custom:${customStages[0].type.id}` as ChallengeMode) : 'leaderboard',
              )
            }
            nextLabel={
              customStages.length > 0
                ? `Sang Chặng 5: ${customStages[0].type.title}`
                : 'Nộp bài thi đua'
            }
          />
        )}

        {/* 5+. Teacher-Created Custom Question Stages (Auto-Advance on Click!) */}
        {activeCustomStage && (
          <div className="mx-auto max-w-3xl rounded-2xl border border-slate-200 bg-white p-6 sm:p-8">
            {activeCustomDone || !activeCustomQuestion ? (
              <div className="py-6 text-center">
                <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
                <h2 className="mt-3 text-xl font-bold text-slate-900">
                  Hoàn thành Chặng {5 + activeCustomStageIdx} · {activeCustomStage.type.title}!
                </h2>
                <p className="mt-1.5 text-sm text-slate-600">
                  Em đã trả lời xong toàn bộ {activeCustomStage.questions.length} câu hỏi trong chặng này.
                </p>
                <div className="mt-6 flex flex-wrap justify-center gap-3">
                  {activeCustomStageIdx + 1 < customStages.length ? (
                    <button
                      type="button"
                      onClick={() =>
                        switchMode(
                          `custom:${customStages[activeCustomStageIdx + 1].type.id}` as ChallengeMode,
                        )
                      }
                      className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800"
                    >
                      Sang Chặng {6 + activeCustomStageIdx}: {customStages[activeCustomStageIdx + 1].type.title}
                      <ArrowRight className="h-4 w-4" />
                    </button>
                  ) : null}
                  <button
                    type="button"
                    onClick={() => switchMode('leaderboard')}
                    className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                  >
                    <Send className="h-4 w-4" />
                    Nộp bài thi đua ngay
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between text-xs font-semibold text-emerald-700 font-mono-num">
                  <span>
                    Chặng {5 + activeCustomStageIdx} · {activeCustomStage.type.title}
                  </span>
                  <span>
                    Câu {activeCustomStep + 1} / {activeCustomStage.questions.length} · +
                    {activeCustomQuestion.points}đ
                  </span>
                </div>
                <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
                  <div
                    className="h-full rounded-full bg-emerald-600 transition-all duration-300"
                    style={{
                      width: `${((activeCustomStep + 1) / activeCustomStage.questions.length) * 100}%`,
                    }}
                  />
                </div>

                {activeCustomStage.type.description && (
                  <p className="mt-3 text-xs font-medium text-slate-500">
                    {activeCustomStage.type.description}
                  </p>
                )}

                <h2 className="mt-3 text-xl font-bold text-slate-900">
                  {activeCustomQuestion.question}
                </h2>
                <p className="mt-1 text-xs text-slate-500">
                  Bấm chọn đáp án — hệ thống sẽ tự động chuyển sang câu tiếp theo
                </p>

                <div
                  className={`mt-5 ${
                    activeCustomStage.type.format === 'true_false'
                      ? 'grid grid-cols-1 gap-3 sm:grid-cols-2'
                      : 'space-y-3'
                  }`}
                >
                  {activeCustomQuestion.options.map((opt, idx) => {
                    const key = String(idx);
                    const isPicked = choiceLock?.selectedKey === key;
                    const isRightChoice = choiceLock?.correctKey === key;
                    let stateClasses =
                      'border-slate-200 bg-slate-50 text-slate-800 hover:border-emerald-500 hover:bg-emerald-50';
                    if (choiceLock) {
                      if (isRightChoice) {
                        stateClasses = 'border-emerald-600 bg-emerald-50 text-emerald-950';
                      } else if (isPicked && !choiceLock.isCorrect) {
                        stateClasses = 'border-rose-500 bg-rose-50 text-rose-950';
                      } else {
                        stateClasses = 'border-slate-200 bg-slate-50 text-slate-400 opacity-70';
                      }
                    }

                    return (
                      <button
                        key={`${activeCustomQuestion.id}_${idx}`}
                        type="button"
                        disabled={Boolean(choiceLock)}
                        onClick={() =>
                          handleAnswerCustomQuestion(
                            activeCustomStage.type.id,
                            activeCustomQuestion,
                            idx,
                          )
                        }
                        className={`flex w-full items-center justify-between gap-3 rounded-xl border px-4 py-4 text-left text-sm font-semibold transition-colors ${stateClasses}`}
                      >
                        <span className="flex items-start gap-3">
                          {activeCustomStage.type.format === 'multiple_choice' && (
                            <span className="font-mono-num font-bold text-emerald-700">
                              {String.fromCharCode(65 + idx)}.
                            </span>
                          )}
                          <span>{opt}</span>
                        </span>
                        {choiceLock && isRightChoice && (
                          <CheckCircle2 className="h-5 w-5 shrink-0 text-emerald-600" />
                        )}
                        {choiceLock && isPicked && !choiceLock.isCorrect && (
                          <XCircle className="h-5 w-5 shrink-0 text-rose-600" />
                        )}
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        )}

        {/* Final Tab: Student Submission & Public Rankings */}
        {mode === 'leaderboard' && (
          <CompetitionBoard
            score={score}
            correctCount={correctCount}
            totalQuestions={totalChallengesCount}
            accuracy={accuracy}
            bestStreak={bestStreak}
            durationSec={elapsedSec}
            completedSections={completedSections}
            activeStudent={activeStudent}
            initialTab="student"
            hasSubmitted={hasSubmitted}
            onSubmitted={() => setHasSubmitted(true)}
            onResetForNewStudent={handleResetForNewStudent}
          />
        )}
      </div>
    </div>
  );
}

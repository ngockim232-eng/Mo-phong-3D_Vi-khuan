import { useEffect, useMemo, useState } from 'react';
import { onIdTokenChanged, type User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
import {
  Award,
  BarChart3,
  BookOpenCheck,
  CheckCircle2,
  ClipboardList,
  Clock,
  Download,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FilePlus2,
  GraduationCap,
  KeyRound,
  Lock,
  LogIn,
  LogOut,
  Mail,
  Medal,
  Plus,
  RefreshCw,
  RotateCcw,
  Send,
  ShieldCheck,
  Trash2,
  Trophy,
  UserCheck,
  Users,
  UserX,
} from 'lucide-react';
import {
  ADMIN_EMAIL,
  auth,
  db,
  FIREBASE_PROJECT_ID,
  formatFirebaseAuthError,
  handleFirestoreError,
  isAuthorizedTeacherEmail,
  isTeacherUser,
  isUnverifiedTeacherUser,
  OperationType,
  registerTeacherWithEmailPassword,
  reloadTeacherUser,
  resendTeacherVerificationEmail,
  sendTeacherPasswordReset,
  signInTeacherWithEmailPassword,
  signInWithGoogle,
  signOutUser,
  type ClassRoster,
  type CompetitionSectionKey,
  type StudentSubmission,
} from '../firebase';
import { labSound } from '../utils/sound';
import { ClassTop3Leaderboard } from './ClassTop3Leaderboard';
import { TeacherQuestionManager } from './TeacherQuestionManager';

export interface ActiveStudentSession {
  classId: string;
  className: string;
  grade: number;
  studentName: string;
}

export type BoardTab = 'student' | 'rankings' | 'teacher';

interface CompetitionBoardProps {
  score: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  durationSec: number;
  completedSections: CompetitionSectionKey[];
  activeStudent: ActiveStudentSession | null;
  initialTab?: BoardTab;
  initialRankClassId?: string;
  teacherOnlyMode?: boolean;
  hasSubmitted: boolean;
  onSubmitted: () => void;
  onResetForNewStudent: () => void;
}

type RankingScope = 'top3' | 'class' | 'grade';
type TeacherSubTab = 'rosters' | 'questions' | 'analytics' | 'rankings';

const GRADES = [6, 7, 8, 9] as const;

const SECTION_LABELS: Record<CompetitionSectionKey, string> = {
  dragdrop: 'Kéo thả 3D',
  shape: 'Hình dạng',
  quiz: 'Trắc nghiệm',
  function: 'Chức năng',
  custom: 'Mở rộng GV',
};

const SAMPLE_ROSTERS: { grade: number; className: string; students: string[] }[] = [
  {
    grade: 6,
    className: '6A1',
    students: [
      'Nguyễn Minh Anh',
      'Trần Gia Bảo',
      'Lê Hoàng Châu',
      'Phạm Đức Duy',
      'Võ Ngọc Hân',
      'Đặng Quốc Khánh',
      'Bùi Thảo Linh',
      'Hoàng Tuấn Minh',
    ],
  },
  {
    grade: 6,
    className: '6A2',
    students: [
      'Đỗ Hải Nam',
      'Ngô Bảo Ngọc',
      'Vũ Trọng Nhân',
      'Phan Phương Nhi',
      'Dương Minh Quân',
      'Lý Kim Thanh',
      'Trịnh Gia Thịnh',
      'Huỳnh Yến Vy',
    ],
  },
];

export function formatDuration(totalSec: number): string {
  if (!Number.isFinite(totalSec) || totalSec <= 0) return '—';
  const rounded = Math.max(1, Math.round(totalSec));
  const mins = Math.floor(rounded / 60);
  const secs = rounded % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

function parseStudentLines(rawText: string): string[] {
  const seen = new Set<string>();
  const result: string[] = [];
  for (const rawLine of rawText.split(/\r?\n/)) {
    const cleaned = rawLine
      .replace(/^\s*\d+[\.\)\-\:\s]+/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (cleaned.length < 2 || cleaned.length > 60) continue;
    const key = cleaned.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    result.push(cleaned);
    if (result.length >= 60) break;
  }
  return result;
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

function formatDateTime(ts: StudentSubmission['submittedAt']): string {
  if (!ts) return 'Vừa xong';
  try {
    return ts.toDate().toLocaleString('vi-VN', {
      hour: '2-digit',
      minute: '2-digit',
      day: '2-digit',
      month: '2-digit',
    });
  } catch {
    return 'Vừa xong';
  }
}

/**
 * Rank primarily by higher score, secondarily by faster completion time (lower durationSec),
 * then higher accuracy, higher correctCount, and earlier submission timestamp.
 */
export function sortSubmissions(list: StudentSubmission[]): StudentSubmission[] {
  return [...list].sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    const aDur = a.durationSec > 0 ? a.durationSec : Number.MAX_SAFE_INTEGER;
    const bDur = b.durationSec > 0 ? b.durationSec : Number.MAX_SAFE_INTEGER;
    if (aDur !== bDur) return aDur - bDur;
    if (b.accuracy !== a.accuracy) return b.accuracy - a.accuracy;
    if (b.correctCount !== a.correctCount) return b.correctCount - a.correctCount;
    const aTime = a.submittedAt ? a.submittedAt.toMillis() : Number.MAX_SAFE_INTEGER;
    const bTime = b.submittedAt ? b.submittedAt.toMillis() : Number.MAX_SAFE_INTEGER;
    return aTime - bTime;
  });
}

export function bestSubmissionsPerStudent(list: StudentSubmission[]): StudentSubmission[] {
  const sorted = sortSubmissions(list);
  const map = new Map<string, StudentSubmission>();
  for (const sub of sorted) {
    const key = `${sub.classId}::${sub.studentName.toLowerCase()}`;
    if (!map.has(key)) {
      map.set(key, sub);
    }
  }
  return sortSubmissions(Array.from(map.values()));
}

function downloadCsvFile(filename: string, headers: string[], rows: (string | number)[][]) {
  const escapeCell = (val: string | number) => `"${String(val).replace(/"/g, '""')}"`;
  const csv = [headers.map(escapeCell).join(','), ...rows.map((r) => r.map(escapeCell).join(','))].join(
    '\r\n',
  );
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  document.body.removeChild(anchor);
  URL.revokeObjectURL(url);
}

export function CompetitionBoard({
  score,
  correctCount,
  totalQuestions,
  accuracy,
  bestStreak,
  durationSec,
  completedSections,
  activeStudent,
  initialTab = 'student',
  initialRankClassId,
  teacherOnlyMode = false,
  hasSubmitted,
  onSubmitted,
  onResetForNewStudent,
}: CompetitionBoardProps) {
  const [activeTab, setActiveTab] = useState<BoardTab>(
    teacherOnlyMode ? 'teacher' : initialTab,
  );

  useEffect(() => {
    setActiveTab(teacherOnlyMode ? 'teacher' : initialTab);
  }, [initialTab, teacherOnlyMode]);

  // Shared Firestore real-time state (NO student login required)
  const [classes, setClasses] = useState<ClassRoster[]>([]);
  const [submissions, setSubmissions] = useState<StudentSubmission[]>([]);
  const [loadingData, setLoadingData] = useState(true);
  const [fatalError, setFatalError] = useState<Error | null>(null);

  // Teacher auth state (only the single authorized Teacher Gmail is allowed)
  const [user, setUser] = useState<User | null>(
    isAuthorizedTeacherEmail(auth.currentUser?.email) ? auth.currentUser : null,
  );
  const [authReady, setAuthReady] = useState(false);
  const [authBusy, setAuthBusy] = useState(false);
  const [authMode, setAuthMode] = useState<'signin' | 'register'>('signin');
  const [loginEmail, setLoginEmail] = useState(ADMIN_EMAIL);
  const [loginPassword, setLoginPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [needsEmailProviderEnable, setNeedsEmailProviderEnable] = useState(false);
  const [, setVerifyTick] = useState(0);

  // Student submission form state (auto-synced with activeStudent)
  const [studentClassId, setStudentClassId] = useState(activeStudent?.classId ?? '');
  const [studentName, setStudentName] = useState(activeStudent?.studentName ?? '');
  const [studentSearch, setStudentSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [studentFeedback, setStudentFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);

  // Public Rankings state (default to Top 3 per class overview, or class detail if deep-linked)
  const [rankingScope, setRankingScope] = useState<RankingScope>(
    initialRankClassId ? 'class' : 'top3',
  );
  const [rankClassId, setRankClassId] = useState(
    initialRankClassId ?? activeStudent?.classId ?? '',
  );
  const [rankGrade, setRankGrade] = useState<number>(activeStudent?.grade ?? 6);

  useEffect(() => {
    if (initialRankClassId) {
      setRankClassId(initialRankClassId);
      setRankingScope('class');
    }
  }, [initialRankClassId]);

  // Teacher tab state
  const [teacherSubTab, setTeacherSubTab] = useState<TeacherSubTab>('rosters');
  const [editingClassId, setEditingClassId] = useState<string | null>(null);
  const [formGrade, setFormGrade] = useState<number>(6);
  const [formClassName, setFormClassName] = useState('');
  const [formStudentsText, setFormStudentsText] = useState('');
  const [savingClass, setSavingClass] = useState(false);
  const [teacherFeedback, setTeacherFeedback] = useState<{
    type: 'success' | 'error';
    text: string;
  } | null>(null);
  const [confirmDeleteClassId, setConfirmDeleteClassId] = useState<string | null>(null);
  const [confirmDeleteSubId, setConfirmDeleteSubId] = useState<string | null>(null);
  const [analyticsClassId, setAnalyticsClassId] = useState('');
  const [showAllAttempts, setShowAllAttempts] = useState(false);
  const [teacherRankScope, setTeacherRankScope] = useState<'class' | 'grade'>('grade');
  const [teacherRankGrade, setTeacherRankGrade] = useState<number>(6);
  const [teacherRankClassId, setTeacherRankClassId] = useState('');

  if (fatalError) {
    throw fatalError;
  }

  const isTeacher = isTeacherUser(user);
  const isUnverifiedTeacher = isUnverifiedTeacherUser(user);
  const hideStudentSubmission = teacherOnlyMode || isTeacher;

  // Never keep the Student Submission tab active when in Teacher interface
  useEffect(() => {
    if (hideStudentSubmission && activeTab === 'student') {
      setActiveTab('teacher');
    }
  }, [hideStudentSubmission, activeTab]);

  // Keep student form prefilled when activeStudent changes
  useEffect(() => {
    if (activeStudent) {
      setStudentClassId(activeStudent.classId);
      setStudentName(activeStudent.studentName);
      setRankClassId(activeStudent.classId);
      setRankGrade(activeStudent.grade);
    }
  }, [activeStudent]);

  // Listen to Firebase Auth state — immediately sign out any Gmail other than the single Teacher account
  useEffect(() => {
    const unsub = onIdTokenChanged(auth, (nextUser) => {
      if (nextUser && !isAuthorizedTeacherEmail(nextUser.email)) {
        const rejectedEmail = nextUser.email ?? '';
        setUser(null);
        setAuthReady(true);
        setTeacherFeedback({
          type: 'error',
          text: `Tài khoản ${rejectedEmail || 'này'} không được phép đăng nhập. Hệ thống chỉ cho phép duy nhất tài khoản Giáo viên (${ADMIN_EMAIL}).`,
        });
        void signOutUser();
        return;
      }
      setUser(nextUser);
      setAuthReady(true);
    });
    return unsub;
  }, []);

  // Subscribe to active class rosters (public read - zero login needed for students)
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
        setLoadingData(false);
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

  // Subscribe to public student submissions (public read - zero login needed for students)
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
        setSubmissions(sortSubmissions(list));
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

  // Keep selected class IDs synced when classes load or change
  useEffect(() => {
    if (classes.length === 0) return;
    if (!studentClassId || !classes.some((c) => c.id === studentClassId)) {
      setStudentClassId(activeStudent?.classId ?? classes[0].id);
      if (!activeStudent) setStudentName('');
    }
    if (!rankClassId || !classes.some((c) => c.id === rankClassId)) {
      setRankClassId(activeStudent?.classId ?? classes[0].id);
    }
    if (!analyticsClassId || !classes.some((c) => c.id === analyticsClassId)) {
      setAnalyticsClassId(classes[0].id);
    }
    if (!teacherRankClassId || !classes.some((c) => c.id === teacherRankClassId)) {
      setTeacherRankClassId(classes[0].id);
    }
    if (!classes.some((c) => c.grade === rankGrade)) {
      setRankGrade(classes[0].grade);
    }
    if (!classes.some((c) => c.grade === teacherRankGrade)) {
      setTeacherRankGrade(classes[0].grade);
    }
  }, [
    classes,
    studentClassId,
    rankClassId,
    analyticsClassId,
    teacherRankClassId,
    rankGrade,
    teacherRankGrade,
    activeStudent,
  ]);

  const bestSubmissions = useMemo(() => bestSubmissionsPerStudent(submissions), [submissions]);

  const selectedStudentClass = useMemo(
    () => classes.find((c) => c.id === studentClassId) ?? null,
    [classes, studentClassId],
  );

  const studentBestMap = useMemo(() => {
    const map = new Map<string, StudentSubmission>();
    if (!selectedStudentClass) return map;
    for (const sub of bestSubmissions) {
      if (sub.classId === selectedStudentClass.id) {
        map.set(sub.studentName.toLowerCase(), sub);
      }
    }
    return map;
  }, [bestSubmissions, selectedStudentClass]);

  const filteredRosterStudents = useMemo(() => {
    if (!selectedStudentClass) return [];
    const q = studentSearch.trim().toLowerCase();
    if (!q) return selectedStudentClass.students;
    return selectedStudentClass.students.filter((name) => name.toLowerCase().includes(q));
  }, [selectedStudentClass, studentSearch]);

  const activeGrades = useMemo(() => {
    const set = new Set<number>(classes.map((c) => c.grade));
    return GRADES.filter((g) => set.has(g));
  }, [classes]);

  const computeGradeData = (grade: number) => {
    const gradeClasses = classes.filter((c) => c.grade === grade);
    const gradeBestSubs = bestSubmissions.filter((s) => s.grade === grade);

    const classSummaries = gradeClasses
      .map((cls) => {
        const clsSubs = gradeBestSubs.filter((s) => s.classId === cls.id);
        const totalScore = clsSubs.reduce((acc, s) => acc + s.score, 0);
        const avgScore = clsSubs.length > 0 ? Math.round(totalScore / clsSubs.length) : 0;
        const timedSubs = clsSubs.filter((s) => s.durationSec > 0);
        const avgDurationSec =
          timedSubs.length > 0
            ? Math.round(timedSubs.reduce((acc, s) => acc + s.durationSec, 0) / timedSubs.length)
            : 0;
        const topScore = clsSubs.length > 0 ? clsSubs[0].score : 0;
        const participationRate =
          cls.students.length > 0 ? Math.round((clsSubs.length / cls.students.length) * 100) : 0;
        return {
          classRoster: cls,
          submittedCount: clsSubs.length,
          rosterCount: cls.students.length,
          participationRate,
          totalScore,
          avgScore,
          avgDurationSec,
          topScore,
        };
      })
      .sort((a, b) => {
        if (b.avgScore !== a.avgScore) return b.avgScore - a.avgScore;
        const aDur = a.avgDurationSec > 0 ? a.avgDurationSec : Number.MAX_SAFE_INTEGER;
        const bDur = b.avgDurationSec > 0 ? b.avgDurationSec : Number.MAX_SAFE_INTEGER;
        if (aDur !== bDur) return aDur - bDur;
        return b.totalScore - a.totalScore;
      });

    return { gradeClasses, gradeBestSubs, classSummaries };
  };

  const computeClassAnalytics = (classId: string) => {
    const cls = classes.find((c) => c.id === classId) ?? null;
    if (!cls) return null;

    const bestForClass = bestSubmissions.filter((s) => s.classId === cls.id);
    const allForClass = submissions.filter((s) => s.classId === cls.id);
    const submittedNames = new Set(bestForClass.map((s) => s.studentName.toLowerCase()));
    const missingStudents = cls.students.filter((name) => !submittedNames.has(name.toLowerCase()));

    const scores = bestForClass.map((s) => s.score);
    const totalScore = scores.reduce((a, b) => a + b, 0);
    const avgScore = scores.length > 0 ? Math.round(totalScore / scores.length) : 0;
    const maxScore = scores.length > 0 ? Math.max(...scores) : 0;
    const minScore = scores.length > 0 ? Math.min(...scores) : 0;
    const avgAccuracy =
      bestForClass.length > 0
        ? Math.round(bestForClass.reduce((a, s) => a + s.accuracy, 0) / bestForClass.length)
        : 0;
    const timedSubs = bestForClass.filter((s) => s.durationSec > 0);
    const avgDurationSec =
      timedSubs.length > 0
        ? Math.round(timedSubs.reduce((a, s) => a + s.durationSec, 0) / timedSubs.length)
        : 0;
    const participationPct =
      cls.students.length > 0 ? Math.round((bestForClass.length / cls.students.length) * 100) : 0;

    const tiers = [
      {
        label: 'Xuất sắc (≥ 150 điểm)',
        count: bestForClass.filter((s) => s.score >= 150).length,
        barClass: 'bg-emerald-600',
      },
      {
        label: 'Khá (90 – 149 điểm)',
        count: bestForClass.filter((s) => s.score >= 90 && s.score < 150).length,
        barClass: 'bg-sky-600',
      },
      {
        label: 'Đạt (40 – 89 điểm)',
        count: bestForClass.filter((s) => s.score >= 40 && s.score < 90).length,
        barClass: 'bg-amber-500',
      },
      {
        label: 'Cần cố gắng (< 40 điểm)',
        count: bestForClass.filter((s) => s.score < 40).length,
        barClass: 'bg-rose-500',
      },
    ];

    return {
      cls,
      bestForClass,
      allForClass,
      missingStudents,
      avgScore,
      avgDurationSec,
      maxScore,
      minScore,
      avgAccuracy,
      participationPct,
      tiers,
    };
  };

  // Student submits score + durationSec WITHOUT logging in
  const handleStudentSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setStudentFeedback(null);

    if (!selectedStudentClass) {
      setStudentFeedback({
        type: 'error',
        text: 'Vui lòng chọn lớp học của em.',
      });
      return;
    }
    if (!studentName || !selectedStudentClass.students.includes(studentName)) {
      setStudentFeedback({
        type: 'error',
        text: 'Vui lòng chọn đúng Họ và tên của em trong danh sách lớp.',
      });
      return;
    }
    if (correctCount === 0 && score === 0) {
      setStudentFeedback({
        type: 'error',
        text: 'Em hãy trả lời ít nhất 1 câu hỏi ở các chặng 1–4 trước khi bấm Nộp bài nhé!',
      });
      return;
    }

    setSubmitting(true);
    const subId = makeSafeId('sub');
    const boundedDuration = Math.max(1, Math.min(7200, Math.round(durationSec || 1)));
    const payload = {
      classId: selectedStudentClass.id,
      className: selectedStudentClass.className,
      grade: selectedStudentClass.grade,
      studentName,
      score: Math.max(0, Math.min(5000, Math.round(score))),
      correctCount: Math.max(0, Math.min(200, Math.round(correctCount))),
      totalQuestions: Math.max(1, Math.min(200, Math.round(totalQuestions))),
      accuracy: Math.max(0, Math.min(100, Math.round(accuracy))),
      bestStreak: Math.max(0, Math.min(200, Math.round(bestStreak))),
      durationSec: boundedDuration,
      completedSections,
      isPublic: true,
      submittedAt: serverTimestamp(),
    };

    try {
      await setDoc(doc(db, 'submissions', subId), payload);
      labSound.playSuccess();
      onSubmitted();
      setRankClassId(selectedStudentClass.id);
      setRankGrade(selectedStudentClass.grade);
      setStudentFeedback({
        type: 'success',
        text: `Nộp bài thành công! Kết quả ${payload.score} điểm (thời gian ${formatDuration(
          boundedDuration,
        )}) của ${studentName} – Lớp ${selectedStudentClass.className} đã được ghi nhận vào bảng xếp hạng.`,
      });
    } catch (err) {
      setSubmitting(false);
      try {
        handleFirestoreError(err, OperationType.CREATE, `submissions/${subId}`);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSubmitting(false);
  };

  // Teacher Gmail + Password Login / First-time Password Setup
  const handleTeacherEmailSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherFeedback(null);
    setNeedsEmailProviderEnable(false);

    const trimmedEmail = loginEmail.trim();
    if (!trimmedEmail) {
      setTeacherFeedback({
        type: 'error',
        text: 'Vui lòng nhập địa chỉ Gmail Giáo viên.',
      });
      return;
    }
    if (!isAuthorizedTeacherEmail(trimmedEmail)) {
      labSound.playHint();
      setTeacherFeedback({
        type: 'error',
        text: `Tài khoản ${trimmedEmail} không được phép đăng nhập. Hệ thống chỉ cho phép duy nhất tài khoản Giáo viên (${ADMIN_EMAIL}).`,
      });
      return;
    }
    if (loginPassword.length < 6) {
      setTeacherFeedback({
        type: 'error',
        text: 'Mật khẩu cần có ít nhất 6 ký tự.',
      });
      return;
    }

    setAuthBusy(true);
    try {
      if (authMode === 'register') {
        const created = await registerTeacherWithEmailPassword(trimmedEmail, loginPassword);
        setUser(created);
        setLoginPassword('');
        labSound.playSuccess();
        setTeacherFeedback({
          type: 'success',
          text: `Đã tạo mật khẩu đăng nhập cho ${ADMIN_EMAIL} và gửi email xác nhận. Vui lòng mở hộp thư Gmail bấm vào liên kết xác nhận rồi bấm "Tôi đã xác nhận".`,
        });
      } else {
        const signedIn = await signInTeacherWithEmailPassword(trimmedEmail, loginPassword);
        setUser(signedIn);
        setLoginPassword('');
        labSound.playSuccess();
      }
    } catch (err) {
      labSound.playHint();
      const formatted = formatFirebaseAuthError(err);
      if (formatted.needsEmailProviderEnable) {
        setNeedsEmailProviderEnable(true);
      }
      setTeacherFeedback({
        type: 'error',
        text: formatted.message,
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleTeacherPasswordReset = async () => {
    setTeacherFeedback(null);
    setNeedsEmailProviderEnable(false);
    const trimmedEmail = loginEmail.trim() || ADMIN_EMAIL;
    if (!isAuthorizedTeacherEmail(trimmedEmail)) {
      setTeacherFeedback({
        type: 'error',
        text: `Chỉ hỗ trợ đặt lại mật khẩu cho tài khoản Giáo viên (${ADMIN_EMAIL}).`,
      });
      return;
    }
    setAuthBusy(true);
    try {
      await sendTeacherPasswordReset(trimmedEmail);
      labSound.playSuccess();
      setTeacherFeedback({
        type: 'success',
        text: `Đã gửi liên kết đặt / khôi phục mật khẩu tới hộp thư ${ADMIN_EMAIL}. Thầy/Cô hãy kiểm tra Gmail (kể cả mục Thư rác) để đặt mật khẩu mới rồi đăng nhập lại.`,
      });
    } catch (err) {
      labSound.playHint();
      const formatted = formatFirebaseAuthError(err);
      if (formatted.needsEmailProviderEnable) {
        setNeedsEmailProviderEnable(true);
      }
      setTeacherFeedback({
        type: 'error',
        text: formatted.message,
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleResendVerification = async () => {
    setAuthBusy(true);
    setTeacherFeedback(null);
    try {
      await resendTeacherVerificationEmail();
      labSound.playSuccess();
      setTeacherFeedback({
        type: 'success',
        text: `Đã gửi lại email xác nhận tới ${ADMIN_EMAIL}. Vui lòng mở hộp thư và bấm vào liên kết xác nhận.`,
      });
    } catch (err) {
      const formatted = formatFirebaseAuthError(err);
      setTeacherFeedback({
        type: 'error',
        text: formatted.message,
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleCheckVerified = async () => {
    setAuthBusy(true);
    setTeacherFeedback(null);
    try {
      const refreshed = await reloadTeacherUser();
      setUser(refreshed);
      setVerifyTick((t) => t + 1);
      if (refreshed && refreshed.emailVerified) {
        labSound.playSuccess();
        setTeacherFeedback(null);
      } else {
        labSound.playHint();
        setTeacherFeedback({
          type: 'error',
          text: `Hệ thống chưa ghi nhận xác nhận cho ${ADMIN_EMAIL}. Thầy/Cô vui lòng mở Gmail và bấm vào liên kết trong email xác nhận trước khi bấm kiểm tra lại.`,
        });
      }
    } catch (err) {
      const formatted = formatFirebaseAuthError(err);
      setTeacherFeedback({
        type: 'error',
        text: formatted.message,
      });
    } finally {
      setAuthBusy(false);
    }
  };

  // Teacher Google Login (strictly restricted to the single Teacher Gmail)
  const handleTeacherSignIn = async () => {
    setAuthBusy(true);
    setTeacherFeedback(null);
    setNeedsEmailProviderEnable(false);
    try {
      await signInWithGoogle();
      labSound.playSuccess();
    } catch (err) {
      labSound.playHint();
      const formatted = formatFirebaseAuthError(err);
      setTeacherFeedback({
        type: 'error',
        text: formatted.message,
      });
    } finally {
      setAuthBusy(false);
    }
  };

  const handleTeacherSignOut = async () => {
    setAuthBusy(true);
    try {
      await signOutUser();
      setTeacherFeedback(null);
      setNeedsEmailProviderEnable(false);
    } finally {
      setAuthBusy(false);
    }
  };

  const parsedFormStudents = useMemo(() => parseStudentLines(formStudentsText), [formStudentsText]);

  const resetRosterForm = () => {
    setEditingClassId(null);
    setFormClassName('');
    setFormStudentsText('');
    setFormGrade(6);
  };

  const startEditClass = (cls: ClassRoster) => {
    setEditingClassId(cls.id);
    setFormGrade(cls.grade);
    setFormClassName(cls.className);
    setFormStudentsText(cls.students.join('\n'));
    setTeacherFeedback(null);
  };

  const handleSaveClassRoster = async (e: React.FormEvent) => {
    e.preventDefault();
    setTeacherFeedback(null);
    if (!user || !isTeacher) {
      setTeacherFeedback({
        type: 'error',
        text: 'Chỉ tài khoản Giáo viên mới có quyền lưu danh sách lớp.',
      });
      return;
    }

    const cleanName = formClassName.trim().toUpperCase();
    if (!cleanName || cleanName.length > 20) {
      setTeacherFeedback({
        type: 'error',
        text: 'Vui lòng nhập Tên lớp hợp lệ (ví dụ: 6A1, 7A2, tối đa 20 ký tự).',
      });
      return;
    }
    if (parsedFormStudents.length === 0) {
      setTeacherFeedback({
        type: 'error',
        text: 'Vui lòng nhập ít nhất 1 họ tên học sinh (mỗi học sinh một dòng, tối thiểu 2 ký tự).',
      });
      return;
    }

    setSavingClass(true);
    try {
      if (editingClassId) {
        const ref = doc(db, 'classes', editingClassId);
        await updateDoc(ref, {
          className: cleanName,
          grade: formGrade,
          students: parsedFormStudents,
          isActive: true,
          updatedAt: serverTimestamp(),
        });
        setTeacherFeedback({
          type: 'success',
          text: `Đã cập nhật danh sách lớp ${cleanName} (Khối ${formGrade}) gồm ${parsedFormStudents.length} học sinh.`,
        });
        resetRosterForm();
      } else {
        const newId = makeSafeId(`cls${formGrade}`);
        await setDoc(doc(db, 'classes', newId), {
          teacherUid: user.uid,
          className: cleanName,
          grade: formGrade,
          students: parsedFormStudents,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setTeacherFeedback({
          type: 'success',
          text: `Đã tạo lớp ${cleanName} (Khối ${formGrade}) với ${parsedFormStudents.length} học sinh. Học sinh có thể chọn lớp để bắt đầu thử thách ngay!`,
        });
        resetRosterForm();
      }
      labSound.playSuccess();
    } catch (err) {
      setSavingClass(false);
      try {
        handleFirestoreError(
          err,
          editingClassId ? OperationType.UPDATE : OperationType.CREATE,
          editingClassId ? `classes/${editingClassId}` : 'classes',
        );
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSavingClass(false);
  };

  const handleSeedSampleClasses = async () => {
    if (!user || !isTeacher) return;
    setSavingClass(true);
    setTeacherFeedback(null);
    try {
      for (const sample of SAMPLE_ROSTERS) {
        const exists = classes.some(
          (c) => c.grade === sample.grade && c.className.toUpperCase() === sample.className,
        );
        if (exists) continue;
        const newId = makeSafeId(`cls${sample.grade}`);
        await setDoc(doc(db, 'classes', newId), {
          teacherUid: user.uid,
          className: sample.className,
          grade: sample.grade,
          students: sample.students,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
      labSound.playSuccess();
      setTeacherFeedback({
        type: 'success',
        text: 'Đã thêm nhanh 2 lớp mẫu 6A1 và 6A2 (Khối 6). Thầy/Cô có thể bấm Sửa để thay bằng danh sách thật.',
      });
    } catch (err) {
      setSavingClass(false);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'classes');
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSavingClass(false);
  };

  const handleDeleteClass = async (cls: ClassRoster) => {
    if (!isTeacher) return;
    try {
      await deleteDoc(doc(db, 'classes', cls.id));
      setConfirmDeleteClassId(null);
      if (editingClassId === cls.id) resetRosterForm();
      setTeacherFeedback({
        type: 'success',
        text: `Đã xóa lớp ${cls.className} khỏi danh sách lớp đang hoạt động.`,
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `classes/${cls.id}`);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  };

  const handleDeleteSubmission = async (sub: StudentSubmission) => {
    if (!isTeacher) return;
    try {
      await deleteDoc(doc(db, 'submissions', sub.id));
      setConfirmDeleteSubId(null);
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `submissions/${sub.id}`);
      } catch (wrapped) {
        setFatalError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  };

  const exportClassCsv = (classId: string) => {
    const stats = computeClassAnalytics(classId);
    if (!stats) return;
    const rows = stats.bestForClass.map((s, idx) => [
      idx + 1,
      s.studentName,
      s.className,
      `Khối ${s.grade}`,
      s.score,
      formatDuration(s.durationSec),
      `${s.correctCount}/${s.totalQuestions}`,
      `${s.accuracy}%`,
      s.bestStreak,
      s.completedSections.map((k) => SECTION_LABELS[k]).join('; '),
      formatDateTime(s.submittedAt),
    ]);
    for (const missing of stats.missingStudents) {
      rows.push([
        '-',
        missing,
        stats.cls.className,
        `Khối ${stats.cls.grade}`,
        0,
        '-',
        '0/25',
        '0%',
        0,
        'Chưa nộp bài',
        '-',
      ]);
    }
    downloadCsvFile(
      `thong-ke-lop-${stats.cls.className}.csv`,
      [
        'Hạng',
        'Họ và tên',
        'Lớp',
        'Khối',
        'Điểm cao nhất',
        'Thời gian làm bài',
        'Số câu đúng',
        'Chính xác',
        'Chuỗi đúng',
        'Phần đã làm',
        'Thời gian nộp',
      ],
      rows,
    );
  };

  const exportGradeCsv = (grade: number) => {
    const { gradeBestSubs } = computeGradeData(grade);
    const rows = gradeBestSubs.map((s, idx) => [
      idx + 1,
      s.studentName,
      s.className,
      `Khối ${s.grade}`,
      s.score,
      formatDuration(s.durationSec),
      `${s.correctCount}/${s.totalQuestions}`,
      `${s.accuracy}%`,
      s.bestStreak,
      formatDateTime(s.submittedAt),
    ]);
    downloadCsvFile(
      `bang-xep-hang-khoi-${grade}.csv`,
      [
        'Hạng Khối',
        'Họ và tên',
        'Lớp',
        'Khối',
        'Điểm',
        'Thời gian làm bài',
        'Số câu đúng',
        'Chính xác',
        'Chuỗi đúng',
        'Thời gian nộp',
      ],
      rows,
    );
  };

  const publicRankClassStats = useMemo(
    () => computeClassAnalytics(rankClassId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, submissions, rankClassId],
  );
  const publicGradeData = useMemo(
    () => computeGradeData(rankGrade),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, submissions, rankGrade],
  );

  const teacherAnalytics = useMemo(
    () => computeClassAnalytics(analyticsClassId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, submissions, analyticsClassId],
  );
  const teacherGradeData = useMemo(
    () => computeGradeData(teacherRankGrade),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, submissions, teacherRankGrade],
  );
  const teacherClassRanking = useMemo(
    () => computeClassAnalytics(teacherRankClassId),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [classes, submissions, teacherRankClassId],
  );

  const renderRankBadge = (idx: number) => {
    if (idx === 0) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-amber-600 font-mono-num">
          <Trophy className="h-4 w-4" />1
        </span>
      );
    }
    if (idx === 1) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-slate-500 font-mono-num">
          <Medal className="h-4 w-4" />2
        </span>
      );
    }
    if (idx === 2) {
      return (
        <span className="inline-flex items-center gap-1 font-bold text-amber-800 font-mono-num">
          <Award className="h-4 w-4" />3
        </span>
      );
    }
    return <span className="font-semibold text-slate-600 font-mono-num">{idx + 1}</span>;
  };

  return (
    <div className="space-y-5">
      {/* Top Role Navigation Bar (Hidden when Teacher is inside Teacher-only workspace) */}
      {!teacherOnlyMode && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-2.5 shadow-xs">
          <div className="flex flex-wrap items-center gap-1.5">
            {!hideStudentSubmission && (
              <button
                type="button"
                onClick={() => {
                  labSound.playSelect();
                  setActiveTab('student');
                }}
                className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                  activeTab === 'student'
                    ? 'bg-sky-700 text-white'
                    : 'text-slate-700 hover:bg-slate-100'
                }`}
              >
                <Send className="h-4 w-4" />
                Nộp bài thi đua
              </button>
            )}

            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                setActiveTab('rankings');
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                activeTab === 'rankings'
                  ? 'bg-amber-600 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <Trophy className="h-4 w-4" />
              Bảng xếp hạng Lớp & Khối
            </button>

            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                setActiveTab('teacher');
              }}
              className={`inline-flex items-center gap-2 rounded-xl px-4 py-2.5 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                activeTab === 'teacher'
                  ? 'bg-emerald-700 text-white'
                  : 'text-slate-700 hover:bg-slate-100'
              }`}
            >
              <GraduationCap className="h-4 w-4" />
              Giáo viên (Quản lý & Thống kê)
            </button>
          </div>

          <div className="px-2 text-xs font-medium text-slate-500 font-mono-num">
            {classes.length} lớp · {bestSubmissions.length} học sinh đã nộp
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 1: STUDENT SUBMISSION (ONLY VISIBLE FOR STUDENTS, NEVER TEACHER)   */}
      {/* ===================================================================== */}
      {!hideStudentSubmission && activeTab === 'student' && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
          {/* Left: Current Student Challenge Score & Duration Summary */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
            <div className="flex items-center justify-between gap-2">
              <h2 className="text-base font-bold text-slate-900">Kết quả thử thách của em</h2>
              <button
                type="button"
                onClick={() => {
                  labSound.playSelect();
                  setStudentFeedback(null);
                  onResetForNewStudent();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-slate-50 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-sky-400 hover:text-sky-800 whitespace-nowrap"
              >
                <RotateCcw className="h-3.5 w-3.5" />
                Đổi học sinh / Lượt mới
              </button>
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Xếp hạng được tính theo <strong>Điểm cao nhất</strong> và ưu tiên <strong>Thời gian làm bài nhanh hơn</strong> khi bằng điểm.
            </p>

            <div className="mt-4 grid grid-cols-2 gap-3">
              <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5">
                <p className="text-xs font-medium text-amber-800">Tổng điểm hiện tại</p>
                <p className="mt-1 text-3xl font-extrabold text-amber-700 font-mono-num">{score}</p>
              </div>
              <div className="rounded-xl border border-emerald-200 bg-emerald-50/70 p-3.5">
                <p className="flex items-center gap-1 text-xs font-medium text-emerald-800">
                  <Clock className="h-3.5 w-3.5" />
                  Thời gian làm bài
                </p>
                <p className="mt-1 text-3xl font-extrabold text-emerald-800 font-mono-num">
                  {formatDuration(durationSec)}
                </p>
              </div>
              <div className="rounded-xl border border-sky-200 bg-sky-50/60 p-3">
                <p className="text-xs font-medium text-sky-800">Số câu đúng</p>
                <p className="mt-0.5 text-xl font-bold text-sky-900 font-mono-num">
                  {correctCount}/{totalQuestions}
                </p>
              </div>
              <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
                <p className="text-xs font-medium text-slate-600">Chính xác / Chuỗi</p>
                <p className="mt-0.5 text-xl font-bold text-slate-900 font-mono-num">
                  {accuracy}% · {bestStreak}
                </p>
              </div>
            </div>

            <div className="mt-4 border-t border-slate-100 pt-3.5">
              <p className="text-xs font-semibold text-slate-700">Các chặng đã tham gia:</p>
              {completedSections.length > 0 ? (
                <div className="mt-2 flex flex-wrap gap-2">
                  {completedSections.map((sec) => (
                    <span
                      key={sec}
                      className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-800"
                    >
                      <CheckCircle2 className="h-3.5 w-3.5 text-emerald-600" />
                      {SECTION_LABELS[sec]}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="mt-1.5 text-xs text-slate-500">
                  Chưa có câu trả lời đúng nào. Em hãy làm các chặng 1–4 trước khi nộp nhé.
                </p>
              )}
            </div>
          </div>

          {/* Right: Confirm Student & Submit */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-7">
            <h2 className="text-base font-bold text-slate-900">Xác nhận thông tin & Nộp bài</h2>
            <p className="mt-1 text-xs text-slate-600">
              Thông tin Lớp và Họ tên đã được chọn trước khi làm bài. Bấm <strong>Nộp bài ngay</strong> để lưu điểm và thời gian vào bảng xếp hạng.
            </p>

            {loadingData ? (
              <div className="mt-6 rounded-xl border border-slate-200 bg-slate-50 p-6 text-center text-sm text-slate-600">
                Đang tải danh sách lớp...
              </div>
            ) : classes.length === 0 ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-5">
                <p className="text-sm font-bold text-amber-950">
                  Giáo viên chưa nhập danh sách lớp học nào
                </p>
                <p className="mt-1 text-xs leading-relaxed text-amber-900">
                  Thầy/Cô vui lòng mở mục <strong>Giáo viên (Quản lý & Thống kê)</strong> để đăng nhập và tạo danh sách lớp trước.
                </p>
                <button
                  type="button"
                  onClick={() => setActiveTab('teacher')}
                  className="mt-3.5 inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                >
                  <GraduationCap className="h-4 w-4" />
                  Mở mục Giáo viên để nhập danh sách lớp
                </button>
              </div>
            ) : (
              <form onSubmit={handleStudentSubmit} className="mt-4 space-y-4">
                {activeStudent ? (
                  <div className="rounded-xl border border-sky-200 bg-sky-50/70 p-4">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div>
                        <p className="text-xs font-semibold text-sky-800">Học sinh đang dự thi</p>
                        <p className="mt-0.5 text-lg font-extrabold text-slate-900">
                          {activeStudent.studentName}
                        </p>
                        <p className="text-xs font-semibold text-slate-600">
                          Lớp {activeStudent.className} · Khối {activeStudent.grade}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => {
                          labSound.playSelect();
                          onResetForNewStudent();
                        }}
                        className="rounded-lg border border-sky-300 bg-white px-3 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-50"
                      >
                        Đổi lớp / học sinh khác
                      </button>
                    </div>
                  </div>
                ) : (
                  <>
                    <div>
                      <label htmlFor="student-class-select" className="block text-xs font-bold text-slate-800">
                        Chọn Lớp của em
                      </label>
                      <select
                        id="student-class-select"
                        value={studentClassId}
                        onChange={(e) => {
                          setStudentClassId(e.target.value);
                          setStudentName('');
                          setStudentSearch('');
                          setStudentFeedback(null);
                        }}
                        className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
                      >
                        {GRADES.map((grade) => {
                          const inGrade = classes.filter((c) => c.grade === grade);
                          if (inGrade.length === 0) return null;
                          return (
                            <optgroup key={grade} label={`Khối ${grade}`}>
                              {inGrade.map((cls) => (
                                <option key={cls.id} value={cls.id}>
                                  Lớp {cls.className} (Khối {cls.grade} · {cls.students.length} HS)
                                </option>
                              ))}
                            </optgroup>
                          );
                        })}
                      </select>
                    </div>

                    {selectedStudentClass && (
                      <div>
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <label htmlFor="student-name-select" className="text-xs font-bold text-slate-800">
                            Chọn Họ và tên của em ({selectedStudentClass.students.length} học sinh)
                          </label>
                          {selectedStudentClass.students.length > 10 && (
                            <input
                              type="text"
                              value={studentSearch}
                              onChange={(e) => setStudentSearch(e.target.value)}
                              placeholder="Tìm nhanh tên em..."
                              className="rounded-lg border border-slate-300 px-2.5 py-1 text-xs text-slate-800 focus:border-sky-600 focus:outline-none"
                            />
                          )}
                        </div>

                        <select
                          id="student-name-select"
                          value={studentName}
                          onChange={(e) => {
                            setStudentName(e.target.value);
                            setStudentFeedback(null);
                          }}
                          className="mt-1.5 w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
                        >
                          <option value="">-- Chọn Họ và tên của em trong lớp {selectedStudentClass.className} --</option>
                          {filteredRosterStudents.map((name) => {
                            const prevBest = studentBestMap.get(name.toLowerCase());
                            return (
                              <option key={name} value={name}>
                                {name}
                                {prevBest
                                  ? ` (Đã nộp · ${prevBest.score}đ · ${formatDuration(prevBest.durationSec)})`
                                  : ''}
                              </option>
                            );
                          })}
                        </select>
                      </div>
                    )}
                  </>
                )}

                {studentFeedback && (
                  <div
                    role="status"
                    className={`rounded-xl border px-4 py-3 text-xs font-semibold leading-relaxed sm:text-sm ${
                      studentFeedback.type === 'success'
                        ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                        : 'border-rose-300 bg-rose-50 text-rose-900'
                    }`}
                  >
                    {studentFeedback.text}
                  </div>
                )}

                <div className="flex flex-wrap items-center gap-3 pt-1">
                  <button
                    type="submit"
                    disabled={submitting || !studentName}
                    className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-6 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-sky-800 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    <Send className="h-4 w-4" />
                    {submitting
                      ? 'Đang nộp bài...'
                      : hasSubmitted
                      ? 'Nộp cập nhật kết quả mới'
                      : 'Nộp bài ngay'}
                  </button>

                  {hasSubmitted && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('rankings')}
                      className="inline-flex items-center gap-1.5 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm font-bold text-amber-900 hover:bg-amber-100"
                    >
                      <Trophy className="h-4 w-4" />
                      Xem bảng xếp hạng ngay
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 2: PUBLIC LEADERBOARD BY CLASS & GRADE (SCORE + DURATION)          */}
      {/* ===================================================================== */}
      {activeTab === 'rankings' && (
        <div className="space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
            <div className="flex flex-wrap items-center gap-2">
              <button
                type="button"
                onClick={() => setRankingScope('top3')}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                  rankingScope === 'top3'
                    ? 'bg-amber-600 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Top 3 theo từng lớp
              </button>
              <button
                type="button"
                onClick={() => setRankingScope('class')}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                  rankingScope === 'class'
                    ? 'bg-sky-700 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Chi tiết theo Lớp
              </button>
              <button
                type="button"
                onClick={() => setRankingScope('grade')}
                className={`rounded-xl px-4 py-2 text-xs font-bold transition-colors whitespace-nowrap sm:text-sm ${
                  rankingScope === 'grade'
                    ? 'bg-emerald-700 text-white'
                    : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                }`}
              >
                Xếp hạng theo Khối
              </button>
            </div>

            {classes.length > 0 && rankingScope !== 'top3' && (
              <div className="flex items-center gap-2">
                {rankingScope === 'class' ? (
                  <>
                    <label htmlFor="rank-class-filter" className="text-xs font-semibold text-slate-600">
                      Chọn lớp:
                    </label>
                    <select
                      id="rank-class-filter"
                      value={rankClassId}
                      onChange={(e) => setRankClassId(e.target.value)}
                      className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-bold text-slate-900 focus:border-sky-600 focus:outline-none"
                    >
                      {classes.map((cls) => (
                        <option key={cls.id} value={cls.id}>
                          Lớp {cls.className} (Khối {cls.grade})
                        </option>
                      ))}
                    </select>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center gap-1.5">
                    {(activeGrades.length > 0 ? activeGrades : GRADES).map((g) => (
                      <button
                        key={g}
                        type="button"
                        onClick={() => setRankGrade(g)}
                        className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors ${
                          rankGrade === g
                            ? 'bg-emerald-700 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700 hover:bg-slate-100'
                        }`}
                      >
                        Khối {g}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {classes.length === 0 ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              Chưa có danh sách lớp và bài nộp nào. Giáo viên có thể nhập danh sách lớp ở mục Giáo viên.
            </div>
          ) : rankingScope === 'top3' ? (
            <ClassTop3Leaderboard
              classes={classes}
              bestSubmissions={bestSubmissions}
              loading={loadingData}
              onSelectClassDetail={(clsId) => {
                setRankClassId(clsId);
                setRankingScope('class');
              }}
            />
          ) : rankingScope === 'class' && publicRankClassStats ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-5">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 pb-4">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">
                    Bảng xếp hạng Lớp {publicRankClassStats.cls.className} (Khối {publicRankClassStats.cls.grade})
                  </h3>
                  <p className="text-xs text-slate-500">
                    Xếp hạng theo Điểm cao nhất → Thời gian làm bài nhanh nhất
                  </p>
                </div>
                <div className="flex flex-wrap gap-4 text-xs font-semibold text-slate-700 font-mono-num">
                  <span>
                    Đã nộp: <strong>{publicRankClassStats.bestForClass.length}/{publicRankClassStats.cls.students.length}</strong> ({publicRankClassStats.participationPct}%)
                  </span>
                  <span>
                    TB lớp: <strong className="text-sky-800">{publicRankClassStats.avgScore} điểm</strong>
                  </span>
                  <span>
                    TB thời gian: <strong className="text-emerald-700">{formatDuration(publicRankClassStats.avgDurationSec)}</strong>
                  </span>
                </div>
              </div>

              {publicRankClassStats.bestForClass.length === 0 ? (
                <p className="py-8 text-center text-sm text-slate-500">
                  Lớp {publicRankClassStats.cls.className} chưa có học sinh nào nộp bài.
                </p>
              ) : (
                <div className="mt-3 overflow-x-auto">
                  <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                    <thead>
                      <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                        <th className="py-2.5 pr-3">Hạng</th>
                        <th className="py-2.5 pr-3">Họ và tên</th>
                        <th className="py-2.5 pr-3 text-right">Điểm</th>
                        <th className="py-2.5 pr-3 text-right">Thời gian</th>
                        <th className="py-2.5 pr-3 text-right">Câu đúng</th>
                        <th className="py-2.5 pr-3 text-right">Chính xác</th>
                        <th className="py-2.5 text-right">Nộp lúc</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {publicRankClassStats.bestForClass.map((sub, idx) => (
                        <tr key={sub.id} className={idx < 3 ? 'bg-amber-50/35' : ''}>
                          <td className="py-3 pr-3">{renderRankBadge(idx)}</td>
                          <td className="py-3 pr-3 font-semibold text-slate-900">{sub.studentName}</td>
                          <td className="py-3 pr-3 text-right font-extrabold text-sky-800 font-mono-num">
                            {sub.score}
                          </td>
                          <td className="py-3 pr-3 text-right font-bold text-emerald-700 font-mono-num">
                            {formatDuration(sub.durationSec)}
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-700 font-mono-num">
                            {sub.correctCount}/{sub.totalQuestions}
                          </td>
                          <td className="py-3 pr-3 text-right text-slate-700 font-mono-num">
                            {sub.accuracy}%
                          </td>
                          <td className="py-3 text-right text-xs text-slate-500 font-mono-num">
                            {formatDateTime(sub.submittedAt)}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          ) : (
            <div className="space-y-5">
              {/* Grade Class-vs-Class Standings */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-bold text-slate-900">
                  Thi đua giữa các lớp — Khối {rankGrade}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Xếp hạng các lớp theo Điểm trung bình cao nhất → Thời gian làm bài trung bình nhanh nhất
                </p>

                {publicGradeData.classSummaries.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Chưa có lớp nào thuộc Khối {rankGrade}.
                  </p>
                ) : (
                  <div className="mt-4 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                          <th className="py-2.5 pr-3">Hạng</th>
                          <th className="py-2.5 pr-3">Lớp</th>
                          <th className="py-2.5 pr-3 text-right">Đã nộp / Sĩ số</th>
                          <th className="py-2.5 pr-3 text-right">Điểm TB</th>
                          <th className="py-2.5 pr-3 text-right">Thời gian TB</th>
                          <th className="py-2.5 pr-3 text-right">Tổng điểm</th>
                          <th className="py-2.5 text-right">Cao nhất</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {publicGradeData.classSummaries.map((row, idx) => (
                          <tr key={row.classRoster.id} className={idx === 0 && row.submittedCount > 0 ? 'bg-amber-50/40' : ''}>
                            <td className="py-3 pr-3">{renderRankBadge(idx)}</td>
                            <td className="py-3 pr-3 font-bold text-slate-900">Lớp {row.classRoster.className}</td>
                            <td className="py-3 pr-3 text-right text-slate-700 font-mono-num">
                              {row.submittedCount}/{row.rosterCount} ({row.participationRate}%)
                            </td>
                            <td className="py-3 pr-3 text-right font-extrabold text-sky-800 font-mono-num">
                              {row.avgScore}
                            </td>
                            <td className="py-3 pr-3 text-right font-bold text-emerald-700 font-mono-num">
                              {formatDuration(row.avgDurationSec)}
                            </td>
                            <td className="py-3 pr-3 text-right font-semibold text-slate-800 font-mono-num">
                              {row.totalScore}
                            </td>
                            <td className="py-3 text-right font-semibold text-amber-700 font-mono-num">
                              {row.topScore}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Grade Individual Leaderboard */}
              <div className="rounded-2xl border border-slate-200 bg-white p-5">
                <h3 className="text-lg font-bold text-slate-900">
                  Bảng xếp hạng cá nhân toàn Khối {rankGrade}
                </h3>
                <p className="mt-0.5 text-xs text-slate-500">
                  Ưu tiên Điểm cao nhất, tiếp theo là Thời gian hoàn thành nhanh nhất
                </p>
                {publicGradeData.gradeBestSubs.length === 0 ? (
                  <p className="py-6 text-center text-sm text-slate-500">
                    Chưa có học sinh nào thuộc Khối {rankGrade} nộp bài.
                  </p>
                ) : (
                  <div className="mt-3 overflow-x-auto">
                    <table className="w-full min-w-[640px] border-collapse text-left text-sm">
                      <thead>
                        <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                          <th className="py-2.5 pr-3">Hạng Khối</th>
                          <th className="py-2.5 pr-3">Họ và tên</th>
                          <th className="py-2.5 pr-3">Lớp</th>
                          <th className="py-2.5 pr-3 text-right">Điểm</th>
                          <th className="py-2.5 pr-3 text-right">Thời gian</th>
                          <th className="py-2.5 pr-3 text-right">Câu đúng</th>
                          <th className="py-2.5 text-right">Chính xác</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-100">
                        {publicGradeData.gradeBestSubs.map((sub, idx) => (
                          <tr key={sub.id} className={idx < 3 ? 'bg-amber-50/35' : ''}>
                            <td className="py-3 pr-3">{renderRankBadge(idx)}</td>
                            <td className="py-3 pr-3 font-semibold text-slate-900">{sub.studentName}</td>
                            <td className="py-3 pr-3 font-bold text-sky-800">{sub.className}</td>
                            <td className="py-3 pr-3 text-right font-extrabold text-sky-800 font-mono-num">
                              {sub.score}
                            </td>
                            <td className="py-3 pr-3 text-right font-bold text-emerald-700 font-mono-num">
                              {formatDuration(sub.durationSec)}
                            </td>
                            <td className="py-3 pr-3 text-right text-slate-700 font-mono-num">
                              {sub.correctCount}/{sub.totalQuestions}
                            </td>
                            <td className="py-3 text-right text-slate-700 font-mono-num">
                              {sub.accuracy}%
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ===================================================================== */}
      {/* TAB 3: TEACHER PORTAL (LOGIN REQUIRED ONLY FOR TEACHERS)               */}
      {/* ===================================================================== */}
      {activeTab === 'teacher' && (
        <div>
          {!authReady ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
              Đang kiểm tra trạng thái đăng nhập Giáo viên...
            </div>
          ) : !user ? (
            <div className="mx-auto max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xs sm:p-7">
              <div className="text-center">
                <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-emerald-50 text-emerald-700">
                  <GraduationCap className="h-6 w-6" />
                </div>
                <h2 className="mt-3 text-lg font-bold text-slate-900">Đăng nhập tài khoản Giáo viên</h2>
                <p className="mt-1.5 text-xs leading-relaxed text-slate-600 sm:text-sm">
                  Chỉ duy nhất tài khoản Giáo viên được cấp quyền (<strong>{ADMIN_EMAIL}</strong>) mới có thể đăng nhập quản lý lớp học, câu hỏi và bảng thống kê.
                </p>
              </div>

              {/* Mode Switcher: Sign In vs First-Time Password Setup */}
              <div className="mt-5 grid grid-cols-2 gap-1.5 rounded-xl bg-slate-100 p-1">
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('signin');
                    setTeacherFeedback(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                    authMode === 'signin'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Đăng nhập Gmail & Mật khẩu
                </button>
                <button
                  type="button"
                  onClick={() => {
                    setAuthMode('register');
                    setTeacherFeedback(null);
                  }}
                  className={`rounded-lg px-3 py-2 text-xs font-bold transition-colors ${
                    authMode === 'register'
                      ? 'bg-white text-emerald-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Tạo mật khẩu lần đầu
                </button>
              </div>

              <form onSubmit={handleTeacherEmailSubmit} className="mt-4 space-y-3.5 text-left">
                <div>
                  <label htmlFor="teacher-login-email" className="block text-xs font-bold text-slate-800">
                    Gmail đăng nhập Giáo viên
                  </label>
                  <div className="relative mt-1.5">
                    <Mail className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="teacher-login-email"
                      type="email"
                      required
                      autoComplete="username"
                      value={loginEmail}
                      onChange={(e) => setLoginEmail(e.target.value)}
                      placeholder={ADMIN_EMAIL}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-3.5 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between">
                    <label htmlFor="teacher-login-password" className="block text-xs font-bold text-slate-800">
                      {authMode === 'register' ? 'Đặt mật khẩu đăng nhập (tối thiểu 6 ký tự)' : 'Mật khẩu'}
                    </label>
                    {authMode === 'signin' && (
                      <button
                        type="button"
                        disabled={authBusy}
                        onClick={handleTeacherPasswordReset}
                        className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700 hover:text-emerald-900 disabled:opacity-50"
                      >
                        <KeyRound className="h-3 w-3" />
                        Quên / Đặt mật khẩu?
                      </button>
                    )}
                  </div>
                  <div className="relative mt-1.5">
                    <Lock className="pointer-events-none absolute left-3.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      id="teacher-login-password"
                      type={showPassword ? 'text' : 'password'}
                      required
                      minLength={6}
                      autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                      value={loginPassword}
                      onChange={(e) => setLoginPassword(e.target.value)}
                      placeholder={authMode === 'register' ? 'Nhập mật khẩu mới (≥ 6 ký tự)...' : 'Nhập mật khẩu của tài khoản...'}
                      className="w-full rounded-xl border border-slate-300 bg-white py-2.5 pl-10 pr-11 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((prev) => !prev)}
                      aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-800"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                  {authMode === 'register' && (
                    <p className="mt-1.5 text-xs text-slate-500">
                      Sau khi tạo mật khẩu, hệ thống sẽ gửi 1 email xác nhận tới <strong>{ADMIN_EMAIL}</strong> để đảm bảo đúng chính chủ Giáo viên.
                    </p>
                  )}
                </div>

                <button
                  type="submit"
                  disabled={authBusy}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-700 px-5 py-3 text-sm font-bold text-white shadow-xs transition-colors hover:bg-emerald-800 disabled:opacity-60"
                >
                  <LogIn className="h-4 w-4" />
                  {authBusy
                    ? 'Đang xác thực...'
                    : authMode === 'register'
                    ? 'Tạo mật khẩu & Gửi email xác nhận'
                    : 'Đăng nhập Giáo viên'}
                </button>
              </form>

              <div className="my-4 flex items-center gap-3">
                <div className="h-px flex-1 bg-slate-200" />
                <span className="text-xs font-semibold text-slate-400">hoặc đăng nhập nhanh</span>
                <div className="h-px flex-1 bg-slate-200" />
              </div>

              <button
                type="button"
                disabled={authBusy}
                onClick={handleTeacherSignIn}
                className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-bold text-slate-800 transition-colors hover:border-emerald-500 hover:bg-emerald-50/60 hover:text-emerald-900 disabled:opacity-60"
              >
                <ShieldCheck className="h-4 w-4 text-emerald-700" />
                {authBusy ? 'Đang kết nối Google...' : `Đăng nhập nhanh bằng Google (${ADMIN_EMAIL})`}
              </button>

              {teacherFeedback && (
                <div
                  role="alert"
                  className={`mt-4 rounded-xl border px-4 py-3 text-left text-xs font-semibold leading-relaxed ${
                    teacherFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {teacherFeedback.text}
                </div>
              )}

              {needsEmailProviderEnable && (
                <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-3.5 text-left text-xs leading-relaxed text-amber-950">
                  <p className="font-bold">Hướng dẫn bật đăng nhập Email & Mật khẩu (chỉ làm 1 lần):</p>
                  <ol className="mt-1.5 list-decimal space-y-1 pl-4">
                    <li>
                      Mở Firebase Console → menu trái <strong>Créer</strong> → <strong>Authentication</strong> → tab <strong>Sign-in method</strong> (hoặc <strong>Mode de connexion</strong>).
                    </li>
                    <li>
                      Bấm <strong>Ajouter un fournisseur</strong> → chọn <strong>Adresse e-mail/Mot de passe</strong> → bật công tắc đầu tiên <strong>Activer</strong> → bấm <strong>Enregistrer</strong>.
                    </li>
                    <li>Quay lại đây và đăng nhập bằng Gmail + Mật khẩu.</li>
                  </ol>
                  <a
                    href={`https://console.firebase.google.com/project/${FIREBASE_PROJECT_ID}/authentication/providers`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 inline-flex items-center gap-1 font-bold text-emerald-800 underline hover:text-emerald-950"
                  >
                    Mở trang cấu hình Firebase Authentication
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                </div>
              )}
            </div>
          ) : isUnverifiedTeacher ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-xs">
              <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-2xl bg-amber-50 text-amber-700">
                <Mail className="h-6 w-6" />
              </div>
              <h2 className="mt-3 text-lg font-bold text-slate-900">Xác nhận hộp thư Gmail Giáo viên</h2>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Bạn đã đăng nhập bằng <strong>{user.email}</strong>. Để bảo vệ quyền quản trị, vui lòng mở hộp thư Gmail (kiểm tra cả mục Thư rác) và bấm vào liên kết xác nhận tài khoản, sau đó nhấn nút bên dưới.
              </p>

              {teacherFeedback && (
                <div
                  role="status"
                  className={`mt-4 rounded-xl border px-4 py-3 text-xs font-semibold leading-relaxed ${
                    teacherFeedback.type === 'success'
                      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                      : 'border-rose-200 bg-rose-50 text-rose-800'
                  }`}
                >
                  {teacherFeedback.text}
                </div>
              )}

              <div className="mt-5 flex flex-wrap justify-center gap-2.5">
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleCheckVerified}
                  className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                >
                  <RefreshCw className="h-4 w-4" />
                  {authBusy ? 'Đang kiểm tra...' : 'Tôi đã xác nhận — Vào Cổng Giáo viên'}
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleResendVerification}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50 disabled:opacity-60"
                >
                  <Mail className="h-4 w-4" />
                  Gửi lại email xác nhận
                </button>
                <button
                  type="button"
                  disabled={authBusy}
                  onClick={handleTeacherSignOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-4 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất
                </button>
              </div>
            </div>
          ) : !isTeacher ? (
            <div className="mx-auto max-w-xl rounded-2xl border border-amber-200 bg-white p-7 text-center shadow-xs">
              <h2 className="text-lg font-bold text-slate-900">Tài khoản chưa có quyền Giáo viên</h2>
              <p className="mt-2 text-sm text-slate-600">
                Bạn đang đăng nhập bằng <strong>{user.email}</strong>. Quyền quản lý danh sách lớp hiện được cấp cho tài khoản Giáo viên <strong>{ADMIN_EMAIL}</strong>.
              </p>
              <div className="mt-5 flex flex-wrap justify-center gap-3">
                <button
                  type="button"
                  onClick={handleTeacherSignOut}
                  className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-bold text-slate-800 hover:bg-slate-50"
                >
                  <LogOut className="h-4 w-4" />
                  Đăng xuất để đổi tài khoản Giáo viên
                </button>
                <button
                  type="button"
                  onClick={() => setActiveTab('rankings')}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-sky-800"
                >
                  Xem bảng xếp hạng
                </button>
              </div>
            </div>
          ) : (
            <div className="space-y-5">
              {/* Teacher Header Bar */}
              <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-emerald-200 bg-emerald-50/70 px-4 py-3">
                <div className="flex items-center gap-2.5">
                  <ShieldCheck className="h-5 w-5 text-emerald-700" />
                  <div>
                    <p className="text-sm font-bold text-emerald-950">
                      Cổng Giáo viên · {user.displayName || user.email}
                    </p>
                    <p className="text-xs text-emerald-800">{user.email}</p>
                  </div>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTeacherSubTab('rosters')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                      teacherSubTab === 'rosters'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    <ClipboardList className="h-3.5 w-3.5" />
                    Danh sách lớp
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherSubTab('questions')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                      teacherSubTab === 'questions'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    <FilePlus2 className="h-3.5 w-3.5" />
                    Dạng câu hỏi & Câu hỏi
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherSubTab('analytics')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                      teacherSubTab === 'analytics'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    <BarChart3 className="h-3.5 w-3.5" />
                    Thống kê theo lớp
                  </button>
                  <button
                    type="button"
                    onClick={() => setTeacherSubTab('rankings')}
                    className={`inline-flex items-center gap-1.5 rounded-xl px-3.5 py-2 text-xs font-bold transition-colors whitespace-nowrap ${
                      teacherSubTab === 'rankings'
                        ? 'bg-emerald-700 text-white'
                        : 'bg-white text-emerald-900 hover:bg-emerald-100'
                    }`}
                  >
                    <Trophy className="h-3.5 w-3.5" />
                    Xếp hạng Lớp & Khối
                  </button>
                  <button
                    type="button"
                    onClick={handleTeacherSignOut}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-emerald-300 bg-white px-3 py-2 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 whitespace-nowrap"
                  >
                    <LogOut className="h-3.5 w-3.5" />
                    Đăng xuất
                  </button>
                </div>
              </div>

              {teacherFeedback && teacherSubTab !== 'questions' && (
                <div
                  role="status"
                  className={`rounded-xl border px-4 py-3 text-xs font-semibold sm:text-sm ${
                    teacherFeedback.type === 'success'
                      ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
                      : 'border-rose-300 bg-rose-50 text-rose-900'
                  }`}
                >
                  {teacherFeedback.text}
                </div>
              )}

              {/* TEACHER SUB-TAB: CUSTOM QUESTION TYPES & QUESTIONS */}
              {teacherSubTab === 'questions' && (
                <TeacherQuestionManager
                  teacherUid={user.uid}
                  onError={(err) => setFatalError(err)}
                />
              )}

              {/* TEACHER SUB-TAB A: CLASS ROSTER MANAGEMENT */}
              {teacherSubTab === 'rosters' && (
                <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                  <form
                    onSubmit={handleSaveClassRoster}
                    className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-base font-bold text-slate-900">
                        {editingClassId ? 'Chỉnh sửa danh sách lớp' : 'Thêm lớp & danh sách học sinh'}
                      </h3>
                      {editingClassId && (
                        <button
                          type="button"
                          onClick={resetRosterForm}
                          className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                        >
                          Hủy chỉnh sửa
                        </button>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      Sao chép thẳng cột Họ và tên từ Excel / Word rồi dán vào ô bên dưới (mỗi học sinh 1 dòng, tối đa 60 HS/lớp).
                    </p>

                    <div className="mt-4 grid grid-cols-2 gap-3">
                      <div>
                        <label htmlFor="teacher-grade" className="block text-xs font-bold text-slate-700">
                          Khối lớp
                        </label>
                        <select
                          id="teacher-grade"
                          value={formGrade}
                          onChange={(e) => setFormGrade(Number(e.target.value))}
                          className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                        >
                          {GRADES.map((g) => (
                            <option key={g} value={g}>
                              Khối {g}
                            </option>
                          ))}
                        </select>
                      </div>
                      <div>
                        <label htmlFor="teacher-classname" className="block text-xs font-bold text-slate-700">
                          Tên lớp (VD: 6A1)
                        </label>
                        <input
                          id="teacher-classname"
                          type="text"
                          value={formClassName}
                          onChange={(e) => setFormClassName(e.target.value)}
                          maxLength={20}
                          placeholder="Ví dụ: 6A1"
                          className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2.5 text-sm font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none"
                        />
                      </div>
                    </div>

                    <div className="mt-4">
                      <div className="flex items-center justify-between">
                        <label htmlFor="teacher-students" className="text-xs font-bold text-slate-700">
                          Danh sách học sinh (1 tên / dòng)
                        </label>
                        <span className="text-xs font-semibold text-emerald-700 font-mono-num">
                          Đã nhận: {parsedFormStudents.length}/60 HS
                        </span>
                      </div>
                      <textarea
                        id="teacher-students"
                        rows={10}
                        value={formStudentsText}
                        onChange={(e) => setFormStudentsText(e.target.value)}
                        placeholder={'Nguyễn Minh Anh\nTrần Gia Bảo\nLê Hoàng Châu\n...'}
                        className="mt-1.5 w-full rounded-xl border border-slate-300 p-3 text-sm leading-relaxed text-slate-900 focus:border-emerald-600 focus:outline-none"
                      />
                    </div>

                    <div className="mt-4 flex flex-wrap items-center gap-2.5">
                      <button
                        type="submit"
                        disabled={savingClass}
                        className="inline-flex items-center gap-2 rounded-xl bg-emerald-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-emerald-800 disabled:opacity-60"
                      >
                        <Plus className="h-4 w-4" />
                        {savingClass
                          ? 'Đang lưu...'
                          : editingClassId
                          ? 'Lưu thay đổi lớp'
                          : 'Lưu danh sách lớp'}
                      </button>

                      {!editingClassId && (
                        <button
                          type="button"
                          disabled={savingClass}
                          onClick={handleSeedSampleClasses}
                          className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3.5 py-2.5 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-800"
                        >
                          <BookOpenCheck className="h-3.5 w-3.5" />
                          Thêm nhanh 2 lớp mẫu (6A1, 6A2)
                        </button>
                      )}
                    </div>
                  </form>

                  {/* Existing Classes List */}
                  <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6">
                    <h3 className="text-base font-bold text-slate-900">
                      Danh sách các lớp đã tạo ({classes.length})
                    </h3>

                    {classes.length === 0 ? (
                      <div className="mt-6 rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
                        Chưa có lớp học nào. Thầy/Cô hãy nhập lớp đầu tiên ở biểu mẫu bên trái hoặc bấm{' '}
                        <strong>Thêm nhanh 2 lớp mẫu</strong>.
                      </div>
                    ) : (
                      <div className="mt-4 space-y-3">
                        {classes.map((cls) => {
                          const submittedCount = bestSubmissions.filter((s) => s.classId === cls.id).length;
                          const isConfirming = confirmDeleteClassId === cls.id;
                          return (
                            <div
                              key={cls.id}
                              className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                            >
                              <div>
                                <p className="text-sm font-bold text-slate-900">
                                  Lớp {cls.className} · <span className="text-sky-700">Khối {cls.grade}</span>
                                </p>
                                <p className="mt-0.5 text-xs text-slate-600 font-mono-num">
                                  Sĩ số: {cls.students.length} HS · Đã nộp: {submittedCount}/{cls.students.length}
                                </p>
                              </div>
                              <div className="flex items-center gap-2">
                                <button
                                  type="button"
                                  onClick={() => {
                                    setAnalyticsClassId(cls.id);
                                    setTeacherSubTab('analytics');
                                  }}
                                  className="rounded-lg border border-sky-200 bg-sky-50 px-2.5 py-1.5 text-xs font-bold text-sky-800 hover:bg-sky-100"
                                >
                                  Thống kê
                                </button>
                                <button
                                  type="button"
                                  onClick={() => startEditClass(cls)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-800"
                                >
                                  <Edit3 className="h-3.5 w-3.5" />
                                  Sửa
                                </button>
                                {isConfirming ? (
                                  <div className="flex items-center gap-1">
                                    <button
                                      type="button"
                                      onClick={() => handleDeleteClass(cls)}
                                      className="rounded-lg bg-rose-600 px-2.5 py-1.5 text-xs font-bold text-white hover:bg-rose-700"
                                    >
                                      Xác nhận xóa
                                    </button>
                                    <button
                                      type="button"
                                      onClick={() => setConfirmDeleteClassId(null)}
                                      className="rounded-lg border border-slate-300 bg-white px-2 py-1.5 text-xs font-semibold text-slate-600"
                                    >
                                      Hủy
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setConfirmDeleteClassId(cls.id)}
                                    className="inline-flex items-center gap-1 rounded-lg border border-rose-200 bg-white px-2.5 py-1.5 text-xs font-bold text-rose-700 hover:bg-rose-50"
                                  >
                                    <Trash2 className="h-3.5 w-3.5" />
                                    Xóa
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* TEACHER SUB-TAB B: PER-CLASS DETAILED ANALYTICS */}
              {teacherSubTab === 'analytics' && (
                <div className="space-y-5">
                  {classes.length === 0 ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-600">
                      Vui lòng tạo ít nhất 1 danh sách lớp ở mục <strong>Nhập danh sách lớp</strong> để xem thống kê.
                    </div>
                  ) : teacherAnalytics ? (
                    <>
                      <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                        <div className="flex items-center gap-2.5">
                          <label htmlFor="teacher-analytics-class" className="text-xs font-bold text-slate-700">
                            Chọn lớp xem thống kê:
                          </label>
                          <select
                            id="teacher-analytics-class"
                            value={analyticsClassId}
                            onChange={(e) => setAnalyticsClassId(e.target.value)}
                            className="rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-sm font-bold text-slate-900 focus:border-emerald-600 focus:outline-none"
                          >
                            {classes.map((cls) => (
                              <option key={cls.id} value={cls.id}>
                                Lớp {cls.className} (Khối {cls.grade} · {cls.students.length} HS)
                              </option>
                            ))}
                          </select>
                        </div>

                        <button
                          type="button"
                          onClick={() => exportClassCsv(teacherAnalytics.cls.id)}
                          className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                        >
                          <Download className="h-4 w-4" />
                          Xuất bảng điểm lớp {teacherAnalytics.cls.className} (CSV/Excel)
                        </button>
                      </div>

                      {/* KPI Cards */}
                      <div className="grid grid-cols-2 gap-3.5 lg:grid-cols-4">
                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Tỉ lệ nộp bài</span>
                            <UserCheck className="h-4 w-4 text-emerald-600" />
                          </div>
                          <p className="mt-1.5 text-2xl font-extrabold text-slate-900 font-mono-num">
                            {teacherAnalytics.bestForClass.length}/{teacherAnalytics.cls.students.length}
                            <span className="ml-1.5 text-sm font-bold text-emerald-700">
                              ({teacherAnalytics.participationPct}%)
                            </span>
                          </p>
                          <div className="mt-2 h-2 w-full overflow-hidden rounded-full bg-slate-100">
                            <div
                              className="h-full rounded-full bg-emerald-600 transition-all"
                              style={{ width: `${teacherAnalytics.participationPct}%` }}
                            />
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Điểm trung bình lớp</span>
                            <BarChart3 className="h-4 w-4 text-sky-600" />
                          </div>
                          <p className="mt-1.5 text-2xl font-extrabold text-sky-800 font-mono-num">
                            {teacherAnalytics.avgScore}
                            <span className="ml-1 text-xs font-semibold text-slate-500">điểm</span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500 font-mono-num">
                            Chính xác TB: {teacherAnalytics.avgAccuracy}%
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Thời gian TB · Cao/Thấp</span>
                            <Clock className="h-4 w-4 text-amber-600" />
                          </div>
                          <p className="mt-1.5 text-2xl font-extrabold text-emerald-700 font-mono-num">
                            {formatDuration(teacherAnalytics.avgDurationSec)}
                          </p>
                          <p className="mt-1 text-xs text-slate-500 font-mono-num">
                            Điểm: {teacherAnalytics.maxScore} cao nhất / {teacherAnalytics.minScore} thấp nhất
                          </p>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-4">
                          <div className="flex items-center justify-between text-xs font-semibold text-slate-500">
                            <span>Học sinh chưa nộp</span>
                            <UserX className="h-4 w-4 text-rose-600" />
                          </div>
                          <p className="mt-1.5 text-2xl font-extrabold text-rose-700 font-mono-num">
                            {teacherAnalytics.missingStudents.length}
                            <span className="ml-1 text-xs font-semibold text-slate-500">học sinh</span>
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            Trên tổng {teacherAnalytics.cls.students.length} HS lớp {teacherAnalytics.cls.className}
                          </p>
                        </div>
                      </div>

                      {/* Score Tier Distribution + Missing Students */}
                      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6">
                          <h4 className="text-sm font-bold text-slate-900">
                            Phân bố mức điểm lớp {teacherAnalytics.cls.className}
                          </h4>
                          <div className="mt-4 space-y-3">
                            {teacherAnalytics.tiers.map((tier) => {
                              const pct =
                                teacherAnalytics.bestForClass.length > 0
                                  ? Math.round((tier.count / teacherAnalytics.bestForClass.length) * 100)
                                  : 0;
                              return (
                                <div key={tier.label}>
                                  <div className="flex items-center justify-between text-xs font-semibold text-slate-700">
                                    <span>{tier.label}</span>
                                    <span className="font-mono-num">
                                      {tier.count} HS ({pct}%)
                                    </span>
                                  </div>
                                  <div className="mt-1 h-2.5 w-full overflow-hidden rounded-full bg-slate-100">
                                    <div
                                      className={`h-full rounded-full ${tier.barClass}`}
                                      style={{ width: `${pct}%` }}
                                    />
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                        </div>

                        <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-6">
                          <div className="flex items-center justify-between">
                            <h4 className="text-sm font-bold text-slate-900">
                              Danh sách học sinh chưa nộp bài ({teacherAnalytics.missingStudents.length})
                            </h4>
                            <Users className="h-4 w-4 text-slate-400" />
                          </div>
                          {teacherAnalytics.missingStudents.length === 0 ? (
                            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 p-3.5 text-xs font-semibold text-emerald-900">
                              Tuyệt vời! 100% học sinh lớp {teacherAnalytics.cls.className} đã hoàn thành nộp bài.
                            </p>
                          ) : (
                            <div className="mt-3 max-h-48 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
                              <ol className="grid grid-cols-1 gap-1.5 text-xs font-medium text-slate-800 sm:grid-cols-2">
                                {teacherAnalytics.missingStudents.map((name, i) => (
                                  <li key={name} className="flex items-center gap-1.5">
                                    <span className="font-mono-num text-slate-400">{i + 1}.</span>
                                    <span>{name}</span>
                                  </li>
                                ))}
                              </ol>
                            </div>
                          )}
                        </div>
                      </div>

                      {/* Submissions Table with Teacher Delete Control */}
                      <div className="rounded-2xl border border-slate-200 bg-white p-5">
                        <div className="flex flex-wrap items-center justify-between gap-2">
                          <h4 className="text-sm font-bold text-slate-900">
                            Bảng điểm chi tiết lớp {teacherAnalytics.cls.className}
                          </h4>
                          <label className="inline-flex cursor-pointer items-center gap-2 text-xs font-semibold text-slate-600">
                            <input
                              type="checkbox"
                              checked={showAllAttempts}
                              onChange={(e) => setShowAllAttempts(e.target.checked)}
                              className="h-3.5 w-3.5 accent-emerald-700"
                            />
                            Hiển thị tất cả lượt nộp ({teacherAnalytics.allForClass.length})
                          </label>
                        </div>

                        {(showAllAttempts
                          ? teacherAnalytics.allForClass
                          : teacherAnalytics.bestForClass
                        ).length === 0 ? (
                          <p className="py-8 text-center text-sm text-slate-500">
                            Chưa có bài nộp nào cho lớp này.
                          </p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[700px] border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                                  <th className="py-2.5 pr-3">Hạng</th>
                                  <th className="py-2.5 pr-3">Họ và tên</th>
                                  <th className="py-2.5 pr-3 text-right">Điểm</th>
                                  <th className="py-2.5 pr-3 text-right">Thời gian</th>
                                  <th className="py-2.5 pr-3 text-right">Câu đúng</th>
                                  <th className="py-2.5 pr-3 text-right">Chính xác</th>
                                  <th className="py-2.5 pr-3 text-right">Nộp lúc</th>
                                  <th className="py-2.5 text-right">Thao tác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {(showAllAttempts
                                  ? teacherAnalytics.allForClass
                                  : teacherAnalytics.bestForClass
                                ).map((sub, idx) => (
                                  <tr key={sub.id}>
                                    <td className="py-2.5 pr-3">{renderRankBadge(idx)}</td>
                                    <td className="py-2.5 pr-3 font-semibold text-slate-900">{sub.studentName}</td>
                                    <td className="py-2.5 pr-3 text-right font-extrabold text-sky-800 font-mono-num">
                                      {sub.score}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right font-bold text-emerald-700 font-mono-num">
                                      {formatDuration(sub.durationSec)}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right text-slate-700 font-mono-num">
                                      {sub.correctCount}/{sub.totalQuestions}
                                    </td>
                                    <td className="py-2.5 pr-3 text-right text-slate-700 font-mono-num">
                                      {sub.accuracy}%
                                    </td>
                                    <td className="py-2.5 pr-3 text-right text-xs text-slate-500 font-mono-num">
                                      {formatDateTime(sub.submittedAt)}
                                    </td>
                                    <td className="py-2.5 text-right">
                                      {confirmDeleteSubId === sub.id ? (
                                        <span className="inline-flex items-center gap-1">
                                          <button
                                            type="button"
                                            onClick={() => handleDeleteSubmission(sub)}
                                            className="rounded bg-rose-600 px-2 py-1 text-xs font-bold text-white"
                                          >
                                            Xóa
                                          </button>
                                          <button
                                            type="button"
                                            onClick={() => setConfirmDeleteSubId(null)}
                                            className="rounded border border-slate-300 px-2 py-1 text-xs text-slate-600"
                                          >
                                            Hủy
                                          </button>
                                        </span>
                                      ) : (
                                        <button
                                          type="button"
                                          onClick={() => setConfirmDeleteSubId(sub.id)}
                                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2 py-1 text-xs font-semibold text-slate-600 hover:border-rose-300 hover:text-rose-700"
                                        >
                                          <Trash2 className="h-3.5 w-3.5" />
                                          Xóa
                                        </button>
                                      )}
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </>
                  ) : null}
                </div>
              )}

              {/* TEACHER SUB-TAB C: RANKINGS BY CLASS & GRADE WITH EXPORT */}
              {teacherSubTab === 'rankings' && (
                <div className="space-y-5">
                  <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        onClick={() => setTeacherRankScope('grade')}
                        className={`rounded-xl px-4 py-2 text-xs font-bold ${
                          teacherRankScope === 'grade'
                            ? 'bg-amber-600 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        Xếp hạng theo Khối
                      </button>
                      <button
                        type="button"
                        onClick={() => setTeacherRankScope('class')}
                        className={`rounded-xl px-4 py-2 text-xs font-bold ${
                          teacherRankScope === 'class'
                            ? 'bg-sky-700 text-white'
                            : 'border border-slate-200 bg-slate-50 text-slate-700'
                        }`}
                      >
                        Xếp hạng theo Lớp
                      </button>

                      {teacherRankScope === 'grade' ? (
                        <div className="ml-2 flex items-center gap-1.5">
                          {(activeGrades.length > 0 ? activeGrades : GRADES).map((g) => (
                            <button
                              key={g}
                              type="button"
                              onClick={() => setTeacherRankGrade(g)}
                              className={`rounded-lg px-3 py-1.5 text-xs font-bold ${
                                teacherRankGrade === g
                                  ? 'bg-emerald-700 text-white'
                                  : 'border border-slate-200 bg-slate-50 text-slate-700'
                              }`}
                            >
                              Khối {g}
                            </button>
                          ))}
                        </div>
                      ) : (
                        <select
                          value={teacherRankClassId}
                          onChange={(e) => setTeacherRankClassId(e.target.value)}
                          className="ml-2 rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-bold text-slate-900"
                        >
                          {classes.map((cls) => (
                            <option key={cls.id} value={cls.id}>
                              Lớp {cls.className} (Khối {cls.grade})
                            </option>
                          ))}
                        </select>
                      )}
                    </div>

                    <button
                      type="button"
                      onClick={() =>
                        teacherRankScope === 'grade'
                          ? exportGradeCsv(teacherRankGrade)
                          : exportClassCsv(teacherRankClassId)
                      }
                      className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800"
                    >
                      <Download className="h-4 w-4" />
                      {teacherRankScope === 'grade'
                        ? `Xuất CSV Khối ${teacherRankGrade}`
                        : 'Xuất CSV Lớp đang chọn'}
                    </button>
                  </div>

                  {teacherRankScope === 'grade' ? (
                    <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
                      <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-5">
                        <h4 className="text-base font-bold text-slate-900">
                          Xếp hạng các lớp — Khối {teacherRankGrade}
                        </h4>
                        {teacherGradeData.classSummaries.length === 0 ? (
                          <p className="py-6 text-center text-sm text-slate-500">
                            Chưa có lớp nào trong Khối {teacherRankGrade}.
                          </p>
                        ) : (
                          <div className="mt-3 space-y-2.5">
                            {teacherGradeData.classSummaries.map((row, idx) => (
                              <div
                                key={row.classRoster.id}
                                className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50/70 p-3"
                              >
                                <div className="flex items-center gap-3">
                                  {renderRankBadge(idx)}
                                  <div>
                                    <p className="text-sm font-bold text-slate-900">
                                      Lớp {row.classRoster.className}
                                    </p>
                                    <p className="text-xs text-slate-500 font-mono-num">
                                      Nộp: {row.submittedCount}/{row.rosterCount} ({row.participationRate}%)
                                    </p>
                                  </div>
                                </div>
                                <div className="text-right font-mono-num">
                                  <p className="text-sm font-extrabold text-sky-800">TB {row.avgScore} đ</p>
                                  <p className="text-xs text-emerald-700">
                                    TB {formatDuration(row.avgDurationSec)}
                                  </p>
                                </div>
                              </div>
                            ))}
                          </div>
                        )}
                      </div>

                      <div className="rounded-2xl border border-slate-200 bg-white p-5 lg:col-span-7">
                        <h4 className="text-base font-bold text-slate-900">
                          Bảng xếp hạng học sinh toàn Khối {teacherRankGrade} ({teacherGradeData.gradeBestSubs.length} HS)
                        </h4>
                        {teacherGradeData.gradeBestSubs.length === 0 ? (
                          <p className="py-6 text-center text-sm text-slate-500">
                            Chưa có bài nộp nào trong Khối {teacherRankGrade}.
                          </p>
                        ) : (
                          <div className="mt-3 overflow-x-auto">
                            <table className="w-full min-w-[520px] border-collapse text-left text-sm">
                              <thead>
                                <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                                  <th className="py-2 pr-2">Hạng</th>
                                  <th className="py-2 pr-2">Họ và tên</th>
                                  <th className="py-2 pr-2">Lớp</th>
                                  <th className="py-2 pr-2 text-right">Điểm</th>
                                  <th className="py-2 pr-2 text-right">Thời gian</th>
                                  <th className="py-2 text-right">Chính xác</th>
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-slate-100">
                                {teacherGradeData.gradeBestSubs.map((sub, idx) => (
                                  <tr key={sub.id}>
                                    <td className="py-2.5 pr-2">{renderRankBadge(idx)}</td>
                                    <td className="py-2.5 pr-2 font-semibold text-slate-900">{sub.studentName}</td>
                                    <td className="py-2.5 pr-2 font-bold text-sky-800">{sub.className}</td>
                                    <td className="py-2.5 pr-2 text-right font-extrabold text-sky-800 font-mono-num">
                                      {sub.score}
                                    </td>
                                    <td className="py-2.5 pr-2 text-right font-bold text-emerald-700 font-mono-num">
                                      {formatDuration(sub.durationSec)}
                                    </td>
                                    <td className="py-2.5 text-right text-slate-700 font-mono-num">
                                      {sub.accuracy}%
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          </div>
                        )}
                      </div>
                    </div>
                  ) : teacherClassRanking ? (
                    <div className="rounded-2xl border border-slate-200 bg-white p-5">
                      <h4 className="text-base font-bold text-slate-900">
                        Bảng xếp hạng Lớp {teacherClassRanking.cls.className} (Khối {teacherClassRanking.cls.grade})
                      </h4>
                      {teacherClassRanking.bestForClass.length === 0 ? (
                        <p className="py-6 text-center text-sm text-slate-500">
                          Lớp {teacherClassRanking.cls.className} chưa có học sinh nộp bài.
                        </p>
                      ) : (
                        <div className="mt-3 overflow-x-auto">
                          <table className="w-full min-w-[580px] border-collapse text-left text-sm">
                            <thead>
                              <tr className="border-b border-slate-200 text-xs font-bold text-slate-500">
                                <th className="py-2.5 pr-3">Hạng</th>
                                <th className="py-2.5 pr-3">Họ và tên</th>
                                <th className="py-2.5 pr-3 text-right">Điểm</th>
                                <th className="py-2.5 pr-3 text-right">Thời gian</th>
                                <th className="py-2.5 pr-3 text-right">Câu đúng</th>
                                <th className="py-2.5 text-right">Chính xác</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-100">
                              {teacherClassRanking.bestForClass.map((sub, idx) => (
                                <tr key={sub.id}>
                                  <td className="py-2.5 pr-3">{renderRankBadge(idx)}</td>
                                  <td className="py-2.5 pr-3 font-semibold text-slate-900">{sub.studentName}</td>
                                  <td className="py-2.5 pr-3 text-right font-extrabold text-sky-800 font-mono-num">
                                    {sub.score}
                                  </td>
                                  <td className="py-2.5 pr-3 text-right font-bold text-emerald-700 font-mono-num">
                                    {formatDuration(sub.durationSec)}
                                  </td>
                                  <td className="py-2.5 pr-3 text-right text-slate-700 font-mono-num">
                                    {sub.correctCount}/{sub.totalQuestions}
                                  </td>
                                  <td className="py-2.5 text-right text-slate-700 font-mono-num">
                                    {sub.accuracy}%
                                  </td>
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </div>
                      )}
                    </div>
                  ) : null}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}

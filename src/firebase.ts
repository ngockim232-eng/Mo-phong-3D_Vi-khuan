import { initializeApp } from 'firebase/app';
import {
  createUserWithEmailAndPassword,
  getAuth,
  GoogleAuthProvider,
  sendEmailVerification,
  sendPasswordResetEmail,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  doc,
  getDocFromServer,
  getFirestore,
  type Timestamp,
} from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';

const app = initializeApp(firebaseConfig);
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);
const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
  login_hint: 'ngockim232@gmail.com',
});

export const ADMIN_EMAIL = 'ngockim232@gmail.com';
export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null,
): never {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

export function isAuthorizedTeacherEmail(email: string | null | undefined): boolean {
  return Boolean(email && email.trim().toLowerCase() === ADMIN_EMAIL.toLowerCase());
}

export function isTeacherUser(user: User | null): boolean {
  return Boolean(user && user.emailVerified && isAuthorizedTeacherEmail(user.email));
}

export function isUnverifiedTeacherUser(user: User | null): boolean {
  return Boolean(user && !user.emailVerified && isAuthorizedTeacherEmail(user.email));
}

export class UnauthorizedTeacherError extends Error {
  attemptedEmail: string;

  constructor(attemptedEmail: string) {
    super(
      `Tài khoản ${attemptedEmail || 'này'} không được phép đăng nhập. Hệ thống chỉ cho phép duy nhất tài khoản Giáo viên (${ADMIN_EMAIL}).`,
    );
    this.name = 'UnauthorizedTeacherError';
    this.attemptedEmail = attemptedEmail;
  }
}

export interface FormattedAuthError {
  code: string;
  message: string;
  needsEmailProviderEnable?: boolean;
}

export function formatFirebaseAuthError(error: unknown): FormattedAuthError {
  if (error instanceof UnauthorizedTeacherError) {
    return { code: 'unauthorized-teacher', message: error.message };
  }
  const code =
    typeof error === 'object' && error !== null && 'code' in error
      ? String((error as { code?: unknown }).code ?? '')
      : '';

  switch (code) {
    case 'auth/operation-not-allowed':
    case 'auth/configuration-not-found':
      return {
        code,
        needsEmailProviderEnable: true,
        message:
          'Phương thức đăng nhập bằng Email/Mật khẩu chưa được bật trong Firebase Console. Thầy/Cô vui lòng bật "Email/Password" trong Firebase Authentication hoặc dùng nút "Đăng nhập nhanh bằng Google" bên dưới.',
      };
    case 'auth/invalid-credential':
    case 'auth/wrong-password':
    case 'auth/user-not-found':
      return {
        code,
        message:
          'Sai mật khẩu hoặc Gmail này chưa được tạo mật khẩu đăng nhập trên hệ thống. Lưu ý: mật khẩu này là mật khẩu riêng của ứng dụng (không tự lấy mật khẩu Gmail). Thầy/Cô hãy chọn "Tạo mật khẩu lần đầu", bấm "Quên mật khẩu?" hoặc dùng nút Google bên dưới.',
      };
    case 'auth/email-already-in-use':
      return {
        code,
        message:
          'Gmail này đã tồn tại trên hệ thống (có thể đã đăng nhập bằng Google trước đó). Thầy/Cô hãy chuyển sang mục "Đăng nhập" hoặc bấm "Quên mật khẩu?" để nhận link đặt mật khẩu mới qua Gmail.',
      };
    case 'auth/weak-password':
      return {
        code,
        message: 'Mật khẩu cần có ít nhất 6 ký tự.',
      };
    case 'auth/invalid-email':
      return {
        code,
        message: 'Địa chỉ Gmail không đúng định dạng.',
      };
    case 'auth/popup-blocked':
      return {
        code,
        message:
          'Trình duyệt đang chặn cửa sổ bật lên (Popup) của Google. Hãy cho phép Popup, mở ứng dụng trong tab trình duyệt mới, hoặc đăng nhập bằng biểu mẫu Gmail & Mật khẩu ở trên.',
      };
    case 'auth/popup-closed-by-user':
    case 'auth/cancelled-popup-request':
      return {
        code,
        message:
          'Cửa sổ đăng nhập Google đã bị đóng trước khi hoàn tất. Vui lòng thử lại hoặc đăng nhập bằng Gmail & Mật khẩu.',
      };
    case 'auth/unauthorized-domain':
      return {
        code,
        message:
          'Tên miền hiện tại chưa được cấp phép cho cửa sổ đăng nhập Google trong Firebase Console (Authentication → Settings → Authorized domains).',
      };
    case 'auth/too-many-requests':
      return {
        code,
        message: 'Đã thử đăng nhập quá nhiều lần. Vui lòng đợi vài phút rồi thử lại.',
      };
    case 'auth/network-request-failed':
      return {
        code,
        message: 'Không thể kết nối máy chủ xác thực. Vui lòng kiểm tra kết nối mạng.',
      };
    default:
      return {
        code: code || 'unknown',
        message: `Đăng nhập chưa hoàn tất${code ? ` (${code})` : ''}. Vui lòng thử lại.`,
      };
  }
}

export async function signInWithGoogle(): Promise<User> {
  const result = await signInWithPopup(auth, googleProvider);
  if (!isTeacherUser(result.user)) {
    const attempted = result.user.email ?? '';
    await signOut(auth);
    throw new UnauthorizedTeacherError(attempted);
  }
  return result.user;
}

export async function signInTeacherWithEmailPassword(
  email: string,
  password: string,
): Promise<User> {
  const normalized = email.trim();
  if (!isAuthorizedTeacherEmail(normalized)) {
    throw new UnauthorizedTeacherError(normalized);
  }
  const result = await signInWithEmailAndPassword(auth, normalized, password);
  if (!isAuthorizedTeacherEmail(result.user.email)) {
    const attempted = result.user.email ?? '';
    await signOut(auth);
    throw new UnauthorizedTeacherError(attempted);
  }
  return result.user;
}

export async function registerTeacherWithEmailPassword(
  email: string,
  password: string,
): Promise<User> {
  const normalized = email.trim();
  if (!isAuthorizedTeacherEmail(normalized)) {
    throw new UnauthorizedTeacherError(normalized);
  }
  const result = await createUserWithEmailAndPassword(auth, normalized, password);
  if (!result.user.emailVerified) {
    try {
      await sendEmailVerification(result.user);
    } catch {
      // Non-fatal; user can click resend in the verification card
    }
  }
  return result.user;
}

export async function resendTeacherVerificationEmail(): Promise<void> {
  if (!auth.currentUser || !isAuthorizedTeacherEmail(auth.currentUser.email)) {
    throw new UnauthorizedTeacherError(auth.currentUser?.email ?? '');
  }
  await sendEmailVerification(auth.currentUser);
}

export async function reloadTeacherUser(): Promise<User | null> {
  const current = auth.currentUser;
  if (!current) return null;
  await current.reload();
  await current.getIdToken(true);
  return auth.currentUser;
}

export async function sendTeacherPasswordReset(email: string): Promise<void> {
  const normalized = email.trim();
  if (!isAuthorizedTeacherEmail(normalized)) {
    throw new UnauthorizedTeacherError(normalized);
  }
  await sendPasswordResetEmail(auth, normalized);
}

export async function signOutUser(): Promise<void> {
  await signOut(auth);
}

export type CompetitionSectionKey = 'dragdrop' | 'shape' | 'quiz' | 'function' | 'custom';

export type QuestionFormat = 'multiple_choice' | 'true_false';

export interface ClassRoster {
  id: string;
  teacherUid: string;
  className: string;
  grade: number;
  students: string[];
  isActive: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface StudentSubmission {
  id: string;
  classId: string;
  className: string;
  grade: number;
  studentName: string;
  score: number;
  correctCount: number;
  totalQuestions: number;
  accuracy: number;
  bestStreak: number;
  durationSec: number;
  completedSections: CompetitionSectionKey[];
  isPublic: boolean;
  submittedAt: Timestamp | null;
}

export interface QuestionType {
  id: string;
  teacherUid: string;
  title: string;
  description: string;
  format: QuestionFormat;
  pointsPerQuestion: number;
  isActive: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

export interface CustomQuestion {
  id: string;
  teacherUid: string;
  categoryId: string;
  question: string;
  options: string[];
  correctIndex: number;
  hint: string;
  explanation: string;
  points: number;
  isActive: boolean;
  createdAt: Timestamp | null;
  updatedAt: Timestamp | null;
}

// Startup connectivity validation per Firebase integration guidelines
async function testConnection() {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      console.error('Please check your Firebase configuration.');
    }
  }
}
void testConnection();

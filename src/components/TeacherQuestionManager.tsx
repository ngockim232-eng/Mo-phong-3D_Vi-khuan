import { useEffect, useMemo, useState } from 'react';
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
  BookOpenCheck,
  CheckCircle2,
  Edit3,
  FolderPlus,
  HelpCircle,
  Plus,
  Trash2,
} from 'lucide-react';
import {
  db,
  handleFirestoreError,
  OperationType,
  type CustomQuestion,
  type QuestionFormat,
  type QuestionType,
} from '../firebase';
import { labSound } from '../utils/sound';

interface TeacherQuestionManagerProps {
  teacherUid: string;
  onError: (err: Error) => void;
}

function makeSafeId(prefix: string): string {
  const rand = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${Date.now()}_${rand}`.replace(/[^a-zA-Z0-9_-]/g, '');
}

const FORMAT_LABELS: Record<QuestionFormat, string> = {
  multiple_choice: 'Trắc nghiệm (A, B, C, D)',
  true_false: 'Đúng / Sai',
};

export function TeacherQuestionManager({ teacherUid, onError }: TeacherQuestionManagerProps) {
  const [questionTypes, setQuestionTypes] = useState<QuestionType[]>([]);
  const [questions, setQuestions] = useState<CustomQuestion[]>([]);
  const [loading, setLoading] = useState(true);

  // Selected category for adding/viewing questions ('quiz' = built-in Chặng 1, or a custom typeId)
  const [selectedCategoryId, setSelectedCategoryId] = useState<string>('quiz');

  // Category Form State
  const [editingTypeId, setEditingTypeId] = useState<string | null>(null);
  const [typeTitle, setTypeTitle] = useState('');
  const [typeDesc, setTypeDesc] = useState('');
  const [typeFormat, setTypeFormat] = useState<QuestionFormat>('multiple_choice');
  const [typePoints, setTypePoints] = useState<number>(10);
  const [savingType, setSavingType] = useState(false);
  const [confirmDeleteTypeId, setConfirmDeleteTypeId] = useState<string | null>(null);

  // Question Form State
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [qText, setQText] = useState('');
  const [qOptions, setQOptions] = useState<[string, string, string, string]>(['', '', '', '']);
  const [qCorrectIdx, setQCorrectIdx] = useState<number>(0);
  const [qHint, setQHint] = useState('');
  const [qExplanation, setQExplanation] = useState('');
  const [qPoints, setQPoints] = useState<number>(10);
  const [savingQuestion, setSavingQuestion] = useState(false);
  const [confirmDeleteQId, setConfirmDeleteQId] = useState<string | null>(null);

  const [feedback, setFeedback] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // Subscribe to custom question types
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
        setQuestionTypes(list);
        setLoading(false);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'question_types');
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, [onError]);

  // Subscribe to custom questions
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
        setQuestions(list);
      },
      (err) => {
        try {
          handleFirestoreError(err, OperationType.LIST, 'questions');
        } catch (wrapped) {
          onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
        }
      },
    );
    return unsub;
  }, [onError]);

  const selectedCategoryMeta = useMemo(() => {
    if (selectedCategoryId === 'quiz') {
      return {
        id: 'quiz',
        title: 'Trắc nghiệm kiến thức (Mặc định · Chặng 1)',
        format: 'multiple_choice' as QuestionFormat,
        pointsPerQuestion: 10,
      };
    }
    const found = questionTypes.find((t) => t.id === selectedCategoryId);
    if (!found) {
      return {
        id: 'quiz',
        title: 'Trắc nghiệm kiến thức (Mặc định · Chặng 1)',
        format: 'multiple_choice' as QuestionFormat,
        pointsPerQuestion: 10,
      };
    }
    return found;
  }, [selectedCategoryId, questionTypes]);

  // Sync question form defaults when switching category (unless editing an existing question)
  useEffect(() => {
    if (editingQuestionId) return;
    setQPoints(selectedCategoryMeta.pointsPerQuestion);
    if (selectedCategoryMeta.format === 'true_false') {
      setQOptions(['Đúng', 'Sai', '', '']);
      setQCorrectIdx(0);
    } else {
      setQOptions((prev) =>
        prev[0] === 'Đúng' && prev[1] === 'Sai' && !prev[2] && !prev[3] ? ['', '', '', ''] : prev,
      );
    }
  }, [selectedCategoryMeta, editingQuestionId]);

  const questionsInSelectedCategory = useMemo(
    () => questions.filter((q) => q.categoryId === selectedCategoryMeta.id),
    [questions, selectedCategoryMeta.id],
  );

  const countByCategory = useMemo(() => {
    const map = new Map<string, number>();
    for (const q of questions) {
      map.set(q.categoryId, (map.get(q.categoryId) ?? 0) + 1);
    }
    return map;
  }, [questions]);

  const resetTypeForm = () => {
    setEditingTypeId(null);
    setTypeTitle('');
    setTypeDesc('');
    setTypeFormat('multiple_choice');
    setTypePoints(10);
  };

  const resetQuestionForm = () => {
    setEditingQuestionId(null);
    setQText('');
    setQHint('');
    setQExplanation('');
    setQPoints(selectedCategoryMeta.pointsPerQuestion);
    if (selectedCategoryMeta.format === 'true_false') {
      setQOptions(['Đúng', 'Sai', '', '']);
      setQCorrectIdx(0);
    } else {
      setQOptions(['', '', '', '']);
      setQCorrectIdx(0);
    }
  };

  const handleSaveType = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const cleanTitle = typeTitle.trim();
    const cleanDesc = typeDesc.trim();
    if (cleanTitle.length < 2 || cleanTitle.length > 80) {
      setFeedback({
        type: 'error',
        text: 'Tên dạng câu hỏi cần từ 2 đến 80 ký tự (ví dụ: Đúng / Sai về vi khuẩn).',
      });
      return;
    }

    setSavingType(true);
    try {
      if (editingTypeId) {
        await updateDoc(doc(db, 'question_types', editingTypeId), {
          title: cleanTitle,
          description: cleanDesc.slice(0, 200),
          format: typeFormat,
          pointsPerQuestion: Math.max(5, Math.min(50, Math.round(typePoints))),
          isActive: true,
          updatedAt: serverTimestamp(),
        });
        setFeedback({
          type: 'success',
          text: `Đã cập nhật dạng câu hỏi "${cleanTitle}".`,
        });
        resetTypeForm();
      } else {
        const newId = makeSafeId('qtype');
        await setDoc(doc(db, 'question_types', newId), {
          teacherUid,
          title: cleanTitle,
          description: cleanDesc.slice(0, 200),
          format: typeFormat,
          pointsPerQuestion: Math.max(5, Math.min(50, Math.round(typePoints))),
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        setSelectedCategoryId(newId);
        setFeedback({
          type: 'success',
          text: `Đã thêm dạng câu hỏi "${cleanTitle}". Thầy/Cô có thể thêm câu hỏi vào dạng này ở khung bên phải!`,
        });
        resetTypeForm();
      }
      labSound.playSuccess();
    } catch (err) {
      setSavingType(false);
      try {
        handleFirestoreError(
          err,
          editingTypeId ? OperationType.UPDATE : OperationType.CREATE,
          editingTypeId ? `question_types/${editingTypeId}` : 'question_types',
        );
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSavingType(false);
  };

  const handleSeedTrueFalseCategory = async () => {
    setSavingType(true);
    setFeedback(null);
    try {
      const existingType = questionTypes.find(
        (t) => t.title.toLowerCase() === 'đúng / sai về vi khuẩn',
      );
      const typeId = existingType ? existingType.id : makeSafeId('qtype');
      if (!existingType) {
        await setDoc(doc(db, 'question_types', typeId), {
          teacherUid,
          title: 'Đúng / Sai về vi khuẩn',
          description: 'Đọc nhanh nhận định và chọn Đúng hoặc Sai',
          format: 'true_false',
          pointsPerQuestion: 10,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      const samples = [
        {
          question: 'Tế bào vi khuẩn đã có nhân hoàn chỉnh với màng nhân bao bọc rõ ràng.',
          options: ['Đúng', 'Sai'],
          correctIndex: 1,
          hint: 'Vi khuẩn thuộc nhóm sinh vật nhân sơ, chỉ có vùng nhân (Nucleoid) không có màng nhân.',
          explanation: 'Sai — vi khuẩn là sinh vật nhân sơ nên chỉ có vùng nhân, chưa có màng nhân.',
        },
        {
          question: 'Một số loài vi khuẩn có lợi giúp lên men làm sữa chua, muối dưa và phân giải chất hữu cơ.',
          options: ['Đúng', 'Sai'],
          correctIndex: 0,
          hint: 'Hãy nghĩ đến vi khuẩn Lactic trong sữa chua và vi khuẩn phân giải trong đất.',
          explanation: 'Đúng — rất nhiều loài vi khuẩn có ích trong thực phẩm, nông nghiệp và tự nhiên.',
        },
      ];

      for (const s of samples) {
        const dup = questions.some(
          (q) => q.categoryId === typeId && q.question.toLowerCase() === s.question.toLowerCase(),
        );
        if (dup) continue;
        const qId = makeSafeId('q');
        await setDoc(doc(db, 'questions', qId), {
          teacherUid,
          categoryId: typeId,
          question: s.question,
          options: s.options,
          correctIndex: s.correctIndex,
          hint: s.hint,
          explanation: s.explanation,
          points: 10,
          isActive: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }

      setSelectedCategoryId(typeId);
      labSound.playSuccess();
      setFeedback({
        type: 'success',
        text: 'Đã thêm nhanh dạng "Đúng / Sai về vi khuẩn" kèm 2 câu hỏi mẫu. Học sinh sẽ thấy ngay chặng mới trong mục Thử thách!',
      });
    } catch (err) {
      setSavingType(false);
      try {
        handleFirestoreError(err, OperationType.CREATE, 'question_types');
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSavingType(false);
  };

  const handleDeleteType = async (qt: QuestionType) => {
    try {
      // Delete questions belonging to this category first so no orphaned questions remain
      const childQuestions = questions.filter((q) => q.categoryId === qt.id);
      for (const child of childQuestions) {
        await deleteDoc(doc(db, 'questions', child.id));
      }
      await deleteDoc(doc(db, 'question_types', qt.id));
      setConfirmDeleteTypeId(null);
      if (selectedCategoryId === qt.id) setSelectedCategoryId('quiz');
      if (editingTypeId === qt.id) resetTypeForm();
      setFeedback({
        type: 'success',
        text: `Đã xóa dạng câu hỏi "${qt.title}" và ${childQuestions.length} câu hỏi thuộc dạng này.`,
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `question_types/${qt.id}`);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  };

  const handleSaveQuestion = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const cleanQ = qText.trim();
    if (cleanQ.length < 5 || cleanQ.length > 400) {
      setFeedback({
        type: 'error',
        text: 'Nội dung câu hỏi cần từ 5 đến 400 ký tự.',
      });
      return;
    }

    let finalOptions: string[];
    let finalCorrectIdx = qCorrectIdx;
    if (selectedCategoryMeta.format === 'true_false') {
      finalOptions = ['Đúng', 'Sai'];
      finalCorrectIdx = qCorrectIdx === 1 ? 1 : 0;
    } else {
      const cleaned = qOptions.map((o) => o.trim().slice(0, 200));
      const nonEmptyIndices: number[] = [];
      cleaned.forEach((val, idx) => {
        if (val.length > 0) nonEmptyIndices.push(idx);
      });
      if (nonEmptyIndices.length < 2) {
        setFeedback({
          type: 'error',
          text: 'Vui lòng nhập ít nhất 2 phương án trả lời (A và B).',
        });
        return;
      }
      if (!cleaned[qCorrectIdx]) {
        setFeedback({
          type: 'error',
          text: 'Phương án được chọn làm Đáp án đúng đang bị để trống.',
        });
        return;
      }
      finalOptions = nonEmptyIndices.map((idx) => cleaned[idx]);
      finalCorrectIdx = nonEmptyIndices.indexOf(qCorrectIdx);
    }

    setSavingQuestion(true);
    try {
      const payloadCommon = {
        categoryId: selectedCategoryMeta.id,
        question: cleanQ,
        options: finalOptions,
        correctIndex: finalCorrectIdx,
        hint: qHint.trim().slice(0, 250),
        explanation: qExplanation.trim().slice(0, 300),
        points: Math.max(5, Math.min(50, Math.round(qPoints))),
        isActive: true,
        updatedAt: serverTimestamp(),
      };

      if (editingQuestionId) {
        await updateDoc(doc(db, 'questions', editingQuestionId), payloadCommon);
        setFeedback({
          type: 'success',
          text: 'Đã cập nhật nội dung câu hỏi.',
        });
      } else {
        const newId = makeSafeId('q');
        await setDoc(doc(db, 'questions', newId), {
          ...payloadCommon,
          teacherUid,
          createdAt: serverTimestamp(),
        });
        setFeedback({
          type: 'success',
          text: `Đã bổ sung câu hỏi mới vào "${selectedCategoryMeta.title}". Học sinh sẽ thấy ngay khi làm bài!`,
        });
      }
      resetQuestionForm();
      labSound.playSuccess();
    } catch (err) {
      setSavingQuestion(false);
      try {
        handleFirestoreError(
          err,
          editingQuestionId ? OperationType.UPDATE : OperationType.CREATE,
          editingQuestionId ? `questions/${editingQuestionId}` : 'questions',
        );
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
      return;
    }
    setSavingQuestion(false);
  };

  const startEditQuestion = (q: CustomQuestion) => {
    setEditingQuestionId(q.id);
    setSelectedCategoryId(q.categoryId);
    setQText(q.question);
    setQOptions([
      q.options[0] ?? '',
      q.options[1] ?? '',
      q.options[2] ?? '',
      q.options[3] ?? '',
    ]);
    setQCorrectIdx(q.correctIndex);
    setQHint(q.hint);
    setQExplanation(q.explanation);
    setQPoints(q.points);
    setFeedback(null);
  };

  const handleDeleteQuestion = async (q: CustomQuestion) => {
    try {
      await deleteDoc(doc(db, 'questions', q.id));
      setConfirmDeleteQId(null);
      if (editingQuestionId === q.id) resetQuestionForm();
      setFeedback({
        type: 'success',
        text: 'Đã xóa câu hỏi khỏi ngân hàng thử thách.',
      });
    } catch (err) {
      try {
        handleFirestoreError(err, OperationType.DELETE, `questions/${q.id}`);
      } catch (wrapped) {
        onError(wrapped instanceof Error ? wrapped : new Error(String(wrapped)));
      }
    }
  };

  return (
    <div className="space-y-4">
      {feedback && (
        <div
          role="status"
          className={`rounded-xl border px-4 py-3 text-xs font-semibold sm:text-sm ${
            feedback.type === 'success'
              ? 'border-emerald-300 bg-emerald-50 text-emerald-950'
              : 'border-rose-300 bg-rose-50 text-rose-900'
          }`}
        >
          {feedback.text}
        </div>
      )}

      <div className="grid grid-cols-1 gap-5 lg:grid-cols-12">
        {/* LEFT COLUMN (5 cols): MANAGE QUESTION CATEGORIES */}
        <div className="space-y-5 lg:col-span-5">
          {/* Create / Edit Question Type Form */}
          <form
            onSubmit={handleSaveType}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <FolderPlus className="h-4 w-4 text-emerald-700" />
                {editingTypeId ? 'Sửa dạng câu hỏi' : 'Bổ sung dạng câu hỏi mới'}
              </h3>
              {editingTypeId && (
                <button
                  type="button"
                  onClick={resetTypeForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Hủy sửa
                </button>
              )}
            </div>
            <p className="mt-1 text-xs text-slate-600">
              Mỗi dạng câu hỏi mới (có ít nhất 1 câu hỏi) sẽ tự động hiện thành một chặng mới cho học sinh trong phần Thử thách.
            </p>

            <div className="mt-4 space-y-3">
              <div>
                <label htmlFor="qtype-title" className="block text-xs font-bold text-slate-700">
                  Tên dạng câu hỏi
                </label>
                <input
                  id="qtype-title"
                  type="text"
                  value={typeTitle}
                  onChange={(e) => setTypeTitle(e.target.value)}
                  maxLength={80}
                  placeholder="VD: Đúng / Sai, Vai trò của vi khuẩn..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm font-medium text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label htmlFor="qtype-format" className="block text-xs font-bold text-slate-700">
                    Kiểu trả lời
                  </label>
                  <select
                    id="qtype-format"
                    value={typeFormat}
                    onChange={(e) => setTypeFormat(e.target.value as QuestionFormat)}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none sm:text-sm"
                  >
                    <option value="multiple_choice">Trắc nghiệm (A, B, C, D)</option>
                    <option value="true_false">Đúng / Sai</option>
                  </select>
                </div>
                <div>
                  <label htmlFor="qtype-points" className="block text-xs font-bold text-slate-700">
                    Điểm mỗi câu
                  </label>
                  <select
                    id="qtype-points"
                    value={typePoints}
                    onChange={(e) => setTypePoints(Number(e.target.value))}
                    className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-900 focus:border-emerald-600 focus:outline-none sm:text-sm"
                  >
                    {[5, 10, 15, 20, 25, 30].map((pts) => (
                      <option key={pts} value={pts}>
                        {pts} điểm
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label htmlFor="qtype-desc" className="block text-xs font-bold text-slate-700">
                  Mô tả ngắn cho học sinh (tuỳ chọn)
                </label>
                <input
                  id="qtype-desc"
                  type="text"
                  value={typeDesc}
                  onChange={(e) => setTypeDesc(e.target.value)}
                  maxLength={200}
                  placeholder="VD: Chọn đáp án đúng về lợi ích và tác hại của vi khuẩn"
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-sm text-slate-900 focus:border-emerald-600 focus:outline-none"
                />
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="submit"
                  disabled={savingType}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-emerald-700 px-4 py-2.5 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-60 sm:text-sm"
                >
                  <Plus className="h-4 w-4" />
                  {savingType ? 'Đang lưu...' : editingTypeId ? 'Lưu thay đổi' : 'Thêm dạng câu hỏi'}
                </button>
                {!editingTypeId && (
                  <button
                    type="button"
                    disabled={savingType}
                    onClick={handleSeedTrueFalseCategory}
                    className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-slate-50 px-3 py-2.5 text-xs font-bold text-slate-700 hover:border-emerald-500 hover:text-emerald-800"
                  >
                    <BookOpenCheck className="h-3.5 w-3.5" />
                    Thêm mẫu Đúng / Sai
                  </button>
                )}
              </div>
            </div>
          </form>

          {/* List of Question Categories */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <h3 className="text-sm font-bold text-slate-900">
              Danh mục dạng câu hỏi ({1 + questionTypes.length})
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Bấm chọn một dạng để xem và bổ sung câu hỏi ở khung bên phải
            </p>

            <div className="mt-3 space-y-2.5">
              {/* Built-in Chặng 1 */}
              <button
                type="button"
                onClick={() => {
                  setSelectedCategoryId('quiz');
                  setEditingQuestionId(null);
                }}
                className={`flex w-full items-center justify-between gap-2 rounded-xl border p-3 text-left transition-colors ${
                  selectedCategoryMeta.id === 'quiz'
                    ? 'border-emerald-600 bg-emerald-50/70'
                    : 'border-slate-200 bg-slate-50/70 hover:border-emerald-400'
                }`}
              >
                <div>
                  <p className="text-sm font-bold text-slate-900">
                    Trắc nghiệm kiến thức (Mặc định)
                  </p>
                  <p className="text-xs text-slate-500 font-mono-num">
                    Trắc nghiệm · Đã bổ sung +{countByCategory.get('quiz') ?? 0} câu
                  </p>
                </div>
                <span className="text-xs font-bold text-emerald-800">Chặng 1</span>
              </button>

              {loading ? (
                <p className="py-3 text-center text-xs text-slate-500">Đang tải danh mục...</p>
              ) : (
                questionTypes.map((qt) => {
                  const isActive = selectedCategoryMeta.id === qt.id;
                  const count = countByCategory.get(qt.id) ?? 0;
                  const isConfirming = confirmDeleteTypeId === qt.id;
                  return (
                    <div
                      key={qt.id}
                      className={`rounded-xl border p-3 transition-colors ${
                        isActive
                          ? 'border-emerald-600 bg-emerald-50/70'
                          : 'border-slate-200 bg-slate-50/70 hover:border-slate-300'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            setSelectedCategoryId(qt.id);
                            setEditingQuestionId(null);
                          }}
                          className="min-w-0 flex-1 text-left"
                        >
                          <p className="truncate text-sm font-bold text-slate-900">{qt.title}</p>
                          <p className="mt-0.5 text-xs text-slate-600 font-mono-num">
                            {FORMAT_LABELS[qt.format]} · {qt.pointsPerQuestion}đ/câu · {count} câu
                          </p>
                        </button>
                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => {
                              setEditingTypeId(qt.id);
                              setTypeTitle(qt.title);
                              setTypeDesc(qt.description);
                              setTypeFormat(qt.format);
                              setTypePoints(qt.pointsPerQuestion);
                            }}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-emerald-500 hover:text-emerald-700"
                            title="Sửa dạng câu hỏi"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {isConfirming ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteType(qt)}
                                className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white"
                              >
                                Xóa
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteTypeId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                              >
                                Hủy
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteTypeId(qt.id)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-rose-300 hover:text-rose-700"
                              title="Xóa dạng câu hỏi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )}
            </div>
          </div>
        </div>

        {/* RIGHT COLUMN (7 cols): ADD / EDIT / LIST QUESTIONS */}
        <div className="space-y-5 lg:col-span-7">
          <form
            onSubmit={handleSaveQuestion}
            className="rounded-2xl border border-slate-200 bg-white p-5"
          >
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="flex items-center gap-2 text-base font-bold text-slate-900">
                <HelpCircle className="h-4 w-4 text-sky-700" />
                {editingQuestionId ? 'Chỉnh sửa câu hỏi' : 'Bổ sung câu hỏi mới'}
              </h3>
              {editingQuestionId && (
                <button
                  type="button"
                  onClick={resetQuestionForm}
                  className="text-xs font-semibold text-slate-500 hover:text-slate-800"
                >
                  Hủy sửa
                </button>
              )}
            </div>

            <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-3">
              <div className="sm:col-span-2">
                <label htmlFor="q-category" className="block text-xs font-bold text-slate-700">
                  Thuộc dạng câu hỏi
                </label>
                <select
                  id="q-category"
                  value={selectedCategoryMeta.id}
                  onChange={(e) => {
                    setSelectedCategoryId(e.target.value);
                    setEditingQuestionId(null);
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
                >
                  <option value="quiz">Trắc nghiệm kiến thức (Mặc định · Chặng 1)</option>
                  {questionTypes.map((qt) => (
                    <option key={qt.id} value={qt.id}>
                      {qt.title} ({FORMAT_LABELS[qt.format]})
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="q-points" className="block text-xs font-bold text-slate-700">
                  Điểm câu này
                </label>
                <select
                  id="q-points"
                  value={qPoints}
                  onChange={(e) => setQPoints(Number(e.target.value))}
                  className="mt-1 w-full rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-900 focus:border-sky-600 focus:outline-none"
                >
                  {[5, 10, 15, 20, 25, 30].map((pts) => (
                    <option key={pts} value={pts}>
                      {pts} điểm
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="mt-3.5">
              <label htmlFor="q-prompt" className="block text-xs font-bold text-slate-700">
                Nội dung câu hỏi
              </label>
              <textarea
                id="q-prompt"
                rows={3}
                maxLength={400}
                value={qText}
                onChange={(e) => setQText(e.target.value)}
                placeholder="Nhập nội dung câu hỏi cho học sinh..."
                className="mt-1 w-full rounded-xl border border-slate-300 p-3 text-sm text-slate-900 focus:border-sky-600 focus:outline-none"
              />
            </div>

            {/* Answer Choices */}
            <div className="mt-3.5">
              <p className="text-xs font-bold text-slate-700">
                {selectedCategoryMeta.format === 'true_false'
                  ? 'Chọn đáp án đúng (Đúng / Sai):'
                  : 'Các phương án trả lời (tích chọn nút tròn cạnh đáp án đúng):'}
              </p>

              {selectedCategoryMeta.format === 'true_false' ? (
                <div className="mt-2 grid grid-cols-2 gap-3">
                  {(['Đúng', 'Sai'] as const).map((label, idx) => (
                    <button
                      key={label}
                      type="button"
                      onClick={() => setQCorrectIdx(idx)}
                      className={`flex items-center justify-center gap-2 rounded-xl border px-4 py-3 text-sm font-bold transition-colors ${
                        qCorrectIdx === idx
                          ? 'border-emerald-600 bg-emerald-50 text-emerald-900'
                          : 'border-slate-200 bg-slate-50 text-slate-700 hover:border-slate-300'
                      }`}
                    >
                      <CheckCircle2
                        className={`h-4 w-4 ${
                          qCorrectIdx === idx ? 'text-emerald-600' : 'text-slate-300'
                        }`}
                      />
                      {label}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="mt-2 space-y-2">
                  {[0, 1, 2, 3].map((idx) => (
                    <div key={idx} className="flex items-center gap-2.5">
                      <label className="flex cursor-pointer items-center gap-1.5 text-xs font-bold text-slate-700 shrink-0">
                        <input
                          type="radio"
                          name="correct-option"
                          checked={qCorrectIdx === idx}
                          onChange={() => setQCorrectIdx(idx)}
                          className="h-4 w-4 accent-emerald-700"
                        />
                        {String.fromCharCode(65 + idx)}.
                      </label>
                      <input
                        type="text"
                        value={qOptions[idx]}
                        onChange={(e) => {
                          const next: [string, string, string, string] = [...qOptions] as [
                            string,
                            string,
                            string,
                            string,
                          ];
                          next[idx] = e.target.value;
                          setQOptions(next);
                        }}
                        maxLength={200}
                        placeholder={
                          idx < 2
                            ? `Nhập phương án ${String.fromCharCode(65 + idx)} (bắt buộc)`
                            : `Phương án ${String.fromCharCode(65 + idx)} (tuỳ chọn)`
                        }
                        className={`w-full rounded-xl border px-3 py-2 text-sm text-slate-900 focus:outline-none ${
                          qCorrectIdx === idx
                            ? 'border-emerald-500 bg-emerald-50/40 focus:border-emerald-600'
                            : 'border-slate-300 bg-white focus:border-sky-600'
                        }`}
                      />
                    </div>
                  ))}
                </div>
              )}
            </div>

            <div className="mt-3.5 grid grid-cols-1 gap-3 sm:grid-cols-2">
              <div>
                <label htmlFor="q-hint" className="block text-xs font-bold text-slate-700">
                  Gợi ý khi chọn sai (tuỳ chọn)
                </label>
                <input
                  id="q-hint"
                  type="text"
                  maxLength={250}
                  value={qHint}
                  onChange={(e) => setQHint(e.target.value)}
                  placeholder="Gợi ý ngắn giúp học sinh nhớ lại bài..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none sm:text-sm"
                />
              </div>
              <div>
                <label htmlFor="q-exp" className="block text-xs font-bold text-slate-700">
                  Giải thích đáp án (tuỳ chọn)
                </label>
                <input
                  id="q-exp"
                  type="text"
                  maxLength={300}
                  value={qExplanation}
                  onChange={(e) => setQExplanation(e.target.value)}
                  placeholder="Giải thích ngắn khi học sinh trả lời đúng..."
                  className="mt-1 w-full rounded-xl border border-slate-300 px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-none sm:text-sm"
                />
              </div>
            </div>

            <div className="mt-4">
              <button
                type="submit"
                disabled={savingQuestion}
                className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-sm font-bold text-white hover:bg-sky-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {savingQuestion
                  ? 'Đang lưu câu hỏi...'
                  : editingQuestionId
                  ? 'Lưu thay đổi câu hỏi'
                  : 'Lưu câu hỏi vào thử thách'}
              </button>
            </div>
          </form>

          {/* List of Teacher-Added Questions in Selected Category */}
          <div className="rounded-2xl border border-slate-200 bg-white p-5">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-slate-900">
                Câu hỏi Giáo viên đã bổ sung — {selectedCategoryMeta.title}
              </h3>
              <span className="text-xs font-semibold text-sky-800 font-mono-num">
                {questionsInSelectedCategory.length} câu hỏi
              </span>
            </div>

            {questionsInSelectedCategory.length === 0 ? (
              <p className="mt-4 rounded-xl border border-dashed border-slate-300 p-6 text-center text-xs text-slate-500 sm:text-sm">
                Chưa có câu hỏi bổ sung nào trong mục này. Thầy/Cô hãy nhập câu hỏi mới ở biểu mẫu phía trên.
              </p>
            ) : (
              <div className="mt-3 space-y-3">
                {questionsInSelectedCategory.map((q, idx) => {
                  const isConfirming = confirmDeleteQId === q.id;
                  return (
                    <div
                      key={q.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-3.5"
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex-1">
                          <p className="text-sm font-bold text-slate-900">
                            <span className="mr-1.5 font-mono-num text-sky-700">Câu {idx + 1}.</span>
                            {q.question}
                          </p>
                          <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                            {q.options.map((opt, oIdx) => (
                              <p
                                key={`${q.id}_${oIdx}`}
                                className={`text-xs ${
                                  oIdx === q.correctIndex
                                    ? 'font-bold text-emerald-800'
                                    : 'text-slate-600'
                                }`}
                              >
                                {oIdx === q.correctIndex ? '✓ ' : ''}
                                <span className="font-mono-num font-semibold">
                                  {String.fromCharCode(65 + oIdx)}.
                                </span>{' '}
                                {opt}
                              </p>
                            ))}
                          </div>
                          <p className="mt-1.5 text-[11px] font-semibold text-slate-500 font-mono-num">
                            Điểm: {q.points}đ
                            {q.hint ? ` · Gợi ý: ${q.hint}` : ''}
                          </p>
                        </div>

                        <div className="flex shrink-0 items-center gap-1">
                          <button
                            type="button"
                            onClick={() => startEditQuestion(q)}
                            className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-sky-500 hover:text-sky-700"
                            title="Sửa câu hỏi"
                          >
                            <Edit3 className="h-3.5 w-3.5" />
                          </button>
                          {isConfirming ? (
                            <span className="inline-flex items-center gap-1">
                              <button
                                type="button"
                                onClick={() => handleDeleteQuestion(q)}
                                className="rounded bg-rose-600 px-2 py-1 text-[11px] font-bold text-white"
                              >
                                Xóa
                              </button>
                              <button
                                type="button"
                                onClick={() => setConfirmDeleteQId(null)}
                                className="rounded border border-slate-300 bg-white px-2 py-1 text-[11px] text-slate-600"
                              >
                                Hủy
                              </button>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => setConfirmDeleteQId(q.id)}
                              className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:border-rose-300 hover:text-rose-700"
                              title="Xóa câu hỏi"
                            >
                              <Trash2 className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

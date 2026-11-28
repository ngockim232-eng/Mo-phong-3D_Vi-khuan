import { useMemo, useState } from 'react';
import { ArrowRight, Trophy } from 'lucide-react';
import type { ClassRoster, StudentSubmission } from '../firebase';
import { submissionToPodiumEntry, Top3Podium } from './Top3Podium';

interface ClassTop3LeaderboardProps {
  classes: ClassRoster[];
  bestSubmissions: StudentSubmission[];
  loading?: boolean;
  onSelectClassDetail?: (classId: string) => void;
  onSelectGradeDetail?: (grade: number) => void;
}

const GRADES = [6, 7, 8, 9] as const;

export function ClassTop3Leaderboard({
  classes,
  bestSubmissions,
  loading = false,
  onSelectClassDetail,
  onSelectGradeDetail,
}: ClassTop3LeaderboardProps) {
  const [viewMode, setViewMode] = useState<'class' | 'grade'>('class');
  const [gradeFilter, setGradeFilter] = useState<number | 'all'>('all');

  const activeGrades = useMemo(() => {
    const set = new Set(classes.map((c) => c.grade));
    return GRADES.filter((g) => set.has(g));
  }, [classes]);

  const visibleClasses = useMemo(() => {
    if (gradeFilter === 'all') return classes;
    return classes.filter((c) => c.grade === gradeFilter);
  }, [classes, gradeFilter]);

  const top3ByClassId = useMemo(() => {
    const map = new Map<string, { top3: StudentSubmission[]; totalSubmitted: number }>();
    for (const cls of classes) {
      const clsSubs = bestSubmissions.filter((s) => s.classId === cls.id);
      map.set(cls.id, {
        top3: clsSubs.slice(0, 3),
        totalSubmitted: clsSubs.length,
      });
    }
    return map;
  }, [classes, bestSubmissions]);

  const top3ByGrade = useMemo(() => {
    return activeGrades.map((grade) => {
      const gradeClasses = classes.filter((c) => c.grade === grade);
      const gradeClassIds = new Set(gradeClasses.map((c) => c.id));
      const gradeSubs = bestSubmissions.filter(
        (s) => s.grade === grade || gradeClassIds.has(s.classId)
      );
      const totalStudents = gradeClasses.reduce((sum, c) => sum + c.students.length, 0);
      return {
        grade,
        classCount: gradeClasses.length,
        totalStudents,
        totalSubmitted: gradeSubs.length,
        top3: gradeSubs.slice(0, 3),
      };
    });
  }, [activeGrades, classes, bestSubmissions]);

  return (
    <section
      aria-label="Bục vinh danh Top 3 học sinh dẫn đầu theo từng lớp và khối"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="inline-flex items-center gap-2 text-lg font-bold text-slate-900">
            <Trophy className="h-5 w-5 text-amber-600" />
            <span>Bục vinh danh Top 3 theo từng lớp &amp; khối</span>
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
            Xếp hạng theo Điểm số cao nhất · Ưu tiên Thời gian hoàn thành ngắn nhất khi bằng điểm
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2">
          {/* Scope Switcher: Per Class vs Per Grade */}
          <div className="flex items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setViewMode('class')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                viewMode === 'class'
                  ? 'bg-sky-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo từng Lớp
            </button>
            <button
              type="button"
              onClick={() => setViewMode('grade')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                viewMode === 'grade'
                  ? 'bg-emerald-700 text-white shadow-xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              Theo từng Khối
            </button>
          </div>

          {/* Grade Filter (when viewing by class and multiple grades exist) */}
          {viewMode === 'class' && activeGrades.length > 1 && (
            <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
              <button
                type="button"
                onClick={() => setGradeFilter('all')}
                className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                  gradeFilter === 'all'
                    ? 'bg-white text-slate-900 shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Tất cả khối
              </button>
              {activeGrades.map((g) => (
                <button
                  key={g}
                  type="button"
                  onClick={() => setGradeFilter(g)}
                  className={`rounded-lg px-2.5 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                    gradeFilter === g
                      ? 'bg-white text-sky-800 shadow-xs'
                      : 'text-slate-600 hover:text-slate-900'
                  }`}
                >
                  Khối {g}
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Đang tải bục vinh danh Top 3 các lớp và khối...
        </div>
      ) : classes.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Chưa có dữ liệu lớp học để hiển thị bục vinh danh Top 3.
        </div>
      ) : viewMode === 'class' ? (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleClasses.map((cls) => {
            const info = top3ByClassId.get(cls.id) ?? { top3: [], totalSubmitted: 0 };
            const podiumEntries = info.top3.map((s) => submissionToPodiumEntry(s));
            return (
              <div
                key={cls.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  <div className="flex items-baseline justify-between gap-2 border-b border-slate-100 pb-2.5">
                    <h3 className="text-base font-extrabold text-slate-900">
                      Lớp {cls.className}
                    </h3>
                    <span className="text-xs font-medium text-slate-500 font-mono-num">
                      Khối {cls.grade} · {info.totalSubmitted}/{cls.students.length} HS
                    </span>
                  </div>

                  <Top3Podium entries={podiumEntries} size="compact" />
                </div>

                {onSelectClassDetail && (
                  <button
                    type="button"
                    onClick={() => onSelectClassDetail(cls.id)}
                    className="mt-3 inline-flex items-center justify-end gap-1 border-t border-slate-100 pt-2.5 text-xs font-semibold text-sky-700 transition-colors hover:text-sky-900"
                  >
                    <span>Xem bảng xếp hạng lớp {cls.className}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      ) : (
        <div
          className={`mt-5 grid grid-cols-1 gap-5 ${
            top3ByGrade.length > 1 ? 'lg:grid-cols-2' : ''
          }`}
        >
          {top3ByGrade.map((gradeInfo) => {
            const podiumEntries = gradeInfo.top3.map((s) =>
              submissionToPodiumEntry(s, { showClassName: true })
            );
            return (
              <div
                key={gradeInfo.grade}
                className="flex flex-col justify-between rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/70 to-white p-4 sm:p-5"
              >
                <div>
                  <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3">
                    <h3 className="text-base font-extrabold text-slate-900 sm:text-lg">
                      Bục vinh danh toàn Khối {gradeInfo.grade}
                    </h3>
                    <span className="text-xs font-medium text-slate-600 font-mono-num">
                      {gradeInfo.classCount} lớp · {gradeInfo.totalSubmitted}/{gradeInfo.totalStudents} HS đã nộp
                    </span>
                  </div>

                  <Top3Podium
                    entries={podiumEntries}
                    size={top3ByGrade.length === 1 ? 'featured' : 'compact'}
                  />
                </div>

                {onSelectGradeDetail && (
                  <button
                    type="button"
                    onClick={() => onSelectGradeDetail(gradeInfo.grade)}
                    className="mt-3.5 inline-flex items-center justify-end gap-1 border-t border-slate-100 pt-2.5 text-xs font-semibold text-emerald-700 transition-colors hover:text-emerald-900"
                  >
                    <span>Xem chi tiết xếp hạng Khối {gradeInfo.grade}</span>
                    <ArrowRight className="h-3.5 w-3.5" />
                  </button>
                )}
              </div>
            );
          })}
        </div>
      )}
    </section>
  );
}

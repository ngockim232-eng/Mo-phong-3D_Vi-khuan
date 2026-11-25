import { useMemo, useState } from 'react';
import { ArrowRight, Award, Clock, Medal, Trophy } from 'lucide-react';
import type { ClassRoster, StudentSubmission } from '../firebase';
import { formatDuration } from './CompetitionBoard';

interface ClassTop3LeaderboardProps {
  classes: ClassRoster[];
  bestSubmissions: StudentSubmission[];
  loading?: boolean;
  onSelectClassDetail?: (classId: string) => void;
}

const GRADES = [6, 7, 8, 9] as const;

export function ClassTop3Leaderboard({
  classes,
  bestSubmissions,
  loading = false,
  onSelectClassDetail,
}: ClassTop3LeaderboardProps) {
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

  const rankStyles = [
    {
      label: 'Hạng 1',
      rowBg: 'border-amber-200 bg-amber-50/75',
      rankColor: 'text-amber-700',
      Icon: Trophy,
    },
    {
      label: 'Hạng 2',
      rowBg: 'border-slate-200 bg-slate-50/90',
      rankColor: 'text-slate-600',
      Icon: Medal,
    },
    {
      label: 'Hạng 3',
      rowBg: 'border-orange-200/80 bg-orange-50/50',
      rankColor: 'text-amber-800',
      Icon: Award,
    },
  ] as const;

  return (
    <section
      aria-label="Bảng xếp hạng Top 3 học sinh dẫn đầu theo từng lớp"
      className="rounded-2xl border border-slate-200 bg-white p-5 shadow-xs sm:p-6"
    >
      <div className="flex flex-wrap items-end justify-between gap-3 border-b border-slate-100 pb-4">
        <div>
          <h2 className="text-lg font-bold text-slate-900">
            Bảng xếp hạng Top 3 dẫn đầu theo từng lớp
          </h2>
          <p className="mt-0.5 text-xs text-slate-600 sm:text-sm">
            Xếp hạng theo Điểm số cao nhất · Ưu tiên Thời gian hoàn thành ngắn nhất khi bằng điểm
          </p>
        </div>

        {activeGrades.length > 1 && (
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setGradeFilter('all')}
              className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
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
                className={`rounded-lg px-3 py-1.5 text-xs font-bold transition-colors whitespace-nowrap ${
                  gradeFilter === g
                    ? 'bg-sky-700 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900'
                }`}
              >
                Khối {g}
              </button>
            ))}
          </div>
        )}
      </div>

      {loading ? (
        <div className="py-10 text-center text-sm text-slate-500">
          Đang tải bảng xếp hạng Top 3 các lớp...
        </div>
      ) : visibleClasses.length === 0 ? (
        <div className="py-8 text-center text-sm text-slate-500">
          Chưa có dữ liệu lớp học để hiển thị bảng xếp hạng Top 3.
        </div>
      ) : (
        <div className="mt-5 grid grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          {visibleClasses.map((cls) => {
            const info = top3ByClassId.get(cls.id) ?? { top3: [], totalSubmitted: 0 };
            return (
              <div
                key={cls.id}
                className="flex flex-col justify-between rounded-xl border border-slate-200 bg-white p-4"
              >
                <div>
                  {/* Class Card Header */}
                  <div className="flex items-baseline justify-between gap-2 pb-3">
                    <h3 className="text-base font-extrabold text-slate-900">
                      Lớp {cls.className}
                    </h3>
                    <span className="text-xs font-medium text-slate-500 font-mono-num">
                      Khối {cls.grade} · {info.totalSubmitted}/{cls.students.length} HS
                    </span>
                  </div>

                  {/* Top 3 Slots */}
                  <div className="space-y-2">
                    {[0, 1, 2].map((slotIdx) => {
                      const entry = info.top3[slotIdx];
                      const style = rankStyles[slotIdx];
                      const RankIcon = style.Icon;

                      if (!entry) {
                        return (
                          <div
                            key={slotIdx}
                            className="flex items-center justify-between rounded-lg border border-dashed border-slate-200 bg-slate-50/50 px-3 py-2.5 text-xs text-slate-400"
                          >
                            <span className="inline-flex items-center gap-2 font-mono-num font-semibold">
                              <RankIcon className="h-3.5 w-3.5 opacity-45" />
                              {style.label}
                            </span>
                            <span>Chưa có học sinh</span>
                          </div>
                        );
                      }

                      return (
                        <div
                          key={entry.id}
                          className={`flex items-center justify-between gap-2 rounded-lg border px-3 py-2.5 ${style.rowBg}`}
                        >
                          <div className="flex min-w-0 items-center gap-2.5">
                            <span
                              className={`inline-flex items-center gap-1 text-xs font-extrabold font-mono-num shrink-0 ${style.rankColor}`}
                              title={style.label}
                            >
                              <RankIcon className="h-4 w-4" />
                              {slotIdx + 1}
                            </span>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-slate-900">
                                {entry.studentName}
                              </p>
                              <p className="text-[11px] text-slate-500 font-mono-num">
                                Đúng {entry.correctCount}/{entry.totalQuestions} · {entry.accuracy}%
                              </p>
                            </div>
                          </div>

                          <div className="shrink-0 text-right font-mono-num">
                            <p className="text-sm font-extrabold text-sky-800">{entry.score} đ</p>
                            <p className="inline-flex items-center justify-end gap-1 text-[11px] font-bold text-emerald-700">
                              <Clock className="h-3 w-3" />
                              {formatDuration(entry.durationSec)}
                            </p>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {onSelectClassDetail && (
                  <button
                    type="button"
                    onClick={() => onSelectClassDetail(cls.id)}
                    className="mt-3.5 inline-flex items-center justify-end gap-1 border-t border-slate-100 pt-2.5 text-xs font-semibold text-sky-700 transition-colors hover:text-sky-900"
                  >
                    <span>Xem đầy đủ lớp {cls.className}</span>
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

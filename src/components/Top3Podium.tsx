import { Award, Clock, Crown, Medal } from 'lucide-react';
import type { StudentSubmission } from '../firebase';

function formatPodiumDuration(totalSec: number): string {
  const safe = Math.max(0, Math.round(totalSec));
  const m = Math.floor(safe / 60);
  const s = safe % 60;
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
}

export interface PodiumEntry {
  id: string;
  title: string;
  subtitle?: string;
  scoreText: string;
  durationText?: string;
  metaText?: string;
}

interface Top3PodiumProps {
  /** Ranked entries: index 0 = 1st place, index 1 = 2nd place, index 2 = 3rd place */
  entries: (PodiumEntry | undefined)[];
  /** 'featured' for standalone class/grade headers; 'compact' for grid cards */
  size?: 'compact' | 'featured';
  /** Optional heading displayed inside the podium stage header */
  heading?: string;
  /** Optional supporting metadata line */
  subheading?: string;
  /** Text shown on unclaimed podium slots */
  emptySlotLabel?: string;
}

export function submissionToPodiumEntry(
  sub: StudentSubmission,
  options?: { showClassName?: boolean }
): PodiumEntry {
  return {
    id: sub.id,
    title: sub.studentName,
    subtitle: options?.showClassName ? `Lớp ${sub.className}` : undefined,
    scoreText: `${sub.score} đ`,
    durationText: formatPodiumDuration(sub.durationSec),
    metaText: `${sub.correctCount}/${sub.totalQuestions} · ${sub.accuracy}%`,
  };
}

interface PodiumSlotConfig {
  rank: 1 | 2 | 3;
  sourceIndex: 0 | 1 | 2;
  rankLabel: string;
  capClass: string;
  pedestalClass: string;
  numeralClass: string;
  crestClass: string;
  scoreClass: string;
  featuredHeight: string;
  compactHeight: string;
  Icon: typeof Crown;
}

/** Visual order: Left = #2 Silver, Center = #1 Gold (tallest), Right = #3 Bronze */
const PODIUM_SLOTS: readonly PodiumSlotConfig[] = [
  {
    rank: 2,
    sourceIndex: 1,
    rankLabel: 'Hạng 2',
    capClass: 'bg-slate-400',
    pedestalClass:
      'border-slate-300 bg-gradient-to-b from-slate-200/85 via-slate-100/90 to-slate-50 text-slate-900',
    numeralClass: 'text-slate-600',
    crestClass: 'border-slate-300 bg-slate-100 text-slate-600',
    scoreClass: 'text-slate-900',
    featuredHeight: 'min-h-[110px] sm:min-h-[124px]',
    compactHeight: 'min-h-[78px]',
    Icon: Medal,
  },
  {
    rank: 1,
    sourceIndex: 0,
    rankLabel: 'Hạng 1',
    capClass: 'bg-amber-400',
    pedestalClass:
      'border-amber-300 bg-gradient-to-b from-amber-100 via-amber-50/95 to-amber-50/40 text-amber-950 shadow-xs',
    numeralClass: 'text-amber-700',
    crestClass: 'border-amber-300 bg-amber-100 text-amber-700 ring-2 ring-amber-200/70',
    scoreClass: 'text-amber-950',
    featuredHeight: 'min-h-[138px] sm:min-h-[156px]',
    compactHeight: 'min-h-[98px]',
    Icon: Crown,
  },
  {
    rank: 3,
    sourceIndex: 2,
    rankLabel: 'Hạng 3',
    capClass: 'bg-orange-400',
    pedestalClass:
      'border-orange-300/90 bg-gradient-to-b from-orange-100/90 via-orange-50/90 to-orange-50/40 text-orange-950',
    numeralClass: 'text-orange-700',
    crestClass: 'border-orange-300 bg-orange-100 text-orange-700',
    scoreClass: 'text-orange-950',
    featuredHeight: 'min-h-[90px] sm:min-h-[102px]',
    compactHeight: 'min-h-[64px]',
    Icon: Award,
  },
] as const;

export function Top3Podium({
  entries,
  size = 'featured',
  heading,
  subheading,
  emptySlotLabel = 'Chưa có HS',
}: Top3PodiumProps) {
  const isCompact = size === 'compact';

  return (
    <div
      className={
        isCompact
          ? 'pt-2'
          : 'rounded-2xl border border-slate-200 bg-gradient-to-b from-slate-50/90 via-white to-slate-50/60 p-4 sm:p-6'
      }
    >
      {(heading || subheading) && (
        <div className="mb-4 flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200/80 pb-3">
          <div>
            {heading && (
              <h4 className="text-sm font-extrabold text-slate-900 sm:text-base">{heading}</h4>
            )}
            {subheading && (
              <p className="mt-0.5 text-xs text-slate-600">{subheading}</p>
            )}
          </div>
          <span className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
            Bục vinh danh Top 3
          </span>
        </div>
      )}

      {/* 3-Column Olympic Podium: Left #2 · Center #1 · Right #3 */}
      <div
        className={`grid grid-cols-3 items-end ${
          isCompact ? 'gap-1.5 sm:gap-2' : 'mx-auto max-w-2xl gap-2.5 sm:gap-5'
        }`}
        role="list"
        aria-label={heading || 'Bục vinh danh Top 3'}
      >
        {PODIUM_SLOTS.map((slot) => {
          const entry = entries[slot.sourceIndex];
          const Icon = slot.Icon;
          const heightClass = isCompact ? slot.compactHeight : slot.featuredHeight;

          return (
            <div
              key={slot.rank}
              role="listitem"
              aria-label={`${slot.rankLabel}: ${entry ? entry.title : emptySlotLabel}`}
              className="flex min-w-0 flex-col items-center"
            >
              {/* Winner Plate Standing Above the Pedestal */}
              <div
                className={`flex w-full flex-col items-center text-center ${
                  isCompact ? 'mb-1.5 min-h-[54px] justify-end px-0.5' : 'mb-2.5 min-h-[72px] justify-end px-1'
                }`}
              >
                <div
                  className={`flex items-center justify-center rounded-full border ${
                    entry
                      ? slot.crestClass
                      : 'border-dashed border-slate-300 bg-slate-50 text-slate-400'
                  } ${
                    isCompact
                      ? slot.rank === 1
                        ? 'h-7 w-7'
                        : 'h-6 w-6'
                      : slot.rank === 1
                      ? 'h-10 w-10'
                      : 'h-8 w-8'
                  }`}
                >
                  <Icon
                    className={
                      isCompact
                        ? slot.rank === 1
                          ? 'h-3.5 w-3.5'
                          : 'h-3 w-3'
                        : slot.rank === 1
                        ? 'h-5 w-5'
                        : 'h-4 w-4'
                    }
                  />
                </div>

                {entry ? (
                  <>
                    <p
                      title={entry.title}
                      className={`mt-1 line-clamp-2 w-full break-words font-bold leading-tight text-slate-900 ${
                        isCompact
                          ? 'text-[11px] sm:text-xs'
                          : slot.rank === 1
                          ? 'text-xs sm:text-sm'
                          : 'text-xs sm:text-[13px]'
                      }`}
                    >
                      {entry.title}
                    </p>
                    {entry.subtitle && (
                      <p
                        className={`mt-0.5 truncate max-w-full font-semibold text-sky-700 ${
                          isCompact ? 'text-[10px]' : 'text-[11px] sm:text-xs'
                        }`}
                      >
                        {entry.subtitle}
                      </p>
                    )}
                  </>
                ) : (
                  <p
                    className={`mt-1.5 font-medium text-slate-400 ${
                      isCompact ? 'text-[10px]' : 'text-xs'
                    }`}
                  >
                    {emptySlotLabel}
                  </p>
                )}
              </div>

              {/* Stepped Pedestal Block */}
              <div
                className={`relative flex w-full flex-col items-center justify-between overflow-hidden rounded-t-xl border border-b-0 ${heightClass} ${
                  entry
                    ? slot.pedestalClass
                    : 'border-dashed border-slate-200 bg-slate-50/75 text-slate-400'
                }`}
              >
                {/* Metallic Top Cap */}
                <div
                  className={`w-full shrink-0 ${isCompact ? 'h-1.5' : 'h-2'} ${
                    entry ? slot.capClass : 'bg-slate-200/80'
                  }`}
                />

                {/* Pedestal Body: Big Rank Number + Score & Time */}
                <div
                  className={`flex flex-1 flex-col items-center justify-center text-center ${
                    isCompact ? 'px-1 py-1.5' : 'px-2 py-2.5 sm:px-3'
                  }`}
                >
                  <span
                    className={`font-mono-num font-black leading-none ${
                      entry ? slot.numeralClass : 'text-slate-300'
                    } ${
                      isCompact
                        ? slot.rank === 1
                          ? 'text-lg'
                          : 'text-base'
                        : slot.rank === 1
                        ? 'text-3xl sm:text-4xl'
                        : 'text-2xl sm:text-3xl'
                    }`}
                  >
                    {slot.rank}
                  </span>

                  {entry ? (
                    <div className="mt-1 flex flex-col items-center font-mono-num">
                      <span
                        className={`font-extrabold leading-tight ${slot.scoreClass} ${
                          isCompact ? 'text-[11px] sm:text-xs' : 'text-sm sm:text-base'
                        }`}
                      >
                        {entry.scoreText}
                      </span>
                      {entry.durationText && (
                        <span
                          className={`mt-0.5 inline-flex items-center gap-0.5 font-bold text-emerald-800 ${
                            isCompact ? 'text-[10px]' : 'text-[11px] sm:text-xs'
                          }`}
                        >
                          <Clock className={isCompact ? 'h-2.5 w-2.5' : 'h-3 w-3'} />
                          {entry.durationText}
                        </span>
                      )}
                      {!isCompact && entry.metaText && (
                        <span className="mt-0.5 hidden text-[11px] text-slate-600 sm:inline">
                          {entry.metaText}
                        </span>
                      )}
                    </div>
                  ) : (
                    <span className="mt-1 text-[10px] font-medium text-slate-400">
                      {slot.rankLabel}
                    </span>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Physical Stage Plinth / Base Bar */}
      <div
        aria-hidden="true"
        className={`rounded-b-lg border border-slate-300/80 bg-gradient-to-b from-slate-200 to-slate-300/70 ${
          isCompact ? 'h-2 w-full' : 'mx-auto h-2.5 max-w-2xl'
        }`}
      />
    </div>
  );
}

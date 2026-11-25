import { useEffect, useRef, useState } from 'react';
import { Volume2 } from 'lucide-react';
import { speakEnglishTerm } from '../utils/sound';

interface SpeakButtonProps {
  term: string;
  label?: string;
  size?: 'xs' | 'sm';
  tone?: 'light' | 'inverted';
  className?: string;
}

export function SpeakButton({
  term,
  label,
  size = 'sm',
  tone = 'light',
  className = '',
}: SpeakButtonProps) {
  const [speaking, setSpeaking] = useState(false);
  const timeoutRef = useRef<number | null>(null);

  useEffect(() => {
    return () => {
      if (timeoutRef.current !== null) {
        window.clearTimeout(timeoutRef.current);
      }
    };
  }, []);

  const handleClick = (e: React.MouseEvent<HTMLButtonElement>) => {
    e.stopPropagation();
    if (timeoutRef.current !== null) {
      window.clearTimeout(timeoutRef.current);
    }
    setSpeaking(true);
    // Safety reset in case browser speechSynthesis doesn't fire onend
    timeoutRef.current = window.setTimeout(() => setSpeaking(false), 3200);

    speakEnglishTerm(term, {
      onStart: () => setSpeaking(true),
      onEnd: () => {
        if (timeoutRef.current !== null) {
          window.clearTimeout(timeoutRef.current);
          timeoutRef.current = null;
        }
        setSpeaking(false);
      },
    });
  };

  const sizeClasses = size === 'xs' ? 'p-1' : 'p-1.5';
  const iconClasses = size === 'xs' ? 'h-3.5 w-3.5' : 'h-4 w-4';

  const toneClasses =
    tone === 'inverted'
      ? speaking
        ? 'bg-white/25 text-white ring-1 ring-white/60'
        : 'text-white/90 hover:bg-white/20 hover:text-white'
      : speaking
      ? 'bg-sky-100 text-sky-800 ring-1 ring-sky-400'
      : 'text-sky-700 hover:bg-sky-100 hover:text-sky-900';

  return (
    <button
      type="button"
      onClick={handleClick}
      aria-label={label || `Nghe phát âm tiếng Anh: ${term}`}
      title={`Nghe phát âm: ${term}`}
      className={`inline-flex shrink-0 items-center justify-center rounded-lg transition-colors ${sizeClasses} ${toneClasses} ${className}`}
    >
      <Volume2 className={iconClasses} />
    </button>
  );
}

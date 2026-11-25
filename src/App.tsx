import { useEffect, useState } from 'react';
import { Maximize, Menu, Minimize, Volume2, VolumeX, X } from 'lucide-react';
import { AppSection } from './data/bacteriaData';
import { labSound } from './utils/sound';
import { HomeHub } from './components/HomeHub';
import { ShapesExplorer } from './components/ShapesExplorer';
import { AnatomyLab } from './components/AnatomyLab';
import { KnowledgeGames } from './components/KnowledgeGames';
import { ErrorBoundary } from './components/ErrorBoundary';

const NAV_ITEMS: { id: Exclude<AppSection, 'home'>; label: string }[] = [
  { id: 'shapes', label: 'Hình dạng 3D' },
  { id: 'anatomy', label: 'Cấu tạo 3D' },
  { id: 'games', label: 'Thử thách' },
];

export default function App() {
  const [section, setSection] = useState<AppSection>('home');
  const [muted, setMuted] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [appFullscreen, setAppFullscreen] = useState(false);

  useEffect(() => {
    const onFsChange = () => {
      setAppFullscreen(Boolean(document.fullscreenElement));
    };
    document.addEventListener('fullscreenchange', onFsChange);
    return () => document.removeEventListener('fullscreenchange', onFsChange);
  }, []);

  const toggleAppFullscreen = () => {
    labSound.playPop();
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen?.().catch(() => {});
    } else {
      document.exitFullscreen?.().catch(() => {});
    }
  };

  const navigate = (next: AppSection) => {
    setSection(next);
    setMobileMenuOpen(false);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const toggleSound = () => {
    const nextMuted = !muted;
    labSound.muted = nextMuted;
    setMuted(nextMuted);
    if (!nextMuted) {
      labSound.playPop();
    }
  };

  return (
    <div className="min-h-screen bio-page-bg text-slate-900">
      {/* Clean 3-Zone Top Bar Contract */}
      <header className="sticky top-0 z-40 border-b border-slate-200/90 bg-white">
        <div className="mx-auto flex h-16 max-w-[1440px] items-center justify-between gap-8 px-4 sm:px-6 lg:px-8">
          {/* Zone 1: Single-line brand wordmark */}
          <button
            type="button"
            onClick={() => {
              labSound.playSelect();
              navigate('home');
            }}
            className="font-display text-lg font-extrabold tracking-tight text-slate-900 transition-colors hover:text-sky-700 whitespace-nowrap shrink-0"
          >
            Thế Giới Vi Khuẩn
          </button>

          {/* Zone 2: Concise single-line text navigation links */}
          <nav className="hidden md:flex items-center gap-6" aria-label="Điều hướng chính">
            {NAV_ITEMS.map((item) => {
              const active = section === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    labSound.playSelect();
                    navigate(item.id);
                  }}
                  className={`border-b-2 py-1 text-sm font-semibold transition-colors whitespace-nowrap shrink-0 ${
                    active
                      ? 'border-sky-700 text-sky-800'
                      : 'border-transparent text-slate-600 hover:border-slate-300 hover:text-slate-900'
                  }`}
                >
                  {item.label}
                </button>
              );
            })}
          </nav>

          {/* Zone 3: Single Primary Action + Sound / Mobile Trigger */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={toggleAppFullscreen}
              className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label={appFullscreen ? 'Thoát toàn màn hình' : 'Toàn màn hình'}
              title={appFullscreen ? 'Thoát toàn màn hình' : 'Trình chiếu toàn màn hình'}
            >
              {appFullscreen ? <Minimize className="h-4 w-4" /> : <Maximize className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={toggleSound}
              className="rounded-lg p-2 text-slate-600 transition-colors hover:bg-slate-100 hover:text-slate-900"
              aria-label={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
              title={muted ? 'Bật âm thanh' : 'Tắt âm thanh'}
            >
              {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
            </button>

            <button
              type="button"
              onClick={() => {
                labSound.playSelect();
                navigate(section === 'home' ? 'anatomy' : 'home');
              }}
              className="hidden sm:inline-flex items-center rounded-lg bg-sky-700 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-sky-800 whitespace-nowrap shrink-0"
            >
              {section === 'home' ? 'Cấu tạo 3D' : 'Trang chủ'}
            </button>

            <button
              type="button"
              onClick={() => setMobileMenuOpen((v) => !v)}
              className="rounded-lg p-2 text-slate-700 hover:bg-slate-100 md:hidden"
              aria-label="Mở menu điều hướng"
            >
              {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>

        {/* Responsive Mobile Dropdown Menu */}
        {mobileMenuOpen && (
          <nav
            className="border-t border-slate-200 bg-white px-4 py-3 md:hidden"
            aria-label="Menu di động"
          >
            <div className="flex flex-col gap-1">
              <button
                type="button"
                onClick={() => navigate('home')}
                className={`rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${
                  section === 'home' ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'
                }`}
              >
                Trang chủ
              </button>
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => {
                    labSound.playSelect();
                    navigate(item.id);
                  }}
                  className={`rounded-lg px-3 py-2.5 text-left text-sm font-semibold ${
                    section === item.id ? 'bg-sky-50 text-sky-800' : 'text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  {item.label}
                </button>
              ))}
            </div>
          </nav>
        )}
      </header>

      {/* Main Content View */}
      <main>
        <ErrorBoundary>
          {section === 'home' && <HomeHub onNavigate={navigate} />}
          {section === 'shapes' && <ShapesExplorer onBackHome={() => navigate('home')} />}
          {section === 'anatomy' && <AnatomyLab onBackHome={() => navigate('home')} />}
          {section === 'games' && <KnowledgeGames onBackHome={() => navigate('home')} />}
        </ErrorBoundary>
      </main>
    </div>
  );
}

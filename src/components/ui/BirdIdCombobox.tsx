import React, { useState, useRef, useEffect, useLayoutEffect, useId } from 'react';
import { createPortal } from 'react-dom';
import { Search, Clock, Check, ChevronDown } from 'lucide-react';

export interface BirdOption {
  key: string;
  id: string;
  label: string;
  sublabel?: string;
  pttId: string;
  birdId?: string;
  kind?: 'ptt' | 'ring' | 'darvic';
  type: 'bird' | 'transmitter';
  searchValue: string;
}

export interface BirdIdComboboxProps {
  value: string;
  onSelect: (option: BirdOption | string) => void;
  options: BirdOption[];
  language?: 'ar' | 'en';
  placeholder?: string;
}

export const BirdIdCombobox: React.FC<BirdIdComboboxProps> = ({
  value,
  onSelect,
  options,
  language = 'ar',
  placeholder
}) => {
  const isAr = language === 'ar';
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [activeIndex, setActiveIndex] = useState<number>(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  const listboxId = useId();

  // Recent items from localStorage
  const [recentIds, setRecentIds] = useState<string[]>(() => {
    try {
      return JSON.parse(localStorage.getItem('hb_recent_bird_ids') || '[]');
    } catch {
      return [];
    }
  });

  const saveRecent = (id: string) => {
    try {
      const next = [id, ...recentIds.filter(x => x !== id)].slice(0, 5);
      setRecentIds(next);
      localStorage.setItem('hb_recent_bird_ids', JSON.stringify(next));
    } catch {}
  };

  // Filtered options
  const filtered = React.useMemo(() => {
    if (!searchTerm.trim()) {
      return options;
    }
    const term = searchTerm.trim().toLowerCase();
    return options.filter(opt => opt.searchValue.includes(term));
  }, [options, searchTerm]);

  // Recent options for empty state
  const recentOptions = React.useMemo(() => {
    if (searchTerm.trim() || recentIds.length === 0) return [];
    return recentIds
      .map(id => options.find(o => o.id === id || o.pttId === id))
      .filter(Boolean) as BirdOption[];
  }, [options, recentIds, searchTerm]);

  // Position portal below input, flip up if no room
  const [pos, setPos] = useState<{ top: number; left: number; width: number } | null>(null);

  useLayoutEffect(() => {
    if (!isOpen || !inputRef.current) return;

    const updatePos = () => {
      const rect = inputRef.current!.getBoundingClientRect();
      const h = 300;
      let top = rect.bottom + 6;
      if (top + h > window.innerHeight - 8) {
        top = Math.max(8, rect.top - h - 6);
      }
      setPos({
        top,
        left: rect.left,
        width: Math.max(260, rect.width)
      });
    };

    updatePos();
    window.addEventListener('resize', updatePos);
    window.addEventListener('scroll', updatePos, true);
    return () => {
      window.removeEventListener('resize', updatePos);
      window.removeEventListener('scroll', updatePos, true);
    };
  }, [isOpen]);

  // Outside click & ESC
  useEffect(() => {
    if (!isOpen) return;

    const onDown = (e: MouseEvent) => {
      const target = e.target as Node;
      if (inputRef.current?.contains(target) || listRef.current?.contains(target)) return;
      setIsOpen(false);
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      const totalItems = recentOptions.length > 0 ? recentOptions.length + filtered.length : filtered.length;

      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setActiveIndex(prev => (prev + 1) % totalItems);
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setActiveIndex(prev => (prev - 1 + totalItems) % totalItems);
      } else if (e.key === 'Enter') {
        e.preventDefault();
        const allItems = [...recentOptions, ...filtered];
        if (activeIndex >= 0 && activeIndex < allItems.length) {
          handleChoose(allItems[activeIndex]);
        }
      } else if (e.key === 'Escape') {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', onDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('mousedown', onDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [isOpen, activeIndex, filtered, recentOptions]);

  const handleChoose = (opt: BirdOption) => {
    onSelect(opt);
    saveRecent(opt.id);
    setSearchTerm('');
    setIsOpen(false);
  };

  // Text highlighting
  const highlight = (text: string, query: string) => {
    if (!query) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) =>
      part.toLowerCase() === query.toLowerCase() ? (
        <mark key={i} className="bg-amber-200 text-amber-900 rounded-2xs px-0.5 font-bold">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="relative w-full">
      <div className="relative">
        <input
          ref={inputRef}
          type="text"
          value={isOpen ? searchTerm : (value ? `${value}` : '')}
          onChange={(e) => {
            setSearchTerm(e.target.value);
            setIsOpen(true);
            setActiveIndex(0);
          }}
          onFocus={() => {
            setIsOpen(true);
            setSearchTerm('');
          }}
          placeholder={placeholder || (isAr ? 'ابحث برقم PTT أو الحجل...' : 'Search PTT or Ring ID...')}
          aria-haspopup="listbox"
          aria-expanded={isOpen}
          aria-controls={listboxId}
          className="w-full pl-8 pr-3.5 py-1.5 text-xs bg-gray-50 dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl focus:ring-2 focus:ring-brand-500 outline-none text-gray-900 dark:text-white font-mono"
        />
        <Search size={14} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-gray-400 pointer-events-none" />
      </div>

      {isOpen && pos && createPortal(
        <div
          ref={listRef}
          id={listboxId}
          role="listbox"
          tabIndex={-1}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 1100,
            maxHeight: '320px'
          }}
          className="bg-white dark:bg-slate-900 border border-gray-200 dark:border-slate-700 rounded-xl shadow-2xl overflow-y-auto p-1.5 space-y-1 animate-in fade-in zoom-in-95"
        >
          {/* Recent Group */}
          {recentOptions.length > 0 && !searchTerm.trim() && (
            <div className="pb-1 mb-1 border-b border-gray-100 dark:border-slate-800">
              <span className="flex items-center gap-1 px-2 py-0.5 text-[10px] font-bold text-gray-400">
                <Clock size={10} />
                <span>{isAr ? 'عمليات البحث الأخيرة:' : 'Recent:'}</span>
              </span>
              {recentOptions.map((opt, i) => (
                <button
                  key={`recent-${opt.key}`}
                  type="button"
                  onClick={() => handleChoose(opt)}
                  className={`w-full text-right px-2.5 py-1.5 text-xs rounded-lg flex items-center justify-between transition-colors ${
                    activeIndex === i ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700' : 'hover:bg-gray-50 dark:hover:bg-slate-800'
                  }`}
                >
                  <span className="font-mono font-bold">{opt.label}</span>
                  <span className="text-[10px] text-gray-400">{opt.sublabel}</span>
                </button>
              ))}
            </div>
          )}

          {/* Search Results */}
          {filtered.length > 0 ? (
            filtered.map((opt, i) => {
              const actualIdx = recentOptions.length > 0 && !searchTerm.trim() ? i + recentOptions.length : i;
              const isSelected = value === opt.pttId || value === opt.id;
              const isActive = activeIndex === actualIdx;

              return (
                <button
                  key={opt.key}
                  type="button"
                  onClick={() => handleChoose(opt)}
                  className={`w-full text-right px-2.5 py-1.5 text-xs rounded-lg flex flex-col gap-0.5 transition-colors ${
                    isActive
                      ? 'bg-brand-50 dark:bg-brand-950/40 text-brand-700 font-bold'
                      : isSelected
                      ? 'bg-emerald-50 dark:bg-emerald-950/30 text-emerald-700 font-bold'
                      : 'hover:bg-gray-50 dark:hover:bg-slate-800 text-gray-800 dark:text-gray-200'
                  }`}
                >
                  <div className="flex items-center justify-between font-mono">
                    <span>{highlight(opt.label, searchTerm)}</span>
                    <span className="text-[10px] px-1.5 py-0.2 rounded bg-gray-100 dark:bg-slate-800 text-gray-500 font-sans">
                      {opt.type === 'bird' ? (isAr ? 'طائر' : 'Bird') : (isAr ? 'جهاز' : 'Tx')}
                    </span>
                  </div>
                  {opt.sublabel && (
                    <div className="text-[10.5px] text-gray-500 dark:text-gray-400 font-sans truncate">
                      {highlight(opt.sublabel, searchTerm)}
                    </div>
                  )}
                </button>
              );
            })
          ) : (
            <div className="p-3 text-center text-xs text-gray-400 font-sans">
              {isAr ? 'لا توجد نتائج مطابقة' : 'No matching results'}
            </div>
          )}
        </div>,
        document.body
      )}
    </div>
  );
};

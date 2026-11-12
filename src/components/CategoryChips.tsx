import React from 'react';

interface CategoryChipsProps {
  selectedCategory: string;
  onSelectCategory: (cat: string, query: string) => void;
}

const CATEGORIES = [
  { id: 'remix', label: '🔥 Nhạc Remix Lái Xe', query: 'nhạc trẻ remix bass cực căng lái xe' },
  { id: 'driving', label: '🚗 Đường Dài Thư Giãn', query: 'nhạc lái xe đường dài hay nhất' },
  { id: 'vinahouse', label: '⚡ Vinahouse Bay Lắc', query: 'vinahouse nonstop căng đét' },
  { id: 'chill', label: '☕ Lofi Thư Giãn', query: 'nhạc lofi chill tiếng mưa lái xe' },
  { id: 'bolero', label: '📻 Bolero Bất Hủ', query: 'bolero trữ tình hay nhất trên ô tô' },
  { id: 'podcast', label: '🎙️ Podcast / Tri Thức', query: 'hieu tv podcast hay nhất' },
  { id: 'kids', label: '👶 Thiếu Nhi / Hoạt Hình', query: 'ca nhạc thiếu nhi vui nhộn cho bé' },
];

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="overflow-x-auto no-scrollbar py-2.5 px-3 sm:px-6">
      <div className="flex items-center gap-2 min-w-max">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id, cat.query)}
              className={`px-3.5 py-2 rounded-xl text-xs sm:text-sm font-semibold transition-all whitespace-nowrap active:scale-95 ${
                isSelected
                  ? 'bg-car-accent text-white shadow-md shadow-car-accent/30 border border-car-accent'
                  : 'bg-car-card text-car-textMuted hover:text-slate-200 border border-car-border hover:border-slate-600'
              }`}
            >
              {cat.label}
            </button>
          );
        })}
      </div>
    </div>
  );
};

import React from 'react';

interface CategoryChipsProps {
  selectedCategory: string;
  onSelectCategory: (cat: string, query: string) => void;
}

const CATEGORIES = [
  { id: 'remix', label: '🔥 Nhạc Remix Lái Xe', query: 'nhạc trẻ remix bass cực căng lái xe' },
  { id: 'driving', label: '🚗 Đường Dài Thư Giãn', query: 'nhạc lái xe đường dài hay nhất' },
  { id: 'vinahouse', label: '⚡ Vinahouse Bay Lắc', query: 'vinahouse nonstop căng đét' },
  { id: 'chill', label: '☕ Lofi Chill Tiếng Mưa', query: 'nhạc lofi chill tiếng mưa lái xe' },
  { id: 'bolero', label: '📻 Bolero Bất Hủ', query: 'bolero trữ tình hay nhất trên ô tô' },
  { id: 'podcast', label: '🎙️ Podcast / Tri Thức', query: 'hieu tv podcast hay nhất' },
  { id: 'kids', label: '👶 Thiếu Nhi / Hoạt Hình', query: 'ca nhạc thiếu nhi vui nhộn cho bé' },
];

export const CategoryChips: React.FC<CategoryChipsProps> = ({
  selectedCategory,
  onSelectCategory,
}) => {
  return (
    <div className="overflow-x-auto no-scrollbar py-3 px-3 sm:px-6">
      <div className="flex items-center gap-3 min-w-max">
        {CATEGORIES.map((cat) => {
          const isSelected = selectedCategory === cat.id;
          return (
            <button
              key={cat.id}
              onClick={() => onSelectCategory(cat.id, cat.query)}
              className={`h-13 sm:h-14 px-5 rounded-2xl text-base sm:text-lg font-bold transition-all whitespace-nowrap active:scale-95 flex items-center justify-center shadow-sm ${
                isSelected
                  ? 'bg-car-accent text-white shadow-lg shadow-car-accent/40 border-2 border-blue-400'
                  : 'bg-car-card text-slate-200 hover:text-white border-2 border-car-border hover:border-slate-500'
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

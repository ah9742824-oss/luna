import { useLanguage } from '../context/LanguageContext.jsx';

export default function CategoryFilter({ categories, active, onChange, allLabel }) {
  const { lang } = useLanguage();
  return (
    <div className="filter-bar" role="tablist" aria-label={lang === 'ar' ? 'تصنيفات القائمة' : 'Menu categories'}>
      <button role="tab" aria-selected={active === 'all'} className={`filter-chip ${active === 'all' ? 'active' : ''}`} onClick={() => onChange('all')}>
        {allLabel || (lang === 'ar' ? 'الكل' : 'All')}
      </button>
      {categories.map((c) => (
        <button
          key={c.id}
          role="tab"
          aria-selected={active === c.slug}
          className={`filter-chip ${active === c.slug ? 'active' : ''}`}
          onClick={() => onChange(c.slug)}
        >
          {lang === 'ar' ? c.name_ar : c.name}
        </button>
      ))}
    </div>
  );
}

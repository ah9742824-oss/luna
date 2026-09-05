import { useLanguage } from '../context/LanguageContext.jsx';

export default function ReviewCard({ review }) {
  const { lang } = useLanguage();
  return (
    <div className="card review-card">
      <div className="review-stars" role="img" aria-label={`${review.rating} ${lang === 'ar' ? 'من 5 نجوم' : 'out of 5 stars'}`}>
        {'★'.repeat(review.rating)}{'☆'.repeat(5 - review.rating)}
      </div>
      <p>&quot;{review.comment}&quot;</p>
      <div className="review-name">{review.customer_name}</div>
    </div>
  );
}

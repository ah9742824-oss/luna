import { useOutletContext } from 'react-router-dom';
import { useLanguage } from '../context/LanguageContext.jsx';
import { useDocumentHead } from '../hooks/useDocumentHead.js';

export default function About() {
  const { cafeInfo } = useOutletContext();
  const { t, lang } = useLanguage();
  const description = lang === 'ar' ? cafeInfo?.description_ar : cafeInfo?.description;

  useDocumentHead({ title: t('about_title') });

  return (
    <>
      <section className="section">
        <div className="container about-grid">
          <img src="https://images.unsplash.com/photo-1445116572660-236099ec97a0?w=800" alt={t('about_title')} />
          <div>
            <h1>{t('about_title')}</h1>
            <p>
              {description ||
                (lang === 'ar'
                  ? 'بدأت لونا كافيه كفكرة بسيطة: تقديم قهوة استثنائية في مكان يشعرك بالدفء والانتماء. اليوم أصبحنا وجهة يومية لعشاق القهوة في الحي.'
                  : 'It started as a simple idea: exceptional coffee in a place that feels warm and welcoming. Today we\'re a daily destination for coffee lovers in the neighborhood.')}
            </p>
          </div>
        </div>
      </section>

      <section className="section" style={{ background: 'var(--color-cream-dark)' }}>
        <div className="container info-grid">
          <div className="card info-card">
            <div className="icon" aria-hidden="true">🎯</div>
            <h3>{lang === 'ar' ? 'رسالتنا' : 'Our mission'}</h3>
            <p>{lang === 'ar' ? 'تقديم تجربة قهوة استثنائية بأعلى معايير الجودة، مع خدمة دافئة تشعرك وكأنك في بيتك.' : 'Delivering an exceptional coffee experience with the highest quality standards, and warm service that feels like home.'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">🌱</div>
            <h3>{lang === 'ar' ? 'مكوناتنا' : 'Our ingredients'}</h3>
            <p>{lang === 'ar' ? 'نستخدم حبوب قهوة مختارة بعناية ومكونات طازجة يومياً لضمان أفضل مذاق.' : 'We use carefully selected coffee beans and fresh ingredients daily to guarantee the best taste.'}</p>
          </div>
          <div className="card info-card">
            <div className="icon" aria-hidden="true">🤝</div>
            <h3>{lang === 'ar' ? 'ما يميزنا' : 'What sets us apart'}</h3>
            <p>{lang === 'ar' ? 'أجواء دافئة، فريق شغوف، وقائمة متجددة تناسب جميع الأذواق.' : 'A warm atmosphere, a passionate team, and an ever-refreshing menu for every taste.'}</p>
          </div>
        </div>
      </section>
    </>
  );
}

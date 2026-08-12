import "./SearchGuide.css";
import {
  LANDING_NAV_ITEMS,
  type LandingVariant,
} from "../lib/landingVariants";

/**
 * 검색엔진만 보는 키워드 더미가 아니라, 실제 사용자가 자신의 상황과 기능을
 * 연결하는 안내다. 각 정적 HTML의 제목·설명·FAQ 구조화 데이터도 같은 표현을
 * 사용한다. 문구를 바꿀 때 두 곳을 함께 갱신한다.
 */
export default function SearchGuide({ variant }: { variant: LandingVariant }) {
  return (
    <section className="landing-section search-guide" aria-labelledby="search-guide-title">
      <p className="search-guide-kicker">{variant.guideKicker}</p>
      <h2 id="search-guide-title">{variant.guideTitle}</h2>
      <p className="landing-note search-guide-lead">
        {variant.guideLead}
      </p>

      <ul className="search-topic-list" aria-label="비교할 수 있는 자취 검색 주제">
        {variant.topics.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>

      <nav className="search-guide-nav" aria-label="자취 추천 가이드">
        {LANDING_NAV_ITEMS.map((item) => (
          <a
            key={item.key}
            href={item.path}
            aria-current={item.key === variant.key ? "page" : undefined}
          >
            {item.navLabel}
          </a>
        ))}
      </nav>

      <div className="search-guide-grid">
        {variant.cards.map((guide) => (
          <article className="search-guide-card" key={guide.title}>
            <h3>{guide.title}</h3>
            <p>{guide.body}</p>
          </article>
        ))}
      </div>

      <div className="search-faq" id="faq" aria-labelledby="search-faq-title">
        <h3 id="search-faq-title">{variant.faqTitle}</h3>
        <div className="search-faq-list">
          {variant.faqs.map((faq) => (
            <article className="search-faq-item" key={faq.question}>
              <h4>{faq.question}</h4>
              <p>{faq.answer}</p>
            </article>
          ))}
        </div>
      </div>
    </section>
  );
}

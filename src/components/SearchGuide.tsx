import "./SearchGuide.css";
import type { LandingVariant } from "../lib/landingVariants";
import { AREA_DEFS } from "../seo/areas";
import { guideUrlPath } from "../seo/slug";

/**
 * 검색엔진만 보는 키워드 더미가 아니라, 실제 사용자가 자신의 상황과 기능을
 * 연결하는 안내다.
 *
 * 아래 `search-guide-nav` 는 `/guide/*` 검색어 저격 페이지(`src/seo/`,
 * React 를 부팅하지 않는 순수 문서)로 가는 링크다. 그 페이지들은 앱
 * 어디에서도 링크가 안 걸리면 크롤러가 사이트맵으로만 발견하게 되므로,
 * 여기서 앱 → 문서 방향으로 내부 링크를 만들어 둔다.
 */
const FEATURED_GUIDE_SLUGS = [
  "gangnam-commute",
  "pangyo-commute",
  "sinbundang",
  "suwon",
  "hongdae",
  "sillim",
];
const FEATURED_GUIDES = FEATURED_GUIDE_SLUGS.map(
  (slug) => AREA_DEFS.find((a) => a.slug === slug)!
).filter(Boolean);

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

      <nav className="search-guide-nav" aria-label="검색어별 자취 추천 가이드">
        {FEATURED_GUIDES.map((area) => (
          <a key={area.slug} href={guideUrlPath(area.slug)}>
            {area.keyword}
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

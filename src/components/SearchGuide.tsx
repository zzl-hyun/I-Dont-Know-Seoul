import "./SearchGuide.css";

/**
 * 검색엔진만 보는 키워드 더미가 아니라, 실제 사용자가 자신의 상황과 기능을
 * 연결하는 안내다. index.html의 제목·설명·FAQ 구조화 데이터도 같은 표현을
 * 사용한다. 문구를 바꿀 때 두 곳을 함께 갱신한다.
 */
export default function SearchGuide() {
  return (
    <section className="landing-section search-guide" aria-labelledby="search-guide-title">
      <p className="search-guide-kicker">자취 지역 찾기</p>
      <h2 id="search-guide-title">서울·신분당선 생활권 자취 동네 추천</h2>
      <p className="landing-note search-guide-lead">
        막연한 인기 순위 대신 실제 출근지를 기준으로 비교합니다. 서울 자취 추천이
        필요할 때 회사나 학교를 검색하고, 판교 출근·강남 출근처럼 생활권이
        행정구역을 넘으면 성남·수원·용인 수지·기흥까지 한 지도에서 살펴보세요.
      </p>

      <ul className="search-topic-list" aria-label="비교할 수 있는 자취 검색 주제">
        {SEARCH_TOPICS.map((topic) => (
          <li key={topic}>{topic}</li>
        ))}
      </ul>

      <div className="search-guide-grid">
        {SEARCH_GUIDES.map((guide) => (
          <article className="search-guide-card" key={guide.title}>
            <h3>{guide.title}</h3>
            <p>{guide.body}</p>
          </article>
        ))}
      </div>

      <div className="search-faq" id="faq" aria-labelledby="search-faq-title">
        <h3 id="search-faq-title">자취 동네 추천, 이렇게 이용합니다</h3>
        <div className="search-faq-list">
          {FAQS.map((faq) => (
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

const SEARCH_TOPICS = [
  "서울 자취 추천",
  "신분당선 자취 추천",
  "판교 출근 자취",
  "강남 출근 자취",
  "분당 자취",
  "수지 자취",
  "광교 자취",
  "월세 비교",
] as const;

const SEARCH_GUIDES = [
  {
    title: "판교 출근 자취 추천",
    body: "판교역이나 회사 주소를 넣고 분당·수지·광교를 포함한 후보를 예상 통근시간으로 좁힙니다.",
  },
  {
    title: "강남 출근 자취 추천",
    body: "강남역을 목적지로 두고 신분당선과 수도권 지하철의 도보시간·환승·월세를 함께 비교합니다.",
  },
  {
    title: "월세 예산별 자취 추천",
    body: "월세 상한을 넘는 지역은 제외하고 남은 동네의 치안·가격·생활편의 순위를 다시 계산합니다.",
  },
] as const;

/* index.html의 FAQPage 구조화 데이터와 질문·답변을 동일하게 유지한다. */
const FAQS = [
  {
    question: "서울 자취 추천 지역을 어떻게 고르나요?",
    answer:
      "회사나 학교를 목적지로 검색한 뒤 통근시간과 월세 상한을 정하고 치안·가격·생활편의 가중치를 조절하면 조건에 맞는 행정동을 순서대로 비교할 수 있습니다.",
  },
  {
    question: "판교나 강남 출근에 맞는 자취 동네도 찾을 수 있나요?",
    answer:
      "판교역이나 강남역, 실제 회사 주소를 목적지로 넣으면 지하철과 도보를 합산한 예상 통근시간으로 서울과 인접 경기 지역의 후보를 좁힐 수 있습니다.",
  },
  {
    question: "월세 예산을 정해서 자취 지역을 추천받을 수 있나요?",
    answer:
      "월세 상한을 설정하면 예산을 넘는 동네를 추천 목록에서 제외하고, 남은 지역의 환산월세와 가격 점수를 비교할 수 있습니다.",
  },
  {
    question: "분당·수원·용인도 서울과 같이 비교되나요?",
    answer:
      "서울 전체와 성남, 수원, 용인 수지구·기흥구의 행정동을 같은 평가 기준과 통근 조건으로 한 지도에서 비교합니다.",
  },
] as const;

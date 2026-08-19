export const SUPPORTED_LOCALES = ["ko", "en", "ja"] as const;

export type Locale = (typeof SUPPORTED_LOCALES)[number];

export const DEFAULT_LOCALE: Locale = "ko";

export const LOCALE_META: Record<
  Locale,
  { htmlLang: string; ogLocale: string; label: string; nativeLabel: string }
> = {
  ko: { htmlLang: "ko-KR", ogLocale: "ko_KR", label: "Korean", nativeLabel: "한국어" },
  en: { htmlLang: "en", ogLocale: "en_US", label: "English", nativeLabel: "English" },
  ja: { htmlLang: "ja", ogLocale: "ja_JP", label: "Japanese", nativeLabel: "日本語" },
};

const LOCALE_PREFIX_RE = /^\/(en|ja)(?=\/|$)/;

export function localeFromPath(pathname: string): Locale {
  const match = pathname.match(LOCALE_PREFIX_RE);
  return match?.[1] === "en" || match?.[1] === "ja" ? match[1] : DEFAULT_LOCALE;
}

export function stripLocalePrefix(pathname: string): string {
  const stripped = pathname.replace(LOCALE_PREFIX_RE, "");
  if (!stripped) return "/";
  return stripped.startsWith("/") ? stripped : `/${stripped}`;
}

export function localeRoot(locale: Locale): string {
  return locale === "ko" ? "/" : `/${locale}/`;
}

export function localizePath(pathname: string, locale: Locale): string {
  const base = stripLocalePrefix(pathname);
  if (locale === "ko") return base;
  if (base === "/") return `/${locale}/`;
  return `/${locale}${base}`;
}

export function switchLocaleHref(
  location: { pathname: string; search: string; hash: string },
  locale: Locale
): string {
  return `${localizePath(location.pathname, locale)}${location.search}${location.hash}`;
}

type Translation = { en: string; ja: string };

/**
 * Korean source strings are the stable message ids. Keeping all target strings in one
 * catalogue makes missing translations visible in review and lets non-React renderers
 * (SEO pages and MapLibre popups) use exactly the same copy.
 */
const MESSAGES: Record<string, Translation> = {
  "한국어": { en: "Korean", ja: "韓国語" },
  "영어": { en: "English", ja: "英語" },
  "일본어": { en: "Japanese", ja: "日本語" },
  "언어": { en: "Language", ja: "言語" },
  "밝게 보기": { en: "Use light theme", ja: "ライトテーマにする" },
  "어둡게 보기": { en: "Use dark theme", ja: "ダークテーマにする" },
  "밝게": { en: "Light", ja: "ライト" },
  "어둡게": { en: "Dark", ja: "ダーク" },
  "지하철 노선도": { en: "Subway map", ja: "地下鉄路線図" },
  "노선": { en: "Lines", ja: "路線" },
  "켜기": { en: "Show", ja: "表示" },
  "끄기": { en: "Hide", ja: "非表示" },
  "전부 다시 켜기": { en: "Show all lines", ja: "すべての路線を表示" },
  "지도를 불러오는 중...": { en: "Loading the map...", ja: "地図を読み込んでいます..." },
  "오류": { en: "Error", ja: "エラー" },
  "회사나 학교를 검색하면, 통근 가능한 동네를 치안·월세·생활편의 등급으로 한눈에 보여줍니다.": {
    en: "Search for a workplace or school to compare commutable neighborhoods by safety, rent, and convenience.",
    ja: "勤務先や学校を検索すると、通勤可能な街を治安・家賃・生活利便性で比較できます。",
  },
  "회사나 학교를 검색하세요 (예: 강남역, SK AX)": {
    en: "Search for a workplace or school (e.g. Gangnam Station, SK AX)",
    ja: "勤務先や学校を検索（例：カンナム駅、SK AX）",
  },
  "다른 곳으로 바꾸려면 검색하세요 (예: 강남역, SK AX)": {
    en: "Search to replace the destination (e.g. Gangnam Station, SK AX)",
    ja: "別の目的地に変更するには検索（例：カンナム駅、SK AX）",
  },
  "목적지를 더 추가할 수 없습니다": {
    en: "No more destinations can be added",
    ja: "これ以上目的地を追加できません",
  },
  "목적지 검색": { en: "Destination search", ja: "目的地検索" },
  "검색 결과가 없습니다": { en: "No results found", ja: "検索結果がありません" },
  "지하철역": { en: "Subway station", ja: "地下鉄駅" },
  "행정동": { en: "Neighborhood", ja: "行政洞" },
  "목적지": { en: "Destination", ja: "目的地" },
  "모두 만족하는 지역": { en: "areas that work for all", ja: "すべてを満たす地域" },
  "제거": { en: "Remove", ja: "削除" },
  "+ 목적지 추가 (예: 룸메이트 회사)": {
    en: "+ Add a destination (e.g. roommate's office)",
    ja: "+ 目的地を追加（例：同居人の勤務先）",
  },
  "지도의 역을 클릭해서도 목적지를 더할 수 있습니다": {
    en: "You can also click a station on the map to add it",
    ja: "地図上の駅をクリックして追加することもできます",
  },
  "목적지는 최대": { en: "Up to", ja: "目的地は最大" },
  "개까지입니다.": { en: "destinations are allowed.", ja: "件までです。" },
  "오른쪽 패널 보기": { en: "Right panel view", ja: "右パネル表示" },
  "상세 정보": { en: "Details", ja: "詳細" },
  "동네를 선택하세요": { en: "Select a neighborhood", ja: "街を選択してください" },
  "조건·추천": { en: "Filters & picks", ja: "条件・おすすめ" },
  "통근권": { en: "Commutable", ja: "通勤圏" },
  "조건": { en: "Filters", ja: "条件" },
  "통근": { en: "Commute", ja: "通勤" },
  "월세": { en: "Rent", ja: "家賃" },
  "제한 없음": { en: "No limit", ja: "上限なし" },
  "월세 제한은 아래 “월세 기준”에서 고른 유형·계산 방식의 중앙값 기준입니다. 표본이 없는 동은 제한을 설정해도 거르지 않습니다.": {
    en: "The rent cap uses the median for the selected housing types and calculation method. Neighborhoods without samples are not excluded.",
    ja: "家賃上限は、選択した住宅タイプと計算方法の中央値を基準にします。サンプルがない地域は除外しません。",
  },
  "월세 기준": { en: "Rent basis", ja: "家賃の基準" },
  "포함할 주택유형": { en: "Housing types to include", ja: "含める住宅タイプ" },
  "최소 1개는 선택돼 있어야 합니다": {
    en: "At least one type must remain selected",
    ja: "少なくとも1種類を選択してください",
  },
  "월세 계산 방식": { en: "Rent calculation", ja: "家賃の計算方法" },
  "환산월세": { en: "Deposit-adjusted rent", ja: "保証金換算家賃" },
  "순수월세": { en: "Monthly payment only", ja: "月額家賃のみ" },
  "보증금이 큰 매물이 실제보다 싸게 보일 수 있습니다.": {
    en: "Listings with large deposits may appear cheaper than they really are.",
    ja: "保証金が高い物件は、実際より安く見える場合があります。",
  },
  "무엇이 중요한가요?": { en: "What matters to you?", ja: "何を重視しますか？" },
  "치안": { en: "Safety", ja: "治安" },
  "가격": { en: "Price", ja: "価格" },
  "편의": { en: "Convenience", ja: "利便性" },
  "생활편의": { en: "Convenience", ja: "生活利便性" },
  "지도 색 기준": { en: "Map color mode", ja: "地図の色分け" },
  "등급": { en: "Grade", ja: "評価" },
  "통근시간": { en: "Commute time", ja: "通勤時間" },
  "등급은 대상 지역 전체 분포 기준 상대 평가입니다 — 상위 30%가 Best, 하위 30%가 Bad입니다.": {
    en: "Grades are relative across the entire coverage area: the top 30% are Best and the bottom 30% are Bad.",
    ja: "評価は対象地域全体での相対評価です。上位30%がBest、下位30%がBadです。",
  },
  "목적지가 여럿이면": { en: "With multiple destinations,", ja: "目的地が複数ある場合は" },
  "가장 오래 걸리는 쪽": { en: "the longest commute", ja: "最も時間がかかる目的地" },
  "기준입니다.": { en: "is used.", ja: "を基準にします。" },
  "링크가 복사됐습니다": { en: "Link copied", ja: "リンクをコピーしました" },
  "이 결과 링크 복사": { en: "Copy this result link", ja: "この結果のリンクをコピー" },
  "목적지·조건·가중치가 주소에 담깁니다. 받은 사람은 같은 화면을 그대로 봅니다.": {
    en: "The URL includes destinations, filters, and weights so the recipient sees the same view.",
    ja: "URLに目的地・条件・重みが保存され、相手も同じ画面を見られます。",
  },
  "먼저 목적지를 정해주세요.": { en: "Choose a destination first.", ja: "まず目的地を選んでください。" },
  "출근할 회사나 등교할 학교를 검색하면": {
    en: "Search for your workplace or school",
    ja: "勤務先や通学先を検索すると",
  },
  "통근 가능한 지역이 지도에 나타납니다.": {
    en: "to see commutable areas on the map.",
    ja: "通勤・通学可能な地域が地図に表示されます。",
  },
  "등급은 공공·공개 데이터로 계산한 대상 지역 내 상대 평가이며, 특정 지역에 대한 가치판단이 아닙니다. 통근시간은 정적 지하철·버스 모델 추정치이며 실시간 교통상황에 따라 달라질 수 있습니다.": {
    en: "Grades are relative rankings within the coverage area calculated from public and open data, not value judgments about any neighborhood. Commute times are static subway and bus estimates and may differ from live conditions.",
    ja: "評価は公開データから算出した対象地域内の相対順位であり、特定地域への価値判断ではありません。通勤時間は静的な地下鉄・バスモデルの推定値で、実際の交通状況により異なります。",
  },
  "데이터 기준": { en: "Data versions", ja: "データ基準" },
  "경계": { en: "boundaries", ja: "境界" },
  "지하철": { en: "subway", ja: "地下鉄" },
  "버스": { en: "bus", ja: "バス" },
  "거주분포": { en: "residential distribution", ja: "居住分布" },
  "지표": { en: "metrics", ja: "指標" },
  "미수집 지표": { en: "Unavailable metrics", ja: "未収集の指標" },
  "현재 통근 시간 안에 드는 지역이 없습니다.": {
    en: "No area is within the current commute limit.",
    ja: "現在の通勤時間内に該当する地域がありません。",
  },
  "통근 한계를 최대로 늘려도 조건에 맞는 지역이 없습니다.": {
    en: "No area matches even at the maximum commute limit.",
    ja: "通勤上限を最大にしても条件に合う地域がありません。",
  },
  "현재 월세 상한과 통근 조건을 함께 만족하는 지역이 없습니다.": {
    en: "No area meets both the rent cap and commute limit.",
    ja: "家賃上限と通勤条件の両方を満たす地域がありません。",
  },
  "월세 제한 해제": { en: "Remove rent cap", ja: "家賃上限を解除" },
  "통근 한계 15분 늘리기": { en: "Add 15 min to commute limit", ja: "通勤上限を15分延長" },
  "추천 지역": { en: "Recommended areas", ja: "おすすめ地域" },
  "수도권": { en: "coverage area", ja: "対象地域" },
  "개 동 중": { en: "neighborhoods, rank", ja: "地域中" },
  "상위": { en: "Top", ja: "上位" },
  "종합 점수": { en: "Overall score", ja: "総合スコア" },
  "종합": { en: "Overall", ja: "総合" },
  "서울 중앙값": { en: "Overall median", ja: "全体中央値" },
  "가중치": { en: "weight", ja: "重み" },
  "건": { en: " records", ja: "件" },
  "계산 근거 전체 보기": { en: "Show full calculation", ja: "計算根拠をすべて表示" },
  "원지표 · 백분위 · 가중치 · 등급 컷": {
    en: "Raw metrics · percentiles · weights · grade thresholds",
    ja: "元指標・パーセンタイル・重み・評価基準",
  },
  "수집된 데이터가 없어 전 동 50점으로 둡니다.": {
    en: "No data was collected, so every neighborhood receives 50 points.",
    ja: "収集データがないため、全地域を50点としています。",
  },
  "자치구 중앙값": { en: "district median", ja: "区の中央値" },
  "이 조합의 실거래 표본이 부족해 자치구 중앙값으로 대체했습니다.": {
    en: "This combination has too few transactions, so the district median is used.",
    ja: "この組み合わせは取引サンプルが少ないため、区の中央値で補完しています。",
  },
  "위 월세는 단독·다가구+오피스텔+아파트 세 유형을 합친 중앙값입니다.": {
    en: "The rent above is the combined median for detached and multi-family housing, officetels, and apartments.",
    ja: "上記の家賃は、戸建て・多世帯住宅、オフィステル、マンションの3種類を合わせた中央値です。",
  },
  "같은 소형 기준이어도 아파트가 대체로 더 비쌉니다.": {
    en: "Apartments are generally more expensive even within the same small-home size range.",
    ja: "同じ小型住宅の基準でも、マンションは一般的に高くなります。",
  },
  "이 조합·모드는 표본이 서울 전체에서 없어 전 동 50점으로 둡니다": {
    en: "This combination has no samples anywhere in the coverage area, so every neighborhood receives 50 points.",
    ja: "この組み合わせには対象地域全体でサンプルがないため、全地域を50点としています。",
  },
  "통근 경로": { en: "Commute route", ja: "通勤経路" },
  "환승 없음": { en: "No transfers", ja: "乗り換えなし" },
  "도달 불가": { en: "Unreachable", ja: "到達不可" },
  "데이터 없음": { en: "No data", ja: "データなし" },
  "네 유형별 참고값 보기": { en: "Show reference values by housing type", ja: "住宅タイプ別の参考値を見る" },
  "네 유형별 실측치 보기": { en: "Show measured values by housing type", ja: "住宅タイプ別の実測値を見る" },
  "표본 없음": { en: "No samples", ja: "サンプルなし" },
  "목적지까지 도보": { en: "Walk to destination", ja: "目的地まで徒歩" },
  "지하철 승차 대기": { en: "Wait for subway", ja: "地下鉄の待ち時間" },
  "버스 접근(추정)": { en: "Bus access (estimated)", ja: "バスアクセス（推定）" },
  "거주지 인근": { en: "Near home", ja: "居住地付近" },
  "먼저 목적지를 정해주세요": { en: "Choose a destination first", ja: "まず目的地を選んでください" },
  "예산 초과": { en: "Over budget", ja: "予算超過" },
  "통근 가능 시간 밖": { en: "Outside commute limit", ja: "通勤時間外" },
  "클릭하면 목적지로 추가": { en: "Click to add as a destination", ja: "クリックして目的地に追加" },
  "단독·다가구": { en: "Detached & multi-family", ja: "戸建て・多世帯住宅" },
  "연립·다세대": { en: "Row & multiplex housing", ja: "連立・多世帯住宅" },
  "오피스텔": { en: "Officetel", ja: "オフィステル" },
  "아파트": { en: "Apartment", ja: "マンション" },
  "20분 이내": { en: "Within 20 min", ja: "20分以内" },
  "30분": { en: "30 min", ja: "30分" },
  "40분": { en: "40 min", ja: "40分" },
  "60분": { en: "60 min", ja: "60分" },
  "60분 초과": { en: "Over 60 min", ja: "60分超" },
  "문의하기": { en: "Contact us", ja: "お問い合わせ" },
  "문의 유형 목록으로 돌아가기": { en: "Back to inquiry types", ja: "お問い合わせ種別に戻る" },
  "뒤로": { en: "Back", ja: "戻る" },
  "무엇을 도와드릴까요?": { en: "How can we help?", ja: "どのようなご用件ですか？" },
  "보내실 의견의 종류를 선택해 주세요.": {
    en: "Choose the type of feedback you would like to send.",
    ja: "お送りいただく内容の種類を選択してください。",
  },
  "문의 창 닫기": { en: "Close contact window", ja: "お問い合わせ画面を閉じる" },
  "닫기": { en: "Close", ja: "閉じる" },
  "문의 폼을 불러오는 중...": { en: "Loading the contact form...", ja: "お問い合わせフォームを読み込んでいます..." },
  "문의": { en: "Contact", ja: "お問い合わせ" },
  "폼이 보이지 않나요? 새 탭에서 열기": {
    en: "Form not visible? Open it in a new tab",
    ja: "フォームが表示されない場合は新しいタブで開く",
  },
  "서비스 피드백": { en: "Product feedback", ja: "サービスへのご意見" },
  "사용하면서 느낀 점을 들려주세요.": {
    en: "Tell us about your experience.",
    ja: "ご利用になった感想をお聞かせください。",
  },
  "지역 추가 요청": { en: "Request an area", ja: "地域追加のリクエスト" },
  "찾고 싶은 지역을 알려주세요.": {
    en: "Tell us which area you want to explore.",
    ja: "追加してほしい地域をお知らせください。",
  },
  "잘못된 정보 제보": { en: "Report incorrect data", ja: "誤った情報を報告" },
  "지역·통근·월세 데이터 오류를 알려주세요.": {
    en: "Report errors in neighborhood, commute, or rent data.",
    ja: "地域・通勤・家賃データの誤りをお知らせください。",
  },
  "목적지 없이 지도부터 볼게요": { en: "Open the map without a destination", ja: "目的地を決めずに地図を見る" },
  "서버에 아무것도 저장하지 않습니다": { en: "Nothing is stored on our server", ja: "サーバーには何も保存しません" },
  "무엇을 해주는가": { en: "What it does", ja: "できること" },
  "이게 실제 화면입니다": { en: "This is the real interface", ja: "実際の画面です" },
  "합성이나 컨셉 이미지가 아니라, 강남역을 목적지로 두고 실행한 화면을 그대로 찍은 것입니다.": {
    en: "This is an actual capture with Gangnam Station set as the destination, not a mockup or concept image.",
    ja: "合成やコンセプト画像ではなく、カンナム駅を目的地に設定した実際の画面です。",
  },
  "지도를 두 가지로 봅니다": { en: "Two ways to read the map", ja: "2つの地図表示" },
  "두 모드의 색 계열을 다르게 둔 이유는, 같은 계열이면 “빨간 동네가 나쁜 건지 먼 건지” 구분이 안 되기 때문입니다.": {
    en: "The two modes use different palettes so a red area cannot be mistaken for either a low grade or a long commute.",
    ja: "同じ色系統では赤が低評価なのか遠距離なのか区別できないため、2つのモードで配色を分けています。",
  },
  "왜 그 등급인지 전부 보여줍니다": { en: "See exactly why an area received its grade", ja: "評価の理由をすべて表示" },
  "점수만 던지지 않습니다. 원지표가 전체 중앙값 대비 어디쯤인지, 백분위가 몇 점인지, 가중치가 얼마인지, 그게 어떻게 합산됐는지 마지막 덧셈까지 펼쳐서 보여줍니다.": {
    en: "You get more than a score: raw values, their position against the overall median, percentiles, weights, and the final calculation are all shown.",
    ja: "点数だけでなく、元の数値、全体中央値との比較、パーセンタイル、重み、最終的な計算式まで表示します。",
  },
  "믿으라고 하지 않고, 검산할 수 있게 둡니다.": {
    en: "You can verify the result instead of taking it on trust.",
    ja: "結果を鵜呑みにせず、自分で検算できます。",
  },
  "통근시간을 직접 계산합니다": { en: "Commute times are calculated in your browser", ja: "通勤時間をブラウザで直接計算" },
  "외부 길찾기 API를 부르지 않습니다. 지하철 그래프를 브라우저에서 직접 탐색하기 때문에, 조건을 바꿔도 네트워크 왕복 없이 즉시 다시 계산됩니다.": {
    en: "No external directions API is called. The browser searches a local subway graph, so changing a filter recalculates results immediately without a network round trip.",
    ja: "外部の経路検索APIは呼び出しません。ブラウザ内で地下鉄グラフを探索するため、条件変更後も通信なしですぐ再計算されます。",
  },
  "몇 분이 걸리는지만이 아니라 어느 역에서 타고 어디서 갈아타는지까지 구간별로 나옵니다.": {
    en: "Each leg shows where to board and transfer, not just the total minutes.",
    ja: "所要時間だけでなく、乗車駅と乗換駅も区間ごとに表示します。",
  },
  "무엇을 보고 매기는가": { en: "What goes into the score", ja: "評価に使うデータ" },
  "축": { en: "Category", ja: "軸" },
  "무엇을 보는가": { en: "Signals", ja: "見る指標" },
  "기본": { en: "Default", ja: "基本" },
  "유흥업소 밀도, 5대범죄(자치구), 교통사고 다발지역": {
    en: "Nightlife density, five major crimes (district level), and traffic-accident hotspots",
    ja: "遊興施設密度、5大犯罪（区単位）、交通事故多発地点",
  },
  "선택한 주택유형의 월세 중앙값 (기본: 단독·다가구 환산월세)": {
    en: "Median rent for selected housing types (default: deposit-adjusted detached and multi-family housing)",
    ja: "選択した住宅タイプの家賃中央値（既定：戸建て・多世帯住宅の保証金換算家賃）",
  },
  "편의점·마트, 음식점, 병원·약국, 교통 접근성": {
    en: "Convenience stores and markets, restaurants, healthcare, and transit access",
    ja: "コンビニ・スーパー、飲食店、病院・薬局、交通アクセス",
  },
  "이 비중은 슬라이더로 직접 바꿉니다. 월세가 제일 중요한 사람과 조용한 동네가 제일 중요한 사람에게 같은 순위를 강요할 근거가 없습니다. 아래에서 직접 옮겨보세요.": {
    en: "Adjust these weights yourself. Someone focused on rent should not be forced into the same ranking as someone who prioritizes a quiet neighborhood.",
    ja: "重みはスライダーで変更できます。家賃を最優先する人と静かな街を重視する人に同じ順位を押し付ける必要はありません。",
  },
  "둘 다 가까운 동네도 찾습니다": { en: "Find areas that work for more than one person", ja: "複数の目的地に近い街も検索" },
  "판정은 가장 오래 걸리는 쪽 기준입니다. 평균이나 합을 쓰면 “한 명은 20분, 다른 한 명은 90분”인 동네가 통과해버립니다.": {
    en: "The longest trip is used. An average or sum could incorrectly accept a place where one person travels 20 minutes and another 90.",
    ja: "判定には最長の通勤時間を使います。平均や合計では、片方が20分でももう片方が90分の地域が通ってしまいます。",
  },
  "조건과 가중치": { en: "Filters and weights", ja: "条件と重み" },
  "등급 아이콘": { en: "Grade markers", ja: "評価マーカー" },
  "추천 목록": { en: "Recommendations", ja: "おすすめ一覧" },
  "가중치 조절": { en: "Adjustable weights", ja: "重みの調整" },
  "목적지 여러 개": { en: "Multiple destinations", ja: "複数の目的地" },
  "예산 필터": { en: "Budget filter", ja: "予算フィルター" },
  "링크 공유": { en: "Shareable links", ja: "リンク共有" },
  "비교할 수 있는 자취 검색 주제": { en: "Neighborhood guides you can compare", ja: "比較できる街探しガイド" },
  "검색어별 자취 추천 가이드": { en: "Neighborhood guides by search topic", ja: "検索テーマ別の街選びガイド" },
  "홈": { en: "Home", ja: "ホーム" },
  "동네별 요약": { en: "Neighborhood summary", ja: "地域別まとめ" },
  "동별 실측 지표": { en: "Measured metrics by neighborhood", ja: "地域別の実測指標" },
  "지역별 비교": { en: "Area comparison", ja: "地域別比較" },
  "자주 묻는 질문": { en: "Frequently asked questions", ja: "よくある質問" },
  "지도에서 내 조건으로 비교하기 →": { en: "Compare with my filters on the map →", ja: "自分の条件で地図上で比較する →" },
  "전체 자취 추천 지도로 돌아가기": { en: "Back to the full neighborhood map", ja: "街選びマップ全体に戻る" },
  "관련 자취 추천": { en: "Related neighborhood guides", ja: "関連する街選びガイド" },
  "지역": { en: "Area", ja: "地域" },
  "동 수": { en: "Neighborhoods", ja: "地域数" },
  "환산월세 중앙값": { en: "Median adjusted rent", ja: "保証金換算家賃の中央値" },
  "최근접역 도보": { en: "Walk to nearest station", ja: "最寄り駅まで徒歩" },
  "5대범죄": { en: "Five major crimes", ja: "5大犯罪" },
  "유흥업소 밀도": { en: "Nightlife density", ja: "遊興施設密度" },
  "편의점·마트 밀도": { en: "Store density", ja: "コンビニ・スーパー密度" },
  "음식점 밀도": { en: "Restaurant density", ja: "飲食店密度" },
  "병원·약국 밀도": { en: "Healthcare density", ja: "病院・薬局密度" },
  "단독·다가구 월세": { en: "Detached & multi-family rent", ja: "戸建て・多世帯住宅の家賃" },
  "연립·다세대 월세": { en: "Row & multiplex rent", ja: "連立・多世帯住宅の家賃" },
  "오피스텔 월세": { en: "Officetel rent", ja: "オフィステル家賃" },
  "소형아파트 월세": { en: "Small-apartment rent", ja: "小型マンション家賃" },
  "강남역을 목적지로 둔 실행 화면. 서울 지도가 초록·노랑·빨강으로 칠해져 있고 오른쪽에 조건·가중치 패널과 추천 동네 목록이 있다.": {
    en: "The live app with Gangnam Station as the destination: the map is colored green, yellow, and red, with filters, weights, and recommended neighborhoods in the right panel.",
    ja: "カンナム駅を目的地にした実際の画面。地図は緑・黄・赤で色分けされ、右側に条件・重み・おすすめ地域が表示されています。",
  },
  "등급 모드 — 초록·노랑·빨강으로 칠해진 서울 지도": {
    en: "Grade mode — a Seoul map colored green, yellow, and red",
    ja: "評価モード — 緑・黄・赤で色分けしたソウル地図",
  },
  "통근시간 모드 — 강남역에서 멀어질수록 옅어지는 파랑 지도": {
    en: "Commute mode — a blue map that darkens with travel time from Gangnam Station",
    ja: "通勤時間モード — カンナム駅からの所要時間を青の濃淡で示した地図",
  },
  "교통사고 다발지역": { en: "Traffic-accident hotspots", ja: "交通事故多発地点" },
  "노들역까지 도보": { en: "Walk to Nodeul Station", ja: "ノドゥル駅まで徒歩" },
  "승차 대기": { en: "Wait to board", ja: "乗車待ち" },
  "9호선 7정거장 · 노들 → 신논현": {
    en: "Line 9, 7 stops · Nodeul → Sinnonhyeon",
    ja: "9号線 7駅・ノドゥル → シンノンヒョン",
  },
  "신논현역 환승 · 9호선 → 신분당선": {
    en: "Transfer at Sinnonhyeon · Line 9 → Shinbundang Line",
    ja: "シンノンヒョン駅で乗換・9号線 → 新盆唐線",
  },
  "신분당선 1정거장 · 신논현 → 강남": {
    en: "Shinbundang Line, 1 stop · Sinnonhyeon → Gangnam",
    ja: "新盆唐線 1駅・シンノンヒョン → カンナム",
  },
  "행정동을 전부 등급화": { en: "administrative neighborhoods ranked", ja: "行政洞をすべて評価" },
  "지하철 22개 노선": { en: "stations across 22 subway lines", ja: "地下鉄22路線の駅" },
  "등급에 쓰는 공공데이터 지표": { en: "public-data metrics used", ja: "評価に使う公開データ指標" },
  "외부 길찾기 API 호출": { en: "external directions API calls", ja: "外部経路検索API呼び出し" },
  "회사·학교를 검색하거나 지도의 역을 눌러 넣습니다. 최대 3곳.": {
    en: "Search for a workplace or school, or click a station on the map. Add up to three.",
    ja: "勤務先・学校を検索するか、地図上の駅を選択します。最大3か所。",
  },
  "통근 한계·월세 상한을 정하고, 무엇을 중요하게 볼지 비중을 옮깁니다.": {
    en: "Set commute and rent limits, then adjust what matters most.",
    ja: "通勤時間・家賃上限を決め、重視する項目の比率を調整します。",
  },
  "행정동마다 Best·Normal·Bad 를 점으로 찍습니다. 조건을 바꾸면 즉시 다시 칠해집니다.": {
    en: "Every neighborhood receives a Best, Normal, or Bad marker and recolors immediately when filters change.",
    ja: "各行政洞をBest・Normal・Badで表示し、条件変更後すぐに色を更新します。",
  },
  "고른 동네에서 목적지까지 실제로 어떤 경로인지 점선으로 그립니다.": {
    en: "A dotted line shows the estimated route from the selected neighborhood to each destination.",
    ja: "選んだ街から目的地までの推定経路を点線で表示します。",
  },
  "624개 역과 22개 노선을 깔아둡니다. 노선별로 끄고 켤 수 있습니다.": {
    en: "Overlay 624 stations and 22 lines, with per-line visibility controls.",
    ja: "624駅・22路線を重ね、路線ごとに表示を切り替えられます。",
  },
  "조건을 만족하는 동네를 점수 순으로 세웁니다. 누르면 상세가 열립니다.": {
    en: "Matching neighborhoods are ranked by score; select one to open its details.",
    ja: "条件を満たす街をスコア順に並べ、選択すると詳細を開きます。",
  },
  "556개 행정동 등급화": { en: "556 neighborhoods ranked", ja: "556行政洞を評価" },
  "서울과 신분당선 축(수원·성남·용인), GTX-A 축(화성 동탄)을 Best / Normal / Bad 로 나눕니다.": {
    en: "Rank Seoul, the Shinbundang corridor (Suwon, Seongnam, and Yongin), and the GTX-A corridor in Dongtan as Best, Normal, or Bad.",
    ja: "ソウル、新盆唐線沿線（スウォン・ソンナム・ヨンイン）、GTX-A沿線（華城トンタン）をBest・Normal・Badに分類します。",
  },
  "치안·가격·생활편의 비중을 옮기면 즉시 재계산됩니다.": {
    en: "Results recalculate instantly when safety, price, or convenience weights move.",
    ja: "治安・価格・生活利便性の重みを変えると、すぐ再計算されます。",
  },
  "“우리 둘 다 40분 이내인 동네” — 최대 3곳까지.": {
    en: "Find an area within 40 minutes for everyone, using up to three destinations.",
    ja: "「二人とも40分以内」の街を、最大3か所の目的地で探せます。",
  },
  "월세 상한을 넘는 동네를 지도에서 걸러냅니다.": {
    en: "Filter neighborhoods above your rent cap off the map.",
    ja: "家賃上限を超える街を地図から除外します。",
  },
  "624개 역, 22개 노선 오버레이 — 노선별로 켜고 끕니다.": {
    en: "Overlay 624 stations and 22 lines, toggled line by line.",
    ja: "624駅・22路線を重ね、路線ごとに表示を切り替えます。",
  },
  "찾은 결과를 그대로 링크로 보냅니다. 다크/라이트 지원.": {
    en: "Share the exact result as a link, with dark and light themes.",
    ja: "検索結果をそのままリンクで共有。ダーク／ライトテーマ対応。",
  },
  "치안이 제일 중요": { en: "Prioritize safety", ja: "治安を最優先" },
  "무조건 싸게": { en: "Lowest price", ja: "価格を最優先" },
  "생활이 편한 곳": { en: "Most convenient", ja: "利便性を最優先" },
};

export function translate(locale: Locale, source: string): string {
  if (locale === "ko") return source;
  return MESSAGES[source]?.[locale] ?? source;
}

export function hasTranslation(locale: Exclude<Locale, "ko">, source: string): boolean {
  return Boolean(MESSAGES[source]?.[locale]);
}

export function translationEntries(): ReadonlyArray<[string, Translation]> {
  return Object.entries(MESSAGES);
}

const NUMBER_FORMATS = new Map<string, Intl.NumberFormat>();

export function formatNumber(
  locale: Locale,
  value: number,
  options: Intl.NumberFormatOptions = {}
): string {
  const key = `${locale}:${JSON.stringify(options)}`;
  let formatter = NUMBER_FORMATS.get(key);
  if (!formatter) {
    formatter = new Intl.NumberFormat(LOCALE_META[locale].htmlLang, options);
    NUMBER_FORMATS.set(key, formatter);
  }
  return formatter.format(value);
}

export function formatMinutes(locale: Locale, value: number, digits = 0): string {
  const amount = formatNumber(locale, value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  if (locale === "en") return `${amount} min`;
  return locale === "ja" ? `${amount}分` : `${amount}분`;
}

export function formatRentMan(locale: Locale, value: number, digits = 0): string {
  if (locale === "en") {
    return `₩${formatNumber(locale, value * 10_000, {
      minimumFractionDigits: 0,
      maximumFractionDigits: 0,
    })}`;
  }
  const amount = formatNumber(locale, value, {
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  });
  return locale === "ja" ? `${amount}万ウォン` : `${amount}만원`;
}

export function formatPercent(locale: Locale, value: number, digits = 0): string {
  return new Intl.NumberFormat(LOCALE_META[locale].htmlLang, {
    style: "percent",
    minimumFractionDigits: digits,
    maximumFractionDigits: digits,
  }).format(value / 100);
}

export function formatNeighborhoodCount(locale: Locale, value: number): string {
  const amount = formatNumber(locale, value);
  if (locale === "en") return `${amount} neighborhoods`;
  if (locale === "ja") return `${amount}地域`;
  return `${amount}개 동`;
}

export function formatDestinationCount(locale: Locale, value: number): string {
  const amount = formatNumber(locale, value);
  if (locale === "en") return `${amount} destinations`;
  if (locale === "ja") return `${amount}件`;
  return `${amount}개`;
}

export function formatRank(locale: Locale, rank: number, total: number): string {
  const pct = Math.max(1, Math.round((rank / total) * 100));
  if (locale === "en") {
    return `#${formatNumber(locale, rank)} of ${formatNumber(locale, total)} · top ${formatPercent(locale, pct)}`;
  }
  if (locale === "ja") {
    return `${formatNumber(locale, total)}地域中${formatNumber(locale, rank)}位・上位${formatPercent(locale, pct)}`;
  }
  return `수도권 ${formatNumber(locale, total)}개 동 중 ${formatNumber(locale, rank)}위 · 상위 ${formatPercent(locale, pct)}`;
}

export function formatRentPeriod(
  locale: Locale,
  startDate: string,
  endDate: string
): string {
  const startYear = startDate.slice(0, 4);
  const endYear = endDate.slice(0, 4);
  if (locale === "en") return `${startYear}–${endYear} new leases (Seoul & MOLIT)`;
  if (locale === "ja") return `${startYear}～${endYear}年の新規契約（ソウル特別市・国土交通部）`;
  return `${startYear}~${endYear}년 신규 계약(서울특별시·국토교통부)`;
}

/** Runtime bundle-validation errors originate in Korean; expose a stable localized message. */
export function localizeDataError(locale: Locale, message: string): string {
  if (locale === "ko") return message;
  const status = message.match(/HTTP\s+\d+/)?.[0];
  if (locale === "en") {
    return status
      ? `The data could not be loaded (${status}).`
      : "The downloaded data is invalid. Please refresh and try again.";
  }
  return status
    ? `データを読み込めませんでした（${status}）。`
    : "読み込んだデータが破損しています。ページを再読み込みしてください。";
}

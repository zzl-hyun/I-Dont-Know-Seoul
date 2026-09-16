# API DB 기준 감사 및 요구사항 추적표

작성일: 2026-09-16<br>
대상: `I Don't Know Seoul` API·D1 제출물 T01 기준 감사<br>
범위: 요구사항정의서·화면설계서와 현재 코드·설정의 정합성 확인

## 0. 결론과 사용 방법

최종 요구사항정의서의 실제 표에는 기능 요구사항 15개(`REQ-FUNC-001`~`REQ-FUNC-015`)와 비기능 요구사항 6개(`REQ-NFN-001`~`REQ-NFN-006`)가 모두 존재한다. 화면설계서는 `SCR-HOME-001`, `SCR-MAIN-001`, `SCR-WGHT-001`, `SCR-DONG-001`, `SCR-AUTH-001`, `SCR-RVW-001`, `SCR-RVW-002`의 7개 화면을 정의한다. 따라서 T01에서 요구사항 개수 자체의 누락은 발견되지 않았다.

이 문서는 다음 담당자가 API와 DB 원본을 작성할 때 사용할 기준선이다.

- KV는 `bundle:current` 데이터 번들과 `geo:v2:<query>` 지오코딩 캐시를 맡는다. 행정동 경계·지표·점수·지하철/버스 그래프를 D1 테이블로 복제하지 않는다.
- 브라우저는 `/api/data`를 최초 1회 받은 뒤 통근 계산, 점수·등급 계산, 추천 정렬, 상세 근거, 공유 URL을 처리한다. 이 기능들을 위한 서버 계산 API는 만들지 않는다.
- D1은 `regions`, `users`, `oauth_accounts`, `sessions`, `destinations`, `reviews`, `review_helpfuls` 7개 테이블만 사용한다.
- 현재 코드에서 실제로 동작하는 서버 라우트는 `/api/data`와 `/api/geocode`뿐이다. OAuth·후기·도움돼요 동작은 제출용 설계 범위이며 현재 Worker/프론트에 구현되어 있다고 주장하지 않는다.
- 최종 문서의 547개와 현재 번들의 556개, 최종 문서/화면의 가중치 30/35/35와 현재 코드의 40/35/25는 해결하지 않고 충돌 표에 보존한다.

기준 우선순위와 고정 경계는 `docs/mini_project/API_DB_작업계획.md:18-96`에 따른다. 최종 DOCX는 읽기 전용으로 사용했으며 수정하지 않았다.

## 1. 감사 대상과 분류 규칙

| 자료 | 확인한 범위 | 근거 |
|---|---|---|
| 요구사항정의서.docx | §4 기능 요구사항 15행, §5 비기능 요구사항 6행, §6 추적성 표 | `/Users/macbookpro/Downloads/요구사항정의서.docx` 표 2·3·4 |
| 화면설계서.docx | 화면 목록 7행, 공통 예외/입력 규칙, 7개 화면별 API·UI 동작 | `/Users/macbookpro/Downloads/화면설계서.docx` 표 1 및 표 4~24 |
| 현재 Worker | 라우트, KV 번들, 지오코딩 캐시, Kakao 키 비노출 | `worker/index.ts:14-45`, `worker/index.ts:51-160` |
| 현재 설정 | `ONEDAY_KV`와 정적 자산만 바인딩, D1/OAuth 바인딩 없음 | `wrangler.jsonc:20-43` |
| 현재 프론트 | `/api/data` 로드 후 브라우저 계산·렌더링·URL 공유 | `src/lib/data.ts:66-89`, `src/App.tsx:202-425`, `src/lib/shareUrl.ts:12-20` |
| 제출 설계 기준 | 7개 D1 테이블·12개 API·브라우저 계산 경계 | `docs/mini_project/API_DB_작업계획.md:18-66` |

분류값은 작업계획의 고정 분류를 그대로 사용한다.

| 분류 | 이 표에서의 의미 |
|---|---|
| 브라우저 | React 상태, 지도/상세 렌더링, 브라우저 계산, 정렬, URL·Clipboard 처리 |
| KV | 버전 데이터 번들 또는 일반 지오코딩 캐시. 관계형 컬럼 매핑 대상이 아니다. |
| D1 | 회원·OAuth 식별자·세션 해시·후기 목적지·후기·도움돼요의 영속 데이터 |
| 외부 OAuth | Kakao/GitHub 인가·콜백과 서버 측 제공자 식별 흐름 |
| 문서만 해당 | 현재 런타임에 별도 저장/계약이 없고, 정책·호환성·제출 기준으로 검증해야 하는 항목 |

`외부 지오코딩(Kakao)`은 분류 목록의 `외부 OAuth`와 다른 외부 서비스다. 이 표에서는 지오코딩 프록시 자체를 `브라우저 + KV`로 분류하고, Kakao 키가 Worker secret으로만 존재한다는 사실을 근거에 덧붙인다.

## 2. 기능 요구사항 추적표

요구사항 문구는 요구사항정의서 §4 표 2의 `요구사항명`과 `상세 요구사항 내용`을 옮겼다. `API 없음`은 서버 계약이 전혀 필요 없다는 뜻이며, 최초 데이터 번들을 받는 기능은 `GET /api/data`를 사용하되 이후의 계산은 브라우저에서 수행한다.

| ID | 요구사항명 및 원문 내용 | 화면 | 분류 | 서버 계약 | D1 후보 | 현재 상태와 근거 |
|---|---|---|---|---|---|---|
| REQ-FUNC-001 | 서비스 소개·시작<br>서비스 설명과 시작 버튼을 표시한다. 시작 버튼을 클릭하면 메인 지도 화면으로 이동한다. | SCR-HOME-001 | 브라우저 | API 없음(화면 내 이동) | 없음 | 구현. `src/App.tsx:500-537`에서 랜딩/지도 전환을 렌더링한다. |
| REQ-FUNC-002 | 목적지 검색·추가<br>주소 또는 장소명 키워드를 서버의 지오코딩 프록시로 검색해 장소명·주소·좌표가 포함된 후보 목록을 표시한다. 사용자는 최대 3개의 목적지를 추가하거나 삭제할 수 있다. 대상 지역을 벗어난 좌표는 선택할 수 없다. | SCR-HOME-001, SCR-MAIN-001, SCR-WGHT-001 | 브라우저 + KV | `GET /api/geocode?q={query}` | 일반 검색 캐시 `geo:v2:<query>`는 KV. 후기 저장용 목적지를 선택할 때만 D1 `destinations`로 별도 저장 | 부분 구현·범위 충돌. 검색 호출은 `src/components/DestinationSearch.tsx:28-33,55-103`, Worker 캐시는 `worker/index.ts:119-160`; 현재 UI/Worker는 수도권 목적지를 허용해 DOCX의 대상 지역 문구와 충돌한다(§8). |
| REQ-FUNC-003 | 조건 설정<br>통근 상한(분), 월세 예산(만원), 평가 항목별 가중치를 설정한다. 가중치의 합은 1.0으로 유지하며, 허용 범위를 벗어난 값은 입력할 수 없다. 조건 변경 시 브라우저가 내려받은 데이터로 결과를 즉시 재계산한다. | SCR-WGHT-001 | 브라우저 + KV | 최초 `GET /api/data`만 필요. 조건 변경 후 별도 API 없음 | 없음(점수/월세 지표는 KV 번들) | 구현 경로 존재. `src/App.tsx:233-254`, `src/lib/score.ts:23-29,128-148`; 기본 가중치 값은 DOCX와 충돌한다(§8). |
| REQ-FUNC-004 | 등급 지도 조회<br>브라우저가 계산한 547개 행정동의 등급을 색상과 아이콘으로 표시한다. 통근 상한을 초과한 행정동은 추천 대상에서 제외하고 지도에서는 비활성화한다. | SCR-MAIN-001 | 브라우저 + KV | 최초 `GET /api/data` 후 클라이언트 렌더링 | 없음(경계·점수는 KV) | 구현 경로 존재. `src/App.tsx:248-320`에서 등급과 통근/예산 상태를 만들고 지도에 전달한다. 행정동 수는 547 대 556 충돌(§8). |
| REQ-FUNC-005 | 지하철 노선도 표시<br>데이터 묶음에 포함된 지하철 노선도를 기본으로 표시하고, 브라우저의 지도 레이어에서 노선별로 켜거나 끌 수 있도록 한다. 행정동의 역세권 여부를 시각적으로 확인할 수 있다. | SCR-MAIN-001 | 브라우저 + KV | 최초 `GET /api/data` 후 레이어 필터 | 없음(지하철 그래프는 KV) | 구현 경로 존재. `src/App.tsx:262-266,572-610`에서 그래프를 레이어로 만들고 노선을 토글한다. |
| REQ-FUNC-006 | 추천 지역 목록<br>브라우저가 통근 상한을 만족하는 행정동을 필터링하고 종합 점수가 높은 상위 20개를 정렬해 표시한다. 항목을 클릭하면 해당 행정동의 상세 화면으로 이동한다. | SCR-WGHT-001 | 브라우저 + KV | 최초 `GET /api/data` 후 브라우저 필터·정렬 | 없음 | 구현 경로 존재. `src/App.tsx:322-339`에서 통근·예산 필터와 점수 내림차순 정렬을 수행한다. 서버 추천 API는 만들지 않는다. |
| REQ-FUNC-007 | 동 상세 조회<br>초기 데이터 묶음에서 선택한 행정동의 등급, 평가 항목별 점수(치안·가격·편의성), 원지표 수치, 데이터 기준 시점과 출처를 찾아 표시한다. | SCR-DONG-001 | 브라우저 + KV | API 없음. 초기 `GET /api/data` 재사용 | 없음(지표·점수·메타는 KV) | 대부분 구현. `src/components/DongDetail.tsx:134-175,363-400`, `src/App.tsx:268-277`; 현재 번들 메타는 기준 버전은 제공하지만 지표별 출처 계약은 부족하다(§8). |
| REQ-FUNC-008 | 등급 계산 과정 공개<br>브라우저가 계산한 지표별 백분위, 가중치, 계산식을 접이식 영역으로 표시한다. | SCR-DONG-001 | 브라우저 + KV | API 없음. 초기 번들 재사용 | 없음 | 구현. `src/components/DongDetail.tsx:183-216,249-294`에서 원지표·백분위·가중치·식을 렌더링한다. |
| REQ-FUNC-009 | 통근 경로 근거 조회<br>브라우저가 데이터 묶음의 교통망 그래프로 목적지별 예상 소요시간과 경로(승차역·하차역·환승 정보)를 계산해 표시하고, 해당 경로를 지도에 점선으로 표시한다. | SCR-DONG-001 | 브라우저 + KV | API 없음. 초기 `GET /api/data`의 그래프를 브라우저에서 계산 | 없음 | 구현 경로 존재. `src/App.tsx:216-225,347-383`, `src/lib/commute.ts:57-158`. |
| REQ-FUNC-010 | 조건 링크 공유<br>브라우저가 목적지·조건을 URL에 직렬화해 링크를 만들고 복사한다. 링크 접속 시 같은 화면 상태를 복원한다. | SCR-MAIN-001, SCR-WGHT-001 | 브라우저 | API 없음(History/Clipboard API) | 없음 | 구현. `src/lib/shareUrl.ts:12-20,58-150`, `src/App.tsx:389-430`; 서버 저장을 하지 않는다. |
| REQ-FUNC-011 | 소셜 로그인·로그아웃<br>카카오 또는 GitHub OAuth로 로그인·로그아웃할 수 있다. 별도의 가입 절차나 비밀번호는 사용하지 않는다. 닉네임은 UID로 만들어 익명성을 보장한다. 로그아웃 후에도 탐색·조회 기능은 이용할 수 있다. | SCR-AUTH-001 | 브라우저 + D1 + 외부 OAuth | `GET /api/auth/{provider}`<br>`GET /api/auth/{provider}/callback`<br>`GET /api/auth/me`<br>`POST /api/auth/logout` | `users.id,nickname`; `oauth_accounts.user_id,provider,provider_user_id`; `sessions.user_id,token_hash,expires_at` | 설계만. `worker/index.ts:27-45`에는 두 라우트만 있고 `wrangler.jsonc:27-35`에도 KV만 있다. |
| REQ-FUNC-012 | 동 후기 목록 조회<br>비로그인 상태에서도 후기를 조회할 수 있다. 후기에는 닉네임, 거주 기간, 통근 목적지, 체감 통근시간, 항목별 평점, 본문, 도움돼요 수를 표시한다. 현재 선택한 목적지와 통근 목적지가 가까운 후기부터 정렬하며, 최신순·도움돼요순으로 변경할 수 있다. | SCR-RVW-001 | 브라우저 + D1 | `GET /api/regions/{code}/reviews` | `regions.code,name`; `reviews.region_code,user_id,destination_id,residence_months,felt_commute_min,rating_safety,rating_price,rating_convenience,body,created_at`; `users.nickname`; `destinations.name,address,lat,lng`; 도움돼요 수는 `review_helpfuls` 집계 또는 캐시 | 설계만. 현재 `src/`와 Worker에 후기 API/화면이 없다. 최종 화면설계서 표 19~21의 목록·정렬·빈 상태를 계약으로 옮긴다. |
| REQ-FUNC-013 | 후기 작성<br>로그인한 회원만 후기를 작성할 수 있다. 거주 기간, 항목별 평점, 본문(20자 이상), 통근 목적지를 입력하며, 회원 1명당 행정동별 1건만 작성할 수 있다. | SCR-RVW-002 | 브라우저 + KV + D1 | `POST /api/regions/{code}/reviews`<br>작성 화면에서 직접 목적지를 검색할 때 `GET /api/geocode` | `regions.code`; `users.id`; 후기 연결 좌표인 `destinations`; `reviews` 입력 컬럼 전부. 일반 지오코딩 결과는 KV 캐시 | 설계만. 화면설계서 표 22~24의 입력·중복 409·검증 규칙을 사용한다. |
| REQ-FUNC-014 | 후기 수정·삭제<br>작성자 본인만 후기를 수정·삭제할 수 있으며, 타인의 수정·삭제 요청은 거부한다. | SCR-RVW-002 | 브라우저 + D1 | `PATCH /api/reviews/{reviewId}`<br>`DELETE /api/reviews/{reviewId}` | `reviews.id,user_id,updated_at`; 삭제 시 `review_helpfuls.review_id` 연쇄 삭제 | 설계만. 인증 세션과 작성자 소유권 확인은 고정 API/DB 설계에 남긴다. |
| REQ-FUNC-015 | 도움돼요<br>로그인한 회원은 후기별로 도움돼요를 1회 등록할 수 있으며, 다시 클릭하면 취소된다. | SCR-RVW-001 | 브라우저 + D1 | `POST /api/reviews/{reviewId}/helpful`<br>`DELETE /api/reviews/{reviewId}/helpful` | `review_helpfuls.review_id,user_id,created_at` 복합 PK; `reviews.id` 존재 확인 및 집계 | 설계만. `UNIQUE/PK(review_id,user_id)`와 로그인 필요 조건을 API·DB에 반영한다. |

## 3. 비기능 요구사항 추적표

| ID | 요구사항명 및 원문 내용 | 화면 | 분류 | 서버 계약 | D1 후보 | 현재 상태와 근거 |
|---|---|---|---|---|---|---|
| REQ-NFN-001 | 지도 첫 로딩<br>`/api/data` 응답 완료 후 547개 동 등급 지도를 2초 이내에 처음 표시한다. | SCR-MAIN-001 | 브라우저 + KV | `GET /api/data`의 번들 전달·캐시 | 없음 | 코드 경로는 존재하지만 547/556 기준과 실제 2초 성능은 별도 측정이 필요하다. `src/lib/data.ts:72-88`, `src/App.tsx:202-210`. |
| REQ-NFN-002 | 통근 계산 응답<br>목적지 또는 조건 변경 후 브라우저의 행정동별 통근시간 계산과 추천 재정렬을 1초 이내에 완료한다. | SCR-WGHT-001 | 브라우저 + KV | 최초 `GET /api/data`만 필요. 변경 후 서버 왕복 없음 | 없음 | 브라우저 계산 경로는 `src/App.tsx:212-254,322-339`, `src/lib/commute.ts:71-158`에 있다. 1초는 실측하지 않았으므로 미검증이다. |
| REQ-NFN-003 | 인증 토큰·API 키 비노출<br>외부 인증 제공자 토큰과 지오코딩 API 키는 서버에만 보관하고 클라이언트 응답에 포함하지 않는다. | SCR-AUTH-001, SCR-HOME-001, SCR-MAIN-001, SCR-WGHT-001, SCR-RVW-002 | 브라우저 + 외부 OAuth | `GET /api/geocode`, OAuth 시작·콜백·내 정보·로그아웃 | `oauth_accounts` 제공자 식별자, `sessions.token_hash`; access/refresh token은 제외 | 지오코딩 키 비노출은 구현. `worker/index.ts:14-19,208-231`, `src/components/DestinationSearch.tsx:28-33`; OAuth 부분은 설계만이다. |
| REQ-NFN-004 | 개인정보 최소 수집<br>제공자 식별자와 닉네임만 저장한다. 이메일·프로필 사진·실명은 저장하지 않는다 | SCR-AUTH-001 | D1 + 외부 OAuth | OAuth callback에서 최소 사용자 행 생성 | `oauth_accounts.provider_user_id`, `users.nickname`; 세션 해시는 인증 운영값이며 개인 프로필로 저장하지 않음 | 설계 기준. 현재 OAuth 구현이 없으므로 후속 API·DB 설계에서 최소 수집을 보장한다. |
| REQ-NFN-005 | 브라우저·디바이스<br>Chrome/Edge/Safari 최신 2개 버전 | 전체 | 브라우저 + 문서만 해당 | 없음 | 없음 | 호환성 정책은 문서에 있으나 이 감사에서 각 브라우저의 수동 검증은 수행하지 않았다. |
| REQ-NFN-006 | 데이터 출처·갱신<br>지표별 출처와 기준 시점을 화면에 표시하며, 지표는 월 1회 정기 배치를 통해 자동으로 갱신한다. | SCR-DONG-001 | 브라우저 + KV + 문서만 해당 | 초기 `GET /api/data`의 버전/출처 메타; 월간 배치는 API 동작이 아니라 데이터 생성·KV 갱신 절차 | 없음(출처·기준 시점은 KV 번들 메타 후보) | 부분 구현. 화면은 `src/App.tsx:971-999`에서 번들 버전과 월세 기간을 표시하지만 현재 `public/data/bundle.json`의 `meta`에는 지표별 source 필드가 없다. 정기 배치 실행도 이 문서에서 검증하지 않았다. |

## 4. 고정 12개 API 동작과 요구사항·화면 연결

아래 표가 T03 OpenAPI의 허용 범위다. 서버가 점수·추천·통근을 계산하거나 지표 상세를 관계형 조회하는 별도 동작은 넣지 않는다. 경로는 작업계획의 `/api` 포함 표기(`API_DB_작업계획.md:48-66`)를 따른다.

| # | Method Path | 계약 책임 | 관련 요구사항 | 관련 화면 | 저장소·외부 의존성 | 현재 코드 |
|---:|---|---|---|---|---|---|
| 1 | `GET /api/data` | 행정동 메타·경계 참조값, 점수·원지표·백분위, 지하철/버스/거주 접근 그래프와 버전 메타를 한 번 전달. API 스키마상 top-level `bus`, `residential`은 필수 | REQ-FUNC-003~009, REQ-NFN-001, REQ-NFN-002, REQ-NFN-006 | SCR-MAIN-001, SCR-WGHT-001, SCR-DONG-001 | KV `bundle:current` → 없으면 정적 `/data/bundle.json` | 구현. `worker/index.ts:51-96`, `src/lib/data.ts:66-88`. |
| 2 | `GET /api/geocode` | 주소·장소명 검색 결과를 반환하고 Kakao 키를 서버에 숨긴다. 일반 결과는 캐시한다. | REQ-FUNC-002, REQ-FUNC-013, REQ-NFN-003 | SCR-HOME-001, SCR-MAIN-001, SCR-WGHT-001, SCR-RVW-002 | KV `geo:v2:<query>` + 외부 Kakao Local REST; 키가 없으면 역 검색 폴백 | 구현. `worker/index.ts:99-160`, `src/components/DestinationSearch.tsx:71-97`. |
| 3 | `GET /api/auth/{provider}` | Kakao/GitHub 인가 화면으로 리다이렉트하고 state/nonce 등 OAuth 시작 상태를 서버에서 관리 | REQ-FUNC-011, REQ-NFN-003, REQ-NFN-004 | SCR-AUTH-001 | 외부 OAuth, 단기 시작 상태(설계 선택), D1 세션과 연결 | 설계만. 현재 route dispatch에 없음. |
| 4 | `GET /api/auth/{provider}/callback` | 인가 코드를 검증하고 사용자·OAuth 계정을 upsert한 뒤 성공 시 `302`와 `Location`, HttpOnly `Set-Cookie` 세션을 발급 | REQ-FUNC-011, REQ-NFN-003, REQ-NFN-004 | SCR-AUTH-001 | 외부 OAuth; `users`, `oauth_accounts`, `sessions` | 설계만. 현재 route dispatch에 없음. |
| 5 | `GET /api/auth/me` | HttpOnly 세션으로 현재 닉네임과 로그인 여부만 확인 | REQ-FUNC-011 | SCR-AUTH-001 | `sessions`, `users`; 원문 토큰 반환 금지 | 설계만. 현재 route dispatch에 없음. |
| 6 | `POST /api/auth/logout` | 현재 세션을 폐기하고 쿠키를 만료시킨다. 공개 탐색 상태는 유지 | REQ-FUNC-011 | SCR-AUTH-001 | `sessions` 삭제/만료 | 설계만. 현재 route dispatch에 없음. |
| 7 | `GET /api/regions/{code}/reviews` | 비로그인 후기 목록을 `sort=relevant`이면 요청의 `lat`+`lng`를 기준으로 목적지 관련순, 그 밖에는 최신순·도움돼요순과 페이지네이션으로 반환 | REQ-FUNC-012 | SCR-RVW-001 | `regions`, `reviews`, `users`, `destinations`, `review_helpfuls` | 설계만. 현재 후기 코드 없음. |
| 8 | `POST /api/regions/{code}/reviews` | 로그인 사용자 입력을 검증하고 필수 `destination:{name,address,lat,lng}`를 후기별 목적지 snapshot으로 저장하며, 회원당 동일 행정동 1건 제약을 적용. `feltCommuteMin`은 생략/null 가능 | REQ-FUNC-013 | SCR-RVW-002 | `regions`, `users`, `destinations`, `reviews`, `sessions` | 설계만. 현재 후기 코드 없음. |
| 9 | `PATCH /api/reviews/{reviewId}` | 세션 사용자와 `reviews.user_id`가 같은 경우에만 수정 | REQ-FUNC-014 | SCR-RVW-002 | `reviews`, `sessions` | 설계만. 현재 후기 코드 없음. |
| 10 | `DELETE /api/reviews/{reviewId}` | 작성자 본인만 삭제하고 도움돼요 행을 연쇄 삭제 | REQ-FUNC-014 | SCR-RVW-002 | `reviews`, `review_helpfuls`, `sessions` | 설계만. 현재 후기 코드 없음. |
| 11 | `POST /api/reviews/{reviewId}/helpful` | 로그인 사용자의 도움돼요를 복합 PK로 1회 등록하고 집계값을 반환 | REQ-FUNC-015 | SCR-RVW-001 | `review_helpfuls`, `reviews`, `sessions` | 설계만. 현재 후기 코드 없음. |
| 12 | `DELETE /api/reviews/{reviewId}/helpful` | 로그인 사용자의 도움돼요를 취소하고 집계값을 반환 | REQ-FUNC-015 | SCR-RVW-001 | `review_helpfuls`, `reviews`, `sessions` | 설계만. 현재 후기 코드 없음. |

### 실습안내 기준 API 계약 최소 체크

`실습안내.pdf` p.8-10은 화면에서 호출되는 API 전체 목록, Method·Path·Request·Response·예외(400·401·404·500, 충돌 시 409), 그리고 operation description의 REQ/SCR/테이블을 요구한다. 아래는 T03 OpenAPI가 각 동작에 반드시 채워야 하는 최소 항목이다. 현재 코드에 없는 인증·후기 동작도 제출 설계의 요청·응답·오류 계약으로 작성한다.

| API | 요청 | 성공 응답 | 대표 예외 |
|---|---|---|---|
| `GET /api/data` | 없음 | `200` KV/정적 bundle JSON | `405` GET 외 요청, `503` 정적 bundle 부재, `500` 내부 오류 |
| `GET /api/geocode` | `q` query(2~100자) | `200 { results[] }` | `405`, `500`; 빈 결과의 `200 []`(현재 코드)와 화면설계서의 `404` 표기가 다르므로 명세에서 결정 필요 |
| `GET /api/auth/{provider}` | `provider=kakao|github` | `302` 외부 인가 화면 리다이렉트 | `400` provider 오류, `500` |
| `GET /api/auth/{provider}/callback` | `code`, `state` query | `302` + `Location` + HttpOnly `Set-Cookie` 세션 | `400` 코드 누락/만료, `401` 검증 실패, `500` |
| `GET /api/auth/me` | HttpOnly 세션 쿠키 | `200` `{ id,nickname }` | `401` 세션 없음/만료, `500` |
| `POST /api/auth/logout` | HttpOnly 세션 쿠키 | `204` 세션 폐기 | `401` 세션 없음(정책 선택), `500` |
| `GET /api/regions/{code}/reviews` | `code`, `sort`, `page`; `sort=relevant`이면 `lat`, `lng` 필수 | `200` 페이지 정보 + 후기 카드 목록 | `404` 동 없음, `400` 정렬/페이지/관련순 좌표 오류, `500` |
| `POST /api/regions/{code}/reviews` | `residenceMonths`, 필수 `destination:{name,address,lat,lng}`, 생략/null 가능한 `feltCommuteMin`, 3개 평점, `body` | `201` 생성 후기 | `400`, `401`, `404`, `409` 동일 회원·동 중복, `500` |
| `PATCH /api/reviews/{reviewId}` | 수정 가능한 후기 입력 JSON | `200` 수정 후기 | `400`, `401`, `403` 타인, `404`, `500` |
| `DELETE /api/reviews/{reviewId}` | 없음 | `204` 삭제 완료 | `401`, `403`, `404`, `500` |
| `POST /api/reviews/{reviewId}/helpful` | 없음(세션 쿠키) | `201` `{ helpfulCount }` | `401`, `404`, `409` 중복, `500` |
| `DELETE /api/reviews/{reviewId}/helpful` | 없음(세션 쿠키) | `200` `{ helpfulCount }` | `401`, `404`, `500` |

T03 각 operation description에는 위 요청·응답·예외와 함께 이 표의 REQ/SCR/테이블 매핑을 반복해 양방향 추적성을 유지한다.

## 5. D1 영속 데이터와 7개 테이블 경계

작업계획은 정확히 7개 테이블만 허용한다(`API_DB_작업계획.md:28-46`). 아래 후보 컬럼은 최종 요구사항과 화면 입력·출력에 필요한 최소 범위다. 점수·경계·교통망·지오코딩 일반 캐시를 위한 테이블은 만들지 않는다.

| 테이블 | 컬럼 후보와 제약 | 근거 요구사항/API | 저장하지 않는 것 |
|---|---|---|---|
| `regions` | `code` PK(행정동 코드), `name`(표시명). 필요할 때 `gu`(상위 지역 표시)를 최소 참조값으로 검토 | REQ-FUNC-012~014; `GET/POST /api/regions/{code}/reviews` | 경계 geometry, 면적·좌표, 지표·점수, 역 연결. 모두 KV 번들 |
| `users` | `id` PK, `nickname` varchar(12)(1~12자), `created_at` | REQ-FUNC-011~015; 모든 인증 필요 후기 API | 이메일, 프로필 사진, 실명, access/refresh token |
| `oauth_accounts` | `id` PK, `user_id` FK, `provider` enum(`kakao`,`github`), `provider_user_id`, `created_at`; `UNIQUE(provider,provider_user_id)` | REQ-FUNC-011, REQ-NFN-003/004; OAuth callback | 제공자 토큰 원문·전체 프로필 |
| `sessions` | `id` 또는 세션 식별자 PK, `user_id` FK, `token_hash`, `expires_at`, `created_at`; 만료 조회 인덱스 후보 | REQ-FUNC-011, REQ-NFN-003/004; auth/me·logout·후기 쓰기 | 원문 세션 토큰 |
| `destinations` | `id` PK, `name`, `address`, `lat`, `lng`, `created_at`; 후기 작성의 필수 destination object를 후기별 snapshot으로 저장 | REQ-FUNC-012/013; 후기 목록·작성 | 검색 query·일반 검색 캐시·`cached_at`. 일반 지오코딩 결과는 KV |
| `reviews` | `id` PK, `user_id` FK, `region_code` FK, `destination_id` FK NOT NULL(후기별 snapshot 참조), `residence_months`, `felt_commute_min`, `rating_safety`, `rating_price`, `rating_convenience`, `body`, `created_at`, `updated_at`; `UNIQUE(user_id,region_code)`; `(region_code,created_at)`와 도움돼요 정렬 인덱스 후보 | REQ-FUNC-012~014; 후기 목록/작성/수정/삭제 | 점수 계산 결과와 행정동 공공 지표 |
| `review_helpfuls` | `review_id` FK, `user_id` FK, `created_at`; `PRIMARY KEY(review_id,user_id)`; 후기 삭제 시 cascade | REQ-FUNC-012/015; helpful 등록·취소 | 별도 회원 반응 테이블 확장, 중복 허용 |

### KV와 브라우저의 비관계형 데이터

| 키/영역 | 내용 | 근거 |
|---|---|---|
| `bundle:current` | `dongs`, `scores`, `graph`, `bus`, `residential`(API 스키마 필수 top-level), `pctKeys`, `axisWeights`, `meta` | `worker/index.ts:21,63-75`; `src/lib/data.ts:17-64,72-88` |
| `geo:v2:<query>` | 지오코딩 결과 `{ results: [{ name,address,lat,lng,kind }] }`, 30일 TTL | `worker/index.ts:21-25,126-160` |
| 브라우저 메모리 | 통근 `Map`, 등급·추천 결과, 선택 동, 조건·가중치 | `src/App.tsx:216-364` |
| URL query | 목적지 좌표/이름, 통근·예산·가중치·노선·월세 선택 | `src/lib/shareUrl.ts:58-150`; 서버 저장 없음 |

## 6. 화면 ID와 API 동작 매트릭스

화면설계서 표 1과 각 화면의 `주요 API`·UI 동작 표를 합쳤다. 화면에 표시되는 클라이언트 계산은 API로 잘못 연결하지 않았다.

| 화면 ID·명 | 요구사항 | 호출 API | API가 하지 않는 일 | 현재 구현 |
|---|---|---|---|---|
| `SCR-HOME-001` 랜딩 페이지 | REQ-FUNC-001, 002, 011, REQ-NFN-003 | `GET /api/geocode`; 로그인 버튼은 `SCR-AUTH-001`로 이동 | 시작 이동, 목적지 선택·URL 반영은 브라우저 | 랜딩과 목적지 검색 구현. OAuth 없음. |
| `SCR-MAIN-001` 메인 지도 | REQ-FUNC-002, 004, 005, 010, REQ-NFN-001, REQ-NFN-003 | 초기 `GET /api/data`; 검색 시 `GET /api/geocode` | 등급 계산·통근권 제외·노선 레이어·공유 URL은 브라우저 | `src/App.tsx:540-620` 및 `src/components/MapView.tsx`에 구현. |
| `SCR-WGHT-001` 목적지·조건 설정 | REQ-FUNC-002, 003, 006, 010, REQ-NFN-002, REQ-NFN-003 | 초기 `GET /api/data`; 목적지 검색 `GET /api/geocode` | 가중치 보정·월세/통근 필터·상위 20 정렬은 브라우저 | `src/App.tsx:646-949`에 구현. |
| `SCR-DONG-001` 행정동 상세 | REQ-FUNC-007, 008, 009, REQ-NFN-006 | 없음(초기 `GET /api/data` 재사용) | 행정동 상세 조회·계산 과정·경로 복원은 브라우저 | `src/components/DongDetail.tsx`, `src/lib/commute.ts`에 구현. |
| `SCR-AUTH-001` OAuth 로그인 | REQ-FUNC-011, REQ-NFN-003, REQ-NFN-004 | `GET /api/auth/{provider}`, callback, `GET /api/auth/me`, `POST /api/auth/logout` | 제공자 토큰을 브라우저에 반환하지 않음 | 설계만. 현재 `src/`에 auth 컴포넌트/API 호출 없음. |
| `SCR-RVW-001` 행정동 후기 목록 | REQ-FUNC-012, 013, 015 | `GET /api/regions/{code}/reviews`(`sort=relevant`이면 `lat`+`lng` 포함); helpful `POST/DELETE /api/reviews/{reviewId}/helpful` | 목적지 관련순은 요청 좌표를 서버가 사용하되 공개 후기 조회만 반환 | 설계만. 현재 후기 컴포넌트/API 없음. |
| `SCR-RVW-002` 후기 작성·수정 | REQ-FUNC-013, 014, REQ-NFN-003 | 목적지 직접 검색 `GET /api/geocode`; 신규 `POST /api/regions/{code}/reviews`; `PATCH/DELETE /api/reviews/{reviewId}` | 본문/평점/기간 범위 검증은 API와 화면 양쪽에서 일관되게 적용 | 설계만. 현재 후기 컴포넌트/API 없음. |

최종 화면설계서의 7개 화면 목록에 없는 화면 ID는 API/화면 매핑에 사용하지 않는다.

## 7. API가 필요 없는 브라우저 계산 기능

아래 항목은 `/api/data`가 제공하는 원자료·그래프를 소비하지만, 조건 변경이나 동 선택 때 서버에 재요청하지 않는다. T03에서 별도 `/regions`, `/regions/{code}`, `/regions/{code}/commute`, `/subway-network` 동작을 부활시키지 않는다.

| 기능 | 관련 ID | 브라우저 처리 | 근거 |
|---|---|---|---|
| 가중치 합 1.0 유지와 종합 점수 | REQ-FUNC-003 | `rebalanceWeights`와 `compositeScore`로 즉시 계산 | `src/lib/score.ts:23-29,128-148` |
| 등급·순위·통근 페널티 | REQ-FUNC-004, 006, REQ-NFN-002 | `gradeAll`, 통근 가능/예산 필터, 점수 내림차순 | `src/App.tsx:239-254,322-339`; `src/lib/score.ts:87-126` |
| 지하철/버스 경로와 점선 | REQ-FUNC-005, 009 | KV 그래프를 `computeMultiCommute`·`buildRoute`로 계산·렌더링 | `src/App.tsx:216-225,347-383`; `src/lib/commute.ts:57-158` |
| 동 상세와 계산 과정 | REQ-FUNC-007, 008 | 선택 동의 KV score/raw/pct와 분포로 근거 생성 | `src/App.tsx:268-277`; `src/components/DongDetail.tsx:183-216` |
| 조건 링크 직렬화·복원 | REQ-FUNC-010 | `URLSearchParams`, `history.replaceState`, Clipboard API | `src/lib/shareUrl.ts:58-150`; `src/App.tsx:389-430` |
| 랜딩/탭/지도 상태 이동 | REQ-FUNC-001 | React state와 화면 컴포넌트 전환 | `src/App.tsx:109-177,500-537` |

## 8. 최종 DOCX와 현재 구현 상태 충돌 표

아래 항목은 T01에서 임의로 한쪽을 고치지 않는다. 후속 T02/T03 담당자는 고정 아키텍처와 최종 문서 우선순위를 적용하되, 제출물 안에서 해결되지 않은 사실을 숨기지 않아야 한다.

| 항목 | 최종 DOCX 기준 | 현재 코드·운영 자료 | 판정·후속 조치 |
|---|---|---|---|
| 대상 행정동 수 | 요구사항정의서 §2-2·§2-4 및 F004/NFN-001에서 547개 | `public/data/bundle.json`의 `dongs` 556개·`scores` 556개. `src/types.ts:152`, `src/lib/score.ts:12-14`, `src/seo/areas.ts:5-7`도 556을 전제로 함 | 해결하지 않음. 최종 문서 기준 547과 현재 운영 556을 각각 명시하고, 제출물의 모집단 기준은 별도 결정 필요. |
| 기본 가중치 | 요구사항정의서 §2-2와 화면설계서 `SCR-WGHT-001` 표 11 row ⑦: 치안 30·가격 35·생활편의 35 | `src/lib/constants.ts:128-133` 및 `scripts/4-score.mjs`는 치안 40·가격 35·편의 25. 화면 문구·SEO도 40/35/25를 사용 | 해결하지 않음. 제출물에는 충돌을 명시하고, 코드나 DOCX를 T01에서 변경하지 않는다. |
| API 구현 범위 | 작업계획은 정확히 12개 동작(`API_DB_작업계획.md:48-66`) | `worker/index.ts:27-45`는 `/api/data`, `/api/geocode`만 dispatch. `wrangler.jsonc`에 D1/OAuth 바인딩 없음 | 12개는 제출 설계 계약이며 현재 구현 완료로 표시하지 않는다. 인증·후기 10개는 후속 구현 범위다. |
| D1 구현 상태 | 회원·OAuth 계정·세션·후기 목적지·후기·도움돼요를 7개 테이블로 설계 | 현재 D1 바인딩과 후기/OAuth 코드 없음 | 설계만 기록한다. 점수·경계·교통망은 작업계획대로 KV에 남긴다. |
| 지오코딩과 목적지 저장 | 일반 지오코딩 캐시는 KV, 후기 연결 목적지 좌표만 D1 `destinations` | Worker는 `geo:v2:<query>`를 KV에 30일 저장(`worker/index.ts:21-25,126-160`); 현재 후기 저장 없음 | 일반 검색 캐시와 후기 목적지를 분리하는 설계로 고정한다. |
| 브라우저 계산 경계 | 지도·추천·상세·통근은 `/api/data` 후 브라우저 처리(`요구사항정의서 §2-4, §6`) | `src/App.tsx:216-364`, `src/lib/score.ts`, `src/lib/commute.ts`에서 실제 계산 | 별도 서버 계산 API 없이 위 경계를 유지한다. |
| OAuth 사용자 식별 | F011은 UID로 익명 닉네임을 생성하고 최소 수집을 요구 | 현재 OAuth 구현 없음 | `oauth_accounts`·`sessions`를 포함한 설계만 작성하고, 실제 구현으로 표시하지 않는다. |
| 목적지 범위 검증 | F002는 대상 지역 밖 좌표를 선택할 수 없다고 명시 | 현재 UI 주석은 서울 밖 통근 목적지를 허용하는 방향이며 Worker도 수도권 사각형·서울/경기/인천을 허용(`worker/index.ts:114-117,316-331`; `DestinationSearch.tsx:153-156`) | 문서 의미와 현재 구현의 범위 차이를 보존한다. 후보 행정동 범위와 통근 목적지 범위를 API에서 분리해 명시할 필요가 있다. |
| 지오코딩 빈 결과 상태 | 화면설계서 SCR-HOME 표 6은 검색 결과 0건을 `404`로 기술 | 현재 Worker는 잘못된/무결과 검색도 `200 { results: [] }`로 반환(`worker/index.ts:126-160`) | T03에서 화면 인수조건과 현재 계약 중 어느 응답을 제출 설계로 채택할지 명시한다. |
| 데이터 번들 오류 상태 | 화면설계서 SCR-MAIN 표 9는 데이터 로드 실패를 `500`으로 표시 | 현재 Worker는 KV·정적 asset 모두 실패하면 `503`을 반환하고, 비 GET은 `405`(`worker/index.ts:51-95`) | API 명세에 503/405를 포함하고 화면 오류 문구와 연결하거나, 제출 설계에서 500으로 정규화할지 결정한다. |
| 데이터 출처·갱신 메타 | NFN-006은 지표별 출처·기준 시점과 월 1회 자동 갱신을 요구 | 화면에는 경계·지하철·버스·거주분포·월세 기간·지표 버전만 표시(`src/App.tsx:971-999`); 번들 meta에 지표별 source 키 없음 | D1이 아닌 KV 번들 메타와 월간 배치 절차로 보완해야 한다. |
| 화면 구현 상태 | 최종 화면설계서 7개 화면 | 랜딩·지도·조건·상세는 구현, 인증·후기는 없음 | API/DB 추적은 최종 7개 화면 ID만 사용하고 미구현 화면은 설계 상태로 표시한다. |

## 9. 실습안내 평가·제출 기준 반영

`실습안내.pdf` p.1, p.8-14의 평가·제출 기준을 후속 산출물의 검수 항목으로 옮겼다. API 20점은 화면 호출 API 전체 목록과 요청·응답·예외가 핵심이고, DB 20점은 API 제공에 필요한 모든 데이터와 ERD·테이블 정의서·액터×테이블 권한표가 핵심이다. 구현 코드는 제출 대상이 아니므로 현재 코드의 미구현 상태를 제출 완료로 오인하지 않는다.

### API 제출본 검수 포인트

| 실습안내 평가 항목 | 이 추적표 근거 | T03/T07에서 확인할 것 |
|---|---|---|
| 화면에서 호출되는 API 전체 | §4 고정 12개 API, §6 화면 매트릭스 | 화면설계서 각 `주요 API`와 고정 12개 path 개수가 일치하는지 확인 |
| Method·Path·Request | §4 실습안내 기준 API 계약 최소 체크 | query/path/body/cookie 필드, 타입, 필수 여부, 최대 3개 목적지·후기 입력 범위를 명시 |
| Response | §4 성공 응답 열 | 200/201/204의 body·쿠키·페이지 정보와 개인정보 제외를 명시 |
| 예외처리 | §4 대표 예외 열, §8 현재 코드 충돌 | 400·401·403·404·409·500 및 현재 405/503·빈 결과 200의 선택을 명시 |
| description 추적성 | §2~§6의 관련 REQ/SCR/테이블 | 각 operation description에 적어도 `REQ-*`, `SCR-*`, D1/KV 또는 외부 OAuth를 반복 표기 |

### DB 제출본 검수 포인트와 액터 권한

`실습안내.pdf` p.10-13은 DB.pdf에 ERD 그림만이 아니라 테이블 정의서와 액터×테이블 C/R/U/D 권한표를 함께 넣도록 요구한다. 아래 권한은 최종 DOCX의 두 액터(게스트·회원)를 기준으로 한다. `*`는 직접 SQL 권한이 아니라 서버 API가 세션을 검증한 뒤 수행하는 작업이다.

| 테이블 | 게스트(비로그인) | 회원(로그인) | 권한 근거/주의 |
|---|---|---|---|
| `regions` | R | R | 후기 경로의 행정동 코드·이름 최소 참조값. 경계·지표는 KV |
| `users` | — | C*/R*(본인)/U*(닉네임) | OAuth callback이 생성·조회; 이메일·실명·사진 없음 |
| `oauth_accounts` | — | C*/R*(본인) | provider/provider_user_id 고유값; 토큰 원문 없음 |
| `sessions` | — | C*/R*/D*(본인 세션) | HttpOnly 쿠키, `token_hash`만 저장 |
| `destinations` | R*(후기 응답에 포함된 공개 목적지) | C*/R* | 일반 검색 캐시는 D1이 아닌 KV; 후기 연결 좌표만 저장 |
| `reviews` | R | C*/R/U*(본인)/D*(본인) | `UNIQUE(user_id,region_code)`, 타인 U/D는 403 |
| `review_helpfuls` | — | C*/R/D*(본인 반응) | `PRIMARY KEY(review_id,user_id)`, 후기 삭제 cascade |

DB.pdf 정의서에는 각 컬럼의 PK/FK/UQ·타입·Nullable·설명과 관계선, 위 권한표를 DBML과 동일한 7개 테이블로 넣는다. D1에 저장하지 않는 KV bundle/cache는 범위 주석으로 명시한다.

## 10. 후속 담당자 체크리스트

- [ ] T02 DBML은 위 7개 테이블과 후보 컬럼만 사용하고 KV 제외 범위 주석을 넣는다.
- [ ] T03 OpenAPI는 위 12개 동작만 작성하고 모든 operation에 요구사항·최종 화면 ID를 붙인다.
- [ ] 547/556과 가중치 30/35/35 대 40/35/25는 임의 수정하지 않고 검토 문서에 동일한 충돌 상태를 유지한다.
- [ ] OAuth 토큰 원문·이메일·프로필·일반 geocode 캐시를 D1에 넣지 않는다.
- [ ] `/regions`, `/regions/{code}`, `/regions/{code}/commute`, `/subway-network`를 추가하지 않는다.
- [ ] 후기 API는 작성자 소유권, 동일 회원·동 중복, 도움돼요 복합 PK, 후기 삭제 cascade를 계약과 스키마 양쪽에서 확인한다.

## 11. T01 검증 기록

| 검증 | 결과 |
|---|---|
| 최종 요구사항 DOCX 읽기 | 기능 15개·비기능 6개 전부 추출. 문서 개수와 계획의 15/6 일치 |
| 최종 화면 DOCX 읽기 | 화면 목록 7개 및 화면별 API/요구사항 확인 |
| 실습안내 PDF 읽기 | p.1, p.8-14에서 API 요청·응답·예외·REQ/SCR/테이블 description, DB ERD·테이블 정의서·액터 권한표 요구 확인 |
| 현재 코드/설정 조사 | Worker는 `/api/data`, `/api/geocode`만 dispatch; KV만 설정됨; 프론트는 `/api/data` 후 브라우저 계산 |
| 현재 번들 조사 | `public/data/bundle.json`: `dongs=556`, `scores=556` |
| `git diff --check` | `git diff --check -- docs/mini_project/draft/API_DB_추적표.md` exit 0. 보조 `git diff --no-index --check /dev/null docs/mini_project/draft/API_DB_추적표.md`도 공백 진단 0건이며 `no_index_diff_check_exit=1`은 미추적 파일과 `/dev/null`의 차이로 인한 정상 종료값. 별도 trailing whitespace 없음 |

# 액터 × D1 테이블 권한 표 (C/R/U/D)

이 표의 C/R/U/D는 SQL `GRANT` 권한이 아니다. 모든 D1 접근은 서버 API가
HttpOnly 세션을 검증한 뒤 수행하며, `*`는 API가 본인 행·본인 후기 연결을
확인한다는 뜻이다. 게스트와 회원은 임의 SQL을 실행할 수 없다.

`R(집계)`는 공개 API가 필요한 표시값만 반환한다는 뜻이다. 예를 들어 게스트는
후기 카드의 닉네임·목적지·도움돼요 수를 볼 수 있지만, OAuth 식별자·세션 해시와
도움돼요를 누른 회원 ID는 반환되지 않는다. 회원의 후기 `U/D`도 `reviews.user_id`
가 현재 세션의 회원 ID와 일치할 때만 허용한다.

API↔DB 매핑은 `destination.name`↔`destinations.place_name`,
`residenceMonths`↔`reviews.residence_months`,
`feltCommuteMin`↔`reviews.felt_commute_min`,
`ratings.safety/price/convenience`↔`reviews.rating_safety/rating_price/rating_convenience`로
고정한다. `helpfulCount`는 `review_helpfuls`의 `COUNT(*)`, `helpfulByMe`는
현재 세션 회원의 반응 행 존재 여부, `isMine`은 현재 세션 회원과
`reviews.user_id`의 소유관계 비교로 계산하며 해당 응답값 컬럼은 추가하지 않는다.

`destinations`의 C/U/D는 독립적인 목적지 CRUD 권한이나 공개 검색 저장이 아니다.
서버 API가 현재 세션이 후기 작성자 본인임을 확인한 뒤 그 후기의 전용 snapshot에
대해서만 후기 POST/PATCH/DELETE 트랜잭션 안에서 수행한다. `UNIQUE(destination_id)`로
한 snapshot을 공유하지 않으며, 후기 생성 시 destination+review를 함께 만들고,
PATCH 때 전용 snapshot을 갱신하거나 새 snapshot으로 교체한다.

| 테이블 | 게스트(비로그인) | 회원(로그인) | 서버 API 권한 및 제한 |
|---|---|---|---|
| `regions` | R | R | 후기 경로와 후기 응답의 행정동 `code/name/district` 최소 참조값만 읽는다. C/U/D 없음. 경계·지표·점수는 KV다. |
| `users` | R(닉네임 투영) | C*/R*/U*(본인 닉네임) | OAuth callback이 최소 회원을 생성·조회한다. 공개 후기 응답에는 `nickname`만 노출하고 이메일·실명·사진은 없다. D 없음. |
| `oauth_accounts` | — | C*/R*(본인 연결) | OAuth callback이 provider/provider_user_id를 생성·조회한다. access/refresh token 원문은 저장하지 않는다. U/D 없음. |
| `sessions` | — | C*/R*/D*(본인 세션) | 로그인 callback이 발급하고 `auth/me`·logout이 해시로 조회·폐기한다. 원문 토큰은 저장하지 않는다. U 없음. |
| `destinations` | R(후기 응답) | C*/R*/U*/D*(작성자 본인 후기의 전용 snapshot만) | 일반 지오코딩 검색 캐시는 KV다. 후기 POST 트랜잭션에서 destination+review를 함께 생성하고, PATCH는 전용 snapshot만 갱신·교체한다. DELETE는 후기 DELETE 트랜잭션에서 연결 snapshot을 삭제한다. 독립 destination CRUD가 아니며 타인·공유 snapshot에는 U/D가 없다. |
| `reviews` | R | C*/R/U*(본인)/D*(본인) | 공개 목록은 누구나 읽는다. 회원은 `UNIQUE(user_id, region_code)` 범위에서 작성하고, 작성자 본인만 수정·삭제한다. 타인 U/D는 403. 후기 생성·수정·삭제 때 destination snapshot 수명주기도 같은 트랜잭션에서 처리한다. |
| `review_helpfuls` | R(후기별 COUNT 집계) | C*/R*/D*(본인 반응) | 회원별 후기 1회만 등록·취소한다. 복합 PK `(review_id,user_id)`로 중복을 막고 후기 삭제 시 CASCADE한다. U 없음. |

## 권한과 무결성 규칙

- `reviews(user_id, region_code)` UNIQUE: 한 회원은 같은 행정동에 후기 한 건만 작성한다. 두 번째 작성은 API가 409로 거부한다.
- `review_helpfuls(review_id, user_id)` 복합 PK: 한 회원은 후기별 도움돼요를 한 번만 등록한다. 다시 클릭하면 자기 행을 삭제한다.
- `oauth_accounts(provider, provider_user_id)` UNIQUE: 같은 OAuth 계정의 중복 가입을 막는다. `(user_id, provider)`도 UNIQUE다.
- `sessions.token_hash` UNIQUE와 `sessions.expires_at` 인덱스: 원문 세션 토큰을 저장하지 않고 만료 세션을 조회·정리한다.
- `users.nickname`은 API와 동일한 1~12자 검증 규칙을 사용한다. 이메일·실명·사진 등 새 프로필 컬럼은 추가하지 않는다.
- 후기 카드의 `helpfulCount`는 `review_helpfuls`의 `COUNT(*)` 집계값이다. `reviews`에 중복 카운터 컬럼을 두지 않는다.
- 후기를 삭제하면 `review_helpfuls.review_id` FK의 `ON DELETE CASCADE`로 해당 반응이 함께 삭제된다.
- 후기를 DELETE할 때 서버 API는 먼저 작성자 소유권과 연결 destination을 확인하고, `reviews` 삭제로 도움돼요 cascade를 처리한 뒤 연결 `destinations`를 같은 트랜잭션에서 삭제한다. `reviews.destination_id → destinations.id` FK 방향에는 자동 cascade를 선언하지 않았으므로 이 고아행 정리는 API 트랜잭션 정책이다.
- `PATCH /reviews/{id}`의 destination 변경은 작성자 본인의 전용 snapshot만 대상으로 하며, 기존 행 갱신 또는 새 snapshot 교체 후 이전 행 삭제를 한 트랜잭션에서 처리한다. `destinations`는 후기 사이에서 공유하지 않는다.
- `regions`에는 후기 FK가 참조하는 `code/name/district`만 둔다. 행정동 경계, 공공데이터 지표·점수, 지하철·버스 그래프, 일반 지오코딩 캐시는 Cloudflare KV 번들이며 이 7개 테이블과 DB.pdf ERD 범위 밖이다.
- 대상 행정동 547개는 최종 설계 기준이고, 현재 구현 번들 556개와의 차이는 구현 데이터 동기화 대상이지 D1 테이블 확장 근거가 아니다.

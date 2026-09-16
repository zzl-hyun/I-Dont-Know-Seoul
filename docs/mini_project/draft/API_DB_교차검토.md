# API·DB 교차검토 보고서

작성일: 2026-09-16

대상: `I Don't Know Seoul` API·D1 제출물 T04

검토 방식: 지정된 초안과 T01 추적표를 기준으로 한 정적 교차검토. 웹 검색,
브라우저, 외부 파서, 원본 문서 수정은 수행하지 않았다.

## 0. 결론

- API는 9개 path, 12개 operation으로 고정 범위와 일치한다.
- D1은 `regions`, `users`, `oauth_accounts`, `sessions`, `destinations`,
  `reviews`, `review_helpfuls` 정확히 7개 테이블이다.
- T01 추적표에는 기능 요구사항 15개, 비기능 요구사항 6개, 화면 7개가 모두
  등장한다. 12개 API operation 모두에 적어도 REQ·SCR·저장소 매핑이 있으나,
  `/api/data` operation description에 T01이 연결한 `REQ-NFN-002`가 빠져 있다.
- 현재 미해결 판정은 Blocker 1건, Major 5건, Minor 4건이다. 특히 DBML의
  `[null]` 설정 2건 때문에 DBML 제출본을 바로 제작하면 안 된다.
- OAuth·후기 API는 T01이 명시한 대로 설계 범위일 뿐 현재 구현 완료가 아니다.
  문서에는 구현 완료로 표시하지 않는다.

## 1. 기준선과 개수 확인

| 검토 항목 | 결과 | 근거 |
|---|---|---|
| API path | 9개, PASS | `API.yml`의 `/api/data`, `/api/geocode`, OAuth 4개, 후기/도움돼요 3개 path; 작업계획의 고정 12개 동작(`API_DB_작업계획.md:52-70`) |
| API operation | 12개, PASS | 각 path의 `get`/`post`/`patch`/`delete` 합계가 12개이며 작업계획의 12개 표와 일치 |
| D1 업무 테이블 | 7개, PASS | `DB.dbml:35,48,57,73,90,102,126`의 `Table` 선언 |
| D1 관계 | 7개, PASS | `DB.dbml:140-146`; 7개 테이블 사이의 FK와 후기 도움돼요 삭제 CASCADE가 표현됨 |
| 범위 경계 | PASS | API 설명은 KV 번들·지오코딩 캐시, D1 7개 테이블, 브라우저 계산을 분리한다(`API.yml:9-18`). DBML도 KV 범위를 ERD 밖으로 둔다(`DB.dbml:13-31`). |

T01이 기록한 최종 문서 기준 547개 동과 현재 로컬 번들의 556개 동, 그리고
최종 문서의 가중치 30/35/35와 현재 코드의 40/35/25는 이번 교차검토에서 임의로
해결하지 않는다. 해당 충돌은 T01 표에 보존된 상태를 유지한다.

## 2. 요구사항·화면 추적성

| 추적 대상 | 판정 | 확인 내용 |
|---|---|---|
| 기능 요구사항 15개 | T01 기준 15/15, PASS | `API_DB_추적표.md:9,43-68`에 `REQ-FUNC-001`~`015`가 모두 매핑됨. `REQ-FUNC-001`은 브라우저 이동이라 API operation이 없는 것이 정상이다. |
| 비기능 요구사항 6개 | T01 기준 6/6, PASS | `API_DB_추적표.md:9,70-75`에 `REQ-NFN-001`~`006`이 모두 매핑됨. `REQ-NFN-005`는 브라우저 호환성 문서 항목이라 API operation이 없는 것이 정상이다. |
| 화면 7개 | 7/7, PASS | `SCR-HOME-001`, `SCR-MAIN-001`, `SCR-WGHT-001`, `SCR-DONG-001`, `SCR-AUTH-001`, `SCR-RVW-001`, `SCR-RVW-002`가 `API_DB_추적표.md:144-152`에 모두 매핑됨. |
| operation 설명의 최소 추적성 | 12/12에 REQ·SCR·저장소 표기, PASS | `API.yml`의 12개 operation description에 `요구사항`, `화면`, `저장소/테이블` 줄이 모두 존재한다. |
| operation별 요구사항 누락 | Minor | T01의 API 동작 표는 `/api/data`에 `REQ-NFN-002`를 연결한다(`API_DB_추적표.md:83`). 그러나 `API.yml:51-54`에는 `REQ-NFN-001`, `REQ-NFN-006`만 있다. 조건 변경 후 브라우저 계산의 1초 요구를 번들 최초 전달과 연결할지, API가 직접 보장하지 않는 브라우저 요구로 분리할지 결정해야 한다. |
| D1 테이블 근거 | 7/7, PASS | 각 테이블의 컬럼 note와 T01의 D1 후보표(`API_DB_추적표.md:121-129`)에 최소 한 개 이상의 REQ/API 근거가 있다. |

API 문서에 모든 15/6 ID를 반복하는 것이 목표가 아니다. API가 없는 브라우저·문서
요구사항은 T01 추적표에 남기고, 실제로 관련된 operation에만 연결해야 한다.
다만 `REQ-NFN-002`는 T01이 `/api/data`와 연결했으므로 위의 Minor를 해소해야 한다.

## 3. 발견사항

중요도는 T05/T06에서 수정 여부를 결정하는 순서다. 기대 수정은 새로운 API나
테이블을 추가하지 않고 현재 고정 범위 안에서 계약을 일치시키는 내용만 적었다.

| ID | 중요도 | 구분 | 정확한 대상 | REQ/SCR 근거 | 문제 | 기대 수정 |
|---|---|---|---|---|---|---|
| B-01 | Blocker | DB | `DB.dbml:106,108`의 `destination_id [null]`, `felt_commute_min [null]` | `REQ-FUNC-012`, `REQ-FUNC-013`; `SCR-RVW-001`, `SCR-RVW-002` | `[null]`은 이 파일에서 사용하는 공식 column setting으로 정적 검증할 수 없다. 현재 DBML 정적 검사에서 2건이 미지원 설정으로 검출된다. | `[null]`을 제거한다. `destination_id`는 API가 필수로 받는 계약에 맞춰 `[not null]`로 명시하고, `felt_commute_min`은 nullable 기본 동작으로 두되 note로만 선택/null 규칙을 설명한다. T06에서 DBML 파싱을 다시 확인한다. |
| M-01 | Major | 공통 | `DB.dbml:106` 대 `API.yml:961-991,1025-1044,1074-1104` | `REQ-FUNC-012`, `REQ-FUNC-013`; `SCR-RVW-001`, `SCR-RVW-002` | DB는 후기의 `destination_id`를 NULL로 허용하고 note도 선택 입력이라고 하지만, `Review` 응답·`ReviewCreate`·`ReviewDestinationInput`은 목적지 객체와 `name/address/lat/lng`를 필수로 요구한다. 동일 후기에서 API 응답과 DB 행의 필수성이 달라진다. | 최종 요구사항의 통근 목적지 필수 기준을 채택해 DB FK를 NOT NULL로 만들고 POST 트랜잭션에서 목적지와 후기를 함께 저장한다. 정말 선택으로 바꿀 근거가 생기면 API 응답·REQ/SCR·DB를 함께 바꾼다. |
| M-02 | Major | 공통 | `DB.dbml:50`의 닉네임 1~12자 note, `API.yml:823-828`의 `AuthUser.nickname` 1~40자, `API.yml:981-984`의 `Review.nickname` 무제한 | `REQ-FUNC-011`, `REQ-NFN-004`; `SCR-AUTH-001`, `SCR-RVW-001` | 동일한 익명 닉네임에 DB note와 API 응답 계약이 서로 다른 길이 범위를 사용한다. 후기 응답 schema에는 최대 길이도 없다. | 익명 닉네임의 단일 범위를 정하고 users 검증, `AuthUser`, `Review`, DB note를 모두 같은 값으로 맞춘다. T01 기준으로 이미 `1~12자`가 DB/API 검증 규칙으로 적혀 있으므로 이를 우선 기준으로 삼을지 명시한다. |
| M-03 | Major | 공통 | `API.yml:442-455,520-527`, `DB.dbml:90-98,144`, `DB권한표.md:18` | `REQ-FUNC-012`~`014`; `SCR-RVW-001`, `SCR-RVW-002` | `destinations`가 후기별 스냅샷인지 공유 행인지, PATCH가 공유 행을 수정하는지, 이전 목적지 고아 행을 언제 정리하는지 계약이 없다. 권한표는 본인 연결 목적지를 U한다고 쓰지만 DB에는 destination 행의 소유자/참조 수명주기가 직접 표현되지 않는다. | 현재 7개 테이블 범위 안에서 한 정책을 고정한다. 예를 들어 후기 저장 목적지를 후기별 스냅샷으로 취급하고 PATCH 시 새 행으로 교체한 뒤 참조가 없는 이전 행의 처리와 FK 정책을 명시하거나, 공유 행을 허용한다면 공유 행 직접 수정 금지와 재사용/삭제 규칙을 API·DB 권한표에 동일하게 적는다. |
| M-04 | Major | 공통 | `API_DB_추적표.md:105`의 callback 성공 `200` 대 `API.yml:202-245`의 `302` | `REQ-FUNC-011`, `REQ-NFN-003`, `REQ-NFN-004`; `SCR-AUTH-001` | OAuth callback의 성공 응답이 추적표에서는 사용자 JSON+쿠키 `200`, API에서는 앱으로 redirect하는 `302`다. 클라이언트 계약과 제출 PDF가 서로 다른 상태 코드를 설명하게 된다. | 현재 API description과 `Location`/`Set-Cookie` 설계가 명시한 `302`를 채택할지, JSON `200`으로 바꿀지 하나를 선택한다. redirect 설계를 유지한다면 T01 최소 API 표도 `302`와 쿠키/Location으로 동기화한다. |
| M-05 | Major | 공통 | `API_DB_추적표.md:108`의 선택 `destinationId` 대 `API.yml:336-377`의 `destinationId` 미사용·`lat/lng` 사용 | `REQ-FUNC-012`; `SCR-RVW-001` | 후기 관련순 목록의 요청 필드가 추적표와 API에서 다르다. API는 브라우저의 현재 목적지 ID가 D1에 없다는 이유로 좌표를 요구하지만, 추적표는 destinationId를 유효한 선택 필드로 기록한다. | 최종 계약을 하나로 정한다. 현재 API의 설계 이유를 유지한다면 `destinationId`를 추적표에서 제거하고 `sort=relevant`의 `lat`+`lng` 동시 필수, `latest/helpful`의 좌표 선택 규칙을 양쪽에 유지한다. |
| m-01 | Minor | 공통 | `API.yml:867-906`의 `DataBundle.required`에 `bus`, `residential`; `API_DB_추적표.md:135`의 “선택적 bus·residential” | `REQ-FUNC-003`~`009`, `REQ-NFN-001`, `REQ-NFN-002`, `REQ-NFN-006`; `SCR-MAIN-001`, `SCR-WGHT-001`, `SCR-DONG-001` | 실제 로컬 `public/data/bundle.json`에는 두 키가 모두 있어 현재 payload와 schema가 과도하게 불일치하지는 않는다. 다만 T01은 두 영역을 선택적으로 기록했고 API는 항상 필수로 선언해 fallback/축소 번들의 계약이 모순된다. | `bus`·`residential`을 정말 항상 제공할지, 없을 때 브라우저가 빈 상태/대체 계산을 처리할지 정하고 schema와 추적표의 optionality를 맞춘다. 현재 bundle shape를 근거로 “불일치 없음”으로 판정하려면 T01의 “선택적” 표현을 고친다. |
| m-02 | Minor | API | `API.yml:1025-1042`의 `ReviewCreate.required`에 `feltCommuteMin` 포함, 동시에 nullable·“선택 입력” 설명 | `REQ-FUNC-013`; `SCR-RVW-002` | JSON 키 자체는 반드시 보내고 값만 `null`로 보내야 하는지, 키를 생략해도 되는지 계약이 모호하다. DB는 NULL을 허용한다. | `null`을 명시적으로 보내는 계약이면 description과 화면 예시를 그렇게 고정하고, 생략 가능한 선택이면 `required`에서 제거한다. 다른 후기 입력값은 계속 필수/NOT NULL로 유지한다. |
| m-03 | Minor | 공통 | API camelCase와 DB snake_case: `residenceMonths`/`residence_months`, `feltCommuteMin`/`felt_commute_min`, `createdAt`/`created_at`, `destination.name`/`destinations.place_name`, `ratings.*`/`rating_*` | `REQ-FUNC-012`~`015`; `SCR-RVW-001`, `SCR-RVW-002` | 의미상 대응은 보이지만 변환 규칙이 API나 DB note에 명시되어 있지 않다. 특히 `destination.name`과 `place_name`, 중첩 ratings와 세 개의 DB 컬럼은 SQL projection/serializer 구현자가 추론해야 한다. | API description 또는 DB 제출 정의서에 read/write 매핑을 명시하고, 응답의 계산값(`helpfulCount`, `helpfulByMe`, `isMine`)과 실제 컬럼(`review_helpfuls`, 세션, `reviews.user_id`)도 구분한다. 새 컬럼은 만들지 않는다. |
| m-04 | Minor | API | `API.yml:51-54`의 `/api/data` 요구사항 목록과 `API_DB_추적표.md:83`의 관련 요구사항 목록 | `REQ-NFN-002`; `SCR-WGHT-001` | 1초 이내 통근 계산·추천 재정렬은 브라우저 요구지만 T01은 최초 `/api/data`와 연결했다. 현재 operation description에는 이 ID가 없어 추적표와 OpenAPI의 양방향 링크가 끊긴다. | `/api/data` description에 `REQ-NFN-002`를 추가하거나, 해당 성능 요구가 API 전달이 아닌 브라우저 계산임을 trace 표에서 명시해 API operation 연결을 제거한다. |

## 4. 요청된 최소 후보 판정

| 후보 | 판정 | 실제 파일 대조 |
|---|---|---|
| (a) `reviews.destination_id`가 NULL이고 API/최종 기준은 목적지 필수 | 실패 — M-01 | `DB.dbml:106`은 NULL 선택 입력, `API.yml:967-991,1028,1077`은 destination과 네 필드 필수다. |
| (b) `[null]` 설정 제거 | 실패 — B-01 | `DB.dbml:106,108`에 2건이 있다. nullable은 기본 동작으로 두고 `[null]`을 쓰지 않는 방향으로 수정해야 한다. |
| (c) 닉네임 note 1~12와 AuthUser maxLength 40 | 실패 — M-02 | `DB.dbml:50`은 1~12, `API.yml:825-827`은 1~40, `Review.nickname`에는 범위가 없다. |
| (d) API field와 DB snake_case 변환 | 부분 통과 — m-03 | 이름의 의미 대응은 가능하지만 `destination.name`/`place_name`, 중첩 ratings/`rating_*` 등 변환 규칙이 문서에 없다. |
| (e) `feltCommuteMin`만 선택/null 허용 | 부분 통과 — M-01·m-02 | API schema는 `feltCommuteMin`을 nullable로 표시했지만 DB에는 destination도 NULL로 선언되어 있고, POST 키는 required다. destination을 NOT NULL로 고친 뒤 생략/명시적 null 중 하나를 고정해야 한다. |
| (f) `destinations` 공유/수정/고아행 정책 | 실패 — M-03 | API POST/PATCH와 DB 권한표에 목적지 생성·수정은 있으나 공유 여부, 이전 행, 참조 없는 행의 처리 정책이 없다. |
| (g) `/api/data` `DataBundle.required`와 실제 bundle | 현재 payload는 통과, optionality는 Minor | 로컬 `public/data/bundle.json`의 top-level 9개 키에 `bus`와 `residential`이 모두 존재하여 현재 shape와는 과도하게 다르지 않다. 다만 T01의 “선택적” 표현과 API required가 다르며, 동 수는 요구사항 547 대 실제 556으로 별도 보존된 충돌이다. |
| (h) OAuth/후기 미구현을 구현 완료로 표현하지 않음 | 통과 | `API_DB_추적표.md:16,150-152,177-178`이 설계만이라고 명시한다. `API.yml:7`도 HTTP API 설계라고 설명한다. T05/T07에서 실제 구현·D1 생성·배포 완료 문구를 추가하지 않는다. |
| (i) 권한/중복/cascade/sort/page 계약 | 핵심 규칙 통과, M-03·M-04·M-05 보완 필요 | 작성자 소유권·403(`API.yml:520-523,564-566`), 후기/도움돼요 중복(`DB.dbml:117,132`, `API.yml:445-446,586-597`), 도움돼요 cascade(`DB.dbml:145`, `API.yml:564-565`), 정렬·페이지(`API.yml:336-395`, `940-959`)가 일치한다. 목적지 수명주기와 추적표의 callback/list 요청 불일치는 별도 Major다. |

## 5. 실습안내 기준 PDF 제작 가능성

| 산출물 | 현재 가능성 | T07/T08 전 조건 |
|---|---|---|
| API PDF | 조건부 가능 | YAML의 9 path/12 operation, 요청·응답·예외, REQ/SCR/저장소 설명과 `$ref`가 정적으로 확인됐다. 그러나 callback/list 계약, 닉네임, 목적지, DataBundle optionality를 T05에서 맞춘 뒤 Swagger 미리보기와 PDF를 생성해야 한다. |
| DB PDF | 현재 보류 | 7개 테이블, 7개 관계, PK/FK/UQ/index, 액터 권한표는 준비되어 있다. 하지만 `[null]` 2건이 DBML 정적 blocker이고 destination 수명주기 정책도 비어 있어 T06에서 보정한 뒤 ERD/정의서/권한표를 함께 출력해야 한다. |

이번 검토는 브라우저를 사용하지 않았으므로 Swagger Editor·dbdiagram.io의 실제 렌더링 성공이나 PDF 레이아웃을 주장하지 않는다. T07/T08의 해당 도구 검증은 보정 이후 별도로 수행한다.

## 6. 후속 수정 체크리스트

### T05 OpenAPI 수정

- [ ] `Auth callback` 성공 응답을 `302` 또는 `200` 중 하나로 고정하고 T01 추적표와 맞춘다. 현재 API의 `Location`+`Set-Cookie` 설계를 유지하면 `302`가 기준이다.
- [ ] 후기 목록의 `destinationId`와 `lat/lng` 중 하나를 계약으로 고정한다. 현재 설계를 유지하면 `sort=relevant`에 `lat`+`lng`를 함께 요구하고 추적표의 destinationId 표기를 제거한다.
- [ ] `Review.destination`/`ReviewCreate.destination`을 DB의 NOT NULL 정책과 맞추고, destination 객체를 null로 보내는 경로를 만들지 않는다.
- [ ] 닉네임 길이 범위를 `AuthUser`, `Review`, 작성/콜백 검증 설명에 동일하게 반영한다. T01/DB note의 1~12 기준을 채택할 경우 maxLength 40과 무제한 표기를 제거한다.
- [ ] `feltCommuteMin`은 키 생략 또는 명시적 `null` 중 한 계약을 선택한다. 이외 후기 입력값의 필수성은 유지한다.
- [ ] `destinations`가 후기별 스냅샷인지 공유 행인지, PATCH 교체 방식과 고아행 처리 방식을 operation description에 적는다.
- [ ] `residenceMonths` 등 camelCase↔snake_case, 중첩 ratings↔세 컬럼, `destination.name`↔`place_name` 매핑을 명시한다.
- [ ] `/api/data` description에 `REQ-NFN-002`를 추가하거나 T01에서 API 연결을 제거해 양방향 추적성을 맞춘다.
- [ ] `bus`·`residential`의 required/optional 정책을 실제 bundle 및 브라우저 fallback 계약과 일치시킨다.
- [ ] 새 path나 서버 추천·통근 계산 API를 추가하지 않고, OAuth·후기 API를 구현 완료로 표현하지 않는다.

### T06 DBML·권한표 수정

- [ ] `DB.dbml:106,108`의 `[null]`을 제거한다. `destination_id`는 API 기준 `[not null]`, `felt_commute_min`만 nullable로 남긴다.
- [ ] `reviews.destination_id`의 필수성, `destinations` FK의 삭제 동작, 후기 삭제 시 destination 고아행 처리 방식을 DB note와 권한표에 기록한다.
- [ ] 목적지 공유를 허용하지 않는 후기별 snapshot 정책 또는 공유/수정 금지 정책을 선택해 `DB권한표.md:18`의 `U*` 의미를 구체화한다. 테이블을 추가하지 않는다.
- [ ] API 매핑을 DB 정의서와 일치시킨다: `name↔place_name`, camelCase↔snake_case, ratings 세 컬럼, 집계/세션 계산값.
- [ ] `users.nickname`의 범위를 API와 같은 값으로 맞추고, 현재 7개 테이블·필수 PK/FK/UQ·후기 중복 UQ·도움돼요 복합 PK·CASCADE·조회 index를 보존한다.
- [ ] 액터 권한표의 본인 제한, 게스트 공개 조회, OAuth/세션 비밀값 비저장, KV 범위 제외를 DBML과 함께 검수한다.
- [ ] 수정 후 DBML 구조 검사와 `git diff --check`를 다시 실행한다. `[null]`이 0건이고 7개 테이블/7개 관계가 유지되어야 T08로 넘긴다.

## 7. 정적 검증 기록

| 검증 | 결과 | 세부 |
|---|---|---|
| 로컬 YAML parse | PASS | Ruby Psych로 `API.yml`을 읽었고 OpenAPI 3.0.3 문서가 파싱되었다. `paths=9`, operation=12, components 그룹 `parameters/responses/schemas/securitySchemes` 확인 |
| 로컬 `$ref` 확인 | PASS | `API.yml`의 75개 `#/components/...` 참조를 같은 파일의 해당 component 정의와 대조했고 누락 0건 |
| 정적 DBML 구조 검사 | 조건부 FAIL | `Table=7`, `Ref=7`, 중복 Table=0은 PASS. 그러나 `[null]` 미지원 설정이 `DB.dbml:106,108`에서 2건 검출되어 DBML blocker로 판정 |
| 실제 로컬 bundle shape | PASS(현재 payload) | `public/data/bundle.json`을 로컬 JSON으로 읽어 top-level `meta,pctKeys,axisWeights,unavailableAxes,dongs,graph,bus,residential,scores` 9개와 `dongs=556`, `scores=556`을 확인. 요구사항의 547개 차이는 별도 충돌로 보존 |
| `git diff --check` | PASS | 검토 대상 기존 파일(`API.yml`, `DB.dbml`, `DB권한표.md`, `API_DB_추적표.md`)에 공백 오류 없음. 이 보고서 자체도 `/dev/null` 대비 no-index 검사에서 trailing whitespace 0건(미추적 파일 차이 때문에 종료값 1)이다. |

정적 검증 결과는 문법·참조·구조와 문서 계약의 판정이다. 실제 OAuth/D1 실행,
Swagger Editor/dbdiagram.io 외부 렌더링, API PDF·DB PDF 레이아웃은 이 보고서의
검증 범위가 아니다.

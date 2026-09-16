# DBML·권한표 보정 결과

작성일: 2026-09-16
작업: T06 DBML 보정
대상: `DB.dbml`, `DB권한표.md`
근거: `/Users/macbookpro/Downloads/요구사항정의서.docx`, `/Users/macbookpro/Downloads/화면설계서.docx`, `docs/mini_project/실습안내.pdf`, `API_DB_교차검토.md`

## 1. 보정 결론

최종 DOCX의 후기 작성 규칙에 맞춰 통근 목적지는 필수로 고정했다. 목적지와
후기는 하나의 후기 전용 snapshot을 사용하며, 후기 생성·수정·삭제에서 목적지
수명주기를 서버 API 트랜잭션으로 함께 관리한다. D1은 기존 7개 테이블과 7개
관계를 유지하고, 지도 지표·경계·교통망·일반 지오코딩 캐시는 계속 KV 범위 밖으로
둔다.

## 2. 교차검토 항목별 처리

| ID | 구분 | 처리 결과 | DB 근거·검증 범위 |
|---|---|---|---|
| B-01 | DB | 완료 | `destination_id`를 `[not null]`로 바꾸고 `felt_commute_min`의 `[null]`을 제거했다. 후자는 DBML nullable 기본 동작과 note의 선택/NULL 규칙으로 표현했다. `[null]` 잔여 0건을 확인했다. |
| M-01 | 공통 | DB 측 완료, API 측 T05 동기화 대상 | 목적지를 필수 FK로 바꾸고 후기 생성 시 destination+review를 함께 만드는 트랜잭션 정책을 DBML Project Note, `destinations`/`reviews` Note, 권한표에 기록했다. 최종 API의 필수 body·응답 일치는 T05에서 별도 확인한다. |
| M-02 | 공통 | DB 측 완료, API 측 T05 동기화 대상 | `users.nickname` note와 권한표를 API와 동일한 1~12자 검증 규칙으로 고정했다. 이메일·실명·사진 등 프로필 컬럼은 추가하지 않았다. `AuthUser`·`Review` schema의 길이 일치는 T05에서 확인한다. |
| M-03 | 공통 | 완료 | `destinations`를 후기별 전용 snapshot으로 고정하고 `reviews(destination_id)`에 `UNIQUE` index를 추가했다. PATCH의 snapshot 갱신/교체, DELETE의 review-helpful cascade 후 destination 삭제, 고아행 방지와 FK 자동 cascade가 아님을 DBML·권한표에 동일하게 기록했다. |
| M-04 | 공통 | DB 영향 없음, T05 확인 항목으로 이관 | OAuth callback의 302/200 선택은 API·추적표 계약 문제이며 D1 구조를 바꾸지 않는다. OAuth 최소정보·세션 hash 경계는 DBML에서 유지했다. |
| M-05 | 공통 | DB 영향 없음, T05 확인 항목으로 이관 | 후기 목록의 `destinationId` 대 `lat/lng` 요청 선택은 API query 계약 문제이며 DB에는 새 컬럼이나 테이블을 추가하지 않았다. 후기 목적지 snapshot FK 경계는 유지했다. |
| m-01 | 공통 | DB 영향 없음, T05 확인 항목으로 이관 | `bus`·`residential`은 KV 번들 optionality 문제다. DBML에는 지도 지표·그래프·캐시 테이블을 추가하지 않고 KV 제외 경계를 보존했다. |
| m-02 | API·DB 연계 | DB 측 완료, API 측 T05 동기화 대상 | `felt_commute_min`은 nullable 기본 동작으로 두고 선택 입력·NULL 의미를 note에 명시했다. JSON 키 생략/명시적 `null`의 최종 계약은 API에서 일관되게 정한다. |
| m-03 | 공통 | 완료 | `destination.name↔place_name`, `residenceMonths↔residence_months`, `feltCommuteMin↔felt_commute_min`, `ratings` 3종↔`rating_*` 매핑을 Project Note·reviews Note·권한표에 명시했다. `helpfulCount`는 COUNT, `helpfulByMe`·`isMine`은 세션/소유관계 계산값이며 컬럼을 추가하지 않았다. |
| m-04 | 공통 | DB 영향 없음, T05 확인 항목으로 이관 | `/api/data`와 `REQ-NFN-002`의 양방향 추적성은 API/추적표 문제다. D1 범위와 KV 경계는 변경하지 않았다. |

## 3. 보존한 구조와 제약

- 업무 테이블은 `regions`, `users`, `oauth_accounts`, `sessions`, `destinations`,
  `reviews`, `review_helpfuls` 정확히 7개다.
- `Ref`는 7개다. `users`·`regions`·`reviews`·`review_helpfuls`의 PK/FK와
  OAuth `(provider, provider_user_id)` UQ, 후기 `(user_id, region_code)` UQ,
  `reviews(destination_id)` UQ, 도움돼요 복합 PK를 유지했다.
- 후기 삭제 시 `review_helpfuls.review_id → reviews.id`만 FK `CASCADE`로
  연쇄 삭제한다. `reviews.destination_id → destinations.id`는 방향상 자동
  cascade를 선언하지 않고 API 트랜잭션에서 후기 삭제 후 destination을 삭제한다.
- 세션은 `token_hash`만 저장하며, OAuth는 provider 식별자와 provider user ID 등
  최소 정보만 저장한다. 전체 프로필과 access/refresh token 원문은 저장하지 않는다.
- 행정동 지표·경계·점수·교통망·일반 지오코딩 캐시는 KV이며 D1 테이블로 확장하지
  않았다.

## 4. 검증 기록

| 검증 | 결과 | 비고 |
|---|---|---|
| `[null]` 검색 | PASS | `DB.dbml`에서 0건 |
| Table/Ref 수 | PASS | `Table` 7개, `Ref` 7개 |
| destination unique index | PASS | `(destination_id) [unique, name: 'uq_reviews_destination']` 확인 |
| 필수 nullable 제약 | PASS | `reviews.destination_id [not null]`; `residence_months`, 3개 rating, `body`, 소유자·지역 FK도 `[not null]` 유지. `felt_commute_min`만 nullable 기본 동작 |
| PK/FK/UQ/index 구조 | PASS | PK 7개 테이블, 후기 user+region UQ, OAuth UQ 2개, helpful 복합 PK, session hash UQ·만료 조회 index, 지역/후기 조회 index 확인 |
| brace/index/ref 구조 | PASS | `Table` 블록 괄호 균형, 5개 `indexes` 블록, 7개 `Ref` 선언을 정적 확인 |
| SQLite DDL 의미 검증 | PASS | 동일 컬럼·PK/FK·UQ·CASCADE 의미를 in-memory SQLite DDL로 생성하고 `PRAGMA foreign_keys=ON`에서 후기-도움돼요 cascade, 목적지 1:1 unique, nullable felt commute를 확인 |
| `git diff --check` | PASS | tracked DBML·권한표는 exit 0. 새 `DB_보정결과.md`는 `/dev/null` 대비 no-index 검사에서 trailing whitespace 0건이며 exit 1은 미추적 파일 차이의 정상 반환값이다. |
| 외부 DBML 파서 | 미실행 | dbdiagram.io 외부 렌더링은 T08 범위다. 이번 결과는 로컬 정적 구조·SQLite 의미 검증으로 한정한다. |

## 5. 잔여 후속 확인

M-04, M-05, m-01, m-02, m-04의 API·추적표 측 계약은 T05/T09에서 최종 파일 간
대조해야 한다. 이 문서는 DBML·권한표 보정 결과이며 OAuth·후기 API나 D1 배포가
완료되었다는 의미가 아니다.

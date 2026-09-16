# OpenAPI 보정 결과

작성일: 2026-09-16
대상: `docs/mini_project/draft/API.yml` (T05 OpenAPI 보정)
기준: 최종 요구사항정의서·화면설계서 DOCX, `API_DB_교차검토.md`,
`API_DB_추적표.md`, `API_DB_작업계획.md`, 실습안내 기준

- 기능 기준: `/Users/macbookpro/Downloads/요구사항정의서.docx`
- 화면 기준: `/Users/macbookpro/Downloads/화면설계서.docx`
- 제출 형식 기준: 저장소의 T01 검토에서 확인한 `실습안내.pdf`

## 1. 보정 범위와 결론

API는 작업계획의 고정 범위인 9개 path·12개 operation을 유지했다. 새로운 추천·
통근·상세 API나 D1 테이블을 추가하지 않았고, OAuth·후기·도움돼요 경로는 설계
계약으로만 표현했다. 현재 Worker에 해당 기능이 구현·배포되었다고 표현하지 않는다.

최종 API 계약의 핵심은 다음과 같다.

- OAuth callback 성공은 `200 JSON`이 아니라 `302`이며, `Location`으로 OAuth 시작
  직전 화면을 복원하고 HttpOnly `Set-Cookie`로 세션을 전달한다.
- 후기 `sort=relevant`는 현재 브라우저 목적지의 `lat`와 `lng` query를 함께 요구한다.
  D1 목적지 `destinationId` query는 사용하지 않으며, `latest`·`helpful`은 좌표를
  생략할 수 있다.
- 익명 `nickname`은 `AuthUser`와 `Review` 모두 1~12자다.
- 후기 생성·응답의 `destination`은 null이 아닌 필수 객체다. POST는 후기 전용
  목적지 snapshot row와 review row를 한 트랜잭션에서 만들고, PATCH의 목적지 교체와
  DELETE의 snapshot 정리도 같은 후기 수명주기로 설명한다.
- `feltCommuteMin`만 선택 입력이다. POST/PATCH에서 키 생략 또는 `null`을 허용하고,
  Review 응답에는 항상 키를 포함하며 미입력은 `null`로 반환할 수 있다.
- API camelCase와 D1 snake_case 변환, `helpfulCount`·`helpfulByMe`·`isMine`의
  계산 근거를 schema/operation description에 명시했다.
- `/api/data`에는 `REQ-NFN-002`를 연결하되 1초 목표가 API 서버 계산 시간이 아니라
  응답 완료 뒤 브라우저의 통근 계산·추천 재정렬 성능임을 분명히 했다. `bus`와
  `residential`은 현재 bundle의 필수 top-level 키로 유지했다.

## 2. 교차검토 항목별 처리 결과

`API_DB_교차검토.md`의 B/M/m 항목을 모두 기록한다. DBML·권한표와 T01 추적표의
동기화는 이 작업의 소유 범위가 아니며, 해당 항목은 후속 작업으로 구분했다.

| ID | 판정 당시 문제 | T05 처리 결과 | 상태/후속 |
|---|---|---|---|
| B-01 | `DB.dbml`의 `destination_id [null]`, `felt_commute_min [null]` 설정 | API는 destination을 필수·non-null로 계약하고 `feltCommuteMin`만 선택/null로 명시했다. DBML의 `[null]` 제거와 DB FK nullable은 T06 소유다. | API 해결. DB 보정은 T06 |
| M-01 | DB의 destination 선택성과 API의 destination 필수성 불일치 | `ReviewCreate`, `Review`, `ReviewDestinationInput`에서 destination을 필수 객체로 유지하고 POST/PATCH/DELETE의 snapshot 수명주기를 명시했다. DB `reviews.destination_id NOT NULL`과 FK 정책은 T06에서 동기화한다. | API 해결. DB 동기화는 T06 |
| M-02 | AuthUser 1~40자, Review 무제한, DB note 1~12자 불일치 | `AuthUser.nickname`과 `Review.nickname` 모두 `minLength: 1`, `maxLength: 12`로 통일하고 OAuth UID 기반 익명 닉네임 설명·예시를 맞췄다. | 해결 |
| M-03 | destination 공유/수정/고아 snapshot 수명주기 미정 | POST마다 후기 전용 snapshot을 새로 생성하고, PATCH에 destination이 있으면 해당 후기 snapshot을 안전하게 교체하며, DELETE는 review·helpfuls 삭제 뒤 같은 트랜잭션에서 해당 snapshot을 정리하도록 명시했다. 공유 행 직접 수정은 금지한다. | 해결 |
| M-04 | T01은 callback 성공을 200, API는 302로 표기 | 최종 API 계약은 `302 + Location + HttpOnly Set-Cookie`로 확정했다. `Location`은 로그인 시작 직전 화면 복귀 경로임을 명시했다. T01의 200 표기는 T01 동기화 필요 항목이며 최종 API의 미해결 결함으로 남기지 않는다. | API 해결. T01 동기화 |
| M-05 | T01의 `destinationId`와 API의 `lat/lng` 불일치 | 최종 API는 현재 브라우저 목적지 `lat`+`lng`를 사용한다. `sort=relevant`에서는 두 좌표가 함께 필수이고 `latest`·`helpful`은 생략 가능하다고 명시했다. T01의 destinationId 표기는 T01 동기화 필요 항목이며 최종 API의 미해결 결함으로 남기지 않는다. | API 해결. T01 동기화 |
| m-01 | T01은 bus·residential을 선택적으로, API는 required로 표기 | 현재 실제 bundle에 두 top-level 키가 항상 있으므로 `DataBundle.required`를 유지하고 schema description에 현재 bundle 필수 키임을 명시했다. | API 해결. T01 표현 동기화 권장 |
| m-02 | `feltCommuteMin`이 nullable인데 POST required라 키 생략 여부가 모호 | `ReviewCreate.required`에서 제거하고 키 생략 또는 명시적 `null`을 허용했다. `Review` 응답 required는 유지해 항상 필드를 포함하며, `ReviewUpdate`도 생략/null을 명시했다. | 해결 |
| m-03 | API camelCase와 DB snake_case, 목적지·ratings·계산값 매핑이 암묵적 | Review/Create/Destination/Ratings와 후기 operation description에 `residenceMonths`↔`residence_months`, `feltCommuteMin`↔`felt_commute_min`, `destination.name`↔`place_name`, ratings 세 컬럼, timestamp 매핑을 명시했다. `helpfulCount`는 COUNT, `helpfulByMe`는 세션+helpfuls, `isMine`은 세션 user와 `reviews.user_id` 계산값이며 새 컬럼을 만들지 않는다. | 해결 |
| m-04 | `/api/data`에서 T01의 `REQ-NFN-002` 연결이 누락 | `/api/data` 요구사항 목록에 `REQ-NFN-002`를 추가하고, 1초는 응답 후 브라우저 계산·추천 재정렬 목표임을 명시했다. | 해결 |

## 3. 실습안내 기준 계약 확인

각 operation에는 Method/Path, 요청 parameters·body, 성공 응답, 대표 오류 응답,
`REQ-*`, `SCR-*`, 저장소/테이블 description이 남아 있다. 고정 범위는 다음과 같다.

| 구분 | 결과 |
|---|---|
| Path | 정확히 9개 |
| Operation | 정확히 12개 |
| 서버 계산 경계 | `/api/data` 원자료 제공 후 통근·추천·상세는 브라우저 계산 |
| 영속 저장소 | KV 번들·지오코딩 캐시와 D1 7개 테이블 경계를 유지 |
| 구현 상태 | OAuth·후기·도움돼요는 설계 계약이며 구현 완료로 표기하지 않음 |

## 4. T05 산출물 범위

이 작업에서 수정한 파일은 `API.yml`과 본 보고서뿐이다. DBML, DB 권한표, T01
추적표, 최종 DOCX, 제출 PDF는 수정하지 않았다. T01 표의 callback 상태 코드와
후기 관련순 필드 표기는 위 표의 M-04/M-05처럼 최종 API 계약에 맞춘 동기화 항목으로
전달한다.

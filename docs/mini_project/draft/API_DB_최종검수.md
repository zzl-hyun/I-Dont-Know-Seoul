# API·DB 제출물 최종 검수

검수일: 2026-09-16  
검수 범위: API·DB 산출물 4개  
검수 결과: **PASS (단, 전체 수업 제출 ZIP에는 별도의 개요 PDF가 필요함)**

## 1. 검수 기준과 전제

검수 기준은 다음 순서로 적용했다.

1. `docs/mini_project/실습안내.pdf`: 제출 파일명·개수, API PDF 표시 항목, DB PDF 구성 및 평가 체크리스트
2. 최종 원문인 `/Users/macbookpro/Downloads/요구사항정의서.docx`와 `/Users/macbookpro/Downloads/화면설계서.docx`
3. 최종 설계 산출물인 `draft/API.yml`, `draft/DB.dbml` 및 그 PDF

과거 초안은 검수 기준으로 사용하지 않았다. 최종 요구사항 문서에는 기능 요구사항 15개(`REQ-FUNC-001`~`015`), 비기능 요구사항 6개(`REQ-NFN-001`~`006`), 화면 7개(`SCR-HOME-001`, `SCR-MAIN-001`, `SCR-WGHT-001`, `SCR-DONG-001`, `SCR-AUTH-001`, `SCR-RVW-001`, `SCR-RVW-002`)가 정의되어 있다.

`실습안내.pdf` 전체 제출물은 `_개요.pdf`까지 포함한 5개 파일이다. 이번 작업 및 아래 검수는 사용자가 요청한 API·DB 4개 파일에 한정한다.

## 2. 제출 폴더 및 파일명

`docs/mini_project/submission/`에 다음 **정확히 4개**가 존재한다.

| 파일 | 결과 |
|---|---|
| `PG7반_P211_김기현_I-Dont-Know-Seoul_API.yml` | PASS |
| `PG7반_P211_김기현_I-Dont-Know-Seoul_API.pdf` | PASS |
| `PG7반_P211_김기현_I-Dont-Know-Seoul_DB.dbml` | PASS |
| `PG7반_P211_김기현_I-Dont-Know-Seoul_DB.pdf` | PASS |

추가 파일 없음. 파일명은 실습안내의 `PG7반_{개인별코드}_{이름}_{프로젝트명}` 규칙에 맞는다.

## 3. API YAML 검수

### 3.1 구조·파싱

| 항목 | 결과 |
|---|---|
| YAML 파싱 | PASS |
| OpenAPI 버전 | PASS - `3.0.3` |
| Path 수 | PASS - 9 |
| Operation 수 | PASS - 12 |
| `$ref` 수 | PASS - 75 |
| 해석되지 않은 `$ref` | PASS - 0 |
| 중복 operationId | PASS - 0 |

최종 12개 operation은 다음과 같다.

| Method | Path |
|---|---|
| GET | `/api/data` |
| GET | `/api/geocode` |
| GET | `/api/auth/{provider}` |
| GET | `/api/auth/{provider}/callback` |
| GET | `/api/auth/me` |
| POST | `/api/auth/logout` |
| GET | `/api/regions/{code}/reviews` |
| POST | `/api/regions/{code}/reviews` |
| PATCH | `/api/reviews/{reviewId}` |
| DELETE | `/api/reviews/{reviewId}` |
| POST | `/api/reviews/{reviewId}/helpful` |
| DELETE | `/api/reviews/{reviewId}/helpful` |

### 3.2 설계 추적성 및 내용

- `/api/data`와 `/api/geocode`는 현재 Worker의 GET 계약 및 KV/Asset·지오코딩 캐시 경계를 반영한다.
- 통근시간·등급·추천 정렬·공유 URL 계산은 `/api/data` 수신 뒤 브라우저에서 수행하는 것으로 명시되어 있다.
- OAuth, 후기, 도움돼요 API는 최종 요구사항과 화면에서 호출될 **설계 계약**으로 표현되어 있다.
- 각 operation에 Method·Path·요청 파라미터/본문·성공 응답·대표 오류·`REQ-*`·`SCR-*` 추적성이 있다.
- 후기 작성의 `destination{name,address,lat,lng}` 필수 규칙, 후기별 목적지 snapshot, 회원별 행정동 후기 1건, 도움돼요 중복 방지 제약이 API와 DB에서 같은 의미로 연결된다.

## 4. API PDF 검수

API PDF는 실습안내에서 허용한 명세서 PDF 형식으로 생성되었으며, Swagger Editor에서 확인한 최종 YAML과 같은 12개 operation을 엔드포인트 카드로 구성한다.

| 항목 | 결과 |
|---|---|
| 페이지 수 | PASS - 14쪽 |
| 용지 | PASS - A4 세로 |
| 12개 endpoint 목록 포함 | PASS - 12/12 |
| 각 카드의 Method·Path | PASS - 12/12 |
| 각 카드의 Request·Response | PASS - 12/12 |
| 성공·오류 코드 | PASS - 12/12 |
| 각 카드의 REQ/SCR 추적성 | PASS - 12/12 |
| 빈 페이지·잘림·겹침 | PASS - 없음 |

검수 과정에서 API PDF를 재생성한 뒤 `pdftoppm`으로 14쪽 전체를 다시 렌더링했다. 표지·API 목록·초기 데이터 API·OAuth callback·후기 작성·도움돼요 등록/취소 페이지를 고해상도로 추가 확인했으며, TRACEABILITY 영역의 겹침이 없는 최종본을 기준으로 판정했다.

Swagger Editor에서는 최종 YAML의 12개 operation과 visible parser/semantic/resolver/validation error 0을 확인했다. 이 브라우저 검증은 명세 파서 검증이며, OAuth·후기 API의 실제 서버 구현 완료를 의미하지 않는다.

## 5. DBML 검수

### 5.1 구조·무결성

| 항목 | 결과 |
|---|---|
| Table 수 | PASS - 7 |
| Ref 수 | PASS - 7 |
| `[null]` 설정 | PASS - 0 |
| 모든 테이블 PK | PASS |
| 핵심 FK | PASS |
| 핵심 NOT NULL | PASS |
| 회원별 행정동 후기 UNIQUE | PASS - `uq_reviews_user_region` |
| 후기별 목적지 snapshot UNIQUE | PASS - `uq_reviews_destination` |
| 도움돼요 복합 PK | PASS - `pk_review_helpfuls` |

모델링한 7개 테이블은 `regions`, `users`, `oauth_accounts`, `sessions`, `destinations`, `reviews`, `review_helpfuls`이다. `reviews.destination_id`는 NOT NULL이고, `felt_commute_min`만 선택 입력으로 nullable이다.

DBML은 최종 요구사항의 회원·OAuth 계정·세션·후기·도움돼요 관계를 D1/SQLite 관계형 모델로 표현한다. 행정동 경계·원지표·점수·지하철·버스 교통망·일반 지오코딩 캐시는 Cloudflare KV 범위로 명시하고 ERD에서 제외한다. 통근·점수·추천 계산 및 공유 URL 상태는 브라우저 범위로 명시한다.

### 5.2 dbdocs 게시·렌더 확인

최종 DBML을 [dbdocs 프로젝트](https://dbdocs.io/zzl-hyun/I-Dont-Know-Seoul)의 **Version 3**으로 게시하여 **7개 테이블과 7개 관계선이 파싱·렌더링되는 것**을 확인했다. 게시 직전 브라우저에 전달한 DBML의 SHA-256은 제출 폴더 `.dbml`의 `d61b1b052d5ab539b21b7fcdbf1b5c054bba5ada2e42c71645f4a30ff6361724`와 일치한다. DB PDF의 ERD는 dbdocs의 공식 PNG Export를 사용했다.

## 6. DB PDF 검수

| 항목 | 결과 |
|---|---|
| 페이지 수 | PASS - 9쪽 |
| 용지 | PASS - A4 가로 |
| ERD | PASS - dbdocs Version 3 공식 PNG Export, 7개 테이블·7개 관계선 |
| 관계 요약 | PASS |
| 7개 테이블 정의 | PASS - 전 테이블 컬럼·타입·키·nullable·설명 포함 |
| 액터 × 테이블 C/R/U/D 권한표 | PASS - 게스트·회원 기준 |
| KV·브라우저 제외 범위 주석 | PASS |
| 렌더 품질 | PASS - 잘림·겹침·빈 페이지·깨진 한글 없음 |

DB PDF 9쪽 전체를 PNG로 렌더링하고 dbdocs ERD, `reviews` 정의, 권한표를 대표 페이지로 확대 확인했다. 표와 선은 페이지 안에 들어오며, 모든 테이블 정의 페이지가 DBML의 7개 테이블과 대응한다.

## 7. 제출본 동기화·해시

제출본 YAML/DBML과 최종 draft 원문을 `cmp` 및 SHA-256으로 비교했다.

| 파일 | SHA-256 | 결과 |
|---|---|---|
| `API.yml` draft = submission | `05daed9d7c8bea0fc12f52f826a9a82136c88befc73c0bf92f394f3a592bab08` | PASS |
| `DB.dbml` draft = submission | `d61b1b052d5ab539b21b7fcdbf1b5c054bba5ada2e42c71645f4a30ff6361724` | PASS |
| `API.pdf` 최종본 | `2e76f6ce79d0bf7c35e3f29e7e66d6eb0d9d44d5a7ea0c226ff29f8bc41617b8` | PASS |
| `DB.pdf` 최종본 | `3a9c18f0cffb0274a3e953ec2873196569bdadcb2c8cbd0be60073c10917939f` | PASS |

최종 PDF 크기는 API 537,613 bytes, DB 273,999 bytes이며 두 PDF 모두 비어 있지 않고 정상 렌더링된다.

## 8. 최종 판정 및 제한사항

### PASS

- 요청한 API·DB 제출물 4개가 정확한 파일명으로 생성되었다.
- YAML·DBML 원문이 최종 draft와 byte-identical하다.
- API는 9 paths/12 operations 및 75개 `$ref`를 충족하고 `$ref` 누락이 없다.
- API PDF는 12개 endpoint의 Method·Path·Request·Response·성공/오류·REQ/SCR을 포함한다.
- DBML은 7개 테이블/7개 Ref와 핵심 PK/FK/UQ/NOT NULL 제약을 충족한다.
- DB PDF는 ERD·관계 요약·7개 테이블 정의·액터별 C/R/U/D 권한표·KV/브라우저 경계를 포함한다.
- `git diff --check` 통과.

### 남은 제한사항

- 실습안내의 전체 제출 ZIP은 `_개요.pdf`까지 포함한 5개 파일이다. 이 검수는 사용자가 이번에 요청한 API·DB 4개만 대상으로 하므로, 최종 ZIP을 만들 때 최종 요구사항·화면설계·와이어프레임을 합친 `_개요.pdf`를 별도로 포함해야 한다.
- OAuth·후기·도움돼요 경로는 이번 산출물에서 요구사항과 화면을 추적하는 설계 계약이다. 현재 서비스 구현·배포가 완료되었다고 판정하지 않는다.
- dbdocs 프로젝트는 현재 공개 링크로 게시되어 있다. 제출 후 외부 공개가 불필요해지면 dbdocs 프로젝트의 공개 범위를 별도로 조정해야 한다.

따라서 **API·DB 4개 산출물의 문서·구조·렌더 검수는 PASS**이며, 수업 최종 제출 시에는 `_개요.pdf`를 더해 5개 파일로 압축하면 된다.

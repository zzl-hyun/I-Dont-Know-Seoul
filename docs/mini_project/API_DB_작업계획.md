# API·DB 제출물 작업 계획

## 1. 목표

최종 요구사항정의서와 화면설계서를 기준으로 `I Don't Know Seoul`의 API 명세와
D1 ERD를 작성하고, 수업 제출 형식에 맞는 원본 파일과 PDF를 만든다.

최종 제출물은 아래 4개다.

1. `PG7반_P211_김기현_I-Dont-Know-Seoul_API.yml`
2. `PG7반_P211_김기현_I-Dont-Know-Seoul_API.pdf`
3. `PG7반_P211_김기현_I-Dont-Know-Seoul_DB.dbml`
4. `PG7반_P211_김기현_I-Dont-Know-Seoul_DB.pdf`

최종 파일은 `docs/mini_project/submission/`에 모은다. 검토표와 작업 보고서는
`docs/mini_project/draft/`에 두어 제출 파일과 섞지 않는다.

`실습안내.pdf`가 설명하는 전체 제출물은 개요 PDF를 포함한 5개지만, 사용자가
요구사항정의서와 화면설계서를 최종 문서로 확정하고 이번 작업을 2번(API)·3번(DB)
산출물 제작으로 지정했으므로 이 계획에서는 위 4개만 만든다.

## 2. 고정 설계 원칙

이번 작업에서는 다음 구조를 변경하지 않는다.

| 실행 위치·저장소 | 담당 범위 |
| --- | --- |
| Cloudflare KV | 행정동 경계·공공데이터 지표·점수·지하철 그래프 번들, 지오코딩 캐시 |
| Cloudflare D1 | 회원, OAuth 계정, 세션, 행정동 최소 참조값, 후기 목적지, 후기, 도움돼요 |
| 브라우저 | 통근 계산, 점수 계산, 추천 정렬, 공유 URL 상태 |

D1 ERD는 아래 7개 테이블만 기본 범위로 한다.

1. `regions`
2. `users`
3. `oauth_accounts`
4. `sessions`
5. `destinations`
6. `reviews`
7. `review_helpfuls`

필수 제약조건은 다음과 같다.

- `reviews`: `UNIQUE (user_id, region_code)`
- `review_helpfuls`: `PRIMARY KEY (review_id, user_id)`
- `oauth_accounts`: `UNIQUE (provider, provider_user_id)`
- 세션에는 원문 토큰이 아닌 해시만 저장한다.
- 후기 삭제 시 해당 도움돼요도 함께 삭제되도록 관계를 정의한다.
- 이메일, OAuth access token, refresh token, 전체 프로필은 MVP 저장 범위에서 제외한다.
- 행정동의 점수·경계·교통망·월세 지표는 D1에 중복 저장하지 않는다.

API는 아래 12개 동작을 기본 범위로 한다.

| 구분 | Method | Path |
| --- | --- | --- |
| 데이터 | `GET` | `/api/data` |
| 지오코딩 | `GET` | `/api/geocode` |
| 인증 | `GET` | `/api/auth/{provider}` |
| 인증 | `GET` | `/api/auth/{provider}/callback` |
| 인증 | `GET` | `/api/auth/me` |
| 인증 | `POST` | `/api/auth/logout` |
| 후기 | `GET` | `/api/regions/{code}/reviews` |
| 후기 | `POST` | `/api/regions/{code}/reviews` |
| 후기 | `PATCH` | `/api/reviews/{reviewId}` |
| 후기 | `DELETE` | `/api/reviews/{reviewId}` |
| 도움돼요 | `POST` | `/api/reviews/{reviewId}/helpful` |
| 도움돼요 | `DELETE` | `/api/reviews/{reviewId}/helpful` |

추천 계산, 통근 계산, 행정동 지표 상세 조회를 위한 별도 서버 API는 만들지 않는다.
브라우저가 `/api/data`를 받은 뒤 기존 로직으로 계산한다.

## 3. 기준 자료와 우선순위

내용과 제출 형식은 아래 기준으로 판단한다.

1. 제출 형식·평가 기준
   - `docs/mini_project/실습안내.pdf`
2. 기능·화면의 최종 내용(읽기 전용)
   - `/Users/macbookpro/Downloads/요구사항정의서.docx`
   - `/Users/macbookpro/Downloads/화면설계서.docx`
3. 이미 구현된 API의 실제 계약 확인
   - `worker/index.ts`
   - `wrangler.jsonc`
   - `src/`
4. 재작성 대상인 기존 초안
   - `docs/mini_project/draft/API.yml`
   - `docs/mini_project/draft/DB.dbml`
   - `docs/mini_project/draft/DB권한표.md`

기존 초안은 최종 여부를 다시 판정하거나 검증하는 자료가 아니라 전면 재작성
대상이다. 최종 문서와 충돌하는 `/places`, 서버 추천 계산, 전체 지도 데이터를
관계형 테이블로 옮기는 설계는 가져오지 않는다.

주의할 기준은 다음과 같다.

- 최종 문서가 대상 행정동을 547개로 명시하면 제출 문서도 547개로 유지한다.
  현재 운영 데이터의 556개와 다르더라도 소스 문서를 몰래 바꾸지 않고 검토표에
  차이를 기록한다.
- `destinations`는 후기와 연결되는 목적지 좌표 데이터다. 일반 지오코딩 캐시는 계속
  KV에 둔다.
- 저장 검색, 즐겨찾기, 관리자, 문의 테이블은 최종 요구사항에 없으므로 추가하지 않는다.
- 최종 DOCX는 어떤 경우에도 수정하지 않는다.

## 4. 서브에이전트 실행 규칙

모든 작업은 아래 설정의 서브에이전트가 담당한다.

```text
model: gpt-5.6-luna
reasoning_effort: max
fork_turns: none
```

사용자가 말한 `luna-max`는 위 설정으로 해석한다. 모델을 명시할 때 전체 대화가
자동 전달되지 않으므로, 각 위임 프롬프트에는 기준 문서 경로, 고정 설계 원칙,
선행 작업 결과, 소유 파일을 자체적으로 포함한다.

공통 규칙은 다음과 같다.

- 동시 실행 한도는 루트 에이전트를 포함해 4개이므로 서브에이전트는 최대 3개만
  동시에 실행한다.
- 각 에이전트는 표에 적힌 `Owned files`만 수정한다.
- 병렬 작업끼리는 같은 파일을 소유하지 않는다.
- 다른 작업자의 변경을 정리, 되돌리기, 포맷, stash하지 않는다.
- 원격 D1 생성, KV seed, 배포, 커밋, push는 하지 않는다.
- 구현 코드와 `wrangler.jsonc`는 이번 문서 산출 단계에서 수정하지 않는다.
- 검증 실패 시 다음 단계로 진행하지 않고, 실패 내용을 검토 문서에 남긴 뒤 해당
  산출물 소유 작업으로 되돌린다.

## 5. 실행 순서

```text
Wave 1  T01 기준 감사 및 추적표
              ↓
Wave 2  T02 DBML 작성  ─────┐
        T03 OpenAPI 작성 ───┤  병렬
                            ↓
Wave 3  T04 API·DB 교차 검토
              ↓
        T05 OpenAPI 보정 ───┐
        T06 DBML 보정 ──────┤  병렬
                            ↓
Wave 4  T07 Swagger PDF ────┐
        T08 ERD PDF ────────┤  병렬
                            ↓
Wave 5  T09 최종 패키지 검수
```

## 6. 작업별 위임 명세

### T01. 기준 감사 및 요구사항 추적표 작성

- 의존성: 없음
- Owned files: `docs/mini_project/draft/API_DB_추적표.md`
- 입력: `실습안내.pdf`, 최종 DOCX 2개, 실제 Worker·프론트 코드

작업 내용:

1. 최종 문서의 기능 요구사항 15개와 비기능 요구사항 6개를 모두 추출한다.
2. 각 ID를 `브라우저`, `KV`, `D1`, `외부 OAuth`, `문서만 해당` 중 하나 이상으로
   분류한다.
3. 서버 계약이 필요한 요구사항을 위 12개 API 동작과 연결한다.
4. D1 영속 데이터가 필요한 요구사항을 7개 테이블 및 컬럼 후보와 연결한다.
5. 화면 ID와 API 동작의 연결을 기록한다.
6. 최종 설계와 현재 구현 상태의 차이를 별도 표로 기록한다.

완료 기준:

- 최종 문서에 등장하는 모든 요구사항 ID가 누락 없이 한 번 이상 매핑된다.
- API가 필요 없는 클라이언트 계산 기능이 명시적으로 구분된다.
- 547개/556개처럼 해결되지 않은 차이는 임의로 선택하지 않고 근거와 함께 표시된다.
- 이 작업에서는 API·DB 원본이나 코드를 수정하지 않는다.

### T02. D1 DBML 초안 재작성

- 의존성: T01 완료
- Owned files:
  - `docs/mini_project/draft/DB.dbml`
  - `docs/mini_project/draft/DB권한표.md`
- 입력: T01 추적표와 고정 설계 원칙

작업 내용:

1. 기존 DBML을 7개 D1 테이블 중심으로 재작성한다.
2. SQLite/D1에서 구현 가능한 타입, 기본값, 외래키, 고유 제약조건, 인덱스를 쓴다.
3. 작성자만 후기 수정·삭제, 로그인 사용자만 도움돼요 등록·취소가 가능하도록
   소유 관계를 표현한다.
4. 세션 만료 조회, 지역별 후기 최신순·도움돼요순 조회에 필요한 인덱스를 정의한다.
5. `regions`에는 행정동 코드·이름·상위 지역처럼 후기 참조에 필요한 최소값만 둔다.
6. 다음 범위 주석을 DBML 프로젝트 설명에 포함한다.

> 행정동 경계, 공공데이터 지표, 점수 및 교통망 데이터는 Cloudflare KV의 버전 데이터
> 번들로 관리하며 ERD 범위에서 제외한다.

완료 기준:

- DBML 파서 또는 dbdiagram.io에서 오류 없이 열려야 한다.
- 정확히 7개의 업무 테이블만 존재한다.
- 필수 PK, FK, UNIQUE, 삭제 연쇄, 조회 인덱스가 확인된다.
- OAuth 식별자, 세션 해시, 후기 소유권, 도움돼요 중복 방지가 스키마로 설명된다.
- 전체 지도 지표·노선 그래프·지오코딩 캐시 테이블이 없어야 한다.

### T03. OpenAPI 초안 재작성

- 의존성: T01 완료
- Owned files: `docs/mini_project/draft/API.yml`
- 입력: T01 추적표, 실제 `worker/index.ts`, 고정 API 12개 동작

작업 내용:

1. OpenAPI 3.0.3 형식으로 12개 동작을 기술한다.
2. 기존 `/api/data`, `/api/geocode`는 실제 코드의 파라미터·응답·오류를 확인해
   문서화한다.
3. 인증은 HttpOnly 세션 쿠키 기반 `cookieAuth`로 정의한다.
4. OAuth 시작·콜백·내 정보·로그아웃 계약을 정의한다.
5. 후기 목록·작성·수정·삭제와 도움돼요 등록·취소 계약을 정의한다.
6. 지역별 후기 목록에는 최종 요구사항에서 필요한 정렬과 페이지네이션을 명시한다.
7. 요청·응답 스키마, 예시, 정상 상태 코드, 대표 오류를 작성한다.
8. 각 operation 설명에 관련 요구사항 ID와 화면 ID를 넣는다.

완료 기준:

- Swagger Editor에서 문법 오류와 참조 오류가 0건이어야 한다.
- 실제 또는 설계된 12개 동작 외의 가상 API가 없어야 한다.
- 추천·통근·점수 계산을 서버가 수행한다고 표현하지 않는다.
- 인증이 필요한 동작과 공개 동작이 구분된다.
- 작성자 권한 실패, 후기 중복, 도움돼요 중복/멱등 처리 등 핵심 오류 계약이 있다.
- API 스키마의 명칭과 타입이 T01 추적표 및 최종 화면 입력값과 일치한다.

### T04. API·DB 교차 검토

- 의존성: T02, T03 완료
- Owned files: `docs/mini_project/draft/API_DB_교차검토.md`
- 입력: T01 추적표, 수정된 `API.yml`, `DB.dbml`, 최종 DOCX

작업 내용:

1. 모든 API 요청·응답 필드가 DB 컬럼 또는 계산값으로 설명되는지 확인한다.
2. 모든 D1 테이블·관계가 최소 한 개 요구사항 또는 API 동작에 근거하는지 확인한다.
3. 요구사항 ID와 화면 ID가 관련 없는 API에 붙지 않았는지 확인한다.
4. 브라우저/KV/D1 경계가 양쪽 문서에서 동일한지 확인한다.
5. 인증, 소유권, 중복 방지, 삭제 연쇄, 정렬, 페이지네이션의 모순을 찾는다.
6. 수정 필요 항목을 `API`, `DB`, `공통`, `확인 불필요`로 분류하고 중요도를
   `Blocker`, `Major`, `Minor`로 기록한다.

완료 기준:

- 이 작업은 검토 보고서만 작성하고 API·DB 파일을 직접 수정하지 않는다.
- 각 지적에는 파일, 대상 경로·테이블, 근거 요구사항 ID, 기대 수정이 포함된다.
- 근거 없는 선호나 범위 확장 제안은 결함으로 기록하지 않는다.

### T05. OpenAPI 보정

- 의존성: T04 완료
- Owned files:
  - `docs/mini_project/draft/API.yml`
  - `docs/mini_project/draft/API_보정결과.md`
- 입력: T04 중 `API`와 `공통` 지적

작업 내용:

1. Blocker와 Major를 모두 수정한다.
2. Minor는 범위를 넓히지 않는 경우에만 반영한다.
3. Swagger Editor 검증을 다시 수행한다.
4. 각 지적의 반영 여부와 사유를 `API_보정결과.md`에 기록한다.

완료 기준:

- 미해결 Blocker와 Major가 0건이다.
- Swagger Editor 오류가 0건이다.
- API 동작 수와 범위가 고정 원칙을 벗어나지 않는다.

### T06. DBML 보정

- 의존성: T04 완료
- Owned files:
  - `docs/mini_project/draft/DB.dbml`
  - `docs/mini_project/draft/DB권한표.md`
  - `docs/mini_project/draft/DB_보정결과.md`
- 입력: T04 중 `DB`와 `공통` 지적

작업 내용:

1. Blocker와 Major를 모두 수정한다.
2. Minor는 테이블을 불필요하게 늘리지 않는 경우에만 반영한다.
3. DBML 파싱과 관계 표시를 다시 확인한다.
4. 각 지적의 반영 여부와 사유를 `DB_보정결과.md`에 기록한다.

완료 기준:

- 미해결 Blocker와 Major가 0건이다.
- DBML 파싱 오류가 0건이다.
- 7개 테이블과 KV 제외 범위가 유지된다.

### T07. Swagger 제출본과 API PDF 생성

- 의존성: T05 완료
- Owned files:
  - `docs/mini_project/submission/PG7반_P211_김기현_I-Dont-Know-Seoul_API.yml`
  - `docs/mini_project/submission/PG7반_P211_김기현_I-Dont-Know-Seoul_API.pdf`
- 입력: 검증 완료된 `docs/mini_project/draft/API.yml`

작업 내용:

1. 검증 완료된 YAML을 정확한 제출 파일명으로 동결한다.
2. Swagger Editor에 제출 YAML을 불러와 최종 검증한다.
3. 미리보기 인쇄로 PDF를 생성한다.
4. 오른쪽 미리보기의 모든 API를 펼치고 YAML 편집 영역을 접은 상태로 인쇄한다.
5. PDF를 페이지별로 렌더링해 잘림, 빈 페이지, 겹침, 한글 깨짐을 확인한다.

완료 기준:

- 제출 YAML과 검증된 초안의 내용이 동일하다.
- Swagger Editor 오류가 0건이다.
- PDF에서 모든 경로·메서드·요청 필드·성공/오류 코드·REQ/SCR가 읽을 수 있다.
- YAML 원문만 출력된 페이지나 접혀서 빠진 API가 없어야 한다.
- 파일명이 요구된 이름과 문자 단위로 일치한다.

### T08. DBML 제출본과 ERD PDF 생성

- 의존성: T06 완료
- Owned files:
  - `docs/mini_project/submission/PG7반_P211_김기현_I-Dont-Know-Seoul_DB.dbml`
  - `docs/mini_project/submission/PG7반_P211_김기현_I-Dont-Know-Seoul_DB.pdf`
- 입력: 검증 완료된 `docs/mini_project/draft/DB.dbml`

작업 내용:

1. 검증 완료된 DBML을 정확한 제출 파일명으로 동결한다.
2. dbdiagram.io에 제출 DBML을 불러와 파싱 오류를 확인한다.
3. 관계선과 테이블이 겹치지 않도록 배치한 뒤 ERD 이미지를 내보낸다.
4. 표지, ERD, 7개 테이블 정의서, 관계 요약, 액터별 C/R/U/D 권한표를 포함한
   DB PDF를 작성한다.
5. PDF를 렌더링해 7개 테이블, 관계선, 키, 컬럼 설명, 권한표의 가독성을 확인한다.

완료 기준:

- 제출 DBML과 검증된 초안의 내용이 동일하다.
- dbdiagram.io 파싱 오류가 0건이다.
- 7개 테이블과 핵심 관계가 한눈에 식별된다.
- DBML의 모든 컬럼이 테이블 정의서에 있고, PK/FK/UQ와 Nullable이 표시된다.
- 게스트·회원·작성자 기준의 C/R/U/D 및 본인 행 제한이 권한표에 표시된다.
- ERD 범위 밖 KV 데이터에 대한 주석이 보인다.
- 파일명이 요구된 이름과 문자 단위로 일치한다.

### T09. 최종 패키지 검수

- 의존성: T07, T08 완료
- Owned files: `docs/mini_project/draft/API_DB_최종검수.md`
- 입력: 최종 제출물 4개와 모든 검토 문서

작업 내용:

1. 제출 디렉터리에 정확한 4개 파일이 존재하고 크기가 0이 아닌지 확인한다.
2. YAML·DBML 원본을 다시 파싱한다.
3. 원본과 PDF의 경로 수, 테이블 수, 주요 제목을 대조한다.
4. API 12개 동작, D1 7개 테이블, 요구사항 ID 전체 매핑 여부를 다시 센다.
5. 네 파일의 해시, 페이지 수, 검증 도구와 결과를 기록한다.
6. `git diff --check`와 `git status --short --branch` 결과를 기록한다.

완료 기준:

- 파일명·파일 수·파싱·시각 검수가 모두 PASS다.
- 미해결 Blocker와 Major가 0건이다.
- 실제 구현·D1 생성·배포를 완료한 것처럼 표현하지 않는다.
- 실패 항목이 있으면 직접 고치지 않고 T05~T08 중 해당 소유 작업으로 되돌린다.

## 7. 산출물 소유권 표

| 파일 | 최종 소유 작업 |
| --- | --- |
| `draft/API_DB_추적표.md` | T01 |
| `draft/API.yml` | T03 → T05 |
| `draft/DB.dbml` | T02 → T06 |
| `draft/DB권한표.md` | T02 → T06 |
| `draft/API_DB_교차검토.md` | T04 |
| `draft/API_보정결과.md` | T05 |
| `draft/DB_보정결과.md` | T06 |
| `submission/*_API.yml`, `submission/*_API.pdf` | T07 |
| `submission/*_DB.dbml`, `submission/*_DB.pdf` | T08 |
| `draft/API_DB_최종검수.md` | T09 |

## 8. 전체 완료 조건

다음 조건을 모두 만족하면 문서 제작 작업을 완료로 판단한다.

- 최종 요구사항 ID와 화면 ID가 관련 API에만 연결돼 있다.
- 클라이언트 계산 기능이 가짜 서버 API로 추가되지 않았다.
- KV와 D1의 데이터 책임이 API 문서와 ERD에서 동일하다.
- Swagger Editor와 dbdiagram.io에서 오류 없이 열린다.
- API 12개 동작과 D1 7개 테이블이 검수됐다.
- PDF 두 개를 실제로 렌더링해 한글과 레이아웃을 확인했다.
- 정확한 이름의 제출 파일 4개가 `docs/mini_project/submission/`에 있다.
- 코드 변경, D1 생성, KV seed, 배포, 커밋, push는 수행하지 않았다.

## 9. 후속 구현은 별도 계획으로 분리

이 계획은 API·DB 설계 제출물 제작까지만 다룬다. 실제 기능 구현을 진행할 때는
별도 작업으로 아래 순서를 잡는다.

1. D1 데이터베이스와 migration 작성
2. `wrangler.jsonc`에 D1 binding 추가
3. OAuth 및 세션 구현
4. 후기 CRUD와 도움돼요 구현
5. Worker 회귀 테스트와 브라우저 E2E 검증
6. 명시적 승인 후에만 원격 D1 적용·KV seed·배포

# 액터 × 테이블 권한 표 (C/R/U/D)

> `DB.pdf` 안에 ERD 그림·테이블 정의서와 함께 넣는다. GRANT SQL은 제출물이 아니다.
> "본인 행"은 로그인한 사용자 자신의 행만 대상이라는 뜻이다.
> 사람 액터는 **게스트·회원 둘뿐**이다. 문의는 외부 폼(Google Form)이 접수하므로 이 표에 없다. 지표 테이블(`region_metrics`, `region_scores`)은 정기 배치가 갱신하고 사용자는 읽기만 한다.

| 테이블 | 게스트(비로그인) | 회원 | 비고 |
|---|---|---|---|
| users | — | C(최초 로그인 시 자동) / R(본인) / U(닉네임) | 소셜 로그인만 사용. 제공자 토큰은 저장·반환하지 않고 식별자와 닉네임만 둔다 (REQ-NFN-003, 004) |
| regions | R | R | 행정동 마스터 |
| region_metrics | R | R | 동 상세의 원지표·백분위 표. 배치가 갱신 |
| region_scores | R | R | 등급·축 점수. 배치가 갱신 |
| subway_lines / subway_stations / line_stations | R | R | 노선도 표시·통근 경로 |
| destinations | C / R | C / R | 목적지 검색 결과 캐시 |
| reviews | R | C / R / U(본인) / D(본인) | 타인 행 U·D는 403, 같은 동 두 번째 C는 409 |
| review_helpfuls | — | C / R / D(본인) | 1인 1회, 중복 C는 409 |

## 무결성 규칙 요약

- `reviews(user_id, region_code)` UNIQUE — 한 사용자는 한 동에 후기 1건 (409)
- `review_helpfuls(user_id, review_id)` PK — 도움돼요 1인 1회 (409)
- `users(provider, provider_user_id)` UNIQUE — 같은 소셜 계정으로 중복 가입되지 않는다
- `users.nickname` UNIQUE — 후기에 표시되는 이름이 겹치지 않는다
- `region_metrics.region_code` · `region_scores.region_code` 는 `regions.code` 와 1:1
- `line_stations(line_id, seq)` UNIQUE — 한 노선 안에서 순번이 겹치지 않는다
- `reviews.destination_id` 는 NULL 허용 — 통근 목적지를 밝히지 않은 후기도 남길 수 있다

# 직접 돌리고 배포하기

← [README](../README.md)

## API 키

`DATA_GO_KR_KEY` 는 **필수**입니다 — 편의 축(편의점·음식점·의료), 치안 축의
유흥업소, 가격 축이 이 키로 받는 데이터로 계산됩니다. Kakao 키는 없어도
동작하며, 지오코딩이 지하철역 이름 검색으로만 동작합니다.

> **공공데이터포털은 API마다 따로 활용신청해야 합니다.** 같은 계정·같은 키라도
> 그렇습니다. 신청 안 된 API를 부르면 `SERVICE_KEY_IS_NOT_REGISTERED_ERROR`
> ("등록되지 않은 서비스키")가 오는데, 이건 URL이 틀렸다는 뜻이 아니라 그 API만
> 승인이 안 됐다는 뜻입니다.

### 1. 공공데이터포털 — 상가업소 + 실거래가 + 경기 버스

[공공데이터포털](https://www.data.go.kr/)에서 아래 API를 활용신청합니다.

- [소상공인시장진흥공단_상가(상권)정보_API](https://www.data.go.kr/data/15012005/openapi.do) — 편의·음식·의료·유흥업소 지표 (자동승인)
- 국토교통부_단독/다가구 전월세 실거래가 자료
- [국토교통부_연립다세대 전월세 실거래자료](https://www.data.go.kr/data/15126473/openapi.do)
- 국토교통부_오피스텔 전월세 실거래가 자료
- 국토교통부_아파트 전월세 실거래가 자료
- 경기도 버스 기반정보(노선·경유정류소)

실거래가 쪽은 승인에 최대 24시간이 걸릴 수 있습니다. 상가업소는 자동승인입니다.

**인증키는 "Decoding" 값을 쓰세요.** 포털은 인증키를 두 형태로 주는데,
`%2B`·`%3D` 가 들어간 Encoding 값을 넣으면 스크립트가 다시 URL 인코딩해서
이중 인코딩이 되고 전부 인증에 실패합니다.

### 2. 서울 열린데이터광장 — 서울 버스 경유정류소

계정 키 하나로 `busRteInfo`를 조회합니다. `.env`의 `SEOUL_OPEN_DATA_KEY`에
넣습니다. 경기 BMS 노선 경유정류소 CSV와 SGIS 100m 인구 CSV 3개는 로그인 후
수동 다운로드한 원본을 사용하며 Git에는 넣지 않습니다. 저장 위치는 각각
`data/raw/BMS_info.csv`, `data/raw/_census_reqdoc_1786503689774/`입니다.
`data:population`이 만드는 대상 지역 100m 스냅샷도 로컬 중간물로만 두고,
Git에는 `data:access`가 만든 동별 최대 24개 집약 프로필만 포함합니다. 운영 결과가
완성되면 신청 동의조건에 따라 출처를 표시하고 SGIS에 운영 URL 사본을 제출합니다.

월세는 서울 열린데이터광장의 연도별 전월세가 ZIP을 수동으로 내려받아 다음 이름으로
둡니다. 세 파일이 모두 있어야 `data:metrics`가 실행됩니다.

```text
data/raw/seoul_rent/seoul_rent_2023.zip
data/raw/seoul_rent/seoul_rent_2024.zip
data/raw/seoul_rent/seoul_rent_2025.zip
```

### 3. Kakao Local — 자유 주소·장소 검색

[Kakao Developers](https://developers.kakao.com/)에서 앱 생성 → REST API 키.
월 300만 호출 무료이며 **회사명·학교명 키워드 검색**을 지원합니다
("삼성전자 서초사옥", "SK AX").

**키 발급만으로는 안 되고 서비스를 켜야 합니다.** 내 애플리케이션 → 제품 설정 →
**카카오맵 → 활성화 설정 ON**. 안 켜면 이런 응답이 옵니다.

```json
{ "errorType": "NotAuthorizedError",
  "message": "App(...) disabled OPEN_MAP_AND_LOCAL service." }
```

키가 없거나 결과가 비면 Worker가 **지하철역 이름 검색으로 폴백**합니다.

### 적용

```bash
# 파이프라인 — .env 파일에 넣으면 스크립트가 읽습니다 (.gitignore 로 제외됨)
cp .env.example .env      # DATA_GO_KR_KEY 를 채우세요
# 이어지는 "파이프라인" 절의 순서대로 원천·산출물을 생성하세요

# Worker — 절대 코드나 설정 파일에 넣지 마세요
npx wrangler secret put KAKAO_REST_KEY
```

---

## 파이프라인

```bash
npm install

# 1) 행정동 경계 (전국 34MB → 서울만 추출)
curl -L "https://raw.githubusercontent.com/vuski/admdongkor/master/ver20260701/HangJeongDong_ver20260701.geojson" \
  -o data/raw/hangjeongdong_20260701.geojson
npm run data:boundaries

# 2) 지하철 그래프 (OpenStreetMap, 키 불필요)
npm run data:subway

# 3) SGIS 100m 인구 원본 → 로컬 전용 대상 547개 동 스냅샷
npm run data:population

# 4) 서울·경기 공식 버스 노선 → 정적 버스망
npm run data:bus

# 5) 동별 원지표 (서울 월세 ZIP 3개 + 경기 월세 4종 API 키 필요)
npm run data:metrics

# 기존 지표는 유지하고 100m 최근접역 값만 갱신할 때
npm run data:metric-access

# 6) 100m 분포 → 동별 최대 24개 도보·버스 역 접근 프로필
npm run data:access

# 7) 정규화 + 등급 + 앱 번들
npm run data:score
```

`data/raw/`에는 API 캐시와 수동 원본이 함께 있습니다. API 캐시는 지우고 재실행하면
다시 받지만, `seoul_rent` ZIP 등 수동 원본은 삭제하면 직접 다시 내려받아야 합니다.

**대상 지역을 바꿀 때는 지울 필요가 없습니다.** 상가업소(`sbiz-stores.json`)와
OSM POI(`osm-poi.json`) 캐시에는 "어떤 범위로 받았는지"(`guCodes` · `bbox`)가
함께 저장되어 있어, 요청 범위가 달라지면 자동으로 버리고 다시 받습니다.
옛 캐시를 그대로 쓰면 새 지역 지표가 전부 0 이 되면서도 파이프라인이 성공해
버리기 때문에 넣은 장치입니다.

`3-metrics.mjs` 는 산출물을 저장하기 전 **자치구별로 핵심 지표가 통째로 비었는지**
확인하고, 한 구라도 전멸이면 종료 코드 1 로 중단합니다.

각 스크립트는 **자체 검증을 내장**하고 있으며 실패 시 종료 코드 1을 반환합니다.
총면적이 서울 실면적(605.2 km²)과 30km² 이상 차이 나면 투영 설정 오류로 보고
중단하고, 알려진 환승역(대림 2↔7 등)이 끊겨 있으면 역명 정규화 오류로 보고
중단합니다.

### 실거래가는 천천히 받아야 합니다

`3-metrics.mjs` 는 실거래가를 **동시 요청 2개 + 요청 간 120ms + 지수 백오프
재시도**로 받습니다. 동시 요청 6개로 돌렸더니 약 110건째부터 600건 끝까지 전부
속도 제한에 걸렸습니다(당시 2개 엔드포인트 기준).

지금은 경기 9개 구 × 36개월 × 4개 유형 = **1,296개 조회 작업**입니다. 1,000건을
넘는 응답은 다음 페이지도 받아 이번 실측은 1,424회 호출, 약 3분이 걸렸습니다.
활용신청이 안 된 엔드포인트가 섞이면 재시도 백오프
때문에 훨씬 오래 걸립니다.

---

## 실행

```bash
npm run cf:dev   # Worker + 정적자산 통합 → http://localhost:8787 (실환경에 가장 가까움)
npm test         # 회귀 테스트
npm run typecheck
```

`npm run dev` (Vite, HMR)로 따로 띄우면 `/api` 는 8787의 `wrangler dev` 로
프록시됩니다. UI를 고칠 때는 이쪽이 편합니다.

---

## 배포

```bash
# 1) KV 네임스페이스 생성 → 출력된 id를 wrangler.jsonc 에 반영
npx wrangler kv namespace create ONEDAY_KV

# 2) 지오코딩 키 등록
npx wrangler secret put KAKAO_REST_KEY

# 3) 데이터 스냅샷을 KV에 먼저 업로드
npm run data:seed

# 4) 검증된 같은 커밋의 Worker·정적자산 배포
npm run cf:deploy
```

`/api/data`는 KV에 스냅샷이 있으면 그걸, 없으면 정적 자산을 서빙합니다(응답
헤더 `X-Oneday-Source`로 확인). 기술적으로 KV만 바꿀 수 있지만, 이 저장소의
운영 절차는 코드·정적 번들과 KV의 버전 어긋남을 막기 위해 매 배포마다
**`data:seed` → `cf:deploy`** 순서를 사용합니다. 둘 다 원격 변경이므로 현재 SHA와
clean 상태를 확인하고 사용자 승인을 새로 받은 뒤 실행합니다.

> 반대로, **번들을 바꿨으면 `npm run data:seed` 를 잊지 마세요.** `/api/data` 는
> KV를 먼저 보므로 시드하지 않으면 배포해도 옛 데이터가 나갑니다.

Worker 이름(`wrangler.jsonc` 의 `name`)이 곧 workers.dev 주소가 됩니다. 주소에서
계정 식별자를 빼려면 Cloudflare 대시보드 → Workers & Pages → Subdomain 에서
계정 서브도메인을 바꾸면 되고, Worker 쪽은 아무것도 건드릴 필요가 없습니다.

### 배경지도 교체 (선택)

기본값은 CARTO 무료 베이스맵으로 키가 필요 없습니다. 한국어 라벨 품질을 올리려면
[VWorld](https://www.vworld.kr/dev/v4api.do) 인증키를 발급받아 도메인을 등록하고
`src/components/MapView.tsx` 의 `BASE_STYLE` 을 교체하세요.

---

## 코드 구조

```
src/
  lib/
    dijkstra.ts      다중 출발점 최단경로 (이진 힙) + 경로 복원용 prev
    bus.ts           같은 방향 직행 버스의 첫·마지막 접근시간
    commute.ts       100m 거주분포 → 동별 통근시간, 선택된 동의 경로 복원
    score.ts         가중합 + 상대 컷 등급화 (등급 컷 점수도 함께 반환)
    explain.ts       분포 통계 · 요약 문장 · 계산 과정 — "왜 이 등급인지"
    subwayLines.ts   노선 색 + 노선도 GeoJSON 생성
    shareUrl.ts      화면 상태 ↔ URL 직렬화
    geo.ts           haversine, 최근접역 탐색
    constants.ts     통근 모델 상수 (수정 시 테스트 필수)
  components/
    MapView.tsx      MapLibre — 지오메트리 고정 + feature-state 로 등급만 갱신
    Landing.tsx      첫 방문 소개 페이지 (+ Landing.css, WeightPlayground.tsx)
    DongDetail.tsx   요약 · 통근 경로 · 접이식 계산 과정
    DestinationSearch.tsx / TopPicks.tsx
worker/
  index.ts           지오코딩 프록시(키 은닉) + 데이터 스냅샷 서빙
scripts/
  prepare-population-grid.mjs  SGIS 100m 인구를 행정동에 배정
  prepare-bus-network.mjs      서울·경기 노선·정류장·거리를 정규화
  6-bus-access.mjs             100m 분포를 동별 대표 역 접근 프로필로 집약
  1-boundaries.mjs → 2-subway.mjs → 3-metrics.mjs → 4-score.mjs → 5-seed-kv.mjs
```

### 지도 레이어 순서

아래에서 위로 이렇게 쌓입니다. 지하철은 **등급 아이콘 아래**에 깝니다 — 주인공은
등급이고 지하철은 그걸 설명하는 배경이라, 역 점이 등급 아이콘을 가리면 주 기능이
손상됩니다.

```
dong-fill → dong-outline → subway-line → subway-hit → subway-station
→ dong-icon → dong-label → route-line-casing → route-walk-line → route-bus-line → route-line
→ subway-label → dest-marker
```

`subway-hit` 은 투명한 두꺼운 선입니다. 실제 노선은 줌 10에서 1.2px 라 커서로
맞히는 게 사실상 불가능해서, hover 판정만 여기서 받습니다.

`route-line-casing` 은 경로선 아래 깔리는 배경색 테두리입니다. 1호선 남색처럼
어두운 노선색과 파란 경로 점선이 겹치면 안 보이는 문제 때문에 추가했습니다.

경로선이 **세 레이어로 갈려 있습니다**(`route-walk-line` = 도보,
`route-bus-line` = 버스, `route-line` = 지하철). MapLibre의 `line-dasharray`는
data-driven 표현식을 못 받아서 한 레이어 안에서 점선 모양을 구간별로 다르게
줄 수 없기 때문입니다.

### 테마를 바꾸면 레이어가 전부 날아갑니다

`setStyle` 로 배경지도를 갈아끼우면 **MapLibre 가 커스텀 소스·레이어를 보존하지
않습니다.** 위 레이어들과 소스 6개가 전부 사라지므로 `installLayers()` 로 다시
설치하고, `feature-state` 도 함께 날아가므로 `styleEpoch` 카운터로 상태 반영
effect 들을 재실행시킵니다. **지도에 레이어를 추가하면 이 두 곳도 같이
손봐야 합니다.**

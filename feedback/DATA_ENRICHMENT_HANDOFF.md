# 데이터 보강 조사 핸드오프

> Claude에게 전달하는 조사·설계 문서입니다. 2026-08-11(KST) 기준으로 공식 서울시·공공데이터·국가통계·교통·민간 API 페이지를 확인했습니다. 이 문서는 조사 결과와 권장 설계를 전달하기 위한 것이며, 아직 애플리케이션 코드나 데이터 파이프라인을 수정하지 않았습니다.

## 0. 한 줄 결론

현재 프로젝트의 정적 서울 동네 추천 점수에 가장 먼저 추가할 데이터는 SK Geovision이 아니라 서울시 `우리마을가게 상권분석서비스`입니다.

현재 OSM 데이터는 장소가 존재하는지와 대략적인 개수를 보여주지만, 다음 질문에는 답하지 못합니다.

- 실제로 상권이 활발한가?
- 사람들이 많이 방문하는가?
- 매출과 점포 수가 증가하는가?
- 거주인구·직장인구·유동인구 중 어떤 수요가 있는가?

서울시 상권분석서비스는 점포, 추정매출, 유동인구, 거주인구, 직장인구, 집객시설, 상권 변화지표를 행정동·상권·배후지 단위로 제공하므로 현재 프로젝트의 가장 큰 데이터 공백을 채웁니다.

SK Geovision은 통신 기반 방문자·혼잡도·유입력 등의 보조 지표가 필요할 때만 공식 API로 검토합니다. Puzzle 지도 화면 크롤링은 구현하지 않습니다.

## 1. 현재 프로젝트에서 이미 사용하는 데이터

확인 파일:

- [README.md](./README.md)
- [scripts/3-metrics.mjs](./scripts/3-metrics.mjs)

현재 프로젝트는 서울시 427개 행정동의 안전·가격·편의 점수를 계산하는 정적 파이프라인입니다.

| 현재 소스 | 현재 역할 |
| --- | --- |
| OpenStreetMap/Overpass | 편의점·마트, 음식점, 병원·약국, 유흥, 버스정류장 등 POI 집계 |
| OSM 지하철·보행 그래프 | 역 접근성과 도보 시간 계산 |
| 경찰 범죄 CSV | 구 단위 안전 지표 |
| 교통사고 CSV | 사고 hotspot 기반 안전 지표 |
| 국토부 임대·실거래 데이터 | 가격 지표 |
| 인구 CSV | 일부 안전 지표 정규화 |

현재 저장소에서 서울시 상권분석정보·Geovision 데이터 파일은 사용 중인 것으로 확인되지 않았습니다. 따라서 서울시 상권분석정보를 추가하는 것은 새로운 데이터 소스를 추가하는 일입니다.

단, OSM의 점포 수와 새 공공데이터의 점포 수처럼 의미가 겹치는 필드는 있습니다. 같은 시설을 단순 합산하면 안 됩니다.

## 2. 우선순위 데이터 목록

| 우선순위 | 데이터 | 추가되는 정보 | 공간·시간 특성 | 적용 판단 |
| --- | --- | --- | --- | --- |
| P0 | [서울시 우리마을가게 소개](https://golmok.seoul.go.kr/introduce.do), [상권분석 데이터 목록](https://data.seoul.go.kr/dataList/3/literacyView.do) | 점포 수, 추정매출, 유동·거주·직장인구, 집객시설, 상권변화 | 행정동·상권·배후지, 분기 | 상권활력 핵심 |
| P0 | [서울시 점포-행정동 API](https://data.seoul.go.kr/dataList/OA-22172/A/1/datasetView.do) | 업종별 총점포·일반점포·프랜차이즈, 개업·폐업·변화 | 행정동, 분기 | 427개 동과 직접 결합 |
| P0 | [소상공인시장진흥공단 상가업소 API](https://www.data.go.kr/data/15012005/openapi.do) | 영업 중 업소명·업종·주소·경도·위도 | 전국, 업소 좌표 | OSM 검증·대체 |
| P0 | [HIRA 병원 API](https://www.data.go.kr/data/15001698/openapi.do), [약국 API](https://www.data.go.kr/data/15001673/openapi.do) | 공식 등록 병원·약국 위치·시설·진료 정보 | 시설 좌표, 원천 주기 확인 필요 | 의료 POI 보강 |
| P0 | [서울 교통 데이터 카탈로그](https://data.seoul.go.kr/dataList/7/literacyView.do), [지하철 일별 승하차](https://data.seoul.go.kr/dataList/OA-12914/A/1/datasetView.do) | 역·정류장 승하차량, 시간대 이용량, 버스 노선 | 역·정류장, 일·시간 | 교통 수요 추가 |
| P0 | [서울 보행자 도로 네트워크](https://www.data.go.kr/data/15098156/openapi.do) | 보행 링크·노드·교차로·횡단보도·역 출입구 | 공간 네트워크 | OSM 도보 계산 보강 |
| P1 | [도로교통공단 사고 API](https://www.data.go.kr/dataset/15003493/openapi.do?lang=ko) | 어린이·고령자·보행자·자전거 사고 유형 | hotspot·지역별 | 기존 사고 지표 세분화 |
| P1 | [전국 CCTV API](https://www.data.go.kr/data/15155042/openapi.do), [서울시 CCTV](https://data.seoul.go.kr/bsp/wgs/dataView/data300View/509.do) | 설치 위치·목적·카메라 수·설치일 | 시설 좌표 | 안전 인프라 설명용 |
| P1 | [공중화장실 API](https://www.data.go.kr/data/15155058/openapi.do) | 화장실 유형·편의시설·개방시간 | 주소 기반, 일부 좌표 누락 | 생활 편의 |
| P1 | [서울 장애인편의시설](https://data.seoul.go.kr/dataList/OA-23030/S/1/datasetView.do), [지하철 장애인 편의시설](https://www.data.go.kr/data/15143843/openapi.do) | 경사로·엘리베이터·점자·장애인 주차 등 | 시설·역 단위 | 무장애 편의 |
| P1 | [전국 어린이집 API](https://www.data.go.kr/data/15101155/openapi.do), [어린이집 상세 API](https://www.data.go.kr/data/15101154/openapi.do) | 정원·현원·입소대기·서비스·위치 | 시설 좌표 | 가족형 추천 |
| P1 | [KOSIS OpenAPI](https://kosis.kr/openapi/index/index.jsp), [SGIS 주요 API](https://sgis.mods.go.kr/developer/html/newOpenApi/api/dataApi/introMajorApi.html) | 연령·가구·인구·사업체·생활업종 | 표·지역별, 테이블마다 다름 | 수요 분모·사용자 유형 |
| P1 | [국토부 아파트 매매 API](https://www.data.go.kr/data/15126469/openapi.do), [K-APT 기본정보](https://www.data.go.kr/data/15058453/openapi.do) | 매매가·세대수·주택 유형·시설·주거 품질 | 법정동·단지 | 주거비 보조 |
| P2 | [K-APT 관리비](https://www.data.go.kr/data/15059469/openapi.do), [에너지 사용량](https://www.data.go.kr/data/15012964/openapi.do), [건축물 공간정보](https://www.data.go.kr/data/15123970/openapi.do) | 관리비·에너지·노후도·주차·건물 구조 | 단지·건물 | 주거 품질 확장 |
| P2 | [서울 공공자전거 카탈로그](https://data.seoul.go.kr/dataList/5/literacyView.do), [서울 공영주차장 API](https://data.seoul.go.kr/dataList/OA-21709/A/1/datasetView.do) | 대여소·이용량·주차면·요금·운영시간 | 시설·일·월 | 사용자 세그먼트용 |
| P2 | [서울 대기질 API](https://data.seoul.go.kr/dataList/OA-1200/A/1/datasetView.do), [실내 공공공간](https://data.seoul.go.kr/dataList/OA-23015/S/1/datasetView.do) | 미세먼지·대기질·휴식 공간 | 대기질은 구 단위, 시설은 좌표 | 보조 정보 |

## 3. 반드시 먼저 구현할 것

### 3.1 상권활력도

서울시 상권분석정보에서 우선 검토할 필드:

```text
commercial_strength =
  업종별 점포 밀도
  + 인구 대비 추정매출
  + 최근 4~6분기 매출 변화
  + 개업률 - 폐업률
  + 유동인구 / 거주인구
  + 직장인구 기반 평일 수요
```

처음부터 최종 점수에 바로 합산하지 말고, 별도의 `상권활력도` 원천 지표로 만든 후 기존 편의 점수와 상관관계·결측률·분기 안정성을 확인합니다.

### 3.2 교통 이용성

현재 정류장 개수와 역까지의 거리만으로는 실제 이동 편의성을 충분히 설명하지 못합니다.

추가 후보:

- 역·정류장까지 실제 보행시간
- 지하철 승하차량
- 주변 버스 노선 수
- 정류장별 승하차량
- 환승 가능한 노선 수
- 첫차·막차
- 역의 엘리베이터·경사로 등 접근성

구분해야 하는 개념:

```text
역까지 가까움 = 접근성
승하차량이 많음 = 실제 이용 수요
노선이 많음 = 이동 선택권
```

### 3.3 공식 POI 검증

OSM을 바로 삭제할 필요는 없습니다. 다음처럼 역할을 나눕니다.

| 데이터 | 권장 역할 |
| --- | --- |
| OSM | 지도 표시·보행 네트워크·장소 접근성 |
| 소상공인 API | 영업 중 업소와 업종별 공식 집계 |
| HIRA | 병원·약국 공식 기준 |
| 서울시 상권분석 | 점포 변화·매출·유동·상권활력 |

OSM 점포 수, 소상공인 점포 수, 서울시 점포 수를 합산하지 말고 커버리지 비교표를 먼저 만듭니다.

## 4. 중복 데이터와 새로운 데이터 구분

| 비교 | 판단 |
| --- | --- |
| OSM 점포 vs 소상공인 API | 같은 시설이 많이 겹침. 소상공인 API를 검증·대체 소스로 사용 |
| OSM 점포 vs 서울시 상권분석 | 점포 수는 겹치지만 매출·유동·개폐업은 새로운 정보 |
| OSM 병원 vs HIRA | 같은 시설일 수 있음. HIRA를 공식 기준으로 사용 |
| 지하철 거리 vs 승하차량 | 서로 다른 정보. 접근성과 실제 수요 |
| 버스정류장 수 vs 버스 노선 수 | 노선 수가 이동 선택권에 더 가까움 |
| 서울 생활인구 vs Geovision 유동인구 | 수요 신호가 겹칠 수 있음. 하나를 주력으로 선택 |
| 범죄 vs CCTV·가로등 | 범죄 결과와 안전 인프라. 동일 지표처럼 합산하지 않음 |
| 월세 vs 매매가·관리비 | 주거비의 서로 다른 구성요소 |

## 5. 안전·가족·응급의료 보강

안전 결과와 안전 인프라를 분리합니다.

```text
안전 결과:
  기존 범죄 + 교통사고 유형별 발생

안전 인프라:
  CCTV + 가로등 + AED + 응급의료 접근성
```

CCTV나 가로등이 많다고 실제 범죄가 적다고 단정하지 않습니다. 인프라 데이터는 낮은 가중치 또는 설명용으로 두는 것이 안전합니다.

추가 후보:

- [전국 자동심장충격기 API](https://www.data.go.kr/data/15021103/standard.do?recommendDataYn=Y)
- [전국 응급의료기관 API](https://www.data.go.kr/data/15096291/standard.do)
- [전국 초중등학교 위치](https://www.data.go.kr/data/15021148/standard.do)
- [서울 공공서비스 예약 API](https://www.data.go.kr/data/15134352/openapi.do)

어린이집은 단순 개수보다 다음 지표가 좋습니다.

```text
어린이집 정원
영유아 인구 대비 정원
입소 대기 아동 수
초등학교까지 도보거리
```

## 6. 인구 데이터 주의사항

KOSIS와 SGIS는 연령·가구·인구·사업체·생활업종의 분모와 사용자 유형을 만드는 데 유용합니다.

서울시 생활인구 API는 유용한 데이터지만, 기존 생활인구 생산 중단 및 2026년 7월 이후 서비스 재편 안내가 있습니다. [서울시 변경 안내](https://data.seoul.go.kr/together/notice/boardView.do?seq=721010a1522630fbf7a78d381a8326ee)

따라서 신규 파이프라인의 핵심 의존성으로 고정하지 않습니다. 사용하더라도 특정 기준일의 과거 스냅샷으로 저장하고, 기준일과 서비스 상태를 기록합니다.

## 7. 주거비·주거 품질 주의사항

기존 임대료에 다음을 선택적으로 추가할 수 있습니다.

- 아파트 매매 실거래가
- 세대 수와 주거 유형
- 아파트 노후도
- 관리비·에너지 비용
- 주차대수
- 건축물 용도·연식·밀도

하지만 다음을 구분해야 합니다.

- 월세와 매매가는 같은 지표가 아님
- K-APT는 아파트 중심이라 전체 동네의 주거 품질을 대표하지 않을 수 있음
- 국토부·K-APT는 법정동 기준인 경우가 많아 현재 행정동 427개와 직접 이름 조인하면 안 됨
- 법정동·행정동·상권·배후지·구 단위를 코드 또는 공간조인으로 변환해야 함

## 8. 실시간 데이터는 핵심 점수에서 제외

현재 요구는 실시간 데이터가 아니라 지역의 상권·편의 정도를 비교하는 것입니다. 다음은 정적 점수의 핵심 데이터로 사용하지 않습니다.

- 서울 실시간 도시데이터: 약 120여 개 주요 장소 중심이며 427개 행정동 전체와 공간 범위가 맞지 않음. [공식 페이지](https://data.seoul.go.kr/dataList/OA-21285/A/1/datasetView.do)
- 버스 도착·차량 위치
- 현재 주차 가능면
- 현재 EV 충전기 상태
- 현재 날씨·실시간 혼잡도
- SK Geovision 실시간 혼잡 API

이 데이터들은 나중에 지도 화면의 현재 상태 표시나 별도 필터로 추가할 수 있습니다.

## 9. Geovision과 Puzzle에 대한 경계

사용자가 제시한 URL:

```text
https://puzzle.geovision.co.kr/map?lat=37.36920220581427&lng=127.11057186126752&zoom=14&poiId=222&poiType=subway&overlayType=FP
```

이 URL의 지도 화면을 반복 요청해 HTML·JSON·네트워크 응답을 수집하는 구현은 하지 않습니다.

[Puzzle 이용약관](https://puzzle.geovision.co.kr/terms)에서 콘텐츠의 무단 복사·수집·다운로드·색인·저장·캐시와 유사 서비스 제작에 관한 제한을 확인했습니다. “실시간이 아니면 가능하다”거나 “브라우저에 보이므로 가져와도 된다”고 가정하지 않습니다.

Geovision이 필요하다면 [SK Open API 상품 목록](https://openapi.sk.com/content/API)의 공식 API만 검토합니다.

공개 상품 페이지에서 후보로 확인한 상품:

- [장소 혼잡도](https://openapi.sk.com/products/detail?svcSeq=56)
- [주거생활](https://openapi.sk.com/products/detail?svcSeq=66)
- [지하철](https://openapi.sk.com/products/detail?linkMenuSeq=418)
- [음식점](https://openapi.sk.com/products/detail?svcSeq=69)
- [학원](https://openapi.sk.com/products/detail?svcSeq=70)
- [국내여행](https://openapi.sk.com/products/detail?svcSeq=57)

무료 한도는 상품·API 그룹별로 확인해야 합니다. 공개 요금 페이지에 Free 한도가 표시되더라도 다음을 별도로 확인하기 전에는 대량 배치 수집을 전제하지 않습니다.

- 10건/월 한도의 공유 범위
- API 그룹별 독립 여부
- 승인·활성화 절차
- 통계와 실시간 API의 구분
- 응답 저장·캐시·재배포 조건
- 좌표·행정동·장소 ID 매핑 방식

## 10. 무료·공공데이터 중심의 권장 조합

```text
상권 활력:
  서울시 우리마을가게 상권분석서비스

시설 존재:
  소상공인 API + HIRA + 어린이집 + 공중화장실

교통:
  지하철/버스 승하차량 + 노선 수 + 서울 보행 네트워크

안전:
  기존 범죄 + 사고 유형별 데이터
  CCTV/AED/가로등은 별도 인프라 지표

주거:
  기존 임대료 + 선택적 매매가/K-APT

지도·경로:
  OSM 또는 서울 공식 보행 네트워크

SK Geovision:
  핵심 데이터가 아니라 통계 수요 보조 지표
```

## 11. 구현 순서

1. 서울시 상권분석정보의 행정동·분기 필드와 샘플 응답을 확인합니다.
2. 최근 4~6개 분기 데이터를 별도 raw/processed 데이터로 저장합니다.
3. `commercial_strength` 후보 지표를 만들고 결측률·분기 안정성·기존 점수와의 중복을 확인합니다.
4. 소상공인 API와 HIRA를 이용해 OSM POI 커버리지를 비교합니다.
5. 지하철 승하차량·버스 노선 수·공식 보행 네트워크를 추가합니다.
6. 사고 유형·AED·장애인시설·어린이집을 별도 세부지표로 추가합니다.
7. 검증이 끝난 뒤에만 기존 안전·가격·편의 가중치 변경을 제안합니다.

각 원천 데이터에 다음 메타데이터를 저장합니다.

```text
source
dataset_id
as_of_date
retrieved_at
spatial_resolution
license
missing_rate
```

## 12. Claude가 구현 전에 확인할 것

1. 서울시 상권분석서비스의 실제 필드명, 분기 코드, 행정동 코드, 최신 기준일을 확인합니다.
2. 행정동·법정동·상권·배후지·구 단위의 변환 방식을 문서화합니다.
3. 같은 의미의 OSM·소상공인·서울시 점포 필드를 합산하지 않습니다.
4. 서울시 생활인구 API를 핵심 의존성으로 고정하지 않습니다.
5. SK Geovision은 공식 상품 페이지·가격 페이지·약관에 근거해 검토합니다.
6. Puzzle 지도 크롤링·스크래핑·네트워크 재현 코드는 작성하지 않습니다.
7. API 키를 브라우저 번들, `VITE_*` 환경변수, 공개 JSON에 넣지 않습니다.
8. 데이터 사용권·저장·캐시·재배포 조건을 확인하기 전에는 장기 캐시나 공개 배포를 구현하지 않습니다.
9. 먼저 데이터 사전과 샘플 검증을 완료한 뒤 코드 변경을 시작합니다.

## 13. 공식 API 공통 주의사항

[서울 열린데이터광장 OpenAPI 이용 안내](https://data.seoul.go.kr/together/guide/useGuide.do)에 따르면 인증키 신청과 서비스별 이용 조건·호출량 확인이 필요합니다. `무료` 표시는 무제한 호출이나 자유로운 재배포를 의미하지 않습니다.

OSM을 계속 사용할 경우 [OSM API 정책](https://operations.osmfoundation.org/policies/api/)과 [타일 정책](https://operations.osmfoundation.org/policies/tiles/)에 따라 반복적인 사용자별 실시간 Overpass 조회 대신 캐시·추출본·자체 저장을 사용합니다.

이번 문서는 조사·핸드오프 목적이며, 기존 코드·데이터·`CLAUDE.md`·`CODE_REVIEW.md`·`GEOVISION_HANDOFF.md`는 수정하지 않았습니다.

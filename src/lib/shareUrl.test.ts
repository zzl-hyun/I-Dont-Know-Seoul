import { describe, it, expect } from "vitest";
import {
  DEFAULT_SHARE_STATE,
  decodeShareState,
  encodeShareState,
  type ShareState,
} from "./shareUrl";
import { BUDGET_OFF, MAX_DESTINATIONS } from "./constants";

const sample: ShareState = {
  destinations: [
    { name: "강남역", address: "2 · 신분당", lat: 37.497522, lng: 127.027783 },
    { name: "여의도역", address: "9 · 5", lat: 37.521624, lng: 126.924191 },
  ],
  maxCommute: 55,
  weights: { safety: 0.2, price: 0.5, convenience: 0.3 },
  budget: 65,
  mapMode: "commute",
  showSubway: false,
  hiddenLines: ["2", "신분당"],
  rentTypes: ["apartment", "house"],
  rentMode: "raw",
};

describe("URL 왕복", () => {
  it("인코딩 → 디코딩하면 같은 상태가 나온다", () => {
    const back = decodeShareState(encodeShareState(sample));

    expect(back.destinations).toHaveLength(2);
    back.destinations.forEach((d, i) => {
      expect(d.name).toBe(sample.destinations[i].name);
      // 좌표는 소수 5자리로 잘라 싣는다 (약 1m)
      expect(d.lat).toBeCloseTo(sample.destinations[i].lat, 4);
      expect(d.lng).toBeCloseTo(sample.destinations[i].lng, 4);
    });

    expect(back.maxCommute).toBe(sample.maxCommute);
    expect(back.budget).toBe(sample.budget);
    expect(back.mapMode).toBe(sample.mapMode);
    expect(back.showSubway).toBe(sample.showSubway);
    expect(back.hiddenLines).toEqual(sample.hiddenLines);
    // 입력 순서(apartment, house)와 무관하게 정렬된 순서(house, apartment)로 복원된다
    expect(back.rentTypes).toEqual(["house", "apartment"]);
    expect(back.rentMode).toBe(sample.rentMode);

    for (const k of ["safety", "price", "convenience"] as const) {
      expect(back.weights[k]).toBeCloseTo(sample.weights[k], 2);
    }
  });

  it("기본값은 URL 에 싣지 않는다", () => {
    // 기본 상태로 공유해도 링크가 지저분해지면 안 된다
    expect(encodeShareState(DEFAULT_SHARE_STATE)).toBe("");
  });

  it("빈 쿼리는 기본 상태가 된다", () => {
    const s = decodeShareState("");
    expect(s.destinations).toEqual([]);
    expect(s.maxCommute).toBe(DEFAULT_SHARE_STATE.maxCommute);
    expect(s.maxCommute).toBe(90);
    expect(s.budget).toBe(BUDGET_OFF);
    expect(s.mapMode).toBe("grade");
    expect(s.showSubway).toBe(true);
    expect(s.rentTypes).toEqual(["house"]);
    expect(s.rentMode).toBe("converted");
  });

  it("기존 공유 링크가 max=40을 명시하면 새 기본값과 무관하게 40분을 복원한다", () => {
    const s = decodeShareState("max=40");
    expect(s.maxCommute).toBe(40);
    expect(encodeShareState(s)).toContain("max=40");
  });
});

describe("월세 기준 (rentTypes / rentMode)", () => {
  it("화면 기본 선택(단독·다가구 + converted)은 URL에 안 싣는다", () => {
    expect(encodeShareState(DEFAULT_SHARE_STATE)).not.toContain("rentTypes");
    expect(encodeShareState(DEFAULT_SHARE_STATE)).not.toContain("rentMode");
  });

  it("기존 3종 환산월세 선택은 URL에 명시해 왕복한다", () => {
    const s: ShareState = {
      ...DEFAULT_SHARE_STATE,
      rentTypes: ["officetel", "house", "apartment"],
    };
    const qs = encodeShareState(s);
    expect(qs).toContain("rentTypes=");
    expect(qs).not.toContain("rentMode");
    expect(decodeShareState(qs).rentTypes).toEqual(["house", "officetel", "apartment"]);
  });

  it("아파트만 골라 raw 모드로 공유하면 왕복된다", () => {
    const s: ShareState = { ...DEFAULT_SHARE_STATE, rentTypes: ["apartment"], rentMode: "raw" };
    const back = decodeShareState(encodeShareState(s));
    expect(back.rentTypes).toEqual(["apartment"]);
    expect(back.rentMode).toBe("raw");
  });

  it("연립·다세대를 포함한 조합도 정렬해 왕복한다", () => {
    const s: ShareState = {
      ...DEFAULT_SHARE_STATE,
      rentTypes: ["apartment", "rowhouse", "house"],
    };
    const back = decodeShareState(encodeShareState(s));
    expect(back.rentTypes).toEqual(["house", "rowhouse", "apartment"]);
  });

  it("존재하지 않는 유형이 섞이면 그 유형만 버리고 나머지로 복원한다", () => {
    const s = decodeShareState("rentTypes=house,villa,apartment");
    expect(s.rentTypes).toEqual(["house", "apartment"]);
  });

  it("전부 알 수 없는 유형이면(빈 배열이 되면) 기본값으로 되돌린다", () => {
    const s = decodeShareState("rentTypes=villa,studio");
    expect(s.rentTypes).toEqual(DEFAULT_SHARE_STATE.rentTypes);
  });

  it("알 수 없는 rentMode 값은 기본값(converted)으로 되돌린다", () => {
    const s = decodeShareState("rentMode=hack");
    expect(s.rentMode).toBe("converted");
  });
});

describe("이상한 입력을 걸러낸다", () => {
  it("서울 밖 좌표는 목적지로 받지 않는다", () => {
    // 링크 하나로 지도가 엉뚱한 데로 날아가면 안 된다
    const s = decodeShareState("to=뉴욕@40.7128,-74.006&to=강남역@37.4975,127.0278");
    expect(s.destinations).toHaveLength(1);
    expect(s.destinations[0].name).toBe("강남역");
  });

  it("좌표가 깨진 항목은 건너뛴다", () => {
    const s = decodeShareState("to=이상한거&to=@@&to=강남역@37.4975,127.0278");
    expect(s.destinations).toHaveLength(1);
  });

  it("범위를 벗어난 값은 기본값으로 되돌린다", () => {
    const s = decodeShareState("max=9999&budget=-5&mode=hack&w=0,0,0");
    expect(s.maxCommute).toBe(DEFAULT_SHARE_STATE.maxCommute);
    expect(s.budget).toBe(BUDGET_OFF);
    expect(s.mapMode).toBe("grade");
    expect(s.weights).toEqual(DEFAULT_SHARE_STATE.weights);
  });

  it(`목적지는 ${MAX_DESTINATIONS}개를 넘으면 잘린다`, () => {
    // UI(App.tsx)의 추가 버튼은 MAX_DESTINATIONS 에서 막히는데, URL
    // 디코더가 이걸 안 지키면 "to" 를 여러 개 넣은 링크로 그 상한을
    // 그냥 우회할 수 있다.
    const many = Array.from({ length: MAX_DESTINATIONS + 2 }, (_, i) => `to=목적지${i}@37.5,127.0`).join("&");
    const s = decodeShareState(many);
    expect(s.destinations).toHaveLength(MAX_DESTINATIONS);
    expect(s.destinations[0].name).toBe("목적지0");
    expect(s.destinations[MAX_DESTINATIONS - 1].name).toBe(`목적지${MAX_DESTINATIONS - 1}`);
  });

  it("가중치는 합이 1이 되도록 정규화한다", () => {
    const s = decodeShareState("w=50,30,20");
    const sum = s.weights.safety + s.weights.price + s.weights.convenience;
    expect(sum).toBeCloseTo(1, 5);
    expect(s.weights.safety).toBeCloseTo(0.5, 5);
  });
});

describe("이름에 특수문자가 있어도 복원된다", () => {
  it("@ 와 쉼표가 든 이름", () => {
    // 좌표를 마지막 @ 뒤에서 자르므로 이름에 @ 가 있어도 안전하다
    const s: ShareState = {
      ...DEFAULT_SHARE_STATE,
      destinations: [
        { name: "카페@강남, 2호점", address: "", lat: 37.4975, lng: 127.0278 },
      ],
    };
    const back = decodeShareState(encodeShareState(s));
    expect(back.destinations[0].name).toBe("카페@강남, 2호점");
  });
});

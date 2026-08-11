/**
 * 치안 축의 `유흥업소`로 분류할 소상공인 업종인지 판정한다.
 *
 * 생맥주 전문(I21103)과 요리 주점(I21104)은 일반 술집까지 치안 감점하는
 * 과잉 분류가 되므로 포함하지 않는다.
 */
export function isSbizNightlifeClass(code) {
  return code === "I21101" || code === "I21102";
}

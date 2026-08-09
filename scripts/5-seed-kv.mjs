/**
 * 5-seed-kv.mjs — 데이터 번들을 Cloudflare KV에 올린다.
 *
 * KV에 번들이 있으면 Worker가 그걸 우선 서빙한다. 즉 데이터만 갱신할 때는
 * 프론트를 다시 빌드·배포하지 않고 이 스크립트만 돌리면 된다.
 *
 * 사용법:
 *   npm run data:seed              # 원격 KV (배포용)
 *   npm run data:seed -- --local   # 로컬 wrangler dev용 KV
 *
 * 사전 준비:
 *   npx wrangler kv namespace create ONEDAY_KV
 *   → 출력된 id를 wrangler.jsonc 의 kv_namespaces[0].id 에 넣을 것
 */
import { readFile, stat } from "node:fs/promises";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const BUNDLE = join(ROOT, "public/data/bundle.json");
const CONFIG = join(ROOT, "wrangler.jsonc");
const KEY = "bundle:current";
const BINDING = "ONEDAY_KV";

const isLocal = process.argv.includes("--local");

async function main() {
  // 번들 유효성 먼저 확인 — 깨진 데이터를 올리면 사이트 전체가 죽는다
  let bundle;
  try {
    bundle = JSON.parse(await readFile(BUNDLE, "utf8"));
  } catch (err) {
    fail(
      `번들을 읽을 수 없습니다: ${BUNDLE}\n` +
        `  먼저 파이프라인을 실행하세요:\n` +
        `    npm run data:boundaries && npm run data:subway && npm run data:metrics && npm run data:score`
    );
  }

  const problems = [];
  if (!Array.isArray(bundle.dongs) || bundle.dongs.length < 400) {
    problems.push(`행정동 수 이상: ${bundle.dongs?.length}`);
  }
  if (!bundle.graph?.stations?.length) problems.push("지하철 그래프 없음");
  if (!bundle.scores || Object.keys(bundle.scores).length !== bundle.dongs?.length) {
    problems.push(
      `점수 개수 불일치: scores=${Object.keys(bundle.scores ?? {}).length} dongs=${bundle.dongs?.length}`
    );
  }
  if (problems.length) fail("번들 검증 실패:\n  - " + problems.join("\n  - "));

  // 네임스페이스 id 가 placeholder 인 채로 원격에 올리려 하면 미리 막는다
  if (!isLocal) {
    const cfg = await readFile(CONFIG, "utf8");
    if (cfg.includes("PLACEHOLDER_REPLACE_IN_M6")) {
      fail(
        `wrangler.jsonc 의 KV namespace id 가 아직 placeholder 입니다.\n` +
          `    npx wrangler kv namespace create ${BINDING}\n` +
          `  를 실행하고 출력된 id 로 교체한 뒤 다시 시도하세요.\n` +
          `  (로컬 개발용으로 올리려면 --local 을 붙이세요)`
      );
    }
  }

  const size = (await stat(BUNDLE)).size;
  console.log(`번들 ${(size / 1024).toFixed(0)} KB`);
  console.log(`  행정동 ${bundle.dongs.length}개 · 역 ${bundle.graph.stations.length}개`);
  console.log(`  데이터 버전: 경계 ${bundle.meta.boundaryVersion} · 지하철 ${bundle.meta.graphVersion} · 지표 ${bundle.meta.scoreVersion}`);
  if (bundle.meta.missingMetrics?.length) {
    console.log(`  미수집 지표: ${bundle.meta.missingMetrics.join(", ")}`);
  }

  // KV 값 상한은 25 MiB
  if (size > 25 * 1024 * 1024) fail(`번들이 KV 값 상한(25 MiB)을 초과합니다: ${size} bytes`);

  const args = [
    "wrangler", "kv", "key", "put", KEY,
    "--path", BUNDLE,
    "--binding", BINDING,
    isLocal ? "--local" : "--remote",
  ];
  console.log(`\n$ npx ${args.join(" ")}`);
  const res = spawnSync("npx", args, { cwd: ROOT, stdio: "inherit" });
  if (res.status !== 0) fail(`wrangler kv put 실패 (exit ${res.status})`);

  console.log(`\n✓ KV 에 업로드 완료 (${isLocal ? "로컬" : "원격"})`);
  console.log(`  Worker의 /api/data 응답 헤더가 X-Oneday-Source: kv 로 바뀝니다.`);
  console.log(`  캐시(max-age 1시간)가 만료되어야 반영되므로, 즉시 확인하려면`);
  console.log(`  브라우저에서 강력 새로고침하세요.`);
}

function fail(msg) {
  console.error(`\n✗ ${msg}`);
  process.exit(1);
}

await main();

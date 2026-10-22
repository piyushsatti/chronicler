# Independent final32 Map performance review

**ACCEPTED for the declared local40-trial absolute latency gate; no must-fix finding.** This is not a performance comparison or a production/physical-phone/large-world claim. Read-only review2026-10-20 ran JSON/math/hash/source checks only. No browser, benchmark/native/compiler/Go/build, API/DB/service/provider or source action ran. Only this report is written; all review commands ended.

## Independent sample and error recomputation

All40 raw samples are retained, exactly desktop then phone for trial1..20, with20 rows per required profile. The40 measurement.log trial lines equal the corresponding raw trial/profile/firstUsable/selection/failed values. No sample is excluded from ranking. All timings are finite and positive. Nearest-rank positions15(p75) and19(p95) independently reproduce both stored summaries and the root acceptance receipt:

| Profile | n | First usable p75 ms | Selection p95 ms | First median ms | Selection median ms | First range ms | Selection range ms |
| --- | --- | --- | --- | --- | --- | --- | --- |
|desktop1920×1080|20|746.7|68.9|741.65|65.75|727.3–781.6|50.5–69.1|
|phone390×844|20|747.0|63.8|742.50|58.50|727.3–772.0|54.2–65.0|

Both first-usable p75 values are strictly<1000ms and selection p95 values≤100ms. Observed maxima also remain below those limits. This meets the specified absolute budget without inferring a speedup from older cohorts or naming an unprofiled causal bottleneck.

I recomputed failed from the retained actual error arrays and GraphResponses, rather than trusting the stored failed flag: **zero page errors, request failures, HTTP errors, GraphQL errors or non200 GraphQL responses**. There are160 actual parsed GraphResponses:40 MapDirectory,40 MapAtlas and80 MapDocuments. Every trial has an actual MapAtlas response with atlasCode LFC,18 nodes and17 edges, so realAtlas independently agrees. The constant nodeCount18 is expected sample metadata and was not used as an independent UI census. The unchanged source separately requires18 actual equivalent-list buttons after readiness.

Before/after dataset receipts agree on the actual18-node/17-edge/24-link complete queried workload and **ea94710f95408c52a756c6d3c0e88518d6847ecfe8c2a4d8697ee4edab240b72**. Their canonical map.graphql query fingerprint **b410fb9e5b19c31b51725db388c9e9dd6b645670f3ca6ed8c9593eb13805effc** matches current source. No new data/API probe was made; the link count/content fingerprint is root's retained actual pre/post observation, while the40 timed Atlas response counts independently confirm18/17.

## What was timed and visible

The reviewed unchanged helper starts firstUsable at navigation performance origin and stamps after two consecutive ready animation frames. The timestamp probe rechecks connected/nonzero graph/list/marker/button, ancestor display/visibility/opacity/hidden/inert/aria-hidden and enabled/pointer state, with matching accessible node/list identity. This is rendered/actionable equivalent-list readiness, not a claim that the list is initially visible on screen.

I independently recomputed intersection from every recorded box and the declared viewport dimensions. First-usable counts are **graph40, marker40, list0, button0**. All40 lists/buttons are belowfold. Selection counts are **graph40, marker40, list0, button0, feedback20**. The phone matching name feedback is rendered belowfold; the selected graph marker is in view40/40. Root's limits correctly state this rather than claiming simultaneous graph/list/detail visibility.

All40 selections have trustedSelection=true and select a name different from first readiness. Source begins selection timing only at the trusted capture-phase click for the expected actual list-button name, before the handler runs. Two consecutive frames require the matching aria-pressed SVG marker and list button plus matching rendered selected-name feedback. This measures rendered application feedback rather than merely handler completion. It excludes Playwright's preceding scroll/actionability work and full linked Document loading; it is not a hardware presentation timestamp.

Actual response checking continues after timing. The helper closes each context, dynamically drains all registered/late response readers, then classifies that row and finally reclassifies the whole retained cohort from actual arrays/GraphResponses. The earlier late-failure false-pass repair remains unchanged. No tracing/profiling is inside this40-sample cohort. Root's separate guest trace is outside it and cannot alter these samples or percentiles.

## Conditions, quiet window and exact artifact binding

Pinned Playwright1.62.1/Chromium151.0.7922.34 use the retained workspace Chromium executable. Each profile receives20 fresh guest browser contexts, actual CDP4×CPU slowdown and HTTP cache disabled. The source interleaves profiles and does not restart the server/database between trials. Network is unshaped host loopback to immutable production Vite preview4199 through the real local API12; server/DB caches are retained. No MSW, provider or mocked response is used.

Metadata records triton, AMD Ryzen5 3600,10 exposed logical CPU entries,34,568,044,544B memory, Node24.21.0, load averages0.20/0.52/0.76. The sanitized preflight process snapshot includes the actual19:23:14 uptime/load/core observations and no Go/compiler/Chromium process. Runtime quiet receipt records all three authors/reviewers completed, actual ended native sessions, original background services and retained idle previews; its explicit quiet release19:23:14.199203 precedes sampler metadata19:23:14.552. These are retained root lifecycle/process observations, not an independent reconstruction of every past process. This reviewer started no competing browser/compiler/fixture work during sampling.

All80 timed boundary environments show actual OS reduced-motion=false, application motion-collapse=off, parchment/light/system, comfortable density, no effects and colorblind off. Source retains no-preference, actual root projection and rendering checks. No unrelated animation-completion guarantee is added.

The run copy and canonical helper both hash **26bb020dee741b9a4597a61a2bad2d695a444e8457e48d0265ad9d48e3d5b935**. All10 root-bound artifact hashes verify, including raw data/log/screens/quiet snapshot/both dataset receipts/helper. Embedded epoch metadata equals the actual runtime-receipt object, and root hardwareAndConditions equals performance metadata.

Independently rehashed every current625 frontend source file,181 immutable Build32 dist file and336 API production input. All declared counts/hashes match:

- Source **f012675c4d58e18b2c7ab0e6a004cb6df1e085add1ba47fc6959a69712505756**.
- Dist **329032b06f250850eacdd40f2b575f56b6c23a6d9eb57675607f0ebf01becfda**.
- Build receipt **f96bd96da61a06d8d9c54e7f36148e235d1eca15fe9d3f783b49f3e41ec29b6f**.
- API production manifest **d01500fe67d5a85958469122ea982c80f61bc7524c7a4e60a4cff1faeff248c3**.

Original API12 container4da9cfd0ff09/image d103a48f, workerf5e50769b2c0 and PostgreSQL2621aae95d00 match the Build32 runtime receipt. Root's postchecks record all source bytes, services and dataset unchanged after sampling; metadata/postchecks and before/after dataset fields agree. This review adds file/hash/math verification without another live service/DB observation.

## Verdict limits and retained hashes

This accepts the exact Build32/API12 public18-node workload under the stated local client/cache/server/CPU conditions. It does not identify a performance limiter, compare implementations, establish cold-server/browser-launch/full-Document loading time, extrapolate a large world or production network, measure a physical phone or prove visual approval. No earlier sample was reused, discarded or relabeled current. Root visualApproval=false and productionDeployment=false remain appropriate.

- root-performance-acceptance.json: **42c0f893ecfc815d37cf74b487237e6ee184ca4c00bb21764aeaabdcfd8ed9b7**
- performance.json: **5647d6e2eae8cad69e6ddb500d3a60222b9d130b960ced835ab94e70f7120be2**
- measurement.log: **7ce079751d2dbec4f142261ddeb530de0c23d0d81e1ca655fd16390e92438ab3**
- runtime-receipt.json: **d373442afd9975e256264907c6c6ade6bbc863a737f69e72857f19bcfd297537**
- postchecks.json: **bce6c270099e618c2445135f1f9f2f857b9a3c4630e32457ec61f4857b3388e0**

All inputs remain unchanged. Only this report is authored; no new benchmark, runtime, compiler or service process remains active from this review.

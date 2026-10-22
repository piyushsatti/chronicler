# Independent header default review

Accepted. No must-fix finding in frozen `apps/web/src/styles/base.css` SHA256 `e82ec91b207910b4a25d4c4201b33913163cb9a4b274e62c09870420059ee1ab`.

The complete delta adds one declaration to the existing `:root`: `--site-header-height: var(--sp-8);`. Independent exact removal recovers preserved before SHA256 `a0a59701e6c5e1abb6ebf3f2533185d1f5c2ac7a8f7271771907e1413912f2ca`. The current file equals the frozen copy. The author report SHA256 is `8b74fb35be78a4ac9fafe0b709724917cf451b7cb8825d0c4033747c326e5a11`; the reviewed diff is `ddee18828df2a7f86aff311e54029256efc3bd45269f5171e124decf92e097fe`.

The existing foundation test scans every `var()` reference against imported stylesheet declarations, including names with a fallback. Using its installed PostCSS parser and the actual import list, the independent source check reproduces exactly `top: --site-header-height` and `max-height: --site-header-height` as missing before this change and none afterward. No test or scanner changes are involved. The imported `tokens.css` already owns `--sp-8` as a density-aware token.

This follows the existing CSS default with runtime measurement pattern. The drawer's top/max-height and document scroll-padding expressions are unchanged and already fell back to the same `--sp-8`. `SiteChrome.tsx` remains the actual-height authority. Its initial border-box read and ResizeObserver publish an inline root pixel property, which outranks the stylesheet declaration. Its existing owned cleanup removes only that inline value and exposes the default again. Existing 48/64/95/117-height tests and cleanup assertions remain unchanged. No fixed token is substituted for a measured mounted header.

Prove It Works shaped this review by checking the actual complete diff, exact inverse and imported-property result rather than relying on the author summary. The retained author logs show 12 focused tests across three suites and all 15 design gates passing; type, component lint and format logs are retained. Those are author executions, not independent suite reruns. The original failed full-verify37 receipt remains dated and failed.

Independent execution was limited to source reads, hashing and the installed PostCSS parse. No source, test, helper, browser, build, API, Go compiler, database or service was changed or launched. Build38 and actual browser geometry remain root's subsequent acceptance. All reviewer processes ended.

`independent-support.json` SHA256 `2512b3a93cc3650287ac43570539b513d2601465843668cb8271c9c6651b46c5` records checked source and artifact hashes, exact inverse and parser results.

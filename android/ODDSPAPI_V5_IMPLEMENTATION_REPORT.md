# Native Android OddsPapi V5 implementation

Date: 2026-11-21. Repository: `XLITTM/nextpari`. Existing branch: `work/android-betsapi-football-w002`; existing **Draft PR #94**. Starting head: `b7e1490e8ad07c5c327f2f7f7e6b2ea3c99c3e9b`. Verified implementation head before this report: `8fca969a3d6eae6a98fc45bee3acfdce4a2278b9`. The published tracked source tree was compared byte-for-byte with the local source used for the final APK and instrumentation build; there were no differences.

## Result

The existing native sportsbook now accepts opaque OddsPapi V5 event IDs and renders the real `displayGroups` returned by `https://nextpari.net/api/player/sports/football-feed`. The old numeric-ID/football-only assumptions discarded these events or hid their markets. The application now preserves V5 IDs, displays all seven supported sports, and combines compatible numeric lines into one compact family table inside the existing match screen.

No separate website or product was created. This follow-up changes Android files only. No merge, web/backend deployment, database migration, casino, wallet, payment or settlement modification was performed. Existing functionality predating the starting head remains on the same PR.

## Sports and navigation

| Sport | Native structure | Canonical competition priority catalog |
| --- | --- | --- |
| Football | Countries/leagues, matches, full time/halves, goals/corners/cards and other supplied families | UEFA competitions, EPL, La Liga, Serie A, Bundesliga, Ligue 1, Portugal, Netherlands, Turkey, Brazil, Argentina, MLS |
| Tennis | Tournaments, matches, sets/games, winner, set/game totals and handicaps | Grand Slams, ATP/WTA levels, Challenger, ITF |
| Basketball | Countries/leagues, matches, quarters/halves including explicit overtime | NBA, EuroLeague, EuroCup, NCAA, FIBA World Cup, EuroBasket |
| Ice hockey | Countries/leagues, matches, regulation periods separated from overtime/shootout result | NHL, KHL, World Championship, CHL |
| Volleyball | Countries/leagues, matches, sets, set/point totals and handicaps | Nations League, World Championship, CEV Champions League |
| Table tennis | Countries/competitions, matches, games/points, supplied totals and handicaps | WTT, ITTF World Championship |
| Esports | Competitions, matches, maps, supplied kills/rounds and other explicit statistics | CS2 Major, Dota 2 TI, LoL Worlds, Valorant Champions |

Priority and logo lookup require explicit canonical identity. Labels such as “Premier League” never establish identity. International competitions precede country sections. Favorites and league navigation use canonical IDs, otherwise exact provider competition IDs, otherwise a clearly namespaced sport/country/label display key. Duplicate events do not inflate counters, including conflicting duplicates.

**Current contract limitation:** the observed production payload supplies no canonical league/team IDs, no provider tournament IDs, and no explicit esports discipline/provider sport ID. Consequently, canonical top-league priority cannot be activated safely on this payload, and separate CS2/Dota 2/LoL/Valorant menus cannot yet be populated reliably. Actual competitions and esports fixtures still display. Backend changes to supply these identities were outside this task and were not made.

**Current esports availability:** the final public list contained four esports fixtures without prices/markets. A separate actual event-detail GET returned HTTP 200 with one event and zero display groups. An actual `oddsFor` request for all four IDs returned HTTP 200, four quotes, zero primary/display markets, all with `priceState=unavailable`. The native esports screenshot correctly shows this unavailable state. Priced esports markets are supported by the adapter but are not claimed as supplied or visually validated in this capture. No conclusion is asserted about upstream provider availability beyond the observed NextPari API responses.

## Markets and price integrity

- Preserve event, provider, bookmaker, external market and period IDs, line, source selection ID, timestamp and status on every supplied outcome.
- Use an explicit wire-label dictionary and current V5 `marketType` definitions. For example, tennis/volleyball `totals` means sets, esports `totals` means maps, and `totals-points`, `totals-kills`, `totals-rounds` retain their separate units. Reference: <https://docs.oddspapi.io/coverage/markets>.
- Group only compatible event/bookmaker/period/family/entity records; sort lines with `BigDecimal`. Regulation, overtime, quarters, halves, sets, maps and different statistics remain separate. Unmapped families are visibly marked as unknown rather than guessed.
- Preserve exact decimal wire prices. Suppress contradictory duplicate lines, suspended/inactive or cross-event selections, and stale odds (30 seconds LIVE / 180 seconds prematch). Source identities remain available when a price is closed.
- Player props without an attributable player name display an unavailable-name label and no price. The observed feed does not supply those names. Supplying a verified name unlocks display only, not wagering.
- A missing or empty V5 quote refresh keeps the observed market catalog and every source ID while closing all cached prices. This was reproduced by native rendering: the previous code removed the catalog when a refresh returned no quotes. A new regression covers missing, suspended and empty-open refreshes, and a subsequent valid refresh.
- LIVE country/competition pools do not apply the prematch-only schedule. Prematch ordering remains authoritative, and esports fixtures already included in it are appended only once.
- Equivalent primary/display views of 1X2 agree when one uses explicit `open` and the other omits the parent status; raw status is retained. Conflicting prices remain rejected.
- Family counts represent accordions, not individual numeric lines. Category and period tabs follow the actual sport and supplied markets.

**Real V5 betting remains disabled.** All mapped V5 outcomes have no executable selection and remain locked. The view model rejects adding V5 selections, and the repository rejects a V5 placement before any POST. A regression verifies that no placement request is sent. No real bet or wallet operation was executed.

## Logos

Existing bundled starter resources (Premier League, Arsenal, Manchester City) remain unchanged and require exact identity/catalog mapping. Unsafe name-only logo assignment was removed.

`design/football-badge-inventory.json` records all 27 inspected source SVGs with SHA-256, source name, candidate canonical target and rights status. These targets are **not** a verified provider crosswalk. No new artwork was bundled: commercial permission for the downloaded football-logos.cc files was not established, and the current feed also lacks the necessary verified provider identities. License: <https://football-logos.cc/license/>. No claim is made that all 27 logos are live in the app.

## Validation

- `testDebugUnitTest`: **258 tests, 0 failures, 0 errors, 0 skipped**.
- `testReleaseUnitTest`: **258 tests, 0 failures, 0 errors, 0 skipped**.
- Both suites included the opt-in actual production HTTP read, returning **183 real events across all seven sports**, and the private production-capture decode check.
- `assembleDebug` and `assembleDebugAndroidTest` passed. `git diff --check` passed. APK signature verification passed.
- The private raw production response was not committed to this public repository. Normal CI skips the two opt-in environment tests unless explicitly enabled.
- Native Android 15 emulator: **16 actual screenshots** from **183 real events / 134 decoded market-family groups**, covering all seven sports and the dark theme. Each capture waited for the actual visible sport, participant and available market-title text. Numeric line tables were visually inspected. The screens used the real public list response; unavailable esports detail/batch data were checked separately. No preview fixtures were supplied.

The instrumentation uses a non-exported debug-only host to render the existing native screens, with an unmodified snapshot obtained from an actual production GET on the host and transferred privately to the emulator. Direct emulator proxy CONNECT failed; direct device HTTP transport is not claimed as validated. Outcome timestamps and the real observation clock remain enforced. The test host applies system bar insets; the normal app root is unchanged. The first diagnostic pass reproduced disappearing markets and encountered system launcher/System UI ANR overlays; those frames are not the final verification evidence. It supplies no preview fixtures and has no player credentials or authenticated financial session. The normal app launch and release source do not expose this test host. This verifies native rendering, not an authenticated end-to-end player acceptance flow.

Reproduce compilation and unit checks with JDK 21, Android SDK 35 and Gradle 8.9:

```sh
gradle -p android testDebugUnitTest testReleaseUnitTest assembleDebug assembleDebugAndroidTest
```

For the optional read checks, set `NEXTPARI_LIVE_SPORTS_CHECK=1` and `NEXTPARI_CAPTURE_FILE` to a private current capture file. To run the native smoke instrumentation on an emulator/device with working network access, install both debug APKs and run:

```sh
adb shell am instrument -w -e productionRead 1 com.nextpari.app.debug.test/com.nextpari.app.feature.sportsbook.SportsSmokeInstrumentation
```

## APK

- Filename: `NextPari-OddsPapi-V5-W002-debug.apk`.
- Package: `com.nextpari.app.debug`; version `0.2.0-debug`, version code `2`.
- Size: **40,598,170 bytes**.
- SHA-256: `86413926bd71c711303d9be366ae45cea3d1b98a633e174891dd132305dd1a52`.
- Debug signing certificate SHA-256: `c2e4d3eaeadb0e848d49e53e1056f1504f7374ca51c976ea2e08bb47f5c5bcb1`.

The recovered environment no longer contained the previous debug keystore, so this debug signer differs from the earlier delivered debug build. Android may require uninstalling that older debug package before installing this APK. Release signing and the release package identity were not changed or finalized.

## Changed files since the starting head

All paths are relative to `android/` (24 implementation files plus this report):

| Area | Files |
| --- | --- |
| Feed/model | `app/src/main/java/com/nextpari/app/feature/sportsbook/FootballRepository.kt`, `OddsPapiMarkets.kt`; `app/src/main/java/com/nextpari/app/feature/home/SportsbookModels.kt` |
| Structure/identity | `app/src/main/java/com/nextpari/app/feature/sportsbook/CompetitionOrder.kt`, `SportsbookLogic.kt`, `SportsPresentation.kt`, `FootballBadges.kt` |
| State | `app/src/main/java/com/nextpari/app/feature/sportsbook/SportsbookViewModel.kt` |
| Native screens | `app/src/main/java/com/nextpari/app/feature/sportsbook/ChampionshipsScreen.kt`, `LeagueScreen.kt`, `MarketAccordion.kt`; `app/src/main/java/com/nextpari/app/feature/home/MatchCard.kt`, `HomeChampionshipsAccordion.kt` |
| Favorites/navigation | `app/src/main/java/com/nextpari/app/feature/favorites/FavoritesScreen.kt`; `app/src/main/java/com/nextpari/app/core/navigation/NextpariRoot.kt` |
| Tests | `app/src/test/java/com/nextpari/app/feature/sportsbook/OddsPapiAndroidTest.kt`, `SportsbookHierarchyTest.kt`, `SportsPresentationTest.kt`; `app/src/test/java/com/nextpari/app/feature/promo/PromoVipHomeTest.kt` |
| Native verification | `app/build.gradle.kts`; `app/src/debug/AndroidManifest.xml`; `app/src/debug/java/com/nextpari/app/feature/sportsbook/SportsReadOnlyTestActivity.kt`; `app/src/androidTest/java/com/nextpari/app/feature/sportsbook/SportsSmokeInstrumentation.kt` |
| Asset evidence | `design/football-badge-inventory.json` |
| Report | `ODDSPAPI_V5_IMPLEMENTATION_REPORT.md` |

**DO NOT MERGE. DO NOT DEPLOY OR APPLY PRODUCTION CHANGES.**

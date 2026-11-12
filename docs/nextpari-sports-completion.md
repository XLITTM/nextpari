# Existing NextPari sportsbook integration

The website and Android use the existing `/api/player/sports/football-feed`
endpoint. The `includeSports=1` list opt-in reuses the original BetsAPI Events
client, pacing budget, parsers and detail endpoint. Legacy numeric fixture
IDs and placement routes remain intact. Additional Events fixtures have a
source/sport/event identity such as `betsapi:18:42`; they cannot enter the
legacy football coupon. Additional detail reads verify the source sport and
fixture before requesting odds. Odds without a current source timestamp,
unverified orientation, or an ambiguous handicap side are closed.

Set `BETSAPI_MULTISPORT_SPORT_IDS` only to IDs confirmed by authorized
server-side provider reads. The existing Vercel `BETSAPI_KEY` is used by the
same server client. No client token is required. The current sampling routine
rotates one additional live or first prematch page at a time in each worker.
At scale, validate live recency, first-page coverage and quota before enabling
many sports at once. The server reports per-phase status and counts in the
opt-in response. The single-sport view and expanded bookmaker IDs are distinct
from the Events list.

The current deployed Preview served live and prematch football. A bounded
Events odds sample returned 1X2, totals and Asian handicap; the direct Bet365
sample did not supply a matched fixture. The deployed endpoint cannot validate
the additional sport routes yet. This is not evidence that the subscription
denies tennis, basketball, hockey, volleyball, table tennis, handball, baseball
or another sport.

The three raster badges use provider identities already verified by the
canonical catalog: Premier League (94), Arsenal (17230), Manchester City (708).
They came from the owner-approved football archive. Other names and identities
continue to use neutral artwork until reviewed. On web and Android the logos
keep their transparency and original aspect ratio. Both surfaces use the
same sport ranking and an authoritative football clock when available.

Automatic Vercel deployment is disabled for the server draft branch only.
Review the three draft PRs and validate the unified read-only flow before
making any release or changing production configuration.

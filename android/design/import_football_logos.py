"""Import the owner-authorized football logo collection into the Android project.

Reads the 29 football-logos.cc archives and the 27 standalone SVGs. Keeps one
256px PNG per club, leaves the three working badges untouched, and writes
FootballLogoRegistry.kt plus an inventory JSON file.
"""

from __future__ import annotations

import hashlib
import json
import re
import subprocess
import unicodedata
import zipfile
from collections import defaultdict
from pathlib import Path

ROOT = Path(r"C:\Users\Aziz\Nextpari\android-betsapi-w002\android")
DRAWABLE = ROOT / "app" / "src" / "main" / "res" / "drawable-nodpi"
REGISTRY = ROOT / "app" / "src" / "main" / "java" / "com" / "nextpari" / "app" / "feature" / "sportsbook" / "FootballLogoRegistry.kt"
INVENTORY = ROOT / "design" / "football-logo-inventory.json"
SVG_DIR = Path(r"C:\Users\Aziz\Nextpari\logo")
ZIP_DIR = Path(r"C:\Users\Aziz\Downloads")
RESVG = Path(r"C:\Users\Aziz\AppData\Local\Temp\resvg-logo")
SIZE_RANK = {"256x256": 0, "512x512": 1, "128x128": 2, "64x64": 3}
ENTRY = re.compile(r"^(64x64|128x128|256x256|512x512)/([a-z0-9-]+)\.football-logos\.cc\.png$")
PNG_MAGIC = b"\x89PNG\r\n\x1a\n"

# competition id, country tokens, exact league labels, national flag
ZIPS = {
    "argentina-primera-division-2025-2026": ("primera-division", ["ar", "argentina"], ["primera division", "liga profesional", "argentina primera division"], False),
    "austria-2-liga-2025-2026": ("austria-2-liga", ["at", "austria"], ["2. liga", "2 liga", "austria 2. liga"], False),
    "belgium-pro-league-2025-2026": ("belgium-pro-league", ["be", "belgium"], ["pro league", "jupiler pro league", "belgian pro league"], False),
    "brazil-serie-a-2025-2026": ("brazil-serie-a", ["br", "brazil"], ["serie a", "brasileirao", "brasileirao serie a", "brazilian serie a"], False),
    "brazil-serie-b-2025-2026": ("brazil-serie-b", ["br", "brazil"], ["serie b", "brasileirao serie b", "brazilian serie b"], False),
    "england-efl-championship-2026-2027": ("championship", ["eng", "england"], ["championship", "efl championship", "sky bet championship"], False),
    "english-premier-league-2026-2027": ("premier-league", ["eng", "england"], ["premier league", "english premier league", "england premier league"], False),
    "fifa-world-cup-2026": ("world-cup", ["international", "fifa", "world"], ["fifa world cup", "world cup"], True),
    "france-ligue-1-2025-2026": ("ligue-1", ["fr", "france"], ["ligue 1"], False),
    "france-ligue-2-2025-2026": ("ligue-2", ["fr", "france"], ["ligue 2"], False),
    "germany-2-bundesliga-2026-2027": ("bundesliga-2", ["de", "germany"], ["2. bundesliga", "2 bundesliga"], False),
    "germany-bundesliga-2026-2027": ("bundesliga", ["de", "germany"], ["bundesliga"], False),
    "italy-serie-a-2025-2026": ("serie-a", ["it", "italy"], ["serie a"], False),
    "italy-serie-b-2025-2026": ("serie-b", ["it", "italy"], ["serie b"], False),
    "netherlands-eredivisie-2026-2027": ("eredivisie", ["nl", "netherlands"], ["eredivisie"], False),
    "portugal-primeira-liga-2025-2026": ("primeira-liga", ["pt", "portugal"], ["primeira liga", "liga portugal"], False),
    "romania-liga-1-2025-2026": ("romania-liga-1", ["ro", "romania"], ["liga 1", "superliga", "romania liga 1"], False),
    "russia-russian-premier-league-2026-2027": ("russian-premier-league", ["ru", "russia"], ["russian premier league", "premier league"], False),
    "saudi-arabia-pro-league-2026-2027": ("saudi-pro-league", ["sa", "saudi arabia"], ["saudi pro league", "pro league", "saudi professional league"], False),
    "scotland-premiership-2026-2027": ("scottish-premiership", ["sco", "scotland"], ["premiership", "scottish premiership"], False),
    "spain-la-liga-2-2026-2027": ("la-liga-2", ["es", "spain"], ["la liga 2", "laliga 2", "segunda division"], False),
    "spain-la-liga-2026-2027": ("la-liga", ["es", "spain"], ["la liga", "laliga"], False),
    "turkey-2nd-lig-2026-2027": ("turkey-2-lig", ["tr", "turkey", "turkiye"], ["2nd lig", "tff 2. lig", "2. lig"], False),
    "turkey-super-lig-2026-2027": ("super-lig", ["tr", "turkey", "turkiye"], ["super lig", "süper lig", "turkish super lig"], False),
    "ucl-champions-league-2025-2026": ("champions-league", ["international", "europe", "uefa"], ["uefa champions league", "champions league"], False),
    "uefa-conference-league-2025-2026": ("conference-league", ["international", "europe", "uefa"], ["uefa conference league", "uefa europa conference league", "conference league"], False),
    "uefa-europa-league-2025-2026": ("europa-league", ["international", "europe", "uefa"], ["uefa europa league", "europa league"], False),
    "uefa-nations-league-2026-2027": ("nations-league", ["international", "europe", "uefa"], ["uefa nations league", "nations league"], True),
    "usa-mls-2025-2026": ("mls", ["us", "usa", "united states"], ["mls", "major league soccer"], False),
}

EXISTING_TEAM = {"arsenal": "badge_arsenal", "manchester-city": "badge_manchester_city"}
EXISTING_COMPETITION = {"premier-league": "badge_premier_league"}
SVG_COMPETITION = {
    "england_english-premier-league.football-logos.cc.svg": "premier-league",
    "england_efl-championship.football-logos.cc.svg": "championship",
    "spain_la-liga.football-logos.cc.svg": "la-liga",
    "italy_serie-a.football-logos.cc.svg": "serie-a",
    "germany_bundesliga.football-logos.cc.svg": "bundesliga",
    "france_ligue-1.football-logos.cc.svg": "ligue-1",
    "argentina_argentina-primera-division.football-logos.cc.svg": "primera-division",
    "brazil_brazilian-serie-a.football-logos.cc.svg": "brazil-serie-a",
    "usa_mls.football-logos.cc.svg": "mls",
    "tournaments_uefa-champions-league.football-logos.cc.svg": "champions-league",
    "tournaments_uefa-europa-league.football-logos.cc.svg": "europa-league",
    "tournaments_uefa-conference-league.football-logos.cc.svg": "conference-league",
}

# Extra names that do not equal the file slug. Applied only when the slug exists.
ALIASES = {
    "manchester city": "manchester-city",
    "man city": "manchester-city",
    "манчестер сити": "manchester-city",
    "arsenal": "arsenal",
    "арсенал": "arsenal",
    "manchester united": "manchester-united",
    "man utd": "manchester-united",
    "манчестер юнайтед": "manchester-united",
    "fulham": "fulham",
    "фулхэм": "fulham",
    "фулхем": "fulham",
    "aston villa": "aston-villa",
    "астон вилла": "aston-villa",
    "sunderland": "sunderland",
    "сандерленд": "sunderland",
    "real madrid": "real-madrid",
    "реал мадрид": "real-madrid",
    "barcelona": "barcelona",
    "барселона": "barcelona",
    "atletico madrid": "atletico-madrid",
    "atlético madrid": "atletico-madrid",
    "атлетико мадрид": "atletico-madrid",
    "athletic bilbao": "athletic-club",
    "athletic club": "athletic-club",
    "real sociedad": "real-sociedad",
    "реал сосьедад": "real-sociedad",
    "real betis": "real-betis",
    "real betis seville": "real-betis",
    "real betis sevilla": "real-betis",
    "бетис": "real-betis",
    "as roma": "roma",
    "рома": "roma",
    "ogc nice": "nice",
    "sc paderborn 07": "paderborn",
    "paderborn 07": "paderborn",
    "cagliari calcio": "cagliari",
    "parma calcio": "parma",
    "ascoli calcio 1898": "ascoli",
    "l r vicenza": "vicenza",
    "lr vicenza": "vicenza",
    "estoril praia": "estoril",
    "villarreal": "villarreal",
    "вильярреал": "villarreal",
    "sevilla": "sevilla",
    "севилья": "sevilla",
    "valencia": "valencia",
    "валенсия": "valencia",
    "bayern munich": "bayern-munchen",
    "bayern munchen": "bayern-munchen",
    "bayern münchen": "bayern-munchen",
    "бавария": "bayern-munchen",
    "borussia dortmund": "borussia-dortmund",
    "боруссия дортмунд": "borussia-dortmund",
    "bayer leverkusen": "bayer-leverkusen",
    "байер леверкузен": "bayer-leverkusen",
    "rb leipzig": "rb-leipzig",
    "рб лейпциг": "rb-leipzig",
    "inter milan": "inter",
    "internazionale": "inter",
    "интер": "inter",
    "ac milan": "milan",
    "милан": "milan",
    "juventus": "juventus",
    "ювентус": "juventus",
    "napoli": "napoli",
    "наполи": "napoli",
    "paris saint germain": "paris-saint-germain",
    "paris saint-germain": "paris-saint-germain",
    "psg": "paris-saint-germain",
    "псж": "paris-saint-germain",
    "liverpool": "liverpool",
    "ливерпуль": "liverpool",
    "chelsea": "chelsea",
    "челси": "chelsea",
    "tottenham hotspur": "tottenham",
    "tottenham": "tottenham",
    "тоттенхэм": "tottenham",
    "newcastle united": "newcastle",
    "ньюкасл": "newcastle",
    "west ham": "west-ham",
    "вест хэм": "west-ham",
    "deportivo alaves": "deportivo",
    "alaves": "deportivo",
    "алавес": "deportivo",
    "deportivo la coruna": "deportivo-la-coruna",
    "rc deportivo de a coruna": "deportivo-la-coruna",
    "deportivo de la coruna": "deportivo-la-coruna",
    "real club deportivo de la coruna": "deportivo-la-coruna",
}


def safe_name(value: str) -> str:
    return value.replace("-", "_")


def res_name(slug: str, competition: str | None = None) -> str:
    if competition:
        return f"logo_fb_{safe_name(competition)}_{safe_name(slug)}"
    return f"logo_fb_{safe_name(slug)}"


def read_png(archive: zipfile.ZipFile, info: zipfile.ZipInfo) -> bytes:
    name = info.filename.replace("\\", "/")
    if name.startswith("/") or ".." in name.split("/"):
        raise ValueError(f"unsafe path {name}")
    data = archive.read(info)
    if not data.startswith(PNG_MAGIC):
        raise ValueError(f"not a png {name}")
    return data


def main() -> None:
    DRAWABLE.mkdir(parents=True, exist_ok=True)
    inventory_assets = []
    archive_rows = []
    rejected = []
    # slug -> {hash, competitions:set, bytes, source}
    chosen: dict[str, dict] = {}
    conflicts: dict[str, list] = defaultdict(list)

    zips = sorted(ZIP_DIR.glob("*.football-logos.cc.zip"))
    if len(zips) != 29:
        raise SystemExit(f"expected 29 archives, found {len(zips)}")
    for path in zips:
        stem = path.name.replace(".football-logos.cc.zip", "")
        if stem not in ZIPS:
            raise SystemExit(f"unclassified archive {path.name}")
        competition, countries, leagues, national = ZIPS[stem]
        with zipfile.ZipFile(path) as archive:
            entries = [info for info in archive.infolist() if not info.is_dir()]
            best: dict[str, tuple[int, str, zipfile.ZipInfo]] = {}
            for info in entries:
                name = info.filename.replace("\\", "/")
                if name.startswith("/") or ".." in name.split("/"):
                    rejected.append({"archive": path.name, "path": name, "reason": "unsafe path"})
                    continue
                match = ENTRY.fullmatch(name)
                if not match:
                    rejected.append({"archive": path.name, "path": name, "reason": "unexpected entry"})
                    continue
                size, slug = match.group(1), match.group(2)
                rank = SIZE_RANK[size]
                current = best.get(slug)
                if current is None or rank < current[0]:
                    best[slug] = (rank, name, info)
            for slug, (rank, original, info) in sorted(best.items()):
                data = read_png(archive, info)
                digest = hashlib.sha256(data).hexdigest()
                row = chosen.get(slug)
                if row is None:
                    chosen[slug] = {
                        "hash": digest,
                        "bytes": data,
                        "competitions": {competition},
                        "countries": set(countries),
                        "national": national,
                        "source_archive": path.name,
                        "source_path": original,
                    }
                else:
                    row["competitions"].add(competition)
                    if not national:
                        row["countries"].update(countries)
                        row["national"] = False
                    if row["hash"] != digest:
                        conflicts[slug].append({
                            "archive": path.name,
                            "path": original,
                            "hash": digest,
                            "bytes": data,
                            "competition": competition,
                        })
                inventory_assets.append({
                    "archive": path.name,
                    "archiveEntries": len(entries),
                    "kind": "national-team" if national else "team",
                    "name": slug,
                    "countries": countries,
                    "competition": competition,
                    "originalPath": original,
                    "mapping": "selected" if rank == 0 else f"selected-{original.split('/')[0]}",
                })
            archive_rows.append({
                "archive": path.name,
                "entries": len(entries),
                "uniqueClubs": len(best),
                "competition": competition,
                "countries": countries,
                "leagues": leagues,
                "national": national,
            })

    written = []
    slug_drawable: dict[str, str] = {}
    for slug, row in sorted(chosen.items()):
        if slug in EXISTING_TEAM and not conflicts.get(slug):
            drawable = EXISTING_TEAM[slug]
            target = DRAWABLE / f"{drawable}.png"
            inventory_status = "mapped-to-existing-badge"
        else:
            drawable = res_name(slug)
            target = DRAWABLE / f"{drawable}.png"
            if slug in EXISTING_TEAM:
                drawable = EXISTING_TEAM[slug]
                target = DRAWABLE / f"{drawable}.png"
                inventory_status = "kept-existing-badge-despite-variant"
            else:
                target.write_bytes(row["bytes"])
                inventory_status = "imported"
        slug_drawable[slug] = drawable
        written.append({
            "slug": slug,
            "drawable": drawable,
            "bytes": target.stat().st_size,
            "sha256": hashlib.sha256(target.read_bytes()).hexdigest() if target.exists() else row["hash"],
            "competitions": sorted(row["competitions"]),
            "status": inventory_status,
            "sourceArchive": row["source_archive"],
            "sourcePath": row["source_path"],
        })
        for clash in conflicts.get(slug, []):
            variant = res_name(slug, clash["competition"])
            variant_path = DRAWABLE / f"{variant}.png"
            variant_path.write_bytes(clash["bytes"])
            written.append({
                "slug": f"{clash['competition']}/{slug}",
                "drawable": variant,
                "bytes": variant_path.stat().st_size,
                "sha256": hashlib.sha256(clash["bytes"]).hexdigest(),
                "competitions": [clash["competition"]],
                "status": "imported-distinct-variant",
                "sourceArchive": clash["archive"],
                "sourcePath": clash["path"],
            })

    svg_rows = []
    convert_jobs = []
    svgs = sorted(SVG_DIR.glob("*.svg"))
    if len(svgs) != 27:
        raise SystemExit(f"expected 27 svgs, found {len(svgs)}")
    competition_drawable = dict(EXISTING_COMPETITION)
    for svg in svgs:
        slug = svg.name.split(".football-logos.cc.svg")[0].split("_", 1)[1]
        if svg.name in SVG_COMPETITION:
            competition = SVG_COMPETITION[svg.name]
            if competition in EXISTING_COMPETITION:
                svg_rows.append({
                    "file": svg.name,
                    "kind": "competition",
                    "competition": competition,
                    "status": "mapped-to-existing-badge",
                    "drawable": EXISTING_COMPETITION[competition],
                    "finalPath": str(DRAWABLE / f"{EXISTING_COMPETITION[competition]}.png"),
                })
                continue
            drawable = f"logo_comp_{safe_name(competition)}"
            target = DRAWABLE / f"{drawable}.png"
            convert_jobs.append({"svg": str(svg), "png": str(target)})
            competition_drawable[competition] = drawable
            svg_rows.append({
                "file": svg.name,
                "kind": "competition",
                "competition": competition,
                "status": "converted",
                "drawable": drawable,
                "finalPath": str(target),
            })
            continue
        drawable = slug_drawable.get(slug)
        svg_rows.append({
            "file": svg.name,
            "kind": "team",
            "slug": slug,
            "status": "mapped-to-team-png" if drawable else "unmatched-svg",
            "drawable": drawable,
        })

    if convert_jobs:
        job_file = RESVG / "jobs.json"
        job_file.write_text(json.dumps(convert_jobs), encoding="utf-8")
        script = RESVG / "convert.mjs"
        script.write_text(
            """
import { readFileSync, writeFileSync } from 'node:fs';
import { Resvg } from '@resvg/resvg-js';
const jobs = JSON.parse(readFileSync(process.argv[2], 'utf8'));
for (const job of jobs) {
  const svg = readFileSync(job.svg);
  const renderer = new Resvg(svg, { fitTo: { mode: 'width', value: 256 }, background: 'rgba(0,0,0,0)' });
  writeFileSync(job.png, renderer.render().asPng());
}
""".strip(),
            encoding="utf-8",
        )
        subprocess.run(["node", str(script), str(job_file)], cwd=RESVG, check=True)

    for row in svg_rows:
        if row["status"] == "converted":
            target = Path(row["finalPath"])
            data = target.read_bytes()
            if not data.startswith(PNG_MAGIC):
                raise SystemExit(f"svg conversion failed for {row['file']}")
            row["bytes"] = len(data)
            row["sha256"] = hashlib.sha256(data).hexdigest()

    aliases = {}
    dropped_aliases = []
    natural = {slug.replace("-", " "): slug for slug in slug_drawable}
    for alias, slug in ALIASES.items():
        key = normalize_label(alias)
        if slug not in slug_drawable:
            dropped_aliases.append({"alias": alias, "slug": slug, "reason": "slug not in collection"})
            continue
        owner = natural.get(key)
        if owner and owner != slug:
            dropped_aliases.append({"alias": alias, "slug": slug, "reason": f"collides with {owner}"})
            continue
        aliases[key] = slug

    inventory = {
        "archives": archive_rows,
        "archiveCount": len(archive_rows),
        "archiveEntries": sum(row["entries"] for row in archive_rows),
        "uniqueTeamSlugs": len(slug_drawable),
        "importedTeamPngs": sum(1 for row in written if row["status"] == "imported"),
        "competitionLogos": len(competition_drawable),
        "svgCount": len(svg_rows),
        "rejected": rejected,
        "droppedAliases": dropped_aliases,
        "hashConflicts": sorted(conflicts),
        "teams": written,
        "svgs": svg_rows,
    }
    INVENTORY.write_text(json.dumps(inventory, ensure_ascii=False, indent=2), encoding="utf-8")
    write_kotlin(slug_drawable, chosen, competition_drawable, aliases, ZIPS)
    print(f"archives={len(archive_rows)} entries={inventory['archiveEntries']} slugs={len(slug_drawable)} imported={inventory['importedTeamPngs']} competitions={len(competition_drawable)} rejected={len(rejected)} conflicts={len(conflicts)} droppedAliases={len(dropped_aliases)}")


def kt_string(value: str) -> str:
    return json.dumps(value, ensure_ascii=False)


def normalize_label(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.strip().casefold()).replace("ё", "е")
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", "".join(ch if ch.isalnum() else " " for ch in stripped)).strip()


def write_kotlin(slug_drawable, chosen, competition_drawable, aliases, zips) -> None:
    team_lines = []
    for slug, drawable in sorted(slug_drawable.items()):
        team_lines.append(f"        {kt_string(slug)} to R.drawable.{drawable},")
    competition_lines = []
    for competition, drawable in sorted(competition_drawable.items()):
        competition_lines.append(f"        {kt_string(competition)} to R.drawable.{drawable},")
    canonical_lines = []
    national_alias_lines = []
    for slug, drawable in sorted(slug_drawable.items()):
        countries = sorted(chosen[slug]["countries"])
        country = next((token for token in countries if token not in {"international", "europe", "uefa", "fifa", "world"} and len(token) <= 3), "int")
        domestic = [item for item in chosen[slug]["competitions"] if item not in {"world-cup", "nations-league"}]
        prefix = f"football:{country}" if domestic else "football:nt"
        canonical_lines.append(f"        {kt_string(prefix + ':' + slug)} to R.drawable.{drawable},")
        if slug.endswith("-national-team"):
            short = slug[: -len("-national-team")].replace("-", " ")
            extras = {
                "turkey-national-team": ["turkiye"],
                "usa-national-team": ["united states"],
                "dutch-national-team": ["netherlands", "holland"],
                "czech-republic-national-team": ["czechia"],
                "cote-d-ivoire-national-team": ["ivory coast"],
                "cabo-verde-national-team": ["cape verde"],
                "republic-of-ireland-national-team": ["ireland"],
                "south-korea-national-team": ["korea republic", "republic of korea"],
                "congo-dr-national-team": ["dr congo"],
                "bosnia-and-herzegovina-national-team": ["bosnia"],
            }.get(slug, [])
            russian = {
                "england": "англия", "spain": "испания", "france": "франция", "germany": "германия",
                "italy": "италия", "belgium": "бельгия", "turkey": "турция", "portugal": "португалия",
                "brazil": "бразилия", "argentina": "аргентина", "croatia": "хорватия", "netherlands": "нидерланды",
                "scotland": "шотландия", "wales": "уэльс", "ukraine": "украина", "poland": "польша",
                "serbia": "сербия", "switzerland": "швейцария", "austria": "австрия", "denmark": "дания",
                "sweden": "швеция", "norway": "норвегия", "greece": "греция", "mexico": "мексика",
                "usa": "сша", "japan": "япония",
            }.get(short if slug != "dutch-national-team" else "netherlands")
            for alias in [short, *extras, *([russian] if russian else [])]:
                national_alias_lines.append(f"        {kt_string(normalize_label(alias))} to {kt_string(slug)},")
    for competition, drawable in sorted(competition_drawable.items()):
        canonical_lines.append(f"        {kt_string('football:comp:' + competition)} to R.drawable.{drawable},")
    canonical_lines.append('        "football:eng:premier-league" to R.drawable.badge_premier_league,')
    alias_lines = [f"        {kt_string(alias)} to {kt_string(slug)}," for alias, slug in sorted(aliases.items())]
    membership = []
    team_countries = []
    for slug in sorted(slug_drawable):
        comps = ", ".join(kt_string(item) for item in sorted(chosen[slug]["competitions"]))
        membership.append(f"        {kt_string(slug)} to setOf({comps}),")
        country_tokens = ", ".join(kt_string(normalize_label(item)) for item in dict.fromkeys(sorted(chosen[slug]["countries"])))
        team_countries.append(f"        {kt_string(slug)} to setOf({country_tokens}),")
    contexts = []
    seen = set()
    for _stem, (competition, countries, leagues, national) in zips.items():
        if competition in seen:
            continue
        seen.add(competition)
        country_set = ", ".join(kt_string(normalize_label(item)) for item in dict.fromkeys(countries))
        league_set = ", ".join(kt_string(normalize_label(item)) for item in dict.fromkeys(leagues))
        contexts.append(
            f"        CompetitionLogos({kt_string(competition)}, setOf({country_set}), setOf({league_set}), {str(national).lower()}),"
        )
    text = f"""package com.nextpari.app.feature.sportsbook

import com.nextpari.app.R
import com.nextpari.app.feature.home.MatchCardModel
import java.text.Normalizer
import java.util.Locale

/**
 * Local football marks imported from the owner-authorized collection.
 * Generated by android/design/import_football_logos.py.
 * Empty provider logo fields do not suppress these drawables.
 */
internal object FootballLogoRegistry {{
    private data class CompetitionLogos(
        val id: String,
        val countries: Set<String>,
        val leagues: Set<String>,
        val national: Boolean,
    )

    private val teams = mapOf(
{chr(10).join(team_lines)}
    )
    private val competitions = mapOf(
{chr(10).join(competition_lines)}
    )
    private val byCanonical = mapOf(
{chr(10).join(canonical_lines)}
    )
    private val aliases = mapOf(
{chr(10).join(alias_lines)}
    )
    private val nationalAliases = mapOf(
{chr(10).join(national_alias_lines)}
    )
    private val membership = mapOf(
{chr(10).join(membership)}
    )
    private val teamCountries = mapOf(
{chr(10).join(team_countries)}
    )
    private val contexts = listOf(
{chr(10).join(contexts)}
    )
    private val suffixes = setOf("fc", "afc", "cf", "fk", "sk", "ac", "club", "calcio")
    private val prefixes = setOf("fc", "cf", "ac", "as", "cd", "rc", "fk", "sk")
    private val restrictedTeam = Regex("\\\\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|ii|iii|u ?\\\\d{{2}})\\\\b")
    private val restrictedCompetition = Regex("\\\\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|u ?\\\\d{{2}})\\\\b")

    fun team(match: MatchCardModel, name: String, home: Boolean? = null): Int? {{
        if (match.sport != "football") return null
        val participant = if (home == true) match.homeParticipantId else if (home == false) match.awayParticipantId else null
        if (!participant.isNullOrBlank()) return byCanonical[participant]
        val normalized = normalize(name)
        if (restrictedTeam.containsMatchIn(normalized) || restrictedCompetition.containsMatchIn(normalize(match.league))) return null
        val context = context(match)
        if (context?.national == true) {{
            nationalAliases[normalized]?.let {{ return teams[it] }}
            slugFor(keys(normalized), context.id)?.let {{ return teams[it] }}
        }}
        context?.let {{ slugFor(keys(normalized), it.id)?.let {{ slug -> return teams[slug] }} }}
        val slug = slugFor(keys(normalized), null) ?: return null
        val country = countryKey(match.country)
        if (country.isNotEmpty() && country !in teamCountries[slug].orEmpty()) return null
        return teams[slug]
    }}

    fun competition(match: MatchCardModel): Int? {{
        if (match.sport != "football") return null
        val canonical = match.competitionId ?: match.competitionBadge?.canonicalId
        if (!canonical.isNullOrBlank()) return byCanonical[canonical]
        return context(match)?.let {{ competitions[it.id] }}
    }}

    private fun context(match: MatchCardModel): CompetitionLogos? {{
        val country = countryKey(match.country)
        val league = normalize(match.league)
        val ambiguous = setOf("premier league", "pro league", "liga 1", "ligue 1", "ligue 2", "2 lig", "2 liga", "serie a", "serie b", "championship", "superliga", "bundesliga", "primera division", "premiership")
        val selfContained = contexts.firstOrNull {{ league in it.leagues && league !in ambiguous }}
        if (selfContained != null) return selfContained
        return contexts.firstOrNull {{ league in it.leagues && country in it.countries }}
    }}

    private fun slugFor(forms: List<String>, competition: String?): String? {{
        val found = linkedSetOf<String>()
        for (form in forms) {{
            val direct = teams.keys.firstOrNull {{ it.replace('-', ' ') == form }}
            val alias = aliases[form]
            listOfNotNull(direct, alias).forEach {{ slug ->
                if (competition == null || competition in membership[slug].orEmpty()) found += slug
            }}
        }}
        return found.singleOrNull()
    }}

    private fun keys(value: String): List<String> {{
        val forms = linkedSetOf(value)
        val stripped = strip(value)
        if (stripped.isNotEmpty()) forms += stripped
        return forms.toList()
    }}

    private fun strip(value: String): String {{
        var tokens = value.split(' ').filter(String::isNotEmpty)
        while (tokens.size > 1 && tokens.last() in suffixes) tokens = tokens.dropLast(1)
        while (tokens.size > 1 && tokens.first() in prefixes) tokens = tokens.drop(1)
        return tokens.joinToString(" ")
    }}

    private fun countryKey(raw: String): String = SportsRegions.code(raw) ?: normalize(raw)

    private fun normalize(value: String): String {{
        val decomposed = Normalizer.normalize(value.trim().lowercase(Locale.ROOT), Normalizer.Form.NFD)
        return decomposed.replace(Regex("\\\\p{{Mn}}+"), "")
            .replace('ё', 'е')
            .replace(Regex("[^\\\\p{{L}}\\\\p{{N}}]+"), " ")
            .trim()
            .replace(Regex("\\\\s+"), " ")
    }}
}}
"""
    REGISTRY.write_text(text, encoding="utf-8")


if __name__ == "__main__":
    main()

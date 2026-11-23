"""Compare the generated football logo registry with the current production feed."""

from __future__ import annotations

import json
import re
import unicodedata
import urllib.request
from pathlib import Path

REGISTRY = Path(r"C:\Users\Aziz\Nextpari\android-betsapi-w002\android\app\src\main\java\com\nextpari\app\feature\sportsbook\FootballLogoRegistry.kt")
OUT = Path(r"C:\Users\Aziz\Nextpari\android-betsapi-w002\android\design\football-logo-coverage.json")
FEED = "https://nextpari.net/api/player/sports/football-feed?includeSports=1"
SUFFIXES = {"fc", "afc", "cf", "fk", "sk", "ac", "club", "calcio"}
PREFIXES = {"fc", "cf", "ac", "as", "cd", "rc", "fk", "sk"}
AMBIGUOUS = {"premier league", "pro league", "liga 1", "ligue 1", "ligue 2", "2 lig", "2 liga", "serie a", "serie b", "championship", "superliga", "bundesliga", "primera division", "premiership"}
RESTRICTED_TEAM = re.compile(r"\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|ii|iii|u ?\d{2})\b")
RESTRICTED_COMPETITION = re.compile(r"\b(women|woman|ladies|feminine|female|wfc|reserves?|youth|academy|amateur|primavera|u ?\d{2})\b")
COUNTRY_ALIASES = {
    "england": "eng", "англия": "eng", "gb-eng": "eng",
    "scotland": "sco", "шотландия": "sco", "gb-sct": "sco",
    "wales": "wal", "уэльс": "wal", "gb-wls": "wal",
    "northern ireland": "nir", "северная ирландия": "nir", "gb-nir": "nir",
    "uk": "gb", "spain": "es", "испания": "es", "germany": "de", "france": "fr",
    "italy": "it", "turkey": "tr", "turkiye": "tr", "czechia": "cz",
}


def normalize(value: str) -> str:
    decomposed = unicodedata.normalize("NFD", value.strip().casefold()).replace("ё", "е")
    stripped = "".join(ch for ch in decomposed if unicodedata.category(ch) != "Mn")
    return re.sub(r"\s+", " ", "".join(ch if ch.isalnum() else " " for ch in stripped)).strip()


def country_key(raw: str) -> str:
    key = normalize(raw)
    if key in COUNTRY_ALIASES:
        return COUNTRY_ALIASES[key]
    if key in {"eng", "sco", "wal", "nir"} or (len(key) == 2 and key.isalpha()):
        return key
    return key


def quoted_map(text: str, name: str) -> dict[str, str]:
    start = text.index(f"private val {name} = mapOf(")
    end = text.index("\n    )", start)
    body = text[start:end]
    return dict(re.findall(r'^        ("(?:\\.|[^"])*") to ("(?:\\.|[^"])*"|R\.drawable\.[a-z0-9_]+),$', body, re.M))


def decode(value: str) -> str:
    if value.startswith("R.drawable."):
        return value.removeprefix("R.drawable.")
    return json.loads(value)


def main() -> None:
    text = REGISTRY.read_text(encoding="utf-8")
    teams = {decode(k): decode(v) for k, v in quoted_map(text, "teams").items()}
    aliases = {decode(k): decode(v) for k, v in quoted_map(text, "aliases").items()}
    national = {decode(k): decode(v) for k, v in quoted_map(text, "nationalAliases").items()}
    competitions = {decode(k): decode(v) for k, v in quoted_map(text, "competitions").items()}
    membership_start = text.index("private val membership = mapOf(")
    membership_end = text.index("\n    )", membership_start)
    membership = {
        json.loads(slug): set(json.loads(item) for item in comps.split(", "))
        for slug, comps in re.findall(r'^        ("(?:\\.|[^"])*") to setOf\((.*)\),$', text[membership_start:membership_end], re.M)
    }
    countries_start = text.index("private val teamCountries = mapOf(")
    countries_end = text.index("\n    )", countries_start)
    team_countries = {
        json.loads(slug): {json.loads(item) for item in comps.split(", ") if item}
        for slug, comps in re.findall(r'^        ("(?:\\.|[^"])*") to setOf\((.*)\),$', text[countries_start:countries_end], re.M)
    }
    contexts = []
    for comp, countries, leagues, national_flag in re.findall(
        r'CompetitionLogos\(("(?:\\.|[^"])*"), setOf\((.*?)\), setOf\((.*?)\), (true|false)\)',
        text,
    ):
        contexts.append({
            "id": json.loads(comp),
            "countries": {json.loads(item) for item in countries.split(", ") if item},
            "leagues": {json.loads(item) for item in leagues.split(", ") if item},
            "national": national_flag == "true",
        })

    def strip(value: str) -> str:
        tokens = [token for token in value.split(" ") if token]
        while len(tokens) > 1 and tokens[-1] in SUFFIXES:
            tokens.pop()
        while len(tokens) > 1 and tokens[0] in PREFIXES:
            tokens.pop(0)
        return " ".join(tokens)

    def context(league: str, country: str):
        league_key = normalize(league)
        country_token = country_key(country)
        for item in contexts:
            if league_key in item["leagues"] and league_key not in AMBIGUOUS:
                return item
        for item in contexts:
            if league_key in item["leagues"] and country_token in item["countries"]:
                return item
        return None

    def slug_for(forms: list[str], competition: str | None):
        found = []
        for form in forms:
            direct = next((slug for slug in teams if slug.replace("-", " ") == form), None)
            for slug in filter(None, [direct, aliases.get(form)]):
                if competition is None or competition in membership[slug]:
                    if slug not in found:
                        found.append(slug)
        return found[0] if len(found) == 1 else None

    def team(name: str, league: str, country: str):
        normalized = normalize(name)
        if RESTRICTED_TEAM.search(normalized) or RESTRICTED_COMPETITION.search(normalize(league)):
            return None, "restricted-name"
        forms = [normalized]
        stripped = strip(normalized)
        if stripped and stripped not in forms:
            forms.append(stripped)
        selected = context(league, country)
        if selected and selected["national"]:
            slug = national.get(normalized)
            if slug:
                return teams[slug], "national-alias"
            resolved = slug_for(forms, selected["id"])
            if resolved:
                return teams[resolved], "national-context"
        if selected:
            resolved = slug_for(forms, selected["id"])
            if resolved:
                return teams[resolved], "competition-context"
        resolved = slug_for(forms, None)
        country_token = country_key(country)
        if resolved and (not country_token or country_token in team_countries.get(resolved, set())):
            return teams[resolved], "unique-name"
        return None, "no-unambiguous-logo"

    def competition(league: str, country: str):
        selected = context(league, country)
        if selected is None:
            return None, "competition-context-not-verified"
        drawable = competitions.get(selected["id"])
        if drawable is None:
            return None, "competition-crest-not-in-collection"
        return drawable, "competition-context"

    with urllib.request.urlopen(FEED, timeout=40) as response:
        payload = json.load(response)
    football = [event for event in payload["events"] if event.get("sport") == "football"]
    rows = []
    matched_teams = set()
    unmatched_teams = {}
    competition_rows = {}
    for event in football:
        league = event.get("league") or ""
        country = event.get("country") or ""
        crest, crest_reason = competition(league, country)
        competition_rows.setdefault(f"{country}|{league}", {"drawable": crest, "reason": crest_reason, "count": 0})
        competition_rows[f"{country}|{league}"]["count"] += 1
        for side, name in (("home", event.get("home") or ""), ("away", event.get("away") or "")):
            drawable, reason = team(name, league, country)
            rows.append({"event": event.get("id"), "side": side, "name": name, "league": league, "country": country, "drawable": drawable, "reason": reason})
            if drawable:
                matched_teams.add(normalize(name))
            else:
                unmatched_teams.setdefault(normalize(name), {"name": name, "league": league, "country": country, "reason": reason, "count": 0})
                unmatched_teams[normalize(name)]["count"] += 1
    team_slots = len(rows)
    matched_slots = sum(1 for row in rows if row["drawable"])
    summary = {
        "feedEvents": len(payload["events"]),
        "footballEvents": len(football),
        "teamSlots": team_slots,
        "matchedSlots": matched_slots,
        "coveragePercent": round(100 * matched_slots / team_slots, 1) if team_slots else 0,
        "uniqueFeedTeams": len({normalize(row["name"]) for row in rows}),
        "uniqueMatchedTeams": len(matched_teams),
        "competitions": competition_rows,
        "unmatched": sorted(unmatched_teams.values(), key=lambda item: (-item["count"], item["name"])),
    }
    OUT.write_text(json.dumps(summary, ensure_ascii=False, indent=2), encoding="utf-8")
    print(f"football={summary['footballEvents']} slots={team_slots} matched={matched_slots} coverage={summary['coveragePercent']} uniqueTeams={summary['uniqueFeedTeams']} uniqueMatched={summary['uniqueMatchedTeams']} unmatched={len(summary['unmatched'])}")
    for item in summary["unmatched"]:
        print(f"  {item['count']:2} {item['reason']:32} {item['country']} | {item['league']} | {item['name']}")
    print("--- matched ---")
    for row in rows:
        if row["drawable"]:
            print(f"  {row['drawable']:32} {row['country']} | {row['league']} | {row['name']}")
    print("--- competitions ---")
    for key, item in sorted(competition_rows.items()):
        print(f"  {item['count']:2} {item['reason']:40} {item['drawable']} | {key}")


if __name__ == "__main__":
    main()

# teichmath.github.io

This is the canonical repo for Alex Teich's personal site, hosted on GitHub Pages at teichmath.github.io.

## What lives here

- **Ensembles** (`actors.html`, `js/`, `style.css`, `actor_tables/`) — the main browser game
- **Billiards front-end** (`billiards/`) — HTML + JS for the billiards game
- **Gangland front-end** (`gangland/`) — HTML for the gangland text adventure

Pushing to `main` on this repo updates the live site immediately via GitHub Pages.

## Related repos and backends

Two games have Java backends hosted separately on Railway:

| Game | Front-end (here) | Backend repo | Hosting |
|------|-----------------|--------------|---------|
| Billiards | `billiards/` | `~/crazy_billiards` (github: teichmath/crazy_billiards) | Railway |
| Gangland | `gangland/` | `~/gangland` (github: teichmath/gangland) | Railway |

Railway auto-deploys from the backend repos on push.

## Workflow

**Ensembles changes:** edit here, push → live.

**Billiards/Gangland JS or HTML changes:** edit here, push → live front-end updates.

**Billiards/Gangland Java/backend changes:** edit in `~/crazy_billiards` or `~/gangland`, push there → Railway redeploys automatically.

**When backend repos contain front-end files:** the backend repos may have their own copies of the HTML/JS. If you make front-end changes in those repos, copy them over to the corresponding subdirectory here before pushing to Pages.

## Archived versions

Old development iterations of Ensembles (`actor_game`, `actor_game_v2`, `actor_game_v3`, `actorgame`) have been moved to `~/old_projects/`. The files in this repo are the most recent.

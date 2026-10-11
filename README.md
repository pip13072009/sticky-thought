# Pebble

A tiny, private, offline phone app. Plain HTML, CSS and JavaScript — no build step, no server, no tracking.
Everything is stored in the browser's `localStorage` on the phone and nowhere else.

## Files

| File | What it is |
| --- | --- |
| `index.html` | The page |
| `styles.css` | Themes (light + dark) and layout |
| `app.js` | All screens, settings, and the three fidgets |
| `sw.js` | Service worker — caches everything so it works offline |
| `manifest.webmanifest` | Lets Chrome install it to the home screen |
| `icons/` | App icons |

## Run locally

```sh
python3 -m http.server 8000
```

Open http://localhost:8000. (Service workers need `localhost` or HTTPS.)

## Publish on GitHub Pages

1. Push to GitHub (public repo).
2. Repo **Settings → Pages → Build and deployment**: Source "Deploy from a branch", pick the branch and `/ (root)`.
3. Open the Pages URL in Chrome on the Android phone, then menu → **Install app** / **Add to home screen**.
4. Turn on airplane mode and open it from the home screen to check it works offline.

## Changing things

- **Name / icon:** `name` and `short_name` in `manifest.webmanifest`, `<title>` in `index.html`, and the PNGs in `icons/`.
- **Default words:** `DEFAULT_PHRASES` at the top of `app.js` (`{name}` is replaced by the chosen name, default "OCD").
- **Repeat-visit window:** `NUDGE_WINDOW_MS` at the top of `app.js` (default 10 minutes).
- **After any change:** bump `CACHE` in `sw.js` (e.g. `pebble-v2`) so installed copies update.

## What's stored

- `pebble.settings.v1` — name, theme, fidget, edited words, written-nudge on/off.
- `pebble.last.v1` — time the last session finished (used only for the repeat-visit nudge).

Feelings tapped during a session are never saved. Settings → "Delete everything" removes both keys.

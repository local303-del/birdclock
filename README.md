# BirdClock

BirdClock is a touchscreen clock and field guide for the Driftless Region around La Crosse, Wisconsin. The static app includes the original 220-species catalog.

## Use

Open [BirdClock on GitHub Pages](https://local303-del.github.io/birdclock/). Tap the full-screen button to fill the display. Swipe or use the arrow buttons to change birds. Use the photo button to cycle within the current gallery, and Pause to stop both automatic rotations. Explore supports search and seasonal filtering.

Settings remember the rotation interval, seasonal selection, 12/24-hour format, photo fit and brightness in local storage. The clock uses the device's local date, time zone and daylight-saving rules. A correction saved by an older package is ignored.

## Architecture

- `index.html` contains the display, controls, settings and bird rotation.
- `birds.js` holds the original 220 records. `make_birds.py` is the original data-generation tool.
- `gallery.js` searches Wikimedia Commons by common and scientific names, then filters for landscape JPEGs at least 1000 pixels wide with recognized license metadata. It selects up to six photos, prioritizing proportions close to the landscape display. Some species have fewer or no matching photos. The default bird interval is 45 seconds and the photo interval is 12 seconds. Automatic bird rotation draws from the eligible species without replacement until the pool is exhausted.
- `sw.js` caches the static app for offline use after the first successful visit. New gallery lookups require internet access.
- `Start-BirdClock.bat` and `serve.ps1` are the original optional Windows local preview launcher. The hosted app requires no Python, local server, build step or API key.

## Deployment

The public GitHub Pages site publishes the root of `main`. All app assets use relative paths so they resolve under `/birdclock/`. The `.nojekyll` marker keeps deployment static.

## Photography and attribution

The repository contains no bird photo files. The browser requests Wikimedia Commons thumbnails only when the API identifies them as public domain, CC0, CC BY or CC BY-SA and supplies the required credit metadata. Each image displays the file title, credited creator when available, license and a link to the Commons file record. Photo fit and brightness are applied in the browser. The source file and license remain linked for reuse. See [Wikimedia Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).

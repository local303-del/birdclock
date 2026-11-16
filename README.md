# BirdClock

BirdClock is a touchscreen clock and field guide for the Driftless Region around La Crosse, Wisconsin. The static app includes the original 220-species catalog.

## Use

Open [BirdClock on GitHub Pages](https://local303-del.github.io/birdclock/). Tap the full-screen button to fill the display. Swipe or use the arrow buttons to change birds. Use the photo button to cycle within the current gallery, and Pause to stop both automatic rotations. Explore supports search and seasonal filtering. Use Show full photo or Fill screen in the header to change photo fit. Hide photo clears the background photograph and pauses gallery loading until you choose Show photo.

Settings remember the rotation interval, seasonal selection, 12/24-hour format, photo visibility, fit and brightness in local storage. The clock uses the device's local date, time zone and daylight-saving rules. A correction saved by an older package is ignored.

## Architecture

- `index.html` contains the display, controls, settings and bird rotation.
- `birds.js` holds the original 220 records. `make_birds.py` is the original data-generation tool.
- `photo-catalog.js` indexes the bundled primary photos. `gallery.js` preloads the next primary photo before changing slides and uses exact species categories in Wikimedia Commons, with Wikidata species records to resolve missing scientific names and alternate Commons categories. It filters for landscape JPEGs at least 1000 pixels wide with recognized license metadata. It displays up to six photos including the bundled primary photo, with additional candidates kept for image-load failures. Some species have fewer or no matching photos. The default bird interval is 45 seconds and the photo interval is 12 seconds. Automatic bird rotation draws from the eligible species without replacement until the pool is exhausted.
- `sw.js` caches the hosted static app for offline use after the first successful visit. Bundled primary photos are cached for offline rotation. Additional Commons gallery photos require internet access.
- `Start-BirdClock.bat` and `serve.ps1` are the optional Windows launcher. It starts this copy on the first available port from 8766 through 8775 and opens that address. The hosted app requires no Python, local server, build step or API key.

## Deployment

The public GitHub Pages site publishes the root of `main`. All app assets use relative paths so they resolve under `/birdclock/`. The `.nojekyll` marker keeps deployment static.

## Photography and attribution

The bundled catalog includes one landscape photo for each of the 220 birds. These photos come from research-grade iNaturalist observations and include links to the photo and its license. BirdClock resizes the bundled copies and may crop them to fit the display. The browser requests additional Wikimedia Commons thumbnails only when the API identifies them as public domain, CC0, CC BY or CC BY-SA and supplies the required credit metadata. Each image displays the file title, credited creator when available, license and a link to the Commons file record. Photo fit and brightness are applied in the browser. The source file and license remain linked for reuse. See [Wikimedia Commons reuse guidance](https://commons.wikimedia.org/wiki/Commons:Reusing_content_outside_Wikimedia).


The bundled catalog uses species mappings from [BirdNET+ Taxonomy v0.5-Nov2026](https://birdnet.cornell.edu/taxonomy) (CC BY-SA 4.0). The catalog metadata is shared under [CC BY-SA 4.0](https://creativecommons.org/licenses/by-sa/4.0/). Individual photos keep the license shown in their credit. Seven older names in BirdClock are mapped to their current taxonomy for western Wisconsin, including American Herring Gull and American Goshawk.

To regenerate the primary photo catalog, download the versioned BirdNET+ Taxonomy CSV, install Pillow, and run `python audit_photos.py path/to/taxonomy.csv`. The script fills missing entries from [iNaturalist](https://www.inaturalist.org/pages/developers) and retains source and observation links for review. To reselect individual photos, append their catalog names as quoted arguments and review the new crops before publishing.

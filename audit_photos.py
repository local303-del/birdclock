"""Build BirdClock's photo catalog from research-grade iNaturalist records.

Pass the BirdNET+ Taxonomy v0.5-Nov2026 CSV to resolve BirdClock names.
Existing photos are left in place so interrupted runs can resume.
"""
import csv
import html
import io
import json
import re
import sys
import time
from concurrent.futures import ThreadPoolExecutor
from pathlib import Path
from urllib.parse import urlencode, urlsplit
from urllib.request import Request, urlopen

from PIL import Image, ImageOps

ROOT = Path(__file__).resolve().parent
LICENSES = {'cc0': 'CC0 1.0', 'cc-by': 'CC BY 4.0', 'cc-by-sa': 'CC BY-SA 4.0'}
REGIONAL_NAMES = {
    'Common Redpoll': 'Redpoll',
    'House Wren': 'Northern House Wren',
    'Warbling Vireo': 'Eastern Warbling Vireo',
    'Yellow Warbler': 'American Yellow Warbler',
    'Herring Gull': 'American Herring Gull',
    'Marsh Wren': 'Eastern Marsh Wren',
    'Northern Goshawk': 'American Goshawk',
}


def read(url):
    request = Request(url, headers={'User-Agent': 'BirdClock/2.0 (https://github.com/local303-del/birdclock)'})
    for attempt in range(3):
        try:
            with urlopen(request, timeout=20) as response:
                return response.read()
        except OSError:
            if attempt == 2:
                raise
            time.sleep(2 ** attempt)


def photo_for(entry):
    name, taxon, excluded = entry
    # The BirdNET+ snapshot still references the inactive iNaturalist Winter Wren ID.
    taxon_id = 1720022 if name == 'Winter Wren' else int(taxon['inat_id'])
    query = {
        'taxon_id': taxon_id, 'quality_grade': 'research', 'photos': 'true',
        'photo_license': ','.join(LICENSES), 'order_by': 'votes', 'per_page': 45,
    }
    try:
        observations = json.loads(read('https://api.inaturalist.org/v1/observations?' + urlencode(query)))
    except OSError:
        return name, commons_photo(taxon, excluded)
    candidates = []
    for observation in observations['results']:
        species = observation['taxon']
        if species['id'] != taxon_id and taxon_id not in species.get('ancestor_ids', []):
            continue
        for photo in observation['photos'][:1]:
            size = photo.get('original_dimensions') or {}
            url = photo.get('url') or ''
            if (str(photo['id']) in excluded or photo.get('license_code') not in LICENSES or not photo.get('attribution')
                    or urlsplit(url).hostname != 'inaturalist-open-data.s3.amazonaws.com'
                    or size.get('width', 0) < 800 or size.get('height', 0) < 500):
                continue
            ratio = size['width'] / size['height']
            candidates.append((ratio < 1.1, max(0, abs(1.65 - ratio) - 0.25), -observation.get('faves_count', 0), observation['id'], photo))

    candidates.sort(key=lambda item: item[:4])
    for _, _, _, observation_id, photo in candidates:
        try:
            data = read(photo['url'].rsplit('/', 1)[0] + '/large.jpg')
            with Image.open(io.BytesIO(data)) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
            if image.width < 800 or image.height < 500:
                continue
            image.thumbnail((1200, 1200))
            path = 'photos/' + str(photo['id']) + '.jpg'
            image.save(ROOT / path, quality=84, optimize=True)
        except OSError:
            continue
        license_code = photo['license_code']
        license_path = 'publicdomain/zero/1.0/' if license_code == 'cc0' else 'licenses/' + license_code[3:] + '/4.0/'
        return name, {
            'url': path, 'source': f'https://www.inaturalist.org/photos/{photo["id"]}',
            'observation': f'https://www.inaturalist.org/observations/{observation_id}',
            'author': photo['attribution'], 'license': LICENSES[license_code],
            'licenseUrl': 'https://creativecommons.org/' + license_path,
            'taxon': taxon['scientific_name'], 'ratio': round(image.width / image.height, 3),
        }
    return name, commons_photo(taxon, excluded)


def commons_photo(taxon, excluded):
    query = {
        'action': 'query', 'generator': 'categorymembers',
        'gcmtitle': 'Category:' + taxon['scientific_name'], 'gcmtype': 'file', 'gcmlimit': 50,
        'prop': 'imageinfo', 'iiprop': 'url|size|mime|extmetadata', 'iiurlwidth': 1200,
        'iiextmetadatafilter': 'Artist|Attribution|License|LicenseShortName|LicenseUrl|Restrictions',
        'format': 'json', 'formatversion': 2,
    }
    try:
        response = json.loads(read('https://commons.wikimedia.org/w/api.php?' + urlencode(query)))
    except OSError as error:
        print('Commons unavailable for', taxon['scientific_name'], error, flush=True)
        return None
    pages = response.get('query', {}).get('pages', [])
    candidates = []
    for page in pages:
        info = page['imageinfo'][0]
        if info['mime'] != 'image/jpeg' or info['width'] < 800 or info['height'] < 500:
            continue
        if re.search(r'\b(eggs?|nests?|specimens?|illustration|range map)\b', page['title'], re.I):
            continue
        metadata = info.get('extmetadata', {})
        value = lambda field: metadata.get(field, {}).get('value', '')
        code = value('License')
        license_url = value('LicenseUrl').replace('http:', 'https:', 1)
        credit = html.unescape(re.sub(r'<[^>]+>', '', value('Attribution') or value('Artist'))).strip()
        if value('Restrictions') or not credit or not value('LicenseShortName'):
            continue
        if code not in ('pd', 'cc-zero') and not re.fullmatch(r'cc-by(?:-sa)?-[0-9.]+', code):
            continue
        if code != 'pd' and not license_url.startswith('https://creativecommons.org/'):
            continue
        path = f'commons-{page["pageid"]}'
        if path in excluded or not info.get('thumburl'):
            continue
        ratio = info['width'] / info['height']
        candidates.append((ratio < 1.1, abs(1.65 - ratio), path, info, credit, value('LicenseShortName'), license_url))
    for _, _, path, info, author, license_name, license_url in sorted(candidates, key=lambda item: item[:3]):
        try:
            with Image.open(io.BytesIO(read(info['thumburl']))) as original:
                image = ImageOps.exif_transpose(original).convert('RGB')
            image.thumbnail((1200, 1200))
            url = f'photos/{path}.jpg'
            image.save(ROOT / url, quality=84, optimize=True)
        except OSError:
            continue
        return {
            'url': url, 'source': info['descriptionurl'], 'author': author, 'license': license_name,
            'licenseUrl': license_url, 'taxon': taxon['scientific_name'], 'ratio': round(image.width / image.height, 3),
        }
    return None


def main():
    with open(sys.argv[1], encoding='utf-8-sig', newline='') as source:
        names = {}
        scientific = {}
        for row in csv.DictReader(source):
            if row['taxon_group'].lower() not in ('bird', 'birds', 'aves'):
                continue
            scientific[row['scientific_name']] = row
            for field in ('common_name', 'common_name_alt', 'common_name_en'):
                if row[field]:
                    names[row[field].casefold().replace('ÃƒÂ¢Ã¢â€šÂ¬Ã¢â€žÂ¢', "'")] = row
    birds = json.loads((ROOT / 'birds.js').read_text(encoding='utf-8').split('=', 1)[1].strip().rstrip(';'))
    output = ROOT / 'photo-catalog.js'
    catalog = json.loads(output.read_text(encoding='utf-8').split('=', 1)[1].strip().rstrip(';')) if output.exists() else {}
    (ROOT / 'photos').mkdir(exist_ok=True)
    pending = []
    for bird in birds:
        name = bird['name']
        if (len(sys.argv) > 2 and name not in sys.argv[2:]) or (len(sys.argv) == 2 and name in catalog):
            continue
        taxon = names.get(REGIONAL_NAMES.get(name, name).casefold()) or scientific.get(bird['latin'])
        if taxon and taxon['inat_id']:
            excluded = {Path(catalog[name]['url']).stem} if name in catalog else set()
            pending.append((name, taxon, excluded))
        else:
            print('No taxon:', name, flush=True)

    with ThreadPoolExecutor(max_workers=4) as pool:
        for name, photo in pool.map(photo_for, pending):
            if photo:
                catalog[name] = photo
                ordered = {bird['name']: catalog[bird['name']] for bird in birds if bird['name'] in catalog}
                temporary = output.with_suffix('.tmp')
                temporary.write_text('const vettedPhotos = ' + json.dumps(ordered, indent=2) + ';\n', encoding='utf-8')
                temporary.replace(output)
            else:
                print('No eligible photo:', name, flush=True)
    print(f'{len(catalog)}/{len(birds)} catalog photos', flush=True)


if __name__ == '__main__':
    main()

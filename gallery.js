const photoCache = new Map();
const photoInterval = 12000;
let gallery = [];
let photoIndex = 0;
let photoTimer;
let photoRequest;
let photoToken = 0;

function metadataText(html) {
  const template = document.createElement('template');
  template.innerHTML = html || '';
  return template.content.textContent.trim();
}

function safeUrl(value) {
  try {
    return new URL(value);
  } catch {
    return null;
  }
}

function licensedPhoto(page) {
  const info = page.imageinfo?.[0];
  if (!info || info.mime !== 'image/jpeg' || info.width < 1000 || info.width <= info.height) return null;
  if (/\b(eggs?|nests?|specimens?|illustration|range map)\b/i.test(page.title)) return null;

  const metadata = info.extmetadata || {};
  const value = key => metadata[key]?.value || '';
  const code = value('License');
  const license = value('LicenseShortName');
  const licenseUrl = value('LicenseUrl');
  const author = metadataText(value('Attribution') || value('Artist'));
  const cc = /^cc-by(?:-sa)?-[\d.]+$/.test(code);
  const ccUrl = /^https?:\/\/creativecommons\.org\/(?:licenses\/by(?:-sa)?|publicdomain\/zero)\//.test(licenseUrl);
  if (value('Restrictions') || !license || (cc && !author)) return null;
  if (cc || code === 'cc-zero') {
    if (!ccUrl) return null;
  } else if (code !== 'pd') {
    return null;
  }

  const url = safeUrl(info.thumburl || info.url);
  const source = safeUrl(info.descriptionurl);
  if (!url || !source) return null;
  if (url.protocol !== 'https:' || !['thumb.wikimedia.org', 'upload.wikimedia.org'].includes(url.hostname)) return null;
  if (source.origin !== 'https://commons.wikimedia.org') return null;
  return {
    title: page.title.slice(5), url: url.href, source: source.href, author,
    license, licenseUrl: ccUrl ? licenseUrl.replace(/^http:/, 'https:') : '',
    ratio: info.width / info.height
  };
}

async function wikimediaQuery(host, parameters, signal) {
  const params = new URLSearchParams({
    format: 'json', formatversion: '2', origin: '*', ...parameters
  });
  const response = await fetch('https://' + host + '/w/api.php?' + params, {signal});
  if (!response.ok) throw Error('Wikimedia request failed');
  const data = await response.json();
  if (data.error) throw Error(data.error.code);
  return data;
}

async function speciesCategories(bird, signal) {
  const categories = new Set();
  if (bird.latin) categories.add(bird.latin);

  // Resolve older catalog entries through the article's Wikidata taxon item.
  const article = await wikimediaQuery('en.wikipedia.org', {
    action: 'query', titles: bird.name + '|' + bird.name.toLowerCase(),
    redirects: '1', prop: 'pageprops', ppprop: 'wikibase_item'
  }, signal);
  const ids = [...new Set((article.query?.pages || [])
    .map(page => page.pageprops?.wikibase_item).filter(Boolean))];
  if (ids.length !== 1) return categories;

  const data = await wikimediaQuery('www.wikidata.org', {
    action: 'wbgetentities', ids: ids[0], props: 'claims'
  }, signal);
  const entity = data.entities?.[ids[0]];
  const claims = property => (entity?.claims?.[property] || [])
    .filter(claim => claim.rank !== 'deprecated')
    .map(claim => claim.mainsnak?.datavalue?.value);
  const taxon = claims('P225').find(name => typeof name === 'string' && /^[A-Z][a-z]+ [a-z]+$/.test(name));
  if (claims('P105').some(rank => rank?.id === 'Q7432') && taxon) {
    if (bird.latin && bird.latin !== taxon) return categories;
    categories.add(taxon);
    for (const category of claims('P373')) {
      if (typeof category === 'string' && category) categories.add(category);
    }
  }
  return categories;
}

async function findPhotos(bird, signal) {
  if (photoCache.has(bird.name)) return photoCache.get(bird.name);
  const photos = new Map();
  const aspect = Math.max(1.33, Math.min(2.4, innerWidth / innerHeight || 1.6));
  const score = photo => Math.abs(Math.log(photo.ratio / aspect));

  async function collect(category, batches) {
    let continuation;
    for (let batch = 0; batch < batches; batch++) {
      const data = await wikimediaQuery('commons.wikimedia.org', {
        action: 'query', generator: 'categorymembers',
        gcmtitle: 'Category:' + category, gcmtype: 'file', gcmlimit: '50',
        prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
        iiextmetadatafilter: 'Artist|Attribution|License|LicenseShortName|LicenseUrl|Restrictions',
        ...continuation
      }, signal);
      for (const page of data.query?.pages || []) {
        const photo = licensedPhoto(page);
        if (photo) photos.set(photo.source, photo);
      }
      continuation = data.continue;
      if (!continuation || [...photos.values()].filter(photo => score(photo) < 0.23).length >= 6) break;
    }
  }

  if (bird.latin) await collect(bird.latin, 3);
  if (photos.size < 6) {
    try {
      const categories = await speciesCategories(bird, signal);
      for (const category of categories) {
        if (category !== bird.latin) await collect(category, 3);
        if (photos.size >= 6) break;
      }
    } catch (error) {
      if (signal.aborted || !photos.size) throw error;
    }
  }

  const ranked = [...photos.values()].sort((a, b) => score(a) - score(b)).slice(0, 12);
  if (ranked.length) photoCache.set(bird.name, ranked);
  return ranked;
}

function creditLink(text, href) {
  const link = document.createElement('a');
  link.textContent = text;
  link.href = href;
  link.target = '_blank';
  link.rel = 'noopener noreferrer';
  return link;
}

function photoUnavailable() {
  $('photo').style.backgroundImage = '';
  $('credit').textContent = 'Photo unavailable · clock remains active';
  $('nextPhoto').disabled = true;
}

function clearGallery() {
  clearTimeout(photoTimer);
  photoRequest?.abort();
  ++photoToken;
  gallery = [];
  photoIndex = 0;
  $('nextPhoto').disabled = true;
  $('photo').style.backgroundImage = '';
  $('credit').textContent = '';
}

async function loadGallery(bird) {
  clearGallery();
  if (settings.photosHidden) return;
  photoRequest = new AbortController();
  const signal = photoRequest.signal;
  const token = photoToken;
  $('credit').textContent = 'Looking for bird photographs…';
  try {
    const photos = await findPhotos(bird, signal);
    if (token !== photoToken) return;
    gallery = [...photos];
    showPhoto();
  } catch {
    if (token === photoToken) photoUnavailable();
  }
}

function resetPhotoTimer() {
  clearTimeout(photoTimer);
  if (!paused && gallery.length > 1 && !$('nextPhoto').disabled) {
    photoTimer = setTimeout(advancePhoto, photoInterval);
  }
}

function advancePhoto() {
  if (gallery.length < 2) return;
  photoIndex = (photoIndex + 1) % Math.min(6, gallery.length);
  showPhoto();
}

function showPhoto() {
  if (!gallery.length) return photoUnavailable();
  clearTimeout(photoTimer);
  $('nextPhoto').disabled = true;
  const token = ++photoToken;
  const photo = gallery[photoIndex];
  const image = new Image();
  image.onload = () => {
    if (token !== photoToken) return;
    $('photo').style.backgroundImage = 'url(' + JSON.stringify(photo.url) + ')';
    $('credit').replaceChildren(
      (photoIndex + 1) + '/' + Math.min(6, gallery.length) + ' · ',
      creditLink(photo.title, photo.source), ' · ',
      photo.author ? photo.author + ' · ' : '',
      photo.licenseUrl ? creditLink(photo.license, photo.licenseUrl) : photo.license,
      ' · Wikimedia Commons'
    );
    $('nextPhoto').disabled = gallery.length < 2;
    resetPhotoTimer();
  };
  image.onerror = () => {
    if (token !== photoToken) return;
    gallery.splice(photoIndex, 1);
    photoIndex = gallery.length ? photoIndex % Math.min(6, gallery.length) : 0;
    showPhoto();
  };
  image.src = photo.url;
}

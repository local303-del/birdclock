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

  const url = new URL(info.thumburl || info.url);
  const source = new URL(info.descriptionurl);
  if (url.protocol !== 'https:' || !['thumb.wikimedia.org', 'upload.wikimedia.org'].includes(url.hostname)) return null;
  if (source.origin !== 'https://commons.wikimedia.org') return null;
  return {
    title: page.title.slice(5), url: url.href, source: source.href, author,
    license, licenseUrl: ccUrl ? licenseUrl.replace(/^http:/, 'https:') : '',
    ratio: info.width / info.height
  };
}

async function findPhotos(bird, signal) {
  if (photoCache.has(bird.name)) return photoCache.get(bird.name);
  const names = [bird.name, bird.latin].filter(Boolean).map(name => 'intitle:"' + name + '"');
  const params = new URLSearchParams({
    action: 'query', generator: 'search', gsrnamespace: '6', gsrlimit: '40',
    gsrsearch: names.join(' OR ') + ' filetype:bitmap',
    prop: 'imageinfo', iiprop: 'url|size|mime|extmetadata', iiurlwidth: '1280',
    iiextmetadatafilter: 'Artist|Attribution|License|LicenseShortName|LicenseUrl|Restrictions',
    format: 'json', formatversion: '2', origin: '*'
  });
  const response = await fetch('https://commons.wikimedia.org/w/api.php?' + params, {signal});
  if (!response.ok) throw Error('Commons request failed');
  const data = await response.json();
  if (data.error) throw Error(data.error.code);
  const photos = (data.query?.pages || [])
    .map(licensedPhoto).filter(Boolean)
    .sort((a, b) => Math.abs(a.ratio - 1.6) - Math.abs(b.ratio - 1.6))
    .slice(0, 6);
  photoCache.set(bird.name, photos);
  return photos;
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

async function loadGallery(bird) {
  clearTimeout(photoTimer);
  photoRequest?.abort();
  photoRequest = new AbortController();
  const signal = photoRequest.signal;
  const token = ++photoToken;
  gallery = [];
  photoIndex = 0;
  $('nextPhoto').disabled = true;
  $('photo').style.backgroundImage = '';
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
  photoIndex = (photoIndex + 1) % gallery.length;
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
      (photoIndex + 1) + '/' + gallery.length + ' · ',
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
    photoIndex = gallery.length ? photoIndex % gallery.length : 0;
    showPhoto();
  };
  image.src = photo.url;
}

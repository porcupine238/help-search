// Reads the admin-maintained tabs. Row 1 of every tab holds the column names.

function readRows_(sheetName) {
  var sheet = SpreadsheetApp.getActive().getSheetByName(sheetName);
  if (!sheet) throw new Error('Missing sheet tab: ' + sheetName);
  var values = sheet.getDataRange().getValues();
  var header = values.shift().map(function (h) { return String(h).trim(); });
  return values.map(function (row) {
    var record = {};
    header.forEach(function (name, i) { record[name] = row[i]; });
    return record;
  });
}

function splitList_(value) {
  return String(value || '').split(',')
    .map(function (item) { return item.trim(); })
    .filter(function (item) { return item !== ''; });
}

function readAllowlist_() {
  return readRows_('Users')
    .filter(function (r) { return r.active === true || String(r.active).trim().toUpperCase() === 'TRUE'; })
    .map(function (r) { return String(r.email).trim().toLowerCase(); })
    .filter(function (email) { return email !== ''; });
}

function readArticles_() {
  return readRows_('Articles')
    .filter(function (r) { return String(r.id).trim() !== '' && String(r.status).trim().toLowerCase() === 'published'; })
    .map(function (r) {
      return {
        id: String(r.id).trim(),
        title: String(r.title),
        tags: splitList_(r.tags),
        synonyms: splitList_(r.synonyms),
        body: String(r.body),
        visibility: String(r.visibility || '')
      };
    });
}

function readImages_() {
  var images = {};
  readRows_('Images').forEach(function (r) {
    var id = String(r.id).trim();
    var uri = String(r.data_uri).trim();
    if (id !== '' && uri.indexOf('data:image/') === 0) images[id] = uri;
  });
  return images;
}

// A leading = + - @ would make Sheets treat user input as a formula.
function logZeroResult_(email, query) {
  var text = String(query || '').trim().slice(0, 200);
  if (text === '') return;
  if (/^[=+\-@]/.test(text)) text = "'" + text;
  SpreadsheetApp.getActive().getSheetByName('ZeroResultLog').appendRow([new Date(), email, text]);
}

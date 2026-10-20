// Syncs Google Docs linked in Articles.doc into Articles.body and stores their images in a private Drive folder.
// Only Docs directly inside the shared articles folder are synced; images are only ever read back from the image folder.

var SYNC_TIME_BUDGET_MS = 270000;
var MAX_BODY_LENGTH = 45000;
// Larger originals keep the exported copy so opening an article stays fast.
var MAX_ORIGINAL_IMAGE_BYTES = 3 * 1024 * 1024;
var DRIVE_IMAGE_ID = /^[0-9a-f]{32}$/;

// Run once from the editor: creates the image folder (never shared) and the articles folder (shared with authors).
function setupFolders() {
  var properties = PropertiesService.getScriptProperties();
  [['IMAGE_FOLDER_ID', 'help-search-images'], ['DOCS_FOLDER_ID', 'help-search-bai-viet']].forEach(function (pair) {
    if (properties.getProperty(pair[0])) return;
    var folder = DriveApp.createFolder(pair[1]);
    properties.setProperty(pair[0], folder.getId());
    console.log(pair[1] + ': ' + folder.getUrl());
  });
}

// Time-driven trigger: re-exports only Docs changed since their last sync.
function syncDocs() {
  syncDocs_(false);
}

// Menu item: re-exports every linked Doc regardless of its last sync time.
// The sync runs as the account that clicks, so only accounts in the SYNC_EMAILS script property
// (comma-separated, each with Editor access to both Drive folders) may run it.
function syncDocsNow() {
  var email = String(Session.getEffectiveUser().getEmail() || '').trim().toLowerCase();
  var allowed = splitList_(PropertiesService.getScriptProperties().getProperty('SYNC_EMAILS'))
    .map(function (item) { return item.toLowerCase(); });
  if (email === '' || allowed.indexOf(email) === -1) {
    SpreadsheetApp.getUi().alert('Tài khoản ' + (email || 'này') +
      ' không có quyền đồng bộ ngay. Bài sẽ tự đồng bộ trong tối đa 10 phút.');
    return;
  }
  syncDocs_(true);
}

// Simple trigger: runs for every editor of the sheet; syncDocsNow checks who may actually sync.
function onOpen() {
  SpreadsheetApp.getUi().createMenu('Help Search').addItem('Đồng bộ ngay', 'syncDocsNow').addToUi();
}

function syncDocs_(force) {
  var lock = LockService.getScriptLock();
  if (!lock.tryLock(1000)) return;
  try {
    var started = Date.now();
    var sheet = SpreadsheetApp.getActive().getSheetByName('Articles');
    var values = sheet.getDataRange().getValues();
    var header = values[0].map(function (h) { return String(h).trim(); });
    var col = {};
    ['doc', 'body', 'doc_synced_at', 'doc_status'].forEach(function (name) {
      var index = header.indexOf(name);
      if (index === -1) throw new Error('Thiếu cột ' + name);
      col[name] = index + 1;
    });
    for (var i = 1; i < values.length; i++) {
      if (Date.now() - started > SYNC_TIME_BUDGET_MS) break;
      var link = String(values[i][col.doc - 1]).trim();
      if (link === '') continue;
      var row = i + 1;
      var status;
      try {
        status = syncRow_(sheet, row, col, link, values[i][col.doc_synced_at - 1], force);
      } catch (err) {
        console.error(err);
        status = 'Lỗi: ' + String(err.message).slice(0, 100);
      }
      if (status && status !== 'OK') {
        sheet.getRange(row, col.doc_status).setValue(status);
        sheet.getRange(row, col.doc_synced_at).setValue('');
      }
      SpreadsheetApp.flush();
    }
  } finally {
    lock.releaseLock();
  }
}

// Returns 'OK' after writing the body, null when the Doc is unchanged, or a Vietnamese error message.
function syncRow_(sheet, row, col, link, syncedAt, force) {
  var docId = parseDocId_(link);
  if (!docId) return 'Lỗi: link Doc không hợp lệ';
  var file;
  try {
    file = DriveApp.getFileById(docId);
  } catch (err) {
    return 'Lỗi: không mở được Doc (đã chia sẻ cho Gmail dự án chưa?)';
  }
  if (file.getMimeType() !== MimeType.GOOGLE_DOCS) return 'Lỗi: link không phải Google Doc';
  if (!isInDocsFolder_(file)) return 'Lỗi: Doc không nằm trong thư mục help-search-bai-viet';
  var updated = file.getLastUpdated();
  // Compare whole seconds: Sheets may drop the milliseconds of a stored date.
  if (!force && Object.prototype.toString.call(syncedAt) === '[object Date]' &&
      Math.floor(syncedAt / 1000) >= Math.floor(updated / 1000)) return null;
  var markdown = exportDocMarkdown_(docId);
  var originals = markdown.indexOf('data:image/') === -1 ? null : fetchOriginalImages_(docId);
  var result = extractImages_(markdown, md5Hex_, originals);
  result.images.forEach(saveImage_);
  if (result.markdown.length > MAX_BODY_LENGTH) return 'Lỗi: bài quá dài, hãy chia thành nhiều bài';
  sheet.getRange(row, col.body).setValue(sheetSafeText_(result.markdown));
  sheet.getRange(row, col.doc_synced_at).setValue(updated);
  sheet.getRange(row, col.doc_status).setValue('OK');
  return 'OK';
}

function isInDocsFolder_(file) {
  var folderId = docsFolderId_();
  var parents = file.getParents();
  while (parents.hasNext()) {
    if (parents.next().getId() === folderId) return true;
  }
  return false;
}

function exportDocMarkdown_(docId) {
  var response = UrlFetchApp.fetch(
    'https://www.googleapis.com/drive/v3/files/' + encodeURIComponent(docId) + '/export?mimeType=text%2Fmarkdown',
    { headers: { Authorization: 'Bearer ' + ScriptApp.getOAuthToken() }, muteHttpExceptions: true }
  );
  var code = response.getResponseCode();
  if (code !== 200) {
    if (response.getContentText().indexOf('exportSizeLimitExceeded') !== -1) {
      throw new Error('Doc quá lớn để xuất (>10MB, thường do nhiều ảnh), hãy chia bài');
    }
    throw new Error('export ' + code);
  }
  return response.getContentText('UTF-8');
}

// The Markdown export scales images down to their size on the page; the Docs API links to the originals.
// Returns one { type, base64 } or null per inline object in body order, or null if the Docs API call fails,
// in which case the exported copies are kept.
function fetchOriginalImages_(docId) {
  var doc;
  try {
    doc = Docs.Documents.get(docId);
  } catch (err) {
    console.warn('Docs API: ' + err.message);
    return null;
  }
  var ids = [];
  collectInlineObjectIds_(doc.body && doc.body.content, ids);
  var uris = ids.map(function (id) {
    var object = doc.inlineObjects && doc.inlineObjects[id];
    var embedded = object && object.inlineObjectProperties && object.inlineObjectProperties.embeddedObject;
    return (embedded && embedded.imageProperties && embedded.imageProperties.contentUri) || null;
  });
  var requests = uris.filter(Boolean).map(function (uri) { return { url: uri, muteHttpExceptions: true }; });
  var responses;
  try {
    responses = requests.length ? UrlFetchApp.fetchAll(requests) : [];
  } catch (err) {
    console.warn('Tải ảnh gốc: ' + err.message);
    return null;
  }
  return uris.map(function (uri) {
    if (!uri) return null;
    var response = responses.shift();
    if (response.getResponseCode() !== 200) return null;
    var blob = response.getBlob();
    var type = String(blob.getContentType() || '');
    var bytes = blob.getBytes();
    if (type.indexOf('image/') !== 0 || bytes.length > MAX_ORIGINAL_IMAGE_BYTES) return null;
    return { type: type.slice(6), base64: Utilities.base64Encode(bytes) };
  });
}

function collectInlineObjectIds_(content, ids) {
  (content || []).forEach(function (element) {
    if (element.paragraph) {
      (element.paragraph.elements || []).forEach(function (item) {
        if (item.inlineObjectElement) ids.push(item.inlineObjectElement.inlineObjectId);
      });
    }
    if (element.table) {
      (element.table.tableRows || []).forEach(function (row) {
        (row.tableCells || []).forEach(function (cell) { collectInlineObjectIds_(cell.content, ids); });
      });
    }
    if (element.tableOfContents) collectInlineObjectIds_(element.tableOfContents.content, ids);
  });
}

function md5Hex_(base64) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, Utilities.base64Decode(base64))
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

function imageFolder_() {
  var id = PropertiesService.getScriptProperties().getProperty('IMAGE_FOLDER_ID');
  if (!id) throw new Error('Chưa chạy setupFolders');
  return DriveApp.getFolderById(id);
}

function docsFolderId_() {
  var id = PropertiesService.getScriptProperties().getProperty('DOCS_FOLDER_ID');
  if (!id) throw new Error('Chưa chạy setupFolders');
  return id;
}

// Returns the first non-trashed file with this name in the image folder, or null.
function findImageFile_(name) {
  var files = imageFolder_().getFilesByName(name);
  while (files.hasNext()) {
    var file = files.next();
    if (!file.isTrashed()) return file;
  }
  return null;
}

function saveImage_(image) {
  if (findImageFile_(image.id)) return;
  imageFolder_().createFile(Utilities.newBlob(Utilities.base64Decode(image.base64), image.mimeType, image.id));
}

// Looks the id up by name inside the image folder only, so no other Drive file can be read through the API.
function readDriveImage_(id) {
  if (!DRIVE_IMAGE_ID.test(id)) return null;
  var file = findImageFile_(id);
  if (!file) return null;
  var blob = file.getBlob();
  return 'data:' + blob.getContentType() + ';base64,' + Utilities.base64Encode(blob.getBytes());
}

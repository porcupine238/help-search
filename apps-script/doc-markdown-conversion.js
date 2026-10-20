// Pure helpers for turning a Google Docs Markdown export into an article body.
// No Google services here, so the tests can load this file in Node.

// Matches /document/d/<id>, /document/u/0/d/<id> and open?id=<id>; non-Doc files are rejected later by MIME type.
var DOC_LINK_ID = /(?:\/d\/|[?&]id=)([A-Za-z0-9_-]{20,})/;
var BARE_DOC_ID = /^[A-Za-z0-9_-]{20,}$/;
var IMAGE_DEFINITION = /^\[([^\]]+)\]:[ \t]*<?data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+\/=]+)>?[ \t]*\r?$/gm;
var IMAGE_REFERENCE = /!\[([^\]]*)\]\[([^\]]+)\]/g;
var INLINE_IMAGE = /!\[([^\]]*)\]\(data:image\/([a-z0-9.+-]+);base64,([A-Za-z0-9+\/=]+)\)/g;

// Accepts a Doc link or a bare Doc ID; returns the ID or null.
function parseDocId_(value) {
  var text = String(value || '').trim();
  var match = DOC_LINK_ID.exec(text);
  if (match) return match[1];
  return BARE_DOC_ID.test(text) ? text : null;
}

// Replaces embedded base64 images with img:<id> links and returns the images once each.
// Only the end of the text is trimmed: trailing double spaces inside are Markdown hard breaks.
function extractImages_(markdown, hashBase64) {
  var images = [];
  var seen = {};
  function addImage(type, base64) {
    var id = hashBase64(base64);
    if (!seen[id]) {
      seen[id] = true;
      images.push({ id: id, mimeType: 'image/' + type, base64: base64 });
    }
    return id;
  }

  var refs = {};
  var text = String(markdown).replace(IMAGE_DEFINITION, function (match, ref, type, base64) {
    refs[ref] = { type: type, base64: base64 };
    return '';
  });
  text = text.replace(IMAGE_REFERENCE, function (match, alt, ref) {
    var image = refs[ref];
    return image ? '![' + alt + '](img:' + addImage(image.type, image.base64) + ')' : match;
  });
  text = text.replace(INLINE_IMAGE, function (match, alt, type, base64) {
    return '![' + alt + '](img:' + addImage(type, base64) + ')';
  });
  return { markdown: text.replace(/\s+$/, ''), images: images };
}

// A leading = + - @ would make Sheets treat the text as a formula.
function sheetSafeText_(text) {
  return /^[=+\-@]/.test(text) ? "'" + text : text;
}

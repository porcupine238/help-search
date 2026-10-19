// Web app entry points. No sheet data is returned before the ID token is verified; restricted articles also require the Users list.

function doGet() {
  return json_({ ok: true, service: 'help-search' });
}

function doPost(e) {
  var request;
  try {
    request = JSON.parse((e && e.postData && e.postData.contents) || '');
  } catch (err) {
    return json_({ ok: false, error: 'bad_request' });
  }
  if (!request || typeof request !== 'object') return json_({ ok: false, error: 'bad_request' });
  try {
    var email = verifyIdToken_(request.idToken);
    if (!email) return json_({ ok: false, error: 'invalid_token' });
    if (request.action === 'bootstrap') {
      var visible = filterForReader_(readArticles_(), readImages_(), isAllowed_(email));
      return json_({ ok: true, email: email, articles: visible.articles, images: visible.images });
    }
    if (request.action === 'logZero') {
      logZeroResult_(email, request.query);
      return json_({ ok: true });
    }
    return json_({ ok: false, error: 'bad_request' });
  } catch (err) {
    console.error(err);
    return json_({ ok: false, error: 'server_error' });
  }
}

function json_(payload) {
  return ContentService.createTextOutput(JSON.stringify(payload))
    .setMimeType(ContentService.MimeType.JSON);
}

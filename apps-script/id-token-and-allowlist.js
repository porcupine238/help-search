// Verifies Google ID tokens and checks the Users allowlist.
// The allowlist is cached for 5 minutes and cleared by an on-change trigger on the sheet.

var ALLOWLIST_CACHE_KEY = 'allowlist';
var ALLOWLIST_TTL_SECONDS = 300;
var TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];
var TOKEN_CACHE_MAX_SECONDS = 21600;

// Returns the lowercase verified email, or null when the token is not acceptable.
// A verified token is cached under its SHA-256 until it expires, so opening an article with
// many images costs one tokeninfo call instead of one per image.
function verifyIdToken_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) return null;
  var cache = CacheService.getScriptCache();
  var cacheKey = 'token:' + sha256Hex_(idToken);
  var cached = cache.get(cacheKey);
  var verified = cached ? JSON.parse(cached) : verifyIdTokenRemotely_(idToken);
  if (!verified || !(verified.exp * 1000 > Date.now())) return null;
  if (!cached) {
    var ttl = Math.min(Math.floor(verified.exp - Date.now() / 1000), TOKEN_CACHE_MAX_SECONDS);
    if (ttl > 0) cache.put(cacheKey, JSON.stringify(verified), ttl);
  }
  return verified.email;
}

// Asks Google to validate the token; returns { email, exp } or null.
function verifyIdTokenRemotely_(idToken) {
  var response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) return null;
  var claims = JSON.parse(response.getContentText());
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId || claims.aud !== clientId) return null;
  if (TOKEN_ISSUERS.indexOf(claims.iss) === -1) return null;
  if (String(claims.email_verified) !== 'true') return null;
  var email = String(claims.email || '').trim().toLowerCase();
  return email === '' ? null : { email: email, exp: Number(claims.exp) };
}

function sha256Hex_(text) {
  return Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, text, Utilities.Charset.UTF_8)
    .map(function (b) { return ('0' + ((b + 256) % 256).toString(16)).slice(-2); })
    .join('');
}

function isAllowed_(email) {
  var cache = CacheService.getScriptCache();
  var cached = cache.get(ALLOWLIST_CACHE_KEY);
  var allowlist = cached ? JSON.parse(cached) : null;
  if (!allowlist) {
    allowlist = readAllowlist_();
    cache.put(ALLOWLIST_CACHE_KEY, JSON.stringify(allowlist), ALLOWLIST_TTL_SECONDS);
  }
  return allowlist.indexOf(email) !== -1;
}

function clearAllowlistCache() {
  CacheService.getScriptCache().remove(ALLOWLIST_CACHE_KEY);
}

// Run once from the editor: authorizes the scopes and installs the on-change trigger
// and the 10-minute Doc sync trigger.
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    var handler = trigger.getHandlerFunction();
    if (handler === 'clearAllowlistCache' || handler === 'syncDocs') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('clearAllowlistCache')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
  ScriptApp.newTrigger('syncDocs').timeBased().everyMinutes(10).create();
}

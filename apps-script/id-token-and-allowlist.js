// Verifies Google ID tokens and checks the Users allowlist.
// The allowlist is cached for 5 minutes and cleared by an on-change trigger on the sheet.

var ALLOWLIST_CACHE_KEY = 'allowlist';
var ALLOWLIST_TTL_SECONDS = 300;
var TOKEN_ISSUERS = ['accounts.google.com', 'https://accounts.google.com'];

// Returns the lowercase verified email, or null when the token is not acceptable.
function verifyIdToken_(idToken) {
  if (typeof idToken !== 'string' || idToken.length < 20 || idToken.length > 4096) return null;
  var response = UrlFetchApp.fetch(
    'https://oauth2.googleapis.com/tokeninfo?id_token=' + encodeURIComponent(idToken),
    { muteHttpExceptions: true }
  );
  if (response.getResponseCode() !== 200) return null;
  var claims = JSON.parse(response.getContentText());
  var clientId = PropertiesService.getScriptProperties().getProperty('CLIENT_ID');
  if (!clientId || claims.aud !== clientId) return null;
  if (TOKEN_ISSUERS.indexOf(claims.iss) === -1) return null;
  if (Number(claims.exp) * 1000 <= Date.now()) return null;
  if (String(claims.email_verified) !== 'true') return null;
  var email = String(claims.email || '').trim().toLowerCase();
  return email === '' ? null : email;
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

// Run once from the editor: authorizes the scopes and installs the on-change trigger.
function installTriggers() {
  ScriptApp.getProjectTriggers().forEach(function (trigger) {
    if (trigger.getHandlerFunction() === 'clearAllowlistCache') ScriptApp.deleteTrigger(trigger);
  });
  ScriptApp.newTrigger('clearAllowlistCache')
    .forSpreadsheet(SpreadsheetApp.getActive())
    .onChange()
    .create();
}

// Decides which articles and images a signed-in reader receives.
// Only the exact value "public" is public; anything else is treated as restricted.

var IMAGE_REF_PATTERN = /\(img:([^)\s]+)\)/g;

function isPublicVisibility_(value) {
  return String(value || '').trim().toLowerCase() === 'public';
}

function filterForReader_(articles, images, canReadRestricted) {
  var visible = articles.filter(function (a) { return canReadRestricted || isPublicVisibility_(a.visibility); });
  var usedImages = {};
  visible.forEach(function (a) {
    var match;
    IMAGE_REF_PATTERN.lastIndex = 0;
    while ((match = IMAGE_REF_PATTERN.exec(a.body)) !== null) {
      if (Object.prototype.hasOwnProperty.call(images, match[1])) usedImages[match[1]] = images[match[1]];
    }
  });
  return {
    articles: visible.map(function (a) {
      return { id: a.id, title: a.title, tags: a.tags, synonyms: a.synonyms, body: a.body };
    }),
    images: usedImages
  };
}

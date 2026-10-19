// Vietnamese-aware article search, independent of the DOM.
// Scoring: whole-query match on a tag/synonym (+10, once) > per-token tag/synonym word (+4)
// > per-token title word (+3) > per-token body word (+1). Ties sort by title.

export function normalize(text) {
  return String(text ?? '')
    .toLowerCase()
    .replace(/đ/g, 'd')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

export function buildIndex(articles) {
  return articles.map((article) => ({
    article,
    title: normalize(article.title),
    terms: [
      ...(article.tags ?? []).map((tag) => normalize(String(tag).replace(/-/g, ' '))),
      ...(article.synonyms ?? []).map((synonym) => normalize(synonym)),
    ].filter((term) => term !== ''),
    body: normalize(article.body),
  }));
}

const hasWord = (text, token) => (' ' + text + ' ').includes(' ' + token + ' ');

export function search(index, query) {
  const q = normalize(query);
  if (q === '') return [];
  const tokens = q.split(' ').filter((token) => token.length >= 2);

  return index
    .map((entry) => {
      let score = 0;
      if (entry.terms.some((term) => term.includes(q) || (term.length >= 3 && q.includes(term)))) {
        score += 10;
      }
      for (const token of tokens) {
        if (entry.terms.some((term) => hasWord(term, token))) score += 4;
        if (hasWord(entry.title, token)) score += 3;
        if (hasWord(entry.body, token)) score += 1;
      }
      return { entry, score };
    })
    .filter(({ score }) => score > 0)
    .sort((a, b) => b.score - a.score || a.entry.article.title.localeCompare(b.entry.article.title, 'vi'))
    .map(({ entry }) => entry.article);
}

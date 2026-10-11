import {SIMPLE_PATTERNS, COMPLEX_PATTERNS} from './music.js?v=1.5.0';

const normalized = value => String(value ?? '').normalize('NFKC').toLowerCase().trim();
export function patternChoices({group = 'simple', feel = 'all', query = '', favorites = [], favoritesOnly = false} = {}) {
  const terms = normalized(query).split(/\s+/).filter(Boolean);
  const liked = new Set(favorites);
  const choices = group === 'simple' ? SIMPLE_PATTERNS : group === 'complex' ? COMPLEX_PATTERNS : [];
  return choices.filter(pattern => {
    if (pattern.complexity !== group || (feel !== 'all' && pattern.feel !== feel) || (favoritesOnly && !liked.has(pattern.id))) return false;
    const text = normalized(`${pattern.name} ${pattern.id} ${pattern.description}`);
    return terms.every(term => text.includes(term));
  });
}
export function adjacentPattern(currentId, choices, direction) {
  if (!choices.length) return null;
  const index = choices.findIndex(pattern => pattern.id === currentId);
  if (index < 0) return direction > 0 ? choices[0].id : null;
  return choices[index + Math.sign(direction)]?.id ?? null;
}

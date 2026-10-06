/* Text fields across the subject-specific task formats. Keep their original paths. */
globalThis.TeacherMaterialEditor = (() => {
  const collections = /^(?:materials|materialien|material|zusatz_materialien)(?:_[a-z0-9]+)?$/i;
  const sources = /^(?:primary_text(?:_[ab])?|compare_text|article_text|source_text(?:_[a-z]+)?|latin_text(?:_[ab])?|reading_text|text_de|text_en|ausgangstext|quellentext|sachtext)$/i;
  const labels = { primary_text: 'Ausgangstext', primary_text_a: 'Quellentext Teil A', primary_text_b: 'Quellentext Teil B', compare_text: 'Vergleichstext', article_text: 'Artikel / Ausgangstext', source_text_de: 'Deutscher Ausgangstext', source_text_en: 'Englischer Ausgangstext', latin_text: 'Lateinischer Ausgangstext', latin_text_a: 'Lateinischer Text Teil A', latin_text_b: 'Lateinischer Text Teil B', reading_text: 'Lesetext' };
  const isImage = value => /^(?:bild|foto|image|karikatur|diagramm|stammbaum)$/i.test(String(value?.typ || value?.type || ''));
  const isText = value => typeof value === 'string' && !/^(?:data:|https?:\/\/|\[KV\])/.test(value);
  const safeKey = key => !['__proto__', 'prototype', 'constructor'].includes(key) && !/^(?:_|student|solution|answer|muster|rubric)/i.test(key);
  function collect(task) {
    const result = [];
    function material(value, path, context) {
      if (isText(value)) { result.push({ path, label: context, value, aliases: [] }); return; }
      if (Array.isArray(value)) { value.forEach((entry, i) => material(entry, [...path, i], context + ' ' + (i + 1))); return; }
      if (!value || typeof value !== 'object' || isImage(value)) return;
      const keys = ['inhalt','content','text'].filter(key => isText(value[key]));
      const key = keys.find(key => value[key].trim()) || keys[0];
      if (key) {
        result.push({ path: [...path, key], label: context + ': ' + String(value.titel || value.title || value.nr || value.id || 'Text'), value: value[key], aliases: keys.filter(other => other !== key && value[other] === value[key]).map(other => [...path, other]) });
      } else {
        walk(value, path, context);
      }
    }
    function walk(value, path = [], context = '') {
      if (!value || typeof value !== 'object' || path.length > 14) return;
      for (const [key, item] of Object.entries(value)) {
        if (!safeKey(key)) continue;
        const next = [...path, Array.isArray(value) ? Number(key) : key];
        if (collections.test(key)) material(item, next, (context ? context + ' · ' : '') + 'Material');
        else if (sources.test(key) && isText(item)) {
          if (key.startsWith('primary_text') && /^(?:bild|foto|image|karikatur)$/.test(value[key.replace('text','type')] || value.primary_type || '')) continue;
          result.push({ path: next, label: (context ? context + ' · ' : '') + (labels[key] || 'Ausgangstext'), value: item, aliases: [] });
        } else if (item && typeof item === 'object') {
          const part = Array.isArray(value) ? String(item.title || item.titel || item.id || item.nr || Number(key) + 1) : key.replaceAll('_', ' ');
          walk(item, next, [context, part].filter(Boolean).join(' · '));
        }
      }
    }
    walk(task);
    return result;
  }
  function apply(task, field, text) {
    for (const path of [field.path, ...field.aliases]) {
      if (path.some(key => !safeKey(String(key)))) throw new Error('Ungültiges Materialfeld.');
      let parent = task;
      for (const key of path.slice(0, -1)) {
        if (!parent || !Object.hasOwn(parent, key)) throw new Error('Material wurde inzwischen geändert.');
        parent = parent[key];
      }
      const key = path.at(-1);
      if (!parent || !Object.hasOwn(parent, key) || typeof parent[key] !== 'string') throw new Error('Materialfeld nicht gefunden.');
      parent[key] = text;
    }
  }
  return { collect, apply };
})();

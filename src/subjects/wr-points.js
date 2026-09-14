// Die Teilaufgaben sind die maßgebliche Quelle; Summen werden nicht der KI überlassen.
export function sumWRPoints(blocks) {
  if (!Array.isArray(blocks) || !blocks.length) throw new Error('Aufgabenblöcke fehlen.');
  return blocks.reduce((total, block) => {
    if (!Array.isArray(block.teilaufgaben) || !block.teilaufgaben.length) throw new Error('Teilaufgaben fehlen.');
    const sum = block.teilaufgaben.reduce((subtotal, task) => {
      if (!Number.isInteger(task.be) || task.be <= 0) throw new Error('Ungültige Bewertungseinheiten.');
      return subtotal + task.be;
    }, 0);
    block.be_gesamt = sum;
    return total + sum;
  }, 0);
}

export function validateWRPoints(data, targets) {
  let total = 0;
  for (const [key, target] of Object.entries(targets)) {
    const actual = sumWRPoints(data[key]);
    if (actual !== target) throw new Error(`${key}: ${actual} statt ${target} BE.`);
    total += actual;
  }
  data.gesamt_be = total;
  return data;
}

export function wrNotenpunkte(achieved, maximum) {
  if (!Number.isFinite(achieved) || achieved < 0 || achieved > maximum || !(maximum > 0)) return null;
  const percent = achieved / maximum * 100;
  return [[95,15],[90,14],[85,13],[80,12],[75,11],[70,10],[65,9],[60,8],[55,7],[50,6],[45,5],[40,4],[33,3],[27,2],[20,1],[0,0]].find(([threshold]) => percent >= threshold)[1];
}

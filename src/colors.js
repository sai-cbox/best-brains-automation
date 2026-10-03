'use strict';
// Cell background -> attendance. Rules settled by the Liberty Hill back test:
//   yellow / light yellow = absent; pink, orange, white, cyan = present (pink carries "PT Yes").
const to255 = c => Math.round((c ?? 0) * 255);

/** colour: Google Sheets API {red,green,blue} floats 0..1 (missing channel = 0), or null for no fill. */
function classifyColour(colour) {
  if (!colour) return 'white';
  const r = to255(colour.red), g = to255(colour.green), b = to255(colour.blue);
  if (r === 255 && g === 255 && b === 255) return 'white';
  if (r >= 250 && g >= 250 && b <= 200) return 'yellow';          // 255,255,0 and light yellows
  if (r === 244 && g === 204 && b === 204) return 'pink';
  if (r === 255 && g === 153 && b === 0) return 'orange';
  if (r === 0 && g === 255 && b === 255) return 'cyan';
  return 'other';
}

const isAbsent = name => name === 'yellow';

module.exports = { classifyColour, isAbsent, CYAN: { red: 0, green: 1, blue: 1 } };

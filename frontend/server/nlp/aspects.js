// Aspect extraction for aspect-based sentiment: which product aspects (battery, delivery, fit...) does a clause talk about?
// Sentiment for each aspect then comes from the trained model, applied to the clause that mentions it.
const A = (label, terms) => ({ label, re: new RegExp('\\b(?:' + terms.join('|') + ')\\b', 'i') })

export const ASPECTS = {
  battery: A('Battery', ['batter\\w*', 'charg\\w*', 'mah', 'standby', 'backup', 'drain\\w*', 'power bank']),
  camera: A('Camera', ['camera\\w*', 'photo\\w*', 'pictures?', 'selfie\\w*', 'lens', 'zoom', 'video quality', 'low[- ]light', 'portrait', 'megapixel\\w*']),
  display: A('Display', ['display\\w*', 'screens?', 'brightness', 'resolution', 'touch\\w*', 'refresh rate', 'amoled', 'oled', 'panel', 'picture quality', 'pixel\\w*', '4k', 'hdr', 'viewing angles?']),
  sound: A('Sound', ['sound\\w*', 'audio', 'bass', 'treble', 'volume', 'noise cancel\\w*', 'anc', 'mic', 'microphone', 'call quality', 'speakers?', 'music', 'clarity', 'loudness']),
  performance: A('Performance', ['performance', 'speed\\w*', 'lag\\w*', 'laggy', 'hang\\w*', 'processor', 'smooth\\w*', 'gaming', 'fps', 'multitask\\w*', 'heat\\w*', 'overheat\\w*', 'cooling', 'cools?', 'suction', 'powerful', 'power', 'airflow', 'crush\\w*', 'grind\\w*', 'boots?', 'startup', 'frame rate', 'print\\w*']),
  connectivity: A('Connectivity', ['bluetooth', 'pair\\w*', 'connect\\w*', 'wi-?fi', 'disconnect\\w*', 'range', 'latency', 'signal', 'network', '5g']),
  comfort: A('Comfort', ['comfort\\w*', 'ergonomic', 'grip', 'cushion\\w*', 'soles?', 'insoles?', 'soft', 'snug', 'ear ?cups?', 'ear tips?', 'fatigue', 'heavy', 'lightweight', 'weight', 'posture', 'buttons?', 'keys?', 'typing', 'trigger\\w*', 'pain\\w*', 'hurt\\w*', 'ache\\w*']),
  fit: A('Size & fit', ['fit', 'fits', 'fitting', 'fitted', 'size\\w*', 'tight', 'loose', 'true to size', 'length', 'waist', 'small', 'large', 'big', 'narrow']),
  fabric: A('Fabric & material', ['fabric', 'material', 'cotton', 'stretch\\w*', 'stitch\\w*', 'shrunk', 'shrink\\w*', 'wash\\w*', 'faded?', 'fading', 'thread', 'denim', 'leather', 'zips?', 'zippers?', 'lining', 'thin', 'thick', 'itchy', 'breathable', 'pilling', 'silk']),
  design: A('Design & looks', ['design\\w*', 'looks?', 'looking', 'style', 'stylish', 'colou?rs?', 'aesthetic', 'sleek', 'elegant', 'ugly', 'beautiful', 'gorgeous']),
  quality: A('Build & quality', ['quality', 'build', 'sturdy', 'flimsy', 'durab\\w*', 'cheaply', '(?:looks?|feels?) cheap', 'broke\\w*', 'broken', 'defect\\w*', 'crack\\w*', 'scratch\\w*', 'genuine', 'original', 'fake', 'counterfeit', 'stopped working', 'solid', 'finishing']),
  value: A('Value for money', ['price\\w*', 'pricey', 'worth', 'money', 'cost\\w*', 'expensive', 'overpriced', 'affordable', 'budget', 'deals?', 'discount\\w*', 'bargain', 'paisa', 'vasool', 'rupees?', 'cheaper']),
  delivery: A('Delivery', ['deliver\\w*', 'shipping', 'shipped', 'ship', 'arriv\\w*', 'courier', 'dispatch\\w*', 'late', 'delay\\w*', 'on time', 'tracking', 'parcel']),
  packaging: A('Packaging', ['packag\\w*', 'packing', 'packed', 'box', 'wrapped', 'wrapping', 'sealed', 'seal', 'bubble wrap', 'carton', 'tampered', 'damaged']),
  service: A('Seller & service', ['seller', 'customer (?:service|care|support)', 'support', 'refund\\w*', 'returns?', 'returned', 'replace\\w*', 'warranty', 'technician', 'installation', 'after[- ]sales', 'service', 'complaint']),
  noise: A('Noise level', ['nois\\w*', 'quiet\\w*', 'silent\\w*', 'vibrat\\w*', 'humming', 'loud\\w*']),
  ease: A('Ease of use', ['easy to (?:use|set ?up|install|operate|carry)', 'set ?up', 'user[- ]friendly', 'manual', 'instructions', 'complicated', 'confusing', 'app', 'interface', 'intuitive', 'simple to']),
  cleaning: A('Cleaning', ['clean\\w*', 'dishwasher', 'maintenance', 'stain\\w*', 'residue', 'non[- ]stick', 'scrub\\w*']),
  skin: A('Skin & hair feel', ['skin\\w*', 'face', 'hair\\w*', 'scalp', 'rash\\w*', 'irritat\\w*', 'greas\\w*', 'oily', 'dry\\w*', 'moistur\\w*', 'hydrat\\w*', 'break ?outs?', 'pimples?', 'acne', 'pores?', 'white cast', 'absorb\\w*', 'sticky', 'frizz\\w*', 'dandruff', 'shiny']),
  fragrance: A('Fragrance', ['fragrance', 'smell\\w*', 'scent\\w*', 'perfume', 'odou?r', 'aroma', 'pungent']),
  effectiveness: A('Effectiveness', ['effective\\w*', 'results?', 'coverage', 'shade', 'pigment\\w*', 'long[- ]lasting', 'spf', 'sun ?protection', 'trim\\w*', 'shave\\w*', 'shaving', 'mascara', 'foundation', 'lipstick']),
}
export const ALL_ASPECTS = Object.keys(ASPECTS)
export const aspectLabel = (k) => ASPECTS[k]?.label || k

const UNIVERSAL = ['value', 'quality', 'delivery', 'packaging', 'service', 'design']
const BY_SUB = {
  mobiles: { Smartphone: ['battery', 'camera', 'display', 'performance', 'sound', 'connectivity'], Tablet: ['battery', 'display', 'performance', 'sound', 'connectivity'] },
  laptops: { Laptop: ['battery', 'display', 'performance', 'sound', 'connectivity', 'comfort'], Keyboard: ['comfort', 'connectivity', 'battery'], Mouse: ['comfort', 'connectivity', 'battery'], Monitor: ['display', 'connectivity'], Printer: ['performance', 'connectivity', 'ease'], Storage: ['performance'] },
  audio: { Earbuds: ['sound', 'battery', 'connectivity', 'comfort'], Headphones: ['sound', 'battery', 'connectivity', 'comfort'], Speaker: ['sound', 'battery', 'connectivity'], Smartwatch: ['battery', 'display', 'connectivity', 'comfort'] },
  footwear: { '*': ['comfort', 'fit', 'fabric'] },
  mens: { Shoes: ['comfort', 'fit', 'fabric'], 'Wrist Watch': [], Bags: ['fabric', 'comfort'], Eyewear: [], Accessories: ['fabric'], '*': ['fit', 'fabric', 'comfort'] },
  womens: { 'Wrist Watch': [], Bags: ['fabric', 'comfort'], Jewellery: [], '*': ['fit', 'fabric', 'comfort'] },
  beauty: { Grooming: ['performance', 'ease', 'noise'], Fragrance: ['fragrance'], Makeup: ['effectiveness', 'skin'], Lipstick: ['effectiveness', 'skin'], '*': ['skin', 'fragrance', 'effectiveness'] },
  appliances: { Television: ['display', 'sound', 'connectivity', 'performance'], Fan: ['performance', 'noise', 'ease'], 'Room Heater': ['performance', 'noise', 'ease'], 'Air Conditioner': ['performance', 'noise', 'ease'], Refrigerator: ['performance', 'noise', 'ease'], 'Water Purifier': ['performance', 'ease', 'cleaning'], '*': ['performance', 'noise', 'ease', 'cleaning'] },
  kitchen: { Tableware: ['cleaning'], Storage: ['performance', 'cleaning'], 'Mixer & Blender': ['performance', 'noise', 'ease', 'cleaning'], '*': ['performance', 'ease', 'cleaning'] },
  gaming: { Console: ['performance', 'connectivity', 'ease'], Controller: ['comfort', 'connectivity', 'performance'], Keyboard: ['comfort', 'connectivity', 'performance'], Mouse: ['comfort', 'connectivity', 'performance'], Mousepad: ['comfort'], Headphones: ['sound', 'comfort', 'connectivity'], 'Gaming Chair': ['comfort'], Webcam: ['camera', 'connectivity'], Microphone: ['sound', 'connectivity'], '*': ['performance'] },
}
/** Aspects that make sense for this product (e.g. no "battery" for a kurta). */
export function aspectsFor(p) {
  const table = BY_SUB[p.catId] || {}
  const own = table[p.sub] ?? table['*'] ?? []
  return [...new Set([...own, ...UNIVERSAL])]
}

// "Camera quality", "picture quality", "cotton quality"... are about the camera/display/fabric, not generic build quality.
const SPECIFIC_QUALITY = /\b(?:camera|photo|picture|image|video|sound|audio|call|print|screen|display|fabric|cotton|material|leather|stitching)\s+quality\b/gi
const NON_COLOUR_DESIGN = /\b(?:design\w*|looks?|looking|style|stylish|aesthetic|sleek|elegant|ugly|beautiful|gorgeous)\b/i
const COLOUR_CONTEXT = ['camera', 'display', 'fabric', 'effectiveness', 'skin']

/** Which aspects does this piece of text mention? */
export function mentioned(text, allowed = ALL_ASPECTS) {
  const keys = allowed.filter((k) => {
    if (k === 'quality') return ASPECTS.quality.re.test(text.replace(SPECIFIC_QUALITY, ' '))
    return ASPECTS[k].re.test(text)
  })
  // "colours are natural" in a camera/display sentence is not a comment on the product's design.
  if (keys.includes('design') && !NON_COLOUR_DESIGN.test(text) && keys.some((k) => COLOUR_CONTEXT.includes(k))) keys.splice(keys.indexOf('design'), 1)
  return keys
}

const CONTRAST_SPLIT = /\s*(?:;|\b(?:but|however|although|though|while|whereas|except|yet)\b)\s*/i
const LIST_SPLIT = /\s*(?:,|\band\b|\bplus\b|\bwith\b)\s*/i
/**
 * Splits a sentence into clauses so that "great camera but terrible battery" yields two opinions.
 * Each clause carries its parent sentence, used as fallback when a short clause has no sentiment of its own.
 */
export function clauses(sentence, allowed = ALL_ASPECTS) {
  const out = []
  for (const seg of sentence.split(CONTRAST_SPLIT).filter((s) => /[a-z0-9]/i.test(s))) {
    const aspects = mentioned(seg, allowed)
    if (aspects.length > 1) {
      const parts = seg.split(LIST_SPLIT).filter((s) => /[a-z0-9]/i.test(s))
      const withAspect = parts.filter((s) => mentioned(s, allowed).length)
      if (withAspect.length > 1) { for (const s of parts) out.push({ text: s, parent: seg }); continue }
    }
    out.push({ text: seg, parent: seg })
  }
  return out
}

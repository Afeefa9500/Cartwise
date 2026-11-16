// DEMO review text. The catalogue only has star averages and counts, so this module writes a deterministic set of
// plausible customer reviews per product (seeded by the product id, so they never change between runs).
// Each product gets hidden per-aspect strengths and weaknesses; the NLP pipeline (server/nlp) has to rediscover them
// from the text alone. Replace `reviewsFor` with real review data and nothing else needs to change.
import { hash, rng } from '../src/data.js'
import { aspectsFor } from './nlp/aspects.js'

const POS = {
  battery: ['The battery easily lasts a full day with heavy use.', 'Battery backup is superb and charging is quick.', 'Charges fast and the battery stays strong for two days.', 'Great battery life, I barely think about the charger.', 'Battery performance is excellent even with the screen on all day.', 'Standby time is impressive.'],
  camera: ['The camera takes stunning, sharp photos even in low light.', 'Photos look crisp and the colours are natural.', 'Camera quality is superb, the portrait mode is lovely.', 'Selfies come out great and the video quality is smooth.', 'The zoom is surprisingly good for this price.', 'Pictures are detailed and the camera app is quick.'],
  display: ['The display is bright, sharp and a joy for videos.', 'Screen quality is gorgeous with vivid colours.', 'Touch response is smooth and the screen is very bright outdoors.', 'The panel has great viewing angles and the resolution is crisp.', 'Picture quality is fantastic, the colours really pop.'],
  sound: ['Sound quality is crisp and the bass is deep.', 'The audio is rich and the volume goes loud without distortion.', 'Excellent sound, vocals are clear and the bass is punchy.', 'Noise cancellation works brilliantly and the mic is clear on calls.', 'Call quality is clear and the speakers sound full.'],
  performance: ['Performance is super smooth with no lag at all.', 'It handles gaming and multitasking without any heating.', 'Very fast and responsive, apps open instantly.', 'The processor is powerful and everything runs smoothly.', 'Powerful performance and it stays cool even under load.', 'Cooling is excellent and it reaches the temperature quickly.', 'Suction power is strong and it cleans well.'],
  connectivity: ['Bluetooth pairing was instant and the connection is rock solid.', 'The connection never drops and the range is great.', 'Connects quickly to my phone and stays connected.', 'WiFi and bluetooth connectivity are both stable.'],
  comfort: ['Very comfortable, I can wear it for hours without any fatigue.', 'The cushioning is great and it feels soft and snug.', 'Lightweight and comfortable, the grip is excellent.', 'Ergonomic design and the buttons feel great under the fingers.', 'Comfortable even after a full day, no pain at all.'],
  fit: ['Fits perfectly and the size is true to size.', 'The fit is just right, not too tight and not loose.', 'Size is exactly as per the chart and the length is perfect.', 'Great fit, I ordered my usual size and it was spot on.'],
  fabric: ['The fabric is soft, breathable and feels premium.', 'Stitching is neat and the material is thick and durable.', 'Cotton quality is lovely and the colour did not fade after washing.', 'The material is stretchy and comfortable, no shrinking after a wash.', 'Leather feels genuine and the zip is smooth.'],
  design: ['The design is sleek and it looks even better in person.', 'Looks stylish and I got many compliments.', 'Beautiful colour and the finish looks elegant.', 'Love the design, it looks premium.', 'Gorgeous look and the colours match the photos.'],
  quality: ['Build quality is solid and it feels sturdy.', 'The quality is excellent, it feels premium and durable.', 'Genuine product with great finishing.', 'Very well built, nothing feels flimsy.', 'Original product and the quality is top notch.'],
  value: ['Totally worth the price, great value for money.', 'Paisa vasool, much better than other options at this price.', 'Got it at a great discount and it is worth every rupee.', 'Very affordable for what it offers.', 'Excellent deal for the money.'],
  delivery: ['Delivery was super fast, it arrived a day early.', 'Delivered on time and the tracking was accurate.', 'Shipping was quick and the courier was polite.', 'It arrived earlier than promised.'],
  packaging: ['The packaging was neat and everything arrived intact.', 'Well packed with bubble wrap and the box was sealed.', 'Great packing, nothing was damaged.', 'Sealed box and careful packaging.'],
  service: ['The seller was very responsive and helpful.', 'Customer service replaced it quickly with no questions asked.', 'Refund was processed in two days, smooth experience.', 'Great after sales support and the warranty card was included.', 'Installation was done on time and the technician was polite.'],
  noise: ['It runs very quietly, I hardly notice it.', 'Barely any noise even at full speed.', 'Silent operation and no vibration at all.', 'Quiet and smooth, perfect for night use.'],
  ease: ['Very easy to set up, I was using it in five minutes.', 'User friendly and the instructions are clear.', 'The app is intuitive and setup was simple.', 'Easy to use even for my parents.'],
  cleaning: ['Cleaning is effortless and the parts are dishwasher safe.', 'Easy to clean and no residue is left behind.', 'The non stick surface makes cleaning a breeze.', 'Maintenance is minimal and it wipes clean in seconds.'],
  skin: ['My skin feels soft and hydrated after a week.', 'It absorbs fast, non greasy and no breakouts.', 'Leaves my hair smooth and shiny without any dryness.', 'Gentle on my skin with no irritation at all.', 'Light texture, no white cast and no sticky feeling.'],
  fragrance: ['The fragrance is mild, pleasant and lasts for hours.', 'Smells lovely and the scent is not overpowering.', 'Lovely aroma and it stays all day.'],
  effectiveness: ['It works really well and the results are visible within days.', 'Great coverage and the shade matches perfectly.', 'Very effective and the colour is long lasting.', 'The trimmer gives a clean and even shave.', 'SPF protection is great and it layers well under makeup.'],
}
const NEG = {
  battery: ['The battery drains very fast, it barely lasts half a day.', 'Battery backup is terrible and it takes forever to charge.', 'Poor battery life, I need the charger by afternoon.', 'The charger gets hot and the battery drains overnight.', 'Battery performance is disappointing for the price.'],
  camera: ['The camera is poor, photos are blurry and grainy in low light.', 'Camera quality is disappointing and the pictures look washed out.', 'Selfies come out dull and the zoom is useless.', 'Photos are noisy and the camera app is slow.'],
  display: ['The display is dim and hard to see outdoors.', 'Screen quality is poor and the colours look washed out.', 'Touch response is laggy and the screen flickers.', 'The panel has bad viewing angles and low brightness.', 'Picture quality is disappointing, the colours look dull.'],
  sound: ['Sound quality is tinny and the bass is weak.', 'The audio is muffled and distorts at high volume.', 'Poor sound and the mic is bad on calls.', 'Noise cancellation is a joke, I can hear everything.', 'Call quality is bad and the speakers sound flat.'],
  performance: ['It lags and hangs while multitasking, very frustrating.', 'Performance is poor and it heats up quickly.', 'Slow and unresponsive, apps take forever to open.', 'The processor struggles and it overheats under load.', 'Cooling is weak and it takes ages to heat up.', 'Suction power is weak and it misses dirt.'],
  connectivity: ['Bluetooth keeps disconnecting and pairing is a hassle.', 'The connection drops every few minutes.', 'Connectivity is unstable and the range is poor.', 'It will not connect properly and the signal is weak.'],
  comfort: ['Uncomfortable after an hour, it hurts my ears.', 'The cushioning is hard and my feet ache after a short walk.', 'Heavy and uncomfortable to hold for long.', 'The buttons feel stiff and the grip is poor.', 'Not comfortable at all, it causes pain after some time.'],
  fit: ['Runs very small, the size chart is wrong.', 'The fit is terrible, it is too tight around the waist.', 'Size is completely off and the length is too short.', 'Too loose and the fit looks untidy.'],
  fabric: ['The fabric is rough, thin and itchy.', 'Stitching came apart in a week and the material feels cheap.', 'The colour faded after the first wash and the cotton shrank.', 'Material is thin and the zip broke on day one.', 'The leather peeled off quickly and the lining is poor.'],
  design: ['The design looks cheap and nothing like the photos.', 'Looks ugly in person and the colour is dull.', 'The look is plain and the finish is sloppy.', 'The colour is different from the pictures and it looks boring.'],
  quality: ['Build quality is flimsy and it feels like it will break.', 'The quality is poor, it stopped working after two days.', 'It feels cheap and there were scratches on arrival.', 'I suspect it is a fake, the finishing is bad.', 'Very poor build, it cracked within a week.'],
  value: ['Overpriced for what it offers, not worth the money.', 'Poor value, other options are cheaper and better.', 'Too expensive for this quality.', 'Waste of money at this price.'],
  delivery: ['Delivery was very late, it came a week after the promised date.', 'Shipping was delayed and the tracking was wrong.', 'The courier was rude and the delivery got delayed twice.', 'It arrived late with no update from the seller.'],
  packaging: ['The packaging was careless and the box was torn.', 'It arrived damaged because of poor packing.', 'No bubble wrap, the box was open and tampered.', 'Packaging was bad and the seal was broken.'],
  service: ['The seller never replied to my messages.', 'Customer service was rude and refused to help.', 'Return was rejected and the refund is still pending.', 'No after sales support and the warranty card was missing.', 'The technician came late and the installation was sloppy.'],
  noise: ['It is very noisy, I cannot talk while it is running.', 'Loud humming noise and a lot of vibration.', 'The noise level is irritating at night.', 'Makes a grinding noise even at low speed.'],
  ease: ['Setup was confusing and the manual is useless.', 'Complicated to use, the app keeps crashing.', 'The instructions are unclear and the interface is clunky.', 'Hard to set up even after watching videos.'],
  cleaning: ['Cleaning is a nightmare and the parts do not come off.', 'Hard to clean and stains stay on.', 'The coating leaves residue and scrubbing does not help.', 'Maintenance is a hassle.'],
  skin: ['It broke me out within two days and my skin is irritated.', 'Too greasy and sticky, it clogged my pores.', 'Left my hair dry and frizzy.', 'Heavy texture with a visible white cast on my skin.', 'Caused a rash and dryness on my face.'],
  fragrance: ['The fragrance is harsh and gives me a headache.', 'Smells chemical and the scent disappears in minutes.', 'Pungent odour that I could not stand.'],
  effectiveness: ['I saw no results even after weeks of use.', 'Patchy coverage and the shade is wrong.', 'Not effective at all and the colour fades fast.', 'The trimmer pulls hair and gives an uneven shave.', 'SPF protection is doubtful, I still got tanned.'],
}
// Category-specific wording for aspects whose meaning changes with the product (a phone's "performance" is not a cooler's).
const TECH = ['mobiles', 'laptops', 'gaming']
const SUB_POOLS = {
  performance: {
    'Air Cooler': [['Cooling is excellent, the room feels cooler within minutes.', 'Strong airflow and it cools a big room well.'], ['Cooling is weak and the airflow is poor.', 'It barely cools the room even at full speed.']],
    'Air Conditioner': [['Cooling is excellent and the room is cool in ten minutes.', 'It cools very quickly and saves power.'], ['Cooling is poor and it takes ages to cool the room.', 'Barely cools in summer, very disappointing.']],
    Refrigerator: [['Cooling is even and the freezer works really well.', 'It keeps everything fresh and cools quickly.'], ['The fridge does not cool properly.', 'Cooling is uneven and the ice does not set.']],
    'Room Heater': [['It heats the room quickly and works powerfully.', 'Heating is fast and the warmth spreads evenly.'], ['It takes forever to heat the room.', 'Heating is weak and it barely warms the room.']],
    'Vacuum Cleaner': [['Suction power is strong and it picks up everything.', 'Powerful suction and it cleans carpets well.'], ['Suction power is weak and it misses dirt.', 'It struggles to pick up dust, very weak suction.']],
    'Mixer & Blender': [['The motor is powerful and grinds everything in seconds.', 'Crushes ice and grinds spices smoothly.'], ['The motor is weak and struggles with hard ingredients.', 'Grinding is uneven and it stalls often.']],
    'Washing Machine': [['It cleans clothes really well and the spin is gentle.', 'Powerful wash performance and the spin dries well.'], ['It does not clean properly and the spin is weak.', 'Washing performance is poor and clothes stay damp.']],
    Television: [['The smart OS is fast and apps open without any lag.', 'Very smooth and responsive, the remote works great.'], ['The smart OS is laggy and apps keep crashing.', 'The TV hangs often and the remote is slow to respond.']],
    Storage: [['It keeps drinks hot for twelve hours, brilliant.', 'Keeps water cold all day and does not leak.'], ['It does not keep the temperature, it is cold in two hours.', 'It leaks and the insulation is poor.']],
  },
  comfort: {
    'Gaming Chair': [['Very comfortable to sit in for hours and the back support is great.', 'The cushioning and posture support are excellent.'], ['Uncomfortable after an hour and the back support is poor.', 'The cushioning is hard and my back aches.']],
  },
}
const HOME_PERF = [['Works powerfully and does the job quickly.', 'The motor is strong and handles heavy use.', 'Very efficient performance and it saves electricity.'], ['Performance is poor and it takes forever to do the job.', 'The motor is weak and struggles with regular use.', 'It overheats and trips the switch.']]
const HAND_COMFORT = [['Very comfortable to use for hours, the grip is excellent.', 'Ergonomic and the buttons feel great under the fingers.', 'The keys feel soft and typing is comfortable for long sessions.'], ['Not comfortable to use for long, the grip is poor.', 'The buttons feel stiff and my hand aches after some time.', 'Typing feels mushy and the keys are uncomfortable.']]
const FOOT_FABRIC = [['The upper material is breathable and the stitching is neat.', 'The sole material is durable and grippy.', 'Premium material with neat stitching.'], ['The upper material is rough and the stitching came apart.', 'The sole wore out in weeks and the material feels cheap.', 'The material is thin and the glue came off.']]
const BEAUTY_QUALITY = [['Genuine product, sealed and exactly like the original.', 'The quality is excellent and the texture feels premium.'], ['I suspect it is fake, the texture is different from the original.', 'The quality is poor and the seal was already broken.']]
function phrase(r, a, positive, p) {
  const side = positive ? 0 : 1
  const sub = SUB_POOLS[a]?.[p.sub]
  if (sub) return pick(r, sub[side])
  if (a === 'quality' && p.catId === 'beauty') return pick(r, BEAUTY_QUALITY[side])
  let pool = (positive ? POS : NEG)[a]
  if (a === 'sound' && p.catId !== 'audio' && !['Headphones', 'Microphone'].includes(p.sub)) pool = pool.filter((x) => !/cancellation|\bmic\b/i.test(x))
  if (a === 'sound' && !['mobiles', 'audio'].includes(p.catId) && p.sub !== 'Headphones') pool = pool.filter((x) => !/call quality/i.test(x))
  if (a === 'service' && p.catId !== 'appliances') pool = pool.filter((x) => !/technician|installation/i.test(x))
  if (pool !== (positive ? POS : NEG)[a] && pool.length) return pick(r, pool)
  if (a === 'performance' && ['appliances', 'kitchen'].includes(p.catId)) return pick(r, HOME_PERF[side])
  if (a === 'comfort' && (['laptops', 'gaming'].includes(p.catId) || p.sub === 'Bags')) return pick(r, HAND_COMFORT[side])
  if (a === 'fabric' && p.catId === 'footwear') return pick(r, FOOT_FABRIC[side])
  return pick(r, (positive ? POS : NEG)[a])
}
const OPEN = {
  5: ['Totally worth it.', 'Highly recommended!', 'Very happy with this purchase.', 'Five stars from me.', 'Best purchase in a long time.', 'Loved it.', 'Would buy again.', 'Superb product.'],
  4: ['Good product overall.', 'Pretty happy with it.', 'Recommended with minor reservations.', 'Good, but not perfect.', 'Happy with the purchase so far.'],
  3: ['It is okay, nothing special.', 'Average product for the price.', 'Mixed feelings about this one.', 'Decent but has some issues.'],
  2: ['Not happy with this.', 'Expected much better.', 'Disappointing.', 'Not as good as the reviews said.'],
  1: ['Complete waste of money.', 'Do not buy this.', 'Very disappointed.', 'Worst purchase ever.', 'Terrible experience.'],
}
const TITLE = { 5: ['Excellent!', 'Worth every rupee', 'Superb', 'Loved it', 'Great buy'], 4: ['Good product', 'Pretty good', 'Happy overall', 'Nice'], 3: ['Average', 'Okay for the price', 'Mixed bag'], 2: ['Disappointed', 'Not great', 'Expected more'], 1: ['Waste of money', 'Terrible', 'Do not buy', 'Worst'] }
const LOW_EFFORT = ['Nice product', 'Good', 'Nice', 'Super', 'Awesome product', 'ok ok', 'Very good', 'Best']
const NAMES = ['Aarav', 'Priya', 'Rohan', 'Ananya', 'Vikram', 'Sneha', 'Arjun', 'Kavya', 'Rahul', 'Meera', 'Karthik', 'Divya', 'Sanjay', 'Pooja', 'Nikhil', 'Isha', 'Aditya', 'Neha', 'Manoj', 'Shreya']
const EMOJI = { pos: ['👍', '😍', '🙂', '👌'], neg: ['😡', '👎', '😞'] }
const TODAY = Date.UTC(2026, 10, 1) // fixed so the demo data never changes between runs

const pick = (r, a) => a[Math.floor(r() * a.length)]
const lower1 = (s) => s.charAt(0).toLowerCase() + s.slice(1)
const clamp = (x, a, b) => Math.max(a, Math.min(b, x))

const cache = new Map()
/** Deterministic demo reviews for one product -> { reviews, truth }. `truth` = the hidden per-aspect quality used to write them. */
export function reviewsFor(p) {
  if (cache.has(p.id)) return cache.get(p.id)
  const r = rng(hash('reviews:' + p.id))
  const asp = aspectsFor(p)
  const base = clamp((p.rating - 3) / 2, 0.2, 0.9)
  // Hidden truth: every aspect has a quality level; some products get one clear strength and one clear weakness.
  const q = Object.fromEntries(asp.map((a) => [a, clamp(base + (r() - 0.5) * 0.5, 0.12, 0.96)]))
  const specific = asp.filter((a) => !['value', 'quality', 'delivery', 'packaging', 'service', 'design'].includes(a))
  if (specific.length >= 2 && r() < 0.7) { q[specific[Math.floor(r() * specific.length)]] = 0.88 + r() * 0.08 }
  if (specific.length >= 2 && r() < 0.55) { const w = specific[Math.floor(r() * specific.length)]; q[w] = 0.12 + r() * 0.16 }
  const mk = [['Amazon', 0.85], ['Flipkart', 0.75], ['Meesho', 0.55]]
  const shares = mk.map(([m]) => p.offers.filter((o) => o.market === m).reduce((s, o) => s + o.reviews, 0))
  const total = shares.reduce((a, b) => a + b, 0)
  const n = 16 + Math.floor(r() * 17)
  const out = []
  for (let i = 0; i < n; i++) {
    let x = r() * total, mi = 0
    while (mi < 2 && x > shares[mi]) { x -= shares[mi]; mi++ }
    const market = mk[mi][0]
    let stars = clamp(Math.round(p.rating + (r() + r() + r() - 1.5) * 1.25), 1, 5)
    const frac = (stars - 1) / 4
    const k = 1 + (r() < 0.62 ? 1 : 0) + (r() < 0.25 ? 1 : 0)
    const chosen = []
    while (chosen.length < k && chosen.length < asp.length) { const a = pick(r, r() < 0.6 ? specific.concat(asp) : asp); if (!chosen.includes(a)) chosen.push(a) }
    const sign = chosen.map((a) => {
      const qa = a === 'delivery' ? clamp(mk[mi][1] + (r() - 0.5) * 0.3, 0.1, 0.95) : q[a]
      return r() < clamp(0.15 + 0.55 * frac + 0.45 * qa - 0.15, 0.03, 0.97)
    })
    if (stars <= 2 && sign.every(Boolean)) sign[Math.floor(r() * k)] = false
    if (stars >= 4 && sign.every((s) => !s)) sign[Math.floor(r() * k)] = true
    const parts = chosen.map((a, j) => phrase(r, a, sign[j], p))
    let body
    if (stars === 3 && k >= 2 && sign.includes(true) && sign.includes(false)) {
      const pi = sign.indexOf(true), ni = sign.indexOf(false)
      body = `${parts[pi].replace(/[.!]$/, '')}, but ${lower1(parts[ni])}`
    } else body = parts.join(' ')
    let text = r() < 0.55 ? `${pick(r, OPEN[stars])} ${body}` : r() < 0.5 ? `${body} ${pick(r, OPEN[stars])}` : body
    const flags = []
    const roll = r()
    if (roll < 0.04) { text = pick(r, LOW_EFFORT); stars = r() < 0.8 ? 5 : 4; flags.push('low-effort') }
    else if (roll < 0.07 && stars <= 2) { stars = 5; flags.push('mismatch') }        // negative text, but a 5-star click
    else if (roll < 0.09 && stars === 5) { stars = 1; flags.push('mismatch') }       // glowing text, 1-star click
    if (r() < 0.3) text = lower1(text)
    if (r() < 0.14) { const w = text.split(' '); const j = Math.floor(r() * w.length); if (w[j].length > 4) { const c = w[j].split(''); const t = c[1]; c[1] = c[2]; c[2] = t; w[j] = c.join('') } text = w.join(' ') }
    if (r() < 0.12) text += ' ' + pick(r, stars >= 4 ? EMOJI.pos : EMOJI.neg)
    out.push({
      id: p.id + '-R' + (i + 1), stars, market, title: pick(r, TITLE[stars]), text,
      author: pick(r, NAMES) + ' ' + String.fromCharCode(65 + Math.floor(r() * 26)) + '.',
      date: new Date(TODAY - Math.floor(r() * 400) * 864e5).toISOString().slice(0, 10),
      verified: r() < 0.85, helpful: Math.floor(r() ** 3 * 40),
      _seeded: flags, // which quirks the generator injected (used only by tests, never sent to clients)
      _truth: chosen.map((a, j) => ({ aspect: a, positive: sign[j] })), // the opinions the generator wrote (used only by server/eval.js)
    })
  }
  out.sort((a, b) => b.date.localeCompare(a.date))
  cache.set(p.id, { reviews: out, truth: q })
  return cache.get(p.id)
}

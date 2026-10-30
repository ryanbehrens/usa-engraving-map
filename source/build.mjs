// Builds layer path data for the USA engraving map.
// usage: node build.mjs <dataDir> <outJson>
import fs from 'fs';
import path from 'path';
import { createRequire } from 'module';
const dataDir = process.argv[2];
const out = process.argv[3];
const require = createRequire(path.join(dataDir, 'package.json'));
const d3 = require('d3-geo');
const topo = require('topojson-client');
const opentype = require('opentype.js');

const W = 975, H = 610;
const proj = d3.geoAlbersUsa().scale(1300).translate([487.5, 305]);

const P = (lon, lat) => proj([lon, lat]);

const statesTopo = JSON.parse(fs.readFileSync(path.join(dataDir, 'node_modules/us-atlas/states-10m.json')));
const nation = topo.feature(statesTopo, statesTopo.objects.nation);
const states = topo.feature(statesTopo, statesTopo.objects.states);
proj.fitExtent([[40, 22], [935, 556]], nation);
const gp = d3.geoPath(proj).digits(1);
const interior = topo.mesh(statesTopo, statesTopo.objects.states, (a, b) => a !== b);

const font = opentype.parse(fs.readFileSync(path.join(dataDir, 'node_modules/@fontsource/barlow-condensed/files/barlow-condensed-latin-600-normal.woff')).buffer);
// text -> path string; anchor: 'start'|'middle'|'end'; y is baseline-centre (we shift by ~0.35em)
function textPath(str, x, y, size, anchor = 'start', tracking = 0) {
  let width = font.getAdvanceWidth(str, size) + tracking * (str.length - 1);
  let x0 = anchor === 'middle' ? x - width / 2 : anchor === 'end' ? x - width : x;
  const y0 = y + size * 0.35;
  if (!tracking) return font.getPath(str, x0, y0, size).toPathData(1);
  let d = '';
  for (const ch of str) {
    d += font.getPath(ch, x0, y0, size).toPathData(1);
    x0 += font.getAdvanceWidth(ch, size) + tracking;
  }
  return d;
}
const r1 = (n) => Math.round(n * 10) / 10;

const layers = {};

// ---- outline + states
layers.outline = `<path d="${gp(nation)}" fill="none" stroke-width="1"/>`;
layers.states = `<path d="${gp(interior)}" fill="none" stroke-width="0.5"/>`;

// ---- state names (abbreviations, at label points)
const abbr = {"Alabama":"AL","Alaska":"AK","Arizona":"AZ","Arkansas":"AR","California":"CA","Colorado":"CO","Connecticut":"CT","Delaware":"DE","District of Columbia":"DC","Florida":"FL","Georgia":"GA","Hawaii":"HI","Idaho":"ID","Illinois":"IL","Indiana":"IN","Iowa":"IA","Kansas":"KS","Kentucky":"KY","Louisiana":"LA","Maine":"ME","Maryland":"MD","Massachusetts":"MA","Michigan":"MI","Minnesota":"MN","Mississippi":"MS","Missouri":"MO","Montana":"MT","Nebraska":"NE","Nevada":"NV","New Hampshire":"NH","New Jersey":"NJ","New Mexico":"NM","New York":"NY","North Carolina":"NC","North Dakota":"ND","Ohio":"OH","Oklahoma":"OK","Oregon":"OR","Pennsylvania":"PA","Rhode Island":"RI","South Carolina":"SC","South Dakota":"SD","Tennessee":"TN","Texas":"TX","Utah":"UT","Vermont":"VT","Virginia":"VA","Washington":"WA","West Virginia":"WV","Wisconsin":"WI","Wyoming":"WY"};
const stateNudge = { MI: [10, 22], FL: [12, 6], LA: [-8, 0], KY: [4, 2], VA: [6, 2], HI: [8, 6], CA: [-10, 6], ID: [0, 12], AK: [0, 0], MD: [0, 0] };
const tinyStates = new Set(['DC', 'DE', 'RI', 'CT', 'NJ', 'MD', 'MA', 'NH', 'VT']);
const tinyLL = { DE: [-74.3, 38.6], RI: [-70.9, 41.0], CT: [-72.6, 41.55], NJ: [-73.6, 39.7], MD: [-74.6, 37.9], MA: [-69.6, 42.5], NH: [-71.6, 43.6], VT: [-72.7, 44.0] };
const tinyPos = Object.fromEntries(Object.entries(tinyLL).map(([k, v]) => [k, P(...v)]));
let sn = '';
for (const f of states.features) {
  const a = abbr[f.properties.name];
  if (!a || !tinyPos.hasOwnProperty(a) && false) continue;
  if (a === 'DC') continue;
  let [x, y] = gp.centroid(f);
  if (stateNudge[a]) { x += stateNudge[a][0]; y += stateNudge[a][1]; }
  if (tinyStates.has(a)) [x, y] = tinyPos[a];
  sn += textPath(a, x, y, tinyStates.has(a) ? 7 : 11, 'middle', 0.6);
}
layers.stateNames = `<path d="${sn}" stroke="none"/>`;

// ---- roads
const roads = JSON.parse(fs.readFileSync(path.join(dataDir, 'build_roads.geojson')));
const fwy = { type: 'FeatureCollection', features: roads.features.filter(f => f.properties.cls === 'fwy') };
const hwy = { type: 'FeatureCollection', features: roads.features.filter(f => f.properties.cls === 'hwy') };
layers.freeways = `<path d="${gp(fwy)}" fill="none" stroke-width="0.7" stroke-linecap="round" stroke-linejoin="round"/>`;
layers.highways = `<path d="${gp(hwy)}" fill="none" stroke-width="0.35" stroke-linecap="round" stroke-linejoin="round"/>`;

// ---- water
const readGJ = (f) => JSON.parse(fs.readFileSync(path.join(dataDir, f)));
const rewind = (fc) => { for (const f of fc.features) if (d3.geoArea(f) > 2 * Math.PI) { const g = f.geometry; (g.type === 'Polygon' ? [g.coordinates] : g.coordinates).forEach(p => p.forEach(r => r.reverse())); } return fc; };
const lakes = rewind(readGJ('build_lakes.geojson'));
lakes.features = lakes.features.filter(f => gp.area(f) > 0.4);
layers.lakes = `<path d="${gp(lakes)}" stroke-width="0.3" stroke-linejoin="round"/>`;
layers.riversMajor = `<path d="${gp(readGJ('build_rivers_major.geojson'))}" fill="none" stroke-width="0.6" stroke-linecap="round" stroke-linejoin="round"/>`;
layers.riversMinor = `<path d="${gp(readGJ('build_rivers_minor.geojson'))}" fill="none" stroke-width="0.3" stroke-linecap="round" stroke-linejoin="round"/>`;

// ---- parks (Natural Earth polygons) + markers for National Parks missing from that dataset
const parks = JSON.parse(fs.readFileSync(path.join(dataDir, 'build_parks.geojson')));
parks.features = parks.features.filter(f => /NP/.test(f.properties.unit_name));
for (const f of parks.features) {
  if (d3.geoArea(f) > 2 * Math.PI) {
    const g = f.geometry;
    const polys = g.type === 'Polygon' ? [g.coordinates] : g.coordinates;
    polys.forEach(p => p.forEach(r => r.reverse()));
  }
}
const parkPolys = gp(parks);
const extraNP = [
  ['Acadia', -68.21, 44.35], ['Arches', -109.57, 38.68], ['Biscayne', -80.21, 25.48], ['Black Canyon', -107.72, 38.57],
  ['Bryce Canyon', -112.18, 37.57], ['Carlsbad Caverns', -104.44, 32.17], ['Congaree', -80.78, 33.78],
  ['Cuyahoga Valley', -81.55, 41.24], ['Dry Tortugas', -82.87, 24.63], ['Great Basin', -114.30, 38.98],
  ['Guadalupe Mtns', -104.87, 31.92], ['Haleakala', -156.17, 20.72], ['Hot Springs', -93.05, 34.51],
  ['Indiana Dunes', -87.05, 41.65], ['Mammoth Cave', -86.10, 37.18], ['Mesa Verde', -108.49, 37.18],
  ['New River Gorge', -81.07, 37.95], ['Pinnacles', -121.16, 36.48], ['Saguaro', -110.50, 32.25],
  ['Theodore Roosevelt', -103.45, 46.97], ['Wind Cave', -103.48, 43.57], ['Gateway Arch', -90.18, 38.62]
];
// small triangle "mountain" marker
const tri = (x, y, s = 2.6) => `M${r1(x)},${r1(y - s)}L${r1(x + s * 0.95)},${r1(y + s * 0.6)}L${r1(x - s * 0.95)},${r1(y + s * 0.6)}Z`;
let parkMarks = '';
const parkPts = [];
for (const [n, lon, lat] of extraNP) {
  const p = P(lon, lat); if (!p) continue;
  if (n === 'Gateway Arch') continue; // shown as a landmark instead
  parkMarks += tri(p[0], p[1]);
  parkPts.push([n, p[0], p[1]]);
}
layers.parks = `<path d="${parkPolys}" stroke-width="0.3"/>`;
const icons = { parks: [], landmarks: [] };
const labels = { parks: [], landmarks: [] };
const dir = (dx, dy, anc) => [anc === 'start' ? 1 : anc === 'end' ? -1 : 0, anc === 'middle' ? Math.sign(dy) : 0];

// park labels: only true National Parks (polygons) + the extra markers
let pl = '';
const npOnly = parks.features.filter(f => /NP/.test(f.properties.unit_name));
const parkLabelNudge = {
  'Kings Canyon NP': [8, -3, 'start'], 'Sequoia  NP': [7, 5, 'start'], 'Yosemite NP': [8, 0, 'start'],
  'Grand Teton NP': [5, 6, 'end'], 'Yellowstone NP': [9, -6, 'start'], 'Canyonlands NP': [8, 2, 'start'],
  'Capitol Reef NP': [-8, 4, 'end'], 'Zion NP': [-6, 3, 'end'], 'Grand Canyon NP': [0, 10, 'middle'],
  'Petrified Forest NP': [6, 4, 'start'], 'Joshua Tree NP': [0, 8, 'middle'], 'Death Valley NP': [-6, 6, 'end'],
  'Channel Islands NP': [-2, 8, 'middle'], 'Redwood NP': [-4, 0, 'end'], 'Crater Lake NP': [-6, 0, 'end'],
  'Lassen Volcanic NP': [-6, 0, 'end'], 'Olympic NP': [-8, -2, 'end'], 'Mount Rainier NP': [7, 3, 'start'],
  'North Cascades NP': [7, -3, 'start'], 'Glacier NP': [6, -4, 'start'], 'Rocky Mountain NP': [7, 0, 'start'],
  'Great Sand Dunes NP & PRES': [7, 3, 'start'], 'Big Bend NP': [0, 8, 'middle'], 'Badlands NP': [6, 4, 'start'],
  'Voyageurs NP': [0, -7, 'middle'], 'Isle Royale NP': [0, -6, 'middle'], 'Great Smoky Mountains NP': [-2, 7, 'middle'],
  'Shenandoah NP': [-6, 3, 'end'], 'Everglades NP': [-8, 2, 'end'], "Hawai'i Volcanoes NP": [0, 9, 'middle'],
  'Denali NP & PRES': [0, 10, 'middle'], 'Gates of the Arctic NP & PRES': [0, -10, 'middle'], 'Kobuk Valley NP': [-4, 8, 'end'],
  'Wrangell-St. Elias NP & PRES': [10, 0, 'start'], 'Glacier Bay NP & PRES': [-2, 8, 'end'], 'Kenai Fjords NP': [0, 8, 'middle'],
  'Katmai NP & PRES': [-6, 6, 'end'], 'Lake Clark NP & PRES': [-8, 0, 'end'],
};
const cleanName = (s) => s.replace(/\s+/g, ' ').replace(/ NP( & PRES)?$/, '').replace("Hawai'i", 'Hawaii');
for (const f of npOnly) {
  const n = f.properties.unit_name;
  const [cx, cy] = gp.centroid(f);
  const [dx, dy, anc] = parkLabelNudge[n] || [6, 0, 'start'];
  icons.parks.push([r1(cx), r1(cy), 'tree', cleanName(n)]);
  labels.parks.push([textPath(cleanName(n), cx + dx, cy + dy, 4.6, anc), ...dir(dx, dy, anc)]);
}
const extraNudge = {
  'Arches': [-4, -2, 'end'], 'Mesa Verde': [-4, 3, 'end'], 'Black Canyon': [4, -2, 'start'], 'Bryce Canyon': [4, 2, 'start'],
  'Great Basin': [-4, 0, 'end'], 'Wind Cave': [4, 3, 'start'], 'Theodore Roosevelt': [4, 0, 'start'],
  'Carlsbad Caverns': [4, 2, 'start'], 'Guadalupe Mtns': [-4, 3, 'end'], 'Saguaro': [-4, 2, 'end'],
  'Dry Tortugas': [-4, 0, 'end'], 'Biscayne': [4, 0, 'start'], 'Acadia': [4, 2, 'start'],
  'Congaree': [4, 1, 'start'], 'Cuyahoga Valley': [4, -2, 'start'], 'New River Gorge': [4, 1, 'start'],
  'Mammoth Cave': [-4, 0, 'end'], 'Indiana Dunes': [4, -3, 'start'], 'Hot Springs': [4, 0, 'start'],
  'Pinnacles': [-4, 1, 'end'], 'Haleakala': [4, 0, 'start'],
};
for (const [n, x, y] of parkPts) {
  const [dx, dy, anc] = extraNudge[n] || [4, 0, 'start'];
  icons.parks.push([r1(x), r1(y), 'tree', n]);
  labels.parks.push([textPath(n, x + dx, y + dy, 4.6, anc), ...dir(dx, dy, anc)]);
}


// ---- landmarks
// [label, lon, lat, dx, dy, anchor, icon]
const landmarks = [
  ['Space Needle', -122.3493, 47.6205, 6, -1, 'start'],
  ['Mount St. Helens', -122.1944, 46.1912, -6, 2, 'end'],
  ['Golden Gate Bridge', -122.4783, 37.8199, -6, 0, 'end'],
  ['Hollywood Sign', -118.3215, 34.1341, -6, 0, 'end'],
  ['Hoover Dam', -114.7377, 36.0161, 6, 2, 'start'],
  ['Las Vegas Strip', -115.1728, 36.1147, 3, -6, 'middle'],
  ['Extraterrestrial Hwy', -115.7434, 37.6447, 7, -2, 'start', 'ufo'],
  ['Four Corners', -109.0452, 36.9990, 6, 3, 'start'],
  ['Meteor Crater', -111.0225, 35.0274, 6, 0, 'start'],
  ['Old Faithful', -110.8281, 44.4605, -6, 4, 'end'],
  ['Devils Tower', -104.7146, 44.5902, 6, 0, 'start'],
  ['Mount Rushmore', -103.4591, 43.8791, 6, 0, 'start'],
  ['Carhenge', -102.8578, 42.1422, 6, 0, 'start'],
  ['Corn Palace', -98.0262, 43.7142, 6, 0, 'start'],
  ['Roswell', -104.5230, 33.3943, 6, 0, 'start', 'ufo'],
  ['Cadillac Ranch', -101.9871, 35.1872, 6, 0, 'start'],
  ['The Alamo', -98.4861, 29.4260, -6, 0, 'end'],
  ['Space Center Houston', -95.0981, 29.5519, 6, 2, 'start'],
  ['French Quarter', -90.0644, 29.9584, 6, 3, 'start'],
  ['Graceland', -90.0260, 35.0477, 6, 0, 'start'],
  ['Gateway Arch', -90.1848, 38.6247, -6, 0, 'end'],
  ['Grand Ole Opry', -86.6921, 36.2069, 6, 0, 'start'],
  ['Willis Tower', -87.6359, 41.8789, -6, 0, 'end'],
  ['Mackinac Bridge', -84.7278, 45.8174, 6, -2, 'start'],
  ['Niagara Falls', -79.0742, 43.0828, -6, -3, 'end'],
  ['Statue of Liberty', -74.0445, 40.6892, 6, 3, 'start'],
  ['Liberty Bell', -75.1503, 39.9496, -6, 2, 'end'],
  ['Lincoln Memorial', -77.0502, 38.8893, -6, 0, 'end'],
  ['Plymouth Rock', -70.6623, 41.9584, 6, 3, 'start'],
  ['Wright Brothers Memorial', -75.6680, 36.0144, 6, 1, 'start'],
  ['Kennedy Space Center', -80.6490, 28.5729, 6, 0, 'start'],
  ['Southernmost Point', -81.7975, 24.5465, 6, 1, 'start'],
  ['Pearl Harbor', -157.9500, 21.3649, 0, -7, 'middle'],
  ['Arctic Circle', -150.80, 66.56, 6, 0, 'start'],
  ['Utqiagvik (Northernmost US)', -156.79, 71.29, 0, -7, 'middle'],
];
const star = (cx, cy, R = 3.2, r = 1.35) => {
  let d = '';
  for (let i = 0; i < 10; i++) {
    const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r : R;
    d += (i ? 'L' : 'M') + r1(cx + rr * Math.cos(a)) + ',' + r1(cy + rr * Math.sin(a));
  }
  return d + 'Z';
};
const ufo = (cx, cy) => {
  // saucer: ellipse body + dome, as one filled path
  const e = (x, y, rx, ry) => `M${r1(x - rx)},${r1(y)}a${rx},${ry} 0 1,0 ${2 * rx},0a${rx},${ry} 0 1,0 ${-2 * rx},0Z`;
  return e(cx, cy + 0.6, 4.2, 1.5) + `M${r1(cx - 2)},${r1(cy)}a2,2 0 0,1 4,0Z`;
};
let lm = '', ll = '';
const lmOut = [];
for (const [n, lon, lat, dx, dy, anc, icon] of landmarks) {
  const p = P(lon, lat);
  if (!p) { console.error('off-map', n); continue; }
  icons.landmarks.push([r1(p[0]), r1(p[1]), icon || 'star', n]);
  labels.landmarks.push([textPath(n, p[0] + dx, p[1] + dy, 6.2, anc), ...dir(dx, dy, anc)]);
  lmOut.push(n);
}


// ---- title + compass rose
let title = textPath('UNITED STATES OF AMERICA', 487.5, 588, 20, 'middle', 3);
const cx = 905, cy = 520, R = 22;
let comp = '';
// 4-point star
const pts = [];
for (let i = 0; i < 8; i++) {
  const a = -Math.PI / 2 + i * Math.PI / 4, rr = i % 2 ? R * 0.22 : R;
  pts.push([cx + rr * Math.cos(a), cy + rr * Math.sin(a)]);
}
comp += 'M' + pts.map(p => p.map(r1).join(',')).join('L') + 'Z';
comp += `M${cx - R * 0.62},${cy}a${R * 0.62},${R * 0.62} 0 1,0 ${R * 1.24},0a${R * 0.62},${R * 0.62} 0 1,0 ${-R * 1.24},0Z`;
layers.titleText = `<path d="${title}" stroke="none"/>`;
layers.compass = `<path d="${comp}" fill="none" stroke-width="0.8" stroke-linejoin="round"/><path d="${textPath('N', cx, cy - R - 7, 9, 'middle')}" stroke="none"/>`;

// ---- frame (border + inset boxes around Alaska & Hawaii)
const ak = gp.bounds(states.features.find(f => f.properties.name === 'Alaska'));
const hi = gp.bounds(states.features.find(f => f.properties.name === 'Hawaii'));
const box = (b, pad) => `M${r1(b[0][0] - pad)},${r1(b[0][1] - pad)}H${r1(b[1][0] + pad)}V${r1(b[1][1] + pad)}H${r1(b[0][0] - pad)}Z`;
layers.frame = `<path d="M4,4H${W - 4}V${H - 4}H4Z" fill="none" stroke-width="1.6"/><path d="M8,8H${W - 8}V${H - 8}H8Z" fill="none" stroke-width="0.5"/><path d="${box(ak, 6)}${box(hi, 6)}" fill="none" stroke-width="0.5" stroke-dasharray="3 2"/>`;

fs.writeFileSync(out, JSON.stringify({ W, H, layers, icons, labels }));
console.log('ok', Object.fromEntries(Object.entries(layers).map(([k, v]) => [k, v.length])));

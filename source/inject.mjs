// Combines template.html + layers.json into ../index.html
import fs from 'fs';
const t = fs.readFileSync('template.html', 'utf8');
const d = fs.readFileSync('layers.json', 'utf8');
fs.writeFileSync('../index.html', t.replace('__DATA__', d));
console.log('wrote ../index.html');

const fs = require('node:fs');
const path = require('node:path');

const root = path.resolve(__dirname, '..');
const publicFiles = [
  'index.html', 'style.css', 'avatars.js', 'core.js',
  'motion.js', 'rooms.js', 'game.js',
];
const roomNotice = 'Online rooms and phone pairing need a connected room server. Solo, webcam play, and two-player races on this device are available.';

// Package a static frontend explicitly. The persistent Node room server is not
// a request handler and must never become a Vercel Function entry point.
for (const directory of ['dist', '.vercel/output/static']) {
  const destination = path.join(root, directory);
  fs.mkdirSync(destination, {recursive: true});
  for (const file of publicFiles) {
    fs.copyFileSync(path.join(root, file), path.join(destination, file));
  }
  fs.writeFileSync(path.join(destination, 'deployment-config.json'), JSON.stringify({
    roomsAvailable: false,
    hosting: 'static',
    lan: [],
    secure: true,
    message: roomNotice,
  }, null, 2) + '\n');
  fs.writeFileSync(path.join(destination, 'rooms-unavailable.json'), JSON.stringify({error: roomNotice}) + '\n');
}

// The Build Output API also makes the absence of server functions explicit.
fs.writeFileSync(path.join(root, '.vercel/output/config.json'), JSON.stringify({
  version: 3,
  routes: [
    {src: '/api/config', dest: '/deployment-config.json'},
    {src: '/api/.*', dest: '/rooms-unavailable.json', status: 503},
    {src: '/', dest: '/index.html'},
    {handle: 'filesystem'},
  ],
}, null, 2) + '\n');
console.log('MoveRush static frontend built: dist/ (no server functions).');

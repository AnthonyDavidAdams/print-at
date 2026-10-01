// bin/printat resolves its own directory through the /usr/local/bin symlink (Roy's first bug).
const fs = require('fs'); const path = require('path'); const os = require('os'); const { execFileSync } = require('child_process');
const root = path.join(__dirname, '..', '..');
const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'pa-link-'));
const link = path.join(tmp, 'printat'); fs.symlinkSync(path.join(root, 'bin', 'printat'), link);
const out = execFileSync(link, ['help'], { encoding: 'utf8' });
fs.rmSync(tmp, { recursive: true, force: true });
if (!/printat update/.test(out)) { console.error('help output through symlink missing commands:\n' + out.slice(0, 300)); process.exit(1); }
console.log('cli symlink ok');

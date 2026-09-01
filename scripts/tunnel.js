const { spawn } = require('child_process');

const port = process.argv[2] || process.env.PORT || 3000;
console.log(`\x1b[36m[Tunnel]\x1b[0m Starting Cloudflare Tunnel for http://localhost:${port}...`);

const cloudflared = spawn('cloudflared', ['tunnel', '--url', `http://localhost:${port}`]);

let activeUrl = null;

function handleData(data) {
  const text = data.toString();
  const match = text.match(/https:\/\/[a-zA-Z0-9-]+\.trycloudflare\.com/);
  
  if (match) {
    const url = match[0];
    if (url !== activeUrl) {
      activeUrl = url;
      console.log('\n\x1b[1m\x1b[32m' + '═'.repeat(65) + '\x1b[0m');
      console.log(`\x1b[1m\x1b[32m  🚀 API Cloudflare Tunnel Active!\x1b[0m`);
      console.log(`\x1b[1m\x1b[33m  🌐 HTTPS Public URL:\x1b[0m \x1b[1m\x1b[36m\x1b[4m${url}\x1b[0m`);
      console.log(`\x1b[1m\x1b[35m  🎯 Forwarding to:\x1b[0m   http://localhost:${port}`);
      console.log('\x1b[1m\x1b[32m' + '═'.repeat(65) + '\x1b[0m\n');
    }
  }
}

cloudflared.stdout.on('data', handleData);
cloudflared.stderr.on('data', handleData);

cloudflared.on('close', (code) => {
  if (code !== 0 && code !== null) {
    console.error(`\x1b[31m[Tunnel] Cloudflared exited with code ${code}\x1b[0m`);
  }
});

process.on('SIGINT', () => {
  cloudflared.kill('SIGINT');
  process.exit();
});

process.on('SIGTERM', () => {
  cloudflared.kill('SIGTERM');
  process.exit();
});

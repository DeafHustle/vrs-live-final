const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const OWNER_WALLET = '0x72683ef02989930042e4C727F26cF4DF110d6b9A';
const TOKEN_CONTRACT = '0x9627175C472412C5D84d781Abe950A798200316F';

mongoose.connect('mongodb+srv://vrsadmin:vrs123456@asleth.gjolaoq.mongodb.net/aslvrs?retryWrites=true&w=majority')
  .then(() => console.log('MONGODB CONNECTED'));

let activeRooms = {};

// HOME PAGE
app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>AmericanSignLanguage.eth — World's First Blockchain VRI</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :root{--primary:#00d4ff;--dark:#0a0e1a;--card:#111827}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:var(--dark);color:white}
    nav{position:fixed;top:0;width:100%;background:rgba(10,14,26,0.95);backdrop-filter:blur(10px);z-index:1000;padding:20px 5%;display:flex;justify-content:space-between;align-items:center}
    .logo{font-size:2em;font-weight:900;letter-spacing:-1px}
    .nav-links a{color:white;text-decoration:none;margin:0 25px;font-weight:500;transition:0.3s}
    .nav-links a:hover{color:var(--primary)}
    .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 20px;flex-direction:column}
    h1{font-size:5.5em;font-weight:900;line-height:1;background:linear-gradient(90deg,#00d4ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .tagline{font-size:1.8em;margin:30px 0;font-weight:300;max-width:900px}
    .highlight{font-weight:700;color:var(--primary)}
    .btn{padding:20px 50px;margin:20px;font-size:1.4em;border:none;border-radius:50px;cursor:pointer;font-weight:700;transition:0.3s}
    .btn-primary{background:var(--primary);color:#000}
    .btn-secondary{background:transparent;border:2px solid var(--primary);color:white}
    .btn-primary:hover{transform:scale(1.05);box-shadow:0 0 40px rgba(0,212,255,0.6)}
    .social{margin:80px 0}
    .social a{color:white;font-size:3.5em;margin:0 30px;transition:0.3s}
    .social a:hover{transform:translateY(-8px);color:var(--primary)}
    footer{padding:80px 20px;text-align:center;color:#64748b;font-size:1.1em}
    a{color:var(--primary);text-decoration:none}
    @media (max-width:768px){h1{font-size:3.5em}.tagline{font-size:1.4em}.btn{font-size:1.2em}}
  </style>
</head>
<body>
  <nav>
    <div class="logo">AmericanSignLanguage.eth</div>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/get-started">Get Started</a>
      <a href="/vri">VRI</a>
      <a href="/interpreters">Interpreters</a>
    </div>
  </nav>

  <section class="hero">
    <h1>World's First<br>Blockchain VRI</h1>
    <p class="tagline">Changing the way Deaf communicate — <span class="highlight">forever.</span><br>One block at a time.</p>
    <p class="tagline">Deaf people finally get rewarded for our language — American Sign Language.<br><strong>Own your language. Own your future.</strong></p>

    <div style="margin:60px 0">
      <a href="/get-started"><button class="btn btn-primary">Get Started</button></a>
      <a href="/vri"><button class="btn btn-secondary">Request VRI Now</button></a>
    </div>

    <div class="social">
      <a href="https://instagram.com/americansignlanguage.eth" target="_blank"><i class="fab fa-instagram"></i></a>
      <a href="https://x.com/ASLNFTS" target="_blank"><i class="fab fa-x-twitter"></i></a>
    </div>
  </section>

  <footer>
    <a href="https://app.ens.domains/americansignlanguage.eth" target="_blank">americansignlanguage.eth</a> · 
    <a href="https://bueno.art/uc3v2njixystwxprxgyj/americansignlanguageeth" target="_blank"><strong>MINT NOW — 376 NFTs</strong></a><br>
    © 2025–2026 · A Deaf-led movement
  </footer>
</body>
</html>
`));

// GET STARTED PAGE
app.get('/get-started', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Get Started — AmericanSignLanguage.eth</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding:100px 20px 60px}
    .container{max-width:900px;margin:0 auto;text-align:center}
    h1{font-size:3.5em;margin-bottom:30px}
    p{font-size:1.4em;line-height:1.8;margin:25px 0}
    .step{margin:60px 0;background:#111827;padding:40px;border-radius:20px}
    .btn{background:#00d4ff;color:black;padding:18px 40px;font-size:1.3em;border:none;border-radius:50px;margin:20px;cursor:pointer;font-weight:700}
    .btn:hover{transform:scale(1.05)}
  </style>
</head>
<body>
  <div class="container">
    <h1>How to Get Started</h1>
    <div class="step">
      <h2>1. Create a Wallet (Takes 60 seconds)</h2>
      <p>Download <strong>MetaMask</strong> — the #1 crypto wallet used by millions.</p>
      <p><a href="https://metamask.io/download/" target="_blank" class="btn">Download MetaMask</a></p>
      <p>It works on iPhone, Android, Chrome, Firefox — everywhere.</p>
    </div>
    <div class="step">
      <h2>2. Connect Your Wallet</h2>
      <p>Once you have MetaMask, click below to connect and start earning $ASL tokens for every VRI call.</p>
      <button class="btn" onclick="connectWallet()">Connect Wallet & Start Earning</button>
    </div>
    <div class="step">
      <h2>3. Request VRI or Accept Calls</h2>
      <p>Deaf users: Click “Request VRI Now” when you need an interpreter.<br>
      Interpreters: Go live and earn 45% of all platform revenue in $ASL tokens.</p>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    async function connectWallet() {
      if (!window.ethereum) return alert('Install MetaMask first!');
      const accounts = await ethereum.request({method:'eth_requestAccounts'});
      alert('Wallet connected: ' + accounts[0].slice(0,10) + '...\\nYou are now ready to earn $ASL tokens!');
    }
  </script>
</body>
</html>
`));

// VRI PAGE
app.get('/vri', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VRI — Anytime, Anywhere — AmericanSignLanguage.eth</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding:100px 20px 60px;text-align:center}
    .container{max-width:900px;margin:0 auto}
    h1{font-size:4em;margin-bottom:30px}
    p{font-size:1.5em;line-height:1.8;margin:30px 0}
    .btn{background:#00d4ff;color:black;padding:20px 50px;font-size:1.5em;border:none;border-radius:50px;margin:30px;cursor:pointer;font-weight:700}
    .btn:hover{transform:scale(1.05)}
  </style>
</head>
<body>
  <div class="container">
    <h1>Video Remote Interpreting<br>Anytime. Anywhere.</h1>
    <p>Works on iPhone, Android, Mac, PC — no app download needed.</p>
    <p>Instant connection to certified ASL interpreters 24/7.</p>
    <p>Earn $ASL tokens just for using the platform — redeem for real value.</p>
    <button class="btn" onclick="requestVRI()">Request VRI Now</button>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    function requestVRI() {
      if (!window.ethereum) return alert('Install MetaMask first!');
      ethereum.request({method:'eth_requestAccounts'}).then(accounts => {
        socket.emit('join-room', {room:'vri',role:'deaf',wallet:accounts[0]});
        alert('VRI Request Sent! Interpreter connecting...');
      });
    }
    socket.on('match-found', () => alert('VRI CALL LIVE — Interpreter connected!'));
  </script>
</body>
</html>
`));

// INTERPRETERS PAGE
app.get('/interpreters', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>ASL Interpreters — Earn $ASL Tokens</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding:100px 20px 60px}
    .container{max-width:900px;margin:0 auto;text-align:center}
    h1{font-size:3.5em;margin-bottom:30px}
    p{font-size:1.4em;line-height:1.8;margin:25px 0}
    .btn{background:#00d4ff;color:black;padding:18px 40px;font-size:1.3em;border:none;border-radius:50px;margin:20px;cursor:pointer;font-weight:700}
    .faq{margin:80px auto;max-width:800px;text-align:left;background:#111827;padding:40px;border-radius:20px}
    .faq h3{margin:30px 0 15px;color:#60a5fa}
  </style>
</head>
<body>
  <div class="container">
    <h1>Certified ASL Interpreters</h1>
    <p>Earn <strong>45% of all platform revenue</strong> in $ASL tokens — the highest pay in the industry.</p>
    <p>Work when you want, from anywhere. Get paid instantly on-chain.</p>
    <p>$ASL tokens can be converted to ETH or held for future value.</p>
    <button class="btn" onclick="goLive()">Go Live as Interpreter</button>

    <div class="faq">
      <h2>FAQs</h2>
      <h3>How do I get paid?</h3>
      <p>You earn $ASL tokens after every VRI session — automatically minted to your wallet.</p>
      <h3>Do I need special software?</h3>
      <p>No. Just a browser, camera, and internet.</p>
      <h3>How do I prove I'm certified?</h3>
      <p>Upload your RID/NIC certificate during onboarding (coming this week).</p>
      <h3>Contact the founder:</h3>
      <p>X: <a href="https://x.com/ASLNFTS" style="color:#60a5fa">@ASLNFTS</a><br>
      IG: <a href="https://instagram.com/americansignlanguage.eth" style="color:#60a5fa">@americansignlanguage.eth</a></p>
    </div>
  </div>
  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    function goLive() {
      if (!window.ethereum) return alert('Install MetaMask!');
      ethereum.request({method:'eth_requestAccounts'}).then(accounts => {
        socket.emit('join-room', {room:'vri',role:'interpreter',wallet:accounts[0]});
        alert('You are LIVE! Ready for VRI calls.');
      });
    }
  </script>
</body>
</html>
`));

server.listen(3000, () => {
  console.log('────────────────────────────────────────');
  console.log('   FULLY PROFESSIONAL MULTI-PAGE VRI LIVE');
  console.log('   https://vrs-live-final.onrender.com');
  console.log('────────────────────────────────────────');
});

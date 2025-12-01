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

let activeCalls = {};

io.on('connection', (socket) => {
  socket.on('deaf-request', ({ wallet }) => {
    socket.role = 'deaf';
    socket.wallet = wallet.toLowerCase();
    socket.emit('waiting');
    console.log('DEAF USER WAITING →', wallet);
    matchCall(socket);
  });

  socket.on('interpreter-live', ({ wallet }) => {
    socket.role = 'interpreter';
    socket.wallet = wallet.toLowerCase();
    console.log('INTERPRETER LIVE →', wallet);
    matchCall(socket);
  });

  socket.on('offer', (data) => socket.to(data.target).emit('offer', { sdp: data.sdp, sender: socket.id }));
  socket.on('answer', (data) => socket.to(data.target).emit('answer', { sdp: data.sdp }));
  socket.on('ice-candidate', (data) => socket.to(data.target).emit('ice-candidate', data.candidate));

  socket.on('end-call', () => endCall(socket));
  socket.on('disconnect', () => endCall(socket));
});

function matchCall(socket) {
  const deaf = socket.role === 'deaf' ? socket : Object.values(activeCalls).find(c => !c.interpreterSocket)?.deafSocket;
  const interpreter = socket.role === 'interpreter' ? socket : Object.values(activeCalls).find(c => !c.deafSocket)?.interpreterSocket;

  if (deaf && interpreter) {
    const callId = Date.now().toString();
    activeCalls[callId] = {
      deafSocket: deaf,
      interpreterSocket: interpreter,
      startTime: Date.now()
    };
    deaf.callId = callId;
    interpreter.callId = callId;

    deaf.emit('call-matched', { peerId: interpreter.id });
    interpreter.emit('call-matched', { peerId: deaf.id });

    console.log('TWO-WAY VRI CALL STARTED — VIDEO + AUDIO');
  }
}

function endCall(socket) {
  if (!socket.callId) return;
  const call = activeCalls[socket.callId];
  if (!call) return;

  const minutes = Math.floor((Date.now() - call.startTime) / 60000);
  if (minutes > 0) {
    const total = minutes * 20;
    const interpreter = Math.floor(total * 45 / 100);
    const dev = Math.floor(total * 45 / 100);
    const user = total - interpreter - dev;

    io.to(call.deafSocket.id).to(call.interpreterSocket.id).emit('mint-request', {
      minutes, total, interpreter, dev, user,
      interpreterWallet: call.interpreterSocket.wallet,
      userWallet: call.deafSocket.wallet
    });
    console.log(`CALL ENDED — ${minutes} min → ${total} $ASL minted`);
  }

  call.deafSocket.emit('call-ended');
  call.interpreterSocket.emit('call-ended');
  delete activeCalls[socket.callId];
  socket.callId = null;
}

// NAV & FOOTER
const nav = `
<nav>
  <div class="container">
    <div class="logo">AmericanSignLanguage.eth</div>
    <div class="nav-links">
      <a href="/">Home</a>
      <a href="/get-started">Get Started</a>
      <a href="/vri">VRI</a>
      <a href="/interpreters">Interpreters</a>
    </div>
  </div>
</nav>
`;

const footer = `
<footer>
  <div class="container">
    <div class="social">
      <a href="https://instagram.com/americansignlanguage.eth" target="_blank"><i class="fab fa-instagram"></i></a>
      <a href="https://x.com/ASLNFTS" target="_blank"><i class="fab fa-x-twitter"></i></a>
    </div>
    <p>
      <a href="https://app.ens.domains/americansignlanguage.eth" target="_blank">americansignlanguage.eth</a> · 
      <a href="https://bueno.art/uc3v2njixystwxprxgyj/americansignlanguageeth" target="_blank"><strong>MINT NOW — 376 NFTs</strong></a>
    </p>
    <p>© 2025–2026 · A Deaf-led movement</p>
  </div>
</footer>
`;

// HOME
app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>World's First Blockchain VRI — AmericanSignLanguage.eth</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :root{--primary:#00d4ff;--dark:#0a0e1a}
    body{font-family:'Inter',sans-serif;background:var(--dark);color:white;margin:0}
    nav{position:fixed;top:0;width:100%;background:rgba(10,14,26,0.95);backdrop-filter:blur(10px);z-index:1000;padding:20px 5%;display:flex;justify-content:space-between;align-items:center}
    .container{max-width:1100px;margin:0 auto}
    .logo{font-size:2em;font-weight:900}
    .nav-links a{color:white;text-decoration:none;margin:0 25px;font-weight:500}
    .nav-links a:hover{color:var(--primary)}
    .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding-top:100px;flex-direction:column}
    h1{font-size:5em;font-weight:900;line-height:1.1;background:linear-gradient(90deg,#00d4ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .tagline{font-size:1.8em;margin:40px 0;max-width:900px}
    .highlight{color:var(--primary);font-weight:700}
    .btn{background:var(--primary);color:#000;padding:20px 50px;margin:20px;font-size:1.5em;border:none;border-radius:50px;cursor:pointer;font-weight:700}
    .btn:hover{transform:scale(1.05)}
    footer{padding:80px 20px;text-align:center;color:#64748b}
    .social a{color:white;font-size:3em;margin:0 30px}
  </style>
</head>
<body>
  ${nav}
  <div class="hero">
    <h1>World's First<br>Blockchain VRI</h1>
    <p class="tagline">Changing the way Deaf communicate — <span class="highlight">forever.</span><br>One block at a time.</p>
    <p class="tagline">Deaf people finally get rewarded for our language — American Sign Language.<br><strong>Own your language. Own your future.</strong></p>
    <div style="margin:60px 0">
      <a href="/get-started"><button class="btn">Get Started</button></a>
      <a href="/vri"><button class="btn" style="background:transparent;border:2px solid var(--primary);color:white">Request VRI Now</button></a>
    </div>
  </div>
  ${footer}
</body>
</html>
`));

// GET STARTED
app.get('/get-started', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Get Started — AmericanSignLanguage.eth</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding-top:100px}
    .container{max-width:900px;margin:0 auto;padding:40px;text-align:center}
    h1{font-size:3.5em;margin-bottom:40px}
    .step{background:#111827;padding:40px;border-radius:20px;margin:40px auto;max-width:700px}
    .btn{background:#00d4ff;color:#000;padding:18px 40px;font-size:1.4em;border:none;border-radius:50px;margin:20px;cursor:pointer;font-weight:700}
  </style>
</head>
<body>
  ${nav}
  <div class="container">
    <h1>Get Started in 60 Seconds</h1>
    <div class="step">
      <h2>1. Install MetaMask</h2>
      <p>The #1 wallet used by millions — works on phone & computer</p>
      <a href="https://metamask.io/download/" target="_blank"><button class="btn">Download MetaMask</button></a>
    </div>
    <div class="step">
      <h2>2. Connect Wallet</h2>
      <p>Click below to connect and start earning $ASL tokens</p>
      <button class="btn" onclick="connect()">Connect Wallet & Start Earning</button>
    </div>
  </div>
  ${footer}
  <script>
    function connect(){if(window.ethereum)ethereum.request({method:'eth_requestAccounts'}).then(a=>alert('Connected: '+a[0]));else alert('Install MetaMask!');}
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
  <title>VRI — Anytime, Anywhere</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding-top:100px;text-align:center}
    .container{max-width:900px;margin:0 auto;padding:40px}
    h1{font-size:4.5em;margin-bottom:30px}
    p{font-size:1.6em;line-height:1.8;margin:30px 0}
    .btn{background:#00d4ff;color:#000;padding:20px 60px;font-size:1.6em;border:none;border-radius:50px;margin:40px;cursor:pointer;font-weight:700}
  </style>
</head>
<body>
  ${nav}
  <div class="container">
    <h1>VRI — Anytime. Anywhere.</h1>
    <p>Works on iPhone, Android, Mac, PC — no app needed.</p>
    <p>Instant connection to certified ASL interpreters 24/7.</p>
    <p>Earn $ASL tokens for every minute you use it.</p>
    <a href="/call"><button class="btn">Request VRI Now</button></a>
  </div>
  ${footer}
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
  <title>ASL Interpreters — Earn $ASL</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <style>
    body{font-family:'Inter',sans-serif;background:#0a0e1a;color:white;padding-top:100px}
    .container{max-width:900px;margin:0 auto;padding:40px;text-align:center}
    h1{font-size:4em;margin-bottom:40px}
    p{font-size:1.5em;line-height:1.8;margin:30px 0}
    .btn{background:#00d4ff;color:#000;padding:20px 50px;font-size:1.5em;border:none;border-radius:50px;margin:30px;cursor:pointer;font-weight:700}
    .faq{background:#111827;padding:50px;border-radius:20px;margin:60px auto;max-width:800px;text-align:left}
    .faq h3{margin:30px 0 15px;color:#00d4ff;font-size:1.6em}
  </style>
</head>
<body>
  ${nav}
  <div class="container">
    <h1>Certified ASL Interpreters</h1>
    <p>Earn <strong>45% of all platform revenue</strong> in $ASL tokens — the highest pay in the industry.</p>
    <p>Work when you want, from anywhere. Get paid instantly on-chain.</p>
    <a href="/call"><button class="btn">Go Live as Interpreter</button></a>

    <div class="faq">
      <h3>How do I get paid?</h3>
      <p>You earn $ASL tokens after every session — automatically minted to your wallet.</p>
      <h3>Do I need special software?</h3>
      <p>No. Just browser + camera.</p>
      <h3>How do I prove I'm certified?</h3>
      <p>Upload RID/NIC certificate during onboarding (coming this week).</p>
      <h3>Contact the founder:</h3>
      <p>X: <a href="https://x.com/ASLNFTS">@ASLNFTS</a> · IG: @americansignlanguage.eth</p>
    </div>
  </div>
  ${footer}
</body>
</html>
`));

// VRI CALL PAGE — FULL TWO-WAY WEBRTC VIDEO + AUDIO (WITH TURN SERVERS)
app.get('/call', (req, res) => res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>VRI Call — AmericanSignLanguage.eth</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <style>
    body{margin:0;background:#000;color:white;font-family:Arial;display:flex;flex-direction:column;height:100vh;overflow:hidden}
    video{width:100%;height:100%;object-fit:cover}
    #localVideo{position:absolute;top:20px;right:20px;width:300px;height:200px;border:3px solid #00d4ff;z-index:10;border-radius:12px}
    #remoteVideo{width:100%;height:100%}
    .controls{position:absolute;bottom:20px;width:100%;text-align:center;z-index:10}
    button{padding:15px 30px;margin:10px;font-size:18px;background:#00d4ff;color:black;border:none;border-radius:50px;cursor:pointer;font-weight:700}
    #timer{font-size:2em;margin:20px;color:#00d4ff}
    .status{position:absolute;top:20px;left:20px;background:rgba(0,0,0,0.7);padding:10px 20px;border-radius:12px}
  </style>
</head>
<body>
  <div class="status">Connecting...</div>
  <video id="localVideo" autoplay muted playsinline></video>
  <video id="remoteVideo" autoplay playsinline></video>
  <div class="controls">
    <div id="timer">00:00</div>
    <button onclick="endCall()">End Call</button>
  </div>

<script src="/socket.io/socket.io.js"></script>
<script>
  const socket = io();
  const isInterpreter = window.location.search.includes('interpreter');
  let peerConnection;
  let localStream;
  let timerInterval;
  let seconds = 0;

  // FREE TURN SERVERS — FIXES RENDER CONNECTIONS
  const config = {
    iceServers: [
      { urls: 'stun:stun.l.google.com:19302' },
      { urls: 'stun:stun1.l.google.com:19302' },
      { urls: 'turn:openrelay.metered.ca:80', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:80?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' },
      { urls: 'turn:openrelay.metered.ca:443?transport=tcp', username: 'openrelayproject', credential: 'openrelayproject' }
    ]
  };

  navigator.mediaDevices.getUserMedia({ video: true, audio: true })
    .then(stream => {
      localStream = stream;
      document.getElementById('localVideo').srcObject = stream;
      document.querySelector('.status').textContent = isInterpreter ? 'Interpreter Ready — Waiting...' : 'Requesting VRI...';
      socket.emit(isInterpreter ? 'interpreter-live' : 'deaf-request', { wallet: '0x...' });
    })
    .catch(err => {
      alert('Camera/Microphone blocked. Allow access and refresh.');
      console.error(err);
    });

  socket.on('call-matched', ({ peerId }) => {
    document.querySelector('.status').textContent = 'CALL CONNECTED!';
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));

    peerConnection.onicecandidate = e => e.candidate && socket.emit('ice-candidate', { target: peerId, candidate: e.candidate });
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];

    if (!isInterpreter) {
      peerConnection.createOffer()
        .then(offer => peerConnection.setLocalDescription(offer))
        .then(() => socket.emit('offer', { target: peerId, sdp: peerConnection.localDescription }));
    }
    startTimer();
  });

  socket.on('offer', ({ sdp, sender }) => {
    peerConnection = new RTCPeerConnection(config);
    localStream.getTracks().forEach(track => peerConnection.addTrack(track, localStream));
    peerConnection.onicecandidate = e => e.candidate && socket.emit('ice-candidate', { target: sender, candidate: e.candidate });
    peerConnection.ontrack = e => document.getElementById('remoteVideo').srcObject = e.streams[0];

    peerConnection.setRemoteDescription(sdp)
      .then(() => peerConnection.createAnswer())
      .then(answer => peerConnection.setLocalDescription(answer))
      .then(() => socket.emit('answer', { target: sender, sdp: peerConnection.localDescription }));
  });

  socket.on('answer', ({ sdp }) => peerConnection.setRemoteDescription(sdp));
  socket.on('ice-candidate', ({ candidate }) => candidate && peerConnection.addIceCandidate(candidate));
  socket.on('call-ended', () => location.reload());

  function endCall() {
    socket.emit('end-call');
    location.reload();
  }

  function startTimer() {
    timerInterval = setInterval(() => {
      seconds++;
      const m = String(Math.floor(seconds / 60)).padStart(2, '0');
      const s = String(seconds % 60).padStart(2, '0');
      document.getElementById('timer').textContent = m + ':' + s;
    }, 1000);
  }
</script>
</body>
</html>
`));

server.listen(3000, () => {
  console.log('────────────────────────────────────────');
  console.log('   FULL TWO-WAY WEBRTC VRI LIVE — WITH TURN SERVERS');
  console.log('   https://vrs-live-final.onrender.com/call');
  console.log('────────────────────────────────────────');
});

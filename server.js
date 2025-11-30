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

// VRI ONLY — CLEAN
const rooms = { vri: { name: "VRI", rate: 20 } };
let activeRooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, role, wallet }) => {
    if (!rooms[room]) return;
    socket.room = room;
    socket.role = role;
    socket.wallet = wallet.toLowerCase();
    if (!activeRooms[room]) activeRooms[room] = { users: [], interpreters: [] };
    if (role === 'interpreter') activeRooms[room].interpreters.push(socket);
    else activeRooms[room].users.push(socket);
    socket.join(room);
    console.log(`${role.toUpperCase()} → VRI → ${wallet}`);
    matchInRoom(room);
  });

  socket.on('end-session', () => endSession(socket));
  socket.on('disconnect', () => endSession(socket));
});

function matchInRoom(roomKey) {
  const r = activeRooms[roomKey];
  if (!r || r.users.length === 0 || r.interpreters.length === 0) return;
  const user = r.users.shift();
  const interpreter = r.interpreters.shift();
  user.partner = interpreter.id;
  interpreter.partner = user.id;
  user.callStart = Date.now();
  interpreter.callStart = Date.now();
  io.to(roomKey).emit('match-found');
  console.log('VRI MATCHED');
}

function endSession(socket) {
  if (!socket.callStart) return;
  const minutes = Math.floor((Date.now() - socket.callStart) / 60000);
  if (minutes <= 0) return;
  const total = minutes * 20;
  const interpreter = Math.floor(total * 45 / 100);
  const dev = Math.floor(total * 45 / 100);
  const user = total - interpreter - dev;

  io.to(socket.room).emit('mint-request', {
    minutes, total, interpreter, dev, user,
    interpreterWallet: socket.role === 'interpreter' ? socket.wallet : socket.partner?.wallet,
    userWallet: socket.role !== 'interpreter' ? socket.wallet : socket.partner?.wallet
  });
  console.log(`VRI: ${minutes} min → ${total} ASL (45/45/10)`);
  socket.callStart = null;
}

app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>VRI by AmericanSignLanguage.eth</title>
  <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;500;700;900&display=swap" rel="stylesheet">
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
  <style>
    :root{--primary:#00d4ff;--dark:#0a0e1a;--card:#111827}
    *{margin:0;padding:0;box-sizing:border-box}
    body{font-family:'Inter',sans-serif;background:var(--dark);color:white;overflow-x:hidden}
    nav{position:fixed;top:0;width:100%;background:rgba(10,14,26,0.95);backdrop-filter:blur(10px);z-index:1000;padding:20px 5%;display:flex;justify-content:space-between;align-items:center}
    .logo{font-size:1.8em;font-weight:900;letter-spacing:-1px}
    .nav-links a{color:white;text-decoration:none;margin:0 20px;font-weight:500;transition:0.3s}
    .nav-links a:hover{color:var(--primary)}
    .hero{min-height:100vh;display:flex;align-items:center;justify-content:center;text-align:center;padding:0 20px;flex-direction:column}
    h1{font-size:5em;font-weight:900;line-height:1;margin-bottom:20px;background:linear-gradient(90deg,#00d4ff,#7c3aed);-webkit-background-clip:text;-webkit-text-fill-color:transparent}
    .tagline{font-size:1.8em;margin:30px 0;font-weight:300;max-width:800px}
    .highlight{font-weight:700;color:var(--primary)}
    .btn{padding:18px 40px;margin:15px;font-size:1.3em;border:none;border-radius:50px;cursor:pointer;font-weight:700;transition:0.3s}
    .btn-primary{background:var(--primary);color:#000}
    .btn-secondary{background:transparent;border:2px solid var(--primary);color:white}
    .btn-primary:hover{transform:scale(1.05);box-shadow:0 0 30px rgba(0,212,255,0.5)}
    .roadmap{margin:100px auto;max-width:900px;background:var(--card);padding:50px;border-radius:20px}
    .roadmap h2{font-size:2.5em;margin-bottom:40px;color:var(--primary)}
    .roadmap ul{list-style:none}
    .roadmap li{font-size:1.4em;margin:25px 0;display:flex;align-items:center}
    .roadmap li::before{content:"→";color:var(--primary);font-size:1.8em;margin-right:20px}
    .social{margin:80px 0}
    .social a{color:white;font-size:3em;margin:0 25px;transition:0.3s}
    .social a:hover{transform:translateY(-5px);color:var(--primary)}
    footer{padding:60px 20px;text-align:center;color:#64748b;font-size:1em}
    a{color:var(--primary);text-decoration:none}
    @media (max-width:768px){h1{font-size:3.5em}.tagline{font-size:1.4em}.btn{font-size:1.1em}}
  </style>
</head>
<body>
  <nav>
    <div class="logo">AmericanSignLanguage.eth</div>
    <div class="nav-links">
      <a href="#">Home</a>
      <a href="#">Get Started</a>
      <a href="#">VRI</a>
      <a href="#">Interpreters</a>
    </div>
  </nav>

  <section class="hero">
    <h1>World's First<br>Blockchain VRI</h1>
    <p class="tagline">Changing the way Deaf communicate — <span class="highlight">forever.</span><br>One block at a time.</p>
    <p class="tagline">Deaf people finally get rewarded for our language — American Sign Language.<br><strong>Own your language. Own your future.</strong></p>

    <div style="margin:50px 0">
      <button class="btn btn-primary" onclick="joinVRI('deaf')">Request VRI Now</button>
      <button class="btn btn-secondary" onclick="joinVRI('interpreter')">I'm a Certified Interpreter</button>
    </div>
  </section>

  <div class="roadmap">
    <h2>Road to National ASL Day 2026</h2>
    <ul>
      <li>Dec 2025 — Onboarding certified interpreters & Deaf users</li>
      <li>Jan 2026 — Full two-way WebRTC video + audio</li>
      <li>Feb 2026 — Native iOS & Android apps</li>
      <li>Mar 2026 — Emergency SOS priority queue</li>
      <li><strong>April 15, 2026 — Global launch on National ASL Day</strong></li>
    </ul>
  </div>

  <div class="social">
    <a href="https://instagram.com/americansignlanguage.eth" target="_blank"><i class="fab fa-instagram"></i></a>
    <a href="https://x.com/asnlfts" target="_blank"><i class="fab fa-x-twitter"></i></a>
  </div>

  <footer>
    <a href="https://app.ens.domains/americansignlanguage.eth" target="_blank">americansignlanguage.eth</a> · 
    <a href="https://bueno.art/uc3v2njixystwxprxgyj/americansignlanguageeth" target="_blank">376 NFTs · Launched April 15, 2023</a><br>
    © 2025–2026 · A Deaf-led movement
  </footer>

  <script src="/socket.io/socket.io.js"></script>
  <script>
    const socket = io();
    function joinVRI(role) {
      if (!window.ethereum) return alert('MetaMask required');
      ethereum.request({method:'eth_requestAccounts'}).then(accounts => {
        socket.emit('join-room', { room: 'vri', role, wallet: accounts[0] });
        alert(role === 'deaf' ? 'VRI Request Sent — Interpreter Joining...' : 'You are now available for VRI calls');
      });
    }
    socket.on('match-found', () => alert('VRI CALL CONNECTED!'));
  </script>
</body>
</html>
`));

server.listen(3000, () => {
  console.log('VRI by AmericanSignLanguage.eth — LIVE & CLEAN');
  console.log('https://vrs-live-final.onrender.com');
});

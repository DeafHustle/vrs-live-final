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
  .then(() => console.log('MONGODB CONNECTED'))
  .catch(err => console.log('Mongo error:', err.message));

const rooms = {
  vri: { name: "VRI (Hospital/School)", rate: 20 }
};

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
    console.log(`${role.toUpperCase()} → ${rooms[room].name} → ${wallet}`);
    matchInRoom(room);
  });

  socket.on('end-session', () => endSession(socket));
  socket.on('disconnect', () => endSession(socket));
});

function matchInRoom(roomKey) {
  const r = activeRooms[roomKey];
  if (!r) return;
  if (r.users.length > 0 && r.interpreters.length > 0) {
    const user = r.users.shift();
    const interpreter = r.interpreters.shift();
    user.partner = interpreter.id;
    interpreter.partner = user.id;
    user.callStart = Date.now();
    interpreter.callStart = Date.now();
    io.to(roomKey).emit('match-found');
    console.log(`MATCHED → ${rooms[roomKey].name}`);
  }
}

function endSession(socket) {
  if (!socket.callStart) return;
  const minutes = Math.floor((Date.now() - socket.callStart) / 60000);
  if (minutes <= 0) return;

  const rate = rooms[socket.room]?.rate || 20;
  const total = minutes * rate;
  const interpreter = Math.floor(total * 45 / 100);
  const dev = Math.floor(total * 45 / 100);
  const user = total - interpreter - dev;

  io.to(socket.room).emit('mint-request', {
    minutes, total, interpreter, dev, user,
    interpreterWallet: socket.role === 'interpreter' ? socket.wallet : socket.partner?.wallet,
    userWallet: socket.role !== 'interpreter' ? socket.wallet : socket.partner?.wallet
  });

  console.log(`VRI Session: ${minutes} min → ${total} ASL (45/45/10)`);
  socket.callStart = null;
}

app.get('/', (req, res) => {
  res.send(`
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>World's First Blockchain Accessibility for the Deaf — AmericanSignLanguage.eth</title>
  <style>
    body{font-family:Arial,sans-serif;margin:0;padding:0;background:#0f172a;color:white}
    nav{background:#1e293b;padding:20px 0;position:fixed;width:100%;top:0;z-index:100}
    nav .container{display:flex;justify-content:space-between;align-items:center;max-width:1100px;margin:0 auto;padding:0 20px}
    nav a{color:white;text-decoration:none;font-size:1.1em;margin:0 20px;font-weight:bold}
    nav a:hover{color:#60a5fa}
    .logo{font-size:1.6em;font-weight:900}
    .container{max-width:900px;margin:120px auto 0;padding:40px 20px;text-align:center}
    h1{font-size:3.8em;margin:0.3em 0;line-height:1.1}
    .tagline{font-size:1.6em;color:#60a5fa;margin:30px 0;font-weight:bold}
    p{font-size:1.4em;line-height:1.7;margin:1.2em 0}
    .btn{background:#60a5fa;color:white;padding:16px 32px;margin:15px;font-size:1.3em;border:none;border-radius:50px;cursor:pointer;font-weight:bold}
    .btn:hover{background:#3b82f6}
    .roadmap{margin:80px auto;background:#1e293b;padding:40px;border-radius:16px;max-width:800px}
    ul{text-align:left;display:inline-block;margin:30px 0}
    li{margin:18px 0;font-size:1.3em}
    .social{margin:60px 0}
    .social a{color:white;margin:0 20px;font-size:3em;text-decoration:none}
    footer{margin-top:120px;color:#94a3b8;padding:30px 0;font-size:0.95em}
    a{color:#60a5fa;text-decoration:none}
    a:hover{text-decoration:underline}
  </style>
  <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/font-awesome/6.5.0/css/all.min.css">
</head>
<body>
  <nav>
    <div class="container">
      <div class="logo">AmericanSignLanguage.eth</div>
      <div>
        <a href="#">Home</a>
        <a href="#">Get Started</a>
        <a href="#">VRI</a>
        <a href="#">ASL Interpreters Inquire</a>
      </div>
    </div>
  </nav>

  <div class="container">
    <h1>World's First<br>Blockchain VRI</h1>
    <p class="tagline">Changing the way Deaf communicate — forever.<br>One block at a time.</p>
    <p class="tagline">Deaf people finally get rewarded for our language — American Sign Language.<br><strong>Own your language. Own your future.</strong></p>

    <button class="btn">Get Started</button>
    <button class="btn">VRI Now</button>
    <button class="btn">ASL Interpreters — Inquire</button>

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
  </div>
</body>
</html>
  `);
});

server.listen(3000, () => {
  console.log('VRI by AmericanSignLanguage.eth — LIVE');
  console.log('https://vrs-live-final.onrender.com');
});

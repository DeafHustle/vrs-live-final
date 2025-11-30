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

const rooms = {
  vrs:      { name: "VRS Call",          rate: 10 },
  vri:      { name: "VRI (Hospital/School)", rate: 20 },
  practice: { name: "ASL Practice",     rate: 6 },
  dating:   { name: "Deaf Dating",      rate: 12 },
  hangout:  { name: "Hangout",          rate: 4 }
};

let activeRooms = {};

io.on('connection', (socket) => {
  socket.on('join-room', ({ room, role, wallet }) => {
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
  if (!r || roomKey === 'dating') return;
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
  const rate = rooms[socket.room].rate;
  const total = minutes * rate;
  const interpreter = Math.floor(total * 45 / 100);
  const dev = Math.floor(total * 45 / 100);
  const user = total - interpreter - dev;

  io.to(socket.room).emit('mint-request', {
    minutes, total, interpreter, dev, user,
    interpreterWallet: socket.role === 'interpreter' ? socket.wallet : socket.partner?.wallet,
    userWallet: socket.role !== 'interpreter' ? socket.wallet : socket.partner?.wallet
  });
  console.log(`${rooms[socket.room].name}: ${minutes} min → ${total} ASL (45/45/10)`);
  socket.callStart = null;
}

app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>americansignlanguage.eth – FULL ECOSYSTEM</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.ethers.io/lib/ethers-5.7.umd.min.js"></script>
  <script src="/socket.io/socket.io.js"></script>
  <style>
    body{font-family:Arial;text-align:center;background:#f8f9fa;padding:20px}
    button{padding:18px 24px;margin:10px;font-size:18px;border:none;border-radius:12px;cursor:pointer}
    .deaf{background:#4CAF50;color:white}
    .interp{background:#2196F3;color:white}
    .end{background:#f44336;color:white}
    .mint{background:#FF9800;color:white;display:none}
  </style>
</head>
<body>
  <h1>americansignlanguage.eth</h1>
  <h2>The #1 Platform for the Deaf Community</h2>
  <div>
    <button class="deaf" onclick="join('vrs','deaf')">VRS Call</button>
    <button class="deaf" onclick="join('vri','deaf')">VRI (Hospital/School)</button>
    <button class="deaf" onclick="join('practice','learner')">ASL Practice</button>
    <button class="deaf" onclick="join('dating','deaf')">Deaf Dating</button>
    <button class="deaf" onclick="join('hangout','deaf')">Hangout</button>
  </div>
  <hr>
  <div>
    <button class="interp" onclick="join('vrs','interpreter')">VRS Interpreter</button>
    <button class="interp" onclick="join('vri','interpreter')">VRI Interpreter</button>
    <button class="interp" onclick="join('practice','interpreter')">Teach ASL</button>
  </div>
  <hr>
  <button class="end" onclick="socket.emit('end-session')">END SESSION</button>
  <button class="mint" id="mintBtn" onclick="mint()">MINT TOKENS NOW</button>
  <pre id="log" style="text-align:left;margin:30px auto;max-width:800px;padding:20px;background:#222;color:#0f0;border-radius:12px;max-height:500px;overflow:auto"></pre>

<script>
  const socket = io();
  const log = document.getElementById('log');
  const mintBtn = document.getElementById('mintBtn');
  function l(m){log.innerHTML+=m+'\\n';log.scrollTop=log.scrollHeight}
  async function join(room,role){
    if(!window.ethereum)return alert('Install MetaMask!');
    const [acc]=await ethereum.request({method:'eth_requestAccounts'});
    socket.emit('join-room',{room,role,wallet:acc});
    l(\`Joined ${room} as ${role === 'interpreter' ? 'Interpreter' : 'User'}\`);
  }
  socket.on('match-found',()=>l('MATCHED! Earning ASL tokens...'));
  socket.on('mint-request',d=>{
    window.mintData=d;
    mintBtn.style.display='inline-block';
    l(\`MINT READY – \${d.total} ASL tokens earned!\`);
  });
  async function mint(){
    const {interpreter,dev,user,interpreterWallet,userWallet}=window.mintData;
    const c='0x9627175C472412C5D84d781Abe950A798200316F';
    const abi=["function mintRewards(address to,uint256 amount) public"];
    const p=new ethers.providers.Web3Provider(window.ethereum);
    const s=p.getSigner();
    const t=new ethers.Contract(c,abi,s);
    try{
      l('Minting...');
      await (await t.mintRewards(interpreterWallet,ethers.utils.parseUnits(interpreter.toString(),18))).wait();
      await (await t.mintRewards('${OWNER_WALLET}',ethers.utils.parseUnits(dev.toString(),18))).wait();
      await (await t.mintRewards(userWallet,ethers.utils.parseUnits(user.toString(),18))).wait();
      l('ALL TOKENS MINTED ON-CHAIN!');
      mintBtn.style.display='none';
    }catch(e){l('Error: '+e.message)}
  }
</script>
</body>
</html>
`));

server.listen(3000, () => {
  console.log('FULL ECOSYSTEM LIVE ON RENDER');
  console.log('https://vrs-live-final.onrender.com');
});

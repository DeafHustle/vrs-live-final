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

// LOCKED ADDRESSES
const OWNER_WALLET   = '0x72683ef02989930042e4C727F26cF4DF110d6b9A';
const TOKEN_CONTRACT = '0x9627175C472412C5D84d781Abe950A798200316F';

// MongoDB
mongoose.connect('mongodb+srv://vrsadmin:vrs123456@asleth.gjolaoq.mongodb.net/aslvrs?retryWrites=true&w=majority')
  .then(() => console.log('MONGODB CONNECTED'));

let deafQueue = [];
let availableInterpreters = [];

io.on('connection', (socket) => {
  console.log('Client →', socket.id);

  socket.on('deaf-join', (data) => {
    const wallet = data?.wallet || data; // works with or without object
    socket.userType = 'deaf';
    socket.wallet = wallet.toLowerCase();
    deafQueue.push(socket);
    console.log('DEAF USER QUEUED →', wallet);
    tryMatch();
  });

  socket.on('interpreter-ready', (data) => {
    const wallet = data?.wallet || data || '0x0000000000000000000000000000000000000000';
    socket.userType = 'interpreter';
    socket.wallet = wallet.toLowerCase();
    availableInterpreters.push(socket);
    console.log('INTERPRETER READY →', wallet);
    tryMatch();
  });

  socket.on('end-call', () => endCurrentCall(socket));
  socket.on('disconnect', () => {
    deafQueue = deafQueue.filter(s => s.id !== socket.id);
    availableInterpreters = availableInterpreters.filter(s => s.id !== socket.id);
    endCurrentCall(socket);
  });
});

async function tryMatch() {
  if (deafQueue.length > 0 && availableInterpreters.length > 0) {
    const deaf = deafQueue.shift();
    const interpreter = availableInterpreters.shift();

    const startTime = Date.now();
    deaf.callStart = startTime;
    interpreter.callStart = startTime;
    deaf.partner = interpreter;
    interpreter.partner = deaf;

    deaf.emit('call-start', { partnerId: interpreter.id });
    interpreter.emit('call-start', { partnerId: deaf.id });

    console.log('CALL STARTED');
    console.log('   Deaf →', deaf.wallet);
    console.log('   Interpreter →', interpreter.wallet);
    console.log('   End call → click MINT TOKENS to send on-chain');
  }
}

function endCurrentCall(socket) {
  if (!socket.callStart) return;
  const minutes = Math.floor((Date.now() - socket.callStart) / 60000);
  if (minutes <= 0) return;

  const totalTokens = minutes * 10;
  const interpreterTokens = Math.floor(totalTokens * 45 / 100);
  const devTokens = Math.floor(totalTokens * 45 / 100);
  const deafTokens = totalTokens - interpreterTokens - devTokens;

  const deafWallet = socket.userType === 'deaf' ? socket.wallet : socket.partner?.wallet;
  const interpreterWallet = socket.userType === 'interpreter' ? socket.wallet : socket.partner?.wallet;

  if (deafWallet && interpreterWallet) {
    io.emit('mint-request', {
      minutes,
      totalTokens,
      interpreterTokens,
      devTokens,
      deafTokens,
      deafWallet,
      interpreterWallet
    });
    console.log(`MINT DATA READY – ${minutes} min → click green button`);
  }

  socket.callStart = null;
  if (socket.partner) socket.partner.callStart = null;
}

app.get('/', (req, res) => res.send(`
<!DOCTYPE html>
<html>
<head>
  <title>americansignlanguage.eth VRS – FINAL</title>
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <script src="https://cdn.ethers.io/lib/ethers-5.7.umd.min.js"></script>
  <script src="/socket.io/socket.io.js"></script>
</head>
<body style="font-family:Arial;text-align:center;padding:20px">
  <h1>americansignlanguage.eth VRS</h1>
  <button onclick="joinAsDeaf()" style="padding:15px 30px;font-size:18px;margin:10px">Deaf User</button>
  <button onclick="joinAsInterpreter()" style="padding:15px 30px;font-size:18px;margin:10px">Interpreter</button>
  <button onclick="endCall()" style="background:red;color:white;padding:15px 30px;font-size:18px;margin:10px">END CALL</button>
  <button onclick="mintTokens()" id="mintBtn" style="background:green;color:white;padding:15px 30px;font-size:18px;margin:10px;display:none">MINT TOKENS NOW</button>
  <pre id="log" style="text-align:left;margin:20px;padding:15px;background:#f0f0f0;max-height:400px;overflow:auto"></pre>

<script>
  const socket = io();
  const log = document.getElementById('log');
  const mintBtn = document.getElementById('mintBtn');
  function l(m) { log.innerHTML += m + '\\n'; log.scrollTop = log.scrollHeight; }

  socket.on('connect', () => l('Connected'));

  async function joinAsDeaf() {
    if (!window.ethereum) return alert('Install MetaMask!');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    socket.emit('deaf-join', { wallet: accounts[0] });
    l('Deaf joined → ' + accounts[0]);
  }

  async function joinAsInterpreter() {
    if (!window.ethereum) return alert('Install MetaMask!');
    const accounts = await ethereum.request({ method: 'eth_requestAccounts' });
    socket.emit('interpreter-ready', { wallet: accounts[0] });
    l('Interpreter online → ' + accounts[0]);
  }

  function endCall() { socket.emit('end-call'); l('Call ended'); }

  socket.on('call-start', () => l('CALL LIVE – earning tokens!'));

  socket.on('mint-request', (data) => {
    window.mintData = data;
    mintBtn.style.display = 'block';
    l(\`CALL ENDED – \${data.minutes} min → \${data.totalTokens} ASL\`);
    l(\`Click MINT TOKENS to send on-chain\`);
  });

  async function mintTokens() {
    if (!window.mintData) return;
    const { interpreterTokens, devTokens, deafTokens, deafWallet, interpreterWallet } = window.mintData;
    const contract = '0x9627175C472412C5D84d781Abe950A798200316F';
    const abi = ["function mintRewards(address to, uint256 amount) public"];
    const provider = new ethers.providers.Web3Provider(window.ethereum);
    const signer = provider.getSigner();
    const token = new ethers.Contract(contract, abi, signer);

    try {
      l('Minting...');
      await (await token.mintRewards(interpreterWallet, ethers.utils.parseUnits(interpreterTokens.toString(), 18))).wait();
      await (await token.mintRewards('${OWNER_WALLET}', ethers.utils.parseUnits(devTokens.toString(), 18))).wait();
      await (await token.mintRewards(deafWallet, ethers.utils.parseUnits(deafTokens.toString(), 18))).wait();
      l('ALL TOKENS MINTED ON-CHAIN!');
      mintBtn.style.display = 'none';
    } catch (e) { l('Error: ' + e.message); }
  }
</script>
</body>
</html>
`));

server.listen(3000, () => {
  console.log('────────────────────────────────────────');
  console.log('   FINAL FINAL – NO MORE ERRORS');
  console.log('   MetaMask signing + 45/45/10 split');
  console.log('   http://localhost:3000');
  console.log('────────────────────────────────────────');
});

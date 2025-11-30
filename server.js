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
  .then(() => console.log('MONGODB + WEBRTC ENGINE LIVE'));

let activeCalls = {}; // callId → { deafSocket, interpreterSocket, startTime }

io.on('connection', (socket) => {
  console.log('User connected →', socket.id);

  // Deaf user requests VRI
  socket.on('deaf-request', ({ wallet }) => {
    socket.role = 'deaf';
    socket.wallet = wallet.toLowerCase();
    socket.emit('waiting');
    console.log('DEAF USER WAITING →', wallet);
    matchCall(socket);
  });

  // Interpreter goes live
  socket.on('interpreter-live', ({ wallet }) => {
    socket.role = 'interpreter';
    socket.wallet = wallet.toLowerCase();
    console.log('INTERPRETER LIVE →', wallet);
    matchCall(socket);
  });

  // WebRTC signaling
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

    console.log('VRI CALL STARTED — TWO-WAY VIDEO + AUDIO');
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
    console.log(`VRI CALL ENDED — ${minutes} min → ${total} $ASL minted`);
  }

  call.deafSocket.emit('call-ended');
  call.interpreterSocket.emit('call-ended');
  delete activeCalls[socket.callId];
  socket.callId = null;
}

// LANDING PAGE (unchanged — clean, professional)
app.get('/', (req, res) => res.send(`YOUR EXISTING CLEAN LANDING PAGE CODE HERE`));

server.listen(3000, () => {
  console.log('────────────────────────────────────────');
  console.log('   FULL TWO-WAY WEBRTC VRI ENGINE LIVE');
  console.log('   https://vrs-live-final.onrender.com');
  console.log('────────────────────────────────────────');
});

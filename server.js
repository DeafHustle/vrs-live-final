// Start API server on different port
const apiServer = require('./apiserver');
const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const path = require('path');

const app = express();
app.use(cors());
app.use(express.json());
const server = http.createServer(app);
const io = new Server(server, { 
  cors: { origin: "*" },
  maxHttpBufferSize: 1e8 // 100MB for video streams
});

const OWNER_WALLET = '0x72683ef02989930042e4C727F26cF4DF110d6b9A';
const TOKEN_CONTRACT = '0x9627175C472412C5D84d781Abe950A798200316F';

mongoose.connect('mongodb+srv://vrsadmin:vrs123456@asleth.gjolaoq.mongodb.net/aslvrs?retryWrites=true&w=majority')
  .then(() => console.log('✅ MONGODB CONNECTED'))
  .catch(err => console.log('❌ MongoDB Error:', err));

// Session schema for tracking
const sessionSchema = new mongoose.Schema({
  roomType: String,
  userWallet: String,
  interpreterWallet: String,
  startTime: Date,
  endTime: Date,
  duration: Number,
  tokensEarned: Number,
  status: String // 'active', 'completed', 'cancelled'
});
const Session = mongoose.model('Session', sessionSchema);

const rooms = {
  vrs:      { name: "VRS Call",          rate: 10 },
  vri:      { name: "VRI (Hospital/School)", rate: 20 },
  practice: { name: "ASL Practice",     rate: 6 },
  dating:   { name: "Deaf Dating",      rate: 12 },
  hangout:  { name: "Hangout",          rate: 4 }
};

let activeRooms = {};
let sessions = {}; // Track active sessions by socket ID

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // Join room and request interpreter
  socket.on('join-room', ({ room, role, wallet, userName }) => {
    socket.room = room;
    socket.role = role;
    socket.wallet = wallet.toLowerCase();
    socket.userName = userName || 'Anonymous';
    
    if (!activeRooms[room]) {
      activeRooms[room] = { users: [], interpreters: [] };
    }
    
    if (role === 'interpreter') {
      activeRooms[room].interpreters.push(socket);
      console.log(`🎤 INTERPRETER → ${rooms[room].name} → ${wallet}`);
      // Notify interpreter of waiting users
      io.to(socket.id).emit('waiting-users', {
        count: activeRooms[room].users.length
      });
    } else {
      activeRooms[room].users.push(socket);
      console.log(`👤 USER → ${rooms[room].name} → ${wallet}`);
    }
    
    socket.join(room);
    matchInRoom(room);
  });

  // WebRTC Signaling
  socket.on('webrtc-offer', ({ offer, to }) => {
    console.log(`📹 Sending offer from ${socket.id} to ${to}`);
    io.to(to).emit('webrtc-offer', { offer, from: socket.id });
  });

  socket.on('webrtc-answer', ({ answer, to }) => {
    console.log(`📹 Sending answer from ${socket.id} to ${to}`);
    io.to(to).emit('webrtc-answer', { answer, from: socket.id });
  });

  socket.on('webrtc-ice-candidate', ({ candidate, to }) => {
    io.to(to).emit('webrtc-ice-candidate', { candidate, from: socket.id });
  });

  // Text chat during video call
  socket.on('chat-message', ({ message, to }) => {
    io.to(to).emit('chat-message', {
      message,
      from: socket.userName || 'User',
      timestamp: Date.now()
    });
  });

  // Screen sharing toggle
  socket.on('screen-share-started', ({ to }) => {
    io.to(to).emit('partner-screen-sharing', { sharing: true });
  });

  socket.on('screen-share-stopped', ({ to }) => {
    io.to(to).emit('partner-screen-sharing', { sharing: false });
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
    
    // Create session record
    const session = new Session({
      roomType: roomKey,
      userWallet: user.wallet,
      interpreterWallet: interpreter.wallet,
      startTime: new Date(),
      status: 'active'
    });
    session.save().then(doc => {
      sessions[user.id] = doc._id;
      sessions[interpreter.id] = doc._id;
    });
    
    // Notify both parties with partner details
    io.to(user.id).emit('match-found', {
      partnerId: interpreter.id,
      partnerName: interpreter.userName,
      role: 'interpreter',
      rate: rooms[roomKey].rate
    });
    
    io.to(interpreter.id).emit('match-found', {
      partnerId: user.id,
      partnerName: user.userName,
      role: 'user',
      rate: rooms[roomKey].rate
    });
    
    console.log(`✅ MATCHED → ${rooms[roomKey].name} → ${user.wallet} ↔ ${interpreter.wallet}`);
  }
}

async function endSession(socket) {
  if (!socket.callStart) return;
  
  const minutes = Math.floor((Date.now() - socket.callStart) / 60000);
  if (minutes <= 0) return;
  
  const rate = rooms[socket.room].rate;
  const total = minutes * rate;
  const interpreter = Math.floor(total * 45 / 100);
  const dev = Math.floor(total * 45 / 100);
  const user = total - interpreter - dev;

  const partnerSocket = io.sockets.sockets.get(socket.partner);
  const interpreterWallet = socket.role === 'interpreter' ? socket.wallet : partnerSocket?.wallet;
  const userWallet = socket.role !== 'interpreter' ? socket.wallet : partnerSocket?.wallet;

  // Update session in database
  if (sessions[socket.id]) {
    await Session.findByIdAndUpdate(sessions[socket.id], {
      endTime: new Date(),
      duration: minutes,
      tokensEarned: total,
      status: 'completed'
    });
    delete sessions[socket.id];
    if (socket.partner) delete sessions[socket.partner];
  }

  // Emit mint request to both parties
  const mintData = {
    minutes, 
    total, 
    interpreter, 
    dev, 
    user,
    interpreterWallet,
    userWallet,
    roomName: rooms[socket.room].name
  };

  io.to(socket.id).emit('mint-request', mintData);
  if (socket.partner) {
    io.to(socket.partner).emit('mint-request', mintData);
    io.to(socket.partner).emit('partner-ended-call'); // Notify partner
  }

  // Notify both to end call UI
  io.to(socket.id).emit('call-ended');

  console.log(`💰 ${rooms[socket.room].name}: ${minutes} min → ${total} $ASL (I:${interpreter} D:${dev} U:${user})`);
  
  socket.callStart = null;
  if (partnerSocket) {
    partnerSocket.callStart = null;
    partnerSocket.partner = null;
  }
  socket.partner = null;
}

// API Endpoints
app.get('/api/stats', async (req, res) => {
  try {
    const totalSessions = await Session.countDocuments({ status: 'completed' });
    const totalMinutes = await Session.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$duration' } } }
    ]);
    const totalTokens = await Session.aggregate([
      { $match: { status: 'completed' } },
      { $group: { _id: null, total: { $sum: '$tokensEarned' } } }
    ]);
    
    res.json({
      totalSessions,
      totalMinutes: totalMinutes[0]?.total || 0,
      totalTokens: totalTokens[0]?.total || 0,
      activeUsers: Object.keys(activeRooms).reduce((sum, room) => 
        sum + activeRooms[room].users.length + activeRooms[room].interpreters.length, 0)
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

app.get('/api/interpreter-earnings/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    const earnings = await Session.aggregate([
      { $match: { interpreterWallet: wallet, status: 'completed' } },
      { $group: { 
        _id: null, 
        totalTokens: { $sum: '$tokensEarned' },
        totalMinutes: { $sum: '$duration' },
        sessionCount: { $sum: 1 }
      }}
    ]);
    
    res.json(earnings[0] || { totalTokens: 0, totalMinutes: 0, sessionCount: 0 });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// Serve static HTML pages
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'under-construction.html'));
});

app.get('/request-service', (req, res) => {
  res.sendFile(path.join(__dirname, 'request-service.html'));
});

app.get('/vri', (req, res) => {
  res.sendFile(path.join(__dirname, 'vri-business.html'));
});

app.get('/interpreter', (req, res) => {
  res.sendFile(path.join(__dirname, 'interpreter-dashboard.html'));
});

// API endpoint for service requests
app.post('/api/request-service', async (req, res) => {
  try {
    const requestData = req.body;
    
    // Save to database
    const ServiceRequest = mongoose.model('ServiceRequest', new mongoose.Schema({
      name: String,
      business: String,
      email: String,
      phone: String,
      serviceType: String,
      datetime: Date,
      duration: String,
      description: String,
      requirements: String,
      referral: String,
      createdAt: { type: Date, default: Date.now }
    }));
    
    await ServiceRequest.create(requestData);
    
    console.log('📨 New service request:', requestData.email);
    
    // TODO: Send email notification
    
    res.json({ success: true });
  } catch (error) {
    console.error('Service request error:', error);
    res.status(500).json({ error: 'Failed to submit request' });
  }
});

// API endpoint for newsletter
app.post('/api/newsletter', async (req, res) => {
  try {
    const { email } = req.body;
    
    const Newsletter = mongoose.model('Newsletter', new mongoose.Schema({
      email: String,
      subscribedAt: { type: Date, default: Date.now }
    }));
    
    await Newsletter.create({ email });
    
    console.log('📧 Newsletter signup:', email);
    
    res.json({ success: true });
  } catch (error) {
    console.error('Newsletter error:', error);
    res.status(500).json({ error: 'Failed to subscribe' });
  }
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   🌐 americansignlanguage.eth — LIVE WITH WEBRTC');
  console.log(`   📡 Server: http://localhost:${PORT}`);
  console.log('   📹 VRI Business: /vri');
  console.log('   🎤 Interpreter: /interpreter');
  console.log('═══════════════════════════════════════════════════════');
});

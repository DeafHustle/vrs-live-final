const express = require('express');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');

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

// ============================================
// SCHEMAS
// ============================================

// Session schema for tracking
const sessionSchema = new mongoose.Schema({
  roomType: String,
visitorWallet: String,
  interpreterWallet: String,
  startTime: Date,
  endTime: Date,
  duration: Number,
  tokensEarned: Number,
  status: String // 'active', 'completed', 'cancelled'
});
const Session = mongoose.model('Session', sessionSchema);

// Enhanced Interpreter Schema (wallet optional, email required)
const interpreterSchema = new mongoose.Schema({
  // Basic Info
  wallet: { type: String, lowercase: true, sparse: true }, // Optional - can add later
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true }, // Hashed password for email login
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  phone: { type: String },
  profilePhoto: { type: String },
  bio: { type: String },
  
  // Verification Status
  status: { 
    type: String, 
    enum: ['pending', 'under_review', 'approved', 'rejected', 'suspended'],
    default: 'pending'
  },
  
  // Credentials
  credentials: {
    ridCertified: { type: Boolean, default: false },
    ridNumber: { type: String },
    ridExpiration: { type: Date },
    nicCertified: { type: Boolean, default: false },
    nicNumber: { type: String },
    stateLicense: { type: String },
    stateLicenseNumber: { type: String },
    yearsExperience: { type: Number, default: 0 },
    specializations: [{ 
      type: String, 
      enum: ['medical', 'legal', 'educational', 'mental_health', 'vri', 'general']
    }]
  },
  
  // Documents (URLs to uploaded files)
  documents: {
    ridCertificate: { type: String },
    stateLicense: { type: String },
    photoId: { type: String },
    proofOfInsurance: { type: String }
  },
  
  // Verification Process
  verification: {
    submittedAt: { type: Date },
    reviewedAt: { type: Date },
    reviewedBy: { type: String },
    notes: { type: String },
    rejectionReason: { type: String }
  },
  
  // Platform Stats
  stats: {
    totalSessions: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    totalEarnings: { type: Number, default: 0 },
    averageRating: { type: Number, default: 0 },
    totalRatings: { type: Number, default: 0 }
  },
  
  // Availability
  isOnline: { type: Boolean, default: false },
  lastOnline: { type: Date },
  
  // Timestamps
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now }
});
const Interpreter = mongoose.model('Interpreter', interpreterSchema);

// Admin Schema
const adminSchema = new mongoose.Schema({
  wallet: { type: String, required: true, unique: true, lowercase: true },
  email: { type: String, required: true },
  name: { type: String, required: true },
  role: { type: String, enum: ['owner', 'admin', 'reviewer'], default: 'reviewer' },
  createdAt: { type: Date, default: Date.now }
});
const Admin = mongoose.model('Admin', adminSchema);

// ============================================
// ROOM CONFIGURATION
// ============================================

const rooms = {
  vrs:      { name: "VRS Call",          rate: 10 },
  vri:      { name: "VRI (Hospital/School)", rate: 20 },
  practice: { name: "ASL Practice",     rate: 6 },
  dating:   { name: "Deaf Dating",      rate: 12 },
  hangout:  { name: "Hangout",          rate: 4 }
};

let activeRooms = {};
let sessions = {};

// ============================================
// SOCKET.IO - REAL-TIME COMMUNICATION
// ============================================

io.on('connection', (socket) => {
  console.log(`🔌 New connection: ${socket.id}`);

  // Join room and request interpreter
  socket.on('join-room', async ({ room, role, wallet, email, userName }) => {
    socket.room = room;
    socket.role = role;
    socket.wallet = wallet ? wallet.toLowerCase() : null;
    socket.email = email ? email.toLowerCase() : null;
    socket.userName = userName || 'Anonymous';
    
    if (!activeRooms[room]) {
      activeRooms[room] = { users: [], interpreters: [] };
    }
    
    // VERIFICATION CHECK FOR INTERPRETERS
    if (role === 'interpreter') {
      let interpreter;
      
      // Find by wallet or email
      if (wallet) {
        interpreter = await Interpreter.findOne({ 
          wallet: wallet.toLowerCase(),
          status: 'approved'
        });
      } else if (email) {
        interpreter = await Interpreter.findOne({ 
          email: email.toLowerCase(),
          status: 'approved'
        });
      }
      
      if (!interpreter) {
        socket.emit('error', { 
          message: 'You must be an approved interpreter to go online. Please apply at /interpreter/apply',
          code: 'NOT_APPROVED'
        });
        return;
      }
      
      // Store interpreter ID for later
      socket.interpreterId = interpreter._id;
      
      // Update online status
      interpreter.isOnline = true;
      interpreter.lastOnline = new Date();
      await interpreter.save();
      
      activeRooms[room].interpreters.push(socket);
      console.log(`🎤 INTERPRETER → ${rooms[room].name} → ${interpreter.firstName} ${interpreter.lastName}`);
      
      io.to(socket.id).emit('waiting-users', {
        count: activeRooms[room].users.length
      });
    } else {
      activeRooms[room].users.push(socket);
      console.log(`👤 USER → ${rooms[room].name} → ${wallet || 'anonymous'}`);
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
  socket.on('disconnect', () => handleDisconnect(socket));
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
    
    // Notify both parties
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

async function handleDisconnect(socket) {
  // Update interpreter online status
  if (socket.role === 'interpreter') {
    if (socket.interpreterId) {
      await Interpreter.findByIdAndUpdate(socket.interpreterId, {
        isOnline: false,
        lastOnline: new Date()
      });
    } else if (socket.wallet) {
      await Interpreter.findOneAndUpdate(
        { wallet: socket.wallet },
        { isOnline: false, lastOnline: new Date() }
      );
    } else if (socket.email) {
      await Interpreter.findOneAndUpdate(
        { email: socket.email },
        { isOnline: false, lastOnline: new Date() }
      );
    }
  }
  
  // End any active session
  await endSession(socket);
}

async function endSession(socket) {
  if (!socket.callStart) return;
  
  const minutes = Math.floor((Date.now() - socket.callStart) / 60000);
  if (minutes <= 0) return;
  
  const rate = rooms[socket.room].rate;
  const total = minutes * rate;
  const interpreterShare = Math.floor(total * 45 / 100);
  const devShare = Math.floor(total * 45 / 100);
  const userShare = total - interpreterShare - devShare;

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
    
    // Update interpreter stats
    if (interpreterWallet) {
      await Interpreter.findOneAndUpdate(
        { wallet: interpreterWallet },
        { 
          $inc: { 
            'stats.totalSessions': 1,
            'stats.totalMinutes': minutes,
            'stats.totalEarnings': interpreterShare
          }
        }
      );
    }
    
    delete sessions[socket.id];
    if (socket.partner) delete sessions[socket.partner];
  }

  // Emit mint request to both parties
  const mintData = {
    minutes, 
    total, 
    interpreter: interpreterShare, 
    dev: devShare, 
    user: userShare,
    interpreterWallet,
    userWallet,
    roomName: rooms[socket.room].name
  };

  io.to(socket.id).emit('mint-request', mintData);
  if (socket.partner) {
    io.to(socket.partner).emit('mint-request', mintData);
  }

  console.log(`💰 ${rooms[socket.room].name}: ${minutes} min → ${total} $ASL (I:${interpreterShare} D:${devShare} U:${userShare})`);
  
  socket.callStart = null;
  socket.partner = null;
}

// ============================================
// API ENDPOINTS - STATS
// ============================================

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
    const approvedInterpreters = await Interpreter.countDocuments({ status: 'approved' });
    const onlineInterpreters = await Interpreter.countDocuments({ status: 'approved', isOnline: true });
    
    res.json({
      totalSessions,
      totalMinutes: totalMinutes[0]?.total || 0,
      totalTokens: totalTokens[0]?.total || 0,
      approvedInterpreters,
      onlineInterpreters,
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
    const interpreter = await Interpreter.findOne({ wallet });
    
    if (interpreter) {
      res.json({
        totalTokens: interpreter.stats.totalEarnings || 0,
        totalMinutes: interpreter.stats.totalMinutes || 0,
        sessionCount: interpreter.stats.totalSessions || 0,
        averageRating: interpreter.stats.averageRating || 0,
        status: interpreter.status
      });
    } else {
      // Fallback to session-based calculation for non-verified interpreters
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
    }
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ============================================
// API ENDPOINTS - INTERPRETER VERIFICATION
// ============================================

// 1. Submit interpreter application (email-first, wallet optional)
app.post('/api/interpreter/apply', async (req, res) => {
  try {
    const {
      email,
      password,
      wallet,
      firstName,
      lastName,
      phone,
      bio,
      ridCertified,
      ridNumber,
      ridExpiration,
      nicCertified,
      nicNumber,
      stateLicense,
      stateLicenseNumber,
      yearsExperience,
      specializations
    } = req.body;

    // Validate required fields
    if (!email || !password || !firstName || !lastName) {
      return res.status(400).json({ error: 'Email, password, first name, and last name are required' });
    }

    if (password.length < 8) {
      return res.status(400).json({ error: 'Password must be at least 8 characters' });
    }

    // Check if email already exists
    const existingEmail = await Interpreter.findOne({ email: email.toLowerCase() });
    if (existingEmail) {
      return res.status(400).json({ 
        error: 'An application with this email already exists',
        status: existingEmail.status
      });
    }

    // Check if wallet already exists (if provided)
    if (wallet) {
      const existingWallet = await Interpreter.findOne({ wallet: wallet.toLowerCase() });
      if (existingWallet) {
        return res.status(400).json({ 
          error: 'This wallet is already associated with another application',
          status: existingWallet.status
        });
      }
    }

    // Hash password with bcrypt
    const hashedPassword = await bcrypt.hash(password, 10);

    const interpreter = new Interpreter({
      email: email.toLowerCase(),
      password: hashedPassword,
      wallet: wallet ? wallet.toLowerCase() : null,
      firstName,
      lastName,
      phone,
      bio,
      credentials: {
        ridCertified,
        ridNumber,
        ridExpiration: ridExpiration ? new Date(ridExpiration) : null,
        nicCertified,
        nicNumber,
        stateLicense,
        stateLicenseNumber,
        yearsExperience: parseInt(yearsExperience) || 0,
        specializations: specializations || ['general']
      },
      verification: {
        submittedAt: new Date()
      }
    });

    await interpreter.save();
    
    console.log(`📝 NEW INTERPRETER APPLICATION: ${firstName} ${lastName} (${email})${wallet ? ' + wallet' : ' (no wallet)'}`);
    
    res.json({ 
      success: true, 
      message: 'Application submitted successfully! We will review within 24-48 hours.',
      applicationId: interpreter._id,
      status: 'pending',
      hasWallet: !!wallet
    });

  } catch (error) {
    console.error('Application error:', error);
    res.status(500).json({ error: error.message });
  }
});

// 2. Check application status by wallet
app.get('/api/interpreter/status/:wallet', async (req, res) => {
  try {
    const wallet = req.params.wallet.toLowerCase();
    const interpreter = await Interpreter.findOne({ wallet });
    
    if (!interpreter) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      status: interpreter.status,
      firstName: interpreter.firstName,
      lastName: interpreter.lastName,
      submittedAt: interpreter.verification.submittedAt,
      reviewedAt: interpreter.verification.reviewedAt,
      rejectionReason: interpreter.verification.rejectionReason,
      stats: interpreter.stats,
      credentials: {
        ridCertified: interpreter.credentials.ridCertified,
        nicCertified: interpreter.credentials.nicCertified,
        specializations: interpreter.credentials.specializations
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2b. Check application status by email
app.get('/api/interpreter/status-by-email/:email', async (req, res) => {
  try {
    const email = decodeURIComponent(req.params.email).toLowerCase();
    const interpreter = await Interpreter.findOne({ email });
    
    if (!interpreter) {
      return res.json({ exists: false });
    }

    res.json({
      exists: true,
      status: interpreter.status,
      firstName: interpreter.firstName,
      lastName: interpreter.lastName,
      hasWallet: !!interpreter.wallet,
      submittedAt: interpreter.verification.submittedAt,
      reviewedAt: interpreter.verification.reviewedAt,
      rejectionReason: interpreter.verification.rejectionReason,
      stats: interpreter.stats
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2c. Interpreter login (email + password)
app.post('/api/interpreter/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    if (!email || !password) {
      return res.status(400).json({ error: 'Email and password required' });
    }

    const interpreter = await Interpreter.findOne({ email: email.toLowerCase() });
    
    if (!interpreter) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Check password with bcrypt
    const isValidPassword = await bcrypt.compare(password, interpreter.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }

    // Generate simple session token (use JWT in production)
    const sessionToken = Buffer.from(`${interpreter._id}:${Date.now()}`).toString('base64');

    res.json({
      success: true,
      interpreter: {
        id: interpreter._id,
        email: interpreter.email,
        firstName: interpreter.firstName,
        lastName: interpreter.lastName,
        status: interpreter.status,
        hasWallet: !!interpreter.wallet,
        wallet: interpreter.wallet,
        stats: interpreter.stats
      },
      token: sessionToken
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 2d. Add wallet to existing interpreter account
app.post('/api/interpreter/add-wallet', async (req, res) => {
  try {
    const { email, password, wallet } = req.body;
    
    if (!email || !password || !wallet) {
      return res.status(400).json({ error: 'Email, password, and wallet required' });
    }

    const interpreter = await Interpreter.findOne({ email: email.toLowerCase() });
    
    if (!interpreter) {
      return res.status(404).json({ error: 'Account not found' });
    }

    // Verify password with bcrypt
    const isValidPassword = await bcrypt.compare(password, interpreter.password);
    if (!isValidPassword) {
      return res.status(401).json({ error: 'Invalid password' });
    }

    // Check if wallet already used
    const existingWallet = await Interpreter.findOne({ wallet: wallet.toLowerCase() });
    if (existingWallet && existingWallet._id.toString() !== interpreter._id.toString()) {
      return res.status(400).json({ error: 'This wallet is already linked to another account' });
    }

    // Update wallet
    interpreter.wallet = wallet.toLowerCase();
    interpreter.updatedAt = new Date();
    await interpreter.save();

    console.log(`🔗 WALLET LINKED: ${interpreter.firstName} ${interpreter.lastName} → ${wallet}`);

    res.json({
      success: true,
      message: 'Wallet linked successfully! You can now earn $ASL tokens.',
      wallet: interpreter.wallet
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// 3. Get approved interpreters count (public)
app.get('/api/interpreters/count', async (req, res) => {
  try {
    const approved = await Interpreter.countDocuments({ status: 'approved' });
    const online = await Interpreter.countDocuments({ status: 'approved', isOnline: true });
    
    res.json({ approved, online });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ENDPOINTS - ADMIN
// ============================================

// Initialize admin (run once with your wallet)
app.post('/api/admin/init', async (req, res) => {
  try {
    const { wallet, email, name, secretKey } = req.body;
    
    // Secret key for admin initialization
    if (secretKey !== 'deafdev_ASL_2026') {
      return res.status(403).json({ error: 'Invalid secret key' });
    }

    const existing = await Admin.findOne({ wallet: wallet.toLowerCase() });
    if (existing) {
      return res.json({ message: 'Admin already exists', admin: existing });
    }

    const admin = new Admin({
      wallet: wallet.toLowerCase(),
      email,
      name,
      role: 'owner'
    });

    await admin.save();
    console.log(`👑 ADMIN CREATED: ${name} (${wallet})`);
    res.json({ success: true, message: 'Admin created', admin });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get pending applications
app.get('/api/admin/applications/pending', async (req, res) => {
  try {
    const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
    
    const admin = await Admin.findOne({ wallet: adminWallet });
    if (!admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const applications = await Interpreter.find({ 
      status: { $in: ['pending', 'under_review'] }
    }).sort({ 'verification.submittedAt': -1 });

    res.json({ applications, count: applications.length });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Get all interpreters
app.get('/api/admin/interpreters', async (req, res) => {
  try {
    const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
    
    const admin = await Admin.findOne({ wallet: adminWallet });
    if (!admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { status, page = 1, limit = 20 } = req.query;
    const query = status ? { status } : {};
    
    const interpreters = await Interpreter.find(query)
      .sort({ createdAt: -1 })
      .skip((page - 1) * limit)
      .limit(parseInt(limit));

    const total = await Interpreter.countDocuments(query);

    res.json({ 
      interpreters,
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        pages: Math.ceil(total / limit)
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Review application (approve/reject)
app.post('/api/admin/interpreter/:id/review', async (req, res) => {
  try {
    const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
    
    const admin = await Admin.findOne({ wallet: adminWallet });
    if (!admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { decision, notes, rejectionReason } = req.body;
    
    if (!['approved', 'rejected'].includes(decision)) {
      return res.status(400).json({ error: 'Decision must be approved or rejected' });
    }

    const interpreter = await Interpreter.findById(req.params.id);
    if (!interpreter) {
      return res.status(404).json({ error: 'Interpreter not found' });
    }

    interpreter.status = decision;
    interpreter.verification.reviewedAt = new Date();
    interpreter.verification.reviewedBy = adminWallet;
    interpreter.verification.notes = notes;
    
    if (decision === 'rejected') {
      interpreter.verification.rejectionReason = rejectionReason;
    }

    interpreter.updatedAt = new Date();
    await interpreter.save();

    console.log(`✅ INTERPRETER ${decision.toUpperCase()}: ${interpreter.firstName} ${interpreter.lastName}`);

    res.json({ 
      success: true, 
      message: `Interpreter ${decision}`,
      interpreter: {
        id: interpreter._id,
        name: `${interpreter.firstName} ${interpreter.lastName}`,
        status: interpreter.status
      }
    });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Suspend interpreter
app.post('/api/admin/interpreter/:id/suspend', async (req, res) => {
  try {
    const adminWallet = req.headers['x-admin-wallet']?.toLowerCase();
    
    const admin = await Admin.findOne({ wallet: adminWallet });
    if (!admin) {
      return res.status(403).json({ error: 'Not authorized' });
    }

    const { reason } = req.body;

    const interpreter = await Interpreter.findById(req.params.id);
    if (!interpreter) {
      return res.status(404).json({ error: 'Interpreter not found' });
    }

    interpreter.status = 'suspended';
    interpreter.verification.notes = `Suspended: ${reason}`;
    interpreter.verification.reviewedAt = new Date();
    interpreter.verification.reviewedBy = adminWallet;
    interpreter.isOnline = false;
    interpreter.updatedAt = new Date();
    
    await interpreter.save();

    console.log(`⛔ INTERPRETER SUSPENDED: ${interpreter.firstName} ${interpreter.lastName}`);

    res.json({ success: true, message: 'Interpreter suspended' });

  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// STATIC FILE SERVING
// ============================================

app.get('/', (req, res) => res.sendFile(__dirname + '/index.html'));
app.get('/vri', (req, res) => res.sendFile(__dirname + '/vri-business.html'));
app.get('/interpreter', (req, res) => res.sendFile(__dirname + '/interpreter-dashboard.html'));
app.get('/interpreter/apply', (req, res) => res.sendFile(__dirname + '/interpreter-apply.html'));
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin-dashboard.html'));

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   🌐 americansignlanguage.eth — LIVE WITH WEBRTC');
  console.log(`   📡 Server: http://localhost:${PORT}`);
  console.log('   📹 VRI Business: /vri');
  console.log('   🎤 Interpreter Dashboard: /interpreter');
  console.log('   📝 Interpreter Apply: /interpreter/apply');
  console.log('   👑 Admin Dashboard: /admin');
  console.log('═══════════════════════════════════════════════════════');
});

const express = require('express');
const path = require('path');
const http = require('http');
const { Server } = require('socket.io');
const cors = require('cors');
const mongoose = require('mongoose');
const bcrypt = require('bcrypt');
const Stripe = require('stripe');

// Initialize Stripe with environment variable
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY);
const STRIPE_PUBLISHABLE_KEY = process.env.STRIPE_PUBLISHABLE_KEY;

// Platform Configuration
const PLATFORM_CONFIG = {
  ratePerMinute: 250, // $2.50 in cents
  interpreterShare: 0.45, // 45%
  platformShare: 0.55, // 55%
  currency: 'usd'
};

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

// Session schema for tracking (with payment info)
const sessionSchema = new mongoose.Schema({
  roomType: String,
  // User info
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
  userWallet: String,
  userEmail: String,
  // Interpreter info
  interpreterId: { type: mongoose.Schema.Types.ObjectId, ref: 'Interpreter' },
  interpreterWallet: String,
  interpreterEmail: String,
  // Timing
  startTime: Date,
  endTime: Date,
  duration: Number, // in minutes
  // Payment
  payment: {
    ratePerMinute: { type: Number, default: 250 }, // cents
    totalAmount: Number, // cents
    interpreterPayout: Number, // cents
    platformFee: Number, // cents
    stripePaymentIntentId: String,
    stripeTransferId: String,
    paymentStatus: { type: String, enum: ['pending', 'authorized', 'captured', 'failed', 'refunded'], default: 'pending' },
    payoutStatus: { type: String, enum: ['pending', 'processing', 'completed', 'failed'], default: 'pending' }
  },
  tokensEarned: Number,
  status: { type: String, enum: ['waiting', 'active', 'completed', 'cancelled'], default: 'waiting' }
});
const Session = mongoose.model('Session', sessionSchema);

// User schema (for deaf users/customers)
const userSchema = new mongoose.Schema({
  email: { type: String, required: true, unique: true, lowercase: true },
  password: { type: String, required: true },
  firstName: { type: String, required: true },
  lastName: { type: String, required: true },
  vpPhone: { type: String, required: true }, // Video Phone number - required
  textPhone: { type: String }, // Text phone - optional
  wallet: { type: String, lowercase: true, sparse: true },
  // Stripe
  stripeCustomerId: { type: String },
  // Stats
  stats: {
    totalSessions: { type: Number, default: 0 },
    totalMinutes: { type: Number, default: 0 },
    totalSpent: { type: Number, default: 0 }, // cents
    tokensEarned: { type: Number, default: 0 }
  },
  createdAt: { type: Date, default: Date.now }
});
const User = mongoose.model('User', userSchema);

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
  
  // Stripe Connect (for payouts)
  stripe: {
    connectAccountId: { type: String }, // Stripe Express account ID
    onboardingComplete: { type: Boolean, default: false },
    payoutsEnabled: { type: Boolean, default: false },
    instantPayoutsEnabled: { type: Boolean, default: false }
  },
  
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

// ============================================
// API ENDPOINTS - STRIPE PAYMENTS
// ============================================

// Get Stripe publishable key
app.get('/api/stripe/config', (req, res) => {
  res.json({ 
    publishableKey: STRIPE_PUBLISHABLE_KEY,
    ratePerMinute: PLATFORM_CONFIG.ratePerMinute,
    currency: PLATFORM_CONFIG.currency
  });
});

// USER: Create/get Stripe customer
app.post('/api/stripe/create-customer', async (req, res) => {
  try {
    const { email, userId } = req.body;
    
    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Check if customer already exists
    if (user.stripeCustomerId) {
      const customer = await stripe.customers.retrieve(user.stripeCustomerId);
      return res.json({ customerId: customer.id });
    }
    
    // Create new Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      metadata: {
        userId: userId,
        platform: 'americansignlanguage.xyz'
      }
    });
    
    // Save to database
    user.stripeCustomerId = customer.id;
    await user.save();
    
    console.log(`💳 STRIPE CUSTOMER CREATED: ${user.email} → ${customer.id}`);
    
    res.json({ customerId: customer.id });
    
  } catch (error) {
    console.error('Create customer error:', error);
    res.status(500).json({ error: error.message });
  }
});

// USER: Create setup intent (for saving card)
app.post('/api/stripe/setup-intent', async (req, res) => {
  try {
    const { customerId } = req.body;
    
    const setupIntent = await stripe.setupIntents.create({
      customer: customerId,
      payment_method_types: ['card'],
      metadata: {
        platform: 'americansignlanguage.xyz'
      }
    });
    
    res.json({ clientSecret: setupIntent.client_secret });
    
  } catch (error) {
    console.error('Setup intent error:', error);
    res.status(500).json({ error: error.message });
  }
});

// USER: Get saved payment methods
app.get('/api/stripe/payment-methods/:customerId', async (req, res) => {
  try {
    const paymentMethods = await stripe.paymentMethods.list({
      customer: req.params.customerId,
      type: 'card'
    });
    
    res.json({ 
      paymentMethods: paymentMethods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4,
        expMonth: pm.card.exp_month,
        expYear: pm.card.exp_year
      }))
    });
    
  } catch (error) {
    console.error('Get payment methods error:', error);
    res.status(500).json({ error: error.message });
  }
});

// USER: Delete payment method
app.delete('/api/stripe/payment-method/:paymentMethodId', async (req, res) => {
  try {
    await stripe.paymentMethods.detach(req.params.paymentMethodId);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete payment method error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SESSION: Create payment intent (authorize hold at session start)
app.post('/api/stripe/create-session-payment', async (req, res) => {
  try {
    const { customerId, paymentMethodId, sessionId, estimatedMinutes = 60 } = req.body;
    
    // Calculate estimated amount (authorize for up to estimatedMinutes)
    const estimatedAmount = estimatedMinutes * PLATFORM_CONFIG.ratePerMinute;
    
    // Create payment intent with manual capture (hold, don't charge yet)
    const paymentIntent = await stripe.paymentIntents.create({
      amount: estimatedAmount,
      currency: PLATFORM_CONFIG.currency,
      customer: customerId,
      payment_method: paymentMethodId,
      capture_method: 'manual', // Important: This creates a hold, not a charge
      confirm: true,
      metadata: {
        sessionId: sessionId,
        estimatedMinutes: estimatedMinutes,
        ratePerMinute: PLATFORM_CONFIG.ratePerMinute,
        platform: 'americansignlanguage.xyz'
      }
    });
    
    // Update session with payment intent
    await Session.findByIdAndUpdate(sessionId, {
      'payment.stripePaymentIntentId': paymentIntent.id,
      'payment.paymentStatus': 'authorized',
      'payment.ratePerMinute': PLATFORM_CONFIG.ratePerMinute
    });
    
    console.log(`💳 PAYMENT AUTHORIZED: Session ${sessionId} → $${(estimatedAmount/100).toFixed(2)} hold`);
    
    res.json({ 
      success: true,
      paymentIntentId: paymentIntent.id,
      amountAuthorized: estimatedAmount
    });
    
  } catch (error) {
    console.error('Create session payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// SESSION: Capture payment (charge actual amount at session end)
app.post('/api/stripe/capture-session-payment', async (req, res) => {
  try {
    const { sessionId } = req.body;
    
    const session = await Session.findById(sessionId);
    if (!session) {
      return res.status(404).json({ error: 'Session not found' });
    }
    
    if (!session.payment?.stripePaymentIntentId) {
      return res.status(400).json({ error: 'No payment intent for this session' });
    }
    
    // Calculate actual amount based on duration
    const actualAmount = session.duration * PLATFORM_CONFIG.ratePerMinute;
    const interpreterPayout = Math.floor(actualAmount * PLATFORM_CONFIG.interpreterShare);
    const platformFee = actualAmount - interpreterPayout;
    
    // Capture the actual amount (less than or equal to authorized amount)
    const paymentIntent = await stripe.paymentIntents.capture(
      session.payment.stripePaymentIntentId,
      { amount_to_capture: actualAmount }
    );
    
    // Update session with final payment info
    session.payment.totalAmount = actualAmount;
    session.payment.interpreterPayout = interpreterPayout;
    session.payment.platformFee = platformFee;
    session.payment.paymentStatus = 'captured';
    await session.save();
    
    console.log(`💰 PAYMENT CAPTURED: Session ${sessionId} → $${(actualAmount/100).toFixed(2)} (Interpreter: $${(interpreterPayout/100).toFixed(2)})`);
    
    // Trigger instant payout to interpreter if they have Stripe Connect
    const interpreter = await Interpreter.findById(session.interpreterId);
    if (interpreter?.stripe?.connectAccountId && interpreter?.stripe?.payoutsEnabled) {
      try {
        await processInterpreterPayout(session, interpreter);
      } catch (payoutError) {
        console.error('Instant payout failed:', payoutError);
        // Don't fail the whole request, payout can be retried
      }
    }
    
    res.json({
      success: true,
      captured: actualAmount,
      interpreterPayout,
      platformFee
    });
    
  } catch (error) {
    console.error('Capture payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// Helper: Process interpreter payout via Stripe Connect
async function processInterpreterPayout(session, interpreter) {
  if (!interpreter.stripe?.connectAccountId) {
    throw new Error('Interpreter has no Stripe Connect account');
  }
  
  // Create transfer to interpreter's connected account
  const transfer = await stripe.transfers.create({
    amount: session.payment.interpreterPayout,
    currency: PLATFORM_CONFIG.currency,
    destination: interpreter.stripe.connectAccountId,
    metadata: {
      sessionId: session._id.toString(),
      platform: 'americansignlanguage.xyz'
    }
  });
  
  // Update session with transfer info
  session.payment.stripeTransferId = transfer.id;
  session.payment.payoutStatus = 'completed';
  await session.save();
  
  // Update interpreter earnings
  await Interpreter.findByIdAndUpdate(interpreter._id, {
    $inc: { 'stats.totalEarnings': session.payment.interpreterPayout }
  });
  
  console.log(`💸 INSTANT PAYOUT: ${interpreter.firstName} → $${(session.payment.interpreterPayout/100).toFixed(2)}`);
  
  return transfer;
}

// SESSION: Cancel/refund payment
app.post('/api/stripe/cancel-session-payment', async (req, res) => {
  try {
    const { sessionId, reason } = req.body;
    
    const session = await Session.findById(sessionId);
    if (!session?.payment?.stripePaymentIntentId) {
      return res.status(400).json({ error: 'No payment to cancel' });
    }
    
    const paymentIntent = await stripe.paymentIntents.retrieve(session.payment.stripePaymentIntentId);
    
    if (paymentIntent.status === 'requires_capture') {
      // Just cancel the hold (not yet charged)
      await stripe.paymentIntents.cancel(session.payment.stripePaymentIntentId);
      session.payment.paymentStatus = 'cancelled';
    } else if (paymentIntent.status === 'succeeded') {
      // Refund the charge
      await stripe.refunds.create({
        payment_intent: session.payment.stripePaymentIntentId,
        reason: 'requested_by_customer'
      });
      session.payment.paymentStatus = 'refunded';
    }
    
    session.status = 'cancelled';
    await session.save();
    
    console.log(`❌ PAYMENT CANCELLED: Session ${sessionId} → ${reason}`);
    
    res.json({ success: true });
    
  } catch (error) {
    console.error('Cancel payment error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ENDPOINTS - INTERPRETER STRIPE CONNECT
// ============================================

// INTERPRETER: Create Stripe Connect onboarding link
app.post('/api/stripe/connect/create-account', async (req, res) => {
  try {
    const { interpreterId } = req.body;
    
    const interpreter = await Interpreter.findById(interpreterId);
    if (!interpreter) {
      return res.status(404).json({ error: 'Interpreter not found' });
    }
    
    let accountId = interpreter.stripe?.connectAccountId;
    
    // Create new Connect account if doesn't exist
    if (!accountId) {
      const account = await stripe.accounts.create({
        type: 'express',
        country: 'US',
        email: interpreter.email,
        capabilities: {
          card_payments: { requested: true },
          transfers: { requested: true }
        },
        business_type: 'individual',
        metadata: {
          interpreterId: interpreterId,
          platform: 'americansignlanguage.xyz'
        }
      });
      
      accountId = account.id;
      
      // Save to database
      interpreter.stripe = interpreter.stripe || {};
      interpreter.stripe.connectAccountId = accountId;
      await interpreter.save();
      
      console.log(`🔗 STRIPE CONNECT ACCOUNT CREATED: ${interpreter.email} → ${accountId}`);
    }
    
    // Create onboarding link
    const accountLink = await stripe.accountLinks.create({
      account: accountId,
      refresh_url: `https://americansignlanguage.xyz/interpreter/stripe-refresh?id=${interpreterId}`,
      return_url: `https://americansignlanguage.xyz/interpreter/stripe-complete?id=${interpreterId}`,
      type: 'account_onboarding'
    });
    
    res.json({ 
      url: accountLink.url,
      accountId: accountId
    });
    
  } catch (error) {
    console.error('Create Connect account error:', error);
    res.status(500).json({ error: error.message });
  }
});

// INTERPRETER: Check Stripe Connect status
app.get('/api/stripe/connect/status/:interpreterId', async (req, res) => {
  try {
    const interpreter = await Interpreter.findById(req.params.interpreterId);
    if (!interpreter) {
      return res.status(404).json({ error: 'Interpreter not found' });
    }
    
    if (!interpreter.stripe?.connectAccountId) {
      return res.json({ 
        hasAccount: false,
        onboardingComplete: false,
        payoutsEnabled: false
      });
    }
    
    // Get account status from Stripe
    const account = await stripe.accounts.retrieve(interpreter.stripe.connectAccountId);
    
    // Update local status
    interpreter.stripe.onboardingComplete = account.details_submitted;
    interpreter.stripe.payoutsEnabled = account.payouts_enabled;
    interpreter.stripe.instantPayoutsEnabled = account.capabilities?.instant_payouts === 'active';
    await interpreter.save();
    
    res.json({
      hasAccount: true,
      accountId: interpreter.stripe.connectAccountId,
      onboardingComplete: account.details_submitted,
      payoutsEnabled: account.payouts_enabled,
      chargesEnabled: account.charges_enabled,
      instantPayoutsEnabled: account.capabilities?.instant_payouts === 'active'
    });
    
  } catch (error) {
    console.error('Connect status error:', error);
    res.status(500).json({ error: error.message });
  }
});

// INTERPRETER: Get payout history
app.get('/api/stripe/connect/payouts/:interpreterId', async (req, res) => {
  try {
    const interpreter = await Interpreter.findById(req.params.interpreterId);
    if (!interpreter?.stripe?.connectAccountId) {
      return res.json({ payouts: [] });
    }
    
    // Get recent transfers to this account
    const transfers = await stripe.transfers.list({
      destination: interpreter.stripe.connectAccountId,
      limit: 50
    });
    
    res.json({
      payouts: transfers.data.map(t => ({
        id: t.id,
        amount: t.amount,
        currency: t.currency,
        created: new Date(t.created * 1000),
        sessionId: t.metadata?.sessionId
      }))
    });
    
  } catch (error) {
    console.error('Get payouts error:', error);
    res.status(500).json({ error: error.message });
  }
});

// INTERPRETER: Create Stripe Connect dashboard link
app.post('/api/stripe/connect/dashboard-link', async (req, res) => {
  try {
    const { interpreterId } = req.body;
    
    const interpreter = await Interpreter.findById(interpreterId);
    if (!interpreter?.stripe?.connectAccountId) {
      return res.status(400).json({ error: 'No Stripe account connected' });
    }
    
    const loginLink = await stripe.accounts.createLoginLink(
      interpreter.stripe.connectAccountId
    );
    
    res.json({ url: loginLink.url });
    
  } catch (error) {
    console.error('Dashboard link error:', error);
    res.status(500).json({ error: error.message });
  }
});

// ============================================
// API ENDPOINTS - USER REGISTRATION/AUTH
// ============================================

// USER: Register new user
app.post('/api/user/register', async (req, res) => {
  try {
    const { email, password, firstName, lastName, vpPhone, textPhone, wallet } = req.body;
    
    if (!email || !password || !firstName || !lastName || !vpPhone) {
      return res.status(400).json({ error: 'Email, password, first name, last name, and VP phone number are required' });
    }
    
    // Check if exists
    const existing = await User.findOne({ email: email.toLowerCase() });
    if (existing) {
      return res.status(400).json({ error: 'Email already registered' });
    }
    
    // Hash password
    const hashedPassword = await bcrypt.hash(password, 10);
    
    // Create user
    const user = new User({
      email: email.toLowerCase(),
      password: hashedPassword,
      firstName,
      lastName,
      vpPhone,
      textPhone,
      wallet: wallet?.toLowerCase()
    });
    
    await user.save();
    
    // Create Stripe customer
    const customer = await stripe.customers.create({
      email: user.email,
      name: `${user.firstName} ${user.lastName}`,
      phone: user.vpPhone,
      metadata: { userId: user._id.toString() }
    });
    
    user.stripeCustomerId = customer.id;
    await user.save();
    
    console.log(`👤 NEW USER REGISTERED: ${user.email} (VP: ${user.vpPhone})`);
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        vpPhone: user.vpPhone,
        stripeCustomerId: user.stripeCustomerId
      }
    });
    
  } catch (error) {
    console.error('User registration error:', error);
    res.status(500).json({ error: error.message });
  }
});

// USER: Login
app.post('/api/user/login', async (req, res) => {
  try {
    const { email, password } = req.body;
    
    const user = await User.findOne({ email: email.toLowerCase() });
    if (!user) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    const isValid = await bcrypt.compare(password, user.password);
    if (!isValid) {
      return res.status(401).json({ error: 'Invalid email or password' });
    }
    
    res.json({
      success: true,
      user: {
        id: user._id,
        email: user.email,
        firstName: user.firstName,
        lastName: user.lastName,
        stripeCustomerId: user.stripeCustomerId,
        hasPaymentMethod: !!user.stripeCustomerId,
        stats: user.stats
      }
    });
    
  } catch (error) {
    console.error('User login error:', error);
    res.status(500).json({ error: error.message });
  }
});

// USER: Get profile
app.get('/api/user/:userId', async (req, res) => {
  try {
    const user = await User.findById(req.params.userId);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }
    
    // Get payment methods if has Stripe customer
    let paymentMethods = [];
    if (user.stripeCustomerId) {
      const methods = await stripe.paymentMethods.list({
        customer: user.stripeCustomerId,
        type: 'card'
      });
      paymentMethods = methods.data.map(pm => ({
        id: pm.id,
        brand: pm.card.brand,
        last4: pm.card.last4
      }));
    }
    
    res.json({
      id: user._id,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      phone: user.phone,
      wallet: user.wallet,
      stripeCustomerId: user.stripeCustomerId,
      paymentMethods,
      stats: user.stats
    });
    
  } catch (error) {
    console.error('Get user error:', error);
    res.status(500).json({ error: error.message });
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

const path = require('path');

// Serve static files (CSS, JS, images) from public folder
app.use(express.static(path.join(__dirname, 'public')));

// Serve manifest.json for PWA
app.get('/manifest.json', (req, res) => res.sendFile(path.join(__dirname, 'public', 'manifest.json')));

// Main pages
app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));
app.get('/session', (req, res) => res.sendFile(path.join(__dirname, 'public', 'session.html')));

// VRI & Interpreter pages (keep existing for now, will migrate later)
app.get('/vri', (req, res) => res.sendFile(__dirname + '/vri-business.html'));
app.get('/interpreter', (req, res) => res.sendFile(__dirname + '/interpreter-dashboard.html'));
app.get('/interpreter/apply', (req, res) => res.sendFile(__dirname + '/interpreter-apply.html'));
app.get('/interpreter/stripe-refresh', (req, res) => res.sendFile(__dirname + '/interpreter-stripe-refresh.html'));
app.get('/interpreter/stripe-complete', (req, res) => res.sendFile(__dirname + '/interpreter-stripe-complete.html'));

// Admin & Auth pages
app.get('/admin', (req, res) => res.sendFile(__dirname + '/admin-dashboard.html'));
app.get('/signup', (req, res) => res.sendFile(__dirname + '/user-signup.html'));
app.get('/login', (req, res) => res.sendFile(__dirname + '/user-login.html'));

// Dashboard pages (will create these next)
app.get('/dashboard', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));
app.get('/dashboard/*', (req, res) => res.sendFile(path.join(__dirname, 'public', 'dashboard.html')));

// ============================================
// SERVER START
// ============================================

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log('   🌐 americansignlanguage.eth — LIVE WITH WEBRTC + STRIPE');
  console.log(`   📡 Server: http://localhost:${PORT}`);
  console.log('   📹 VRI Business: /vri');
  console.log('   🎤 Interpreter Dashboard: /interpreter');
  console.log('   📝 Interpreter Apply: /interpreter/apply');
  console.log('   👑 Admin Dashboard: /admin');
  console.log('   👤 User Signup: /signup');
  console.log('   💳 Rate: $' + (PLATFORM_CONFIG.ratePerMinute/100).toFixed(2) + '/min');
  console.log('═══════════════════════════════════════════════════════');
});

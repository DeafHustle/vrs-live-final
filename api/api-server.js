const express = require('express');
const path = require('path');
const cors = require('cors');
const crypto = require('crypto');

const app = express();
app.use(cors());
app.use(express.json());

const PORT = process.env.PORT || 4000;

// In-memory storage (replace with database later)
const sessions = new Map();
const apiKeys = new Map();

// Mock API key for beta testing
apiKeys.set('asl_beta_test_key_12345', {
  name: 'Beta Tester',
  created: new Date(),
  rateLimit: 1000
});

// Middleware: API Key Authentication
function authenticateAPI(req, res, next) {
  const authHeader = req.headers.authorization;
  
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Missing or invalid Authorization header'
    });
  }
  
  const apiKey = authHeader.split(' ')[1];
  
  if (!apiKeys.has(apiKey)) {
    return res.status(401).json({
      error: 'unauthorized',
      message: 'Invalid API key'
    });
  }
  
  req.apiKey = apiKey;
  next();
}

// Mock interpreter data
const mockInterpreters = [
  {
    id: 'interp_a1b2c3',
    name: 'Professional ASL Interpreter',
    certifications: ['RID', 'NAD-IV'],
    specializations: ['medical', 'legal', 'general'],
    rating: 4.9,
    total_sessions: 1247,
    available: true
  },
  {
    id: 'interp_x9y8z7',
    name: 'Medical ASL Specialist',
    certifications: ['RID', 'CDI'],
    specializations: ['medical', 'mental_health'],
    rating: 4.8,
    total_sessions: 892,
    available: true
  }
];

// Endpoint: Request Interpreter
app.post('/v1/interpreter/request', authenticateAPI, (req, res) => {
  const {
    user_wallet,
    urgency = 'medium',
    estimated_duration,
    specialization = 'general',
    metadata = {}
  } = req.body;
  
  if (!user_wallet) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'user_wallet is required'
    });
  }
  
  if (!estimated_duration || estimated_duration < 1 || estimated_duration > 240) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'estimated_duration must be between 1 and 240 minutes'
    });
  }
  
  const requestId = `req_${crypto.randomBytes(8).toString('hex')}`;
  const roomId = crypto.randomBytes(8).toString('hex');
  
  const interpreter = mockInterpreters.find(i => 
    i.available && i.specializations.includes(specialization)
  ) || mockInterpreters[0];
  
  const session = {
    request_id: requestId,
    status: 'matched',
    interpreter: {
      id: interpreter.id,
      name: interpreter.name,
      certifications: interpreter.certifications,
      specializations: interpreter.specializations,
      rating: interpreter.rating,
      total_sessions: interpreter.total_sessions
    },
    video_room: {
      url: `https://americansignlanguage.xyz/room/${roomId}`,
      room_id: roomId,
      expires_at: new Date(Date.now() + 3600000).toISOString(),
      join_token_agent: `token_agent_${crypto.randomBytes(16).toString('hex')}`,
      join_token_user: `token_user_${crypto.randomBytes(16).toString('hex')}`,
      join_token_interpreter: `token_interp_${crypto.randomBytes(16).toString('hex')}`
    },
    pricing: {
      rate_per_minute: 20,
      currency: 'ASL',
      estimated_cost: estimated_duration * 20,
      escrow_required: estimated_duration * 20,
      escrow_tx_hash: null
    },
    estimated_wait_time: 0,
    matched_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    user_wallet,
    urgency,
    estimated_duration,
    specialization,
    metadata
  };
  
  sessions.set(requestId, session);
  
  console.log(`✅ Session created: ${requestId} for ${user_wallet}`);
  
  res.status(200).json(session);
});

// Endpoint: Get Session Status
app.get('/v1/sessions/:request_id', authenticateAPI, (req, res) => {
  const { request_id } = req.params;
  
  const session = sessions.get(request_id);
  
  if (!session) {
    return res.status(404).json({
      error: 'session_not_found',
      message: `Session ${request_id} not found`
    });
  }
  
  const now = new Date();
  const started = new Date(session.matched_at);
  const durationMinutes = Math.floor((now - started) / 60000);
  
  const statusResponse = {
    request_id: session.request_id,
    status: 'active',
    interpreter_id: session.interpreter.id,
    started_at: session.matched_at,
    duration_minutes: durationMinutes,
    estimated_end: new Date(started.getTime() + session.estimated_duration * 60000).toISOString(),
    video_room_url: session.video_room.url,
    participants: {
      user_connected: true,
      interpreter_connected: true,
      agent_connected: false
    },
    current_cost: durationMinutes * session.pricing.rate_per_minute,
    token_escrow: {
      amount: session.pricing.escrow_required,
      tx_hash: `0x${crypto.randomBytes(32).toString('hex')}`,
      released: false
    }
  };
  
  res.status(200).json(statusResponse);
});

// Endpoint: End Session
app.post('/v1/sessions/:request_id/end', authenticateAPI, (req, res) => {
  const { request_id } = req.params;
  const { ended_by = 'agent', reason = 'completed', rating, feedback } = req.body;
  
  const session = sessions.get(request_id);
  
  if (!session) {
    return res.status(404).json({
      error: 'session_not_found',
      message: `Session ${request_id} not found`
    });
  }
  
  const now = new Date();
  const started = new Date(session.matched_at);
  const durationMinutes = Math.max(1, Math.floor((now - started) / 60000));
  
  const finalCost = durationMinutes * session.pricing.rate_per_minute;
  const interpreterShare = Math.floor(finalCost * 0.45);
  const platformShare = Math.floor(finalCost * 0.45);
  const userCashback = finalCost - interpreterShare - platformShare;
  
  const endResponse = {
    request_id: session.request_id,
    status: 'completed',
    duration_minutes: durationMinutes,
    final_cost: finalCost,
    token_distribution: {
      interpreter: interpreterShare,
      platform: platformShare,
      user_cashback: userCashback,
      total: finalCost
    },
    transactions: [
      {
        to: '0xInterpreterWallet',
        amount: interpreterShare,
        tx_hash: `0x${crypto.randomBytes(32).toString('hex')}`,
        status: 'confirmed'
      },
      {
        to: '0x72683ef02989930042e4C727F26cF4DF110d6b9A',
        amount: platformShare,
        tx_hash: `0x${crypto.randomBytes(32).toString('hex')}`,
        status: 'confirmed'
      },
      {
        to: session.user_wallet,
        amount: userCashback,
        tx_hash: `0x${crypto.randomBytes(32).toString('hex')}`,
        status: 'confirmed'
      }
    ],
    refund: {
      amount: Math.max(0, session.pricing.escrow_required - finalCost),
      tx_hash: `0x${crypto.randomBytes(32).toString('hex')}`,
      reason: 'unused_escrow'
    },
    ended_at: now.toISOString(),
    ended_by,
    reason,
    rating: rating || null,
    feedback: feedback || null
  };
  
  session.status = 'completed';
  session.ended_at = now.toISOString();
  sessions.set(request_id, session);
  
  console.log(`🏁 Session ended: ${request_id} - ${durationMinutes} min - ${finalCost} ASL`);
  
  res.status(200).json(endResponse);
});

// Endpoint: List Available Interpreters
app.get('/v1/interpreters/available', authenticateAPI, (req, res) => {
  const { specialization, min_rating } = req.query;
  
  let filtered = mockInterpreters.filter(i => i.available);
  
  if (specialization) {
    filtered = filtered.filter(i => i.specializations.includes(specialization));
  }
  
  if (min_rating) {
    filtered = filtered.filter(i => i.rating >= parseFloat(min_rating));
  }
  
  res.status(200).json({
    total: filtered.length,
    available_now: filtered.length,
    interpreters: filtered.map(i => ({
      id: i.id,
      specializations: i.specializations,
      certifications: i.certifications,
      rating: i.rating,
      total_sessions: i.total_sessions,
      response_time_avg: Math.floor(Math.random() * 15) + 5,
      rate_per_minute: 20,
      available: i.available,
      next_available: null
    }))
  });
});

// Endpoint: Get Pricing
app.get('/v1/pricing', authenticateAPI, (req, res) => {
  res.status(200).json({
    base_rate_per_minute: 20,
    currency: 'ASL',
    specialization_multipliers: {
      general: 1.0,
      medical: 1.0,
      legal: 1.2,
      educational: 1.0,
      emergency: 1.5
    },
    urgency_multipliers: {
      low: 1.0,
      medium: 1.0,
      high: 1.2,
      emergency: 2.0
    },
    revenue_split: {
      interpreter_percent: 45,
      platform_percent: 45,
      user_cashback_percent: 10
    },
    minimum_session_minutes: 5,
    api_fee_per_request: 0
  });
});

// Endpoint: Health Check
app.get('/v1/health', (req, res) => {
  res.status(200).json({
    status: 'ok',
    version: '1.0.0-beta',
    timestamp: new Date().toISOString(),
    sessions: {
      active: Array.from(sessions.values()).filter(s => s.status === 'active').length,
      total: sessions.size
    }
  });
});

// Endpoint: Get API Key (for testing)
app.post('/v1/auth/get-test-key', (req, res) => {
  const { email } = req.body;
  
  if (!email) {
    return res.status(400).json({
      error: 'invalid_request',
      message: 'email is required'
    });
  }
  
  const testKey = `asl_beta_${crypto.randomBytes(16).toString('hex')}`;
  
  apiKeys.set(testKey, {
    email,
    created: new Date(),
    rateLimit: 100
  });
  
  console.log(`🔑 Test API key created for ${email}`);
  
  res.status(200).json({
    api_key: testKey,
    message: 'Test API key created. Valid for beta testing.',
    rate_limit: '100 requests/hour',
    note: 'This is a test key. Production keys will require approval.'
  });
});

// Root endpoint

// Serve website HTML files
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, '../under-construction.html'));
});

app.get('/request-service', (req, res) => {
  res.sendFile(path.join(__dirname, '../request-service.html'));
});

app.get('/vri', (req, res) => {
  res.sendFile(path.join(__dirname, '../vri-business.html'));
});

app.get('/interpreter', (req, res) => {
  res.sendFile(path.join(__dirname, '../interpreter-dashboard.html'));
});

// API info endpoint
app.get('/api', (req, res) => {
  res.json({
    name: 'ASL AI Agent API',
    version: '1.0.0-beta',
    status: 'Beta - Mock Data',
    docs: 'https://github.com/DeafHustle/asl-ai-agent-api',
    website: 'https://americansignlanguage.xyz',
    endpoints: {
      health: '/v1/health',
      get_test_key: 'POST /v1/auth/get-test-key',
      request_interpreter: 'POST /v1/interpreter/request',
      get_session: 'GET /v1/sessions/:id',
      end_session: 'POST /v1/sessions/:id/end',
      list_interpreters: 'GET /v1/interpreters/available',
      pricing: 'GET /v1/pricing'
    },
    note: 'Using mock data while recruiting interpreters. Full production: April 15, 2026'
  });
});

app.listen(PORT, () => {
  console.log('═══════════════════════════════════════════════════════');
  console.log(`   🤖 ASL AI AGENT API - BETA`);
  console.log(`   📡 Server: http://localhost:${PORT}`);
  console.log(`   🌐 Docs: https://github.com/DeafHustle/asl-ai-agent-api`);
  console.log(`   ⚠️  Status: Mock data - recruiting interpreters`);
  console.log('═══════════════════════════════════════════════════════');
});

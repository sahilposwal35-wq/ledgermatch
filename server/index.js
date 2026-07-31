require('dotenv').config();
const express = require('express');
const cors = require('cors');
const mongoose = require('mongoose');
const reconciliationRoutes = require('./routes/reconciliation');
const uploadRoutes = require('./routes/upload');

const app = express();
app.use(cors());
app.use(express.json());
app.use('/api', reconciliationRoutes);
app.use('/api', uploadRoutes);

app.get('/health', (req, res) => {
  const dbState = mongoose.connection.readyState; // 1 = connected
  res.status(dbState === 1 ? 200 : 503).json({
    status: dbState === 1 ? 'ok' : 'degraded',
    database: ['disconnected', 'connected', 'connecting', 'disconnecting'][dbState] || 'unknown'
  });
});

// Catches anything that slips past individual routes — e.g. Multer's file-size-limit
// error — so the client always gets clean JSON back instead of a raw HTML crash page
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  res.status(err.status || 500).json({ error: err.message || 'Something went wrong' });
});

const PORT = process.env.PORT || 5000;

// family: 4 forces IPv4 for this connection. Some hosting providers (Render included)
// route outbound connections over IPv6 by default, and Atlas's TLS termination can
// fail the handshake over IPv6 with an opaque "tlsv1 alert internal error" — forcing
// IPv4 sidesteps that entirely.
mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ledgermatch', { family: 4 })
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`LedgerMatch API running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));

// If the connection drops after startup (network blip, Atlas maintenance, etc.),
// log it instead of letting requests hang silently forever
mongoose.connection.on('error', err => console.error('MongoDB runtime error:', err));
mongoose.connection.on('disconnected', () => console.warn('MongoDB disconnected'));
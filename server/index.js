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

app.get('/health', (req, res) => res.json({ status: 'ok' }));

const PORT = process.env.PORT;

mongoose.connect(process.env.MONGO_URI )
  .then(() => {
    console.log('MongoDB connected');
    app.listen(PORT, () => console.log(`LedgerMatch API running on port ${PORT}`));
  })
  .catch(err => console.error('MongoDB connection error:', err));

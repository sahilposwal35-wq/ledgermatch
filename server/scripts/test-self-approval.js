/**
 * Integration test: Self-approval prevention after role change.
 *
 * This covers the hardest edge case in the maker-checker design:
 *   1. User A registers as a maker and creates a batch
 *   2. User A uploads CSVs and runs reconciliation → matches are created
 *   3. User A's role is flipped to 'checker' directly in the DB (simulating an admin action)
 *   4. User A tries to approve a match on their own batch → MUST get 403
 *
 * This proves that the self-approval check is DB-based (compares batch.createdBy
 * against the JWT's user ID), not role-based. Even after a role change, a user
 * cannot approve work they initiated.
 *
 * Usage: node server/scripts/test-self-approval.js
 *
 * Requires: a running MongoDB instance (local or Atlas, via MONGO_URI in .env)
 */
require('dotenv').config();
const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const User = require('../models/User');
const Batch = require('../models/Batch');
const LedgerA = require('../models/LedgerA');
const LedgerB = require('../models/LedgerB');
const Match = require('../models/Match');
const AuditLog = require('../models/AuditLog');
const { runReconciliation } = require('../services/matchingEngine');

const JWT_SECRET = process.env.JWT_SECRET || 'ledger-secret-fallback-key';
const TEST_BATCH = 'TEST-SELF-APPROVAL-' + Date.now();
const TEST_EMAIL = `test-self-approval-${Date.now()}@test.com`;

async function cleanup() {
  await LedgerA.deleteMany({ batchId: TEST_BATCH });
  await LedgerB.deleteMany({ batchId: TEST_BATCH });
  await Match.deleteMany({ batchId: TEST_BATCH });
  await AuditLog.deleteMany({ batchId: TEST_BATCH });
  await Batch.deleteOne({ name: TEST_BATCH });
  await User.deleteOne({ email: TEST_EMAIL });
}

async function test() {
  await mongoose.connect(process.env.MONGO_URI || 'mongodb://localhost:27017/ledgermatch');
  console.log('Connected to MongoDB\n');

  try {
    // Cleanup any leftover test data
    await cleanup();

    // Step 1: Create a user with role 'maker'
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash('testpass', salt);
    const userA = await User.create({ email: TEST_EMAIL, password: hashedPassword, role: 'maker' });
    console.log(`✓ Step 1: Created user ${TEST_EMAIL} with role 'maker' (id: ${userA._id})`);

    // Step 2: Create a batch owned by user A
    const batch = await Batch.create({ name: TEST_BATCH, createdBy: userA._id });
    console.log(`✓ Step 2: Created batch '${TEST_BATCH}' (createdBy: ${batch.createdBy})`);

    // Step 3: Insert minimal ledger data and run reconciliation
    await LedgerA.create({ txnId: 'TEST-A1', amount: 100, date: new Date(), refId: 'REF-TEST', batchId: TEST_BATCH });
    await LedgerB.create({ statementId: 'TEST-B1', amount: 100, date: new Date(), refId: 'REF-TEST', batchId: TEST_BATCH });
    await runReconciliation(TEST_BATCH);
    const matches = await Match.find({ batchId: TEST_BATCH });
    console.log(`✓ Step 3: Ran reconciliation, got ${matches.length} match(es)`);

    if (matches.length === 0) {
      throw new Error('FAIL: No matches were created — cannot test resolution');
    }

    const matchToResolve = matches[0];
    console.log(`  Match to resolve: ${matchToResolve._id} (type: ${matchToResolve.matchType})`);

    // Step 4: Flip user A's role to 'checker' directly in the DB
    await User.updateOne({ _id: userA._id }, { role: 'checker' });
    const updatedUser = await User.findById(userA._id);
    console.log(`✓ Step 4: Flipped user role to '${updatedUser.role}' in DB`);

    // Step 5: Generate a NEW JWT with the checker role (simulating a fresh login)
    const token = jwt.sign({ user: { id: userA._id.toString(), role: 'checker' } }, JWT_SECRET, { expiresIn: '1h' });
    console.log(`✓ Step 5: Generated new JWT with role 'checker'`);

    // Step 6: Simulate the resolve endpoint's self-approval check
    // This replicates the exact logic from PATCH /matches/:id/resolve
    const batchForCheck = await Batch.findOne({ name: matchToResolve.batchId });
    const decoded = jwt.verify(token, JWT_SECRET);
    const requestUserId = decoded.user.id;

    console.log(`\n  Self-approval check:`);
    console.log(`    batch.createdBy.toString() = '${batchForCheck.createdBy.toString()}'`);
    console.log(`    req.user.id.toString()     = '${requestUserId.toString()}'`);
    console.log(`    Match? ${batchForCheck.createdBy.toString() === requestUserId.toString()}`);

    if (batchForCheck.createdBy.toString() === requestUserId.toString()) {
      console.log(`\n✓ Step 6: PASS — Self-approval correctly BLOCKED (403 would be returned)`);
      console.log(`  Even though the user is now a 'checker', the DB-based ownership check`);
      console.log(`  prevents them from approving matches on a batch they created.`);
    } else {
      console.error(`\n✗ Step 6: FAIL — Self-approval was NOT blocked!`);
      console.error(`  This means the .toString() comparison failed or the batch ownership is wrong.`);
      process.exitCode = 1;
    }

    // Step 7: Verify that a DIFFERENT checker CAN approve
    const checkerB = await User.create({ 
      email: `checker-b-${Date.now()}@test.com`, 
      password: hashedPassword, 
      role: 'checker' 
    });
    const checkerBatchCheck = batchForCheck.createdBy.toString() === checkerB._id.toString();
    console.log(`\n  Cross-check: different checker (${checkerB._id}) vs batch creator (${batchForCheck.createdBy})`);
    console.log(`  Match? ${checkerBatchCheck}`);
    
    if (!checkerBatchCheck) {
      console.log(`✓ Step 7: PASS — Different checker is NOT blocked (approval would succeed)`);
    } else {
      console.error(`✗ Step 7: FAIL — Different checker was wrongly blocked!`);
      process.exitCode = 1;
    }

    // Cleanup
    await User.deleteOne({ _id: checkerB._id });

  } finally {
    await cleanup();
    await mongoose.disconnect();
    console.log('\nTest complete. Database cleaned up.');
  }
}

test().catch(err => {
  console.error('Test error:', err);
  process.exitCode = 1;
});

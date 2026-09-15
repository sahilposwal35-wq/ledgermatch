const jwt = require('jsonwebtoken');

module.exports = function(req, res, next) {
  // Get token from header
  const authHeader = req.header('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token, authorization denied' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET || 'ledger-secret-fallback-key');
    // decoded.user contains { id, role } — both set at login/register time.
    // Note: if a user's role is changed directly in the DB, this JWT will still
    // carry the OLD role until it expires (up to 7 days). The self-approval check
    // in the resolve endpoint is DB-based and unaffected by this, but role-gated
    // middleware (requireRole) could reflect a stale role. Production systems would
    // use short-lived access tokens + refresh tokens, or validate the role against
    // the DB on every request.
    req.user = decoded.user;
    next();
  } catch (err) {
    res.status(401).json({ error: 'Token is not valid' });
  }
};

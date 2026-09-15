/**
 * Role-based access control middleware factory.
 *
 * Usage:
 *   router.post('/some-route', auth, requireRole('maker'), handler);
 *   router.patch('/some-route', auth, requireRole('checker'), handler);
 *
 * Must be placed AFTER the auth middleware (which sets req.user from the JWT).
 * Returns 403 if the authenticated user's role is not in the allowed list.
 */
function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user || !req.user.role) {
      return res.status(403).json({ error: 'Access denied: no role found on token' });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        error: `Access denied: this action requires one of [${allowedRoles.join(', ')}] role, but your role is '${req.user.role}'`
      });
    }

    next();
  };
}

module.exports = requireRole;

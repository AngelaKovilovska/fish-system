function adminOnly(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ error: 'Немате дозвола за оваа акција' });
  }
  next();
}

module.exports = adminOnly;

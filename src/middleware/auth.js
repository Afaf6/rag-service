const jwt = require('jsonwebtoken');

// Middleware to authenticate requests using JWT
// This middleware checks for a valid JWT token in the Authorization header of incoming requests.

function authenticate(req, res, next) {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'No token provided, please log in' });
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Check if the role is not 'user' (i.e., it's an admin or doctor)

    if (decoded.role && decoded.role !== 'user') {
      return res.status(403).json({ error: 'This service is available for patients only' });
    }

    req.patientId = decoded.id || decoded.patientId || decoded._id;

    if (!req.patientId) {
      return res.status(401).json({ error: 'Invalid token' });
    }

    next();
  } catch (err) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }
}

module.exports = authenticate;


/**
 * بيتحقق من التوكين الجاي من الباك اند الرئيسي للبروجيكت.
 * لازم الـ JWT_SECRET يكون نفسه المستخدم هناك عشان التوكين يتفك صح.
 * بيحط req.patientId عشان كل الكنترولرز تستخدمه في الفلترة.
 */
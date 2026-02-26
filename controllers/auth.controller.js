import User from '../models/User.js';
import Business from '../models/Business.js';
import Session from '../models/Session.js';
import Subscription from '../models/Subscription.js';
import SessionService from '../services/SessionService.js';
import jwt from 'jsonwebtoken';

const ALLOWED_SHORTCUT_ACTIONS = [
  'page_header_primary_action',
  'production_add_row'
];

// Parse user agent for device info
const parseUserAgent = (userAgent) => {
  const ua = userAgent || '';

  let os = 'Unknown';
  if (ua.includes('Windows')) os = 'Windows';
  else if (ua.includes('Mac')) os = 'macOS';
  else if (ua.includes('Linux')) os = 'Linux';
  else if (ua.includes('Android')) os = 'Android';
  else if (ua.includes('iOS')) os = 'iOS';

  let browser = 'Unknown';
  if (ua.includes('Chrome')) browser = 'Chrome';
  else if (ua.includes('Firefox')) browser = 'Firefox';
  else if (ua.includes('Safari')) browser = 'Safari';
  else if (ua.includes('Edge')) browser = 'Edge';

  let device = 'Desktop';
  if (ua.includes('Mobile')) device = 'Mobile';
  else if (ua.includes('Tablet')) device = 'Tablet';

  return { os, browser, device, userAgent: ua };
};

const createAccessToken = (userId, sessionId) =>
  jwt.sign(
    { id: userId, sessionId },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRE }
  );

const sanitizeShortcuts = (input) => {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    return null;
  }

  const sanitized = {};

  for (const actionId of ALLOWED_SHORTCUT_ACTIONS) {
    const value = input[actionId];
    if (typeof value === 'string') {
      sanitized[actionId] = value.trim();
    }
  }

  return sanitized;
};

const toShortcutObject = (value) => Object.fromEntries(value || []);

/* LOGIN */
export const login = async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const deviceInfo = parseUserAgent(req.headers['user-agent']);

    const user = await User.findOne({ username });
    if (!user) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    const match = await user.matchPassword(password);
    if (!match) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Your account has been deactivated' });
    }

    // Check for existing active session
    const existingSession = await SessionService.hasActiveSession(user._id);
    if (existingSession) {
      return res.status(409).json({
        message: 'You are already logged in from another device',
        code: 'ALREADY_LOGGED_IN',
        sessionInfo: {
          sessionId: existingSession.sessionId,
          createdAt: existingSession.createdAt,
        },
      });
    }

    // Business validation for non-developers
    let businessData = null;
    let resolvedShortcuts = toShortcutObject(user.shortcuts);
    if (user.role !== 'developer') {
      if (!user.businessId) {
        return res.status(403).json({ message: 'No business associated' });
      }

      const business = await Business.findById(user.businessId);
      if (!business || !business.isActive) {
        return res.status(403).json({ message: 'Business not found or inactive' });
      }

      businessData = {
        id: business._id,
        name: business.name,
        isActive: business.isActive,
        invoice_banner_data: business.invoice_banner_data || "",
      };
      const businessShortcuts = toShortcutObject(business.shortcuts);
      resolvedShortcuts = Object.keys(businessShortcuts).length > 0
        ? businessShortcuts
        : resolvedShortcuts;
    }

    // Create session
    const { sessionId, refreshToken } = await SessionService.createSession(
      user._id,
      deviceInfo,
      ipAddress
    );

    // Generate access token
    const accessToken = createAccessToken(user._id, sessionId);

    res.json({
      accessToken,
      refreshToken,
      sessionId,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        shortcuts: resolvedShortcuts,
        ...(businessData && { business: businessData }),
      },
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ message: 'Server error. Try again.' });
  }
};

/* FORCE LOGIN (override existing session) */
export const forceLogin = async (req, res) => {
  try {
    const { username, password } = req.body;
    const ipAddress = req.ip || req.connection.remoteAddress;
    const deviceInfo = parseUserAgent(req.headers['user-agent']);

    const user = await User.findOne({ username });
    if (!user || !await user.matchPassword(password)) {
      return res.status(401).json({ message: 'Invalid credentials' });
    }

    if (!user.isActive) {
      return res.status(403).json({ message: 'Account deactivated' });
    }

    // Invalidate all existing sessions
    await SessionService.invalidateAllUserSessions(user._id);

    // Business validation
    let businessData = null;
    let resolvedShortcuts = toShortcutObject(user.shortcuts);
    if (user.role !== 'developer') {
      if (!user.businessId) {
        return res.status(403).json({ message: 'No business associated' });
      }

      const business = await Business.findById(user.businessId);
      if (!business || !business.isActive) {
        return res.status(403).json({ message: 'Business inactive' });
      }

      businessData = {
        id: business._id,
        name: business.name,
        isActive: business.isActive,
        invoice_banner_data: business.invoice_banner_data || "",
      };
      const businessShortcuts = toShortcutObject(business.shortcuts);
      resolvedShortcuts = Object.keys(businessShortcuts).length > 0
        ? businessShortcuts
        : resolvedShortcuts;
    }

    // Create new session
    const { sessionId, refreshToken } = await SessionService.createSession(
      user._id,
      deviceInfo,
      ipAddress
    );

    const accessToken = createAccessToken(user._id, sessionId);

    res.json({
      accessToken,
      refreshToken,
      sessionId,
      user: {
        id: user._id,
        name: user.name,
        username: user.username,
        role: user.role,
        isActive: user.isActive,
        shortcuts: resolvedShortcuts,
        ...(businessData && { business: businessData }),
      },
    });
  } catch (err) {
    console.error('Force login error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* REFRESH TOKEN */
export const refreshToken = async (req, res) => {
  try {
    const { refreshToken, sessionId } = req.body;

    if (!refreshToken || !sessionId) {
      return res.status(400).json({ message: 'Missing refresh token or session ID' });
    }

    const session = await SessionService.verifyRefreshToken(refreshToken, sessionId);
    if (!session) {
      return res.status(401).json({
        message: 'Invalid refresh token',
        code: 'REFRESH_INVALID',
      });
    }

    // Generate new access token
    const accessToken = createAccessToken(session.userId, sessionId);

    res.json({ accessToken });
  } catch (err) {
    console.error('Refresh token error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* LOGOUT */
export const logout = async (req, res) => {
  try {
    const { sessionId } = req;

    await SessionService.invalidateSession(sessionId);

    res.json({ message: 'Logged out successfully' });
  } catch (err) {
    console.error('Logout error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* LOGOUT FROM ALL DEVICES */
export const logoutAll = async (req, res) => {
  try {
    await SessionService.invalidateAllUserSessions(req.user._id);

    res.json({ message: 'Logged out from all devices' });
  } catch (err) {
    console.error('Logout all error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* GET CURRENT USER */
export const me = async (req, res) => {
  try {
    const userShortcuts = toShortcutObject(req.user.shortcuts);
    const businessShortcuts = toShortcutObject(req.business?.shortcuts);
    const resolvedShortcuts =
      req.user.role === "developer"
        ? userShortcuts
        : (Object.keys(businessShortcuts).length > 0 ? businessShortcuts : userShortcuts);

    const response = {
      id: req.user._id,
      name: req.user.name,
      username: req.user.username,
      role: req.user.role,
      isActive: req.user.isActive,
      shortcuts: resolvedShortcuts,
    };

    if (req.business) {
      response.business = {
        id: req.business._id,
        name: req.business.name,
        isActive: req.business.isActive,
        invoice_banner_data: req.business.invoice_banner_data || "",
      };
    }

    if (req.user.role !== "developer" && req.user.businessId) {
      const subscription = await Subscription.findOne({ businessId: req.user.businessId }).lean();
      if (subscription) {
        const now = new Date();
        const expiresAt = subscription.expiresAt ? new Date(subscription.expiresAt) : null;
        const readOnly = Boolean(expiresAt && expiresAt < now);

        response.subscription = {
          plan: subscription.plan,
          status: readOnly ? "expired" : subscription.status,
          active: readOnly ? false : Boolean(subscription.active),
          startsAt: subscription.startsAt || null,
          expiresAt: subscription.expiresAt || null,
          readOnly,
        };
      } else {
        response.subscription = null;
      }
    }

    res.json(response);
  } catch (err) {
    console.error('Me endpoint error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* UPDATE MY SHORTCUTS */
export const updateMyShortcuts = async (req, res) => {
  try {
    if (req.user.role === "developer") {
      return res.status(403).json({ message: "Developer shortcuts are disabled" });
    }

    const sanitizedShortcuts = sanitizeShortcuts(req.body?.shortcuts);

    if (!sanitizedShortcuts) {
      return res.status(400).json({ message: 'Invalid shortcuts payload' });
    }

    const business = await Business.findById(req.user.businessId);
    if (!business) {
      return res.status(404).json({ message: 'Business not found' });
    }

    const subscription = await Subscription.findOne({ businessId: req.user.businessId }).lean();
    const now = new Date();
    const isReadOnly = Boolean(subscription?.expiresAt && new Date(subscription.expiresAt) < now);
    if (isReadOnly) {
      return res.status(402).json({
        message: "Subscription expired. Account is in read-only mode.",
        code: "SUBSCRIPTION_EXPIRED_READ_ONLY",
        readOnly: true,
        expiresAt: subscription.expiresAt,
      });
    }

    business.shortcuts = {
      ...toShortcutObject(business.shortcuts),
      ...sanitizedShortcuts,
    };

    await business.save();

    return res.json({
      shortcuts: Object.fromEntries(business.shortcuts || []),
    });
  } catch (err) {
    console.error('Update shortcuts error:', err);
    return res.status(500).json({ message: 'Failed to update shortcuts' });
  }
};

/* GET ACTIVE SESSIONS */
// export const getSessions = async (req, res) => {
//   try {
//     const sessions = await SessionService.getUserSessions(req.user._id);

//     res.json({ sessions });
//   } catch (err) {
//     console.error('Get sessions error:', err);
//     res.status(500).json({ message: 'Server error' });
//   }
// };

export const getSessions = async (req, res) => {
  try {
    const sessions = await SessionService.getUserSessionsWithCurrent(
      req.user._id,
      req.sessionId // Current session from auth middleware
    );

    res.json({
      sessions,
      currentSessionId: req.sessionId, // Explicit current session
    });
  } catch (err) {
    console.error('Get sessions error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

/* REVOKE SPECIFIC SESSION */
export const revokeSession = async (req, res) => {
  try {
    const { sessionId } = req.params;

    if (!sessionId) {
      return res.status(400).json({ message: 'Session ID is required' });
    }

    if (sessionId === req.sessionId) {
      return res.status(400).json({ message: 'Cannot revoke current session from this action' });
    }

    const result = await Session.updateOne(
      {
        sessionId,
        userId: req.user._id,
        valid: true,
      },
      {
        valid: false,
      }
    );

    if (!result.modifiedCount) {
      return res.status(404).json({ message: 'Session not found' });
    }

    res.json({ message: 'Session revoked successfully' });
  } catch (err) {
    console.error('Revoke session error:', err);
    res.status(500).json({ message: 'Server error' });
  }
};

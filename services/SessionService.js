import Session from '../models/Session.js';
import crypto from 'crypto';
import jwt from 'jsonwebtoken';

class SessionService {
  // Generate unique session ID
  static generateSessionId() {
    return crypto.randomBytes(32).toString('hex');
  }

  // Hash refresh token before storing
  static hashToken(token) {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  // Create new session
  static async createSession(userId, deviceInfo, ipAddress) {
    const sessionId = this.generateSessionId();
    const refreshToken = jwt.sign(
      { userId, sessionId },
      process.env.JWT_REFRESH_SECRET,
      { expiresIn: process.env.JWT_REFRESH_EXPIRE }
    );

    const session = await Session.create({
      userId,
      sessionId,
      refreshToken: this.hashToken(refreshToken),
      device: deviceInfo.device,
      os: deviceInfo.os,
      browser: deviceInfo.browser,
      ipAddress,
      userAgent: deviceInfo.userAgent,
    });

    return { sessionId, refreshToken };
  }

  // Check if user has active session
  static async hasActiveSession(userId) {
    const activeSession = await Session.findOne({ 
      userId, 
      valid: true 
    }).select('sessionId createdAt');
    
    return activeSession;
  }

  // Validate session exists and is active
  static async validateSession(sessionId) {
    const session = await Session.findOne({ 
      sessionId, 
      valid: true 
    });
    
    if (!session) return null;

    // Update last activity
    session.lastActivity = new Date();
    await session.save();

    return session;
  }

  // Invalidate specific session (logout)
  static async invalidateSession(sessionId) {
    await Session.updateOne(
      { sessionId },
      { valid: false }
    );
  }

  // Invalidate all user sessions (logout from all devices)
  static async invalidateAllUserSessions(userId) {
    await Session.updateMany(
      { userId },
      { valid: false }
    );
  }

  // Get all active sessions for user
  static async getUserSessions(userId) {
    return await Session.find({ 
      userId, 
      valid: true 
    }).select('sessionId device os browser ipAddress createdAt lastActivity').sort({ lastActivity: -1 });
  }

  // SessionService.js - Add this method
  static async getUserSessionsWithCurrent(userId, currentSessionId) {
    const sessions = await Session.find({ 
      userId, 
      valid: true
    })
    .select('sessionId device os browser ipAddress createdAt lastActivity')
    .sort({ lastActivity: -1 });

    return sessions.map(session => ({
      ...session.toObject(),
      isCurrent: session.sessionId === currentSessionId
    }));
  }

  static async getActiveSessionsForDeveloper() {
    const sessions = await Session.find({ valid: true })
      .populate({
        path: 'userId',
        select: 'name username role isActive businessId',
        populate: {
          path: 'businessId',
          select: 'name',
        },
      })
      .sort({ lastActivity: -1 })
      .lean();

    const grouped = new Map();

    sessions.forEach((session) => {
      const user = session.userId;
      if (!user) return;

      const userKey = String(user._id);
      if (!grouped.has(userKey)) {
        grouped.set(userKey, {
          userId: userKey,
          name: user.name,
          username: user.username,
          role: user.role,
          isActive: Boolean(user.isActive),
          businessName: user.businessId?.name || '',
          sessionCount: 0,
          lastActivity: session.lastActivity || session.createdAt || null,
          createdAt: session.createdAt || null,
          sessions: [],
        });
      }

      const current = grouped.get(userKey);
      current.sessionCount += 1;
      current.sessions.push({
        sessionId: session.sessionId,
        device: session.device,
        os: session.os,
        browser: session.browser,
        ipAddress: session.ipAddress,
        createdAt: session.createdAt,
        lastActivity: session.lastActivity,
      });

      if (
        session.lastActivity &&
        (!current.lastActivity || new Date(session.lastActivity) > new Date(current.lastActivity))
      ) {
        current.lastActivity = session.lastActivity;
      }

      if (
        session.createdAt &&
        (!current.createdAt || new Date(session.createdAt) < new Date(current.createdAt))
      ) {
        current.createdAt = session.createdAt;
      }
    });

    return Array.from(grouped.values()).sort((a, b) => {
      const aTime = new Date(a.lastActivity || a.createdAt || 0).getTime();
      const bTime = new Date(b.lastActivity || b.createdAt || 0).getTime();
      return bTime - aTime;
    });
  }

  // Verify refresh token
  static async verifyRefreshToken(refreshToken, sessionId) {
    try {
      const decoded = jwt.verify(refreshToken, process.env.JWT_REFRESH_SECRET);
      
      if (decoded.sessionId !== sessionId) {
        return null;
      }

      const session = await Session.findOne({ 
        sessionId, 
        valid: true 
      });

      if (!session) return null;

      // Verify token hash matches
      const tokenHash = this.hashToken(refreshToken);
      if (session.refreshToken !== tokenHash) {
        return null;
      }

      return session;
    } catch (err) {
      return null;
    }
  }
}

export default SessionService;

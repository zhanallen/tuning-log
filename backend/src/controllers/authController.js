import { OAuth2Client } from 'google-auth-library';
import jwt from 'jsonwebtoken';
import { PrismaClient } from '@prisma/client';
import crypto from 'crypto';

const prisma = new PrismaClient();
const googleClient = new OAuth2Client(process.env.GOOGLE_CLIENT_ID);
const JWT_SECRET = process.env.JWT_SECRET || 'fallback-secret-key-1234';

// Emails that should be granted the admin role on login (comma-separated env).
// The role column in the DB stays the authoritative source; this just assigns it.
const ADMIN_EMAILS = (process.env.ADMIN_EMAILS || 'developer@tuninglog.local,allen940403allen@gmail.com')
  .split(',')
  .map((e) => e.trim().toLowerCase())
  .filter(Boolean);

function resolveRole(email) {
  return ADMIN_EMAILS.includes((email || '').toLowerCase()) ? 'admin' : 'user';
}

// JWT authentication middleware
export function authenticateToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = (authHeader && authHeader.split(' ')[1]) || req.cookies?.token;

  if (!token) {
    return res.status(401).json({ status: 'error', message: '未授權存取，請重新登入' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ status: 'error', message: '會話已過期，請重新登入' });
    }
    req.user = decoded; // { userId, email, role }
    next();
  });
}

// Admin-only guard. Chain AFTER authenticateToken.
export function requireAdmin(req, res, next) {
  if (req.user?.role !== 'admin') {
    return res.status(403).json({ status: 'error', message: '此操作需要管理員權限' });
  }
  next();
}

// Google OAuth login controller
export async function googleLogin(req, res) {
  const { token } = req.body;
  if (!token) {
    return res.status(400).json({ status: 'error', message: '缺少 Google Credential Token' });
  }

  try {
    // Verify Google ID Token
    const ticket = await googleClient.verifyIdToken({
      idToken: token,
      audience: process.env.GOOGLE_CLIENT_ID,
    });
    
    const payload = ticket.getPayload();
    const { sub: googleId, email, name } = payload;

    if (!email) {
      return res.status(400).json({ status: 'error', message: 'Google 帳號未提供 Email 資訊' });
    }

    // Find or create user, assigning role from the admin allow-list
    const role = resolveRole(email);
    let user = await prisma.user.upsert({
      where: { email },
      update: { name, role },
      create: {
        googleId,
        email,
        name: name || 'Google User',
        role,
      },
    });

    // Sign JWT
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure HTTP-only cookie
    res.cookie('token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      status: 'success',
      data: {
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('Google OAuth verification failed:', err);
    return res.status(401).json({
      status: 'error',
      message: 'Google 身分驗證失敗，請檢查 Client ID 設定',
    });
  }
}

// Guest Login controller
export async function guestLogin(req, res) {
  const { name } = req.body;
  const guestName = name || 'Anonymous Racer';
  
  // Generate random UUID for unique identification
  const uuid = crypto.randomUUID();
  const guestEmail = `guest_${uuid}@tuninglog.local`;
  const guestGoogleId = `guest_${uuid}`;

  try {
    // Guest role is always "user"
    const role = 'user';
    let user = await prisma.user.create({
      data: {
        googleId: guestGoogleId,
        email: guestEmail,
        name: guestName,
        role: role,
      },
    });

    // Sign JWT
    const sessionToken = jwt.sign(
      { userId: user.id, email: user.email, role: user.role },
      JWT_SECRET,
      { expiresIn: '7d' }
    );

    // Set secure HTTP-only cookie
    res.cookie('token', sessionToken, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
    });

    return res.status(200).json({
      status: 'success',
      data: {
        token: sessionToken,
        user: {
          id: user.id,
          email: user.email,
          displayName: user.name,
          role: user.role,
        },
      },
    });
  } catch (err) {
    console.error('Guest login failed:', err);
    return res.status(500).json({
      status: 'error',
      message: '訪客登入系統異常，請聯絡系統管理員',
    });
  }
}

// Guest Cleanup controller
export async function guestCleanup(req, res) {
  const user = req.user; // populated by authenticateToken middleware
  
  if (!user || !user.email || !user.email.startsWith('guest_')) {
    return res.status(400).json({ status: 'error', message: '無效的訪客清理請求' });
  }

  try {
    console.log(`[Guest Cleanup] Active request: Purging guest user ${user.email} (${user.userId})...`);
    // Delete guest user from the database. Cascade delete will clean up vehicles/logs/values.
    await prisma.user.delete({
      where: { id: user.userId }
    });

    // Clear session token cookie
    res.clearCookie('token');

    return res.status(200).json({
      status: 'success',
      message: '訪客資料已成功清理',
    });
  } catch (err) {
    console.error('Guest active cleanup failed:', err);
    return res.status(500).json({
      status: 'error',
      message: '清理訪客資料時發生錯誤',
    });
  }
}

// Automatically clean up expired guest users (older than 2 hours) every 15 minutes
setInterval(async () => {
  try {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000);
    const expiredGuests = await prisma.user.findMany({
      where: {
        email: {
          startsWith: 'guest_'
        },
        createdAt: {
          lt: twoHoursAgo
        }
      }
    });

    if (expiredGuests.length > 0) {
      console.log(`[Scheduled Guest Cleanup] Found ${expiredGuests.length} expired guest sessions. Purging...`);
      for (const guest of expiredGuests) {
        await prisma.user.delete({
          where: { id: guest.id }
        });
      }
      console.log(`[Scheduled Guest Cleanup] Purge complete.`);
    }
  } catch (err) {
    console.error('Error during scheduled guest cleanup:', err);
  }
}, 15 * 60 * 1000); // Every 15 minutes


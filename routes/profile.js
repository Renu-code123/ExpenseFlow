const express = require('express');
const router = express.Router();
const multer = require('multer');
const path = require('path');
const fs = require('fs');
const { requireAuth, getUserId } = require('../middleware/clerkAuth');
const User = require('../models/User');
const { clerkClient } = require('@clerk/clerk-sdk-node');

// Configure multer for avatar uploads
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    const uploadDir = path.join(__dirname, '..', 'uploads', 'avatars');
    if (!fs.existsSync(uploadDir)) {
      fs.mkdirSync(uploadDir, { recursive: true });
    }
    cb(null, uploadDir);
  },
  filename: (req, file, cb) => {
    const uniqueSuffix = Date.now() + '-' + Math.round(Math.random() * 1e9);
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${uniqueSuffix}${ext}`);
  }
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp/;
    const extOk = allowed.test(path.extname(file.originalname).toLowerCase());
    const mimeOk = allowed.test(file.mimetype);
    if (extOk && mimeOk) {
      cb(null, true);
    } else {
      cb(new Error('Only image files (jpeg, jpg, png, gif, webp) are allowed'));
    }
  }
});

/**
 * GET /api/profile
 * Get the current user's profile (from Clerk + DB)
 */
router.get('/', requireAuth, async (req, res) => {
  try {
    const clerkUserId = getUserId(req);
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    // Get DB user data (for extra fields like phone, bio, preferences)
    let dbUser = await User.findOne({ clerkId: clerkUserId });

    // Try to get Clerk user data, but don't fail if it errors
    let clerkUser = null;
    try {
      clerkUser = await clerkClient.users.getUser(clerkUserId);
    } catch (clerkErr) {
      console.warn('Could not fetch Clerk user data:', clerkErr.message);
    }

    // Build profile response combining Clerk + DB data
    const profile = {
      clerkId: clerkUserId,
      firstName: clerkUser?.firstName || dbUser?.firstName || '',
      lastName: clerkUser?.lastName || dbUser?.lastName || '',
      email: clerkUser?.emailAddresses?.[0]?.emailAddress || dbUser?.email || '',
      imageUrl: clerkUser?.imageUrl || dbUser?.profileImage || '',
      phone: dbUser?.phone || '',
      bio: dbUser?.bio || '',
      preferredCurrency: dbUser?.preferredCurrency || 'INR',
      locale: dbUser?.locale || 'en-US',
      createdAt: clerkUser?.createdAt || dbUser?.createdAt,
      memberSince: dbUser?.createdAt || clerkUser?.createdAt
    };

    res.json({ success: true, profile });
  } catch (error) {
    console.error('Get profile error:', error);
    res.status(500).json({ error: 'Failed to fetch profile' });
  }
});

/**
 * PUT /api/profile
 * Update user profile (syncs to both Clerk and DB)
 */
router.put('/', requireAuth, async (req, res) => {
  try {
    const clerkUserId = getUserId(req);
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    const { firstName, lastName, phone, bio } = req.body;

    // Update Clerk user (first name, last name) — non-blocking, don't fail on error
    const clerkUpdateData = {};
    if (firstName !== undefined) clerkUpdateData.firstName = firstName;
    if (lastName !== undefined) clerkUpdateData.lastName = lastName;

    if (Object.keys(clerkUpdateData).length > 0) {
      try {
        await clerkClient.users.updateUser(clerkUserId, clerkUpdateData);
      } catch (clerkErr) {
        console.warn('Clerk user update failed (continuing with DB update):', clerkErr.message);
      }
    }

    // Update DB user (phone, bio, and sync Clerk data)
    let dbUser = await User.findOne({ clerkId: clerkUserId });
    if (dbUser) {
      if (firstName !== undefined) dbUser.firstName = firstName;
      if (lastName !== undefined) dbUser.lastName = lastName;
      if (phone !== undefined) dbUser.phone = phone;
      if (bio !== undefined) dbUser.bio = bio;
      dbUser.name = `${firstName || dbUser.firstName || ''} ${lastName || dbUser.lastName || ''}`.trim();
      await dbUser.save();
    }

    // Build response from DB data + try Clerk
    let clerkUser = null;
    try {
      clerkUser = await clerkClient.users.getUser(clerkUserId);
    } catch (clerkErr) {
      console.warn('Could not fetch updated Clerk user:', clerkErr.message);
    }

    const profile = {
      clerkId: clerkUserId,
      firstName: clerkUser?.firstName || dbUser?.firstName || firstName || '',
      lastName: clerkUser?.lastName || dbUser?.lastName || lastName || '',
      email: clerkUser?.emailAddresses?.[0]?.emailAddress || dbUser?.email || '',
      imageUrl: clerkUser?.imageUrl || dbUser?.profileImage || '',
      phone: dbUser?.phone || phone || '',
      bio: dbUser?.bio || bio || '',
      preferredCurrency: dbUser?.preferredCurrency || 'INR',
      locale: dbUser?.locale || 'en-US'
    };

    res.json({ success: true, message: 'Profile updated successfully', profile });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({ error: 'Failed to update profile' });
  }
});

/**
 * POST /api/profile/avatar
 * Upload a new profile avatar (updates Clerk profile image)
 */
router.post('/avatar', requireAuth, upload.single('avatar'), async (req, res) => {
  try {
    const clerkUserId = getUserId(req);
    if (!clerkUserId) {
      return res.status(401).json({ error: 'Not authenticated' });
    }

    if (!req.file) {
      return res.status(400).json({ error: 'No image file provided' });
    }

    const filePath = req.file.path;

    // Upload to Clerk as profile image
    try {
      await clerkClient.users.updateUserProfileImage(clerkUserId, {
        file: fs.createReadStream(filePath)
      });
    } catch (clerkErr) {
      console.error('Clerk avatar upload failed:', clerkErr);
      // Fallback: save locally and store URL in DB
    }

    // Also save the local path in DB as fallback
    const avatarUrl = `/uploads/avatars/${req.file.filename}`;
    let dbUser = await User.findOne({ clerkId: clerkUserId });
    if (dbUser) {
      dbUser.profileImage = avatarUrl;
      await dbUser.save();
    }

    // Get updated Clerk user
    const updatedClerkUser = await clerkClient.users.getUser(clerkUserId);

    res.json({
      success: true,
      message: 'Avatar updated successfully',
      imageUrl: updatedClerkUser.imageUrl || avatarUrl
    });

    // Cleanup old local file after successful upload (non-blocking)
    // Keep the latest one as fallback
  } catch (error) {
    console.error('Avatar upload error:', error);
    res.status(500).json({ error: 'Failed to upload avatar' });
  }
});

module.exports = router;

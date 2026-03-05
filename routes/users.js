const express = require("express");
const router = express.Router();
const User = require("../models/User");
const protect = require("../middleware/authMiddleware");

const ResponseFactory = require("../utils/ResponseFactory");
const AppError = require("../utils/AppError");

// Get user profile
router.get("/profile", protect, async (req, res, next) => {
    try {
        const user = await User.findById(req.user.id).select("-password");
        if (!user) {
            return next(new AppError("User not found", 404));
        }

        return ResponseFactory.success(res, {
            name: user.name,
            email: user.email,
            createdAt: user.createdAt
        });
    } catch (err) {
        next(err);
    }
});

module.exports = router;

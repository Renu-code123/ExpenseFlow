const express = require('express');
const auth = require('../middleware/auth');
const DocumentFolder = require('../models/DocumentFolder');
const Receipt = require('../models/Receipt');
const router = express.Router();

/**
 * @route   GET /api/folders
 * @desc    Get all folders for a user
 * @access  Private
 */
router.get('/', auth, async (req, res) => {
    try {
        const folders = await DocumentFolder.find({ user: req.user._id })
            .sort({ createdAt: -1 });
        res.json(folders);
    } catch (error) {
        console.error('Error fetching folders:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route   POST /api/folders
 * @desc    Create a new folder
 * @access  Private
 */
router.post('/', auth, async (req, res) => {
    try {
        const { name, color, icon } = req.body;

        if (!name) {
            return res.status(400).json({ error: 'Folder name is required' });
        }

        const startOfDay = new Date();
        startOfDay.setHours(0, 0, 0, 0);

        const folder = new DocumentFolder({
            user: req.user._id,
            name,
            color: color || '#3b82f6',
            icon: icon || 'folder'
        });

        await folder.save();
        res.status(201).json(folder);
    } catch (error) {
        if (error.code === 11000) {
            return res.status(400).json({ error: 'Folder name already exists' });
        }
        console.error('Error creating folder:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route   PUT /api/folders/:id
 * @desc    Update a folder
 * @access  Private
 */
router.put('/:id', auth, async (req, res) => {
    try {
        const { name, color, icon } = req.body;

        let folder = await DocumentFolder.findOne({ _id: req.params.id, user: req.user._id });
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        if (name) folder.name = name;
        if (color) folder.color = color;
        if (icon) folder.icon = icon;

        await folder.save();
        res.json(folder);
    } catch (error) {
        console.error('Error updating folder:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

/**
 * @route   DELETE /api/folders/:id
 * @desc    Delete a folder and move receipts to root
 * @access  Private
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const folder = await DocumentFolder.findOne({ _id: req.params.id, user: req.user._id });
        if (!folder) {
            return res.status(404).json({ error: 'Folder not found' });
        }

        // Move receipts to root (folder: null)
        await Receipt.updateMany(
            { folder: req.params.id, user: req.user._id },
            { $set: { folder: null } }
        );

        await folder.deleteOne();
        res.json({ message: 'Folder deleted and receipts moved to root' });
    } catch (error) {
        console.error('Error deleting folder:', error);
        res.status(500).json({ error: 'Server error' });
    }
});

module.exports = router;

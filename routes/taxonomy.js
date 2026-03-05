const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const taxonomyResolver = require('../services/taxonomyResolver');
const Taxonomy = require('../models/Taxonomy');
const treeProcessor = require('../utils/treeProcessor');

/**
 * @route   GET /api/taxonomy/tree
 * @desc    Get the full hierarchical tree for the user
 */
router.get('/tree', auth, async (req, res) => {
    try {
        const tree = await taxonomyResolver.getTree(req.user._id);
        res.json({ success: true, data: tree });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   GET /api/taxonomy/breadcrumbs/:id
 * @desc    Get breadcrumb path for a specific category
 */
router.get('/breadcrumbs/:id', auth, async (req, res) => {
    try {
        const flatList = await taxonomyResolver.getUserTaxonomy(req.user._id);
        const path = treeProcessor.getBreadcrumbs(flatList, req.params.id);
        res.json({ success: true, data: path });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

/**
 * @route   POST /api/taxonomy
 * @desc    Create a new custom category
 */
router.post('/', auth, async (req, res) => {
    try {
        const category = await taxonomyResolver.createCategory(req.body, req.user._id);
        res.status(201).json({ success: true, data: category });
    } catch (error) {
        res.status(400).json({ success: false, error: error.message });
    }
});

/**
 * @route   DELETE /api/taxonomy/:id
 * @desc    Delete a custom category (fails if it has children)
 */
router.delete('/:id', auth, async (req, res) => {
    try {
        const hasChildren = await Taxonomy.findOne({ parent: req.params.id });
        if (hasChildren) {
            return res.status(400).json({ success: false, error: 'Cannot delete category with subcategories.' });
        }

        const result = await Taxonomy.findOneAndDelete({ _id: req.params.id, user: req.user._id });
        if (!result) return res.status(404).json({ success: false, error: 'Category not found or system-protected.' });

        res.json({ success: true, message: 'Category deleted.' });
    } catch (error) {
        res.status(500).json({ success: false, error: error.message });
    }
});

module.exports = router;

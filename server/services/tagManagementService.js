const Tag = require('../models/Tag');
const Expense = require('../models/Expense');
const mongoose = require('mongoose');

class TagManagementService {
    /**
     * Create or update a tag.
     */
    static async upsertTag(userId, tagData) {
        const { name, color, icon, description, categoryMappings } = tagData;

        let tag = await Tag.findOne({ user: userId, name: name.toLowerCase() });

        if (tag) {
            tag.color = color || tag.color;
            tag.icon = icon || tag.icon;
            tag.description = description || tag.description;
            tag.categoryMappings = categoryMappings || tag.categoryMappings;
            await tag.save();
        } else {
            tag = new Tag({
                user: userId,
                name: name.toLowerCase(),
                color,
                icon,
                description,
                categoryMappings
            });
            await tag.save();
        }

        return tag;
    }

    /**
     * Bulk apply a tag to multiple transactions.
     */
    static async bulkApplyTag(userId, transactionIds, tagId) {
        const tag = await Tag.findOne({ _id: tagId, user: userId });
        if (!tag) throw new Error('Tag not found');

        const result = await Expense.updateMany(
            { _id: { $in: transactionIds }, user: userId },
            { $addToSet: { tags: tagId } }
        );

        // Update tag usage count
        tag.usageCount += result.modifiedCount;
        tag.lastUsed = new Date();
        await tag.save();

        return result;
    }

    /**
     * Delete a tag and remove it from all transactions.
     */
    static async deleteTag(userId, tagId) {
        const tag = await Tag.findOneAndDelete({ _id: tagId, user: userId });
        if (!tag) throw new Error('Tag not found');

        // Remove reference from all expenses
        await Expense.updateMany(
            { user: userId, tags: tagId },
            { $pull: { tags: tagId } }
        );

        return tag;
    }

    /**
     * Merge two tags into one.
     */
    static async mergeTags(userId, sourceTagId, targetTagId) {
        const sourceTag = await Tag.findOne({ _id: sourceTagId, user: userId });
        const targetTag = await Tag.findOne({ _id: targetTagId, user: userId });

        if (!sourceTag || !targetTag) throw new Error('One or both tags not found');

        // Find all expenses with source tag
        const expenses = await Expense.find({ user: userId, tags: sourceTagId });

        for (const expense of expenses) {
            // Remove source, add target
            expense.tags = expense.tags.filter(t => t.toString() !== sourceTagId.toString());
            if (!expense.tags.includes(targetTagId)) {
                expense.tags.push(targetTagId);
            }
            await expense.save();
        }

        // Update target usage
        targetTag.usageCount += sourceTag.usageCount;
        targetTag.lastUsed = new Date();
        await targetTag.save();

        // Delete source
        await Tag.findByIdAndDelete(sourceTagId);

        return targetTag;
    }

    /**
     * Get tag analytics for a user.
     */
    static async getTagAnalytics(userId) {
        const tags = await Tag.find({ user: userId }).sort({ usageCount: -1 });

        const distribution = tags.map(t => ({
            name: t.name,
            usage: t.usageCount,
            color: t.color
        }));

        return {
            totalTags: tags.length,
            distribution,
            mostUsed: tags.slice(0, 5)
        };
    }
}

module.exports = TagManagementService;

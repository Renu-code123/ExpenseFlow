/**
 * Tree Processor Utility
 * Issue #706: Handles recursive logic for hierarchical structures.
 */

class TreeProcessor {
    /**
     * Converts a flat array of taxonomy objects into a nested tree.
     */
    buildTree(items, parentId = null) {
        const tree = [];
        const children = items.filter(item =>
            String(item.parent) === String(parentId) ||
            (parentId === null && !item.parent)
        );

        for (const child of children) {
            const node = child.toObject ? child.toObject() : { ...child };
            const subTree = this.buildTree(items, node._id);
            if (subTree.length > 0) {
                node.children = subTree;
            }
            tree.push(node);
        }

        return tree;
    }

    /**
     * Flatten a tree back to a list of IDs (e.g., for querying all subcategories)
     */
    getDescendantIds(items, rootId) {
        let ids = [];
        const children = items.filter(item => String(item.parent) === String(rootId));

        for (const child of children) {
            ids.push(child._id);
            ids = ids.concat(this.getDescendantIds(items, child._id));
        }

        return ids;
    }

    /**
     * Check if a node is an ancestor of another
     */
    isAncestor(items, potentialAncestorId, targetId) {
        const target = items.find(i => String(i._id) === String(targetId));
        if (!target || !target.parent) return false;

        if (String(target.parent) === String(potentialAncestorId)) return true;

        return this.isAncestor(items, potentialAncestorId, target.parent);
    }

    /**
     * Generate a breadcrumb path for a node
     */
    getBreadcrumbs(items, nodeId) {
        const path = [];
        let current = items.find(i => String(i._id) === String(nodeId));

        while (current) {
            path.unshift({ name: current.name, slug: current.slug, id: current._id });
            current = items.find(i => String(i._id) === String(current.parent));
        }

        return path;
    }
}

module.exports = new TreeProcessor();

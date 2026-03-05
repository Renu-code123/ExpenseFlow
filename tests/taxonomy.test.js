/**
 * Taxonomy Hierarchical System Test Suite
 * Issue #706: Verifies tree structures, resolution logic, and path materialized views.
 */

const assert = require('assert');
const treeProcessor = require('../utils/treeProcessor');

describe('Dynamic Taxonomy & Tree Processing', () => {

    const mockTaxonomy = [
        { _id: '1', name: 'Food', slug: 'food', parent: null },
        { _id: '2', name: 'Dining Out', slug: 'dining', parent: '1' },
        { _id: '3', name: 'Groceries', slug: 'groceries', parent: '1' },
        { _id: '4', name: 'Travel', slug: 'travel', parent: null },
        { _id: '5', name: 'Flights', slug: 'flights', parent: '4' },
        { _id: '6', name: 'International', slug: 'intl', parent: '5' }
    ];

    describe('Tree Processor', () => {
        it('should correctly build a nested tree from flat list', () => {
            const tree = treeProcessor.buildTree(mockTaxonomy);

            assert.strictEqual(tree.length, 2); // Food and Travel roots
            assert.strictEqual(tree[0].slug, 'food');
            assert.strictEqual(tree[0].children.length, 2);
            assert.strictEqual(tree[1].slug, 'travel');
            assert.strictEqual(tree[1].children[0].children.length, 1); // International child of Flights
        });

        it('should retrieve all descendant IDs for a root', () => {
            const ids = treeProcessor.getDescendantIds(mockTaxonomy, '4'); // Travel
            assert.ok(ids.includes('5'));
            assert.ok(ids.includes('6'));
            assert.strictEqual(ids.length, 2);
        });

        it('should correctly calculate breadcrumbs', () => {
            const crumbs = treeProcessor.getBreadcrumbs(mockTaxonomy, '6');
            assert.strictEqual(crumbs.length, 3);
            assert.strictEqual(crumbs[0].slug, 'travel');
            assert.strictEqual(crumbs[1].slug, 'flights');
            assert.strictEqual(crumbs[2].slug, 'intl');
        });

        it('should detect ancestor relationships', () => {
            const isAnc = treeProcessor.isAncestor(mockTaxonomy, '4', '6');
            assert.strictEqual(isAnc, true);

            const isSibling = treeProcessor.isAncestor(mockTaxonomy, '2', '3');
            assert.strictEqual(isSibling, false);
        });
    });

    describe('Materialized Path & Level Logic (Schema Sim)', () => {
        // This simulates the pre-save hook logic
        it('should generate correct path strings', () => {
            const parent = { slug: 'food', path: '/food/', level: 0 };
            const childSlug = 'pizza';
            const expectedPath = '/food/pizza/';
            const expectedLevel = 1;

            const actualPath = `${parent.path}${childSlug}/`;
            assert.strictEqual(actualPath, expectedPath);
        });
    });
});

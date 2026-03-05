/**
 * BaseRepository - Abstract base class for all repositories
 * Provides common CRUD operations and query utilities
 */
class BaseRepository {
    constructor(model) {
        this.model = model;
    }

    /**
     * Find all documents (with vault decryption)
     */
    async findAll(filters = {}, options = {}) {
        const {
            sort = { createdAt: -1 },
            limit = 50,
            skip = 0,
            select = null,
            populate = null
        } = options;

        let query = this.model.find(filters);

        if (select) query = query.select(select);
        if (populate) query = query.populate(populate);
        if (sort) query = query.sort(sort);
        if (skip) query = query.skip(skip);
        if (limit) query = query.limit(limit);

        const documents = await query.exec();
        return await Promise.all(documents.map(doc => this._decryptSensitiveFields(doc)));
    }

    /**
     * Find one document (with vault decryption)
     */
    async findOne(filters, options = {}) {
        const { select = null, populate = null } = options;

        let query = this.model.findOne(filters);

        if (select) query = query.select(select);
        if (populate) query = query.populate(populate);

        const document = await query.exec();
        return await this._decryptSensitiveFields(document);
    }

    /**
     * Find by ID (with vault decryption)
     */
    async findById(id, options = {}) {
        const { select = null, populate = null } = options;

        let query = this.model.findById(id);

        if (select) query = query.select(select);
        if (populate) query = query.populate(populate);

        const document = await query.exec();
        return await this._decryptSensitiveFields(document);
    }

    /**
     * Create a new document (with vault encryption and journaling support)
     */
    async create(data, options = {}) {
        if (options.deferred) {
            return await this._journalMutation('CREATE', data, options);
        }
        let processedData = await this._encryptSensitiveFields(data);
        const document = new this.model(processedData);
        let saved = await document.save();
        await this._invalidateCache(saved);
        return await this._decryptSensitiveFields(saved);

    }

    /**
     * Helper: Encrypt @sensitive fields before DB write
     */
    async _encryptSensitiveFields(data) {
        if (!data || typeof data !== 'object') return data;

        let processed = { ...data };
        const cryptVault = require('../services/cryptVault');

        for (const [key, path] of Object.entries(this.model.schema.paths)) {
            if (path.options?.sensitive && data[key]) {
                const tenantId = data.workspace || data.tenantId || 'global';
                processed[key] = await cryptVault.encrypt(data[key], tenantId);
            }
        }
        return processed;
    }

    /**
     * Helper: Decrypt @sensitive fields post DB read
     */
    async _decryptSensitiveFields(doc) {
        if (!doc) return doc;

        let isMongooseDoc = typeof doc.toObject === 'function';
        let processed = isMongooseDoc ? doc.toObject() : { ...doc };
        const cryptVault = require('../services/cryptVault');

        for (const [key, path] of Object.entries(this.model.schema.paths)) {
            if (path.options?.sensitive && processed[key] && processed[key].startsWith('vault:')) {
                const tenantId = processed.workspace || processed.tenantId || 'global';
                processed[key] = await cryptVault.decrypt(processed[key], tenantId);
            }
        }

        if (isMongooseDoc) {
            // Overwrite original values to return a workable Mongoose doc if needed,
            // though normally returning the lean object is preferred for DTOs.
            for (const key of Object.keys(processed)) {
                if (this.model.schema.paths[key]?.options?.sensitive) {
                    doc[key] = processed[key];
                }
            }
            return doc;
        }

        return processed;
    }

    /**
     * Create multiple documents
     */
    async createMany(dataArray) {
        return await this.model.insertMany(dataArray);
    }

    /**
     * Update a document by ID (with journaling support)
     */
    async updateById(id, data, options = { new: true, runValidators: true }) {
        if (options.deferred) {
            return await this._journalMutation('UPDATE', { ...data, _id: id }, options);
        }
        const result = await this.model.findByIdAndUpdate(id, data, options);
        await this._invalidateCache(result);
        return result;
    }

    /**
     * Update one document by filters (with journaling support)
     */
    async updateOne(filters, data, options = { new: true, runValidators: true }) {
        if (options.deferred) {
            const doc = await this.model.findOne(filters);
            if (!doc) throw new Error('Document not found for deferred update');
            return await this._journalMutation('UPDATE', { ...data, _id: doc._id }, options);
        }
        const result = await this.model.findOneAndUpdate(filters, data, options);
        await this._invalidateCache(result);
        return result;
    }

    /**
     * Update multiple documents
     */
    async updateMany(filters, data) {
        return await this.model.updateMany(filters, data);
    }

    /**
     * Delete a document by ID (with journaling support)
     */
    async deleteById(id, options = {}) {
        if (options.deferred) {
            return await this._journalMutation('DELETE', { _id: id }, options);
        }
        const result = await this.model.findByIdAndDelete(id);
        await this._invalidateCache(result);
        return result;
    }

    /**
     * Delete one document by filters (with journaling support)
     */
    async deleteOne(filters, options = {}) {
        if (options.deferred) {
            const doc = await this.model.findOne(filters);
            if (!doc) throw new Error('Document not found for deferred delete');
            return await this._journalMutation('DELETE', { _id: doc._id }, options);
        }
        const result = await this.model.findOneAndDelete(filters);
        await this._invalidateCache(result);
        return result;
    }

    /**
     * Delete multiple documents
     */
    async deleteMany(filters) {
        return await this.model.deleteMany(filters);
    }

    /**
     * Count documents
     */
    async count(filters = {}) {
        return await this.model.countDocuments(filters);
    }

    /**
     * Check if document exists
     */
    async exists(filters) {
        const count = await this.model.countDocuments(filters).limit(1);
        return count > 0;
    }

    /**
     * Aggregate query
     */
    async aggregate(pipeline) {
        return await this.model.aggregate(pipeline);
    }

    /**
     * Find with pagination (with vault decryption)
     */
    async findWithPagination(filters = {}, options = {}) {
        const {
            page = 1,
            limit = 50,
            sort = { createdAt: -1 },
            select = null,
            populate = null
        } = options;

        const skip = (page - 1) * limit;

        const [documents, total] = await Promise.all([
            this.findAll(filters, { sort, limit, skip, select, populate }),
            this.count(filters)
        ]);

        return {
            documents, // Already decrypted by findAll
            pagination: {
                page: parseInt(page),
                limit: parseInt(limit),
                total,
                pages: Math.ceil(total / limit),
                hasNext: page * limit < total,
                hasPrev: page > 1
            }
        };
    }

    /**
     * Bulk write operations
     */
    async bulkWrite(operations) {
        return await this.model.bulkWrite(operations);
    }

    /**
     * Find distinct values
     */
    async distinct(field, filters = {}) {
        return await this.model.distinct(field, filters);
    }

    /**
     * Execute raw query
     */
    async executeQuery(queryFn) {
        return await queryFn(this.model);
    }

    /**
     * Helper: Record mutation in journal instead of direct DB write
     */
    async _journalMutation(operation, data, options = {}) {
        const WriteJournal = require('../models/WriteJournal');
        const mongoose = require('mongoose');

        const journal = await WriteJournal.create({
            entityId: data._id || options.entityId || new mongoose.Types.ObjectId(),
            entityType: this.model.modelName.toUpperCase(),
            operation,
            payload: data,
            vectorClock: options.vectorClock || {},
            workspaceId: options.workspaceId || data.workspace,
            userId: options.userId,
            status: 'PENDING'
        });
        return { journalId: journal._id, status: 'JOURNALED', deferred: true };
    }

    /**
     * Helper: Clear Fiscal Graph Cache Post-Save
     */
    async _invalidateCache(doc) {
        if (!doc) return;
        const workspaceId = doc.workspace || doc.workspaceId || doc.tenantId;
        if (workspaceId) {
            try {
                const invalidationEngine = require('../services/invalidationEngine');
                await invalidationEngine.invalidateGraph(workspaceId);
            } catch (err) {
                console.error('[BaseRepository] Fast-fail on Cache Invalidation:', err.message);
            }
        }
    }
}

module.exports = BaseRepository;

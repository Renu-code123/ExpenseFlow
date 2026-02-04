/**
 * BaseRepository - Abstract base class for all repositories
 * Provides common CRUD operations and query utilities
 */
class BaseRepository {
    constructor(model) {
        this.model = model;
    }

    /**
     * Find all documents with optional filters, sorting, and pagination
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

        return await query.exec();
    }

    /**
     * Find one document by filters
     */
    async findOne(filters, options = {}) {
        const { select = null, populate = null } = options;

        let query = this.model.findOne(filters);

        if (select) query = query.select(select);
        if (populate) query = query.populate(populate);

        return await query.exec();
    }

    /**
     * Find by ID
     */
    async findById(id, options = {}) {
        const { select = null, populate = null } = options;

        let query = this.model.findById(id);

        if (select) query = query.select(select);
        if (populate) query = query.populate(populate);

        return await query.exec();
    }

    /**
     * Create a new document
     */
    async create(data) {
        const document = new this.model(data);
        return await document.save();
    }

    /**
     * Create multiple documents
     */
    async createMany(dataArray) {
        return await this.model.insertMany(dataArray);
    }

    /**
     * Update a document by ID
     */
    async updateById(id, data, options = { new: true, runValidators: true }) {
        return await this.model.findByIdAndUpdate(id, data, options);
    }

    /**
     * Update one document by filters
     */
    async updateOne(filters, data, options = { new: true, runValidators: true }) {
        return await this.model.findOneAndUpdate(filters, data, options);
    }

    /**
     * Update multiple documents
     */
    async updateMany(filters, data) {
        return await this.model.updateMany(filters, data);
    }

    /**
     * Delete a document by ID
     */
    async deleteById(id) {
        return await this.model.findByIdAndDelete(id);
    }

    /**
     * Delete one document by filters
     */
    async deleteOne(filters) {
        return await this.model.findOneAndDelete(filters);
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
     * Find with pagination
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
            documents,
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
}

module.exports = BaseRepository;

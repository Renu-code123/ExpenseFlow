const mongoose = require('mongoose');

const vendorSchema = new mongoose.Schema({
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    name: { type: String, required: true },
    category: String,
    contactPerson: String,
    email: { type: String, required: true },
    phone: String,
    address: {
        street: String,
        city: String,
        country: String,
        zip: String
    },
    taxId: String,
    paymentTerms: { type: String, default: 'Net 30' },
    status: { type: String, enum: ['active', 'inactive', 'on_hold'], default: 'active' },
    rating: { type: Number, min: 1, max: 5, default: 5 },
    notes: String
}, { timestamps: true });

module.exports = mongoose.model('Vendor', vendorSchema);

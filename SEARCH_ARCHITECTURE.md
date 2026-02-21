# Semantic Indexing & Multi-Faceted Search Infrastructure

## 🚀 Overview
Issue #720 transforms the application's search capabilities from naive database queries to a robust, intelligence-driven search engine. It introduces a denormalized **Search Index** that enables high-performance filtering across hundreds of thousands of transactions with semantic enrichment.

## 🏗️ Core Components

### 1. The Search Index Model (`models/SearchIndex.js`)
To ensure sub-millisecond search performance, we maintain a specialized "Flat Store." Matches are performed against this collection rather than the main Transaction table to avoid expensive joins and complex schema navigation.
- **Full-Text Index**: Enables keyword search across merchant, description, and notes simultaneously.
- **Discrete Facets**: Denormalized fields for categories, sentiment, and business types.

### 2. Semantic Enrichment (`utils/metadataProcessor.js`)
The search experience is "Semantic" because it doesn't just look for words; it understands context.
- **Tag Extraction**: Automatically categorizes transactions based on content (e.g., "tax" → "fiscal").
- **Business Classifier**: Maps merchants to standard industries (Retail, Transport, etc.).
- **Sentiment Analysis**: Detects the "nature" of a transaction (Positive/Refunding vs. Negative/Fees).

### 3. Synchronization Engine (`services/indexingEngine.js`)
Ensures that any change in a Transaction is reflected in the Search Index.
- **Automatic Sync**: Hooks into transaction modification events.
- **Background Integrity**: A cron job (`jobs/searchIndexer.js`) periodically scans for data drifts and repairs missing index entries.

### 4. Search Middleware & API (`routes/search.js`)
A unified search entry point supporting:
- **Range Queries**: Amount and Date range filtering.
- **Faceted Navigation**: Filter by Category, Merchant, Tags, or Sentiment.
- **Autocomplete Suggestions**: Real-time suggestions for frequent merchants or categories.

## 🔄 The Indexing Pipeline
1. **Transaction Saved**: A new transaction is created.
2. **Metadata Processing**: `MetadataProcessor` extracts tags and business type.
3. **Index Upsert**: `IndexingEngine` writes a denormalized copy to `SearchIndex`.
4. **Cache Invalidation**: Existing user search results are cleared to ensure fresh data.

## ✅ Benefits
- **Performance**: Predictable search speeds regardless of database size.
- **Discoverability**: Users can find transactions by "nature" (e.g., "Show me all Dining expenses that were Negative/Fees").
- **Scalability**: The search load is isolated to a specialized collection, protecting the main relational integrity of the system.

## 🧪 Testing
Run the search engine test suite:
```bash
npx mocha tests/searchEngine.test.js
```

// Type definitions for Data Retention & Deletion

/**
 * Retention policy
 */
interface RetentionPolicy {
    type: string;
    durationDays: number;
    appliesTo: string;
}

/**
 * Record tracked for retention
 */
interface RetentionRecord {
    id: string;
    type: string;
    createdAt: number;
    expiresAt: number;
}

/**
 * Deletion log entry
 */
interface DeletionLogEntry {
    timestamp: string;
    action: string;
    recordId: string;
    type: string;
    expiresAt: number;
}

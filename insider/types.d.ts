// Type definitions for Insider Threat Detection

/**
 * User activity event
 */
interface UserActivity {
    type: string;
    status?: string;
    resource?: { id: string; sensitive: boolean };
    sessionId?: string;
    duration?: number;
    timestamp?: number;
}

/**
 * Alert entry
 */
interface AlertEntry {
    type: string;
    userId: string;
    timestamp: string;
    [key: string]: any;
}

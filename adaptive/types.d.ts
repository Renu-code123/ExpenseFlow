// Type definitions for Adaptive Rate Limiting

/**
 * User statistics tracked by analytics
 */
interface UserStats {
    requests: number;
    failedLogins: number;
    requestsPerMinute: number;
    endpoints: { [endpoint: string]: number };
    lastMinute: number[];
}

/**
 * Endpoint statistics
 */
interface EndpointStats {
    requests: number;
    users: Set<string>;
}

/**
 * Log entry for rate limiting events
 */
interface RateLimitLogEntry {
    timestamp: string;
    event: string;
    details: any;
}

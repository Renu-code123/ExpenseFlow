const mongoose = require('mongoose');
const logger = require('./structuredLogger');

let serverInstance = null;

/**
 * Register HTTP server instance
 */
const registerServer = (server) => {
    serverInstance = server;
};

/**
 * Graceful shutdown logic
 */
const shutdown = async (signal) => {

    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    try {

        // Close HTTP server
        if (serverInstance) {
            logger.info("Closing HTTP server...");
            await new Promise((resolve) => serverInstance.close(resolve));
            logger.info("HTTP server closed.");
        }

        // Close MongoDB connection
        if (mongoose.connection.readyState === 1) {
            logger.info("Closing MongoDB connection...");
            await mongoose.connection.close();
            logger.info("MongoDB connection closed.");
        }

        // Close Redis connections (if available)
        if (global.redisPub) {
            logger.info("Closing Redis publisher...");
            await global.redisPub.quit();
            logger.info("Redis publisher closed.");
        }

        if (global.redisSub) {
            logger.info("Closing Redis subscriber...");
            await global.redisSub.quit();
            logger.info("Redis subscriber closed.");
        }

        logger.info("Graceful shutdown completed.");
        process.exit(0);

    } catch (error) {

        logger.error("Error during shutdown:", error);
        process.exit(1);

    }
};

/**
 * Listen to termination signals
 */
const setupGracefulShutdown = () => {

    process.on('SIGINT', () => shutdown('SIGINT'));
    process.on('SIGTERM', () => shutdown('SIGTERM'));

};

module.exports = {
    registerServer,
    setupGracefulShutdown
};
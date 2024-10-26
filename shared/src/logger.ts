/**
 * This module provides a Winston logger instance that can be used throughout the application.
 */
import winston, { Logger } from "winston";
import "dotenv/config";

let bareLogger: Logger | null = null;

/**
 * Initialize the logger instance.
 */
const initializeLogger = () => {
  const fileLogFormat = winston.format.combine(
    winston.format.timestamp({ format: "DD/MM/YYYY HH:mm:ss" }),
    winston.format.printf(({ timestamp, level, message, label }) => {
      if (typeof message === "object") {
        message = JSON.stringify(message, null, 2);
      }
      return `${timestamp} [${level}] [${label}]: ${message}`;
    })
  );

  const logDir = process.env.LOG_FILE || "../package-rater.log";

  bareLogger = winston.createLogger({
    level: "info",
    format: fileLogFormat,
    transports: [new winston.transports.File({ filename: logDir })]
  });
};

/**
 * Get the logger instance.
 * @param source The source of the logger.
 * @returns The logger instance.
 */
export const getLogger = (source: string) => {
  if (!bareLogger) {
    initializeLogger();
    if (!bareLogger) {
      throw new Error("Unable to initialize logger");
    }
  }
  return bareLogger.child({ label: source });
};

/**
 * Reinitialize the logger instance.
 */
export const reinitializeLogger = () => {
  bareLogger = null;
  initializeLogger();
  if (!bareLogger) {
    throw new Error("Unable to reinitialize logger");
  }
};

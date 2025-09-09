const path = require('path');
const fs = require('fs');

/**
 * Utility functions for safe path handling in the application
 * Prevents writing to system root directories and ensures paths are within project boundaries
 */

// List of dangerous root paths that should never be used
const DANGEROUS_ROOT_PATHS = [
  '/output',
  '/tmp',
  '/var/tmp',
  '/var/output',
  '/root',
  '/home',
  '/usr',
  '/bin',
  '/sbin',
  '/etc',
  '/lib',
  '/opt',
  '/boot',
  '/dev',
  '/proc',
  '/sys'
];

// Determine project root directory
const getProjectRoot = () => {
  // In production Docker environment, we're typically in /app
  if (process.env.NODE_ENV === 'production' && process.cwd() === '/app') {
    return '/app';
  }
  
  // In development, use current working directory
  return process.cwd();
};

/**
 * Ensures a path is safe and within project boundaries
 * @param {string} inputPath - The path to validate
 * @param {string} fallbackPath - Fallback path relative to project root
 * @param {string} type - Type of path ('temp', 'output', etc.) for logging
 * @returns {string} - Safe, resolved path
 */
const ensureSafePath = (inputPath, fallbackPath, type = 'unknown') => {
  const projectRoot = getProjectRoot();
  
  // If no input path provided, use fallback
  if (!inputPath) {
    const safeFallback = path.resolve(projectRoot, fallbackPath);
    console.log(`[PathUtils] No ${type} path provided, using fallback: ${safeFallback}`);
    return safeFallback;
  }
  
  // Check if path is in dangerous root paths list
  if (DANGEROUS_ROOT_PATHS.includes(inputPath) || 
      DANGEROUS_ROOT_PATHS.some(dangerous => inputPath.startsWith(dangerous + '/'))) {
    const safeFallback = path.resolve(projectRoot, fallbackPath);
    console.warn(`[PathUtils] Dangerous root path detected for ${type}: ${inputPath}, using safe fallback: ${safeFallback}`);
    return safeFallback;
  }
  
  // If it's an absolute path but not within our project root or /app, use fallback
  if (path.isAbsolute(inputPath)) {
    if (!inputPath.startsWith(projectRoot)) {
      const safeFallback = path.resolve(projectRoot, fallbackPath);
      console.warn(`[PathUtils] Absolute path outside project root for ${type}: ${inputPath}, using fallback: ${safeFallback}`);
      return safeFallback;
    }
    // Absolute path within project root is okay
    return inputPath;
  }
  
  // Relative path - resolve relative to project root
  const resolvedPath = path.resolve(projectRoot, inputPath);
  
  // Double-check that resolved path is still within project boundaries
  if (!resolvedPath.startsWith(projectRoot)) {
    const safeFallback = path.resolve(projectRoot, fallbackPath);
    console.warn(`[PathUtils] Resolved path outside project root for ${type}: ${resolvedPath}, using fallback: ${safeFallback}`);
    return safeFallback;
  }
  
  return resolvedPath;
};

/**
 * Creates a safe output directory path
 * @param {string} envPath - Path from environment variable
 * @returns {string} - Safe output directory path
 */
const getSafeOutputDir = (envPath = process.env.OUTPUT_DIR) => {
  return ensureSafePath(envPath, 'output', 'output');
};

/**
 * Creates a safe temporary directory path
 * @param {string} envPath - Path from environment variable
 * @param {string} jobId - Optional job ID to append
 * @returns {string} - Safe temporary directory path
 */
const getSafeTempDir = (envPath = process.env.TEMP_DIR, jobId = null) => {
  const baseTempPath = ensureSafePath(envPath, 'tmp', 'temp');
  return jobId ? path.join(baseTempPath, jobId) : baseTempPath;
};

/**
 * Creates a directory if it doesn't exist, with proper error handling
 * @param {string} dirPath - Directory path to create
 * @param {string} type - Type of directory for logging
 * @returns {Promise<boolean>} - Success status
 */
const ensureDirectoryExists = async (dirPath, type = 'directory') => {
  try {
    await fs.promises.mkdir(dirPath, { recursive: true });
    console.log(`[PathUtils] ${type} directory ensured: ${dirPath}`);
    return true;
  } catch (error) {
    console.error(`[PathUtils] Failed to create ${type} directory ${dirPath}:`, error.message);
    return false;
  }
};

/**
 * Validates that a path is safe for file operations
 * @param {string} filePath - File path to validate
 * @returns {boolean} - Whether the path is safe
 */
const isPathSafe = (filePath) => {
  if (!filePath) return false;
  
  const projectRoot = getProjectRoot();
  const resolvedPath = path.resolve(filePath);
  
  // Check if it's in dangerous root paths
  if (DANGEROUS_ROOT_PATHS.some(dangerous => 
    resolvedPath === dangerous || resolvedPath.startsWith(dangerous + '/'))) {
    return false;
  }
  
  // Check if it's within project boundaries
  return resolvedPath.startsWith(projectRoot);
};

/**
 * Gets safe paths for common directories used in the application
 * @returns {object} - Object containing safe paths
 */
const getSafePaths = () => {
  return {
    projectRoot: getProjectRoot(),
    output: getSafeOutputDir(),
    temp: getSafeTempDir(),
    uploads: ensureSafePath(process.env.UPLOADS_DIR, 'uploads', 'uploads'),
    clips: ensureSafePath(process.env.CLIPS_DIR, 'clips', 'clips'),
    downloads: ensureSafePath(process.env.DOWNLOADS_DIR, 'downloads', 'downloads')
  };
};

module.exports = {
  ensureSafePath,
  getSafeOutputDir,
  getSafeTempDir,
  ensureDirectoryExists,
  isPathSafe,
  getSafePaths,
  getProjectRoot,
  DANGEROUS_ROOT_PATHS
};
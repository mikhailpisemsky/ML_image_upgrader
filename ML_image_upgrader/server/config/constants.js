const path = require('path');

module.exports = {
  PORT: process.env.PORT || 3000,

  UPLOAD_DIR: path.join(__dirname, '../../uploads'),
  CLIENT_DIR: path.join(__dirname, '../../client'),
  MODEL_DIR: path.join(__dirname, '../../client/model'),

  MAX_FILE_SIZE: 50 * 1024 * 1024,
  ALLOWED_EXTENSIONS: ['.jpg', '.jpeg', '.png', '.bmp', '.heic'],

  HEIC_QUALITY: 90,

  SSE_INTERVAL: 1000,

  JSON_LIMIT: '50mb',
  URLENCODED_LIMIT: '50mb',

  TASK_STATUS: {
    PENDING: 'pending',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    FAILED: 'failed',
    ABORTED: 'aborted',
  },

  PROGRESS_MIN: 0,
  PROGRESS_MAX: 100,
};
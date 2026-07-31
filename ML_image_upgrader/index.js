const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const path = require('path');
const { router: taskRoutes, taskManager } = require('./server/routes/tasks');
const createEventsRouter = require('./server/routes/events');
const { ensureUploadDir } = require('./server/upload');
const { PORT, UPLOAD_DIR, CLIENT_DIR, JSON_LIMIT, URLENCODED_LIMIT } = require('./server/config/constants');

const app = express();


app.use(cors({ origin: '*', methods: ['GET', 'POST', 'DELETE', 'PUT', 'OPTIONS'] }));
app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  contentSecurityPolicy: {
    directives: {
      imgSrc: ["'self'", "data:", "blob:"],
      scriptSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
        "'unsafe-eval'",
        "'sha256-eJ+jqDH4p3SP/jQiEQjzsUZckMlKS72wijnDH7/imuM='"
      ],
      connectSrc: [
        "'self'",
        "https://cdn.jsdelivr.net",
      ],
    },
  },
}));
app.use(morgan('combined'));
app.use(express.json({ limit: JSON_LIMIT }));
app.use(express.urlencoded({ extended: true, limit: URLENCODED_LIMIT }));

app.use(express.static(CLIENT_DIR));

app.use('/api/tasks', taskRoutes);
app.use('/api/events', createEventsRouter(taskManager));


app.use((req, res) => {
  res.status(404).json({ error: 'Not Found', message: `Route ${req.method} ${req.path} does not exist` });
});

app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  let status = 500;
  let message = 'Internal Server Error';
  let details = err.message || '';

  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      status = 413;
      message = 'File too large. Maximum size is 50 MB.';
    } else {
      status = 400;
      message = err.message;
    }
  } else if (err.status) {
    status = err.status;
    message = err.message;
  } else if (err.message && err.message.includes('HEIC conversion')) {
    status = 500;
    message = 'HEIC conversion failed. Please upload a supported format.';
  }

  console.error(`Error ${status}: ${message}`, details);

  res.status(status).json({ error: message, details: details });
});

(async () => {
  await ensureUploadDir();
  app.listen(PORT, () => {
    console.log(`Server running at http://localhost:${PORT}`);
    console.log(`Upload directory: ${UPLOAD_DIR}`);
    console.log(`Static files served from: ${CLIENT_DIR}`);
  });
})();

module.exports = app;
const multer = require('multer');
const path = require('path');
const fs = require('fs/promises');
const { v4: uuidv4 } = require('uuid');
const sharp = require('sharp');
const {
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
  HEIC_QUALITY,
} = require('./config/constants');

/**
 * Создаёт папку uploads, если её нет.
 */
async function ensureUploadDir() {
  try {
    await fs.mkdir(UPLOAD_DIR, { recursive: true });
  } catch (err) {
  }
}

/**
 * Генерирует уникальное имя файла с сохранением расширения.
 */
function generateUniqueFilename(originalName) {
  const ext = path.extname(originalName).toLowerCase();
  return `${uuidv4()}${ext}`;
}

/**
 * Фильтр файлов: разрешены только определённые расширения.
 */
function fileFilter(req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  if (ALLOWED_EXTENSIONS.includes(ext)) {
    cb(null, true);
  } else {
    cb(new Error(`Unsupported file extension: ${ext}. Allowed: ${ALLOWED_EXTENSIONS.join(', ')}`), false);
  }
}

/**
 * Настройка хранения multer с уникальными именами.
 */
const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    cb(null, UPLOAD_DIR);
  },
  filename: (req, file, cb) => {
    const uniqueName = generateUniqueFilename(file.originalname);
    cb(null, uniqueName);
  },
});

/**
 * Экземпляр multer с ограничениями.
 */
const upload = multer({
  storage,
  limits: {
    fileSize: MAX_FILE_SIZE,
  },
  fileFilter,
});

/**
 * Конвертирует HEIC → JPEG с помощью sharp.
 * @param {string} inputPath – путь к HEIC-файлу.
 * @returns {Promise<string>} – путь к сконвертированному JPEG-файлу.
 */
async function convertHeicToJpeg(inputPath) {
  const outputPath = inputPath.replace(/\.heic$/i, '.jpg');
  await sharp(inputPath)
    .jpeg({ quality: 90 })
    .toFile(outputPath);
  // Удаляем исходный HEIC-файл
  await fs.unlink(inputPath);
  return outputPath;
}

/**
 * Middleware для проверки и конвертации HEIC-файлов после загрузки.
 * Если загружен .heic, заменяет req.file.path на путь к JPEG.
 */
async function convertIfHeic(req, res, next) {
  if (!req.file) return next();
  const ext = path.extname(req.file.originalname).toLowerCase();
  if (ext === '.heic') {
    try {
      const newPath = await convertHeicToJpeg(req.file.path);
      // Обновляем путь в объекте файла
      req.file.path = newPath;
      req.file.originalname = req.file.originalname.replace(/\.heic$/i, '.jpg');
      // Меняем расширение в имени файла
      req.file.filename = path.basename(newPath);
    } catch (err) {
      return next(new Error(`HEIC conversion failed: ${err.message}`));
    }
  }
  next();
}

// Экспортируем основной middleware для загрузки и дополнительную функцию
module.exports = {
  upload,                    // multer middleware
  convertIfHeic,             // middleware для конвертации после загрузки
  convertHeicToJpeg,         // отдельная функция для ручного вызова
  ensureUploadDir,           // для инициализации папки
  UPLOAD_DIR,
  MAX_FILE_SIZE,
  ALLOWED_EXTENSIONS,
};
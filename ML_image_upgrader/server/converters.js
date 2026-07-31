const sharp = require('sharp');
const fs = require('fs/promises');
const path = require('path');
const { HEIC_QUALITY } = require('./config/constants');

/**
 * Проверяет, поддерживает ли текущая версия sharp формат HEIC.
 * @returns {Promise<boolean>}
 */
async function isHeicSupported() {
  try {
    // Создаём временный буфер с минимальными данными и пытаемся использовать sharp.heic()
    const formats = sharp.format();
    return !!(formats.heic && formats.heic.input);
  } catch {
    return false;
  }
}

/**
 * Конвертирует HEIC-изображение в JPEG.
 * @param {string} inputPath – путь к HEIC-файлу.
 * @param {string} outputPath – путь для сохранения JPEG (если не указан, заменяет расширение на .jpg).
 * @returns {Promise<string>} – путь к созданному JPEG-файлу.
 * @throws {Error} – если формат не поддерживается или конвертация не удалась.
 */
async function convertHeicToJpeg(inputPath, outputPath) {
  // Если выходной путь не указан, генерируем его на основе входного
  if (!outputPath) {
    const dir = path.dirname(inputPath);
    const baseName = path.basename(inputPath, path.extname(inputPath));
    outputPath = path.join(dir, `${baseName}.jpg`);
  }

  // Проверяем, существует ли исходный файл
  try {
    await fs.access(inputPath);
  } catch {
    throw new Error(`Input file does not exist: ${inputPath}`);
  }

  // Проверяем поддержку HEIC
  const supported = await isHeicSupported();
  if (!supported) {
    throw new Error('HEIC format is not supported by the installed sharp version. ' +
                    'Please install libheif or update sharp (>=0.32).');
  }

  try {
    // Выполняем конвертацию с помощью sharp
    await sharp(inputPath)
      .jpeg({ quality: 90 })
      .toFile(outputPath);

    // Удаляем исходный HEIC-файл после успешной конвертации
    await fs.unlink(inputPath);
    return outputPath;
  } catch (err) {
    // Если конвертация не удалась, не удаляем исходный файл
    throw new Error(`HEIC to JPEG conversion failed: ${err.message}`);
  }
}

/**
 * Проверяет, является ли файл HEIC по расширению.
 * @param {string} filePath – путь к файлу.
 * @returns {boolean}
 */
function isHeicFile(filePath) {
  const ext = path.extname(filePath).toLowerCase();
  return ext === '.heic' || ext === '.heif';
}

module.exports = {
  convertHeicToJpeg,
  isHeicSupported,
  isHeicFile,
};
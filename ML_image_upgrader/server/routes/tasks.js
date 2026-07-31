const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const path = require('path');
const fs = require('fs/promises');
const TaskManager = require('../taskManager');
const { upload, convertIfHeic } = require('../upload');
const { TASK_STATUS, PROGRESS_MIN, PROGRESS_MAX } = require('../config/constants');

const taskManager = new TaskManager();

/**
 * POST /api/tasks
 * Загрузка изображения на обработку.
 * Ожидает multipart/form-data с полем 'image'.
 * Возвращает { taskId }.
 */
router.post('/', upload.single('image'), convertIfHeic, async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({
        error: 'No file uploaded',
        message: 'Please provide an image file (JPG, PNG, BMP, HEIC).',
      });
    }

    // Создаём задачу
    const taskId = taskManager.createTask(req.file.path, req.file.originalname);
    // Устанавливаем статус 'pending' (по умолчанию уже pending)
    // Можно сразу перевести в processing, если клиент начнёт обработку

    res.status(201).json({ taskId });
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tasks/:id/status
 * Возвращает текущий статус и прогресс задачи.
 */
router.get('/:id/status', (req, res, next) => {
  try {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({
      status: task.status,
      progress: task.progress,
    });
  } catch (err) {
    next(err);
  }
});

/**
 * DELETE /api/tasks/:id
 * Прерывает выполнение задачи.
 */
router.delete('/:id', (req, res, next) => {
  try {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    const aborted = taskManager.abortTask(req.params.id);
    if (aborted) {
      res.json({ success: true, message: 'Task aborted' });
    } else {
      res.status(500).json({ error: 'Failed to abort task' });
    }
  } catch (err) {
    next(err);
  }
});

/**
 * GET /api/tasks/:id/result
 * Отдаёт готовое изображение (если статус 'completed').
 */
router.get('/:id/result', async (req, res, next) => {
  try {
    const task = taskManager.getTask(req.params.id);
    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }
    if (task.status !== 'completed' || !task.resultPath) {
      return res.status(400).json({
        error: 'Result not ready',
        status: task.status,
      });
    }

    // Проверяем, существует ли файл результата
    try {
      await fs.access(task.resultPath);
    } catch {
      return res.status(404).json({ error: 'Result file not found on server' });
    }

    // Отдаём файл
    res.sendFile(task.resultPath, { root: '.' }, (err) => {
      if (err) {
        next(err);
      }
    });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tasks/:id/progress
 * Обновляет прогресс выполнения задачи.
 * Ожидает JSON { progress: number }.
 */
router.post('/:id/progress', (req, res, next) => {
  try {
    const { progress } = req.body;
    if (typeof progress !== 'number' || progress < 0 || progress > 100) {
      return res.status(400).json({
        error: 'Invalid progress value. Must be a number between 0 and 100.',
      });
    }

    const updated = taskManager.updateProgress(req.params.id, progress);
    if (!updated) {
      return res.status(404).json({ error: 'Task not found' });
    }
    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

/**
 * POST /api/tasks/:id/result
 * Клиент загружает готовое изображение обратно на сервер.
 * Ожидает multipart/form-data с полем 'image'.
 * Сохраняет результат и меняет статус на 'completed'.
 */
router.post('/:id/result', upload.single('image'), async (req, res, next) => {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'No result file uploaded' });
    }

    const task = taskManager.getTask(req.params.id);
    if (!task) {
      // Удаляем загруженный файл, так как задача не найдена
      await fs.unlink(req.file.path).catch(() => {});
      return res.status(404).json({ error: 'Task not found' });
    }

    // Сохраняем путь к результату и обновляем статус
    taskManager.setResultPath(req.params.id, req.file.path);
    taskManager.setStatus(req.params.id, 'completed');

    res.json({ success: true });
  } catch (err) {
    next(err);
  }
});

// Экспортируем router
module.exports = {
  router,
  taskManager,
};
const express = require('express');
const router = express.Router();
const { TASK_STATUS, SSE_INTERVAL } = require('../config/constants');

/**
 * Подключает менеджер задач к роутеру.
 * @param {TaskManager} taskManager
 * @returns {express.Router}
 */
function createEventsRouter(taskManager) {
  router.get('/:id', (req, res) => {
    const taskId = req.params.id;
    const task = taskManager.getTask(taskId);

    if (!task) {
      return res.status(404).json({ error: 'Task not found' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    // Функция отправки текущего состояния
    const sendUpdate = () => {
      const current = taskManager.getTask(taskId);
      if (!current) {
        res.write(`data: ${JSON.stringify({ status: TASK_STATUS.FAILED, progress: 0 })}\n\n`);
        res.end();
        return;
      }
      const data = {
        status: current.status,
        progress: current.progress,
      };
      res.write(`data: ${JSON.stringify(data)}\n\n`);

      if ([TASK_STATUS.COMPLETED, TASK_STATUS.FAILED, TASK_STATUS.ABORTED].includes(current.status)) {
        res.end();
      }
    };

    sendUpdate();

    const interval = setInterval(() => {
      sendUpdate();
    }, SSE_INTERVAL);

    req.on('close', () => {
      clearInterval(interval);
      res.end();
    });
  });

  return router;
}

module.exports = createEventsRouter;
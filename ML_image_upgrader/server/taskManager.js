const { v4: uuidv4 } = require('uuid');

/**
 * Класс для управления задачами обработки изображений.
 */
class TaskManager {
  constructor() {
    /** @type {Map<string, Task>} */
    this.tasks = new Map();
  }

  /**
   * Создаёт новую задачу.
   * @param {string} filePath – путь к загруженному исходному файлу.
   * @param {string} originalName – имя файла.
   * @returns {string} Уникальный идентификатор созданной задачи.
   */
  createTask(filePath, originalName) {
    const id = uuidv4();
    const task = {
      id,
      status: 'pending',
      progress: 0,
      originalPath: filePath,
      resultPath: null,
      originalName,
      createdAt: new Date(),
      updatedAt: new Date(),
      abortController: new AbortController(),
    };
    this.tasks.set(id, task);
    return id;
  }

  /**
   * Возвращает задачу по идентификатору.
   * @param {string} id
   * @returns {Task|null}
   */
  getTask(id) {
    return this.tasks.get(id) || null;
  }

  /**
   * Обновляет прогресс выполнения задачи.
   * @param {string} id
   * @param {number} progress – число от 0 до 100.
   * @returns {boolean} true, если прогресс обновлён; false, если задача не найдена.
   */
  updateProgress(id, progress) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.progress = Math.min(100, Math.max(0, progress));
    task.updatedAt = new Date();
    return true;
  }

  /**
   * Устанавливает статус задачи.
   * @param {string} id
   * @param {TaskStatus} status – допустимые значения: 'pending', 'processing', 'completed', 'failed', 'aborted'.
   * @returns {boolean} true, если статус обновлён; false, если задача не найдена.
   * @throws {Error} Если передан недопустимый статус.
   */
  setStatus(id, status) {
    const task = this.tasks.get(id);
    if (!task) return false;
    const validStatuses = ['pending', 'processing', 'completed', 'failed', 'aborted'];
    if (!validStatuses.includes(status)) {
      throw new Error(`Invalid status: ${status}`);
    }
    task.status = status;
    task.updatedAt = new Date();
    return true;
  }

  /**
   * Сохраняет путь к готовому изображению.
   * @param {string} id
   * @param {string} resultPath – путь к файлу с результатом.
   * @returns {boolean} true, если путь сохранён; false, если задача не найдена.
   */
  setResultPath(id, resultPath) {
    const task = this.tasks.get(id);
    if (!task) return false;
    task.resultPath = resultPath;
    task.updatedAt = new Date();
    return true;
  }

  /**
   * Прерывает выполнение задачи.
   * Вызывает abort() на AbortController (если он существует)
   * и переводит задачу в статус 'aborted'.
   * @param {string} id
   * @returns {boolean} true, если задача прервана; false, если задача не найдена.
   */
  abortTask(id) {
    const task = this.tasks.get(id);
    if (!task) return false;
    if (task.abortController) {
      task.abortController.abort();
    }
    task.status = 'aborted';
    task.updatedAt = new Date();
    return true;
  }

  /**
   * Удаляет задачу из хранилища (освобождает память).
   * @param {string} id
   * @returns {boolean} true, если задача удалена; false, если задача не найдена.
   */
  deleteTask(id) {
    return this.tasks.delete(id);
  }

  /**
   * Возвращает все задачи (для отладки/мониторинга).
   * @returns {Map<string, Task>}
   */
  getAllTasks() {
    return this.tasks;
  }
}

module.exports = TaskManager;
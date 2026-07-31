import * as tf from '@tensorflow/tfjs';
import { loadModel, predictParams } from './imageProcessor.js';

const uploadBtn = document.getElementById('uploadBtn');
const fileInput = document.getElementById('fileInput');
const dropZone = document.getElementById('dropZone');
const popup = document.getElementById('uploadPopup');
const popupClose = document.getElementById('popupClose');
const fileSelectBtn = document.getElementById('fileSelectBtn');

const originalCard = document.getElementById('originalCard');
const resultCard = document.getElementById('resultCard');
const originalImg = document.getElementById('originalImg');
const enhancedImg = document.getElementById('enhancedImg');
const downloadBtn = document.getElementById('downloadBtn');

const origBright = document.getElementById('origBright');
const origContrast = document.getElementById('origContrast');
const origSaturation = document.getElementById('origSaturation');
const resBright = document.getElementById('resBright');
const resContrast = document.getElementById('resContrast');
const resSaturation = document.getElementById('resSaturation');

const progressContainer = document.getElementById('progressContainer');
const progressFill = document.getElementById('progressFill');
const progressText = document.getElementById('progressText');
const statusMsg = document.getElementById('statusMessage');
const cancelBtn = document.getElementById('cancelBtn');

const imagePopup = document.getElementById('imagePopup');
const imagePopupClose = document.getElementById('imagePopupClose');
const popupImage = document.getElementById('popupImage');
const popupCaption = document.getElementById('popupCaption');

let model = null;
let currentTaskId = null;
let abortFlag = false;
let isProcessing = false;
let modelLoading = true;
let worker = null;

function setStatus(text, isError = false) {
  statusMsg.textContent = text;
  statusMsg.style.color = isError ? '#d32f2f' : '#1a73e8';
}
function updateProgress(value) {
  const clamped = Math.min(100, Math.max(0, value));
  progressFill.style.width = clamped + '%';
  progressText.textContent = Math.round(clamped) + '%';
}
function computeImageStats(canvas) {
  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const data = imageData.data;
  const n = data.length / 4;
  let rSum = 0, gSum = 0, bSum = 0, satSum = 0;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    rSum += r; gSum += g; bSum += b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }
  return {
    brightness: (rSum + gSum + bSum) / (3 * n),
    contrast: 0, // опускаем для скорости
    saturation: satSum / n
  };
}
function showOriginalCard(src, stats) {
  originalImg.src = src;
  originalCard.style.display = 'flex';
  if (stats) {
    origBright.textContent = stats.brightness.toFixed(1);
    origContrast.textContent = stats.contrast.toFixed(2);
    origSaturation.textContent = stats.saturation.toFixed(2);
  }
}
function showResultCard(src, stats) {
  enhancedImg.src = src;
  resultCard.style.display = 'flex';
  resBright.textContent = stats.brightness.toFixed(1);
  resContrast.textContent = stats.contrast.toFixed(2);
  resSaturation.textContent = stats.saturation.toFixed(2);
  downloadBtn.style.display = 'inline-block';
  downloadBtn.onclick = () => {
    const link = document.createElement('a');
    link.download = 'enhanced.jpg';
    link.href = src;
    link.click();
  };
}
function resetUI() {
  originalCard.style.display = 'none';
  resultCard.style.display = 'none';
  downloadBtn.style.display = 'none';
  progressContainer.style.display = 'none';
  updateProgress(0);
  setStatus('');
  cancelBtn.style.display = 'none';
  if (worker) { worker.terminate(); worker = null; }
}

function startWorkerProcessing(canvas, params, onProgress, onComplete, onAbort) {
  if (worker) { worker.terminate(); worker = null; }
  worker = new Worker('/worker.js');

  const ctx = canvas.getContext('2d');
  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const chunkSize = 1000;
  const totalRows = canvas.height;
  const totalCols = canvas.width;

  worker.postMessage({
    type: 'process',
    payload: { imageData, params, chunkSize, totalRows, totalCols }
  }, [imageData.data.buffer]);

  worker.onmessage = function(e) {
    const { type, progress, imageData } = e.data;
    if (type === 'progress') {
      if (onProgress) onProgress(progress);
    } else if (type === 'complete') {
      if (onComplete) {
        ctx.putImageData(imageData, 0, 0);
        onComplete(canvas);
      }
      worker.terminate();
      worker = null;
    } else if (type === 'aborted') {
      if (onAbort) onAbort();
      worker.terminate();
      worker = null;
    }
  };
  worker.onerror = function(err) {
    console.error('Worker error:', err);
    if (onAbort) onAbort();
    worker.terminate();
    worker = null;
  };

  return () => {
    if (worker) {
      worker.postMessage({ type: 'abort' });
      // Даём воркеру время завершить, но можно принудительно terminate
      setTimeout(() => { if (worker) { worker.terminate(); worker = null; } }, 100);
    }
  };
}

async function abortTask() {
  if (!currentTaskId) return;
  abortFlag = true;
  isProcessing = false;
  if (worker) { worker.postMessage({ type: 'abort' }); }
  try {
    await fetch(`/api/tasks/${currentTaskId}`, { method: 'DELETE' });
    setStatus('⛔ Задача отменена.', true);
  } catch (err) { console.error('Ошибка отмены:', err); }
  currentTaskId = null;
  cancelBtn.style.display = 'none';
}

async function handleFile(file) {
  if (isProcessing) {
    setStatus('⏳ Идёт обработка, дождитесь завершения.', true);
    return;
  }
  if (!file || !file.type.startsWith('image/')) {
    setStatus('⚠️ Пожалуйста, выберите изображение.', true);
    return;
  }
  if (!model) {
    setStatus('⏳ Модель ещё не загружена. Подождите...', true);
    return;
  }

  isProcessing = true;
  abortFlag = false;
  resetUI();
  cancelBtn.style.display = 'inline-block';
  progressContainer.style.display = 'flex';
  setStatus('⏳ Загрузка файла...');
  popup.classList.remove('popup_opened');

  await new Promise(resolve => setTimeout(resolve, 0));

  try {
    const formData = new FormData();
    formData.append('image', file);
    const res = await fetch('/api/tasks', { method: 'POST', body: formData });
    if (!res.ok) throw new Error('Ошибка создания задачи');
    const { taskId } = await res.json();
    currentTaskId = taskId;
    setStatus(`Задача создана (ID: ${taskId})`);

    const originalUrl = URL.createObjectURL(file);
    showOriginalCard(originalUrl, null);

    const img = await createImageBitmap(file);
    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0);
    img.close?.();

    setTimeout(() => {
      const stats = computeImageStats(canvas);
      if (originalImg.src === originalUrl) {
        showOriginalCard(originalUrl, stats);
      }
    }, 0);

    setStatus('🧠 Предсказание параметров...');
    const params = await predictParams(model, canvas, 224);
    setStatus(`📊 Параметры: Яркость=${params.brightness.toFixed(1)}, Контраст=${params.contrast.toFixed(2)}, Насыщ=${params.saturation.toFixed(2)}`);

    setStatus('🔄 Применение параметров (Web Worker)...');
    let lastSentProgress = -1;
    const abortWorker = startWorkerProcessing(
      canvas,
      params,
      (progress) => {
        updateProgress(progress);
        if (progress - lastSentProgress >= 5 || progress === 100) {
          lastSentProgress = progress;
          fetch(`/api/tasks/${taskId}/progress`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ progress }),
          }).catch(() => {});
        }
      },
      (processedCanvas) => {
        const enhancedDataUrl = processedCanvas.toDataURL('image/jpeg');
        const enhStats = computeImageStats(processedCanvas);
        showResultCard(enhancedDataUrl, enhStats);
        setStatus('✅ Изображение улучшено.');
        updateProgress(100);

        processedCanvas.toBlob(async (blob) => {
          const resultForm = new FormData();
          resultForm.append('image', blob, 'enhanced.jpg');
          await fetch(`/api/tasks/${taskId}/result`, { method: 'POST', body: resultForm });
          setStatus('✅ Результат сохранён.');
          isProcessing = false;
          cancelBtn.style.display = 'none';
        }, 'image/jpeg');
      },
      () => {
        setStatus('⛔ Обработка прервана.', true);
        isProcessing = false;
        cancelBtn.style.display = 'none';
      }
    );

    const oldAbort = abortTask;
    abortTask = async () => {
      if (abortWorker) abortWorker();
      await oldAbort();
    };

    if (abortFlag) {
      if (abortWorker) abortWorker();
      setStatus('⛔ Обработка прервана.', true);
      isProcessing = false;
      cancelBtn.style.display = 'none';
      return;
    }

    URL.revokeObjectURL(originalUrl);

  } catch (err) {
    console.error(err);
    setStatus('❌ Ошибка: ' + err.message, true);
    isProcessing = false;
    cancelBtn.style.display = 'none';
  } finally {
    abortTask = async () => {
      abortFlag = true;
      if (worker) worker.postMessage({ type: 'abort' });
      if (currentTaskId) {
        await fetch(`/api/tasks/${currentTaskId}`, { method: 'DELETE' });
      }
      currentTaskId = null;
      cancelBtn.style.display = 'none';
      setStatus('⛔ Задача отменена.', true);
    };
  }
}

async function init() {
  modelLoading = true;
  uploadBtn.disabled = true;
  try {
    setStatus('⏳ Загрузка модели...');
    model = await loadModel('/model/model.json');
    setStatus('✅ Модель загружена. Нажмите "+" чтобы загрузить изображение.');
    console.log('✅ Модель загружена');
  } catch (err) {
    setStatus('❌ Ошибка загрузки модели: ' + err.message, true);
    console.error(err);
  } finally {
    modelLoading = false;
    uploadBtn.disabled = false;
  }
}

uploadBtn.addEventListener('click', () => {
  if (modelLoading) { setStatus('⏳ Модель загружается, подождите...', true); return; }
  if (isProcessing) { setStatus('⏳ Идёт обработка, дождитесь завершения.', true); return; }
  popup.classList.add('popup_opened');
});
popupClose.addEventListener('click', () => popup.classList.remove('popup_opened'));
popup.addEventListener('click', (e) => { if (e.target === popup) popup.classList.remove('popup_opened'); });
fileSelectBtn.addEventListener('click', (e) => { e.stopPropagation(); fileInput.click(); });
fileInput.addEventListener('change', (e) => {
  if (e.target.files.length > 0) handleFile(e.target.files[0]);
  fileInput.value = '';
});
dropZone.addEventListener('dragover', (e) => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) handleFile(e.dataTransfer.files[0]);
});
cancelBtn.addEventListener('click', abortTask);

originalImg.addEventListener('click', () => {
  if (originalImg.src && originalImg.src !== '#') {
    popupImage.src = originalImg.src;
    popupCaption.textContent = 'Оригинал';
    imagePopup.classList.add('popup_opened');
  }
});
enhancedImg.addEventListener('click', () => {
  if (enhancedImg.src && enhancedImg.src !== '#') {
    popupImage.src = enhancedImg.src;
    popupCaption.textContent = 'Результат';
    imagePopup.classList.add('popup_opened');
  }
});
imagePopupClose.addEventListener('click', () => imagePopup.classList.remove('popup_opened'));
imagePopup.addEventListener('click', (e) => { if (e.target === imagePopup) imagePopup.classList.remove('popup_opened'); });

init();
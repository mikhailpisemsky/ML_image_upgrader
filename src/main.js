import * as tf from '@tensorflow/tfjs';

tf.setBackend('cpu');
console.log('Бэкенд TensorFlow.js установлен на:', tf.getBackend());

import { loadModel, predictParams } from './imageProcessor.js';

console.log('Импорты выполнены');

const dropZone = document.getElementById('dropZone');
const fileInput = document.getElementById('fileInput');
const fileSelectBtn = document.getElementById('fileSelectBtn');
const uploadBtn = document.getElementById('uploadBtn');
const popup = document.getElementById('uploadPopup');
const popupClose = document.getElementById('popupClose');

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
  const len = data.length;
  let rSum = 0, gSum = 0, bSum = 0;
  let rSq = 0, gSq = 0, bSq = 0;
  let satSum = 0;

  for (let i = 0; i < len; i += 4) {
    const r = data[i], g = data[i+1], b = data[i+2];
    rSum += r; gSum += g; bSum += b;
    rSq += r*r; gSq += g*g; bSq += b*b;
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    satSum += max === 0 ? 0 : (max - min) / max;
  }
  const n = len / 4;
  const meanR = rSum / n, meanG = gSum / n, meanB = bSum / n;
  const stdR = Math.sqrt(rSq / n - meanR * meanR);
  const stdG = Math.sqrt(gSq / n - meanG * meanG);
  const stdB = Math.sqrt(bSq / n - meanB * meanB);
  const contrast = (stdR + stdG + stdB) / 3;

  return {
    brightness: (meanR + meanG + meanB) / 3,
    contrast: contrast,
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
  } else {
    origBright.textContent = '—';
    origContrast.textContent = '—';
    origSaturation.textContent = '—';
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
  if (worker) {
    worker.postMessage({ type: 'abort' });
    worker.terminate();
    worker = null;
  }
  abortFlag = false;
}

async function init() {
  console.log('init() вызвана');
  modelLoading = true;
  uploadBtn.disabled = true;
  try {
    setStatus('⏳ Загрузка модели...');
    model = await loadModel('./model/model.json');
    setStatus('✅ Модель загружена. Выберите изображение.');
    console.log('✅ Модель загружена');
  } catch (err) {
    setStatus('❌ Ошибка загрузки модели: ' + err.message, true);
    console.error(err);
  } finally {
    modelLoading = false;
    uploadBtn.disabled = false;
  }
}

function abortProcessing() {
  abortFlag = true;
  if (worker) {
    worker.postMessage({ type: 'abort' });
    worker.terminate();
    worker = null;
  }
  setStatus('⛔ Обработка прервана.', true);
  isProcessing = false;
  cancelBtn.style.display = 'none';
  progressContainer.style.display = 'none';
}

async function handleFile(file) {
  console.log('handleFile вызвана с файлом:', file);
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

  await new Promise(resolve => setTimeout(resolve, 50));

  try {
    const originalUrl = URL.createObjectURL(file);
    showOriginalCard(originalUrl, null);
    await new Promise(resolve => setTimeout(resolve, 100));
    await new Promise(resolve => setTimeout(resolve, 50));

    const img = await createImageBitmap(file);

    const MAX_SIZE = 2048;
    let width = img.width;
    let height = img.height;
    if (width > MAX_SIZE || height > MAX_SIZE) {
      const scale = Math.min(MAX_SIZE / width, MAX_SIZE / height);
      width = Math.round(width * scale);
      height = Math.round(height * scale);
    }

    const canvas = document.createElement('canvas');
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    ctx.drawImage(img, 0, 0);
    img.close?.();

    setTimeout(() => {
      const stats = computeImageStats(canvas);
      if (originalImg.src === originalUrl) {
        showOriginalCard(originalUrl, stats);
      }
    }, 0);

    setStatus('🧠 Предсказание параметров...');
    await new Promise(resolve => setTimeout(resolve, 100));

    const params = await predictParams(model, canvas, 224);
    setStatus(`📊 Параметры: Яркость=${params.brightness.toFixed(1)}, Контраст=${params.contrast.toFixed(2)}, Насыщ=${params.saturation.toFixed(2)}`);

    setStatus('🔄 Применение параметров...');
    await new Promise(resolve => setTimeout(resolve, 100));

    worker = new Worker('./worker.js');

    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const totalRows = canvas.height;
    const totalCols = canvas.width;
    const chunkSize = 200;

    worker.postMessage({
      type: 'process',
      payload: {
        imageData,
        params,
        chunkSize,
        totalRows,
        totalCols,
      },
    }, [imageData.data.buffer]);

    worker.onmessage = (e) => {
      const { type, progress, imageData: resultImageData } = e.data;
      if (type === 'progress') {
        updateProgress(progress);
      } else if (type === 'complete') {
        ctx.putImageData(resultImageData, 0, 0);
        const enhancedDataUrl = canvas.toDataURL('image/jpeg');
        const enhStats = computeImageStats(canvas);
        showResultCard(enhancedDataUrl, enhStats);
        setStatus('✅ Изображение улучшено.');
        updateProgress(100);
        isProcessing = false;
        cancelBtn.style.display = 'none';
        worker.terminate();
        worker = null;
        URL.revokeObjectURL(originalUrl);
      } else if (type === 'aborted') {
        setStatus('⛔ Обработка прервана.', true);
        isProcessing = false;
        cancelBtn.style.display = 'none';
        worker.terminate();
        worker = null;
      }
    };

    worker.onerror = (err) => {
      console.error('Worker error:', err);
      setStatus('❌ Ошибка в Worker', true);
      isProcessing = false;
      cancelBtn.style.display = 'none';
      worker.terminate();
      worker = null;
    };

  } catch (err) {
    console.error('Ошибка в handleFile:', err);
    setStatus('❌ Ошибка: ' + err.message, true);
    isProcessing = false;
    cancelBtn.style.display = 'none';
  }
}

uploadBtn.addEventListener('click', () => {
  if (modelLoading) {
    setStatus('⏳ Модель загружается, подождите...', true);
    return;
  }
  if (isProcessing) {
    setStatus('⏳ Идёт обработка, дождитесь завершения.', true);
    return;
  }
  popup.classList.add('popup_opened');
});

popupClose.addEventListener('click', () => popup.classList.remove('popup_opened'));
popup.addEventListener('click', (e) => {
  if (e.target === popup) popup.classList.remove('popup_opened');
});

fileSelectBtn.addEventListener('click', (e) => {
  e.stopPropagation();
  fileInput.click();
});

fileInput.addEventListener('change', (e) => {
  console.log('change event, files:', e.target.files);
  if (e.target.files.length > 0) {
    console.log('Вызов handleFile');
    handleFile(e.target.files[0]);
  }
  fileInput.value = '';
});

dropZone.addEventListener('dragover', (e) => {
  e.preventDefault();
  dropZone.classList.add('dragover');
});
dropZone.addEventListener('dragleave', () => {
  dropZone.classList.remove('dragover');
});
dropZone.addEventListener('drop', (e) => {
  e.preventDefault();
  dropZone.classList.remove('dragover');
  if (e.dataTransfer.files.length > 0) {
    console.log('Drop event, calling handleFile');
    handleFile(e.dataTransfer.files[0]);
  }
});

cancelBtn.addEventListener('click', abortProcessing);

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
imagePopup.addEventListener('click', (e) => {
  if (e.target === imagePopup) imagePopup.classList.remove('popup_opened');
});

console.log('Инициализация...');
init();

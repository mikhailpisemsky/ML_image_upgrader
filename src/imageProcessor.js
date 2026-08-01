import * as tf from '@tensorflow/tfjs';

tf.setBackend('cpu');
console.log('Бэкенд TensorFlow.js установлен на:', tf.getBackend());

export async function loadModel(modelUrl) {
  console.log('Загрузка графовой модели с URL:', modelUrl);
  const model = await tf.loadGraphModel(modelUrl);
  console.log('Модель загружена');
  return model;
}

export async function predictParams(model, canvas, inputSize) {
  const tensor = tf.browser.fromPixels(canvas)
    .resizeBilinear([inputSize, inputSize])
    .toFloat()
    .div(255)
    .expandDims(0);

  const pred = model.predict(tensor);
  const data = await pred.data();

  const brightness = data[0] * 32.0;
  const contrast = Math.exp(data[1]);
  const saturation = Math.exp(data[2]);

  tf.dispose([tensor, pred]);

  return { brightness, contrast, saturation };
}
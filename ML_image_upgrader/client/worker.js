self.onmessage = function(e) {
  const { type, payload } = e.data;
  if (type === 'process') {
    const { imageData, params, chunkSize, totalRows, totalCols } = payload;
    const data = imageData.data;
    const brightness = params.brightness;
    const contrast = params.contrast;
    const saturation = params.saturation;
    let abort = false;
    let processed = 0;

    function rgbToHsv(r, g, b) {
      const max = Math.max(r, g, b) / 255;
      const min = Math.min(r, g, b) / 255;
      const v = max;
      const diff = max - min;
      const s = max === 0 ? 0 : diff / max;
      let h = 0;
      if (diff !== 0) {
        if (max === r/255) h = 60 * ((g/255 - b/255) / diff);
        else if (max === g/255) h = 60 * (2 + (b/255 - r/255) / diff);
        else if (max === b/255) h = 60 * (4 + (r/255 - g/255) / diff);
        if (h < 0) h += 360;
      }
      return { h, s, v };
    }
    function hsvToRgb(h, s, v) {
      const c = v * s;
      const x = c * (1 - Math.abs((h / 60) % 2 - 1));
      const m = v - c;
      let r, g, b;
      if (h < 60) { r = c; g = x; b = 0; }
      else if (h < 120) { r = x; g = c; b = 0; }
      else if (h < 180) { r = 0; g = c; b = x; }
      else if (h < 240) { r = 0; g = x; b = c; }
      else if (h < 300) { r = x; g = 0; b = c; }
      else { r = c; g = 0; b = x; }
      return { r: (r + m) * 255, g: (g + m) * 255, b: (b + m) * 255 };
    }

    function processChunk(startRow, endRow) {
      if (abort) { self.postMessage({ type: 'aborted' }); return; }
      for (let y = startRow; y < endRow; y++) {
        for (let x = 0; x < totalCols; x++) {
          const idx = (y * totalCols + x) * 4;
          let r = data[idx], g = data[idx+1], b = data[idx+2];
          r = ((r / 255 - 0.5) * contrast + 0.5) * 255;
          g = ((g / 255 - 0.5) * contrast + 0.5) * 255;
          b = ((b / 255 - 0.5) * contrast + 0.5) * 255;
          const hsv = rgbToHsv(r, g, b);
          hsv.s = Math.min(1, Math.max(0, hsv.s * saturation));
          const rgb = hsvToRgb(hsv.h, hsv.s, hsv.v);
          r = rgb.r + brightness;
          g = rgb.g + brightness;
          b = rgb.b + brightness;
          data[idx] = Math.max(0, Math.min(255, r));
          data[idx+1] = Math.max(0, Math.min(255, g));
          data[idx+2] = Math.max(0, Math.min(255, b));
        }
      }
      processed += (endRow - startRow) * totalCols;
      const total = totalRows * totalCols;
      const progress = Math.min(100, Math.floor((processed / total) * 100));
      self.postMessage({ type: 'progress', progress });
      const nextStart = endRow;
      const nextEnd = Math.min(endRow + chunkSize, totalRows);
      if (nextStart < totalRows) {
        setTimeout(() => processChunk(nextStart, nextEnd), 0);
      } else {
        self.postMessage({ type: 'complete', imageData, progress: 100 }, [imageData.data.buffer]);
      }
    }

    processChunk(0, Math.min(chunkSize, totalRows));

    self.onmessage = function(msg) {
      if (msg.data.type === 'abort') abort = true;
    };
  }
};
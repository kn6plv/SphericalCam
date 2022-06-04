//
// Spherical Viewer
//
// Copyright (c) 2017 Kazuhiko Arase
// Modifications (c) 2022 Tim Wilkinson
//
// URL: http://www.d-project.com/
//
// Licensed under the MIT license:
//  http://www.opensource.org/licenses/mit-license.php
//

function spherical_viewer() {

  //---------------------------------------------------------------------
  const mat4 = function () {
    const fn = {
      concat: function (n) {
        const o = [];
        o.length = 16;
        for (let i = 0; i < o.length; i++) {
          let v = 0;
          for (let j = 0; j < 4; j++) {
            v += this[~~(i / 4) * 4 + j] * n[i % 4 + j * 4];
          }
          o[i] = v;
        }
        return mat4(o);
      },
      transform: function (n) {
        const o = [];
        o.length = n.length;
        for (let i = 0; i < o.length; i++) {
          let v = 0;
          for (let j = 0; j < n.length; j++) {
            v += this[j * 4 + i] * n[j];
          }
          o[i] = v;
        }
        return o;
      },
      translateX: function (t) {
        return this.concat([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          t, 0, 0, 1
        ]);
      },
      translateY: function (t) {
        return this.concat([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, t, 0, 1
        ]);
      },
      translateZ: function (t) {
        return this.concat([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, t, 1
        ]);
      },
      scaleX: function (s) {
        return this.concat([
          s, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]);
      },
      scaleY: function (s) {
        return this.concat([
          1, 0, 0, 0,
          0, s, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]);
      },
      scaleZ: function (s) {
        return this.concat([
          1, 0, 0, 0,
          0, 1, 0, 0,
          0, 0, s, 0,
          0, 0, 0, 1
        ]);
      },
      rotateX: function (r) {
        const c = Math.cos(r);
        const s = Math.sin(r);
        return this.concat([
          1, 0, 0, 0,
          0, c, s, 0,
          0, -s, c, 0,
          0, 0, 0, 1
        ]);
      },
      rotateY: function (r) {
        const c = Math.cos(r);
        const s = Math.sin(r);
        return this.concat([
          c, 0, -s, 0,
          0, 1, 0, 0,
          s, 0, c, 0,
          0, 0, 0, 1
        ]);
      },
      rotateZ: function (r) {
        const c = Math.cos(r);
        const s = Math.sin(r);
        return this.concat([
          c, s, 0, 0,
          -s, c, 0, 0,
          0, 0, 1, 0,
          0, 0, 0, 1
        ]);
      },
      translate: function (t) {
        return this
          .translateX(t.x || 0)
          .translateY(t.y || 0)
          .translateZ(t.z || 0);
      },
      scale: function (s) {
        if (typeof s == 'number') {
          return this.scale({ x: s, y: s, z: s });
        }
        return this
          .scaleX(s.x || 1)
          .scaleY(s.y || 1)
          .scaleZ(s.z || 1);
      }
    };

    fn.__proto__ = [].__proto__;

    function identity() {
      return [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    }

    return function (m) {
      m = m || identity();
      m.__proto__ = fn;
      return m;
    };
  } ();

  //---------------------------------------------------------------------

  const hDiv = 32;
  const opts = {
    src: 'snap.jpg',
    width: 1280,
    height: 768,
    hDiv: hDiv,
    vDiv: hDiv << 1,
    zMin: -5,
    zMax: 5,
    att: 0.98,
    pRate: 1,
    maxTextureSize: 4096
  };

  const model = {
    valid: false,
    lastTime: 0,
    width: 0,
    height: 0,
    numPoints: 0,
    r: 0,
    z: 0,
    dragging: false,
    cam : mat4(),
    vx : 0,
    vy : -1,
    vz : 0
  };

  const cv = document.createElement('canvas');
  cv.setAttribute('width', '' + opts.width);
  cv.setAttribute('height', '' + opts.height);
  cv.style.cursor = 'all-scroll';

  const gl = cv.getContext('webgl') || cv.getContext('experimental-webgl', { preserveDrawingBuffer: true });

  if (!gl) {
    console.log('gl not supported.');
    return null;
  }

  //---------------------------------------------------------------------
  function createShader(gl, type, src) {
    const shader = gl.createShader(type);
    gl.shaderSource(shader, src);
    gl.compileShader(shader);
    if (gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
      return shader;
    }
    const msg = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw 'createShader:' + msg;
  }

  function createProgram(gl, vertexShader, fragmentShader) {
    const pgm = gl.createProgram();
    gl.attachShader(pgm, vertexShader);
    gl.attachShader(pgm, fragmentShader);
    gl.linkProgram(pgm);
    if (gl.getProgramParameter(pgm, gl.LINK_STATUS)) {
      return pgm;
    }
    const msg = gl.getProgramInfoLog(pgm);
    gl.deleteProgram(pgm);
    throw 'createProgram:' + msg;
  }

  //---------------------------------------------------------------------
  function preparePgm() {
    const vs = createShader(gl, gl.VERTEX_SHADER, `attribute vec4 aPosition;uniform mat4 uMatrix;attribute vec2 aTexcoord;varying vec2 vTexcoord;void main() {gl_Position = uMatrix * aPosition;vTexcoord = aTexcoord;}`);
    const fs = createShader(gl, gl.FRAGMENT_SHADER, `precision mediump float;varying vec2 vTexcoord;uniform sampler2D uTexture;void main() {gl_FragColor = texture2D(uTexture, vTexcoord);}`);
    const pgm = createProgram(gl, vs, fs);
    gl.useProgram(pgm);
    return pgm;
  }

  let lastCam = Date.now();
  function moveCam(x, y, z) {
    model.cam = model.cam.rotateX(x / model.r * getRate()).rotateY(-y / model.r * getRate());
    model.z = Math.max(opts.zMin, Math.min(model.z + z / model.r * 0.1 * getRate(), opts.zMax));
    const t = Date.now() - lastCam;
    if (t > 0) {
      lastCam += t;
      model.vx = x / t;
      model.vy = y / t;
      model.vz = z / t;
    }
    model.valid = false;
  }

  function moveCamB(x, y, z) {
    model.cam = model.cam.rotateX(x / model.r * getRate()).rotateY(-y / model.r * getRate());
    model.z = Math.max(opts.zMin, Math.min(model.z + z / model.r * 0.1 * getRate(), opts.zMax));
    model.valid = false;
  }

  function getRate() {
    return 1 + opts.pRate;
  }

  function mouseEventSupport() {
    let lastPoint = null;
    cv.addEventListener("mousemove", function (event) {
      if (model.dragging) {
        event.preventDefault();
        moveCam(event.pageY - lastPoint.pageY, event.pageX - lastPoint.pageX, 0);
        lastPoint = { pageX: event.pageX, pageY: event.pageY };
      }
    });
    cv.addEventListener("mouseup", function (event) {
      event.preventDefault();
      model.dragging = false;
    });
    cv.addEventListener('mousedown', function (event) {
      event.preventDefault();
      lastPoint = { pageX: event.pageX, pageY: event.pageY };
      model.dragging = true;
    });
    cv.addEventListener('wheel', function (event) {
      event.preventDefault();
      moveCam(0, 0, event.deltaY);
    });
  }

  function touchEventSupport() {
    function getPoints(event) {
      const points = [];
      for (let i = 0; i < event.touches.length; i++) {
        points.push({
          pageX: event.touches[i].pageX,
          pageY: event.touches[i].pageY
        });
      }
      return points;
    }
    let lastPoints = null;
    cv.addEventListener('touchmove', function (event) {
      if (model.dragging) {
        if (event.touches.length == 1 && lastPoints.length == 1) {
          moveCam(event.touches[0].pageY - lastPoints[0].pageY, event.touches[0].pageX - lastPoints[0].pageX, 0);
        }
        else if (event.touches.length == 2 && lastPoints.length == 2) {
          function d(o) {
            const dx = o[0].pageX - o[1].pageX;
            const dy = o[0].pageY - o[1].pageY;
            return 10 * Math.sqrt(dx * dx + dy * dy);
          }
          moveCam(0, 0, d(event.touches) - d(lastPoints));
        }
        lastPoints = getPoints(event);
      }
    });
    cv.addEventListener('touchend', function (event) {
      if (event.touches.length == 0) {
        lastPoints = null;
        model.dragging = false;
      }
    });
    cv.addEventListener('touchstart', function (event) {
      event.preventDefault();
      if (lastPoints == null) {
        lastPoints = getPoints(event);
        model.dragging = true;
      }
    });
  }

  function doMotion(dt) {
    if (!model.dragging) {
      const v = Math.sqrt(model.vx * model.vx + model.vy * model.vy + model.vz * model.vz);
      if (v < 0.01) {
        model.vx = 0;
        model.vy = 0;
        model.vz = 0;
      }
      else {
        moveCamB(model.vx * dt, model.vy * dt, model.vz * dt);
        model.vx *= opts.att;
        model.vy *= opts.att;
        model.vz *= opts.att;
      }
    }
  }

  //---------------------------------------------------------------------
  function prepareTexture() {
    const texture = gl.createTexture();
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, 1, 1, 0, gl.RGB, gl.UNSIGNED_BYTE, new Uint8Array([63, 63, 63]));

    const img = new Image();
    img.addEventListener('load', function () {
      let size = gl.getParameter(gl.MAX_TEXTURE_SIZE);
      if (opts.maxTextureSize) {
        size = Math.min(size, opts.maxTextureSize);
      }
      const w = size;
      const h = w >> 1;
      const cv = document.createElement('canvas');
      cv.setAttribute('width', '' + w);
      cv.setAttribute('height', '' + h);
      const ctx = cv.getContext('2d');
      ctx.drawImage(img, 0, 0, w, h);
      gl.bindTexture(gl.TEXTURE_2D, texture);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGB, gl.RGB, gl.UNSIGNED_BYTE, cv);
      gl.generateMipmap(gl.TEXTURE_2D);
      model.valid = false;
    });
    img.crossOrigin = 'anonymous';
    img.src = opts.src;
  }

  function prepareScene() {
    const vDiv = opts.vDiv;
    const hDiv = opts.hDiv;
    const vt = [];
    const tx = [];
    function addPoint(h, v, vOffset) {
      const p = 2 * Math.PI * h / hDiv;
      const to = Math.PI * ((v + vOffset) / vDiv - 0.5);
      const t = Math.sin(to) * Math.PI / 2; // liner to sine (-PI/2 ~ PI/2)
      vt.push(Math.cos(p) * Math.cos(t));
      vt.push(Math.sin(t));
      vt.push(Math.sin(p) * Math.cos(t));
      tx.push(v + h / hDiv); //tx.push(p / (2 * Math.PI) + v);
      tx.push((1 - Math.sin(to)) / 2); //tx.push(1 - (t / Math.PI + 0.5));
    }
    for (let v = 0; v <= vDiv; v++) {
      for (let h = 0; h < hDiv; h++) {
        addPoint(h, v, v == 0 ? 0 : h / hDiv - 1);
        addPoint(h, v, v == vDiv ? 1 : h / hDiv);
      }
    }

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(tx), gl.STATIC_DRAW);

    const aTexcoordLoc = gl.getAttribLocation(pgm, 'aTexcoord');
    gl.enableVertexAttribArray(aTexcoordLoc);
    gl.vertexAttribPointer(aTexcoordLoc, 2, gl.FLOAT, false, 0, 0);

    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(vt), gl.STATIC_DRAW);

    const aPositionLoc = gl.getAttribLocation(pgm, 'aPosition');
    gl.enableVertexAttribArray(aPositionLoc);
    gl.vertexAttribPointer(aPositionLoc, 3, gl.FLOAT, false, 0, 0);

    return vt.length / 3;
  }

  function updateScene() {
    model.r = model.width * Math.exp(Math.log(1.5) * model.z);
    const w = model.width;
    const h = model.height;

    const pmat = mat4();
    pmat[2 * 4 + 3] = opts.pRate;

    const mat = mat4().
      concat(model.cam).
      concat(pmat).scale(model.r).
      scale({ x: -1 / w, y: 1 / h, z: 1 / model.r }).
      translateZ(-0.1);

    gl.enable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

    const uMatrixLoc = gl.getUniformLocation(pgm, 'uMatrix');
    gl.uniformMatrix4fv(uMatrixLoc, false, mat);

    gl.drawArrays(gl.TRIANGLE_STRIP, 0, model.numPoints);
  }

  function update(now) {
    if (model.lastTime != 0) {
      doMotion(now - model.lastTime);
    }
    model.lastTime = now;

    if (model.width != gl.canvas.width || model.height != gl.canvas.height) {
      model.width = gl.canvas.width;
      model.height = gl.canvas.height;
      gl.viewport(0, 0, model.width, model.height);
      model.valid = false;
    }

    if (!model.valid) {
      updateScene();
      model.valid = true;
    }

    window.requestAnimationFrame(update);
  }

  //---------------------------------------------------------------------
  const pgm = preparePgm();

  prepareTexture();
  model.numPoints = prepareScene();

  if (typeof window.ontouchstart != 'undefined') {
    touchEventSupport();
  }
  else {
    mouseEventSupport();
  }

  window.requestAnimationFrame(update);

  return cv;
}

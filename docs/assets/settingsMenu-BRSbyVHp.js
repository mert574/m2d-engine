var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var __privateMethod = (obj, member, method) => (__accessCheck(obj, member, "access private method"), method);
var _UIElement_instances, origin_fn, _Scene_instances, runButtonAction_fn, _SceneLoader_instances, checkKeys_fn, loadLevel_fn, loadUI_fn, checkButton_fn, knownSceneNames_fn, _Camera_static, clampAxis_fn, _debugEnabled, _debugLayer, _CanvasRenderer_instances, targetContext_fn, resolveStyle_fn, applyCommon_fn, sizeScratch_fn, scratch_fn, paint_fn, buildFont_fn, popState_fn, _Batch_instances, ensureCapacity_fn, applyState_fn, _TextLabels_instances, rasterize_fn, _ShadowPass_instances, pixelScaleX_get, pixelScaleY_get, pixelRect_fn, drawQuad_fn, _EffectsPass_instances, setupVao_fn, bloom_fn, bindUnit_fn, drawFullQuad_fn, _WebGLRenderer_instances, createResources_fn, releaseResources_fn, ready_get, worldIsResampled_get, contentRect_fn, matrixFor_fn, setMatrixFor_fn, tintColor_fn, paint_fn2, gradientTexture_fn, evictGradients_fn, submitShape_fn, fillAndStroke_fn, withShadow_fn, passSpace_fn, bindCurrentTarget_fn, bindDefaultTarget_fn, submitTexturedQuad_fn, _particleQuad, _particleColor, effectsActive_get, popState_fn2, clip_fn, unclip_fn, drawStencilGeometry_fn, resetStencil_fn, _WorldOverlay_instances, submit_fn, worldTransform_fn, _M2D_instances, initRenderer_fn, computeViewport_fn, watchDisplaySize_fn, mapPointer_fn, _SettingsMenu_instances, items_fn, resolutionLabel_fn, cycleResolution_fn, inPanel_fn, layout_fn;
(function polyfill() {
  const relList = document.createElement("link").relList;
  if (relList && relList.supports && relList.supports("modulepreload")) {
    return;
  }
  for (const link of document.querySelectorAll('link[rel="modulepreload"]')) {
    processPreload(link);
  }
  new MutationObserver((mutations) => {
    for (const mutation of mutations) {
      if (mutation.type !== "childList") {
        continue;
      }
      for (const node of mutation.addedNodes) {
        if (node.tagName === "LINK" && node.rel === "modulepreload")
          processPreload(node);
      }
    }
  }).observe(document, { childList: true, subtree: true });
  function getFetchOpts(link) {
    const fetchOpts = {};
    if (link.integrity) fetchOpts.integrity = link.integrity;
    if (link.referrerPolicy) fetchOpts.referrerPolicy = link.referrerPolicy;
    if (link.crossOrigin === "use-credentials")
      fetchOpts.credentials = "include";
    else if (link.crossOrigin === "anonymous") fetchOpts.credentials = "omit";
    else fetchOpts.credentials = "same-origin";
    return fetchOpts;
  }
  function processPreload(link) {
    if (link.ep)
      return;
    link.ep = true;
    const fetchOpts = getFetchOpts(link);
    fetch(link.href, fetchOpts);
  }
})();
var commonjsGlobal = typeof globalThis !== "undefined" ? globalThis : typeof window !== "undefined" ? window : typeof global !== "undefined" ? global : typeof self !== "undefined" ? self : {};
function getDefaultExportFromCjs(x) {
  return x && x.__esModule && Object.prototype.hasOwnProperty.call(x, "default") ? x["default"] : x;
}
var matter = { exports: {} };
/*!
 * matter-js 0.19.0 by @liabru
 * http://brm.io/matter-js/
 * License MIT
 * 
 * The MIT License (MIT)
 * 
 * Copyright (c) Liam Brummitt and contributors.
 * 
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 * 
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */
(function(module, exports) {
  (function webpackUniversalModuleDefinition(root, factory) {
    module.exports = factory();
  })(commonjsGlobal, function() {
    return (
      /******/
      function(modules) {
        var installedModules = {};
        function __webpack_require__(moduleId) {
          if (installedModules[moduleId]) {
            return installedModules[moduleId].exports;
          }
          var module2 = installedModules[moduleId] = {
            /******/
            i: moduleId,
            /******/
            l: false,
            /******/
            exports: {}
            /******/
          };
          modules[moduleId].call(module2.exports, module2, module2.exports, __webpack_require__);
          module2.l = true;
          return module2.exports;
        }
        __webpack_require__.m = modules;
        __webpack_require__.c = installedModules;
        __webpack_require__.d = function(exports2, name, getter) {
          if (!__webpack_require__.o(exports2, name)) {
            Object.defineProperty(exports2, name, { enumerable: true, get: getter });
          }
        };
        __webpack_require__.r = function(exports2) {
          if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            Object.defineProperty(exports2, Symbol.toStringTag, { value: "Module" });
          }
          Object.defineProperty(exports2, "__esModule", { value: true });
        };
        __webpack_require__.t = function(value, mode) {
          if (mode & 1) value = __webpack_require__(value);
          if (mode & 8) return value;
          if (mode & 4 && typeof value === "object" && value && value.__esModule) return value;
          var ns = /* @__PURE__ */ Object.create(null);
          __webpack_require__.r(ns);
          Object.defineProperty(ns, "default", { enumerable: true, value });
          if (mode & 2 && typeof value != "string") for (var key in value) __webpack_require__.d(ns, key, (function(key2) {
            return value[key2];
          }).bind(null, key));
          return ns;
        };
        __webpack_require__.n = function(module2) {
          var getter = module2 && module2.__esModule ? (
            /******/
            function getDefault() {
              return module2["default"];
            }
          ) : (
            /******/
            function getModuleExports() {
              return module2;
            }
          );
          __webpack_require__.d(getter, "a", getter);
          return getter;
        };
        __webpack_require__.o = function(object, property) {
          return Object.prototype.hasOwnProperty.call(object, property);
        };
        __webpack_require__.p = "";
        return __webpack_require__(__webpack_require__.s = 20);
      }([
        /* 0 */
        /***/
        function(module2, exports2) {
          var Common = {};
          module2.exports = Common;
          (function() {
            Common._baseDelta = 1e3 / 60;
            Common._nextId = 0;
            Common._seed = 0;
            Common._nowStartTime = +/* @__PURE__ */ new Date();
            Common._warnedOnce = {};
            Common._decomp = null;
            Common.extend = function(obj, deep) {
              var argsStart, deepClone;
              if (typeof deep === "boolean") {
                argsStart = 2;
                deepClone = deep;
              } else {
                argsStart = 1;
                deepClone = true;
              }
              for (var i = argsStart; i < arguments.length; i++) {
                var source = arguments[i];
                if (source) {
                  for (var prop in source) {
                    if (deepClone && source[prop] && source[prop].constructor === Object) {
                      if (!obj[prop] || obj[prop].constructor === Object) {
                        obj[prop] = obj[prop] || {};
                        Common.extend(obj[prop], deepClone, source[prop]);
                      } else {
                        obj[prop] = source[prop];
                      }
                    } else {
                      obj[prop] = source[prop];
                    }
                  }
                }
              }
              return obj;
            };
            Common.clone = function(obj, deep) {
              return Common.extend({}, deep, obj);
            };
            Common.keys = function(obj) {
              if (Object.keys)
                return Object.keys(obj);
              var keys = [];
              for (var key in obj)
                keys.push(key);
              return keys;
            };
            Common.values = function(obj) {
              var values = [];
              if (Object.keys) {
                var keys = Object.keys(obj);
                for (var i = 0; i < keys.length; i++) {
                  values.push(obj[keys[i]]);
                }
                return values;
              }
              for (var key in obj)
                values.push(obj[key]);
              return values;
            };
            Common.get = function(obj, path, begin, end) {
              path = path.split(".").slice(begin, end);
              for (var i = 0; i < path.length; i += 1) {
                obj = obj[path[i]];
              }
              return obj;
            };
            Common.set = function(obj, path, val, begin, end) {
              var parts = path.split(".").slice(begin, end);
              Common.get(obj, path, 0, -1)[parts[parts.length - 1]] = val;
              return val;
            };
            Common.shuffle = function(array) {
              for (var i = array.length - 1; i > 0; i--) {
                var j = Math.floor(Common.random() * (i + 1));
                var temp = array[i];
                array[i] = array[j];
                array[j] = temp;
              }
              return array;
            };
            Common.choose = function(choices) {
              return choices[Math.floor(Common.random() * choices.length)];
            };
            Common.isElement = function(obj) {
              if (typeof HTMLElement !== "undefined") {
                return obj instanceof HTMLElement;
              }
              return !!(obj && obj.nodeType && obj.nodeName);
            };
            Common.isArray = function(obj) {
              return Object.prototype.toString.call(obj) === "[object Array]";
            };
            Common.isFunction = function(obj) {
              return typeof obj === "function";
            };
            Common.isPlainObject = function(obj) {
              return typeof obj === "object" && obj.constructor === Object;
            };
            Common.isString = function(obj) {
              return toString.call(obj) === "[object String]";
            };
            Common.clamp = function(value, min, max) {
              if (value < min)
                return min;
              if (value > max)
                return max;
              return value;
            };
            Common.sign = function(value) {
              return value < 0 ? -1 : 1;
            };
            Common.now = function() {
              if (typeof window !== "undefined" && window.performance) {
                if (window.performance.now) {
                  return window.performance.now();
                } else if (window.performance.webkitNow) {
                  return window.performance.webkitNow();
                }
              }
              if (Date.now) {
                return Date.now();
              }
              return /* @__PURE__ */ new Date() - Common._nowStartTime;
            };
            Common.random = function(min, max) {
              min = typeof min !== "undefined" ? min : 0;
              max = typeof max !== "undefined" ? max : 1;
              return min + _seededRandom() * (max - min);
            };
            var _seededRandom = function() {
              Common._seed = (Common._seed * 9301 + 49297) % 233280;
              return Common._seed / 233280;
            };
            Common.colorToNumber = function(colorString) {
              colorString = colorString.replace("#", "");
              if (colorString.length == 3) {
                colorString = colorString.charAt(0) + colorString.charAt(0) + colorString.charAt(1) + colorString.charAt(1) + colorString.charAt(2) + colorString.charAt(2);
              }
              return parseInt(colorString, 16);
            };
            Common.logLevel = 1;
            Common.log = function() {
              if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
                console.log.apply(console, ["matter-js:"].concat(Array.prototype.slice.call(arguments)));
              }
            };
            Common.info = function() {
              if (console && Common.logLevel > 0 && Common.logLevel <= 2) {
                console.info.apply(console, ["matter-js:"].concat(Array.prototype.slice.call(arguments)));
              }
            };
            Common.warn = function() {
              if (console && Common.logLevel > 0 && Common.logLevel <= 3) {
                console.warn.apply(console, ["matter-js:"].concat(Array.prototype.slice.call(arguments)));
              }
            };
            Common.warnOnce = function() {
              var message = Array.prototype.slice.call(arguments).join(" ");
              if (!Common._warnedOnce[message]) {
                Common.warn(message);
                Common._warnedOnce[message] = true;
              }
            };
            Common.deprecated = function(obj, prop, warning) {
              obj[prop] = Common.chain(function() {
                Common.warnOnce("🔅 deprecated 🔅", warning);
              }, obj[prop]);
            };
            Common.nextId = function() {
              return Common._nextId++;
            };
            Common.indexOf = function(haystack, needle) {
              if (haystack.indexOf)
                return haystack.indexOf(needle);
              for (var i = 0; i < haystack.length; i++) {
                if (haystack[i] === needle)
                  return i;
              }
              return -1;
            };
            Common.map = function(list, func) {
              if (list.map) {
                return list.map(func);
              }
              var mapped = [];
              for (var i = 0; i < list.length; i += 1) {
                mapped.push(func(list[i]));
              }
              return mapped;
            };
            Common.topologicalSort = function(graph) {
              var result = [], visited = [], temp = [];
              for (var node in graph) {
                if (!visited[node] && !temp[node]) {
                  Common._topologicalSort(node, visited, temp, graph, result);
                }
              }
              return result;
            };
            Common._topologicalSort = function(node, visited, temp, graph, result) {
              var neighbors = graph[node] || [];
              temp[node] = true;
              for (var i = 0; i < neighbors.length; i += 1) {
                var neighbor = neighbors[i];
                if (temp[neighbor]) {
                  continue;
                }
                if (!visited[neighbor]) {
                  Common._topologicalSort(neighbor, visited, temp, graph, result);
                }
              }
              temp[node] = false;
              visited[node] = true;
              result.push(node);
            };
            Common.chain = function() {
              var funcs = [];
              for (var i = 0; i < arguments.length; i += 1) {
                var func = arguments[i];
                if (func._chained) {
                  funcs.push.apply(funcs, func._chained);
                } else {
                  funcs.push(func);
                }
              }
              var chain = function() {
                var lastResult, args = new Array(arguments.length);
                for (var i2 = 0, l = arguments.length; i2 < l; i2++) {
                  args[i2] = arguments[i2];
                }
                for (i2 = 0; i2 < funcs.length; i2 += 1) {
                  var result = funcs[i2].apply(lastResult, args);
                  if (typeof result !== "undefined") {
                    lastResult = result;
                  }
                }
                return lastResult;
              };
              chain._chained = funcs;
              return chain;
            };
            Common.chainPathBefore = function(base, path, func) {
              return Common.set(base, path, Common.chain(
                func,
                Common.get(base, path)
              ));
            };
            Common.chainPathAfter = function(base, path, func) {
              return Common.set(base, path, Common.chain(
                Common.get(base, path),
                func
              ));
            };
            Common.setDecomp = function(decomp) {
              Common._decomp = decomp;
            };
            Common.getDecomp = function() {
              var decomp = Common._decomp;
              try {
                if (!decomp && typeof window !== "undefined") {
                  decomp = window.decomp;
                }
                if (!decomp && typeof commonjsGlobal !== "undefined") {
                  decomp = commonjsGlobal.decomp;
                }
              } catch (e) {
                decomp = null;
              }
              return decomp;
            };
          })();
        },
        /* 1 */
        /***/
        function(module2, exports2) {
          var Bounds = {};
          module2.exports = Bounds;
          (function() {
            Bounds.create = function(vertices) {
              var bounds = {
                min: { x: 0, y: 0 },
                max: { x: 0, y: 0 }
              };
              if (vertices)
                Bounds.update(bounds, vertices);
              return bounds;
            };
            Bounds.update = function(bounds, vertices, velocity) {
              bounds.min.x = Infinity;
              bounds.max.x = -Infinity;
              bounds.min.y = Infinity;
              bounds.max.y = -Infinity;
              for (var i = 0; i < vertices.length; i++) {
                var vertex = vertices[i];
                if (vertex.x > bounds.max.x) bounds.max.x = vertex.x;
                if (vertex.x < bounds.min.x) bounds.min.x = vertex.x;
                if (vertex.y > bounds.max.y) bounds.max.y = vertex.y;
                if (vertex.y < bounds.min.y) bounds.min.y = vertex.y;
              }
              if (velocity) {
                if (velocity.x > 0) {
                  bounds.max.x += velocity.x;
                } else {
                  bounds.min.x += velocity.x;
                }
                if (velocity.y > 0) {
                  bounds.max.y += velocity.y;
                } else {
                  bounds.min.y += velocity.y;
                }
              }
            };
            Bounds.contains = function(bounds, point) {
              return point.x >= bounds.min.x && point.x <= bounds.max.x && point.y >= bounds.min.y && point.y <= bounds.max.y;
            };
            Bounds.overlaps = function(boundsA, boundsB) {
              return boundsA.min.x <= boundsB.max.x && boundsA.max.x >= boundsB.min.x && boundsA.max.y >= boundsB.min.y && boundsA.min.y <= boundsB.max.y;
            };
            Bounds.translate = function(bounds, vector) {
              bounds.min.x += vector.x;
              bounds.max.x += vector.x;
              bounds.min.y += vector.y;
              bounds.max.y += vector.y;
            };
            Bounds.shift = function(bounds, position) {
              var deltaX = bounds.max.x - bounds.min.x, deltaY = bounds.max.y - bounds.min.y;
              bounds.min.x = position.x;
              bounds.max.x = position.x + deltaX;
              bounds.min.y = position.y;
              bounds.max.y = position.y + deltaY;
            };
          })();
        },
        /* 2 */
        /***/
        function(module2, exports2) {
          var Vector = {};
          module2.exports = Vector;
          (function() {
            Vector.create = function(x, y) {
              return { x: x || 0, y: y || 0 };
            };
            Vector.clone = function(vector) {
              return { x: vector.x, y: vector.y };
            };
            Vector.magnitude = function(vector) {
              return Math.sqrt(vector.x * vector.x + vector.y * vector.y);
            };
            Vector.magnitudeSquared = function(vector) {
              return vector.x * vector.x + vector.y * vector.y;
            };
            Vector.rotate = function(vector, angle, output) {
              var cos = Math.cos(angle), sin = Math.sin(angle);
              if (!output) output = {};
              var x = vector.x * cos - vector.y * sin;
              output.y = vector.x * sin + vector.y * cos;
              output.x = x;
              return output;
            };
            Vector.rotateAbout = function(vector, angle, point, output) {
              var cos = Math.cos(angle), sin = Math.sin(angle);
              if (!output) output = {};
              var x = point.x + ((vector.x - point.x) * cos - (vector.y - point.y) * sin);
              output.y = point.y + ((vector.x - point.x) * sin + (vector.y - point.y) * cos);
              output.x = x;
              return output;
            };
            Vector.normalise = function(vector) {
              var magnitude = Vector.magnitude(vector);
              if (magnitude === 0)
                return { x: 0, y: 0 };
              return { x: vector.x / magnitude, y: vector.y / magnitude };
            };
            Vector.dot = function(vectorA, vectorB) {
              return vectorA.x * vectorB.x + vectorA.y * vectorB.y;
            };
            Vector.cross = function(vectorA, vectorB) {
              return vectorA.x * vectorB.y - vectorA.y * vectorB.x;
            };
            Vector.cross3 = function(vectorA, vectorB, vectorC) {
              return (vectorB.x - vectorA.x) * (vectorC.y - vectorA.y) - (vectorB.y - vectorA.y) * (vectorC.x - vectorA.x);
            };
            Vector.add = function(vectorA, vectorB, output) {
              if (!output) output = {};
              output.x = vectorA.x + vectorB.x;
              output.y = vectorA.y + vectorB.y;
              return output;
            };
            Vector.sub = function(vectorA, vectorB, output) {
              if (!output) output = {};
              output.x = vectorA.x - vectorB.x;
              output.y = vectorA.y - vectorB.y;
              return output;
            };
            Vector.mult = function(vector, scalar) {
              return { x: vector.x * scalar, y: vector.y * scalar };
            };
            Vector.div = function(vector, scalar) {
              return { x: vector.x / scalar, y: vector.y / scalar };
            };
            Vector.perp = function(vector, negate) {
              negate = negate === true ? -1 : 1;
              return { x: negate * -vector.y, y: negate * vector.x };
            };
            Vector.neg = function(vector) {
              return { x: -vector.x, y: -vector.y };
            };
            Vector.angle = function(vectorA, vectorB) {
              return Math.atan2(vectorB.y - vectorA.y, vectorB.x - vectorA.x);
            };
            Vector._temp = [
              Vector.create(),
              Vector.create(),
              Vector.create(),
              Vector.create(),
              Vector.create(),
              Vector.create()
            ];
          })();
        },
        /* 3 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Vertices = {};
          module2.exports = Vertices;
          var Vector = __webpack_require__(2);
          var Common = __webpack_require__(0);
          (function() {
            Vertices.create = function(points, body) {
              var vertices = [];
              for (var i = 0; i < points.length; i++) {
                var point = points[i], vertex = {
                  x: point.x,
                  y: point.y,
                  index: i,
                  body,
                  isInternal: false
                };
                vertices.push(vertex);
              }
              return vertices;
            };
            Vertices.fromPath = function(path, body) {
              var pathPattern = /L?\s*([-\d.e]+)[\s,]*([-\d.e]+)*/ig, points = [];
              path.replace(pathPattern, function(match, x, y) {
                points.push({ x: parseFloat(x), y: parseFloat(y) });
              });
              return Vertices.create(points, body);
            };
            Vertices.centre = function(vertices) {
              var area = Vertices.area(vertices, true), centre = { x: 0, y: 0 }, cross, temp, j;
              for (var i = 0; i < vertices.length; i++) {
                j = (i + 1) % vertices.length;
                cross = Vector.cross(vertices[i], vertices[j]);
                temp = Vector.mult(Vector.add(vertices[i], vertices[j]), cross);
                centre = Vector.add(centre, temp);
              }
              return Vector.div(centre, 6 * area);
            };
            Vertices.mean = function(vertices) {
              var average = { x: 0, y: 0 };
              for (var i = 0; i < vertices.length; i++) {
                average.x += vertices[i].x;
                average.y += vertices[i].y;
              }
              return Vector.div(average, vertices.length);
            };
            Vertices.area = function(vertices, signed) {
              var area = 0, j = vertices.length - 1;
              for (var i = 0; i < vertices.length; i++) {
                area += (vertices[j].x - vertices[i].x) * (vertices[j].y + vertices[i].y);
                j = i;
              }
              if (signed)
                return area / 2;
              return Math.abs(area) / 2;
            };
            Vertices.inertia = function(vertices, mass) {
              var numerator = 0, denominator = 0, v = vertices, cross, j;
              for (var n = 0; n < v.length; n++) {
                j = (n + 1) % v.length;
                cross = Math.abs(Vector.cross(v[j], v[n]));
                numerator += cross * (Vector.dot(v[j], v[j]) + Vector.dot(v[j], v[n]) + Vector.dot(v[n], v[n]));
                denominator += cross;
              }
              return mass / 6 * (numerator / denominator);
            };
            Vertices.translate = function(vertices, vector, scalar) {
              scalar = typeof scalar !== "undefined" ? scalar : 1;
              var verticesLength = vertices.length, translateX = vector.x * scalar, translateY = vector.y * scalar, i;
              for (i = 0; i < verticesLength; i++) {
                vertices[i].x += translateX;
                vertices[i].y += translateY;
              }
              return vertices;
            };
            Vertices.rotate = function(vertices, angle, point) {
              if (angle === 0)
                return;
              var cos = Math.cos(angle), sin = Math.sin(angle), pointX = point.x, pointY = point.y, verticesLength = vertices.length, vertex, dx, dy, i;
              for (i = 0; i < verticesLength; i++) {
                vertex = vertices[i];
                dx = vertex.x - pointX;
                dy = vertex.y - pointY;
                vertex.x = pointX + (dx * cos - dy * sin);
                vertex.y = pointY + (dx * sin + dy * cos);
              }
              return vertices;
            };
            Vertices.contains = function(vertices, point) {
              var pointX = point.x, pointY = point.y, verticesLength = vertices.length, vertex = vertices[verticesLength - 1], nextVertex;
              for (var i = 0; i < verticesLength; i++) {
                nextVertex = vertices[i];
                if ((pointX - vertex.x) * (nextVertex.y - vertex.y) + (pointY - vertex.y) * (vertex.x - nextVertex.x) > 0) {
                  return false;
                }
                vertex = nextVertex;
              }
              return true;
            };
            Vertices.scale = function(vertices, scaleX, scaleY, point) {
              if (scaleX === 1 && scaleY === 1)
                return vertices;
              point = point || Vertices.centre(vertices);
              var vertex, delta;
              for (var i = 0; i < vertices.length; i++) {
                vertex = vertices[i];
                delta = Vector.sub(vertex, point);
                vertices[i].x = point.x + delta.x * scaleX;
                vertices[i].y = point.y + delta.y * scaleY;
              }
              return vertices;
            };
            Vertices.chamfer = function(vertices, radius, quality, qualityMin, qualityMax) {
              if (typeof radius === "number") {
                radius = [radius];
              } else {
                radius = radius || [8];
              }
              quality = typeof quality !== "undefined" ? quality : -1;
              qualityMin = qualityMin || 2;
              qualityMax = qualityMax || 14;
              var newVertices = [];
              for (var i = 0; i < vertices.length; i++) {
                var prevVertex = vertices[i - 1 >= 0 ? i - 1 : vertices.length - 1], vertex = vertices[i], nextVertex = vertices[(i + 1) % vertices.length], currentRadius = radius[i < radius.length ? i : radius.length - 1];
                if (currentRadius === 0) {
                  newVertices.push(vertex);
                  continue;
                }
                var prevNormal = Vector.normalise({
                  x: vertex.y - prevVertex.y,
                  y: prevVertex.x - vertex.x
                });
                var nextNormal = Vector.normalise({
                  x: nextVertex.y - vertex.y,
                  y: vertex.x - nextVertex.x
                });
                var diagonalRadius = Math.sqrt(2 * Math.pow(currentRadius, 2)), radiusVector = Vector.mult(Common.clone(prevNormal), currentRadius), midNormal = Vector.normalise(Vector.mult(Vector.add(prevNormal, nextNormal), 0.5)), scaledVertex = Vector.sub(vertex, Vector.mult(midNormal, diagonalRadius));
                var precision = quality;
                if (quality === -1) {
                  precision = Math.pow(currentRadius, 0.32) * 1.75;
                }
                precision = Common.clamp(precision, qualityMin, qualityMax);
                if (precision % 2 === 1)
                  precision += 1;
                var alpha = Math.acos(Vector.dot(prevNormal, nextNormal)), theta = alpha / precision;
                for (var j = 0; j < precision; j++) {
                  newVertices.push(Vector.add(Vector.rotate(radiusVector, theta * j), scaledVertex));
                }
              }
              return newVertices;
            };
            Vertices.clockwiseSort = function(vertices) {
              var centre = Vertices.mean(vertices);
              vertices.sort(function(vertexA, vertexB) {
                return Vector.angle(centre, vertexA) - Vector.angle(centre, vertexB);
              });
              return vertices;
            };
            Vertices.isConvex = function(vertices) {
              var flag = 0, n = vertices.length, i, j, k, z;
              if (n < 3)
                return null;
              for (i = 0; i < n; i++) {
                j = (i + 1) % n;
                k = (i + 2) % n;
                z = (vertices[j].x - vertices[i].x) * (vertices[k].y - vertices[j].y);
                z -= (vertices[j].y - vertices[i].y) * (vertices[k].x - vertices[j].x);
                if (z < 0) {
                  flag |= 1;
                } else if (z > 0) {
                  flag |= 2;
                }
                if (flag === 3) {
                  return false;
                }
              }
              if (flag !== 0) {
                return true;
              } else {
                return null;
              }
            };
            Vertices.hull = function(vertices) {
              var upper = [], lower = [], vertex, i;
              vertices = vertices.slice(0);
              vertices.sort(function(vertexA, vertexB) {
                var dx = vertexA.x - vertexB.x;
                return dx !== 0 ? dx : vertexA.y - vertexB.y;
              });
              for (i = 0; i < vertices.length; i += 1) {
                vertex = vertices[i];
                while (lower.length >= 2 && Vector.cross3(lower[lower.length - 2], lower[lower.length - 1], vertex) <= 0) {
                  lower.pop();
                }
                lower.push(vertex);
              }
              for (i = vertices.length - 1; i >= 0; i -= 1) {
                vertex = vertices[i];
                while (upper.length >= 2 && Vector.cross3(upper[upper.length - 2], upper[upper.length - 1], vertex) <= 0) {
                  upper.pop();
                }
                upper.push(vertex);
              }
              upper.pop();
              lower.pop();
              return upper.concat(lower);
            };
          })();
        },
        /* 4 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Body = {};
          module2.exports = Body;
          var Vertices = __webpack_require__(3);
          var Vector = __webpack_require__(2);
          var Sleeping = __webpack_require__(7);
          var Common = __webpack_require__(0);
          var Bounds = __webpack_require__(1);
          var Axes = __webpack_require__(11);
          (function() {
            Body._timeCorrection = true;
            Body._inertiaScale = 4;
            Body._nextCollidingGroupId = 1;
            Body._nextNonCollidingGroupId = -1;
            Body._nextCategory = 1;
            Body._baseDelta = 1e3 / 60;
            Body.create = function(options) {
              var defaults = {
                id: Common.nextId(),
                type: "body",
                label: "Body",
                parts: [],
                plugin: {},
                angle: 0,
                vertices: Vertices.fromPath("L 0 0 L 40 0 L 40 40 L 0 40"),
                position: { x: 0, y: 0 },
                force: { x: 0, y: 0 },
                torque: 0,
                positionImpulse: { x: 0, y: 0 },
                constraintImpulse: { x: 0, y: 0, angle: 0 },
                totalContacts: 0,
                speed: 0,
                angularSpeed: 0,
                velocity: { x: 0, y: 0 },
                angularVelocity: 0,
                isSensor: false,
                isStatic: false,
                isSleeping: false,
                motion: 0,
                sleepThreshold: 60,
                density: 1e-3,
                restitution: 0,
                friction: 0.1,
                frictionStatic: 0.5,
                frictionAir: 0.01,
                collisionFilter: {
                  category: 1,
                  mask: 4294967295,
                  group: 0
                },
                slop: 0.05,
                timeScale: 1,
                render: {
                  visible: true,
                  opacity: 1,
                  strokeStyle: null,
                  fillStyle: null,
                  lineWidth: null,
                  sprite: {
                    xScale: 1,
                    yScale: 1,
                    xOffset: 0,
                    yOffset: 0
                  }
                },
                events: null,
                bounds: null,
                chamfer: null,
                circleRadius: 0,
                positionPrev: null,
                anglePrev: 0,
                parent: null,
                axes: null,
                area: 0,
                mass: 0,
                inertia: 0,
                deltaTime: 1e3 / 60,
                _original: null
              };
              var body = Common.extend(defaults, options);
              _initProperties(body, options);
              return body;
            };
            Body.nextGroup = function(isNonColliding) {
              if (isNonColliding)
                return Body._nextNonCollidingGroupId--;
              return Body._nextCollidingGroupId++;
            };
            Body.nextCategory = function() {
              Body._nextCategory = Body._nextCategory << 1;
              return Body._nextCategory;
            };
            var _initProperties = function(body, options) {
              options = options || {};
              Body.set(body, {
                bounds: body.bounds || Bounds.create(body.vertices),
                positionPrev: body.positionPrev || Vector.clone(body.position),
                anglePrev: body.anglePrev || body.angle,
                vertices: body.vertices,
                parts: body.parts || [body],
                isStatic: body.isStatic,
                isSleeping: body.isSleeping,
                parent: body.parent || body
              });
              Vertices.rotate(body.vertices, body.angle, body.position);
              Axes.rotate(body.axes, body.angle);
              Bounds.update(body.bounds, body.vertices, body.velocity);
              Body.set(body, {
                axes: options.axes || body.axes,
                area: options.area || body.area,
                mass: options.mass || body.mass,
                inertia: options.inertia || body.inertia
              });
              var defaultFillStyle = body.isStatic ? "#14151f" : Common.choose(["#f19648", "#f5d259", "#f55a3c", "#063e7b", "#ececd1"]), defaultStrokeStyle = body.isStatic ? "#555" : "#ccc", defaultLineWidth = body.isStatic && body.render.fillStyle === null ? 1 : 0;
              body.render.fillStyle = body.render.fillStyle || defaultFillStyle;
              body.render.strokeStyle = body.render.strokeStyle || defaultStrokeStyle;
              body.render.lineWidth = body.render.lineWidth || defaultLineWidth;
              body.render.sprite.xOffset += -(body.bounds.min.x - body.position.x) / (body.bounds.max.x - body.bounds.min.x);
              body.render.sprite.yOffset += -(body.bounds.min.y - body.position.y) / (body.bounds.max.y - body.bounds.min.y);
            };
            Body.set = function(body, settings, value) {
              var property;
              if (typeof settings === "string") {
                property = settings;
                settings = {};
                settings[property] = value;
              }
              for (property in settings) {
                if (!Object.prototype.hasOwnProperty.call(settings, property))
                  continue;
                value = settings[property];
                switch (property) {
                  case "isStatic":
                    Body.setStatic(body, value);
                    break;
                  case "isSleeping":
                    Sleeping.set(body, value);
                    break;
                  case "mass":
                    Body.setMass(body, value);
                    break;
                  case "density":
                    Body.setDensity(body, value);
                    break;
                  case "inertia":
                    Body.setInertia(body, value);
                    break;
                  case "vertices":
                    Body.setVertices(body, value);
                    break;
                  case "position":
                    Body.setPosition(body, value);
                    break;
                  case "angle":
                    Body.setAngle(body, value);
                    break;
                  case "velocity":
                    Body.setVelocity(body, value);
                    break;
                  case "angularVelocity":
                    Body.setAngularVelocity(body, value);
                    break;
                  case "speed":
                    Body.setSpeed(body, value);
                    break;
                  case "angularSpeed":
                    Body.setAngularSpeed(body, value);
                    break;
                  case "parts":
                    Body.setParts(body, value);
                    break;
                  case "centre":
                    Body.setCentre(body, value);
                    break;
                  default:
                    body[property] = value;
                }
              }
            };
            Body.setStatic = function(body, isStatic) {
              for (var i = 0; i < body.parts.length; i++) {
                var part = body.parts[i];
                part.isStatic = isStatic;
                if (isStatic) {
                  part._original = {
                    restitution: part.restitution,
                    friction: part.friction,
                    mass: part.mass,
                    inertia: part.inertia,
                    density: part.density,
                    inverseMass: part.inverseMass,
                    inverseInertia: part.inverseInertia
                  };
                  part.restitution = 0;
                  part.friction = 1;
                  part.mass = part.inertia = part.density = Infinity;
                  part.inverseMass = part.inverseInertia = 0;
                  part.positionPrev.x = part.position.x;
                  part.positionPrev.y = part.position.y;
                  part.anglePrev = part.angle;
                  part.angularVelocity = 0;
                  part.speed = 0;
                  part.angularSpeed = 0;
                  part.motion = 0;
                } else if (part._original) {
                  part.restitution = part._original.restitution;
                  part.friction = part._original.friction;
                  part.mass = part._original.mass;
                  part.inertia = part._original.inertia;
                  part.density = part._original.density;
                  part.inverseMass = part._original.inverseMass;
                  part.inverseInertia = part._original.inverseInertia;
                  part._original = null;
                }
              }
            };
            Body.setMass = function(body, mass) {
              var moment = body.inertia / (body.mass / 6);
              body.inertia = moment * (mass / 6);
              body.inverseInertia = 1 / body.inertia;
              body.mass = mass;
              body.inverseMass = 1 / body.mass;
              body.density = body.mass / body.area;
            };
            Body.setDensity = function(body, density) {
              Body.setMass(body, density * body.area);
              body.density = density;
            };
            Body.setInertia = function(body, inertia) {
              body.inertia = inertia;
              body.inverseInertia = 1 / body.inertia;
            };
            Body.setVertices = function(body, vertices) {
              if (vertices[0].body === body) {
                body.vertices = vertices;
              } else {
                body.vertices = Vertices.create(vertices, body);
              }
              body.axes = Axes.fromVertices(body.vertices);
              body.area = Vertices.area(body.vertices);
              Body.setMass(body, body.density * body.area);
              var centre = Vertices.centre(body.vertices);
              Vertices.translate(body.vertices, centre, -1);
              Body.setInertia(body, Body._inertiaScale * Vertices.inertia(body.vertices, body.mass));
              Vertices.translate(body.vertices, body.position);
              Bounds.update(body.bounds, body.vertices, body.velocity);
            };
            Body.setParts = function(body, parts, autoHull) {
              var i;
              parts = parts.slice(0);
              body.parts.length = 0;
              body.parts.push(body);
              body.parent = body;
              for (i = 0; i < parts.length; i++) {
                var part = parts[i];
                if (part !== body) {
                  part.parent = body;
                  body.parts.push(part);
                }
              }
              if (body.parts.length === 1)
                return;
              autoHull = typeof autoHull !== "undefined" ? autoHull : true;
              if (autoHull) {
                var vertices = [];
                for (i = 0; i < parts.length; i++) {
                  vertices = vertices.concat(parts[i].vertices);
                }
                Vertices.clockwiseSort(vertices);
                var hull = Vertices.hull(vertices), hullCentre = Vertices.centre(hull);
                Body.setVertices(body, hull);
                Vertices.translate(body.vertices, hullCentre);
              }
              var total = Body._totalProperties(body);
              body.area = total.area;
              body.parent = body;
              body.position.x = total.centre.x;
              body.position.y = total.centre.y;
              body.positionPrev.x = total.centre.x;
              body.positionPrev.y = total.centre.y;
              Body.setMass(body, total.mass);
              Body.setInertia(body, total.inertia);
              Body.setPosition(body, total.centre);
            };
            Body.setCentre = function(body, centre, relative) {
              if (!relative) {
                body.positionPrev.x = centre.x - (body.position.x - body.positionPrev.x);
                body.positionPrev.y = centre.y - (body.position.y - body.positionPrev.y);
                body.position.x = centre.x;
                body.position.y = centre.y;
              } else {
                body.positionPrev.x += centre.x;
                body.positionPrev.y += centre.y;
                body.position.x += centre.x;
                body.position.y += centre.y;
              }
            };
            Body.setPosition = function(body, position, updateVelocity) {
              var delta = Vector.sub(position, body.position);
              if (updateVelocity) {
                body.positionPrev.x = body.position.x;
                body.positionPrev.y = body.position.y;
                body.velocity.x = delta.x;
                body.velocity.y = delta.y;
                body.speed = Vector.magnitude(delta);
              } else {
                body.positionPrev.x += delta.x;
                body.positionPrev.y += delta.y;
              }
              for (var i = 0; i < body.parts.length; i++) {
                var part = body.parts[i];
                part.position.x += delta.x;
                part.position.y += delta.y;
                Vertices.translate(part.vertices, delta);
                Bounds.update(part.bounds, part.vertices, body.velocity);
              }
            };
            Body.setAngle = function(body, angle, updateVelocity) {
              var delta = angle - body.angle;
              if (updateVelocity) {
                body.anglePrev = body.angle;
                body.angularVelocity = delta;
                body.angularSpeed = Math.abs(delta);
              } else {
                body.anglePrev += delta;
              }
              for (var i = 0; i < body.parts.length; i++) {
                var part = body.parts[i];
                part.angle += delta;
                Vertices.rotate(part.vertices, delta, body.position);
                Axes.rotate(part.axes, delta);
                Bounds.update(part.bounds, part.vertices, body.velocity);
                if (i > 0) {
                  Vector.rotateAbout(part.position, delta, body.position, part.position);
                }
              }
            };
            Body.setVelocity = function(body, velocity) {
              var timeScale = body.deltaTime / Body._baseDelta;
              body.positionPrev.x = body.position.x - velocity.x * timeScale;
              body.positionPrev.y = body.position.y - velocity.y * timeScale;
              body.velocity.x = (body.position.x - body.positionPrev.x) / timeScale;
              body.velocity.y = (body.position.y - body.positionPrev.y) / timeScale;
              body.speed = Vector.magnitude(body.velocity);
            };
            Body.getVelocity = function(body) {
              var timeScale = Body._baseDelta / body.deltaTime;
              return {
                x: (body.position.x - body.positionPrev.x) * timeScale,
                y: (body.position.y - body.positionPrev.y) * timeScale
              };
            };
            Body.getSpeed = function(body) {
              return Vector.magnitude(Body.getVelocity(body));
            };
            Body.setSpeed = function(body, speed) {
              Body.setVelocity(body, Vector.mult(Vector.normalise(Body.getVelocity(body)), speed));
            };
            Body.setAngularVelocity = function(body, velocity) {
              var timeScale = body.deltaTime / Body._baseDelta;
              body.anglePrev = body.angle - velocity * timeScale;
              body.angularVelocity = (body.angle - body.anglePrev) / timeScale;
              body.angularSpeed = Math.abs(body.angularVelocity);
            };
            Body.getAngularVelocity = function(body) {
              return (body.angle - body.anglePrev) * Body._baseDelta / body.deltaTime;
            };
            Body.getAngularSpeed = function(body) {
              return Math.abs(Body.getAngularVelocity(body));
            };
            Body.setAngularSpeed = function(body, speed) {
              Body.setAngularVelocity(body, Common.sign(Body.getAngularVelocity(body)) * speed);
            };
            Body.translate = function(body, translation2, updateVelocity) {
              Body.setPosition(body, Vector.add(body.position, translation2), updateVelocity);
            };
            Body.rotate = function(body, rotation2, point, updateVelocity) {
              if (!point) {
                Body.setAngle(body, body.angle + rotation2, updateVelocity);
              } else {
                var cos = Math.cos(rotation2), sin = Math.sin(rotation2), dx = body.position.x - point.x, dy = body.position.y - point.y;
                Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
                }, updateVelocity);
                Body.setAngle(body, body.angle + rotation2, updateVelocity);
              }
            };
            Body.scale = function(body, scaleX, scaleY, point) {
              var totalArea = 0, totalInertia = 0;
              point = point || body.position;
              for (var i = 0; i < body.parts.length; i++) {
                var part = body.parts[i];
                Vertices.scale(part.vertices, scaleX, scaleY, point);
                part.axes = Axes.fromVertices(part.vertices);
                part.area = Vertices.area(part.vertices);
                Body.setMass(part, body.density * part.area);
                Vertices.translate(part.vertices, { x: -part.position.x, y: -part.position.y });
                Body.setInertia(part, Body._inertiaScale * Vertices.inertia(part.vertices, part.mass));
                Vertices.translate(part.vertices, { x: part.position.x, y: part.position.y });
                if (i > 0) {
                  totalArea += part.area;
                  totalInertia += part.inertia;
                }
                part.position.x = point.x + (part.position.x - point.x) * scaleX;
                part.position.y = point.y + (part.position.y - point.y) * scaleY;
                Bounds.update(part.bounds, part.vertices, body.velocity);
              }
              if (body.parts.length > 1) {
                body.area = totalArea;
                if (!body.isStatic) {
                  Body.setMass(body, body.density * totalArea);
                  Body.setInertia(body, totalInertia);
                }
              }
              if (body.circleRadius) {
                if (scaleX === scaleY) {
                  body.circleRadius *= scaleX;
                } else {
                  body.circleRadius = null;
                }
              }
            };
            Body.update = function(body, deltaTime) {
              deltaTime = (typeof deltaTime !== "undefined" ? deltaTime : 1e3 / 60) * body.timeScale;
              var deltaTimeSquared = deltaTime * deltaTime, correction = Body._timeCorrection ? deltaTime / (body.deltaTime || deltaTime) : 1;
              var frictionAir = 1 - body.frictionAir * (deltaTime / Common._baseDelta), velocityPrevX = (body.position.x - body.positionPrev.x) * correction, velocityPrevY = (body.position.y - body.positionPrev.y) * correction;
              body.velocity.x = velocityPrevX * frictionAir + body.force.x / body.mass * deltaTimeSquared;
              body.velocity.y = velocityPrevY * frictionAir + body.force.y / body.mass * deltaTimeSquared;
              body.positionPrev.x = body.position.x;
              body.positionPrev.y = body.position.y;
              body.position.x += body.velocity.x;
              body.position.y += body.velocity.y;
              body.deltaTime = deltaTime;
              body.angularVelocity = (body.angle - body.anglePrev) * frictionAir * correction + body.torque / body.inertia * deltaTimeSquared;
              body.anglePrev = body.angle;
              body.angle += body.angularVelocity;
              for (var i = 0; i < body.parts.length; i++) {
                var part = body.parts[i];
                Vertices.translate(part.vertices, body.velocity);
                if (i > 0) {
                  part.position.x += body.velocity.x;
                  part.position.y += body.velocity.y;
                }
                if (body.angularVelocity !== 0) {
                  Vertices.rotate(part.vertices, body.angularVelocity, body.position);
                  Axes.rotate(part.axes, body.angularVelocity);
                  if (i > 0) {
                    Vector.rotateAbout(part.position, body.angularVelocity, body.position, part.position);
                  }
                }
                Bounds.update(part.bounds, part.vertices, body.velocity);
              }
            };
            Body.updateVelocities = function(body) {
              var timeScale = Body._baseDelta / body.deltaTime, bodyVelocity = body.velocity;
              bodyVelocity.x = (body.position.x - body.positionPrev.x) * timeScale;
              bodyVelocity.y = (body.position.y - body.positionPrev.y) * timeScale;
              body.speed = Math.sqrt(bodyVelocity.x * bodyVelocity.x + bodyVelocity.y * bodyVelocity.y);
              body.angularVelocity = (body.angle - body.anglePrev) * timeScale;
              body.angularSpeed = Math.abs(body.angularVelocity);
            };
            Body.applyForce = function(body, position, force) {
              var offset = { x: position.x - body.position.x, y: position.y - body.position.y };
              body.force.x += force.x;
              body.force.y += force.y;
              body.torque += offset.x * force.y - offset.y * force.x;
            };
            Body._totalProperties = function(body) {
              var properties = {
                mass: 0,
                area: 0,
                inertia: 0,
                centre: { x: 0, y: 0 }
              };
              for (var i = body.parts.length === 1 ? 0 : 1; i < body.parts.length; i++) {
                var part = body.parts[i], mass = part.mass !== Infinity ? part.mass : 1;
                properties.mass += mass;
                properties.area += part.area;
                properties.inertia += part.inertia;
                properties.centre = Vector.add(properties.centre, Vector.mult(part.position, mass));
              }
              properties.centre = Vector.div(properties.centre, properties.mass);
              return properties;
            };
          })();
        },
        /* 5 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Events = {};
          module2.exports = Events;
          var Common = __webpack_require__(0);
          (function() {
            Events.on = function(object, eventNames, callback) {
              var names = eventNames.split(" "), name;
              for (var i = 0; i < names.length; i++) {
                name = names[i];
                object.events = object.events || {};
                object.events[name] = object.events[name] || [];
                object.events[name].push(callback);
              }
              return callback;
            };
            Events.off = function(object, eventNames, callback) {
              if (!eventNames) {
                object.events = {};
                return;
              }
              if (typeof eventNames === "function") {
                callback = eventNames;
                eventNames = Common.keys(object.events).join(" ");
              }
              var names = eventNames.split(" ");
              for (var i = 0; i < names.length; i++) {
                var callbacks = object.events[names[i]], newCallbacks = [];
                if (callback && callbacks) {
                  for (var j = 0; j < callbacks.length; j++) {
                    if (callbacks[j] !== callback)
                      newCallbacks.push(callbacks[j]);
                  }
                }
                object.events[names[i]] = newCallbacks;
              }
            };
            Events.trigger = function(object, eventNames, event) {
              var names, name, callbacks, eventClone;
              var events = object.events;
              if (events && Common.keys(events).length > 0) {
                if (!event)
                  event = {};
                names = eventNames.split(" ");
                for (var i = 0; i < names.length; i++) {
                  name = names[i];
                  callbacks = events[name];
                  if (callbacks) {
                    eventClone = Common.clone(event, false);
                    eventClone.name = name;
                    eventClone.source = object;
                    for (var j = 0; j < callbacks.length; j++) {
                      callbacks[j].apply(object, [eventClone]);
                    }
                  }
                }
              }
            };
          })();
        },
        /* 6 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Composite = {};
          module2.exports = Composite;
          var Events = __webpack_require__(5);
          var Common = __webpack_require__(0);
          var Bounds = __webpack_require__(1);
          var Body = __webpack_require__(4);
          (function() {
            Composite.create = function(options) {
              return Common.extend({
                id: Common.nextId(),
                type: "composite",
                parent: null,
                isModified: false,
                bodies: [],
                constraints: [],
                composites: [],
                label: "Composite",
                plugin: {},
                cache: {
                  allBodies: null,
                  allConstraints: null,
                  allComposites: null
                }
              }, options);
            };
            Composite.setModified = function(composite, isModified, updateParents, updateChildren) {
              composite.isModified = isModified;
              if (isModified && composite.cache) {
                composite.cache.allBodies = null;
                composite.cache.allConstraints = null;
                composite.cache.allComposites = null;
              }
              if (updateParents && composite.parent) {
                Composite.setModified(composite.parent, isModified, updateParents, updateChildren);
              }
              if (updateChildren) {
                for (var i = 0; i < composite.composites.length; i++) {
                  var childComposite = composite.composites[i];
                  Composite.setModified(childComposite, isModified, updateParents, updateChildren);
                }
              }
            };
            Composite.add = function(composite, object) {
              var objects = [].concat(object);
              Events.trigger(composite, "beforeAdd", { object });
              for (var i = 0; i < objects.length; i++) {
                var obj = objects[i];
                switch (obj.type) {
                  case "body":
                    if (obj.parent !== obj) {
                      Common.warn("Composite.add: skipped adding a compound body part (you must add its parent instead)");
                      break;
                    }
                    Composite.addBody(composite, obj);
                    break;
                  case "constraint":
                    Composite.addConstraint(composite, obj);
                    break;
                  case "composite":
                    Composite.addComposite(composite, obj);
                    break;
                  case "mouseConstraint":
                    Composite.addConstraint(composite, obj.constraint);
                    break;
                }
              }
              Events.trigger(composite, "afterAdd", { object });
              return composite;
            };
            Composite.remove = function(composite, object, deep) {
              var objects = [].concat(object);
              Events.trigger(composite, "beforeRemove", { object });
              for (var i = 0; i < objects.length; i++) {
                var obj = objects[i];
                switch (obj.type) {
                  case "body":
                    Composite.removeBody(composite, obj, deep);
                    break;
                  case "constraint":
                    Composite.removeConstraint(composite, obj, deep);
                    break;
                  case "composite":
                    Composite.removeComposite(composite, obj, deep);
                    break;
                  case "mouseConstraint":
                    Composite.removeConstraint(composite, obj.constraint);
                    break;
                }
              }
              Events.trigger(composite, "afterRemove", { object });
              return composite;
            };
            Composite.addComposite = function(compositeA, compositeB) {
              compositeA.composites.push(compositeB);
              compositeB.parent = compositeA;
              Composite.setModified(compositeA, true, true, false);
              return compositeA;
            };
            Composite.removeComposite = function(compositeA, compositeB, deep) {
              var position = Common.indexOf(compositeA.composites, compositeB);
              if (position !== -1) {
                Composite.removeCompositeAt(compositeA, position);
              }
              if (deep) {
                for (var i = 0; i < compositeA.composites.length; i++) {
                  Composite.removeComposite(compositeA.composites[i], compositeB, true);
                }
              }
              return compositeA;
            };
            Composite.removeCompositeAt = function(composite, position) {
              composite.composites.splice(position, 1);
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.addBody = function(composite, body) {
              composite.bodies.push(body);
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.removeBody = function(composite, body, deep) {
              var position = Common.indexOf(composite.bodies, body);
              if (position !== -1) {
                Composite.removeBodyAt(composite, position);
              }
              if (deep) {
                for (var i = 0; i < composite.composites.length; i++) {
                  Composite.removeBody(composite.composites[i], body, true);
                }
              }
              return composite;
            };
            Composite.removeBodyAt = function(composite, position) {
              composite.bodies.splice(position, 1);
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.addConstraint = function(composite, constraint) {
              composite.constraints.push(constraint);
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.removeConstraint = function(composite, constraint, deep) {
              var position = Common.indexOf(composite.constraints, constraint);
              if (position !== -1) {
                Composite.removeConstraintAt(composite, position);
              }
              if (deep) {
                for (var i = 0; i < composite.composites.length; i++) {
                  Composite.removeConstraint(composite.composites[i], constraint, true);
                }
              }
              return composite;
            };
            Composite.removeConstraintAt = function(composite, position) {
              composite.constraints.splice(position, 1);
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.clear = function(composite, keepStatic, deep) {
              if (deep) {
                for (var i = 0; i < composite.composites.length; i++) {
                  Composite.clear(composite.composites[i], keepStatic, true);
                }
              }
              if (keepStatic) {
                composite.bodies = composite.bodies.filter(function(body) {
                  return body.isStatic;
                });
              } else {
                composite.bodies.length = 0;
              }
              composite.constraints.length = 0;
              composite.composites.length = 0;
              Composite.setModified(composite, true, true, false);
              return composite;
            };
            Composite.allBodies = function(composite) {
              if (composite.cache && composite.cache.allBodies) {
                return composite.cache.allBodies;
              }
              var bodies = [].concat(composite.bodies);
              for (var i = 0; i < composite.composites.length; i++)
                bodies = bodies.concat(Composite.allBodies(composite.composites[i]));
              if (composite.cache) {
                composite.cache.allBodies = bodies;
              }
              return bodies;
            };
            Composite.allConstraints = function(composite) {
              if (composite.cache && composite.cache.allConstraints) {
                return composite.cache.allConstraints;
              }
              var constraints = [].concat(composite.constraints);
              for (var i = 0; i < composite.composites.length; i++)
                constraints = constraints.concat(Composite.allConstraints(composite.composites[i]));
              if (composite.cache) {
                composite.cache.allConstraints = constraints;
              }
              return constraints;
            };
            Composite.allComposites = function(composite) {
              if (composite.cache && composite.cache.allComposites) {
                return composite.cache.allComposites;
              }
              var composites = [].concat(composite.composites);
              for (var i = 0; i < composite.composites.length; i++)
                composites = composites.concat(Composite.allComposites(composite.composites[i]));
              if (composite.cache) {
                composite.cache.allComposites = composites;
              }
              return composites;
            };
            Composite.get = function(composite, id, type) {
              var objects, object;
              switch (type) {
                case "body":
                  objects = Composite.allBodies(composite);
                  break;
                case "constraint":
                  objects = Composite.allConstraints(composite);
                  break;
                case "composite":
                  objects = Composite.allComposites(composite).concat(composite);
                  break;
              }
              if (!objects)
                return null;
              object = objects.filter(function(object2) {
                return object2.id.toString() === id.toString();
              });
              return object.length === 0 ? null : object[0];
            };
            Composite.move = function(compositeA, objects, compositeB) {
              Composite.remove(compositeA, objects);
              Composite.add(compositeB, objects);
              return compositeA;
            };
            Composite.rebase = function(composite) {
              var objects = Composite.allBodies(composite).concat(Composite.allConstraints(composite)).concat(Composite.allComposites(composite));
              for (var i = 0; i < objects.length; i++) {
                objects[i].id = Common.nextId();
              }
              return composite;
            };
            Composite.translate = function(composite, translation2, recursive) {
              var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;
              for (var i = 0; i < bodies.length; i++) {
                Body.translate(bodies[i], translation2);
              }
              return composite;
            };
            Composite.rotate = function(composite, rotation2, point, recursive) {
              var cos = Math.cos(rotation2), sin = Math.sin(rotation2), bodies = recursive ? Composite.allBodies(composite) : composite.bodies;
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], dx = body.position.x - point.x, dy = body.position.y - point.y;
                Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
                });
                Body.rotate(body, rotation2);
              }
              return composite;
            };
            Composite.scale = function(composite, scaleX, scaleY, point, recursive) {
              var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], dx = body.position.x - point.x, dy = body.position.y - point.y;
                Body.setPosition(body, {
                  x: point.x + dx * scaleX,
                  y: point.y + dy * scaleY
                });
                Body.scale(body, scaleX, scaleY);
              }
              return composite;
            };
            Composite.bounds = function(composite) {
              var bodies = Composite.allBodies(composite), vertices = [];
              for (var i = 0; i < bodies.length; i += 1) {
                var body = bodies[i];
                vertices.push(body.bounds.min, body.bounds.max);
              }
              return Bounds.create(vertices);
            };
          })();
        },
        /* 7 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Sleeping = {};
          module2.exports = Sleeping;
          var Body = __webpack_require__(4);
          var Events = __webpack_require__(5);
          var Common = __webpack_require__(0);
          (function() {
            Sleeping._motionWakeThreshold = 0.18;
            Sleeping._motionSleepThreshold = 0.08;
            Sleeping._minBias = 0.9;
            Sleeping.update = function(bodies, delta) {
              var timeScale = delta / Common._baseDelta, motionSleepThreshold = Sleeping._motionSleepThreshold;
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], speed = Body.getSpeed(body), angularSpeed = Body.getAngularSpeed(body), motion = speed * speed + angularSpeed * angularSpeed;
                if (body.force.x !== 0 || body.force.y !== 0) {
                  Sleeping.set(body, false);
                  continue;
                }
                var minMotion = Math.min(body.motion, motion), maxMotion = Math.max(body.motion, motion);
                body.motion = Sleeping._minBias * minMotion + (1 - Sleeping._minBias) * maxMotion;
                if (body.sleepThreshold > 0 && body.motion < motionSleepThreshold) {
                  body.sleepCounter += 1;
                  if (body.sleepCounter >= body.sleepThreshold / timeScale) {
                    Sleeping.set(body, true);
                  }
                } else if (body.sleepCounter > 0) {
                  body.sleepCounter -= 1;
                }
              }
            };
            Sleeping.afterCollisions = function(pairs) {
              var motionSleepThreshold = Sleeping._motionSleepThreshold;
              for (var i = 0; i < pairs.length; i++) {
                var pair = pairs[i];
                if (!pair.isActive)
                  continue;
                var collision = pair.collision, bodyA = collision.bodyA.parent, bodyB = collision.bodyB.parent;
                if (bodyA.isSleeping && bodyB.isSleeping || bodyA.isStatic || bodyB.isStatic)
                  continue;
                if (bodyA.isSleeping || bodyB.isSleeping) {
                  var sleepingBody = bodyA.isSleeping && !bodyA.isStatic ? bodyA : bodyB, movingBody = sleepingBody === bodyA ? bodyB : bodyA;
                  if (!sleepingBody.isStatic && movingBody.motion > motionSleepThreshold) {
                    Sleeping.set(sleepingBody, false);
                  }
                }
              }
            };
            Sleeping.set = function(body, isSleeping) {
              var wasSleeping = body.isSleeping;
              if (isSleeping) {
                body.isSleeping = true;
                body.sleepCounter = body.sleepThreshold;
                body.positionImpulse.x = 0;
                body.positionImpulse.y = 0;
                body.positionPrev.x = body.position.x;
                body.positionPrev.y = body.position.y;
                body.anglePrev = body.angle;
                body.speed = 0;
                body.angularSpeed = 0;
                body.motion = 0;
                if (!wasSleeping) {
                  Events.trigger(body, "sleepStart");
                }
              } else {
                body.isSleeping = false;
                body.sleepCounter = 0;
                if (wasSleeping) {
                  Events.trigger(body, "sleepEnd");
                }
              }
            };
          })();
        },
        /* 8 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Collision = {};
          module2.exports = Collision;
          var Vertices = __webpack_require__(3);
          var Pair = __webpack_require__(9);
          (function() {
            var _supports = [];
            var _overlapAB = {
              overlap: 0,
              axis: null
            };
            var _overlapBA = {
              overlap: 0,
              axis: null
            };
            Collision.create = function(bodyA, bodyB) {
              return {
                pair: null,
                collided: false,
                bodyA,
                bodyB,
                parentA: bodyA.parent,
                parentB: bodyB.parent,
                depth: 0,
                normal: { x: 0, y: 0 },
                tangent: { x: 0, y: 0 },
                penetration: { x: 0, y: 0 },
                supports: []
              };
            };
            Collision.collides = function(bodyA, bodyB, pairs) {
              Collision._overlapAxes(_overlapAB, bodyA.vertices, bodyB.vertices, bodyA.axes);
              if (_overlapAB.overlap <= 0) {
                return null;
              }
              Collision._overlapAxes(_overlapBA, bodyB.vertices, bodyA.vertices, bodyB.axes);
              if (_overlapBA.overlap <= 0) {
                return null;
              }
              var pair = pairs && pairs.table[Pair.id(bodyA, bodyB)], collision;
              if (!pair) {
                collision = Collision.create(bodyA, bodyB);
                collision.collided = true;
                collision.bodyA = bodyA.id < bodyB.id ? bodyA : bodyB;
                collision.bodyB = bodyA.id < bodyB.id ? bodyB : bodyA;
                collision.parentA = collision.bodyA.parent;
                collision.parentB = collision.bodyB.parent;
              } else {
                collision = pair.collision;
              }
              bodyA = collision.bodyA;
              bodyB = collision.bodyB;
              var minOverlap;
              if (_overlapAB.overlap < _overlapBA.overlap) {
                minOverlap = _overlapAB;
              } else {
                minOverlap = _overlapBA;
              }
              var normal = collision.normal, supports = collision.supports, minAxis = minOverlap.axis, minAxisX = minAxis.x, minAxisY = minAxis.y;
              if (minAxisX * (bodyB.position.x - bodyA.position.x) + minAxisY * (bodyB.position.y - bodyA.position.y) < 0) {
                normal.x = minAxisX;
                normal.y = minAxisY;
              } else {
                normal.x = -minAxisX;
                normal.y = -minAxisY;
              }
              collision.tangent.x = -normal.y;
              collision.tangent.y = normal.x;
              collision.depth = minOverlap.overlap;
              collision.penetration.x = normal.x * collision.depth;
              collision.penetration.y = normal.y * collision.depth;
              var supportsB = Collision._findSupports(bodyA, bodyB, normal, 1), supportCount = 0;
              if (Vertices.contains(bodyA.vertices, supportsB[0])) {
                supports[supportCount++] = supportsB[0];
              }
              if (Vertices.contains(bodyA.vertices, supportsB[1])) {
                supports[supportCount++] = supportsB[1];
              }
              if (supportCount < 2) {
                var supportsA = Collision._findSupports(bodyB, bodyA, normal, -1);
                if (Vertices.contains(bodyB.vertices, supportsA[0])) {
                  supports[supportCount++] = supportsA[0];
                }
                if (supportCount < 2 && Vertices.contains(bodyB.vertices, supportsA[1])) {
                  supports[supportCount++] = supportsA[1];
                }
              }
              if (supportCount === 0) {
                supports[supportCount++] = supportsB[0];
              }
              supports.length = supportCount;
              return collision;
            };
            Collision._overlapAxes = function(result, verticesA, verticesB, axes) {
              var verticesALength = verticesA.length, verticesBLength = verticesB.length, verticesAX = verticesA[0].x, verticesAY = verticesA[0].y, verticesBX = verticesB[0].x, verticesBY = verticesB[0].y, axesLength = axes.length, overlapMin = Number.MAX_VALUE, overlapAxisNumber = 0, overlap, overlapAB, overlapBA, dot, i, j;
              for (i = 0; i < axesLength; i++) {
                var axis = axes[i], axisX = axis.x, axisY = axis.y, minA = verticesAX * axisX + verticesAY * axisY, minB = verticesBX * axisX + verticesBY * axisY, maxA = minA, maxB = minB;
                for (j = 1; j < verticesALength; j += 1) {
                  dot = verticesA[j].x * axisX + verticesA[j].y * axisY;
                  if (dot > maxA) {
                    maxA = dot;
                  } else if (dot < minA) {
                    minA = dot;
                  }
                }
                for (j = 1; j < verticesBLength; j += 1) {
                  dot = verticesB[j].x * axisX + verticesB[j].y * axisY;
                  if (dot > maxB) {
                    maxB = dot;
                  } else if (dot < minB) {
                    minB = dot;
                  }
                }
                overlapAB = maxA - minB;
                overlapBA = maxB - minA;
                overlap = overlapAB < overlapBA ? overlapAB : overlapBA;
                if (overlap < overlapMin) {
                  overlapMin = overlap;
                  overlapAxisNumber = i;
                  if (overlap <= 0) {
                    break;
                  }
                }
              }
              result.axis = axes[overlapAxisNumber];
              result.overlap = overlapMin;
            };
            Collision._projectToAxis = function(projection, vertices, axis) {
              var min = vertices[0].x * axis.x + vertices[0].y * axis.y, max = min;
              for (var i = 1; i < vertices.length; i += 1) {
                var dot = vertices[i].x * axis.x + vertices[i].y * axis.y;
                if (dot > max) {
                  max = dot;
                } else if (dot < min) {
                  min = dot;
                }
              }
              projection.min = min;
              projection.max = max;
            };
            Collision._findSupports = function(bodyA, bodyB, normal, direction) {
              var vertices = bodyB.vertices, verticesLength = vertices.length, bodyAPositionX = bodyA.position.x, bodyAPositionY = bodyA.position.y, normalX = normal.x * direction, normalY = normal.y * direction, nearestDistance = Number.MAX_VALUE, vertexA, vertexB, vertexC, distance, j;
              for (j = 0; j < verticesLength; j += 1) {
                vertexB = vertices[j];
                distance = normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y);
                if (distance < nearestDistance) {
                  nearestDistance = distance;
                  vertexA = vertexB;
                }
              }
              vertexC = vertices[(verticesLength + vertexA.index - 1) % verticesLength];
              nearestDistance = normalX * (bodyAPositionX - vertexC.x) + normalY * (bodyAPositionY - vertexC.y);
              vertexB = vertices[(vertexA.index + 1) % verticesLength];
              if (normalX * (bodyAPositionX - vertexB.x) + normalY * (bodyAPositionY - vertexB.y) < nearestDistance) {
                _supports[0] = vertexA;
                _supports[1] = vertexB;
                return _supports;
              }
              _supports[0] = vertexA;
              _supports[1] = vertexC;
              return _supports;
            };
          })();
        },
        /* 9 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Pair = {};
          module2.exports = Pair;
          var Contact = __webpack_require__(16);
          (function() {
            Pair.create = function(collision, timestamp) {
              var bodyA = collision.bodyA, bodyB = collision.bodyB;
              var pair = {
                id: Pair.id(bodyA, bodyB),
                bodyA,
                bodyB,
                collision,
                contacts: [],
                activeContacts: [],
                separation: 0,
                isActive: true,
                confirmedActive: true,
                isSensor: bodyA.isSensor || bodyB.isSensor,
                timeCreated: timestamp,
                timeUpdated: timestamp,
                inverseMass: 0,
                friction: 0,
                frictionStatic: 0,
                restitution: 0,
                slop: 0
              };
              Pair.update(pair, collision, timestamp);
              return pair;
            };
            Pair.update = function(pair, collision, timestamp) {
              var contacts = pair.contacts, supports = collision.supports, activeContacts = pair.activeContacts, parentA = collision.parentA, parentB = collision.parentB, parentAVerticesLength = parentA.vertices.length;
              pair.isActive = true;
              pair.timeUpdated = timestamp;
              pair.collision = collision;
              pair.separation = collision.depth;
              pair.inverseMass = parentA.inverseMass + parentB.inverseMass;
              pair.friction = parentA.friction < parentB.friction ? parentA.friction : parentB.friction;
              pair.frictionStatic = parentA.frictionStatic > parentB.frictionStatic ? parentA.frictionStatic : parentB.frictionStatic;
              pair.restitution = parentA.restitution > parentB.restitution ? parentA.restitution : parentB.restitution;
              pair.slop = parentA.slop > parentB.slop ? parentA.slop : parentB.slop;
              collision.pair = pair;
              activeContacts.length = 0;
              for (var i = 0; i < supports.length; i++) {
                var support = supports[i], contactId = support.body === parentA ? support.index : parentAVerticesLength + support.index, contact = contacts[contactId];
                if (contact) {
                  activeContacts.push(contact);
                } else {
                  activeContacts.push(contacts[contactId] = Contact.create(support));
                }
              }
            };
            Pair.setActive = function(pair, isActive, timestamp) {
              if (isActive) {
                pair.isActive = true;
                pair.timeUpdated = timestamp;
              } else {
                pair.isActive = false;
                pair.activeContacts.length = 0;
              }
            };
            Pair.id = function(bodyA, bodyB) {
              if (bodyA.id < bodyB.id) {
                return "A" + bodyA.id + "B" + bodyB.id;
              } else {
                return "A" + bodyB.id + "B" + bodyA.id;
              }
            };
          })();
        },
        /* 10 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Constraint = {};
          module2.exports = Constraint;
          var Vertices = __webpack_require__(3);
          var Vector = __webpack_require__(2);
          var Sleeping = __webpack_require__(7);
          var Bounds = __webpack_require__(1);
          var Axes = __webpack_require__(11);
          var Common = __webpack_require__(0);
          (function() {
            Constraint._warming = 0.4;
            Constraint._torqueDampen = 1;
            Constraint._minLength = 1e-6;
            Constraint.create = function(options) {
              var constraint = options;
              if (constraint.bodyA && !constraint.pointA)
                constraint.pointA = { x: 0, y: 0 };
              if (constraint.bodyB && !constraint.pointB)
                constraint.pointB = { x: 0, y: 0 };
              var initialPointA = constraint.bodyA ? Vector.add(constraint.bodyA.position, constraint.pointA) : constraint.pointA, initialPointB = constraint.bodyB ? Vector.add(constraint.bodyB.position, constraint.pointB) : constraint.pointB, length = Vector.magnitude(Vector.sub(initialPointA, initialPointB));
              constraint.length = typeof constraint.length !== "undefined" ? constraint.length : length;
              constraint.id = constraint.id || Common.nextId();
              constraint.label = constraint.label || "Constraint";
              constraint.type = "constraint";
              constraint.stiffness = constraint.stiffness || (constraint.length > 0 ? 1 : 0.7);
              constraint.damping = constraint.damping || 0;
              constraint.angularStiffness = constraint.angularStiffness || 0;
              constraint.angleA = constraint.bodyA ? constraint.bodyA.angle : constraint.angleA;
              constraint.angleB = constraint.bodyB ? constraint.bodyB.angle : constraint.angleB;
              constraint.plugin = {};
              var render = {
                visible: true,
                lineWidth: 2,
                strokeStyle: "#ffffff",
                type: "line",
                anchors: true
              };
              if (constraint.length === 0 && constraint.stiffness > 0.1) {
                render.type = "pin";
                render.anchors = false;
              } else if (constraint.stiffness < 0.9) {
                render.type = "spring";
              }
              constraint.render = Common.extend(render, constraint.render);
              return constraint;
            };
            Constraint.preSolveAll = function(bodies) {
              for (var i = 0; i < bodies.length; i += 1) {
                var body = bodies[i], impulse = body.constraintImpulse;
                if (body.isStatic || impulse.x === 0 && impulse.y === 0 && impulse.angle === 0) {
                  continue;
                }
                body.position.x += impulse.x;
                body.position.y += impulse.y;
                body.angle += impulse.angle;
              }
            };
            Constraint.solveAll = function(constraints, delta) {
              var timeScale = Common.clamp(delta / Common._baseDelta, 0, 1);
              for (var i = 0; i < constraints.length; i += 1) {
                var constraint = constraints[i], fixedA = !constraint.bodyA || constraint.bodyA && constraint.bodyA.isStatic, fixedB = !constraint.bodyB || constraint.bodyB && constraint.bodyB.isStatic;
                if (fixedA || fixedB) {
                  Constraint.solve(constraints[i], timeScale);
                }
              }
              for (i = 0; i < constraints.length; i += 1) {
                constraint = constraints[i];
                fixedA = !constraint.bodyA || constraint.bodyA && constraint.bodyA.isStatic;
                fixedB = !constraint.bodyB || constraint.bodyB && constraint.bodyB.isStatic;
                if (!fixedA && !fixedB) {
                  Constraint.solve(constraints[i], timeScale);
                }
              }
            };
            Constraint.solve = function(constraint, timeScale) {
              var bodyA = constraint.bodyA, bodyB = constraint.bodyB, pointA = constraint.pointA, pointB = constraint.pointB;
              if (!bodyA && !bodyB)
                return;
              if (bodyA && !bodyA.isStatic) {
                Vector.rotate(pointA, bodyA.angle - constraint.angleA, pointA);
                constraint.angleA = bodyA.angle;
              }
              if (bodyB && !bodyB.isStatic) {
                Vector.rotate(pointB, bodyB.angle - constraint.angleB, pointB);
                constraint.angleB = bodyB.angle;
              }
              var pointAWorld = pointA, pointBWorld = pointB;
              if (bodyA) pointAWorld = Vector.add(bodyA.position, pointA);
              if (bodyB) pointBWorld = Vector.add(bodyB.position, pointB);
              if (!pointAWorld || !pointBWorld)
                return;
              var delta = Vector.sub(pointAWorld, pointBWorld), currentLength = Vector.magnitude(delta);
              if (currentLength < Constraint._minLength) {
                currentLength = Constraint._minLength;
              }
              var difference = (currentLength - constraint.length) / currentLength, isRigid = constraint.stiffness >= 1 || constraint.length === 0, stiffness = isRigid ? constraint.stiffness * timeScale : constraint.stiffness * timeScale * timeScale, damping = constraint.damping * timeScale, force = Vector.mult(delta, difference * stiffness), massTotal = (bodyA ? bodyA.inverseMass : 0) + (bodyB ? bodyB.inverseMass : 0), inertiaTotal = (bodyA ? bodyA.inverseInertia : 0) + (bodyB ? bodyB.inverseInertia : 0), resistanceTotal = massTotal + inertiaTotal, torque, share, normal, normalVelocity, relativeVelocity;
              if (damping > 0) {
                var zero = Vector.create();
                normal = Vector.div(delta, currentLength);
                relativeVelocity = Vector.sub(
                  bodyB && Vector.sub(bodyB.position, bodyB.positionPrev) || zero,
                  bodyA && Vector.sub(bodyA.position, bodyA.positionPrev) || zero
                );
                normalVelocity = Vector.dot(normal, relativeVelocity);
              }
              if (bodyA && !bodyA.isStatic) {
                share = bodyA.inverseMass / massTotal;
                bodyA.constraintImpulse.x -= force.x * share;
                bodyA.constraintImpulse.y -= force.y * share;
                bodyA.position.x -= force.x * share;
                bodyA.position.y -= force.y * share;
                if (damping > 0) {
                  bodyA.positionPrev.x -= damping * normal.x * normalVelocity * share;
                  bodyA.positionPrev.y -= damping * normal.y * normalVelocity * share;
                }
                torque = Vector.cross(pointA, force) / resistanceTotal * Constraint._torqueDampen * bodyA.inverseInertia * (1 - constraint.angularStiffness);
                bodyA.constraintImpulse.angle -= torque;
                bodyA.angle -= torque;
              }
              if (bodyB && !bodyB.isStatic) {
                share = bodyB.inverseMass / massTotal;
                bodyB.constraintImpulse.x += force.x * share;
                bodyB.constraintImpulse.y += force.y * share;
                bodyB.position.x += force.x * share;
                bodyB.position.y += force.y * share;
                if (damping > 0) {
                  bodyB.positionPrev.x += damping * normal.x * normalVelocity * share;
                  bodyB.positionPrev.y += damping * normal.y * normalVelocity * share;
                }
                torque = Vector.cross(pointB, force) / resistanceTotal * Constraint._torqueDampen * bodyB.inverseInertia * (1 - constraint.angularStiffness);
                bodyB.constraintImpulse.angle += torque;
                bodyB.angle += torque;
              }
            };
            Constraint.postSolveAll = function(bodies) {
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], impulse = body.constraintImpulse;
                if (body.isStatic || impulse.x === 0 && impulse.y === 0 && impulse.angle === 0) {
                  continue;
                }
                Sleeping.set(body, false);
                for (var j = 0; j < body.parts.length; j++) {
                  var part = body.parts[j];
                  Vertices.translate(part.vertices, impulse);
                  if (j > 0) {
                    part.position.x += impulse.x;
                    part.position.y += impulse.y;
                  }
                  if (impulse.angle !== 0) {
                    Vertices.rotate(part.vertices, impulse.angle, body.position);
                    Axes.rotate(part.axes, impulse.angle);
                    if (j > 0) {
                      Vector.rotateAbout(part.position, impulse.angle, body.position, part.position);
                    }
                  }
                  Bounds.update(part.bounds, part.vertices, body.velocity);
                }
                impulse.angle *= Constraint._warming;
                impulse.x *= Constraint._warming;
                impulse.y *= Constraint._warming;
              }
            };
            Constraint.pointAWorld = function(constraint) {
              return {
                x: (constraint.bodyA ? constraint.bodyA.position.x : 0) + (constraint.pointA ? constraint.pointA.x : 0),
                y: (constraint.bodyA ? constraint.bodyA.position.y : 0) + (constraint.pointA ? constraint.pointA.y : 0)
              };
            };
            Constraint.pointBWorld = function(constraint) {
              return {
                x: (constraint.bodyB ? constraint.bodyB.position.x : 0) + (constraint.pointB ? constraint.pointB.x : 0),
                y: (constraint.bodyB ? constraint.bodyB.position.y : 0) + (constraint.pointB ? constraint.pointB.y : 0)
              };
            };
          })();
        },
        /* 11 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Axes = {};
          module2.exports = Axes;
          var Vector = __webpack_require__(2);
          var Common = __webpack_require__(0);
          (function() {
            Axes.fromVertices = function(vertices) {
              var axes = {};
              for (var i = 0; i < vertices.length; i++) {
                var j = (i + 1) % vertices.length, normal = Vector.normalise({
                  x: vertices[j].y - vertices[i].y,
                  y: vertices[i].x - vertices[j].x
                }), gradient = normal.y === 0 ? Infinity : normal.x / normal.y;
                gradient = gradient.toFixed(3).toString();
                axes[gradient] = normal;
              }
              return Common.values(axes);
            };
            Axes.rotate = function(axes, angle) {
              if (angle === 0)
                return;
              var cos = Math.cos(angle), sin = Math.sin(angle);
              for (var i = 0; i < axes.length; i++) {
                var axis = axes[i], xx;
                xx = axis.x * cos - axis.y * sin;
                axis.y = axis.x * sin + axis.y * cos;
                axis.x = xx;
              }
            };
          })();
        },
        /* 12 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Bodies = {};
          module2.exports = Bodies;
          var Vertices = __webpack_require__(3);
          var Common = __webpack_require__(0);
          var Body = __webpack_require__(4);
          var Bounds = __webpack_require__(1);
          var Vector = __webpack_require__(2);
          (function() {
            Bodies.rectangle = function(x, y, width, height, options) {
              options = options || {};
              var rectangle = {
                label: "Rectangle Body",
                position: { x, y },
                vertices: Vertices.fromPath("L 0 0 L " + width + " 0 L " + width + " " + height + " L 0 " + height)
              };
              if (options.chamfer) {
                var chamfer = options.chamfer;
                rectangle.vertices = Vertices.chamfer(
                  rectangle.vertices,
                  chamfer.radius,
                  chamfer.quality,
                  chamfer.qualityMin,
                  chamfer.qualityMax
                );
                delete options.chamfer;
              }
              return Body.create(Common.extend({}, rectangle, options));
            };
            Bodies.trapezoid = function(x, y, width, height, slope, options) {
              options = options || {};
              slope *= 0.5;
              var roof = (1 - slope * 2) * width;
              var x1 = width * slope, x2 = x1 + roof, x3 = x2 + x1, verticesPath;
              if (slope < 0.5) {
                verticesPath = "L 0 0 L " + x1 + " " + -height + " L " + x2 + " " + -height + " L " + x3 + " 0";
              } else {
                verticesPath = "L 0 0 L " + x2 + " " + -height + " L " + x3 + " 0";
              }
              var trapezoid = {
                label: "Trapezoid Body",
                position: { x, y },
                vertices: Vertices.fromPath(verticesPath)
              };
              if (options.chamfer) {
                var chamfer = options.chamfer;
                trapezoid.vertices = Vertices.chamfer(
                  trapezoid.vertices,
                  chamfer.radius,
                  chamfer.quality,
                  chamfer.qualityMin,
                  chamfer.qualityMax
                );
                delete options.chamfer;
              }
              return Body.create(Common.extend({}, trapezoid, options));
            };
            Bodies.circle = function(x, y, radius, options, maxSides) {
              options = options || {};
              var circle = {
                label: "Circle Body",
                circleRadius: radius
              };
              maxSides = maxSides || 25;
              var sides = Math.ceil(Math.max(10, Math.min(maxSides, radius)));
              if (sides % 2 === 1)
                sides += 1;
              return Bodies.polygon(x, y, sides, radius, Common.extend({}, circle, options));
            };
            Bodies.polygon = function(x, y, sides, radius, options) {
              options = options || {};
              if (sides < 3)
                return Bodies.circle(x, y, radius, options);
              var theta = 2 * Math.PI / sides, path = "", offset = theta * 0.5;
              for (var i = 0; i < sides; i += 1) {
                var angle = offset + i * theta, xx = Math.cos(angle) * radius, yy = Math.sin(angle) * radius;
                path += "L " + xx.toFixed(3) + " " + yy.toFixed(3) + " ";
              }
              var polygon = {
                label: "Polygon Body",
                position: { x, y },
                vertices: Vertices.fromPath(path)
              };
              if (options.chamfer) {
                var chamfer = options.chamfer;
                polygon.vertices = Vertices.chamfer(
                  polygon.vertices,
                  chamfer.radius,
                  chamfer.quality,
                  chamfer.qualityMin,
                  chamfer.qualityMax
                );
                delete options.chamfer;
              }
              return Body.create(Common.extend({}, polygon, options));
            };
            Bodies.fromVertices = function(x, y, vertexSets, options, flagInternal, removeCollinear, minimumArea, removeDuplicatePoints) {
              var decomp = Common.getDecomp(), canDecomp, body, parts, isConvex2, isConcave, vertices, i, j, k, v, z;
              canDecomp = Boolean(decomp && decomp.quickDecomp);
              options = options || {};
              parts = [];
              flagInternal = typeof flagInternal !== "undefined" ? flagInternal : false;
              removeCollinear = typeof removeCollinear !== "undefined" ? removeCollinear : 0.01;
              minimumArea = typeof minimumArea !== "undefined" ? minimumArea : 10;
              removeDuplicatePoints = typeof removeDuplicatePoints !== "undefined" ? removeDuplicatePoints : 0.01;
              if (!Common.isArray(vertexSets[0])) {
                vertexSets = [vertexSets];
              }
              for (v = 0; v < vertexSets.length; v += 1) {
                vertices = vertexSets[v];
                isConvex2 = Vertices.isConvex(vertices);
                isConcave = !isConvex2;
                if (isConcave && !canDecomp) {
                  Common.warnOnce(
                    "Bodies.fromVertices: Install the 'poly-decomp' library and use Common.setDecomp or provide 'decomp' as a global to decompose concave vertices."
                  );
                }
                if (isConvex2 || !canDecomp) {
                  if (isConvex2) {
                    vertices = Vertices.clockwiseSort(vertices);
                  } else {
                    vertices = Vertices.hull(vertices);
                  }
                  parts.push({
                    position: { x, y },
                    vertices
                  });
                } else {
                  var concave = vertices.map(function(vertex) {
                    return [vertex.x, vertex.y];
                  });
                  decomp.makeCCW(concave);
                  if (removeCollinear !== false)
                    decomp.removeCollinearPoints(concave, removeCollinear);
                  if (removeDuplicatePoints !== false && decomp.removeDuplicatePoints)
                    decomp.removeDuplicatePoints(concave, removeDuplicatePoints);
                  var decomposed = decomp.quickDecomp(concave);
                  for (i = 0; i < decomposed.length; i++) {
                    var chunk = decomposed[i];
                    var chunkVertices = chunk.map(function(vertices2) {
                      return {
                        x: vertices2[0],
                        y: vertices2[1]
                      };
                    });
                    if (minimumArea > 0 && Vertices.area(chunkVertices) < minimumArea)
                      continue;
                    parts.push({
                      position: Vertices.centre(chunkVertices),
                      vertices: chunkVertices
                    });
                  }
                }
              }
              for (i = 0; i < parts.length; i++) {
                parts[i] = Body.create(Common.extend(parts[i], options));
              }
              if (flagInternal) {
                var coincident_max_dist = 5;
                for (i = 0; i < parts.length; i++) {
                  var partA = parts[i];
                  for (j = i + 1; j < parts.length; j++) {
                    var partB = parts[j];
                    if (Bounds.overlaps(partA.bounds, partB.bounds)) {
                      var pav = partA.vertices, pbv = partB.vertices;
                      for (k = 0; k < partA.vertices.length; k++) {
                        for (z = 0; z < partB.vertices.length; z++) {
                          var da = Vector.magnitudeSquared(Vector.sub(pav[(k + 1) % pav.length], pbv[z])), db = Vector.magnitudeSquared(Vector.sub(pav[k], pbv[(z + 1) % pbv.length]));
                          if (da < coincident_max_dist && db < coincident_max_dist) {
                            pav[k].isInternal = true;
                            pbv[z].isInternal = true;
                          }
                        }
                      }
                    }
                  }
                }
              }
              if (parts.length > 1) {
                body = Body.create(Common.extend({ parts: parts.slice(0) }, options));
                Body.setPosition(body, { x, y });
                return body;
              } else {
                return parts[0];
              }
            };
          })();
        },
        /* 13 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Detector = {};
          module2.exports = Detector;
          var Common = __webpack_require__(0);
          var Collision = __webpack_require__(8);
          (function() {
            Detector.create = function(options) {
              var defaults = {
                bodies: [],
                pairs: null
              };
              return Common.extend(defaults, options);
            };
            Detector.setBodies = function(detector, bodies) {
              detector.bodies = bodies.slice(0);
            };
            Detector.clear = function(detector) {
              detector.bodies = [];
            };
            Detector.collisions = function(detector) {
              var collisions = [], pairs = detector.pairs, bodies = detector.bodies, bodiesLength = bodies.length, canCollide = Detector.canCollide, collides = Collision.collides, i, j;
              bodies.sort(Detector._compareBoundsX);
              for (i = 0; i < bodiesLength; i++) {
                var bodyA = bodies[i], boundsA = bodyA.bounds, boundXMax = bodyA.bounds.max.x, boundYMax = bodyA.bounds.max.y, boundYMin = bodyA.bounds.min.y, bodyAStatic = bodyA.isStatic || bodyA.isSleeping, partsALength = bodyA.parts.length, partsASingle = partsALength === 1;
                for (j = i + 1; j < bodiesLength; j++) {
                  var bodyB = bodies[j], boundsB = bodyB.bounds;
                  if (boundsB.min.x > boundXMax) {
                    break;
                  }
                  if (boundYMax < boundsB.min.y || boundYMin > boundsB.max.y) {
                    continue;
                  }
                  if (bodyAStatic && (bodyB.isStatic || bodyB.isSleeping)) {
                    continue;
                  }
                  if (!canCollide(bodyA.collisionFilter, bodyB.collisionFilter)) {
                    continue;
                  }
                  var partsBLength = bodyB.parts.length;
                  if (partsASingle && partsBLength === 1) {
                    var collision = collides(bodyA, bodyB, pairs);
                    if (collision) {
                      collisions.push(collision);
                    }
                  } else {
                    var partsAStart = partsALength > 1 ? 1 : 0, partsBStart = partsBLength > 1 ? 1 : 0;
                    for (var k = partsAStart; k < partsALength; k++) {
                      var partA = bodyA.parts[k], boundsA = partA.bounds;
                      for (var z = partsBStart; z < partsBLength; z++) {
                        var partB = bodyB.parts[z], boundsB = partB.bounds;
                        if (boundsA.min.x > boundsB.max.x || boundsA.max.x < boundsB.min.x || boundsA.max.y < boundsB.min.y || boundsA.min.y > boundsB.max.y) {
                          continue;
                        }
                        var collision = collides(partA, partB, pairs);
                        if (collision) {
                          collisions.push(collision);
                        }
                      }
                    }
                  }
                }
              }
              return collisions;
            };
            Detector.canCollide = function(filterA, filterB) {
              if (filterA.group === filterB.group && filterA.group !== 0)
                return filterA.group > 0;
              return (filterA.mask & filterB.category) !== 0 && (filterB.mask & filterA.category) !== 0;
            };
            Detector._compareBoundsX = function(bodyA, bodyB) {
              return bodyA.bounds.min.x - bodyB.bounds.min.x;
            };
          })();
        },
        /* 14 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Mouse = {};
          module2.exports = Mouse;
          var Common = __webpack_require__(0);
          (function() {
            Mouse.create = function(element) {
              var mouse = {};
              if (!element) {
                Common.log("Mouse.create: element was undefined, defaulting to document.body", "warn");
              }
              mouse.element = element || document.body;
              mouse.absolute = { x: 0, y: 0 };
              mouse.position = { x: 0, y: 0 };
              mouse.mousedownPosition = { x: 0, y: 0 };
              mouse.mouseupPosition = { x: 0, y: 0 };
              mouse.offset = { x: 0, y: 0 };
              mouse.scale = { x: 1, y: 1 };
              mouse.wheelDelta = 0;
              mouse.button = -1;
              mouse.pixelRatio = parseInt(mouse.element.getAttribute("data-pixel-ratio"), 10) || 1;
              mouse.sourceEvents = {
                mousemove: null,
                mousedown: null,
                mouseup: null,
                mousewheel: null
              };
              mouse.mousemove = function(event) {
                var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio), touches = event.changedTouches;
                if (touches) {
                  mouse.button = 0;
                  event.preventDefault();
                }
                mouse.absolute.x = position.x;
                mouse.absolute.y = position.y;
                mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
                mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
                mouse.sourceEvents.mousemove = event;
              };
              mouse.mousedown = function(event) {
                var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio), touches = event.changedTouches;
                if (touches) {
                  mouse.button = 0;
                  event.preventDefault();
                } else {
                  mouse.button = event.button;
                }
                mouse.absolute.x = position.x;
                mouse.absolute.y = position.y;
                mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
                mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
                mouse.mousedownPosition.x = mouse.position.x;
                mouse.mousedownPosition.y = mouse.position.y;
                mouse.sourceEvents.mousedown = event;
              };
              mouse.mouseup = function(event) {
                var position = Mouse._getRelativeMousePosition(event, mouse.element, mouse.pixelRatio), touches = event.changedTouches;
                if (touches) {
                  event.preventDefault();
                }
                mouse.button = -1;
                mouse.absolute.x = position.x;
                mouse.absolute.y = position.y;
                mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
                mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
                mouse.mouseupPosition.x = mouse.position.x;
                mouse.mouseupPosition.y = mouse.position.y;
                mouse.sourceEvents.mouseup = event;
              };
              mouse.mousewheel = function(event) {
                mouse.wheelDelta = Math.max(-1, Math.min(1, event.wheelDelta || -event.detail));
                event.preventDefault();
              };
              Mouse.setElement(mouse, mouse.element);
              return mouse;
            };
            Mouse.setElement = function(mouse, element) {
              mouse.element = element;
              element.addEventListener("mousemove", mouse.mousemove);
              element.addEventListener("mousedown", mouse.mousedown);
              element.addEventListener("mouseup", mouse.mouseup);
              element.addEventListener("mousewheel", mouse.mousewheel);
              element.addEventListener("DOMMouseScroll", mouse.mousewheel);
              element.addEventListener("touchmove", mouse.mousemove);
              element.addEventListener("touchstart", mouse.mousedown);
              element.addEventListener("touchend", mouse.mouseup);
            };
            Mouse.clearSourceEvents = function(mouse) {
              mouse.sourceEvents.mousemove = null;
              mouse.sourceEvents.mousedown = null;
              mouse.sourceEvents.mouseup = null;
              mouse.sourceEvents.mousewheel = null;
              mouse.wheelDelta = 0;
            };
            Mouse.setOffset = function(mouse, offset) {
              mouse.offset.x = offset.x;
              mouse.offset.y = offset.y;
              mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
              mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
            };
            Mouse.setScale = function(mouse, scale) {
              mouse.scale.x = scale.x;
              mouse.scale.y = scale.y;
              mouse.position.x = mouse.absolute.x * mouse.scale.x + mouse.offset.x;
              mouse.position.y = mouse.absolute.y * mouse.scale.y + mouse.offset.y;
            };
            Mouse._getRelativeMousePosition = function(event, element, pixelRatio) {
              var elementBounds = element.getBoundingClientRect(), rootNode = document.documentElement || document.body.parentNode || document.body, scrollX = window.pageXOffset !== void 0 ? window.pageXOffset : rootNode.scrollLeft, scrollY = window.pageYOffset !== void 0 ? window.pageYOffset : rootNode.scrollTop, touches = event.changedTouches, x, y;
              if (touches) {
                x = touches[0].pageX - elementBounds.left - scrollX;
                y = touches[0].pageY - elementBounds.top - scrollY;
              } else {
                x = event.pageX - elementBounds.left - scrollX;
                y = event.pageY - elementBounds.top - scrollY;
              }
              return {
                x: x / (element.clientWidth / (element.width || element.clientWidth) * pixelRatio),
                y: y / (element.clientHeight / (element.height || element.clientHeight) * pixelRatio)
              };
            };
          })();
        },
        /* 15 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Plugin = {};
          module2.exports = Plugin;
          var Common = __webpack_require__(0);
          (function() {
            Plugin._registry = {};
            Plugin.register = function(plugin) {
              if (!Plugin.isPlugin(plugin)) {
                Common.warn("Plugin.register:", Plugin.toString(plugin), "does not implement all required fields.");
              }
              if (plugin.name in Plugin._registry) {
                var registered = Plugin._registry[plugin.name], pluginVersion = Plugin.versionParse(plugin.version).number, registeredVersion = Plugin.versionParse(registered.version).number;
                if (pluginVersion > registeredVersion) {
                  Common.warn("Plugin.register:", Plugin.toString(registered), "was upgraded to", Plugin.toString(plugin));
                  Plugin._registry[plugin.name] = plugin;
                } else if (pluginVersion < registeredVersion) {
                  Common.warn("Plugin.register:", Plugin.toString(registered), "can not be downgraded to", Plugin.toString(plugin));
                } else if (plugin !== registered) {
                  Common.warn("Plugin.register:", Plugin.toString(plugin), "is already registered to different plugin object");
                }
              } else {
                Plugin._registry[plugin.name] = plugin;
              }
              return plugin;
            };
            Plugin.resolve = function(dependency) {
              return Plugin._registry[Plugin.dependencyParse(dependency).name];
            };
            Plugin.toString = function(plugin) {
              return typeof plugin === "string" ? plugin : (plugin.name || "anonymous") + "@" + (plugin.version || plugin.range || "0.0.0");
            };
            Plugin.isPlugin = function(obj) {
              return obj && obj.name && obj.version && obj.install;
            };
            Plugin.isUsed = function(module3, name) {
              return module3.used.indexOf(name) > -1;
            };
            Plugin.isFor = function(plugin, module3) {
              var parsed = plugin.for && Plugin.dependencyParse(plugin.for);
              return !plugin.for || module3.name === parsed.name && Plugin.versionSatisfies(module3.version, parsed.range);
            };
            Plugin.use = function(module3, plugins) {
              module3.uses = (module3.uses || []).concat(plugins || []);
              if (module3.uses.length === 0) {
                Common.warn("Plugin.use:", Plugin.toString(module3), "does not specify any dependencies to install.");
                return;
              }
              var dependencies = Plugin.dependencies(module3), sortedDependencies = Common.topologicalSort(dependencies), status = [];
              for (var i = 0; i < sortedDependencies.length; i += 1) {
                if (sortedDependencies[i] === module3.name) {
                  continue;
                }
                var plugin = Plugin.resolve(sortedDependencies[i]);
                if (!plugin) {
                  status.push("❌ " + sortedDependencies[i]);
                  continue;
                }
                if (Plugin.isUsed(module3, plugin.name)) {
                  continue;
                }
                if (!Plugin.isFor(plugin, module3)) {
                  Common.warn("Plugin.use:", Plugin.toString(plugin), "is for", plugin.for, "but installed on", Plugin.toString(module3) + ".");
                  plugin._warned = true;
                }
                if (plugin.install) {
                  plugin.install(module3);
                } else {
                  Common.warn("Plugin.use:", Plugin.toString(plugin), "does not specify an install function.");
                  plugin._warned = true;
                }
                if (plugin._warned) {
                  status.push("🔶 " + Plugin.toString(plugin));
                  delete plugin._warned;
                } else {
                  status.push("✅ " + Plugin.toString(plugin));
                }
                module3.used.push(plugin.name);
              }
              if (status.length > 0) {
                Common.info(status.join("  "));
              }
            };
            Plugin.dependencies = function(module3, tracked) {
              var parsedBase = Plugin.dependencyParse(module3), name = parsedBase.name;
              tracked = tracked || {};
              if (name in tracked) {
                return;
              }
              module3 = Plugin.resolve(module3) || module3;
              tracked[name] = Common.map(module3.uses || [], function(dependency) {
                if (Plugin.isPlugin(dependency)) {
                  Plugin.register(dependency);
                }
                var parsed = Plugin.dependencyParse(dependency), resolved = Plugin.resolve(dependency);
                if (resolved && !Plugin.versionSatisfies(resolved.version, parsed.range)) {
                  Common.warn(
                    "Plugin.dependencies:",
                    Plugin.toString(resolved),
                    "does not satisfy",
                    Plugin.toString(parsed),
                    "used by",
                    Plugin.toString(parsedBase) + "."
                  );
                  resolved._warned = true;
                  module3._warned = true;
                } else if (!resolved) {
                  Common.warn(
                    "Plugin.dependencies:",
                    Plugin.toString(dependency),
                    "used by",
                    Plugin.toString(parsedBase),
                    "could not be resolved."
                  );
                  module3._warned = true;
                }
                return parsed.name;
              });
              for (var i = 0; i < tracked[name].length; i += 1) {
                Plugin.dependencies(tracked[name][i], tracked);
              }
              return tracked;
            };
            Plugin.dependencyParse = function(dependency) {
              if (Common.isString(dependency)) {
                var pattern = /^[\w-]+(@(\*|[\^~]?\d+\.\d+\.\d+(-[0-9A-Za-z-+]+)?))?$/;
                if (!pattern.test(dependency)) {
                  Common.warn("Plugin.dependencyParse:", dependency, "is not a valid dependency string.");
                }
                return {
                  name: dependency.split("@")[0],
                  range: dependency.split("@")[1] || "*"
                };
              }
              return {
                name: dependency.name,
                range: dependency.range || dependency.version
              };
            };
            Plugin.versionParse = function(range) {
              var pattern = /^(\*)|(\^|~|>=|>)?\s*((\d+)\.(\d+)\.(\d+))(-[0-9A-Za-z-+]+)?$/;
              if (!pattern.test(range)) {
                Common.warn("Plugin.versionParse:", range, "is not a valid version or range.");
              }
              var parts = pattern.exec(range);
              var major = Number(parts[4]);
              var minor = Number(parts[5]);
              var patch = Number(parts[6]);
              return {
                isRange: Boolean(parts[1] || parts[2]),
                version: parts[3],
                range,
                operator: parts[1] || parts[2] || "",
                major,
                minor,
                patch,
                parts: [major, minor, patch],
                prerelease: parts[7],
                number: major * 1e8 + minor * 1e4 + patch
              };
            };
            Plugin.versionSatisfies = function(version, range) {
              range = range || "*";
              var r = Plugin.versionParse(range), v = Plugin.versionParse(version);
              if (r.isRange) {
                if (r.operator === "*" || version === "*") {
                  return true;
                }
                if (r.operator === ">") {
                  return v.number > r.number;
                }
                if (r.operator === ">=") {
                  return v.number >= r.number;
                }
                if (r.operator === "~") {
                  return v.major === r.major && v.minor === r.minor && v.patch >= r.patch;
                }
                if (r.operator === "^") {
                  if (r.major > 0) {
                    return v.major === r.major && v.number >= r.number;
                  }
                  if (r.minor > 0) {
                    return v.minor === r.minor && v.patch >= r.patch;
                  }
                  return v.patch === r.patch;
                }
              }
              return version === range || version === "*";
            };
          })();
        },
        /* 16 */
        /***/
        function(module2, exports2) {
          var Contact = {};
          module2.exports = Contact;
          (function() {
            Contact.create = function(vertex) {
              return {
                vertex,
                normalImpulse: 0,
                tangentImpulse: 0
              };
            };
          })();
        },
        /* 17 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Engine = {};
          module2.exports = Engine;
          var Sleeping = __webpack_require__(7);
          var Resolver = __webpack_require__(18);
          var Detector = __webpack_require__(13);
          var Pairs = __webpack_require__(19);
          var Events = __webpack_require__(5);
          var Composite = __webpack_require__(6);
          var Constraint = __webpack_require__(10);
          var Common = __webpack_require__(0);
          var Body = __webpack_require__(4);
          (function() {
            Engine.create = function(options) {
              options = options || {};
              var defaults = {
                positionIterations: 6,
                velocityIterations: 4,
                constraintIterations: 2,
                enableSleeping: false,
                events: [],
                plugin: {},
                gravity: {
                  x: 0,
                  y: 1,
                  scale: 1e-3
                },
                timing: {
                  timestamp: 0,
                  timeScale: 1,
                  lastDelta: 0,
                  lastElapsed: 0
                }
              };
              var engine = Common.extend(defaults, options);
              engine.world = options.world || Composite.create({ label: "World" });
              engine.pairs = options.pairs || Pairs.create();
              engine.detector = options.detector || Detector.create();
              engine.grid = { buckets: [] };
              engine.world.gravity = engine.gravity;
              engine.broadphase = engine.grid;
              engine.metrics = {};
              return engine;
            };
            Engine.update = function(engine, delta) {
              var startTime = Common.now();
              var world = engine.world, detector = engine.detector, pairs = engine.pairs, timing = engine.timing, timestamp = timing.timestamp, i;
              delta = typeof delta !== "undefined" ? delta : Common._baseDelta;
              delta *= timing.timeScale;
              timing.timestamp += delta;
              timing.lastDelta = delta;
              var event = {
                timestamp: timing.timestamp,
                delta
              };
              Events.trigger(engine, "beforeUpdate", event);
              var allBodies = Composite.allBodies(world), allConstraints = Composite.allConstraints(world);
              if (world.isModified) {
                Detector.setBodies(detector, allBodies);
                Composite.setModified(world, false, false, true);
              }
              if (engine.enableSleeping)
                Sleeping.update(allBodies, delta);
              Engine._bodiesApplyGravity(allBodies, engine.gravity);
              if (delta > 0) {
                Engine._bodiesUpdate(allBodies, delta);
              }
              Constraint.preSolveAll(allBodies);
              for (i = 0; i < engine.constraintIterations; i++) {
                Constraint.solveAll(allConstraints, delta);
              }
              Constraint.postSolveAll(allBodies);
              detector.pairs = engine.pairs;
              var collisions = Detector.collisions(detector);
              Pairs.update(pairs, collisions, timestamp);
              if (engine.enableSleeping)
                Sleeping.afterCollisions(pairs.list);
              if (pairs.collisionStart.length > 0)
                Events.trigger(engine, "collisionStart", { pairs: pairs.collisionStart });
              var positionDamping = Common.clamp(20 / engine.positionIterations, 0, 1);
              Resolver.preSolvePosition(pairs.list);
              for (i = 0; i < engine.positionIterations; i++) {
                Resolver.solvePosition(pairs.list, delta, positionDamping);
              }
              Resolver.postSolvePosition(allBodies);
              Constraint.preSolveAll(allBodies);
              for (i = 0; i < engine.constraintIterations; i++) {
                Constraint.solveAll(allConstraints, delta);
              }
              Constraint.postSolveAll(allBodies);
              Resolver.preSolveVelocity(pairs.list);
              for (i = 0; i < engine.velocityIterations; i++) {
                Resolver.solveVelocity(pairs.list, delta);
              }
              Engine._bodiesUpdateVelocities(allBodies);
              if (pairs.collisionActive.length > 0)
                Events.trigger(engine, "collisionActive", { pairs: pairs.collisionActive });
              if (pairs.collisionEnd.length > 0)
                Events.trigger(engine, "collisionEnd", { pairs: pairs.collisionEnd });
              Engine._bodiesClearForces(allBodies);
              Events.trigger(engine, "afterUpdate", event);
              engine.timing.lastElapsed = Common.now() - startTime;
              return engine;
            };
            Engine.merge = function(engineA, engineB) {
              Common.extend(engineA, engineB);
              if (engineB.world) {
                engineA.world = engineB.world;
                Engine.clear(engineA);
                var bodies = Composite.allBodies(engineA.world);
                for (var i = 0; i < bodies.length; i++) {
                  var body = bodies[i];
                  Sleeping.set(body, false);
                  body.id = Common.nextId();
                }
              }
            };
            Engine.clear = function(engine) {
              Pairs.clear(engine.pairs);
              Detector.clear(engine.detector);
            };
            Engine._bodiesClearForces = function(bodies) {
              var bodiesLength = bodies.length;
              for (var i = 0; i < bodiesLength; i++) {
                var body = bodies[i];
                body.force.x = 0;
                body.force.y = 0;
                body.torque = 0;
              }
            };
            Engine._bodiesApplyGravity = function(bodies, gravity) {
              var gravityScale = typeof gravity.scale !== "undefined" ? gravity.scale : 1e-3, bodiesLength = bodies.length;
              if (gravity.x === 0 && gravity.y === 0 || gravityScale === 0) {
                return;
              }
              for (var i = 0; i < bodiesLength; i++) {
                var body = bodies[i];
                if (body.isStatic || body.isSleeping)
                  continue;
                body.force.y += body.mass * gravity.y * gravityScale;
                body.force.x += body.mass * gravity.x * gravityScale;
              }
            };
            Engine._bodiesUpdate = function(bodies, delta) {
              var bodiesLength = bodies.length;
              for (var i = 0; i < bodiesLength; i++) {
                var body = bodies[i];
                if (body.isStatic || body.isSleeping)
                  continue;
                Body.update(body, delta);
              }
            };
            Engine._bodiesUpdateVelocities = function(bodies) {
              var bodiesLength = bodies.length;
              for (var i = 0; i < bodiesLength; i++) {
                Body.updateVelocities(bodies[i]);
              }
            };
          })();
        },
        /* 18 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Resolver = {};
          module2.exports = Resolver;
          var Vertices = __webpack_require__(3);
          var Common = __webpack_require__(0);
          var Bounds = __webpack_require__(1);
          (function() {
            Resolver._restingThresh = 2;
            Resolver._restingThreshTangent = Math.sqrt(6);
            Resolver._positionDampen = 0.9;
            Resolver._positionWarming = 0.8;
            Resolver._frictionNormalMultiplier = 5;
            Resolver._frictionMaxStatic = Number.MAX_VALUE;
            Resolver.preSolvePosition = function(pairs) {
              var i, pair, activeCount, pairsLength = pairs.length;
              for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];
                if (!pair.isActive)
                  continue;
                activeCount = pair.activeContacts.length;
                pair.collision.parentA.totalContacts += activeCount;
                pair.collision.parentB.totalContacts += activeCount;
              }
            };
            Resolver.solvePosition = function(pairs, delta, damping) {
              var i, pair, collision, bodyA, bodyB, normal, contactShare, positionImpulse, positionDampen = Resolver._positionDampen * (damping || 1), slopDampen = Common.clamp(delta / Common._baseDelta, 0, 1), pairsLength = pairs.length;
              for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];
                if (!pair.isActive || pair.isSensor)
                  continue;
                collision = pair.collision;
                bodyA = collision.parentA;
                bodyB = collision.parentB;
                normal = collision.normal;
                pair.separation = normal.x * (bodyB.positionImpulse.x + collision.penetration.x - bodyA.positionImpulse.x) + normal.y * (bodyB.positionImpulse.y + collision.penetration.y - bodyA.positionImpulse.y);
              }
              for (i = 0; i < pairsLength; i++) {
                pair = pairs[i];
                if (!pair.isActive || pair.isSensor)
                  continue;
                collision = pair.collision;
                bodyA = collision.parentA;
                bodyB = collision.parentB;
                normal = collision.normal;
                positionImpulse = pair.separation - pair.slop * slopDampen;
                if (bodyA.isStatic || bodyB.isStatic)
                  positionImpulse *= 2;
                if (!(bodyA.isStatic || bodyA.isSleeping)) {
                  contactShare = positionDampen / bodyA.totalContacts;
                  bodyA.positionImpulse.x += normal.x * positionImpulse * contactShare;
                  bodyA.positionImpulse.y += normal.y * positionImpulse * contactShare;
                }
                if (!(bodyB.isStatic || bodyB.isSleeping)) {
                  contactShare = positionDampen / bodyB.totalContacts;
                  bodyB.positionImpulse.x -= normal.x * positionImpulse * contactShare;
                  bodyB.positionImpulse.y -= normal.y * positionImpulse * contactShare;
                }
              }
            };
            Resolver.postSolvePosition = function(bodies) {
              var positionWarming = Resolver._positionWarming, bodiesLength = bodies.length, verticesTranslate = Vertices.translate, boundsUpdate = Bounds.update;
              for (var i = 0; i < bodiesLength; i++) {
                var body = bodies[i], positionImpulse = body.positionImpulse, positionImpulseX = positionImpulse.x, positionImpulseY = positionImpulse.y, velocity = body.velocity;
                body.totalContacts = 0;
                if (positionImpulseX !== 0 || positionImpulseY !== 0) {
                  for (var j = 0; j < body.parts.length; j++) {
                    var part = body.parts[j];
                    verticesTranslate(part.vertices, positionImpulse);
                    boundsUpdate(part.bounds, part.vertices, velocity);
                    part.position.x += positionImpulseX;
                    part.position.y += positionImpulseY;
                  }
                  body.positionPrev.x += positionImpulseX;
                  body.positionPrev.y += positionImpulseY;
                  if (positionImpulseX * velocity.x + positionImpulseY * velocity.y < 0) {
                    positionImpulse.x = 0;
                    positionImpulse.y = 0;
                  } else {
                    positionImpulse.x *= positionWarming;
                    positionImpulse.y *= positionWarming;
                  }
                }
              }
            };
            Resolver.preSolveVelocity = function(pairs) {
              var pairsLength = pairs.length, i, j;
              for (i = 0; i < pairsLength; i++) {
                var pair = pairs[i];
                if (!pair.isActive || pair.isSensor)
                  continue;
                var contacts = pair.activeContacts, contactsLength = contacts.length, collision = pair.collision, bodyA = collision.parentA, bodyB = collision.parentB, normal = collision.normal, tangent = collision.tangent;
                for (j = 0; j < contactsLength; j++) {
                  var contact = contacts[j], contactVertex = contact.vertex, normalImpulse = contact.normalImpulse, tangentImpulse = contact.tangentImpulse;
                  if (normalImpulse !== 0 || tangentImpulse !== 0) {
                    var impulseX = normal.x * normalImpulse + tangent.x * tangentImpulse, impulseY = normal.y * normalImpulse + tangent.y * tangentImpulse;
                    if (!(bodyA.isStatic || bodyA.isSleeping)) {
                      bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                      bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                      bodyA.anglePrev += bodyA.inverseInertia * ((contactVertex.x - bodyA.position.x) * impulseY - (contactVertex.y - bodyA.position.y) * impulseX);
                    }
                    if (!(bodyB.isStatic || bodyB.isSleeping)) {
                      bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                      bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                      bodyB.anglePrev -= bodyB.inverseInertia * ((contactVertex.x - bodyB.position.x) * impulseY - (contactVertex.y - bodyB.position.y) * impulseX);
                    }
                  }
                }
              }
            };
            Resolver.solveVelocity = function(pairs, delta) {
              var timeScale = delta / Common._baseDelta, timeScaleSquared = timeScale * timeScale, timeScaleCubed = timeScaleSquared * timeScale, restingThresh = -Resolver._restingThresh * timeScale, restingThreshTangent = Resolver._restingThreshTangent, frictionNormalMultiplier = Resolver._frictionNormalMultiplier * timeScale, frictionMaxStatic = Resolver._frictionMaxStatic, pairsLength = pairs.length, tangentImpulse, maxFriction, i, j;
              for (i = 0; i < pairsLength; i++) {
                var pair = pairs[i];
                if (!pair.isActive || pair.isSensor)
                  continue;
                var collision = pair.collision, bodyA = collision.parentA, bodyB = collision.parentB, bodyAVelocity = bodyA.velocity, bodyBVelocity = bodyB.velocity, normalX = collision.normal.x, normalY = collision.normal.y, tangentX = collision.tangent.x, tangentY = collision.tangent.y, contacts = pair.activeContacts, contactsLength = contacts.length, contactShare = 1 / contactsLength, inverseMassTotal = bodyA.inverseMass + bodyB.inverseMass, friction = pair.friction * pair.frictionStatic * frictionNormalMultiplier;
                bodyAVelocity.x = bodyA.position.x - bodyA.positionPrev.x;
                bodyAVelocity.y = bodyA.position.y - bodyA.positionPrev.y;
                bodyBVelocity.x = bodyB.position.x - bodyB.positionPrev.x;
                bodyBVelocity.y = bodyB.position.y - bodyB.positionPrev.y;
                bodyA.angularVelocity = bodyA.angle - bodyA.anglePrev;
                bodyB.angularVelocity = bodyB.angle - bodyB.anglePrev;
                for (j = 0; j < contactsLength; j++) {
                  var contact = contacts[j], contactVertex = contact.vertex;
                  var offsetAX = contactVertex.x - bodyA.position.x, offsetAY = contactVertex.y - bodyA.position.y, offsetBX = contactVertex.x - bodyB.position.x, offsetBY = contactVertex.y - bodyB.position.y;
                  var velocityPointAX = bodyAVelocity.x - offsetAY * bodyA.angularVelocity, velocityPointAY = bodyAVelocity.y + offsetAX * bodyA.angularVelocity, velocityPointBX = bodyBVelocity.x - offsetBY * bodyB.angularVelocity, velocityPointBY = bodyBVelocity.y + offsetBX * bodyB.angularVelocity;
                  var relativeVelocityX = velocityPointAX - velocityPointBX, relativeVelocityY = velocityPointAY - velocityPointBY;
                  var normalVelocity = normalX * relativeVelocityX + normalY * relativeVelocityY, tangentVelocity = tangentX * relativeVelocityX + tangentY * relativeVelocityY;
                  var normalOverlap = pair.separation + normalVelocity;
                  var normalForce = Math.min(normalOverlap, 1);
                  normalForce = normalOverlap < 0 ? 0 : normalForce;
                  var frictionLimit = normalForce * friction;
                  if (tangentVelocity < -frictionLimit || tangentVelocity > frictionLimit) {
                    maxFriction = tangentVelocity > 0 ? tangentVelocity : -tangentVelocity;
                    tangentImpulse = pair.friction * (tangentVelocity > 0 ? 1 : -1) * timeScaleCubed;
                    if (tangentImpulse < -maxFriction) {
                      tangentImpulse = -maxFriction;
                    } else if (tangentImpulse > maxFriction) {
                      tangentImpulse = maxFriction;
                    }
                  } else {
                    tangentImpulse = tangentVelocity;
                    maxFriction = frictionMaxStatic;
                  }
                  var oAcN = offsetAX * normalY - offsetAY * normalX, oBcN = offsetBX * normalY - offsetBY * normalX, share = contactShare / (inverseMassTotal + bodyA.inverseInertia * oAcN * oAcN + bodyB.inverseInertia * oBcN * oBcN);
                  var normalImpulse = (1 + pair.restitution) * normalVelocity * share;
                  tangentImpulse *= share;
                  if (normalVelocity < restingThresh) {
                    contact.normalImpulse = 0;
                  } else {
                    var contactNormalImpulse = contact.normalImpulse;
                    contact.normalImpulse += normalImpulse;
                    if (contact.normalImpulse > 0) contact.normalImpulse = 0;
                    normalImpulse = contact.normalImpulse - contactNormalImpulse;
                  }
                  if (tangentVelocity < -restingThreshTangent || tangentVelocity > restingThreshTangent) {
                    contact.tangentImpulse = 0;
                  } else {
                    var contactTangentImpulse = contact.tangentImpulse;
                    contact.tangentImpulse += tangentImpulse;
                    if (contact.tangentImpulse < -maxFriction) contact.tangentImpulse = -maxFriction;
                    if (contact.tangentImpulse > maxFriction) contact.tangentImpulse = maxFriction;
                    tangentImpulse = contact.tangentImpulse - contactTangentImpulse;
                  }
                  var impulseX = normalX * normalImpulse + tangentX * tangentImpulse, impulseY = normalY * normalImpulse + tangentY * tangentImpulse;
                  if (!(bodyA.isStatic || bodyA.isSleeping)) {
                    bodyA.positionPrev.x += impulseX * bodyA.inverseMass;
                    bodyA.positionPrev.y += impulseY * bodyA.inverseMass;
                    bodyA.anglePrev += (offsetAX * impulseY - offsetAY * impulseX) * bodyA.inverseInertia;
                  }
                  if (!(bodyB.isStatic || bodyB.isSleeping)) {
                    bodyB.positionPrev.x -= impulseX * bodyB.inverseMass;
                    bodyB.positionPrev.y -= impulseY * bodyB.inverseMass;
                    bodyB.anglePrev -= (offsetBX * impulseY - offsetBY * impulseX) * bodyB.inverseInertia;
                  }
                }
              }
            };
          })();
        },
        /* 19 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Pairs = {};
          module2.exports = Pairs;
          var Pair = __webpack_require__(9);
          var Common = __webpack_require__(0);
          (function() {
            Pairs.create = function(options) {
              return Common.extend({
                table: {},
                list: [],
                collisionStart: [],
                collisionActive: [],
                collisionEnd: []
              }, options);
            };
            Pairs.update = function(pairs, collisions, timestamp) {
              var pairsList = pairs.list, pairsListLength = pairsList.length, pairsTable = pairs.table, collisionsLength = collisions.length, collisionStart = pairs.collisionStart, collisionEnd = pairs.collisionEnd, collisionActive = pairs.collisionActive, collision, pairIndex, pair, i;
              collisionStart.length = 0;
              collisionEnd.length = 0;
              collisionActive.length = 0;
              for (i = 0; i < pairsListLength; i++) {
                pairsList[i].confirmedActive = false;
              }
              for (i = 0; i < collisionsLength; i++) {
                collision = collisions[i];
                pair = collision.pair;
                if (pair) {
                  if (pair.isActive) {
                    collisionActive.push(pair);
                  } else {
                    collisionStart.push(pair);
                  }
                  Pair.update(pair, collision, timestamp);
                  pair.confirmedActive = true;
                } else {
                  pair = Pair.create(collision, timestamp);
                  pairsTable[pair.id] = pair;
                  collisionStart.push(pair);
                  pairsList.push(pair);
                }
              }
              var removePairIndex = [];
              pairsListLength = pairsList.length;
              for (i = 0; i < pairsListLength; i++) {
                pair = pairsList[i];
                if (!pair.confirmedActive) {
                  Pair.setActive(pair, false, timestamp);
                  collisionEnd.push(pair);
                  if (!pair.collision.bodyA.isSleeping && !pair.collision.bodyB.isSleeping) {
                    removePairIndex.push(i);
                  }
                }
              }
              for (i = 0; i < removePairIndex.length; i++) {
                pairIndex = removePairIndex[i] - i;
                pair = pairsList[pairIndex];
                pairsList.splice(pairIndex, 1);
                delete pairsTable[pair.id];
              }
            };
            Pairs.clear = function(pairs) {
              pairs.table = {};
              pairs.list.length = 0;
              pairs.collisionStart.length = 0;
              pairs.collisionActive.length = 0;
              pairs.collisionEnd.length = 0;
              return pairs;
            };
          })();
        },
        /* 20 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Matter2 = module2.exports = __webpack_require__(21);
          Matter2.Axes = __webpack_require__(11);
          Matter2.Bodies = __webpack_require__(12);
          Matter2.Body = __webpack_require__(4);
          Matter2.Bounds = __webpack_require__(1);
          Matter2.Collision = __webpack_require__(8);
          Matter2.Common = __webpack_require__(0);
          Matter2.Composite = __webpack_require__(6);
          Matter2.Composites = __webpack_require__(22);
          Matter2.Constraint = __webpack_require__(10);
          Matter2.Contact = __webpack_require__(16);
          Matter2.Detector = __webpack_require__(13);
          Matter2.Engine = __webpack_require__(17);
          Matter2.Events = __webpack_require__(5);
          Matter2.Grid = __webpack_require__(23);
          Matter2.Mouse = __webpack_require__(14);
          Matter2.MouseConstraint = __webpack_require__(24);
          Matter2.Pair = __webpack_require__(9);
          Matter2.Pairs = __webpack_require__(19);
          Matter2.Plugin = __webpack_require__(15);
          Matter2.Query = __webpack_require__(25);
          Matter2.Render = __webpack_require__(26);
          Matter2.Resolver = __webpack_require__(18);
          Matter2.Runner = __webpack_require__(27);
          Matter2.SAT = __webpack_require__(28);
          Matter2.Sleeping = __webpack_require__(7);
          Matter2.Svg = __webpack_require__(29);
          Matter2.Vector = __webpack_require__(2);
          Matter2.Vertices = __webpack_require__(3);
          Matter2.World = __webpack_require__(30);
          Matter2.Engine.run = Matter2.Runner.run;
          Matter2.Common.deprecated(Matter2.Engine, "run", "Engine.run ➤ use Matter.Runner.run(engine) instead");
        },
        /* 21 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Matter2 = {};
          module2.exports = Matter2;
          var Plugin = __webpack_require__(15);
          var Common = __webpack_require__(0);
          (function() {
            Matter2.name = "matter-js";
            Matter2.version = "0.19.0";
            Matter2.uses = [];
            Matter2.used = [];
            Matter2.use = function() {
              Plugin.use(Matter2, Array.prototype.slice.call(arguments));
            };
            Matter2.before = function(path, func) {
              path = path.replace(/^Matter./, "");
              return Common.chainPathBefore(Matter2, path, func);
            };
            Matter2.after = function(path, func) {
              path = path.replace(/^Matter./, "");
              return Common.chainPathAfter(Matter2, path, func);
            };
          })();
        },
        /* 22 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Composites = {};
          module2.exports = Composites;
          var Composite = __webpack_require__(6);
          var Constraint = __webpack_require__(10);
          var Common = __webpack_require__(0);
          var Body = __webpack_require__(4);
          var Bodies = __webpack_require__(12);
          var deprecated = Common.deprecated;
          (function() {
            Composites.stack = function(xx, yy, columns, rows, columnGap, rowGap, callback) {
              var stack = Composite.create({ label: "Stack" }), x = xx, y = yy, lastBody, i = 0;
              for (var row = 0; row < rows; row++) {
                var maxHeight = 0;
                for (var column = 0; column < columns; column++) {
                  var body = callback(x, y, column, row, lastBody, i);
                  if (body) {
                    var bodyHeight = body.bounds.max.y - body.bounds.min.y, bodyWidth = body.bounds.max.x - body.bounds.min.x;
                    if (bodyHeight > maxHeight)
                      maxHeight = bodyHeight;
                    Body.translate(body, { x: bodyWidth * 0.5, y: bodyHeight * 0.5 });
                    x = body.bounds.max.x + columnGap;
                    Composite.addBody(stack, body);
                    lastBody = body;
                    i += 1;
                  } else {
                    x += columnGap;
                  }
                }
                y += maxHeight + rowGap;
                x = xx;
              }
              return stack;
            };
            Composites.chain = function(composite, xOffsetA, yOffsetA, xOffsetB, yOffsetB, options) {
              var bodies = composite.bodies;
              for (var i = 1; i < bodies.length; i++) {
                var bodyA = bodies[i - 1], bodyB = bodies[i], bodyAHeight = bodyA.bounds.max.y - bodyA.bounds.min.y, bodyAWidth = bodyA.bounds.max.x - bodyA.bounds.min.x, bodyBHeight = bodyB.bounds.max.y - bodyB.bounds.min.y, bodyBWidth = bodyB.bounds.max.x - bodyB.bounds.min.x;
                var defaults = {
                  bodyA,
                  pointA: { x: bodyAWidth * xOffsetA, y: bodyAHeight * yOffsetA },
                  bodyB,
                  pointB: { x: bodyBWidth * xOffsetB, y: bodyBHeight * yOffsetB }
                };
                var constraint = Common.extend(defaults, options);
                Composite.addConstraint(composite, Constraint.create(constraint));
              }
              composite.label += " Chain";
              return composite;
            };
            Composites.mesh = function(composite, columns, rows, crossBrace, options) {
              var bodies = composite.bodies, row, col, bodyA, bodyB, bodyC;
              for (row = 0; row < rows; row++) {
                for (col = 1; col < columns; col++) {
                  bodyA = bodies[col - 1 + row * columns];
                  bodyB = bodies[col + row * columns];
                  Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA, bodyB }, options)));
                }
                if (row > 0) {
                  for (col = 0; col < columns; col++) {
                    bodyA = bodies[col + (row - 1) * columns];
                    bodyB = bodies[col + row * columns];
                    Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA, bodyB }, options)));
                    if (crossBrace && col > 0) {
                      bodyC = bodies[col - 1 + (row - 1) * columns];
                      Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB }, options)));
                    }
                    if (crossBrace && col < columns - 1) {
                      bodyC = bodies[col + 1 + (row - 1) * columns];
                      Composite.addConstraint(composite, Constraint.create(Common.extend({ bodyA: bodyC, bodyB }, options)));
                    }
                  }
                }
              }
              composite.label += " Mesh";
              return composite;
            };
            Composites.pyramid = function(xx, yy, columns, rows, columnGap, rowGap, callback) {
              return Composites.stack(xx, yy, columns, rows, columnGap, rowGap, function(x, y, column, row, lastBody, i) {
                var actualRows = Math.min(rows, Math.ceil(columns / 2)), lastBodyWidth = lastBody ? lastBody.bounds.max.x - lastBody.bounds.min.x : 0;
                if (row > actualRows)
                  return;
                row = actualRows - row;
                var start = row, end = columns - 1 - row;
                if (column < start || column > end)
                  return;
                if (i === 1) {
                  Body.translate(lastBody, { x: (column + (columns % 2 === 1 ? 1 : -1)) * lastBodyWidth, y: 0 });
                }
                var xOffset = lastBody ? column * lastBodyWidth : 0;
                return callback(xx + xOffset + column * columnGap, y, column, row, lastBody, i);
              });
            };
            Composites.newtonsCradle = function(xx, yy, number, size, length) {
              var newtonsCradle = Composite.create({ label: "Newtons Cradle" });
              for (var i = 0; i < number; i++) {
                var separation = 1.9, circle = Bodies.circle(
                  xx + i * (size * separation),
                  yy + length,
                  size,
                  { inertia: Infinity, restitution: 1, friction: 0, frictionAir: 1e-4, slop: 1 }
                ), constraint = Constraint.create({ pointA: { x: xx + i * (size * separation), y: yy }, bodyB: circle });
                Composite.addBody(newtonsCradle, circle);
                Composite.addConstraint(newtonsCradle, constraint);
              }
              return newtonsCradle;
            };
            deprecated(Composites, "newtonsCradle", "Composites.newtonsCradle ➤ moved to newtonsCradle example");
            Composites.car = function(xx, yy, width, height, wheelSize) {
              var group = Body.nextGroup(true), wheelBase = 20, wheelAOffset = -width * 0.5 + wheelBase, wheelBOffset = width * 0.5 - wheelBase, wheelYOffset = 0;
              var car = Composite.create({ label: "Car" }), body = Bodies.rectangle(xx, yy, width, height, {
                collisionFilter: {
                  group
                },
                chamfer: {
                  radius: height * 0.5
                },
                density: 2e-4
              });
              var wheelA = Bodies.circle(xx + wheelAOffset, yy + wheelYOffset, wheelSize, {
                collisionFilter: {
                  group
                },
                friction: 0.8
              });
              var wheelB = Bodies.circle(xx + wheelBOffset, yy + wheelYOffset, wheelSize, {
                collisionFilter: {
                  group
                },
                friction: 0.8
              });
              var axelA = Constraint.create({
                bodyB: body,
                pointB: { x: wheelAOffset, y: wheelYOffset },
                bodyA: wheelA,
                stiffness: 1,
                length: 0
              });
              var axelB = Constraint.create({
                bodyB: body,
                pointB: { x: wheelBOffset, y: wheelYOffset },
                bodyA: wheelB,
                stiffness: 1,
                length: 0
              });
              Composite.addBody(car, body);
              Composite.addBody(car, wheelA);
              Composite.addBody(car, wheelB);
              Composite.addConstraint(car, axelA);
              Composite.addConstraint(car, axelB);
              return car;
            };
            deprecated(Composites, "car", "Composites.car ➤ moved to car example");
            Composites.softBody = function(xx, yy, columns, rows, columnGap, rowGap, crossBrace, particleRadius, particleOptions, constraintOptions) {
              particleOptions = Common.extend({ inertia: Infinity }, particleOptions);
              constraintOptions = Common.extend({ stiffness: 0.2, render: { type: "line", anchors: false } }, constraintOptions);
              var softBody = Composites.stack(xx, yy, columns, rows, columnGap, rowGap, function(x, y) {
                return Bodies.circle(x, y, particleRadius, particleOptions);
              });
              Composites.mesh(softBody, columns, rows, crossBrace, constraintOptions);
              softBody.label = "Soft Body";
              return softBody;
            };
            deprecated(Composites, "softBody", "Composites.softBody ➤ moved to softBody and cloth examples");
          })();
        },
        /* 23 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Grid = {};
          module2.exports = Grid;
          var Pair = __webpack_require__(9);
          var Common = __webpack_require__(0);
          var deprecated = Common.deprecated;
          (function() {
            Grid.create = function(options) {
              var defaults = {
                buckets: {},
                pairs: {},
                pairsList: [],
                bucketWidth: 48,
                bucketHeight: 48
              };
              return Common.extend(defaults, options);
            };
            Grid.update = function(grid, bodies, engine, forceUpdate) {
              var i, col, row, world = engine.world, buckets = grid.buckets, bucket, bucketId, gridChanged = false;
              for (i = 0; i < bodies.length; i++) {
                var body = bodies[i];
                if (body.isSleeping && !forceUpdate)
                  continue;
                if (world.bounds && (body.bounds.max.x < world.bounds.min.x || body.bounds.min.x > world.bounds.max.x || body.bounds.max.y < world.bounds.min.y || body.bounds.min.y > world.bounds.max.y))
                  continue;
                var newRegion = Grid._getRegion(grid, body);
                if (!body.region || newRegion.id !== body.region.id || forceUpdate) {
                  if (!body.region || forceUpdate)
                    body.region = newRegion;
                  var union = Grid._regionUnion(newRegion, body.region);
                  for (col = union.startCol; col <= union.endCol; col++) {
                    for (row = union.startRow; row <= union.endRow; row++) {
                      bucketId = Grid._getBucketId(col, row);
                      bucket = buckets[bucketId];
                      var isInsideNewRegion = col >= newRegion.startCol && col <= newRegion.endCol && row >= newRegion.startRow && row <= newRegion.endRow;
                      var isInsideOldRegion = col >= body.region.startCol && col <= body.region.endCol && row >= body.region.startRow && row <= body.region.endRow;
                      if (!isInsideNewRegion && isInsideOldRegion) {
                        if (isInsideOldRegion) {
                          if (bucket)
                            Grid._bucketRemoveBody(grid, bucket, body);
                        }
                      }
                      if (body.region === newRegion || isInsideNewRegion && !isInsideOldRegion || forceUpdate) {
                        if (!bucket)
                          bucket = Grid._createBucket(buckets, bucketId);
                        Grid._bucketAddBody(grid, bucket, body);
                      }
                    }
                  }
                  body.region = newRegion;
                  gridChanged = true;
                }
              }
              if (gridChanged)
                grid.pairsList = Grid._createActivePairsList(grid);
            };
            deprecated(Grid, "update", "Grid.update ➤ replaced by Matter.Detector");
            Grid.clear = function(grid) {
              grid.buckets = {};
              grid.pairs = {};
              grid.pairsList = [];
            };
            deprecated(Grid, "clear", "Grid.clear ➤ replaced by Matter.Detector");
            Grid._regionUnion = function(regionA, regionB) {
              var startCol = Math.min(regionA.startCol, regionB.startCol), endCol = Math.max(regionA.endCol, regionB.endCol), startRow = Math.min(regionA.startRow, regionB.startRow), endRow = Math.max(regionA.endRow, regionB.endRow);
              return Grid._createRegion(startCol, endCol, startRow, endRow);
            };
            Grid._getRegion = function(grid, body) {
              var bounds = body.bounds, startCol = Math.floor(bounds.min.x / grid.bucketWidth), endCol = Math.floor(bounds.max.x / grid.bucketWidth), startRow = Math.floor(bounds.min.y / grid.bucketHeight), endRow = Math.floor(bounds.max.y / grid.bucketHeight);
              return Grid._createRegion(startCol, endCol, startRow, endRow);
            };
            Grid._createRegion = function(startCol, endCol, startRow, endRow) {
              return {
                id: startCol + "," + endCol + "," + startRow + "," + endRow,
                startCol,
                endCol,
                startRow,
                endRow
              };
            };
            Grid._getBucketId = function(column, row) {
              return "C" + column + "R" + row;
            };
            Grid._createBucket = function(buckets, bucketId) {
              var bucket = buckets[bucketId] = [];
              return bucket;
            };
            Grid._bucketAddBody = function(grid, bucket, body) {
              var gridPairs = grid.pairs, pairId = Pair.id, bucketLength = bucket.length, i;
              for (i = 0; i < bucketLength; i++) {
                var bodyB = bucket[i];
                if (body.id === bodyB.id || body.isStatic && bodyB.isStatic)
                  continue;
                var id = pairId(body, bodyB), pair = gridPairs[id];
                if (pair) {
                  pair[2] += 1;
                } else {
                  gridPairs[id] = [body, bodyB, 1];
                }
              }
              bucket.push(body);
            };
            Grid._bucketRemoveBody = function(grid, bucket, body) {
              var gridPairs = grid.pairs, pairId = Pair.id, i;
              bucket.splice(Common.indexOf(bucket, body), 1);
              var bucketLength = bucket.length;
              for (i = 0; i < bucketLength; i++) {
                var pair = gridPairs[pairId(body, bucket[i])];
                if (pair)
                  pair[2] -= 1;
              }
            };
            Grid._createActivePairsList = function(grid) {
              var pair, gridPairs = grid.pairs, pairKeys = Common.keys(gridPairs), pairKeysLength = pairKeys.length, pairs = [], k;
              for (k = 0; k < pairKeysLength; k++) {
                pair = gridPairs[pairKeys[k]];
                if (pair[2] > 0) {
                  pairs.push(pair);
                } else {
                  delete gridPairs[pairKeys[k]];
                }
              }
              return pairs;
            };
          })();
        },
        /* 24 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var MouseConstraint = {};
          module2.exports = MouseConstraint;
          var Vertices = __webpack_require__(3);
          var Sleeping = __webpack_require__(7);
          var Mouse = __webpack_require__(14);
          var Events = __webpack_require__(5);
          var Detector = __webpack_require__(13);
          var Constraint = __webpack_require__(10);
          var Composite = __webpack_require__(6);
          var Common = __webpack_require__(0);
          var Bounds = __webpack_require__(1);
          (function() {
            MouseConstraint.create = function(engine, options) {
              var mouse = (engine ? engine.mouse : null) || (options ? options.mouse : null);
              if (!mouse) {
                if (engine && engine.render && engine.render.canvas) {
                  mouse = Mouse.create(engine.render.canvas);
                } else if (options && options.element) {
                  mouse = Mouse.create(options.element);
                } else {
                  mouse = Mouse.create();
                  Common.warn("MouseConstraint.create: options.mouse was undefined, options.element was undefined, may not function as expected");
                }
              }
              var constraint = Constraint.create({
                label: "Mouse Constraint",
                pointA: mouse.position,
                pointB: { x: 0, y: 0 },
                length: 0.01,
                stiffness: 0.1,
                angularStiffness: 1,
                render: {
                  strokeStyle: "#90EE90",
                  lineWidth: 3
                }
              });
              var defaults = {
                type: "mouseConstraint",
                mouse,
                element: null,
                body: null,
                constraint,
                collisionFilter: {
                  category: 1,
                  mask: 4294967295,
                  group: 0
                }
              };
              var mouseConstraint = Common.extend(defaults, options);
              Events.on(engine, "beforeUpdate", function() {
                var allBodies = Composite.allBodies(engine.world);
                MouseConstraint.update(mouseConstraint, allBodies);
                MouseConstraint._triggerEvents(mouseConstraint);
              });
              return mouseConstraint;
            };
            MouseConstraint.update = function(mouseConstraint, bodies) {
              var mouse = mouseConstraint.mouse, constraint = mouseConstraint.constraint, body = mouseConstraint.body;
              if (mouse.button === 0) {
                if (!constraint.bodyB) {
                  for (var i = 0; i < bodies.length; i++) {
                    body = bodies[i];
                    if (Bounds.contains(body.bounds, mouse.position) && Detector.canCollide(body.collisionFilter, mouseConstraint.collisionFilter)) {
                      for (var j = body.parts.length > 1 ? 1 : 0; j < body.parts.length; j++) {
                        var part = body.parts[j];
                        if (Vertices.contains(part.vertices, mouse.position)) {
                          constraint.pointA = mouse.position;
                          constraint.bodyB = mouseConstraint.body = body;
                          constraint.pointB = { x: mouse.position.x - body.position.x, y: mouse.position.y - body.position.y };
                          constraint.angleB = body.angle;
                          Sleeping.set(body, false);
                          Events.trigger(mouseConstraint, "startdrag", { mouse, body });
                          break;
                        }
                      }
                    }
                  }
                } else {
                  Sleeping.set(constraint.bodyB, false);
                  constraint.pointA = mouse.position;
                }
              } else {
                constraint.bodyB = mouseConstraint.body = null;
                constraint.pointB = null;
                if (body)
                  Events.trigger(mouseConstraint, "enddrag", { mouse, body });
              }
            };
            MouseConstraint._triggerEvents = function(mouseConstraint) {
              var mouse = mouseConstraint.mouse, mouseEvents = mouse.sourceEvents;
              if (mouseEvents.mousemove)
                Events.trigger(mouseConstraint, "mousemove", { mouse });
              if (mouseEvents.mousedown)
                Events.trigger(mouseConstraint, "mousedown", { mouse });
              if (mouseEvents.mouseup)
                Events.trigger(mouseConstraint, "mouseup", { mouse });
              Mouse.clearSourceEvents(mouse);
            };
          })();
        },
        /* 25 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Query = {};
          module2.exports = Query;
          var Vector = __webpack_require__(2);
          var Collision = __webpack_require__(8);
          var Bounds = __webpack_require__(1);
          var Bodies = __webpack_require__(12);
          var Vertices = __webpack_require__(3);
          (function() {
            Query.collides = function(body, bodies) {
              var collisions = [], bodiesLength = bodies.length, bounds = body.bounds, collides = Collision.collides, overlaps = Bounds.overlaps;
              for (var i = 0; i < bodiesLength; i++) {
                var bodyA = bodies[i], partsALength = bodyA.parts.length, partsAStart = partsALength === 1 ? 0 : 1;
                if (overlaps(bodyA.bounds, bounds)) {
                  for (var j = partsAStart; j < partsALength; j++) {
                    var part = bodyA.parts[j];
                    if (overlaps(part.bounds, bounds)) {
                      var collision = collides(part, body);
                      if (collision) {
                        collisions.push(collision);
                        break;
                      }
                    }
                  }
                }
              }
              return collisions;
            };
            Query.ray = function(bodies, startPoint, endPoint, rayWidth) {
              rayWidth = rayWidth || 1e-100;
              var rayAngle = Vector.angle(startPoint, endPoint), rayLength = Vector.magnitude(Vector.sub(startPoint, endPoint)), rayX = (endPoint.x + startPoint.x) * 0.5, rayY = (endPoint.y + startPoint.y) * 0.5, ray = Bodies.rectangle(rayX, rayY, rayLength, rayWidth, { angle: rayAngle }), collisions = Query.collides(ray, bodies);
              for (var i = 0; i < collisions.length; i += 1) {
                var collision = collisions[i];
                collision.body = collision.bodyB = collision.bodyA;
              }
              return collisions;
            };
            Query.region = function(bodies, bounds, outside) {
              var result = [];
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], overlaps = Bounds.overlaps(body.bounds, bounds);
                if (overlaps && !outside || !overlaps && outside)
                  result.push(body);
              }
              return result;
            };
            Query.point = function(bodies, point) {
              var result = [];
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i];
                if (Bounds.contains(body.bounds, point)) {
                  for (var j = body.parts.length === 1 ? 0 : 1; j < body.parts.length; j++) {
                    var part = body.parts[j];
                    if (Bounds.contains(part.bounds, point) && Vertices.contains(part.vertices, point)) {
                      result.push(body);
                      break;
                    }
                  }
                }
              }
              return result;
            };
          })();
        },
        /* 26 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Render = {};
          module2.exports = Render;
          var Body = __webpack_require__(4);
          var Common = __webpack_require__(0);
          var Composite = __webpack_require__(6);
          var Bounds = __webpack_require__(1);
          var Events = __webpack_require__(5);
          var Vector = __webpack_require__(2);
          var Mouse = __webpack_require__(14);
          (function() {
            var _requestAnimationFrame, _cancelAnimationFrame;
            if (typeof window !== "undefined") {
              _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame || function(callback) {
                window.setTimeout(function() {
                  callback(Common.now());
                }, 1e3 / 60);
              };
              _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
            }
            Render._goodFps = 30;
            Render._goodDelta = 1e3 / 60;
            Render.create = function(options) {
              var defaults = {
                engine: null,
                element: null,
                canvas: null,
                mouse: null,
                frameRequestId: null,
                timing: {
                  historySize: 60,
                  delta: 0,
                  deltaHistory: [],
                  lastTime: 0,
                  lastTimestamp: 0,
                  lastElapsed: 0,
                  timestampElapsed: 0,
                  timestampElapsedHistory: [],
                  engineDeltaHistory: [],
                  engineElapsedHistory: [],
                  elapsedHistory: []
                },
                options: {
                  width: 800,
                  height: 600,
                  pixelRatio: 1,
                  background: "#14151f",
                  wireframeBackground: "#14151f",
                  hasBounds: !!options.bounds,
                  enabled: true,
                  wireframes: true,
                  showSleeping: true,
                  showDebug: false,
                  showStats: false,
                  showPerformance: false,
                  showBounds: false,
                  showVelocity: false,
                  showCollisions: false,
                  showSeparations: false,
                  showAxes: false,
                  showPositions: false,
                  showAngleIndicator: false,
                  showIds: false,
                  showVertexNumbers: false,
                  showConvexHulls: false,
                  showInternalEdges: false,
                  showMousePosition: false
                }
              };
              var render = Common.extend(defaults, options);
              if (render.canvas) {
                render.canvas.width = render.options.width || render.canvas.width;
                render.canvas.height = render.options.height || render.canvas.height;
              }
              render.mouse = options.mouse;
              render.engine = options.engine;
              render.canvas = render.canvas || _createCanvas(render.options.width, render.options.height);
              render.context = render.canvas.getContext("2d");
              render.textures = {};
              render.bounds = render.bounds || {
                min: {
                  x: 0,
                  y: 0
                },
                max: {
                  x: render.canvas.width,
                  y: render.canvas.height
                }
              };
              render.controller = Render;
              render.options.showBroadphase = false;
              if (render.options.pixelRatio !== 1) {
                Render.setPixelRatio(render, render.options.pixelRatio);
              }
              if (Common.isElement(render.element)) {
                render.element.appendChild(render.canvas);
              }
              return render;
            };
            Render.run = function(render) {
              (function loop(time) {
                render.frameRequestId = _requestAnimationFrame(loop);
                _updateTiming(render, time);
                Render.world(render, time);
                if (render.options.showStats || render.options.showDebug) {
                  Render.stats(render, render.context, time);
                }
                if (render.options.showPerformance || render.options.showDebug) {
                  Render.performance(render, render.context, time);
                }
              })();
            };
            Render.stop = function(render) {
              _cancelAnimationFrame(render.frameRequestId);
            };
            Render.setPixelRatio = function(render, pixelRatio) {
              var options = render.options, canvas = render.canvas;
              if (pixelRatio === "auto") {
                pixelRatio = _getPixelRatio(canvas);
              }
              options.pixelRatio = pixelRatio;
              canvas.setAttribute("data-pixel-ratio", pixelRatio);
              canvas.width = options.width * pixelRatio;
              canvas.height = options.height * pixelRatio;
              canvas.style.width = options.width + "px";
              canvas.style.height = options.height + "px";
            };
            Render.lookAt = function(render, objects, padding, center) {
              center = typeof center !== "undefined" ? center : true;
              objects = Common.isArray(objects) ? objects : [objects];
              padding = padding || {
                x: 0,
                y: 0
              };
              var bounds = {
                min: { x: Infinity, y: Infinity },
                max: { x: -Infinity, y: -Infinity }
              };
              for (var i = 0; i < objects.length; i += 1) {
                var object = objects[i], min = object.bounds ? object.bounds.min : object.min || object.position || object, max = object.bounds ? object.bounds.max : object.max || object.position || object;
                if (min && max) {
                  if (min.x < bounds.min.x)
                    bounds.min.x = min.x;
                  if (max.x > bounds.max.x)
                    bounds.max.x = max.x;
                  if (min.y < bounds.min.y)
                    bounds.min.y = min.y;
                  if (max.y > bounds.max.y)
                    bounds.max.y = max.y;
                }
              }
              var width = bounds.max.x - bounds.min.x + 2 * padding.x, height = bounds.max.y - bounds.min.y + 2 * padding.y, viewHeight = render.canvas.height, viewWidth = render.canvas.width, outerRatio = viewWidth / viewHeight, innerRatio = width / height, scaleX = 1, scaleY = 1;
              if (innerRatio > outerRatio) {
                scaleY = innerRatio / outerRatio;
              } else {
                scaleX = outerRatio / innerRatio;
              }
              render.options.hasBounds = true;
              render.bounds.min.x = bounds.min.x;
              render.bounds.max.x = bounds.min.x + width * scaleX;
              render.bounds.min.y = bounds.min.y;
              render.bounds.max.y = bounds.min.y + height * scaleY;
              if (center) {
                render.bounds.min.x += width * 0.5 - width * scaleX * 0.5;
                render.bounds.max.x += width * 0.5 - width * scaleX * 0.5;
                render.bounds.min.y += height * 0.5 - height * scaleY * 0.5;
                render.bounds.max.y += height * 0.5 - height * scaleY * 0.5;
              }
              render.bounds.min.x -= padding.x;
              render.bounds.max.x -= padding.x;
              render.bounds.min.y -= padding.y;
              render.bounds.max.y -= padding.y;
              if (render.mouse) {
                Mouse.setScale(render.mouse, {
                  x: (render.bounds.max.x - render.bounds.min.x) / render.canvas.width,
                  y: (render.bounds.max.y - render.bounds.min.y) / render.canvas.height
                });
                Mouse.setOffset(render.mouse, render.bounds.min);
              }
            };
            Render.startViewTransform = function(render) {
              var boundsWidth = render.bounds.max.x - render.bounds.min.x, boundsHeight = render.bounds.max.y - render.bounds.min.y, boundsScaleX = boundsWidth / render.options.width, boundsScaleY = boundsHeight / render.options.height;
              render.context.setTransform(
                render.options.pixelRatio / boundsScaleX,
                0,
                0,
                render.options.pixelRatio / boundsScaleY,
                0,
                0
              );
              render.context.translate(-render.bounds.min.x, -render.bounds.min.y);
            };
            Render.endViewTransform = function(render) {
              render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
            };
            Render.world = function(render, time) {
              var startTime = Common.now(), engine = render.engine, world = engine.world, canvas = render.canvas, context = render.context, options = render.options, timing = render.timing;
              var allBodies = Composite.allBodies(world), allConstraints = Composite.allConstraints(world), background = options.wireframes ? options.wireframeBackground : options.background, bodies = [], constraints = [], i;
              var event = {
                timestamp: engine.timing.timestamp
              };
              Events.trigger(render, "beforeRender", event);
              if (render.currentBackground !== background)
                _applyBackground(render, background);
              context.globalCompositeOperation = "source-in";
              context.fillStyle = "transparent";
              context.fillRect(0, 0, canvas.width, canvas.height);
              context.globalCompositeOperation = "source-over";
              if (options.hasBounds) {
                for (i = 0; i < allBodies.length; i++) {
                  var body = allBodies[i];
                  if (Bounds.overlaps(body.bounds, render.bounds))
                    bodies.push(body);
                }
                for (i = 0; i < allConstraints.length; i++) {
                  var constraint = allConstraints[i], bodyA = constraint.bodyA, bodyB = constraint.bodyB, pointAWorld = constraint.pointA, pointBWorld = constraint.pointB;
                  if (bodyA) pointAWorld = Vector.add(bodyA.position, constraint.pointA);
                  if (bodyB) pointBWorld = Vector.add(bodyB.position, constraint.pointB);
                  if (!pointAWorld || !pointBWorld)
                    continue;
                  if (Bounds.contains(render.bounds, pointAWorld) || Bounds.contains(render.bounds, pointBWorld))
                    constraints.push(constraint);
                }
                Render.startViewTransform(render);
                if (render.mouse) {
                  Mouse.setScale(render.mouse, {
                    x: (render.bounds.max.x - render.bounds.min.x) / render.options.width,
                    y: (render.bounds.max.y - render.bounds.min.y) / render.options.height
                  });
                  Mouse.setOffset(render.mouse, render.bounds.min);
                }
              } else {
                constraints = allConstraints;
                bodies = allBodies;
                if (render.options.pixelRatio !== 1) {
                  render.context.setTransform(render.options.pixelRatio, 0, 0, render.options.pixelRatio, 0, 0);
                }
              }
              if (!options.wireframes || engine.enableSleeping && options.showSleeping) {
                Render.bodies(render, bodies, context);
              } else {
                if (options.showConvexHulls)
                  Render.bodyConvexHulls(render, bodies, context);
                Render.bodyWireframes(render, bodies, context);
              }
              if (options.showBounds)
                Render.bodyBounds(render, bodies, context);
              if (options.showAxes || options.showAngleIndicator)
                Render.bodyAxes(render, bodies, context);
              if (options.showPositions)
                Render.bodyPositions(render, bodies, context);
              if (options.showVelocity)
                Render.bodyVelocity(render, bodies, context);
              if (options.showIds)
                Render.bodyIds(render, bodies, context);
              if (options.showSeparations)
                Render.separations(render, engine.pairs.list, context);
              if (options.showCollisions)
                Render.collisions(render, engine.pairs.list, context);
              if (options.showVertexNumbers)
                Render.vertexNumbers(render, bodies, context);
              if (options.showMousePosition)
                Render.mousePosition(render, render.mouse, context);
              Render.constraints(constraints, context);
              if (options.hasBounds) {
                Render.endViewTransform(render);
              }
              Events.trigger(render, "afterRender", event);
              timing.lastElapsed = Common.now() - startTime;
            };
            Render.stats = function(render, context, time) {
              var engine = render.engine, world = engine.world, bodies = Composite.allBodies(world), parts = 0, width = 55, height = 44, x = 0, y = 0;
              for (var i = 0; i < bodies.length; i += 1) {
                parts += bodies[i].parts.length;
              }
              var sections = {
                "Part": parts,
                "Body": bodies.length,
                "Cons": Composite.allConstraints(world).length,
                "Comp": Composite.allComposites(world).length,
                "Pair": engine.pairs.list.length
              };
              context.fillStyle = "#0e0f19";
              context.fillRect(x, y, width * 5.5, height);
              context.font = "12px Arial";
              context.textBaseline = "top";
              context.textAlign = "right";
              for (var key in sections) {
                var section = sections[key];
                context.fillStyle = "#aaa";
                context.fillText(key, x + width, y + 8);
                context.fillStyle = "#eee";
                context.fillText(section, x + width, y + 26);
                x += width;
              }
            };
            Render.performance = function(render, context) {
              var engine = render.engine, timing = render.timing, deltaHistory = timing.deltaHistory, elapsedHistory = timing.elapsedHistory, timestampElapsedHistory = timing.timestampElapsedHistory, engineDeltaHistory = timing.engineDeltaHistory, engineElapsedHistory = timing.engineElapsedHistory, lastEngineDelta = engine.timing.lastDelta;
              var deltaMean = _mean(deltaHistory), elapsedMean = _mean(elapsedHistory), engineDeltaMean = _mean(engineDeltaHistory), engineElapsedMean = _mean(engineElapsedHistory), timestampElapsedMean = _mean(timestampElapsedHistory), rateMean = timestampElapsedMean / deltaMean || 0, fps = 1e3 / deltaMean || 0;
              var graphHeight = 4, gap = 12, width = 60, height = 34, x = 10, y = 69;
              context.fillStyle = "#0e0f19";
              context.fillRect(0, 50, gap * 4 + width * 5 + 22, height);
              Render.status(
                context,
                x,
                y,
                width,
                graphHeight,
                deltaHistory.length,
                Math.round(fps) + " fps",
                fps / Render._goodFps,
                function(i) {
                  return deltaHistory[i] / deltaMean - 1;
                }
              );
              Render.status(
                context,
                x + gap + width,
                y,
                width,
                graphHeight,
                engineDeltaHistory.length,
                lastEngineDelta.toFixed(2) + " dt",
                Render._goodDelta / lastEngineDelta,
                function(i) {
                  return engineDeltaHistory[i] / engineDeltaMean - 1;
                }
              );
              Render.status(
                context,
                x + (gap + width) * 2,
                y,
                width,
                graphHeight,
                engineElapsedHistory.length,
                engineElapsedMean.toFixed(2) + " ut",
                1 - engineElapsedMean / Render._goodFps,
                function(i) {
                  return engineElapsedHistory[i] / engineElapsedMean - 1;
                }
              );
              Render.status(
                context,
                x + (gap + width) * 3,
                y,
                width,
                graphHeight,
                elapsedHistory.length,
                elapsedMean.toFixed(2) + " rt",
                1 - elapsedMean / Render._goodFps,
                function(i) {
                  return elapsedHistory[i] / elapsedMean - 1;
                }
              );
              Render.status(
                context,
                x + (gap + width) * 4,
                y,
                width,
                graphHeight,
                timestampElapsedHistory.length,
                rateMean.toFixed(2) + " x",
                rateMean * rateMean * rateMean,
                function(i) {
                  return (timestampElapsedHistory[i] / deltaHistory[i] / rateMean || 0) - 1;
                }
              );
            };
            Render.status = function(context, x, y, width, height, count, label, indicator, plotY) {
              context.strokeStyle = "#888";
              context.fillStyle = "#444";
              context.lineWidth = 1;
              context.fillRect(x, y + 7, width, 1);
              context.beginPath();
              context.moveTo(x, y + 7 - height * Common.clamp(0.4 * plotY(0), -2, 2));
              for (var i = 0; i < width; i += 1) {
                context.lineTo(x + i, y + 7 - (i < count ? height * Common.clamp(0.4 * plotY(i), -2, 2) : 0));
              }
              context.stroke();
              context.fillStyle = "hsl(" + Common.clamp(25 + 95 * indicator, 0, 120) + ",100%,60%)";
              context.fillRect(x, y - 7, 4, 4);
              context.font = "12px Arial";
              context.textBaseline = "middle";
              context.textAlign = "right";
              context.fillStyle = "#eee";
              context.fillText(label, x + width, y - 5);
            };
            Render.constraints = function(constraints, context) {
              var c = context;
              for (var i = 0; i < constraints.length; i++) {
                var constraint = constraints[i];
                if (!constraint.render.visible || !constraint.pointA || !constraint.pointB)
                  continue;
                var bodyA = constraint.bodyA, bodyB = constraint.bodyB, start, end;
                if (bodyA) {
                  start = Vector.add(bodyA.position, constraint.pointA);
                } else {
                  start = constraint.pointA;
                }
                if (constraint.render.type === "pin") {
                  c.beginPath();
                  c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                  c.closePath();
                } else {
                  if (bodyB) {
                    end = Vector.add(bodyB.position, constraint.pointB);
                  } else {
                    end = constraint.pointB;
                  }
                  c.beginPath();
                  c.moveTo(start.x, start.y);
                  if (constraint.render.type === "spring") {
                    var delta = Vector.sub(end, start), normal = Vector.perp(Vector.normalise(delta)), coils = Math.ceil(Common.clamp(constraint.length / 5, 12, 20)), offset;
                    for (var j = 1; j < coils; j += 1) {
                      offset = j % 2 === 0 ? 1 : -1;
                      c.lineTo(
                        start.x + delta.x * (j / coils) + normal.x * offset * 4,
                        start.y + delta.y * (j / coils) + normal.y * offset * 4
                      );
                    }
                  }
                  c.lineTo(end.x, end.y);
                }
                if (constraint.render.lineWidth) {
                  c.lineWidth = constraint.render.lineWidth;
                  c.strokeStyle = constraint.render.strokeStyle;
                  c.stroke();
                }
                if (constraint.render.anchors) {
                  c.fillStyle = constraint.render.strokeStyle;
                  c.beginPath();
                  c.arc(start.x, start.y, 3, 0, 2 * Math.PI);
                  c.arc(end.x, end.y, 3, 0, 2 * Math.PI);
                  c.closePath();
                  c.fill();
                }
              }
            };
            Render.bodies = function(render, bodies, context) {
              var c = context;
              render.engine;
              var options = render.options, showInternalEdges = options.showInternalEdges || !options.wireframes, body, part, i, k;
              for (i = 0; i < bodies.length; i++) {
                body = bodies[i];
                if (!body.render.visible)
                  continue;
                for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                  part = body.parts[k];
                  if (!part.render.visible)
                    continue;
                  if (options.showSleeping && body.isSleeping) {
                    c.globalAlpha = 0.5 * part.render.opacity;
                  } else if (part.render.opacity !== 1) {
                    c.globalAlpha = part.render.opacity;
                  }
                  if (part.render.sprite && part.render.sprite.texture && !options.wireframes) {
                    var sprite = part.render.sprite, texture = _getTexture(render, sprite.texture);
                    c.translate(part.position.x, part.position.y);
                    c.rotate(part.angle);
                    c.drawImage(
                      texture,
                      texture.width * -sprite.xOffset * sprite.xScale,
                      texture.height * -sprite.yOffset * sprite.yScale,
                      texture.width * sprite.xScale,
                      texture.height * sprite.yScale
                    );
                    c.rotate(-part.angle);
                    c.translate(-part.position.x, -part.position.y);
                  } else {
                    if (part.circleRadius) {
                      c.beginPath();
                      c.arc(part.position.x, part.position.y, part.circleRadius, 0, 2 * Math.PI);
                    } else {
                      c.beginPath();
                      c.moveTo(part.vertices[0].x, part.vertices[0].y);
                      for (var j = 1; j < part.vertices.length; j++) {
                        if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                          c.lineTo(part.vertices[j].x, part.vertices[j].y);
                        } else {
                          c.moveTo(part.vertices[j].x, part.vertices[j].y);
                        }
                        if (part.vertices[j].isInternal && !showInternalEdges) {
                          c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                        }
                      }
                      c.lineTo(part.vertices[0].x, part.vertices[0].y);
                      c.closePath();
                    }
                    if (!options.wireframes) {
                      c.fillStyle = part.render.fillStyle;
                      if (part.render.lineWidth) {
                        c.lineWidth = part.render.lineWidth;
                        c.strokeStyle = part.render.strokeStyle;
                        c.stroke();
                      }
                      c.fill();
                    } else {
                      c.lineWidth = 1;
                      c.strokeStyle = "#bbb";
                      c.stroke();
                    }
                  }
                  c.globalAlpha = 1;
                }
              }
            };
            Render.bodyWireframes = function(render, bodies, context) {
              var c = context, showInternalEdges = render.options.showInternalEdges, body, part, i, j, k;
              c.beginPath();
              for (i = 0; i < bodies.length; i++) {
                body = bodies[i];
                if (!body.render.visible)
                  continue;
                for (k = body.parts.length > 1 ? 1 : 0; k < body.parts.length; k++) {
                  part = body.parts[k];
                  c.moveTo(part.vertices[0].x, part.vertices[0].y);
                  for (j = 1; j < part.vertices.length; j++) {
                    if (!part.vertices[j - 1].isInternal || showInternalEdges) {
                      c.lineTo(part.vertices[j].x, part.vertices[j].y);
                    } else {
                      c.moveTo(part.vertices[j].x, part.vertices[j].y);
                    }
                    if (part.vertices[j].isInternal && !showInternalEdges) {
                      c.moveTo(part.vertices[(j + 1) % part.vertices.length].x, part.vertices[(j + 1) % part.vertices.length].y);
                    }
                  }
                  c.lineTo(part.vertices[0].x, part.vertices[0].y);
                }
              }
              c.lineWidth = 1;
              c.strokeStyle = "#bbb";
              c.stroke();
            };
            Render.bodyConvexHulls = function(render, bodies, context) {
              var c = context, body, i, j;
              c.beginPath();
              for (i = 0; i < bodies.length; i++) {
                body = bodies[i];
                if (!body.render.visible || body.parts.length === 1)
                  continue;
                c.moveTo(body.vertices[0].x, body.vertices[0].y);
                for (j = 1; j < body.vertices.length; j++) {
                  c.lineTo(body.vertices[j].x, body.vertices[j].y);
                }
                c.lineTo(body.vertices[0].x, body.vertices[0].y);
              }
              c.lineWidth = 1;
              c.strokeStyle = "rgba(255,255,255,0.2)";
              c.stroke();
            };
            Render.vertexNumbers = function(render, bodies, context) {
              var c = context, i, j, k;
              for (i = 0; i < bodies.length; i++) {
                var parts = bodies[i].parts;
                for (k = parts.length > 1 ? 1 : 0; k < parts.length; k++) {
                  var part = parts[k];
                  for (j = 0; j < part.vertices.length; j++) {
                    c.fillStyle = "rgba(255,255,255,0.2)";
                    c.fillText(i + "_" + j, part.position.x + (part.vertices[j].x - part.position.x) * 0.8, part.position.y + (part.vertices[j].y - part.position.y) * 0.8);
                  }
                }
              }
            };
            Render.mousePosition = function(render, mouse, context) {
              var c = context;
              c.fillStyle = "rgba(255,255,255,0.8)";
              c.fillText(mouse.position.x + "  " + mouse.position.y, mouse.position.x + 5, mouse.position.y - 5);
            };
            Render.bodyBounds = function(render, bodies, context) {
              var c = context;
              render.engine;
              var options = render.options;
              c.beginPath();
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i];
                if (body.render.visible) {
                  var parts = bodies[i].parts;
                  for (var j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    var part = parts[j];
                    c.rect(part.bounds.min.x, part.bounds.min.y, part.bounds.max.x - part.bounds.min.x, part.bounds.max.y - part.bounds.min.y);
                  }
                }
              }
              if (options.wireframes) {
                c.strokeStyle = "rgba(255,255,255,0.08)";
              } else {
                c.strokeStyle = "rgba(0,0,0,0.1)";
              }
              c.lineWidth = 1;
              c.stroke();
            };
            Render.bodyAxes = function(render, bodies, context) {
              var c = context;
              render.engine;
              var options = render.options, part, i, j, k;
              c.beginPath();
              for (i = 0; i < bodies.length; i++) {
                var body = bodies[i], parts = body.parts;
                if (!body.render.visible)
                  continue;
                if (options.showAxes) {
                  for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                      var axis = part.axes[k];
                      c.moveTo(part.position.x, part.position.y);
                      c.lineTo(part.position.x + axis.x * 20, part.position.y + axis.y * 20);
                    }
                  }
                } else {
                  for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                    part = parts[j];
                    for (k = 0; k < part.axes.length; k++) {
                      c.moveTo(part.position.x, part.position.y);
                      c.lineTo(
                        (part.vertices[0].x + part.vertices[part.vertices.length - 1].x) / 2,
                        (part.vertices[0].y + part.vertices[part.vertices.length - 1].y) / 2
                      );
                    }
                  }
                }
              }
              if (options.wireframes) {
                c.strokeStyle = "indianred";
                c.lineWidth = 1;
              } else {
                c.strokeStyle = "rgba(255, 255, 255, 0.4)";
                c.globalCompositeOperation = "overlay";
                c.lineWidth = 2;
              }
              c.stroke();
              c.globalCompositeOperation = "source-over";
            };
            Render.bodyPositions = function(render, bodies, context) {
              var c = context;
              render.engine;
              var options = render.options, body, part, i, k;
              c.beginPath();
              for (i = 0; i < bodies.length; i++) {
                body = bodies[i];
                if (!body.render.visible)
                  continue;
                for (k = 0; k < body.parts.length; k++) {
                  part = body.parts[k];
                  c.arc(part.position.x, part.position.y, 3, 0, 2 * Math.PI, false);
                  c.closePath();
                }
              }
              if (options.wireframes) {
                c.fillStyle = "indianred";
              } else {
                c.fillStyle = "rgba(0,0,0,0.5)";
              }
              c.fill();
              c.beginPath();
              for (i = 0; i < bodies.length; i++) {
                body = bodies[i];
                if (body.render.visible) {
                  c.arc(body.positionPrev.x, body.positionPrev.y, 2, 0, 2 * Math.PI, false);
                  c.closePath();
                }
              }
              c.fillStyle = "rgba(255,165,0,0.8)";
              c.fill();
            };
            Render.bodyVelocity = function(render, bodies, context) {
              var c = context;
              c.beginPath();
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i];
                if (!body.render.visible)
                  continue;
                var velocity = Body.getVelocity(body);
                c.moveTo(body.position.x, body.position.y);
                c.lineTo(body.position.x + velocity.x, body.position.y + velocity.y);
              }
              c.lineWidth = 3;
              c.strokeStyle = "cornflowerblue";
              c.stroke();
            };
            Render.bodyIds = function(render, bodies, context) {
              var c = context, i, j;
              for (i = 0; i < bodies.length; i++) {
                if (!bodies[i].render.visible)
                  continue;
                var parts = bodies[i].parts;
                for (j = parts.length > 1 ? 1 : 0; j < parts.length; j++) {
                  var part = parts[j];
                  c.font = "12px Arial";
                  c.fillStyle = "rgba(255,255,255,0.5)";
                  c.fillText(part.id, part.position.x + 10, part.position.y - 10);
                }
              }
            };
            Render.collisions = function(render, pairs, context) {
              var c = context, options = render.options, pair, collision, i, j;
              c.beginPath();
              for (i = 0; i < pairs.length; i++) {
                pair = pairs[i];
                if (!pair.isActive)
                  continue;
                collision = pair.collision;
                for (j = 0; j < pair.activeContacts.length; j++) {
                  var contact = pair.activeContacts[j], vertex = contact.vertex;
                  c.rect(vertex.x - 1.5, vertex.y - 1.5, 3.5, 3.5);
                }
              }
              if (options.wireframes) {
                c.fillStyle = "rgba(255,255,255,0.7)";
              } else {
                c.fillStyle = "orange";
              }
              c.fill();
              c.beginPath();
              for (i = 0; i < pairs.length; i++) {
                pair = pairs[i];
                if (!pair.isActive)
                  continue;
                collision = pair.collision;
                if (pair.activeContacts.length > 0) {
                  var normalPosX = pair.activeContacts[0].vertex.x, normalPosY = pair.activeContacts[0].vertex.y;
                  if (pair.activeContacts.length === 2) {
                    normalPosX = (pair.activeContacts[0].vertex.x + pair.activeContacts[1].vertex.x) / 2;
                    normalPosY = (pair.activeContacts[0].vertex.y + pair.activeContacts[1].vertex.y) / 2;
                  }
                  if (collision.bodyB === collision.supports[0].body || collision.bodyA.isStatic === true) {
                    c.moveTo(normalPosX - collision.normal.x * 8, normalPosY - collision.normal.y * 8);
                  } else {
                    c.moveTo(normalPosX + collision.normal.x * 8, normalPosY + collision.normal.y * 8);
                  }
                  c.lineTo(normalPosX, normalPosY);
                }
              }
              if (options.wireframes) {
                c.strokeStyle = "rgba(255,165,0,0.7)";
              } else {
                c.strokeStyle = "orange";
              }
              c.lineWidth = 1;
              c.stroke();
            };
            Render.separations = function(render, pairs, context) {
              var c = context, options = render.options, pair, collision, bodyA, bodyB, i;
              c.beginPath();
              for (i = 0; i < pairs.length; i++) {
                pair = pairs[i];
                if (!pair.isActive)
                  continue;
                collision = pair.collision;
                bodyA = collision.bodyA;
                bodyB = collision.bodyB;
                var k = 1;
                if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
                if (bodyB.isStatic) k = 0;
                c.moveTo(bodyB.position.x, bodyB.position.y);
                c.lineTo(bodyB.position.x - collision.penetration.x * k, bodyB.position.y - collision.penetration.y * k);
                k = 1;
                if (!bodyB.isStatic && !bodyA.isStatic) k = 0.5;
                if (bodyA.isStatic) k = 0;
                c.moveTo(bodyA.position.x, bodyA.position.y);
                c.lineTo(bodyA.position.x + collision.penetration.x * k, bodyA.position.y + collision.penetration.y * k);
              }
              if (options.wireframes) {
                c.strokeStyle = "rgba(255,165,0,0.5)";
              } else {
                c.strokeStyle = "orange";
              }
              c.stroke();
            };
            Render.inspector = function(inspector, context) {
              inspector.engine;
              var selected = inspector.selected, render = inspector.render, options = render.options, bounds;
              if (options.hasBounds) {
                var boundsWidth = render.bounds.max.x - render.bounds.min.x, boundsHeight = render.bounds.max.y - render.bounds.min.y, boundsScaleX = boundsWidth / render.options.width, boundsScaleY = boundsHeight / render.options.height;
                context.scale(1 / boundsScaleX, 1 / boundsScaleY);
                context.translate(-render.bounds.min.x, -render.bounds.min.y);
              }
              for (var i = 0; i < selected.length; i++) {
                var item = selected[i].data;
                context.translate(0.5, 0.5);
                context.lineWidth = 1;
                context.strokeStyle = "rgba(255,165,0,0.9)";
                context.setLineDash([1, 2]);
                switch (item.type) {
                  case "body":
                    bounds = item.bounds;
                    context.beginPath();
                    context.rect(
                      Math.floor(bounds.min.x - 3),
                      Math.floor(bounds.min.y - 3),
                      Math.floor(bounds.max.x - bounds.min.x + 6),
                      Math.floor(bounds.max.y - bounds.min.y + 6)
                    );
                    context.closePath();
                    context.stroke();
                    break;
                  case "constraint":
                    var point = item.pointA;
                    if (item.bodyA)
                      point = item.pointB;
                    context.beginPath();
                    context.arc(point.x, point.y, 10, 0, 2 * Math.PI);
                    context.closePath();
                    context.stroke();
                    break;
                }
                context.setLineDash([]);
                context.translate(-0.5, -0.5);
              }
              if (inspector.selectStart !== null) {
                context.translate(0.5, 0.5);
                context.lineWidth = 1;
                context.strokeStyle = "rgba(255,165,0,0.6)";
                context.fillStyle = "rgba(255,165,0,0.1)";
                bounds = inspector.selectBounds;
                context.beginPath();
                context.rect(
                  Math.floor(bounds.min.x),
                  Math.floor(bounds.min.y),
                  Math.floor(bounds.max.x - bounds.min.x),
                  Math.floor(bounds.max.y - bounds.min.y)
                );
                context.closePath();
                context.stroke();
                context.fill();
                context.translate(-0.5, -0.5);
              }
              if (options.hasBounds)
                context.setTransform(1, 0, 0, 1, 0, 0);
            };
            var _updateTiming = function(render, time) {
              var engine = render.engine, timing = render.timing, historySize = timing.historySize, timestamp = engine.timing.timestamp;
              timing.delta = time - timing.lastTime || Render._goodDelta;
              timing.lastTime = time;
              timing.timestampElapsed = timestamp - timing.lastTimestamp || 0;
              timing.lastTimestamp = timestamp;
              timing.deltaHistory.unshift(timing.delta);
              timing.deltaHistory.length = Math.min(timing.deltaHistory.length, historySize);
              timing.engineDeltaHistory.unshift(engine.timing.lastDelta);
              timing.engineDeltaHistory.length = Math.min(timing.engineDeltaHistory.length, historySize);
              timing.timestampElapsedHistory.unshift(timing.timestampElapsed);
              timing.timestampElapsedHistory.length = Math.min(timing.timestampElapsedHistory.length, historySize);
              timing.engineElapsedHistory.unshift(engine.timing.lastElapsed);
              timing.engineElapsedHistory.length = Math.min(timing.engineElapsedHistory.length, historySize);
              timing.elapsedHistory.unshift(timing.lastElapsed);
              timing.elapsedHistory.length = Math.min(timing.elapsedHistory.length, historySize);
            };
            var _mean = function(values) {
              var result = 0;
              for (var i = 0; i < values.length; i += 1) {
                result += values[i];
              }
              return result / values.length || 0;
            };
            var _createCanvas = function(width, height) {
              var canvas = document.createElement("canvas");
              canvas.width = width;
              canvas.height = height;
              canvas.oncontextmenu = function() {
                return false;
              };
              canvas.onselectstart = function() {
                return false;
              };
              return canvas;
            };
            var _getPixelRatio = function(canvas) {
              var context = canvas.getContext("2d"), devicePixelRatio = window.devicePixelRatio || 1, backingStorePixelRatio = context.webkitBackingStorePixelRatio || context.mozBackingStorePixelRatio || context.msBackingStorePixelRatio || context.oBackingStorePixelRatio || context.backingStorePixelRatio || 1;
              return devicePixelRatio / backingStorePixelRatio;
            };
            var _getTexture = function(render, imagePath) {
              var image = render.textures[imagePath];
              if (image)
                return image;
              image = render.textures[imagePath] = new Image();
              image.src = imagePath;
              return image;
            };
            var _applyBackground = function(render, background) {
              var cssBackground = background;
              if (/(jpg|gif|png)$/.test(background))
                cssBackground = "url(" + background + ")";
              render.canvas.style.background = cssBackground;
              render.canvas.style.backgroundSize = "contain";
              render.currentBackground = background;
            };
          })();
        },
        /* 27 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Runner = {};
          module2.exports = Runner;
          var Events = __webpack_require__(5);
          var Engine = __webpack_require__(17);
          var Common = __webpack_require__(0);
          (function() {
            var _requestAnimationFrame, _cancelAnimationFrame;
            if (typeof window !== "undefined") {
              _requestAnimationFrame = window.requestAnimationFrame || window.webkitRequestAnimationFrame || window.mozRequestAnimationFrame || window.msRequestAnimationFrame;
              _cancelAnimationFrame = window.cancelAnimationFrame || window.mozCancelAnimationFrame || window.webkitCancelAnimationFrame || window.msCancelAnimationFrame;
            }
            if (!_requestAnimationFrame) {
              var _frameTimeout;
              _requestAnimationFrame = function(callback) {
                _frameTimeout = setTimeout(function() {
                  callback(Common.now());
                }, 1e3 / 60);
              };
              _cancelAnimationFrame = function() {
                clearTimeout(_frameTimeout);
              };
            }
            Runner.create = function(options) {
              var defaults = {
                fps: 60,
                deltaSampleSize: 60,
                counterTimestamp: 0,
                frameCounter: 0,
                deltaHistory: [],
                timePrev: null,
                frameRequestId: null,
                isFixed: false,
                enabled: true
              };
              var runner = Common.extend(defaults, options);
              runner.delta = runner.delta || 1e3 / runner.fps;
              runner.deltaMin = runner.deltaMin || 1e3 / runner.fps;
              runner.deltaMax = runner.deltaMax || 1e3 / (runner.fps * 0.5);
              runner.fps = 1e3 / runner.delta;
              return runner;
            };
            Runner.run = function(runner, engine) {
              if (typeof runner.positionIterations !== "undefined") {
                engine = runner;
                runner = Runner.create();
              }
              (function run(time) {
                runner.frameRequestId = _requestAnimationFrame(run);
                if (time && runner.enabled) {
                  Runner.tick(runner, engine, time);
                }
              })();
              return runner;
            };
            Runner.tick = function(runner, engine, time) {
              var timing = engine.timing, delta;
              if (runner.isFixed) {
                delta = runner.delta;
              } else {
                delta = time - runner.timePrev || runner.delta;
                runner.timePrev = time;
                runner.deltaHistory.push(delta);
                runner.deltaHistory = runner.deltaHistory.slice(-runner.deltaSampleSize);
                delta = Math.min.apply(null, runner.deltaHistory);
                delta = delta < runner.deltaMin ? runner.deltaMin : delta;
                delta = delta > runner.deltaMax ? runner.deltaMax : delta;
                runner.delta = delta;
              }
              var event = {
                timestamp: timing.timestamp
              };
              Events.trigger(runner, "beforeTick", event);
              runner.frameCounter += 1;
              if (time - runner.counterTimestamp >= 1e3) {
                runner.fps = runner.frameCounter * ((time - runner.counterTimestamp) / 1e3);
                runner.counterTimestamp = time;
                runner.frameCounter = 0;
              }
              Events.trigger(runner, "tick", event);
              Events.trigger(runner, "beforeUpdate", event);
              Engine.update(engine, delta);
              Events.trigger(runner, "afterUpdate", event);
              Events.trigger(runner, "afterTick", event);
            };
            Runner.stop = function(runner) {
              _cancelAnimationFrame(runner.frameRequestId);
            };
            Runner.start = function(runner, engine) {
              Runner.run(runner, engine);
            };
          })();
        },
        /* 28 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var SAT = {};
          module2.exports = SAT;
          var Collision = __webpack_require__(8);
          var Common = __webpack_require__(0);
          var deprecated = Common.deprecated;
          (function() {
            SAT.collides = function(bodyA, bodyB) {
              return Collision.collides(bodyA, bodyB);
            };
            deprecated(SAT, "collides", "SAT.collides ➤ replaced by Collision.collides");
          })();
        },
        /* 29 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var Svg = {};
          module2.exports = Svg;
          __webpack_require__(1);
          var Common = __webpack_require__(0);
          (function() {
            Svg.pathToVertices = function(path, sampleLength) {
              if (typeof window !== "undefined" && !("SVGPathSeg" in window)) {
                Common.warn("Svg.pathToVertices: SVGPathSeg not defined, a polyfill is required.");
              }
              var i, il, total, point, segment, segments, segmentsQueue, lastSegment, lastPoint, segmentIndex, points = [], lx, ly, length = 0, x = 0, y = 0;
              sampleLength = sampleLength || 15;
              var addPoint = function(px, py, pathSegType) {
                var isRelative = pathSegType % 2 === 1 && pathSegType > 1;
                if (!lastPoint || px != lastPoint.x || py != lastPoint.y) {
                  if (lastPoint && isRelative) {
                    lx = lastPoint.x;
                    ly = lastPoint.y;
                  } else {
                    lx = 0;
                    ly = 0;
                  }
                  var point2 = {
                    x: lx + px,
                    y: ly + py
                  };
                  if (isRelative || !lastPoint) {
                    lastPoint = point2;
                  }
                  points.push(point2);
                  x = lx + px;
                  y = ly + py;
                }
              };
              var addSegmentPoint = function(segment2) {
                var segType = segment2.pathSegTypeAsLetter.toUpperCase();
                if (segType === "Z")
                  return;
                switch (segType) {
                  case "M":
                  case "L":
                  case "T":
                  case "C":
                  case "S":
                  case "Q":
                    x = segment2.x;
                    y = segment2.y;
                    break;
                  case "H":
                    x = segment2.x;
                    break;
                  case "V":
                    y = segment2.y;
                    break;
                }
                addPoint(x, y, segment2.pathSegType);
              };
              Svg._svgPathToAbsolute(path);
              total = path.getTotalLength();
              segments = [];
              for (i = 0; i < path.pathSegList.numberOfItems; i += 1)
                segments.push(path.pathSegList.getItem(i));
              segmentsQueue = segments.concat();
              while (length < total) {
                segmentIndex = path.getPathSegAtLength(length);
                segment = segments[segmentIndex];
                if (segment != lastSegment) {
                  while (segmentsQueue.length && segmentsQueue[0] != segment)
                    addSegmentPoint(segmentsQueue.shift());
                  lastSegment = segment;
                }
                switch (segment.pathSegTypeAsLetter.toUpperCase()) {
                  case "C":
                  case "T":
                  case "S":
                  case "Q":
                  case "A":
                    point = path.getPointAtLength(length);
                    addPoint(point.x, point.y, 0);
                    break;
                }
                length += sampleLength;
              }
              for (i = 0, il = segmentsQueue.length; i < il; ++i)
                addSegmentPoint(segmentsQueue[i]);
              return points;
            };
            Svg._svgPathToAbsolute = function(path) {
              var x0, y0, x1, y1, x2, y2, segs = path.pathSegList, x = 0, y = 0, len = segs.numberOfItems;
              for (var i = 0; i < len; ++i) {
                var seg = segs.getItem(i), segType = seg.pathSegTypeAsLetter;
                if (/[MLHVCSQTA]/.test(segType)) {
                  if ("x" in seg) x = seg.x;
                  if ("y" in seg) y = seg.y;
                } else {
                  if ("x1" in seg) x1 = x + seg.x1;
                  if ("x2" in seg) x2 = x + seg.x2;
                  if ("y1" in seg) y1 = y + seg.y1;
                  if ("y2" in seg) y2 = y + seg.y2;
                  if ("x" in seg) x += seg.x;
                  if ("y" in seg) y += seg.y;
                  switch (segType) {
                    case "m":
                      segs.replaceItem(path.createSVGPathSegMovetoAbs(x, y), i);
                      break;
                    case "l":
                      segs.replaceItem(path.createSVGPathSegLinetoAbs(x, y), i);
                      break;
                    case "h":
                      segs.replaceItem(path.createSVGPathSegLinetoHorizontalAbs(x), i);
                      break;
                    case "v":
                      segs.replaceItem(path.createSVGPathSegLinetoVerticalAbs(y), i);
                      break;
                    case "c":
                      segs.replaceItem(path.createSVGPathSegCurvetoCubicAbs(x, y, x1, y1, x2, y2), i);
                      break;
                    case "s":
                      segs.replaceItem(path.createSVGPathSegCurvetoCubicSmoothAbs(x, y, x2, y2), i);
                      break;
                    case "q":
                      segs.replaceItem(path.createSVGPathSegCurvetoQuadraticAbs(x, y, x1, y1), i);
                      break;
                    case "t":
                      segs.replaceItem(path.createSVGPathSegCurvetoQuadraticSmoothAbs(x, y), i);
                      break;
                    case "a":
                      segs.replaceItem(path.createSVGPathSegArcAbs(x, y, seg.r1, seg.r2, seg.angle, seg.largeArcFlag, seg.sweepFlag), i);
                      break;
                    case "z":
                    case "Z":
                      x = x0;
                      y = y0;
                      break;
                  }
                }
                if (segType == "M" || segType == "m") {
                  x0 = x;
                  y0 = y;
                }
              }
            };
          })();
        },
        /* 30 */
        /***/
        function(module2, exports2, __webpack_require__) {
          var World = {};
          module2.exports = World;
          var Composite = __webpack_require__(6);
          __webpack_require__(0);
          (function() {
            World.create = Composite.create;
            World.add = Composite.add;
            World.remove = Composite.remove;
            World.clear = Composite.clear;
            World.addComposite = Composite.addComposite;
            World.addBody = Composite.addBody;
            World.addConstraint = Composite.addConstraint;
          })();
        }
        /******/
      ])
    );
  });
})(matter);
var matterExports = matter.exports;
const Matter = /* @__PURE__ */ getDefaultExportFromCjs(matterExports);
class KeyStates {
  constructor() {
    this.keys = /* @__PURE__ */ new Map();
    this.justPressed = /* @__PURE__ */ new Set();
    this.onKeyDown = this.handleKeyDown.bind(this);
    this.onKeyUp = this.handleKeyUp.bind(this);
    if (typeof document !== "undefined") {
      document.addEventListener("keydown", this.onKeyDown);
      document.addEventListener("keyup", this.onKeyUp);
    }
  }
  /** Release the document listeners and forget every binding. */
  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener("keydown", this.onKeyDown);
      document.removeEventListener("keyup", this.onKeyUp);
    }
    this.keys.clear();
    this.justPressed.clear();
  }
  addKey(keyName, callback) {
    this.keys.set(keyName, {
      isPressed: false,
      callback
    });
  }
  removeKey(keyName) {
    this.keys.delete(keyName);
  }
  handleKeyDown(event) {
    if (event.repeat) return;
    const key = this.keys.get(event.key);
    if (key && !key.isPressed) {
      key.isPressed = true;
      this.justPressed.add(event.key);
      if (key.callback) key.callback(true);
    }
  }
  handleKeyUp(event) {
    const key = this.keys.get(event.key);
    if (key) {
      key.isPressed = false;
      this.justPressed.delete(event.key);
      if (key.callback) key.callback(false);
    }
  }
  update() {
    this.justPressed.clear();
  }
  isJustPressed(keyName) {
    return this.justPressed.has(keyName);
  }
  pressedKeys() {
    const pressed = /* @__PURE__ */ new Set();
    for (let [name, key] of this.keys) {
      if (key.isPressed) pressed.add(name);
    }
    return pressed;
  }
}
class LayerManager {
  constructor() {
    this.layers = [];
    this.game = null;
  }
  setGame(game) {
    this.game = game;
  }
  addLayer(name, layer) {
    layer.sprite.game = this.game;
    this.layers.push([name, layer]);
  }
  clear() {
    this.layers = [];
  }
  draw() {
    for (let [name, layer] of this.layers) {
      this.drawLayer(name);
    }
  }
  drawLayer(layerName) {
    for (let [name, layer] of this.layers) {
      if (layerName !== void 0 && layerName !== name) {
        continue;
      }
      for (let tile of layer.tiles) {
        const anim = layer.sprite.animations.get(tile.anim);
        if (!anim) continue;
        layer.sprite.draw(tile.anim, tile.pos.x, tile.pos.y, {
          game: this.game
        });
      }
    }
  }
  constructLayer(sprite, x, y, tileSize, fields) {
    let layer = { sprite, tiles: [] };
    for (let i = 0; i < x; i++) {
      for (let j = 0; j < y; j++) {
        layer.tiles.push({
          pos: { x: i * tileSize, y: j * tileSize },
          ...fields
        });
      }
    }
    return layer;
  }
}
const CollisionCategories = {
  default: 1,
  player: 2,
  platform: 4,
  movingPlatform: 8,
  enemy: 16,
  coin: 32,
  trigger: 64,
  projectile: 128
};
class SpriteSheet {
  constructor(image, tileW, tileH, game, width = tileW, height = tileH) {
    this.tileW = tileW;
    this.tileH = tileH;
    this.width = width;
    this.height = height;
    this.animations = /* @__PURE__ */ new Map();
    this.currentFrame = 0;
    this.image = image;
    this.loaded = true;
    this.game = game;
  }
  define(name, tileX, tileY) {
    this.animations.set(name, { tileX, tileY });
  }
  draw(anim, x, y, options = {}) {
    if (!this.loaded) return;
    if (!this.game) {
      console.error("Game instance not found");
      return;
    }
    if (!anim) {
      this.game.renderer.drawSprite({
        image: this.image,
        x,
        y,
        tileWidth: this.tileW,
        tileHeight: this.tileH,
        tileX: this.currentFrame,
        tileY: 0,
        ...options
      });
      return;
    }
    const animation = this.animations.get(anim);
    if (!animation) {
      console.warn(`Animation ${anim} not found`);
      return;
    }
    this.game.renderer.drawSprite({
      image: this.image,
      x,
      y,
      tileWidth: this.tileW,
      tileHeight: this.tileH,
      tileX: animation.tileX + this.currentFrame,
      tileY: animation.tileY,
      ...options
    });
  }
}
class Container {
  constructor(game) {
    this.game = game;
    this.elements = /* @__PURE__ */ new Set();
    this.hoveredElement = null;
  }
  clear() {
    this.elements.clear();
    this.hoveredElement = null;
  }
  addElement(element) {
    element.setGame(this.game);
    this.elements.add(element);
    return element;
  }
  onMouseMove(x, y) {
    let newHovered = null;
    const hitElements = Array.from(this.elements).filter((element) => element.contains(x, y)).reverse();
    hitElements.forEach((element) => {
      element.onMouseMove(x, y);
      if (element.isHovered) {
        newHovered = element;
      }
    });
    if (this.hoveredElement !== newHovered) {
      if (this.hoveredElement) {
        this.hoveredElement.isHovered = false;
        this.hoveredElement.onMouseLeave();
      }
      this.hoveredElement = newHovered;
      if (newHovered) {
        newHovered.onMouseEnter();
      }
    }
  }
  onMouseDown(x, y) {
    const hitElements = Array.from(this.elements).filter((element) => element.contains(x, y)).reverse();
    for (const element of hitElements) {
      const shouldStopPropagation = element.onMouseDown(x, y);
      if (shouldStopPropagation) {
        break;
      }
    }
  }
  update(deltaTime) {
    for (const element of this.elements) {
      element.update(deltaTime);
    }
  }
  draw(deltaTime) {
    for (const element of this.elements) {
      element.draw(deltaTime);
    }
  }
}
const ANCHOR_ORIGINS = Object.freeze({
  "top-left": [0, 0],
  "top": [0.5, 0],
  "top-right": [1, 0],
  "left": [0, 0.5],
  "center": [0.5, 0.5],
  "right": [1, 0.5],
  "bottom-left": [0, 1],
  "bottom": [0.5, 1],
  "bottom-right": [1, 1]
});
class UIElement {
  /**
   * @param {number} x - Offset from the anchor along x, in UI units
   * @param {number} y - Offset from the anchor along y, in UI units
   * @param {number} [width] - Width in UI units
   * @param {number} [height] - Height in UI units
   * @param {Object} [options]
   * @param {keyof ANCHOR_ORIGINS} [options.anchor='top-left'] - Corner/edge the offset is measured from
   */
  constructor(x, y, width, height, options = {}) {
    __privateAdd(this, _UIElement_instances);
    this.offsetX = x;
    this.offsetY = y;
    this.anchor = options.anchor || "top-left";
    this.width = width;
    this.height = height;
    this.visible = true;
    this.isHovered = false;
    this.isFocused = false;
    this.game = null;
    this.stopPropagation = false;
  }
  /** Resolved position in UI space. @type {number} */
  get x() {
    return this.offsetX + __privateMethod(this, _UIElement_instances, origin_fn).call(this)[0];
  }
  set x(value) {
    this.offsetX = value - __privateMethod(this, _UIElement_instances, origin_fn).call(this)[0];
  }
  /** Resolved position in UI space. @type {number} */
  get y() {
    return this.offsetY + __privateMethod(this, _UIElement_instances, origin_fn).call(this)[1];
  }
  set y(value) {
    this.offsetY = value - __privateMethod(this, _UIElement_instances, origin_fn).call(this)[1];
  }
  setGame(game) {
    this.game = game;
  }
  update(deltaTime) {
  }
  draw(deltaTime) {
  }
  contains(x, y) {
    const hit = this.game.uiRenderer.hitTest(x, y, {
      type: "rect",
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height
    });
    return hit;
  }
  onMouseMove(x, y) {
    const wasHovered = this.isHovered;
    this.isHovered = this.contains(x, y);
    if (wasHovered !== this.isHovered) {
      if (this.isHovered) this.onMouseEnter();
      else this.onMouseLeave();
    }
    return this.stopPropagation;
  }
  onMouseDown(x, y) {
    if (this.contains(x, y)) {
      this.onClick(x, y);
      return this.stopPropagation;
    }
    return false;
  }
  onMouseEnter() {
  }
  onMouseLeave() {
  }
  onClick(x, y) {
  }
  onFocus() {
    this.isFocused = true;
  }
  onBlur() {
    this.isFocused = false;
  }
  destroy() {
    this.visible = false;
    this.isHovered = false;
    this.isFocused = false;
  }
}
_UIElement_instances = new WeakSet();
/** The anchor's origin in UI units, or [0, 0] before the element has a game. */
origin_fn = function() {
  var _a;
  const ui = (_a = this.game) == null ? void 0 : _a.uiRenderer;
  if (!ui) return [0, 0];
  const [fx, fy] = ANCHOR_ORIGINS[this.anchor] || ANCHOR_ORIGINS["top-left"];
  return [fx * ui.width, fy * ui.height];
};
class UIButton extends UIElement {
  constructor(x, y, width, height, text, onClick, style = {}) {
    super(x, y, void 0, void 0, style);
    this.width = width;
    this.height = height;
    this.text = text;
    this.handleClick = onClick;
    this.backgroundColor = style.backgroundColor || "#000";
    this.hoverColor = style.hoverColor || "#333";
    this.textColor = style.textColor || "#fff";
    this.fontSize = style.fontSize || "16px";
    this.fontFamily = style.fontFamily || "system-ui";
    this.isHovered = false;
  }
  draw() {
    if (!this.game) return;
    const fillStyle = this.isHovered ? this.hoverColor : this.backgroundColor;
    this.game.uiRenderer.drawRect({
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
      fillStyle
    });
    this.game.uiRenderer.drawText({
      text: this.text,
      x: this.x,
      y: this.y,
      fillStyle: this.textColor,
      fontSize: this.fontSize,
      fontFamily: this.fontFamily,
      textAlign: "center",
      textBaseline: "middle"
    });
  }
  onMouseEnter() {
    this.isHovered = true;
    this.game.uiRenderer.setCursor("pointer");
  }
  onMouseLeave() {
    this.isHovered = false;
    this.game.uiRenderer.setCursor("default");
  }
  onClick() {
    if (this.handleClick) {
      this.handleClick();
    }
  }
}
class UIText extends UIElement {
  constructor(x, y, text, options = {}) {
    super(x, y, void 0, void 0, options);
    this.text = text;
    this.fontSize = options.fontSize || "16px";
    this.color = options.color || "#000";
    this.align = options.align || "left";
  }
  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawText({
      text: this.text,
      x: this.x,
      y: this.y,
      fillStyle: this.color,
      fontSize: this.fontSize,
      textAlign: this.align,
      textBaseline: "top"
    });
  }
}
class UIImage extends UIElement {
  constructor(x, y, image, options = {}) {
    super(x, y, void 0, void 0, options);
    this.image = image;
    this.width = options.width || image.width;
    this.height = options.height || image.height;
    this.scale = options.scale || 1;
  }
  draw() {
    if (!this.game) return;
    const width = this.width * this.scale;
    const height = this.height * this.scale;
    this.game.uiRenderer.drawImage({
      image: this.image,
      x: this.x - width / 2,
      y: this.y - height / 2,
      width,
      height
    });
  }
}
class UIRectangle extends UIElement {
  /**
   * @param {Object} [options]
   * @param {boolean} [options.fill=false] - Stretch over the whole UI space
   *   every draw, ignoring position and size. For backgrounds: UI space grows
   *   with the display's aspect ratio, so no fixed design-sized rect can be
   *   relied on to cover it.
   * @param {boolean} [options.interactive=false] - Whether it takes part in hit testing
   */
  constructor(x, y, width, height, color, options = {}) {
    super(x, y, void 0, void 0, options);
    this.width = width;
    this.height = height;
    this.color = color;
    this.fill = options.fill || false;
    this.interactive = options.interactive || false;
  }
  draw() {
    if (!this.game) return;
    const ui = this.game.uiRenderer;
    if (this.fill) {
      ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: this.color });
      return;
    }
    ui.drawRect({
      x: this.x - this.width / 2,
      y: this.y - this.height / 2,
      width: this.width,
      height: this.height,
      fillStyle: this.color
    });
  }
  contains(x, y) {
    if (!this.interactive) return false;
    return super.contains(x, y);
  }
}
class PerformanceStats extends UIElement {
  constructor(game, x, y, options = {}) {
    super(x, y, void 0, void 0, options);
    this.options = {
      show: options.show ?? false,
      textColor: options.textColor ?? "#00ff00",
      font: {
        size: options.fontSize ?? "14px",
        family: options.fontFamily ?? "monospace"
      }
    };
    this.game = game;
  }
  draw() {
    if (!this.game || !this.options.show) return;
    const renderer = this.game.renderer;
    const fps = renderer.getFPS();
    const avgFps = renderer.getAverageFPS();
    const stats = renderer.getStats();
    const text = "FPS: " + fps + " · Avg FPS: " + avgFps + " · Primitives: " + stats.primitives + " · Draw Calls: " + stats.drawCalls + " · State Changes: " + stats.stateChanges + " · Sprites: " + stats.spritesDrawn + " · Text: " + stats.textDrawn + " · Shapes: " + stats.shapesDrawn;
    this.game.uiRenderer.drawText({
      text,
      x: this.x,
      y: this.y,
      fillStyle: this.options.textColor,
      fontSize: this.options.font.size,
      fontFamily: this.options.font.family,
      textAlign: "left",
      textBaseline: "top"
    });
  }
}
class Scene {
  constructor(game, config) {
    __privateAdd(this, _Scene_instances);
    this.game = game;
    this.config = config;
    this.sprites = /* @__PURE__ */ new Map();
    this.spriteSheets = /* @__PURE__ */ new Map();
    this.ui = new Container(game);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
  }
  _handleMouseMove(event) {
    const { x, y } = this.game.getUIPosition(event);
    this.ui.onMouseMove(x, y);
  }
  _handleMouseDown(event) {
    const { x, y } = this.game.getUIPosition(event);
    this.ui.onMouseDown(x, y);
  }
  async load() {
    await this.loadAssets();
    this.setupScene();
    this.game.canvas.addEventListener("mousemove", this._handleMouseMove);
    this.game.canvas.addEventListener("mousedown", this._handleMouseDown);
    this.game.camera.init(this);
    if (this.config.type === "level") {
      console.debug("Setting up level scene");
      await this.setupLevelScene();
    } else {
      console.debug("Setting up UI scene");
      await this.setupUIScene();
    }
    if (this.config.onEnter) {
      this.config.onEnter();
    }
  }
  async loadAssets() {
    var _a;
    if (!((_a = this.config.assets) == null ? void 0 : _a.spritesheets)) return;
    const loadPromises = Object.entries(this.config.assets.spritesheets).map(
      ([key, spritesheet]) => new Promise((resolve, reject) => {
        const img = new window.Image();
        img.onload = () => {
          const sheet = new SpriteSheet(img, spritesheet.frameWidth, spritesheet.frameHeight, this.game);
          this.sprites.set(key, img);
          this.spriteSheets.set(key, sheet);
          if (spritesheet.animations) {
            Object.entries(spritesheet.animations).forEach(([name, anim]) => {
              anim.frames.forEach(([tileX, tileY]) => {
                sheet.define(name, tileX, tileY);
              });
            });
          } else {
            sheet.define("default", 0, 0);
          }
          resolve();
        };
        img.onerror = (error) => {
          console.error(`Failed to load sprite: ${spritesheet.url}`, error);
          reject(error);
        };
        img.src = this.game.options.basePath + spritesheet.url;
      })
    );
    try {
      await Promise.all(loadPromises);
    } catch (error) {
      console.error("Error loading sprites:", error);
      throw error;
    }
  }
  setupScene() {
    this.game.entities.clear();
    Matter.Composite.clear(this.game.engine.world);
    this.game.layers.clear();
    this.game.player = null;
    this.ui.clear();
    const stats = new PerformanceStats(this.game, 20, -34, {
      anchor: "bottom-left",
      textColor: "#00ff00",
      show: true
    });
    this.ui.addElement(stats);
    if (this.config.world) {
      Matter.Engine.clear(this.game.engine);
      Matter.Engine.update(this.game.engine, 0);
      if (this.config.world.gravity) {
        this.game.engine.gravity = this.config.world.gravity;
      }
    }
    if (this.config.background) {
      this.setupBackground(this.config.background);
    }
  }
  /**
   * Tile one spritesheet frame across the world as a background layer.
   *
   * @param {Object} background - `{ spritesheet, tileX, tileY }`; the loader
   *   has already checked the spritesheet exists.
   */
  setupBackground({ spritesheet, tileX = 0, tileY = 0 }) {
    const spriteSheet = this.spriteSheets.get(spritesheet);
    const tileSize = this.config.assets.spritesheets[spritesheet].frameWidth;
    spriteSheet.define("default", tileX, tileY);
    const tileCountX = Math.ceil(this.game.options.worldWidth / tileSize);
    const tileCountY = Math.ceil(this.game.options.worldHeight / tileSize);
    const bgLayer = this.game.layers.constructLayer(spriteSheet, tileCountX, tileCountY, tileSize, { anim: "default" });
    this.game.layers.addLayer("background", bgLayer);
  }
  async setupLevelScene() {
    if (!this.config.layers) {
      return;
    }
    this.config.layers.forEach((layer) => {
      layer.objects.forEach((object) => {
        const prefab = this.config.prefabs[object.prefab];
        if (!prefab) {
          console.error(`Prefab not found: ${object.prefab}`);
          return;
        }
        const entity = this.createPrefabInstance({
          type: prefab.actor,
          position: [object.x, object.y],
          size: [object.width, object.height],
          sprite: prefab.spritesheet,
          defaultAnimation: prefab.defaultAnimation,
          physics: prefab.physics,
          options: object.properties
        });
        if (entity) {
          if (entity.name === "Player") {
            this.game.player = entity;
            this.game.camera.follow(entity);
          }
          this.game.entities.add(entity);
          Matter.Composite.add(this.game.engine.world, entity.body);
        }
      });
    });
  }
  createPrefabInstance(data) {
    const spritesheet = this.spriteSheets.get(data.sprite);
    const entity = this.game.createEntity(
      data.type,
      data.position[0],
      data.position[1],
      data.size[0],
      data.size[1],
      spritesheet,
      data.options,
      data.physics
    );
    if (!entity) return null;
    entity.setAnimation(data.defaultAnimation || "default");
    return entity;
  }
  async setupUIScene() {
    if (!this.config.elements) return;
    this.config.elements.forEach((element) => {
      var _a;
      switch (element.type) {
        case "button":
          const button = new UIButton(
            element.x,
            element.y,
            element.properties.width || 200,
            element.properties.height || 40,
            element.properties.text,
            () => __privateMethod(this, _Scene_instances, runButtonAction_fn).call(this, element.properties),
            {
              backgroundColor: element.properties.backgroundColor,
              hoverColor: element.properties.hoverColor,
              textColor: element.properties.textColor,
              fontSize: element.properties.fontSize,
              fontFamily: element.properties.fontFamily,
              anchor: element.anchor
            }
          );
          button.setGame(this.game);
          this.ui.addElement(button);
          break;
        case "text":
          const text = new UIText(
            element.x,
            element.y,
            element.properties.text,
            {
              fontSize: element.properties.fontSize,
              color: element.properties.color,
              align: element.properties.align,
              anchor: element.anchor
            }
          );
          text.setGame(this.game);
          this.ui.addElement(text);
          break;
        case "image":
          if (element.sprite) {
            const sprite = this.sprites.get(element.sprite);
            const image = new UIImage(
              element.x,
              element.y,
              sprite,
              {
                width: element.properties.width,
                height: element.properties.height,
                scale: element.properties.scale,
                anchor: element.anchor
              }
            );
            image.setGame(this.game);
            this.ui.addElement(image);
          }
          break;
        case "rect":
          const rect = new UIRectangle(
            element.x,
            element.y,
            element.width,
            element.height,
            element.color,
            {
              interactive: ((_a = element.properties) == null ? void 0 : _a.interactive) || false,
              fill: element.fill || false,
              anchor: element.anchor
            }
          );
          rect.setGame(this.game);
          this.ui.addElement(rect);
          break;
      }
    });
  }
  unload() {
    if (this.config.onExit) {
      this.config.onExit();
    }
    this.sprites.clear();
    this.spriteSheets.clear();
    this.ui.clear();
    this.game.renderer.setCursor("default");
    this.game.canvas.removeEventListener("mousemove", this._handleMouseMove);
    this.game.canvas.removeEventListener("mousedown", this._handleMouseDown);
  }
  update(deltaTime) {
    if (this.config.type === "level") {
      Matter.Engine.update(this.game.engine, deltaTime * 1e3);
      if (this.game.player && this.game.player.body.position.y > this.game.options.worldHeight + 50) {
        console.log("Game Over!");
        this.game.gameOver();
        return;
      }
      this.game.camera.update();
      this.game.entities.forEach((entity) => entity.update(deltaTime));
    }
    if (this.config.onUpdate) {
      this.config.onUpdate(deltaTime);
    }
    this.ui.update(deltaTime);
  }
  draw(deltaTime) {
    if (this.config.type === "level") {
      this.game.layers.drawLayer("background");
      this.game.entities.forEach((entity) => entity.draw(deltaTime));
    }
    if (this.config.onDraw) {
      this.config.onDraw(deltaTime);
    }
  }
  drawUI(deltaTime) {
    this.ui.draw(deltaTime);
  }
}
_Scene_instances = new WeakSet();
/**
 * What a scene-JSON button does when clicked.
 *
 * `"action"` names a behaviour rather than a scene: `'settings'` opens the
 * mounted settings menu (`game.settings`), anything else is handed to the
 * scene config's `onAction(action)` hook. `"onClick"` switches scenes, as
 * before — but a missing scene now logs an error instead of surfacing as an
 * unhandled rejection inside a click handler, which is how the platformer's
 * Settings button sat broken without anything saying so.
 */
runButtonAction_fn = function({ action, onClick }) {
  if (action) {
    if (action === "settings" && this.game.settings) {
      this.game.settings.open();
    } else if (this.config.onAction) {
      this.config.onAction(action);
    } else {
      console.warn(`Scene button action '${action}' has no handler` + (action === "settings" ? " (no SettingsMenu mounted)" : ""));
    }
    return;
  }
  if (onClick) {
    Promise.resolve(this.game.sceneManager.switchTo(onClick)).catch((error) => console.error(`Scene button: cannot switch to scene '${onClick}'`, error));
  }
};
const SCENE_VERSION = 1;
const TOP_LEVEL_KEYS = {
  common: ["version", "name", "type", "title"],
  level: ["gameType", "world", "assets", "prefabs", "layers", "background"],
  ui: ["assets", "elements"]
};
const ELEMENT_KEYS = {
  common: ["type", "id", "x", "y", "anchor", "properties"],
  button: [],
  text: [],
  image: ["sprite"],
  rect: ["width", "height", "color", "fill"]
};
const ELEMENT_PROPERTY_KEYS = {
  button: [
    "text",
    "onClick",
    "action",
    "width",
    "height",
    "fontSize",
    "fontFamily",
    "backgroundColor",
    "hoverColor",
    "textColor"
  ],
  text: ["text", "fontSize", "color", "align"],
  image: ["width", "height", "scale"],
  rect: ["interactive"]
};
const BODY_TYPES = ["static", "dynamic", "kinematic"];
const DEFAULT_OBJECT_SIZE = 32;
class SceneValidationError extends Error {
  constructor(scene, path, message) {
    super(`Scene '${scene}'${path ? ` at ${path}` : ""}: ${message}`);
    this.name = "SceneValidationError";
    this.scene = scene;
    this.path = path;
  }
}
class SceneLoader {
  /** @param {import('./m2d.js').M2D} game */
  constructor(game) {
    __privateAdd(this, _SceneLoader_instances);
    this.game = game;
  }
  /**
   * Validate and normalize raw scene data.
   *
   * @param {Object} data - Parsed scene JSON
   * @param {string} [sceneName] - Registered name, for error messages
   * @returns {Object} The same scene with defaults applied
   * @throws {SceneValidationError} On anything the schema does not allow
   */
  load(data, sceneName = (data == null ? void 0 : data.name) ?? "unknown") {
    const fail = (path, message) => {
      throw new SceneValidationError(sceneName, path, message);
    };
    if (!data || typeof data !== "object") fail("", "scene data is not an object");
    if (data.version !== SCENE_VERSION) {
      fail("version", `expected ${SCENE_VERSION}, got ${JSON.stringify(data.version)}`);
    }
    if (data.type !== "level" && data.type !== "ui") {
      fail("type", `expected 'level' or 'ui', got ${JSON.stringify(data.type)}`);
    }
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, "", data, [...TOP_LEVEL_KEYS.common, ...TOP_LEVEL_KEYS[data.type]]);
    return data.type === "level" ? __privateMethod(this, _SceneLoader_instances, loadLevel_fn).call(this, data, fail) : __privateMethod(this, _SceneLoader_instances, loadUI_fn).call(this, data, fail);
  }
}
_SceneLoader_instances = new WeakSet();
/** Reject keys the schema does not define, listing what was allowed. */
checkKeys_fn = function(fail, path, object, allowed) {
  for (const key of Object.keys(object)) {
    if (!allowed.includes(key)) {
      fail(
        path ? `${path}.${key}` : key,
        `unknown field '${key}' (allowed: ${allowed.join(", ")})`
      );
    }
  }
};
// === Level scenes ===
loadLevel_fn = function(data, fail) {
  var _a, _b, _c, _d;
  const spritesheets = ((_a = data.assets) == null ? void 0 : _a.spritesheets) ?? {};
  if (data.assets) __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, "assets", data.assets, ["spritesheets"]);
  for (const [name, sheet] of Object.entries(spritesheets)) {
    const path = `assets.spritesheets.${name}`;
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, path, sheet, ["url", "frameWidth", "frameHeight", "animations"]);
    if (typeof sheet.url !== "string") fail(`${path}.url`, "missing or non-string url");
    if (!(sheet.frameWidth > 0)) fail(`${path}.frameWidth`, "must be a positive number");
    if (!(sheet.frameHeight > 0)) fail(`${path}.frameHeight`, "must be a positive number");
    for (const [anim, body] of Object.entries(sheet.animations ?? {})) {
      const animPath = `${path}.animations.${anim}`;
      __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, animPath, body, ["frames", "loop"]);
      if (!Array.isArray(body.frames) || body.frames.length === 0) {
        fail(`${animPath}.frames`, "must be a non-empty array of [tileX, tileY] pairs");
      }
      body.frames.forEach((frame, i) => {
        if (!Array.isArray(frame) || frame.length !== 2) {
          fail(`${animPath}.frames[${i}]`, "must be a [tileX, tileY] pair");
        }
      });
    }
  }
  const prefabs = data.prefabs ?? {};
  for (const [name, prefab] of Object.entries(prefabs)) {
    const path = `prefabs.${name}`;
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, path, prefab, ["actor", "spritesheet", "defaultAnimation", "physics"]);
    if (typeof prefab.actor !== "string") fail(`${path}.actor`, "missing or non-string actor");
    if (((_b = this.game) == null ? void 0 : _b.actors) && !this.game.actors.has(prefab.actor)) {
      fail(`${path}.actor`, `actor '${prefab.actor}' is not registered (registered: ${[...this.game.actors.keys()].join(", ") || "none"})`);
    }
    if (prefab.spritesheet !== void 0 && !(prefab.spritesheet in spritesheets)) {
      fail(`${path}.spritesheet`, `no spritesheet named '${prefab.spritesheet}' (declared: ${Object.keys(spritesheets).join(", ") || "none"})`);
    }
    if (prefab.defaultAnimation !== void 0) {
      const animations = (_c = spritesheets[prefab.spritesheet]) == null ? void 0 : _c.animations;
      if (animations && !(prefab.defaultAnimation in animations)) {
        fail(
          `${path}.defaultAnimation`,
          `spritesheet '${prefab.spritesheet}' has no animation '${prefab.defaultAnimation}' (has: ${Object.keys(animations).join(", ")})`
        );
      }
    }
    if (prefab.physics) {
      const type = prefab.physics.bodyType;
      if (type !== void 0 && !BODY_TYPES.includes(type)) {
        fail(
          `${path}.physics.bodyType`,
          `expected one of ${BODY_TYPES.join(", ")}, got ${JSON.stringify(type)}`
        );
      }
    }
  }
  const layers = (data.layers ?? []).map((layer, li) => {
    const path = `layers[${li}]`;
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, path, layer, ["name", "type", "objects"]);
    if (!Array.isArray(layer.objects)) fail(`${path}.objects`, "must be an array");
    return {
      ...layer,
      objects: layer.objects.map((object, oi) => {
        const objectPath = `${path}.objects[${oi}]`;
        __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, objectPath, object, ["id", "prefab", "x", "y", "width", "height", "properties"]);
        if (!(object.prefab in prefabs)) {
          fail(`${objectPath}.prefab`, `no prefab named '${object.prefab}' (declared: ${Object.keys(prefabs).join(", ") || "none"})`);
        }
        if (!Number.isFinite(object.x) || !Number.isFinite(object.y)) {
          fail(objectPath, "x and y must be numbers");
        }
        return {
          ...object,
          width: object.width ?? DEFAULT_OBJECT_SIZE,
          height: object.height ?? DEFAULT_OBJECT_SIZE
        };
      })
    };
  });
  if (data.background !== void 0) {
    const sheet = (_d = data.background) == null ? void 0 : _d.spritesheet;
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, "background", data.background, ["spritesheet", "tileX", "tileY"]);
    if (!(sheet in spritesheets)) {
      fail("background.spritesheet", `no spritesheet named '${sheet}' (declared: ${Object.keys(spritesheets).join(", ") || "none"})`);
    }
  }
  return { ...data, layers };
};
// === UI scenes ===
loadUI_fn = function(data, fail) {
  if (data.assets) __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, "assets", data.assets, ["spritesheets"]);
  if (!Array.isArray(data.elements)) fail("elements", "must be an array");
  const elements = data.elements.map((element, i) => {
    const path = `elements[${i}]`;
    const type = element.type;
    if (!(type in ELEMENT_PROPERTY_KEYS)) {
      fail(`${path}.type`, `unknown element type ${JSON.stringify(type)} (known: ${Object.keys(ELEMENT_PROPERTY_KEYS).join(", ")})`);
    }
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, path, element, [...ELEMENT_KEYS.common, ...ELEMENT_KEYS[type]]);
    __privateMethod(this, _SceneLoader_instances, checkKeys_fn).call(this, fail, `${path}.properties`, element.properties ?? {}, ELEMENT_PROPERTY_KEYS[type]);
    if (element.anchor !== void 0 && !(element.anchor in ANCHOR_ORIGINS)) {
      fail(`${path}.anchor`, `unknown anchor ${JSON.stringify(element.anchor)} (known: ${Object.keys(ANCHOR_ORIGINS).join(", ")})`);
    }
    if (!element.fill && (!Number.isFinite(element.x) || !Number.isFinite(element.y))) {
      fail(path, "x and y must be numbers");
    }
    if (type === "button") __privateMethod(this, _SceneLoader_instances, checkButton_fn).call(this, fail, path, element.properties ?? {});
    if (type === "image" && typeof element.sprite !== "string") {
      fail(`${path}.sprite`, "missing or non-string sprite");
    }
    return element;
  });
  return { ...data, elements };
};
/** A button must do exactly one thing, and the thing must exist. */
checkButton_fn = function(fail, path, properties) {
  const { action, onClick } = properties;
  if (action && onClick) {
    fail(path, `has both action '${action}' and onClick '${onClick}'; a button does one or the other`);
  }
  if (!action && !onClick) {
    fail(path, "has neither action nor onClick, so clicking it does nothing");
  }
  if (onClick) {
    const known = __privateMethod(this, _SceneLoader_instances, knownSceneNames_fn).call(this);
    if (known && !known.includes(onClick)) {
      fail(`${path}.properties.onClick`, `no scene named '${onClick}' is registered (registered: ${known.join(", ") || "none"})`);
    }
  }
};
/** Every scene name registered with the manager, loaded or pending. */
knownSceneNames_fn = function() {
  var _a;
  const manager = (_a = this.game) == null ? void 0 : _a.sceneManager;
  if (!manager) return null;
  return [...manager.scenes.keys(), ...manager.scenesToLoad.map((s) => s.name)];
};
class SceneManager {
  constructor(game) {
    this.game = game;
    this.scenes = /* @__PURE__ */ new Map();
    this.currentScene = null;
    this.loader = new SceneLoader(game);
    this.scenesToLoad = [];
    this.loading = true;
  }
  addScene(name, scene) {
    this.scenesToLoad.push({ name, scene });
  }
  async loadScene(sceneConfig, sceneName) {
    this.loading = true;
    try {
      const fetched = await sceneConfig.fetch();
      if (!fetched) {
        console.error("Failed to load scene", sceneConfig);
        throw new Error("Failed to load scene");
      }
      const loadedScene = this.loader.load(fetched, sceneName);
      this.scenes.set(sceneName, new Scene(this.game, { ...sceneConfig, ...loadedScene }));
      this.scenesToLoad = this.scenesToLoad.filter((s) => s.name !== sceneName);
      return this.scenes.get(sceneName);
    } catch (error) {
      console.error("Error loading scene:", error);
      throw error;
    } finally {
      this.loading = false;
    }
  }
  async switchTo(sceneName) {
    let scene = this.scenes.get(sceneName);
    if (!scene) {
      const sceneToLoad = this.scenesToLoad.find((s) => s.name === sceneName);
      if (!sceneToLoad) {
        throw new Error(`Scene ${sceneName} not found`);
      }
      scene = await this.loadScene(sceneToLoad.scene, sceneName);
    } else {
      this.loading = false;
    }
    if (this.currentScene) {
      this.currentScene.unload();
    }
    this.currentScene = scene;
    await scene.load();
    return scene;
  }
  getCurrentScene() {
    return this.currentScene;
  }
}
const _Camera = class _Camera {
  constructor(width, height, options = {}) {
    this.x = 0;
    this.y = 0;
    this.width = width;
    this.height = height;
    this.target = null;
    this.lerp = options.lerp || 0.1;
    this.bounds = options.bounds || null;
    this.padding = options.padding || { x: 100, y: 100 };
  }
  init(scene) {
    this.scene = scene;
  }
  follow(target) {
    this.target = target;
  }
  update() {
    var _a, _b;
    if (!this.target) return;
    const targetX = this.target.body.position.x;
    const targetY = this.target.body.position.y;
    this.x += (targetX - this.x) * this.lerp;
    this.y += (targetY - this.y) * this.lerp;
    if (this.bounds) {
      this.x = __privateMethod(_a = _Camera, _Camera_static, clampAxis_fn).call(_a, this.x, this.bounds.left, this.bounds.right, this.width);
      this.y = __privateMethod(_b = _Camera, _Camera_static, clampAxis_fn).call(_b, this.y, this.bounds.top, this.bounds.bottom, this.height);
    }
  }
  isVisible(x, y, width, height) {
    const left = x - this.x + this.width / 2;
    const top = y - this.y + this.height / 2;
    return left + width >= -this.padding.x && left <= this.width + this.padding.x && top + height >= -this.padding.y && top <= this.height + this.padding.y;
  }
  worldToScreen(worldX, worldY) {
    return {
      x: worldX - this.x + this.width / 2,
      y: worldY - this.y + this.height / 2
    };
  }
  screenToWorld(screenX, screenY) {
    return {
      x: screenX + this.x - this.width / 2,
      y: screenY + this.y - this.height / 2
    };
  }
  getVisibleArea() {
    return {
      left: this.x - this.width / 2,
      right: this.x + this.width / 2,
      top: this.y - this.height / 2,
      bottom: this.y + this.height / 2
    };
  }
  resize(width, height) {
    this.width = width;
    this.height = height;
  }
};
_Camera_static = new WeakSet();
clampAxis_fn = function(value, min, max, viewSize) {
  const lo = min + viewSize / 2;
  const hi = max - viewSize / 2;
  if (lo > hi) return (min + max) / 2;
  return Math.max(lo, Math.min(hi, value));
};
__privateAdd(_Camera, _Camera_static);
let Camera = _Camera;
class SoundManager {
  constructor() {
    this.sounds = /* @__PURE__ */ new Map();
    this.music = /* @__PURE__ */ new Map();
    this.currentMusic = null;
    this.isMuted = false;
    this.soundVolume = 1;
    this.musicVolume = 0.5;
    this.pendingMusic = null;
    this.isInitialized = false;
    this.onFirstGesture = () => this.initialize();
    if (typeof document !== "undefined") {
      document.addEventListener("click", this.onFirstGesture, { once: true });
      document.addEventListener("keydown", this.onFirstGesture, { once: true });
    }
  }
  /** Stop everything this manager is playing and release its listeners. */
  destroy() {
    if (typeof document !== "undefined") {
      document.removeEventListener("click", this.onFirstGesture);
      document.removeEventListener("keydown", this.onFirstGesture);
    }
    this.stopMusic();
    for (const audio of this.music.values()) audio.pause();
    this.sounds.clear();
    this.music.clear();
    this.pendingMusic = null;
  }
  initialize() {
    if (this.isInitialized) return;
    this.isInitialized = true;
    if (this.pendingMusic) {
      this.playMusic(this.pendingMusic);
      this.pendingMusic = null;
    }
  }
  loadSound(key, file) {
    const audio = new Audio(file);
    this.sounds.set(key, audio);
  }
  loadMusic(key, file) {
    const audio = new Audio(file);
    audio.loop = true;
    this.music.set(key, audio);
  }
  playSound(key) {
    if (this.isMuted) return;
    const sound = this.sounds.get(key);
    if (!sound) return;
    const clone = sound.cloneNode();
    clone.volume = this.soundVolume;
    clone.play().catch((error) => {
      console.warn(`Failed to play sound ${key}:`, error);
    });
  }
  playMusic(key) {
    if (!this.isInitialized) {
      this.pendingMusic = key;
      return;
    }
    if (this.isMuted) return;
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
    }
    const audio = this.music.get(key);
    if (!audio) return;
    audio.volume = this.musicVolume;
    this.currentMusic = audio;
    audio.play().catch((error) => {
      console.warn(`Failed to play music ${key}:`, error);
    });
  }
  stopMusic() {
    if (this.currentMusic) {
      this.currentMusic.pause();
      this.currentMusic.currentTime = 0;
      this.currentMusic = null;
    }
  }
  toggleMute() {
    this.isMuted = !this.isMuted;
    if (this.isMuted) {
      this.stopMusic();
    }
  }
  setMusicVolume(volume) {
    this.musicVolume = Math.max(0, Math.min(1, volume));
    if (this.currentMusic && !this.isMuted) {
      this.currentMusic.volume = this.musicVolume;
    }
  }
  setSoundVolume(volume) {
    this.soundVolume = Math.max(0, Math.min(1, volume));
  }
}
const KEY_D = "d";
const KEY_M = "m";
const KEY_R = "r";
const KEY_X = "x";
const KEY_SPACE = " ";
const KEY_LEFT = "ArrowLeft";
const KEY_UP = "ArrowUp";
const KEY_RIGHT = "ArrowRight";
const KEY_DOWN = "ArrowDown";
const MAX_PIXEL_RATIO = 3;
function resolveWorldScale(resolution, designHeight, nativeScale) {
  if (resolution === "native" || resolution == null) return nativeScale;
  if (typeof resolution === "number") return resolution;
  if (typeof resolution === "object" && resolution.height > 0) {
    return resolution.height / designHeight;
  }
  return nativeScale;
}
function computeViewport({
  displayWidth,
  displayHeight,
  designWidth,
  designHeight,
  pixelRatio = 1,
  aspectMode = "letterbox",
  resolution = "native",
  maxPixelRatio = MAX_PIXEL_RATIO
}) {
  const cssWidth = displayWidth > 0 ? displayWidth : designWidth;
  const cssHeight = displayHeight > 0 ? displayHeight : designHeight;
  const ratio = Math.min(Math.max(pixelRatio || 1, 1), maxPixelRatio);
  const backingWidth = Math.max(1, Math.round(cssWidth * ratio));
  const backingHeight = Math.max(1, Math.round(cssHeight * ratio));
  const uiScale = Math.min(backingWidth / designWidth, backingHeight / designHeight);
  const uiWidth = backingWidth / uiScale;
  const uiHeight = backingHeight / uiScale;
  const expand2 = aspectMode === "expand";
  const viewWidth = expand2 ? uiWidth : designWidth;
  const viewHeight = expand2 ? uiHeight : designHeight;
  const contentWidth = expand2 ? backingWidth : designWidth * uiScale;
  const contentHeight = expand2 ? backingHeight : designHeight * uiScale;
  const contentX = (backingWidth - contentWidth) / 2;
  const contentY = (backingHeight - contentHeight) / 2;
  const nativeScale = contentHeight / viewHeight;
  const worldScale = Math.max(resolveWorldScale(resolution, designHeight, nativeScale), 0.01);
  return {
    backingWidth,
    backingHeight,
    pixelRatio: ratio,
    viewWidth,
    viewHeight,
    worldWidth: Math.max(1, Math.round(viewWidth * worldScale)),
    worldHeight: Math.max(1, Math.round(viewHeight * worldScale)),
    worldScale,
    contentX,
    contentY,
    contentWidth,
    contentHeight,
    uiWidth,
    uiHeight,
    uiScale
  };
}
function sameResolution(a, b) {
  const nativeA = a === "native" || a == null;
  const nativeB = b === "native" || b == null;
  if (nativeA || nativeB) return nativeA && nativeB;
  if (typeof a === "object" && typeof b === "object") {
    return a.width === b.width && a.height === b.height;
  }
  return a === b;
}
function identityViewport(width, height) {
  return {
    backingWidth: width,
    backingHeight: height,
    pixelRatio: 1,
    viewWidth: width,
    viewHeight: height,
    worldWidth: width,
    worldHeight: height,
    worldScale: 1,
    contentX: 0,
    contentY: 0,
    contentWidth: width,
    contentHeight: height,
    uiWidth: width,
    uiHeight: height,
    uiScale: 1
  };
}
function sameViewport(a, b) {
  if (!a || !b) return false;
  for (const key of Object.keys(a)) {
    if (a[key] !== b[key]) return false;
  }
  return true;
}
function viewToUI({ x, y, viewport }) {
  return {
    x: (viewport.contentX + x * (viewport.contentWidth / viewport.viewWidth)) / viewport.uiScale,
    y: (viewport.contentY + y * (viewport.contentHeight / viewport.viewHeight)) / viewport.uiScale
  };
}
function mapPointer({ clientX, clientY, rect, viewport }) {
  const rectAspect = rect.width / rect.height;
  const backingAspect = viewport.backingWidth / viewport.backingHeight;
  const presentedWidth = rectAspect > backingAspect ? rect.height * backingAspect : rect.width;
  const presentedHeight = rectAspect > backingAspect ? rect.height : rect.width / backingAspect;
  const presentedX = rect.left + (rect.width - presentedWidth) / 2;
  const presentedY = rect.top + (rect.height - presentedHeight) / 2;
  const scale = viewport.backingWidth / presentedWidth;
  const backingX = (clientX - presentedX) * scale;
  const backingY = (clientY - presentedY) * scale;
  const inContent = backingX >= viewport.contentX && backingX <= viewport.contentX + viewport.contentWidth && backingY >= viewport.contentY && backingY <= viewport.contentY + viewport.contentHeight;
  return {
    ui: {
      x: backingX / viewport.uiScale,
      y: backingY / viewport.uiScale
    },
    view: {
      x: (backingX - viewport.contentX) / viewport.contentWidth * viewport.viewWidth,
      y: (backingY - viewport.contentY) / viewport.contentHeight * viewport.viewHeight
    },
    inContent
  };
}
const PARTICLE_STRIDE = 8;
const OPTIONAL_CAPABILITIES = Object.freeze({
  tint: false,
  blendModes: false,
  particles: false,
  lights: false,
  postEffects: false
});
const _BaseRenderer = class _BaseRenderer {
  constructor() {
    __privateAdd(this, _debugEnabled, true);
    __privateAdd(this, _debugLayer, "default");
    if (this.constructor === _BaseRenderer) {
      throw new Error("BaseRenderer is an abstract class and cannot be instantiated directly");
    }
    this.viewport = identityViewport(800, 600);
    this.worldFilter = "linear";
    this.capabilities = { ...OPTIONAL_CAPABILITIES };
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1e3;
    this.fpsHistory = new Array(60).fill(0);
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0;
    this.fpsCount = 0;
    this.stats = {
      primitives: 0,
      drawCalls: 0,
      stateChanges: 0,
      spritesDrawn: 0,
      textDrawn: 0,
      shapesDrawn: 0,
      lastState: {
        fillStyle: null,
        strokeStyle: null,
        lineWidth: null,
        font: null
      }
    };
  }
  // === Lifecycle ===
  /**
   * Initialize the renderer with a target canvas and options.
   * @param {HTMLCanvasElement} element - The target canvas to render to
   * @param {Object} options - Renderer options
   * @param {number} [options.width] - Initial width
   * @param {number} [options.height] - Initial height
   * @param {import('../viewport.js').Viewport} [options.viewport] - Initial
   *   sizing; an identity viewport of width x height when omitted
   * @param {'linear'|'nearest'} [options.worldFilter='linear'] - Filter the
   *   world surface is upscaled with; see `setWorldFilter`
   */
  init(element, options) {
    throw new Error("Method not implemented");
  }
  /**
   * Choose how the world surface is filtered when it is upscaled to the
   * screen, which happens whenever the render resolution is below the
   * display's. Backends that need to act on the change override this and call
   * super; the stored value is what a backend reads at presentation time.
   *
   * @param {'linear'|'nearest'} filter - 'nearest' for pixel art
   */
  setWorldFilter(filter) {
    this.worldFilter = filter === "nearest" ? "nearest" : "linear";
  }
  /**
   * Clean up renderer resources.
   */
  destroy() {
    throw new Error("Method not implemented");
  }
  /**
   * Visible world width, in world units. This is the camera's view size, not a
   * pixel count: it does not change when the render resolution changes.
   * @type {number}
   */
  get width() {
    return this.viewport.viewWidth;
  }
  /**
   * Visible world height, in world units.
   * @type {number}
   */
  get height() {
    return this.viewport.viewHeight;
  }
  /**
   * Adopt a new viewport: resize the backing store, the world surface and any
   * size-dependent resources, and re-establish the world and UI transforms.
   *
   * Backends must store the viewport even when they cannot act on it yet (a
   * WebGL context may be lost), so the size can be replayed on recovery.
   *
   * @param {import('../viewport.js').Viewport} viewport - The sizes to adopt
   */
  setViewport(viewport) {
    throw new Error("Method not implemented");
  }
  /**
   * Resize the renderer to an unscaled `width` x `height` — view, world
   * surface, UI space and backing store all the same size. Called with no
   * arguments it re-applies the current viewport, which is how a backend
   * rebuilds after losing its drawing resources.
   *
   * This is the simple entry point; `setViewport` is the full one.
   *
   * @param {number} [width] - New width
   * @param {number} [height] - New height
   */
  resize(width, height) {
    const next = width !== void 0 && height !== void 0 ? identityViewport(width, height) : this.viewport;
    this.setViewport(next);
  }
  /**
   * Clear the presented surface.
   * Backends that keep intermediate buffers (e.g. a world buffer) clear those
   * in beginFrame(), not here.
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
    throw new Error("Method not implemented");
  }
  // === Frame control ===
  /**
   * Begin a new world frame. Clears the world to opaque black so no content
   * from the previous frame survives. Subclasses must call super.beginFrame()
   * to keep FPS and draw-call statistics up to date.
   */
  beginFrame() {
    this.frameCount++;
    this.resetStats();
    const now = performance.now();
    const elapsed = now - this.lastFpsUpdate;
    if (elapsed >= this.fpsUpdateInterval) {
      this.fps = Math.round(this.frameCount * 1e3 / elapsed);
      if (this.fpsCount === this.fpsHistory.length) {
        this.fpsSum -= this.fpsHistory[this.fpsHistoryIndex];
      } else {
        this.fpsCount++;
      }
      this.fpsSum += this.fps;
      this.fpsHistory[this.fpsHistoryIndex] = this.fps;
      this.fpsHistoryIndex = (this.fpsHistoryIndex + 1) % this.fpsHistory.length;
      this.frameCount = 0;
      this.lastFpsUpdate = now;
    }
  }
  /**
   * End the current world frame and present it.
   */
  endFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * Begin a screen-space (UI) pass. Draw calls made through a UIRenderer
   * happen between beginScreenFrame() and endScreenFrame().
   */
  beginScreenFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * End the current screen-space (UI) pass.
   */
  endScreenFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * Apply camera transformation to subsequent world-space draw calls.
   * @param {Object} camera - Camera object with x, y, width, height
   */
  applyCamera(camera) {
    throw new Error("Method not implemented");
  }
  // === Draw primitives ===
  /**
   * Draw a sprite tile from a spritesheet image, centered on (x, y).
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} options.x - Center X position
   * @param {number} options.y - Center Y position
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {number} [options.width] - Destination width (defaults to tileWidth)
   * @param {number} [options.height] - Destination height (defaults to tileHeight)
   * @param {number} [options.rotation=0] - Rotation in radians
   * @param {boolean} [options.flipX=false] - Flip horizontally
   * @param {boolean} [options.flipY=false] - Flip vertically
   * @param {string} [options.tint] - Colour multiplied into every texel, e.g.
   *   `'#ff8080'` for a hit flash. The tint's own alpha scales the result.
   *   Optional; requires the `tint` capability.
   */
  drawSprite(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a named animation frame from a SpriteSheet.
   * @param {Object} options - Drawing options
   * @param {Object} options.sprite - SpriteSheet to draw from
   * @param {number} options.x - Center X position
   * @param {number} options.y - Center Y position
   * @param {string} options.animation - Animation name
   * @param {number} [options.frame=0] - Animation frame index
   * @param {Object} [options.transform] - Extra drawSprite options
   */
  drawAnimation(options) {
    const { sprite, x, y, animation, frame = 0, transform = {} } = options;
    const anim = sprite.animations.get(animation);
    if (!anim) return;
    this.drawSprite({
      image: sprite.image,
      x,
      y,
      tileX: anim.tileX + frame,
      tileY: anim.tileY,
      tileWidth: sprite.tileW,
      tileHeight: sprite.tileH,
      ...transform
    });
  }
  /**
   * Set the ambient light the world is lit by, and switch lighting on.
   *
   * No-op unless the backend claims `lights`. Pass `null` to turn lighting
   * back off; the world then renders at full brightness as if no light had
   * ever been submitted.
   * @param {string|null} color - Ambient colour, e.g. `'#303848'`
   */
  setAmbientLight(color) {
  }
  /**
   * Add a light to the current frame's light map.
   *
   * Lights are cleared at `beginFrame`, so they are submitted every frame
   * like any other draw. No-op unless the backend claims `lights` and an
   * ambient has been set.
   * @param {Object} options - Light options
   * @param {number} options.x - Centre X
   * @param {number} options.y - Centre Y
   * @param {number} options.radius - Radius at which the light reaches zero
   * @param {string} [options.color='#ffffff'] - Light colour
   * @param {number} [options.intensity=1] - Brightness multiplier
   * @param {boolean} [options.isScreenSpace=false] - Position in screen space
   */
  drawLight(options) {
  }
  /**
   * Configure the full-screen post pass, or pass `null` to disable it.
   *
   * No-op unless the backend claims `postEffects`.
   * @param {Object|null} effects - Effect configuration
   * @param {Object} [effects.bloom] - { threshold, strength, blur }
   * @param {Object} [effects.vignette] - { strength, start }
   */
  setPostEffects(effects) {
  }
  /**
   * Draw many copies of one sprite tile from a packed buffer.
   *
   * The default implementation is the fallback described under
   * `OPTIONAL_CAPABILITIES.particles`: a `drawSprite` per particle. Backends
   * that claim `particles` override it with a batched path.
   *
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Spritesheet image
   * @param {number} [options.tileX=0] - Tile X index in spritesheet
   * @param {number} [options.tileY=0] - Tile Y index in spritesheet
   * @param {number} options.tileWidth - Tile width in pixels
   * @param {number} options.tileHeight - Tile height in pixels
   * @param {Float32Array|number[]} options.data - `PARTICLE_STRIDE` floats per particle
   * @param {number} [options.count] - Particles to draw (defaults to the whole buffer)
   * @param {string} [options.blend] - Blend mode for every particle
   * @param {number} [options.globalAlpha] - Multiplied into every particle's alpha
   */
  drawParticles(options) {
    const { image, tileX = 0, tileY = 0, tileWidth, tileHeight, data, blend, isScreenSpace } = options;
    if (!image || !data) return;
    const available = Math.floor(data.length / PARTICLE_STRIDE);
    const count = Math.min(options.count ?? available, available);
    const aspect = tileWidth / tileHeight;
    const alphaScale = options.globalAlpha ?? 1;
    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      const alpha = data[o + 7] * alphaScale;
      if (alpha <= 0) continue;
      this.drawSprite({
        image,
        tileX,
        tileY,
        tileWidth,
        tileHeight,
        x: data[o],
        y: data[o + 1],
        width: data[o + 2] * aspect,
        height: data[o + 2],
        rotation: data[o + 3],
        globalAlpha: alpha,
        blend,
        isScreenSpace
      });
    }
  }
  /**
   * Draw an image stretched to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   * @param {CanvasImageSource} options.image - Image to draw
   * @param {number} options.x - Destination X (top-left)
   * @param {number} options.y - Destination Y (top-left)
   * @param {number} [options.width] - Destination width (defaults to image width)
   * @param {number} [options.height] - Destination height (defaults to image height)
   * @param {number} [options.sourceX] - Source rect X (full image if omitted)
   * @param {number} [options.sourceY] - Source rect Y
   * @param {number} [options.sourceWidth] - Source rect width
   * @param {number} [options.sourceHeight] - Source rect height
   * @param {string} [options.tint] - Colour multiplied into every texel.
   *   Optional; requires the `tint` capability.
   */
  drawImage(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a rectangle (top-left anchored), optionally rounded.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {number|number[]} [options.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   */
  drawRect(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a line segment.
   * @param {Object} options - Drawing options
   * @param {number} options.x1 - Start X
   * @param {number} options.y1 - Start Y
   * @param {number} options.x2 - End X
   * @param {number} options.y2 - End Y
   * @param {string|Object} [options.strokeStyle='#000'] - Stroke color
   * @param {number} [options.lineWidth=1] - Line width
   */
  drawLine(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw an arc or circle.
   *
   * Filling a partial arc fills the **circular segment** — the region between
   * the arc and the straight chord joining its endpoints — not a pie sector.
   * The centre of the circle is therefore NOT filled unless the sweep is at
   * least half a turn. This matches Canvas 2D `arc()` + `fill()` semantics and
   * is what the engine has always rendered; backends must reproduce it so
   * output stays identical. For a pie/sector look, draw a closed drawPath()
   * through the centre instead.
   *
   * @param {Object} options - Drawing options
   * @param {number} options.x - Center X
   * @param {number} options.y - Center Y
   * @param {number} options.radius - Radius
   * @param {number} [options.startAngle=0] - Start angle in radians
   * @param {number} [options.endAngle=Math.PI*2] - End angle in radians
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill when fillStyle is set
   */
  drawArc(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   * @param {Array<{x: number, y: number}>} options.points - Path points
   * @param {boolean} [options.closed=false] - Close the path
   * @param {string|Object} [options.fillStyle] - Fill color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Stroke color or gradient descriptor
   * @param {number} [options.lineWidth=1] - Stroke width
   */
  drawPath(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string|Object} [options.fillStyle='#000'] - Text color or gradient descriptor
   * @param {string|Object} [options.strokeStyle] - Outline color; drawn before the fill
   * @param {number} [options.lineWidth=3] - Outline width
   * @param {string|number} [options.fontSize='16px'] - Font size ('16px' or 16)
   * @param {string} [options.fontFamily='system-ui'] - Font family
   * @param {string} [options.fontWeight='normal'] - Font weight
   * @param {string} [options.textAlign='left'] - Text alignment
   * @param {string} [options.textBaseline='top'] - Text baseline
   */
  drawText(options) {
    throw new Error("Method not implemented");
  }
  // === Transform & clip stacks ===
  /**
   * Push a local transform applied to subsequent draw calls.
   * @param {Object} transform - Transform options
   * @param {number} [transform.x=0] - Translation X
   * @param {number} [transform.y=0] - Translation Y
   * @param {number} [transform.rotation=0] - Rotation in radians
   * @param {number} [transform.scaleX=1] - Scale X
   * @param {number} [transform.scaleY=1] - Scale Y
   * @param {boolean} [transform.isScreenSpace=false] - Apply in screen space
   */
  pushTransform(transform) {
    throw new Error("Method not implemented");
  }
  /**
   * Pop the most recent transform pushed with pushTransform(). Must be the
   * top of the shared transform/clip stack (see class docs).
   */
  popTransform() {
    throw new Error("Method not implemented");
  }
  /**
   * Push a clipping rectangle applied to subsequent draw calls.
   * @param {Object} rect - Clipping rectangle
   * @param {number} rect.x - X position
   * @param {number} rect.y - Y position
   * @param {number} rect.width - Rectangle width
   * @param {number} rect.height - Rectangle height
   * @param {number|number[]} [rect.cornerRadius=0] - Rounded corner radius
   * @param {boolean} [rect.isScreenSpace=false] - Clip in screen space
   */
  pushClip(rect) {
    throw new Error("Method not implemented");
  }
  /**
   * Pop the most recent clipping rectangle. Must be the top of the shared
   * transform/clip stack (see class docs).
   */
  popClip() {
    throw new Error("Method not implemented");
  }
  // === Queries ===
  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} [style] - Text style ({ fontSize, fontFamily, fontWeight })
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style) {
    throw new Error("Method not implemented");
  }
  /**
   * Test if a point hits a shape. Pure math; shared by all backends.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape ({ type: 'rect', x, y, width, height } or
   *   { type: 'circle', x, y, radius })
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) {
    switch (shape.type) {
      case "rect":
        return x >= shape.x && x <= shape.x + shape.width && y >= shape.y && y <= shape.y + shape.height;
      case "circle": {
        const dx = x - shape.x;
        const dy = y - shape.y;
        return dx * dx + dy * dy <= shape.radius * shape.radius;
      }
      default:
        return false;
    }
  }
  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    throw new Error("Method not implemented");
  }
  /**
   * Whether this backend supports an optional feature.
   * @param {keyof OPTIONAL_CAPABILITIES} feature - Capability name
   * @returns {boolean} Whether the backend implements it
   */
  supports(feature) {
    return this.capabilities[feature] === true;
  }
  /**
   * Names of the optional features this backend supports.
   * @returns {string[]} Supported capability names
   */
  supportedCapabilities() {
    return Object.keys(this.capabilities).filter((name) => this.capabilities[name]);
  }
  // === Debug rendering state (shared by all backends) ===
  /**
   * Enable/disable debug rendering.
   * @param {boolean} enabled - Whether debug rendering should be enabled
   */
  setDebugEnabled(enabled) {
    __privateSet(this, _debugEnabled, enabled);
  }
  /**
   * Check if debug rendering is enabled.
   * @returns {boolean} Whether debug rendering is enabled
   */
  isDebugEnabled() {
    return __privateGet(this, _debugEnabled);
  }
  /**
   * Set debug rendering layer.
   * @param {string} layer - Debug layer name
   */
  setDebugLayer(layer) {
    __privateSet(this, _debugLayer, layer);
  }
  /**
   * Get current debug layer.
   * @returns {string} Current debug layer name
   */
  getDebugLayer() {
    return __privateGet(this, _debugLayer);
  }
  // === Performance stats (shared by all backends) ===
  getFPS() {
    return this.fps;
  }
  getFPSHistory() {
    return [...this.fpsHistory];
  }
  getAverageFPS() {
    if (this.fpsCount === 0) return this.fps;
    return Math.round(this.fpsSum / this.fpsCount);
  }
  resetStats() {
    this.stats.primitives = 0;
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
  }
  /**
   * Count a primitive requested by the caller. Backends call this once per
   * draw method invocation; how many GPU draw calls it becomes is theirs.
   * @param {'sprite'|'text'|'shape'} kind
   */
  trackPrimitive(kind) {
    this.stats.primitives++;
    if (kind === "sprite") this.stats.spritesDrawn++;
    else if (kind === "text") this.stats.textDrawn++;
    else this.stats.shapesDrawn++;
  }
  /**
   * Count backend state changes by diffing against the last seen values.
   * Canvas backends track style strings; GPU backends may track bound
   * textures/programs instead or count directly into stats.stateChanges.
   */
  trackStateChange(newState) {
    const lastState = this.stats.lastState;
    let changes = 0;
    for (const [key, value] of Object.entries(newState)) {
      if (value !== void 0 && value !== lastState[key]) {
        lastState[key] = value;
        changes++;
      }
    }
    if (changes > 0) {
      this.stats.stateChanges += changes;
    }
  }
  getStats() {
    return { ...this.stats };
  }
};
_debugEnabled = new WeakMap();
_debugLayer = new WeakMap();
let BaseRenderer = _BaseRenderer;
const COMPOSITE_OPERATIONS = {
  normal: "source-over",
  additive: "lighter",
  multiply: "multiply",
  screen: "screen"
};
class CanvasRenderer extends BaseRenderer {
  constructor() {
    super();
    __privateAdd(this, _CanvasRenderer_instances);
    this.capabilities.blendModes = true;
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
    this.scratchBuffer = null;
    this.scratchContext = null;
    this.stateStack = [];
  }
  /**
   * Initialize the canvas renderer.
   * @param {HTMLCanvasElement} element - The canvas element to render to
   * @param {Object} options - Renderer options
   * @param {number} [options.width=800] - Initial canvas width
   * @param {number} [options.height=600] - Initial canvas height
   */
  init(element, options = {}) {
    this.canvas = element;
    this.context = this.canvas.getContext("2d");
    this.worldBuffer = document.createElement("canvas");
    this.worldContext = this.worldBuffer.getContext("2d");
    if (options.worldFilter) this.setWorldFilter(options.worldFilter);
    this.setViewport(options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    ));
  }
  destroy() {
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
    this.scratchBuffer = null;
    this.scratchContext = null;
    this.stateStack = [];
  }
  /**
   * Adopt a new viewport: size the backing store to the display and the world
   * buffer to the (independent) render resolution.
   * @param {import('../viewport.js').Viewport} viewport - The sizes to adopt
   */
  setViewport(viewport) {
    this.viewport = viewport;
    if (!this.canvas) return;
    this.canvas.width = viewport.backingWidth;
    this.canvas.height = viewport.backingHeight;
    this.worldBuffer.width = viewport.worldWidth;
    this.worldBuffer.height = viewport.worldHeight;
    if (this.scratchBuffer) __privateMethod(this, _CanvasRenderer_instances, sizeScratch_fn).call(this);
  }
  /**
   * Clear the presented surface.
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
    if (!this.context) return;
    const { backingWidth, backingHeight } = this.viewport;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    if (color) {
      this.context.fillStyle = color;
      this.context.fillRect(0, 0, backingWidth, backingHeight);
    } else {
      this.context.clearRect(0, 0, backingWidth, backingHeight);
    }
    this.context.restore();
  }
  beginFrame() {
    if (!this.worldContext) return;
    this.clear("#000");
    const { worldWidth, worldHeight, worldScale } = this.viewport;
    this.worldContext.setTransform(1, 0, 0, 1, 0, 0);
    this.worldContext.fillStyle = "#000";
    this.worldContext.fillRect(0, 0, worldWidth, worldHeight);
    this.worldContext.save();
    this.worldContext.scale(worldScale, worldScale);
    super.beginFrame();
  }
  endFrame() {
    if (!this.worldContext) return;
    this.worldContext.restore();
    const { contentX, contentY, contentWidth, contentHeight } = this.viewport;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.imageSmoothingEnabled = this.worldFilter !== "nearest";
    this.context.drawImage(this.worldBuffer, contentX, contentY, contentWidth, contentHeight);
    this.context.restore();
  }
  beginScreenFrame() {
    if (!this.context) return;
    this.context.save();
    this.context.setTransform(1, 0, 0, 1, 0, 0);
    this.context.scale(this.viewport.uiScale, this.viewport.uiScale);
  }
  endScreenFrame() {
    if (!this.context) return;
    this.context.restore();
  }
  /**
   * Apply camera transformation to world-space rendering.
   * @param {Object} camera - Camera object with position and dimensions
   */
  applyCamera(camera) {
    if (!this.worldContext) return;
    this.worldContext.translate(
      -camera.x + camera.width / 2,
      -camera.y + camera.height / 2
    );
  }
  /**
   * Draw a sprite tile centered on (x, y).
   * @param {Object} options - Drawing options
   */
  drawSprite(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx || !options.image) return;
    this.trackPrimitive("sprite");
    this.stats.drawCalls++;
    this.trackStateChange({});
    const {
      image,
      x,
      y,
      tileX = 0,
      tileY = 0,
      tileWidth,
      tileHeight,
      width = tileWidth,
      height = tileHeight,
      rotation: rotation2 = 0,
      flipX = false,
      flipY = false
    } = options;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, 1, (c) => {
      c.translate(x, y);
      if (rotation2) c.rotate(rotation2);
      if (flipX || flipY) c.scale(flipX ? -1 : 1, flipY ? -1 : 1);
      c.drawImage(
        image,
        tileX * tileWidth,
        tileY * tileHeight,
        tileWidth,
        tileHeight,
        -width / 2,
        -height / 2,
        width,
        height
      );
    });
  }
  /**
   * Draw an image to a destination rectangle (top-left anchored).
   * @param {Object} options - Drawing options
   */
  drawImage(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx || !options.image) return;
    this.trackPrimitive("sprite");
    this.stats.drawCalls++;
    this.trackStateChange({});
    const width = options.width ?? options.image.width;
    const height = options.height ?? options.image.height;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, 1, (c) => {
      if (options.sourceWidth !== void 0 && options.sourceHeight !== void 0) {
        c.drawImage(
          options.image,
          options.sourceX ?? 0,
          options.sourceY ?? 0,
          options.sourceWidth,
          options.sourceHeight,
          options.x,
          options.y,
          width,
          height
        );
      } else {
        c.drawImage(options.image, options.x, options.y, width, height);
      }
    });
  }
  /**
   * Draw a rectangle, optionally rounded.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx) return;
    this.trackPrimitive("shape");
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    const { x, y, width, height, cornerRadius } = options;
    const rounded = cornerRadius !== void 0 && cornerRadius !== 0;
    const doFill = options.fill !== false && !!options.fillStyle;
    const doStroke = !!options.strokeStyle;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      if (rounded) {
        c.beginPath();
        c.roundRect(x, y, width, height, cornerRadius);
      }
      if (doFill) {
        c.fillStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.fillStyle);
        if (rounded) c.fill();
        else c.fillRect(x, y, width, height);
      }
      if (doStroke) {
        c.strokeStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        if (rounded) c.stroke();
        else c.strokeRect(x, y, width, height);
      }
    });
  }
  /**
   * Draw text with optional outline, shadow/glow, and gradient fill.
   * @param {Object} options - Drawing options
   */
  drawText(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx) return;
    const font = __privateMethod(this, _CanvasRenderer_instances, buildFont_fn).call(this, options);
    this.trackPrimitive("text");
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      font
    });
    const doStroke = !!options.strokeStyle;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, doStroke ? 2 : 1, (c) => {
      c.font = font;
      c.textAlign = options.textAlign || "left";
      c.textBaseline = options.textBaseline || "top";
      if (doStroke) {
        c.strokeStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 3;
        c.lineJoin = "round";
        c.strokeText(options.text, options.x, options.y);
      }
      c.fillStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.fillStyle || "#000");
      c.fillText(options.text, options.x, options.y);
    });
  }
  /**
   * Draw a line.
   * @param {Object} options - Drawing options
   */
  drawLine(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx) return;
    this.trackPrimitive("shape");
    this.stats.drawCalls++;
    this.trackStateChange({
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, 1, (c) => {
      c.strokeStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.strokeStyle || "#000");
      c.lineWidth = options.lineWidth || 1;
      c.beginPath();
      c.moveTo(options.x1, options.y1);
      c.lineTo(options.x2, options.y2);
      c.stroke();
    });
  }
  /**
   * Draw an arc or circle.
   * @param {Object} options - Drawing options
   */
  drawArc(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx) return;
    this.trackPrimitive("shape");
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    const doFill = options.fill !== false && !!options.fillStyle;
    const doStroke = !!options.strokeStyle;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      c.beginPath();
      c.arc(
        options.x,
        options.y,
        options.radius,
        options.startAngle ?? 0,
        options.endAngle ?? Math.PI * 2,
        false
      );
      if (doFill) {
        c.fillStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.fillStyle);
        c.fill();
      }
      if (doStroke) {
        c.strokeStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        c.stroke();
      }
    });
  }
  /**
   * Draw a polyline or polygon.
   * @param {Object} options - Drawing options
   */
  drawPath(options) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, options);
    if (!ctx || !options.points || options.points.length < 2) return;
    this.trackPrimitive("shape");
    this.stats.drawCalls++;
    this.trackStateChange({
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    const doFill = !!options.fillStyle;
    const doStroke = !!options.strokeStyle;
    __privateMethod(this, _CanvasRenderer_instances, paint_fn).call(this, ctx, options, (doFill ? 1 : 0) + (doStroke ? 1 : 0), (c) => {
      c.beginPath();
      c.moveTo(options.points[0].x, options.points[0].y);
      for (let i = 1; i < options.points.length; i++) {
        c.lineTo(options.points[i].x, options.points[i].y);
      }
      if (options.closed) {
        c.closePath();
      }
      if (doFill) {
        c.fillStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.fillStyle);
        c.fill();
      }
      if (doStroke) {
        c.strokeStyle = __privateMethod(this, _CanvasRenderer_instances, resolveStyle_fn).call(this, c, options.strokeStyle);
        c.lineWidth = options.lineWidth || 1;
        c.stroke();
      }
    });
  }
  /**
   * Push a local transform applied to subsequent draw calls.
   * @param {Object} transform - Transform options
   */
  pushTransform(transform = {}) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, transform);
    if (!ctx) return;
    ctx.save();
    ctx.translate(transform.x || 0, transform.y || 0);
    if (transform.rotation) ctx.rotate(transform.rotation);
    if (transform.scaleX !== void 0 || transform.scaleY !== void 0) {
      ctx.scale(transform.scaleX ?? 1, transform.scaleY ?? 1);
    }
    this.stateStack.push({ kind: "transform", ctx });
  }
  popTransform() {
    __privateMethod(this, _CanvasRenderer_instances, popState_fn).call(this, "transform");
  }
  /**
   * Push a clipping rectangle (optionally rounded).
   * @param {Object} rect - Clipping rectangle
   */
  pushClip(rect) {
    const ctx = __privateMethod(this, _CanvasRenderer_instances, targetContext_fn).call(this, rect);
    if (!ctx) return;
    ctx.save();
    ctx.beginPath();
    if (rect.cornerRadius) {
      ctx.roundRect(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius);
    } else {
      ctx.rect(rect.x, rect.y, rect.width, rect.height);
    }
    ctx.clip();
    this.stateStack.push({ kind: "clip", ctx });
  }
  popClip() {
    __privateMethod(this, _CanvasRenderer_instances, popState_fn).call(this, "clip");
  }
  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} [style] - Text style ({ fontSize, fontFamily, fontWeight })
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style = {}) {
    if (!this.context) return { width: 0, height: 0 };
    this.context.save();
    this.context.font = style.font || __privateMethod(this, _CanvasRenderer_instances, buildFont_fn).call(this, style);
    const metrics = this.context.measureText(text);
    this.context.restore();
    return {
      width: metrics.width,
      height: parseInt(style.fontSize ?? style.font) || 16
    };
  }
  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}
_CanvasRenderer_instances = new WeakSet();
/**
 * Pick the target context for a draw call.
 * @param {Object} options - Draw options (reads isScreenSpace)
 * @returns {CanvasRenderingContext2D|null}
 */
targetContext_fn = function(options) {
  return options.isScreenSpace ? this.context : this.worldContext;
};
/**
 * Resolve a style value into something assignable to fillStyle/strokeStyle.
 * Accepts colour strings or declarative gradient descriptors (see
 * BaseRenderer docs). Gradients are created on the context they are used
 * with.
 */
resolveStyle_fn = function(ctx, style) {
  if (!style || typeof style !== "object" || !style.type) return style;
  let gradient;
  if (style.type === "linear") {
    gradient = ctx.createLinearGradient(style.x0, style.y0, style.x1, style.y1);
  } else if (style.type === "radial") {
    gradient = ctx.createRadialGradient(
      style.x,
      style.y,
      style.r0 ?? 0,
      style.x,
      style.y,
      style.r1
    );
  } else {
    return style;
  }
  for (const stop of style.stops || []) {
    gradient.addColorStop(stop.offset, stop.color);
  }
  return gradient;
};
/**
 * Apply shared draw options (globalAlpha, shadow) to a saved context.
 */
applyCommon_fn = function(ctx, options) {
  if (options.globalAlpha !== void 0) {
    ctx.globalAlpha = options.globalAlpha;
  }
  if (options.blend) {
    ctx.globalCompositeOperation = COMPOSITE_OPERATIONS[options.blend] || "source-over";
  }
  if (options.shadow) {
    ctx.shadowColor = options.shadow.color || "rgba(0,0,0,0.5)";
    ctx.shadowBlur = options.shadow.blur || 0;
    ctx.shadowOffsetX = options.shadow.offsetX || 0;
    ctx.shadowOffsetY = options.shadow.offsetY || 0;
  }
};
/**
 * The scratch buffer mirrors whichever context is being painted, so it has
 * to cover the larger of the two surfaces: the world render target or the
 * backing store the UI draws on.
 */
sizeScratch_fn = function() {
  const { worldWidth, worldHeight, backingWidth, backingHeight } = this.viewport;
  this.scratchBuffer.width = Math.max(worldWidth, backingWidth);
  this.scratchBuffer.height = Math.max(worldHeight, backingHeight);
};
scratch_fn = function() {
  if (!this.scratchContext) {
    this.scratchBuffer = document.createElement("canvas");
    __privateMethod(this, _CanvasRenderer_instances, sizeScratch_fn).call(this);
    this.scratchContext = this.scratchBuffer.getContext("2d");
  }
  return this.scratchContext;
};
/**
 * Paint a primitive with the common options applied.
 *
 * `drawShape(ctx)` must perform the primitive's fill and/or stroke on the
 * context it is given, resolving styles against that context. When the
 * primitive has a shadow and more than one pass, it is drawn to a scratch
 * canvas (under the target's current transform) and composited once with
 * the shadow and alpha, so the shadow is cast by the whole silhouette and
 * alpha is applied once.
 *
 * @param {CanvasRenderingContext2D} ctx - Target context
 * @param {Object} options - Draw options
 * @param {number} passes - Number of fill/stroke passes the shape needs
 * @param {(ctx: CanvasRenderingContext2D) => void} drawShape
 */
paint_fn = function(ctx, options, passes, drawShape) {
  if (options.shadow && passes > 1) {
    const scratch = __privateMethod(this, _CanvasRenderer_instances, scratch_fn).call(this);
    scratch.save();
    scratch.setTransform(1, 0, 0, 1, 0, 0);
    scratch.clearRect(0, 0, this.scratchBuffer.width, this.scratchBuffer.height);
    scratch.setTransform(ctx.getTransform());
    drawShape(scratch);
    scratch.restore();
    ctx.save();
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    __privateMethod(this, _CanvasRenderer_instances, applyCommon_fn).call(this, ctx, options);
    ctx.drawImage(this.scratchBuffer, 0, 0);
    ctx.restore();
    return;
  }
  ctx.save();
  __privateMethod(this, _CanvasRenderer_instances, applyCommon_fn).call(this, ctx, options);
  drawShape(ctx);
  ctx.restore();
};
buildFont_fn = function(options) {
  const size = typeof options.fontSize === "number" ? `${options.fontSize}px` : options.fontSize || "16px";
  return `${options.fontWeight || "normal"} ${size} ${options.fontFamily || "system-ui"}`.trim();
};
popState_fn = function(kind) {
  const entry = this.stateStack.pop();
  if (!entry) return;
  if (entry.kind !== kind) {
    console.warn(`CanvasRenderer: pop${kind === "clip" ? "Clip" : "Transform"}() called but the top of the state stack is a ${entry.kind}; transform/clip pushes must nest`);
  }
  entry.ctx.restore();
};
function identity() {
  return [1, 0, 0, 1, 0, 0];
}
function multiply(m, n) {
  return [
    m[0] * n[0] + m[2] * n[1],
    m[1] * n[0] + m[3] * n[1],
    m[0] * n[2] + m[2] * n[3],
    m[1] * n[2] + m[3] * n[3],
    m[0] * n[4] + m[2] * n[5] + m[4],
    m[1] * n[4] + m[3] * n[5] + m[5]
  ];
}
function translation(x, y) {
  return [1, 0, 0, 1, x, y];
}
function rotation(angle) {
  const c = Math.cos(angle);
  const s = Math.sin(angle);
  return [c, s, -s, c, 0, 0];
}
function scaling(sx, sy) {
  return [sx, 0, 0, sy, 0, 0];
}
function fromTransform({ x = 0, y = 0, rotation: angle = 0, scaleX = 1, scaleY = 1 } = {}) {
  let m = translation(x, y);
  if (angle) m = multiply(m, rotation(angle));
  if (scaleX !== 1 || scaleY !== 1) m = multiply(m, scaling(scaleX, scaleY));
  return m;
}
function apply(m, x, y) {
  return [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
}
function applyToPositions(m, positions) {
  const out = new Array(positions.length);
  for (let i = 0; i < positions.length; i += 2) {
    const x = positions[i];
    const y = positions[i + 1];
    out[i] = m[0] * x + m[2] * y + m[4];
    out[i + 1] = m[1] * x + m[3] * y + m[5];
  }
  return out;
}
function maxScale(m) {
  return Math.sqrt(Math.max(m[0] * m[0] + m[1] * m[1], m[2] * m[2] + m[3] * m[3]));
}
const cache = /* @__PURE__ */ new Map();
function parseColor(color) {
  const key = typeof color === "string" ? color : String(color);
  let value = cache.get(key);
  if (value) return value;
  value = parseUncached(key.trim().toLowerCase());
  if (cache.size > 4096) cache.clear();
  cache.set(key, value);
  return value;
}
function parseColorPremultiplied(color) {
  const [r, g, b, a] = parseColor(color);
  return [r * a, g * a, b * a, a];
}
function parseUncached(value) {
  if (value.startsWith("#")) {
    let hex = value.slice(1);
    if (hex.length === 3 || hex.length === 4) {
      hex = [...hex].map((c) => c + c).join("");
    }
    if (hex.length === 6) hex += "ff";
    if (hex.length !== 8 || !/^[0-9a-f]{8}$/.test(hex)) {
      throw new Error(`Unsupported colour: '${value}'`);
    }
    const int = parseInt(hex, 16);
    return [
      (int >>> 24 & 255) / 255,
      (int >>> 16 & 255) / 255,
      (int >>> 8 & 255) / 255,
      (int & 255) / 255
    ];
  }
  const fn = value.match(/^rgba?\(([^)]+)\)$/);
  if (fn) {
    const parts = fn[1].split(/[\s,/]+/).filter(Boolean);
    const channel = (p) => p.endsWith("%") ? parseFloat(p) * 2.55 : parseFloat(p);
    const alpha = parts[3] === void 0 ? 1 : parts[3].endsWith("%") ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    return [
      clamp01$1(channel(parts[0]) / 255),
      clamp01$1(channel(parts[1]) / 255),
      clamp01$1(channel(parts[2]) / 255),
      clamp01$1(alpha)
    ];
  }
  if (value === "transparent") return [0, 0, 0, 0];
  const named = NAMED[value];
  if (named !== void 0) {
    return [(named >> 16 & 255) / 255, (named >> 8 & 255) / 255, (named & 255) / 255, 1];
  }
  throw new Error(`Unsupported colour: '${value}'`);
}
function clamp01$1(v) {
  return v < 0 ? 0 : v > 1 ? 1 : Number.isNaN(v) ? 0 : v;
}
const NAMED = {
  aliceblue: 15792383,
  antiquewhite: 16444375,
  aqua: 65535,
  aquamarine: 8388564,
  azure: 15794175,
  beige: 16119260,
  bisque: 16770244,
  black: 0,
  blanchedalmond: 16772045,
  blue: 255,
  blueviolet: 9055202,
  brown: 10824234,
  burlywood: 14596231,
  cadetblue: 6266528,
  chartreuse: 8388352,
  chocolate: 13789470,
  coral: 16744272,
  cornflowerblue: 6591981,
  cornsilk: 16775388,
  crimson: 14423100,
  cyan: 65535,
  darkblue: 139,
  darkcyan: 35723,
  darkgoldenrod: 12092939,
  darkgray: 11119017,
  darkgreen: 25600,
  darkgrey: 11119017,
  darkkhaki: 12433259,
  darkmagenta: 9109643,
  darkolivegreen: 5597999,
  darkorange: 16747520,
  darkorchid: 10040012,
  darkred: 9109504,
  darksalmon: 15308410,
  darkseagreen: 9419919,
  darkslateblue: 4734347,
  darkslategray: 3100495,
  darkslategrey: 3100495,
  darkturquoise: 52945,
  darkviolet: 9699539,
  deeppink: 16716947,
  deepskyblue: 49151,
  dimgray: 6908265,
  dimgrey: 6908265,
  dodgerblue: 2003199,
  firebrick: 11674146,
  floralwhite: 16775920,
  forestgreen: 2263842,
  fuchsia: 16711935,
  gainsboro: 14474460,
  ghostwhite: 16316671,
  gold: 16766720,
  goldenrod: 14329120,
  gray: 8421504,
  green: 32768,
  greenyellow: 11403055,
  grey: 8421504,
  honeydew: 15794160,
  hotpink: 16738740,
  indianred: 13458524,
  indigo: 4915330,
  ivory: 16777200,
  khaki: 15787660,
  lavender: 15132410,
  lavenderblush: 16773365,
  lawngreen: 8190976,
  lemonchiffon: 16775885,
  lightblue: 11393254,
  lightcoral: 15761536,
  lightcyan: 14745599,
  lightgoldenrodyellow: 16448210,
  lightgray: 13882323,
  lightgreen: 9498256,
  lightgrey: 13882323,
  lightpink: 16758465,
  lightsalmon: 16752762,
  lightseagreen: 2142890,
  lightskyblue: 8900346,
  lightslategray: 7833753,
  lightslategrey: 7833753,
  lightsteelblue: 11584734,
  lightyellow: 16777184,
  lime: 65280,
  limegreen: 3329330,
  linen: 16445670,
  magenta: 16711935,
  maroon: 8388608,
  mediumaquamarine: 6737322,
  mediumblue: 205,
  mediumorchid: 12211667,
  mediumpurple: 9662683,
  mediumseagreen: 3978097,
  mediumslateblue: 8087790,
  mediumspringgreen: 64154,
  mediumturquoise: 4772300,
  mediumvioletred: 13047173,
  midnightblue: 1644912,
  mintcream: 16121850,
  mistyrose: 16770273,
  moccasin: 16770229,
  navajowhite: 16768685,
  navy: 128,
  oldlace: 16643558,
  olive: 8421376,
  olivedrab: 7048739,
  orange: 16753920,
  orangered: 16729344,
  orchid: 14315734,
  palegoldenrod: 15657130,
  palegreen: 10025880,
  paleturquoise: 11529966,
  palevioletred: 14381203,
  papayawhip: 16773077,
  peachpuff: 16767673,
  peru: 13468991,
  pink: 16761035,
  plum: 14524637,
  powderblue: 11591910,
  purple: 8388736,
  rebeccapurple: 6697881,
  red: 16711680,
  rosybrown: 12357519,
  royalblue: 4286945,
  saddlebrown: 9127187,
  salmon: 16416882,
  sandybrown: 16032864,
  seagreen: 3050327,
  seashell: 16774638,
  sienna: 10506797,
  silver: 12632256,
  skyblue: 8900331,
  slateblue: 6970061,
  slategray: 7372944,
  slategrey: 7372944,
  snow: 16775930,
  springgreen: 65407,
  steelblue: 4620980,
  tan: 13808780,
  teal: 32896,
  thistle: 14204888,
  tomato: 16737095,
  turquoise: 4251856,
  violet: 15631086,
  wheat: 16113331,
  white: 16777215,
  whitesmoke: 16119285,
  yellow: 16776960,
  yellowgreen: 10145074
};
function strokePolyline(points, closed, width) {
  const pts = dedupe(points);
  const n = pts.length / 2;
  const positions = [];
  const indices = [];
  if (n < 2) return { positions, indices };
  const hw = width / 2;
  const segCount = closed ? n : n - 1;
  const segNormals = [];
  for (let i = 0; i < segCount; i++) {
    const x0 = pts[2 * i], y0 = pts[2 * i + 1];
    const j = (i + 1) % n;
    const x1 = pts[2 * j], y1 = pts[2 * j + 1];
    let dx = x1 - x0, dy = y1 - y0;
    const len = Math.hypot(dx, dy) || 1;
    dx /= len;
    dy /= len;
    const nx = -dy * hw, ny = dx * hw;
    segNormals.push(nx, ny);
    const base = positions.length / 2;
    positions.push(x0 + nx, y0 + ny, x0 - nx, y0 - ny, x1 + nx, y1 + ny, x1 - nx, y1 - ny);
    indices.push(base, base + 1, base + 2, base + 1, base + 3, base + 2);
  }
  const joinStart = closed ? 0 : 1;
  const joinEnd = closed ? n : n - 1;
  for (let i = joinStart; i < joinEnd; i++) {
    const prev = (i - 1 + segCount) % segCount;
    const next = i % segCount;
    const px = pts[2 * i], py = pts[2 * i + 1];
    const pnx = segNormals[2 * prev], pny = segNormals[2 * prev + 1];
    const nnx = segNormals[2 * next], nny = segNormals[2 * next + 1];
    if (Math.abs(pnx - nnx) < 1e-6 && Math.abs(pny - nny) < 1e-6) continue;
    const base = positions.length / 2;
    positions.push(px, py, px + pnx, py + pny, px + nnx, py + nny, px - pnx, py - pny, px - nnx, py - nny);
    indices.push(base, base + 1, base + 2, base, base + 3, base + 4);
  }
  return { positions, indices };
}
function dedupe(points) {
  const out = [];
  for (let i = 0; i < points.length; i += 2) {
    const x = points[i], y = points[i + 1];
    const m2 = out.length;
    if (m2 >= 2 && Math.abs(out[m2 - 2] - x) < 1e-9 && Math.abs(out[m2 - 1] - y) < 1e-9) continue;
    out.push(x, y);
  }
  const m = out.length;
  if (m >= 4 && Math.abs(out[0] - out[m - 2]) < 1e-9 && Math.abs(out[1] - out[m - 1]) < 1e-9) {
    out.length = m - 2;
  }
  return out;
}
const TWO_PI = Math.PI * 2;
function arcPoints(x, y, radius, startAngle = 0, endAngle = TWO_PI) {
  let sweep = endAngle - startAngle;
  let full = false;
  if (sweep >= TWO_PI) {
    sweep = TWO_PI;
    full = true;
  } else if (sweep < 0) {
    sweep = (sweep % TWO_PI + TWO_PI) % TWO_PI;
  }
  const segments = arcSegments(radius, sweep);
  const points = [];
  const count = full ? segments : segments + 1;
  for (let i = 0; i < count; i++) {
    const a = startAngle + sweep * i / segments;
    points.push(x + Math.cos(a) * radius, y + Math.sin(a) * radius);
  }
  return { points, full };
}
function arcSegments(radius, sweep) {
  const perRadian = Math.max(2, Math.ceil(Math.sqrt(Math.max(radius, 1)) * 2.5));
  return Math.min(256, Math.max(8, Math.ceil(Math.abs(sweep) * perRadian)));
}
function roundRectPoints(x, y, width, height, radius = 0) {
  let [tl, tr, br, bl] = normalizeRadii(radius);
  const limit = Math.min(width, height) / 2;
  tl = Math.min(tl, limit);
  tr = Math.min(tr, limit);
  br = Math.min(br, limit);
  bl = Math.min(bl, limit);
  if (tl === 0 && tr === 0 && br === 0 && bl === 0) {
    return [x, y, x + width, y, x + width, y + height, x, y + height];
  }
  const points = [];
  corner(points, x + width - tr, y + tr, tr, -Math.PI / 2, 0);
  corner(points, x + width - br, y + height - br, br, 0, Math.PI / 2);
  corner(points, x + bl, y + height - bl, bl, Math.PI / 2, Math.PI);
  corner(points, x + tl, y + tl, tl, Math.PI, Math.PI * 1.5);
  return points;
}
function corner(points, cx, cy, r, from, to) {
  if (r <= 0) {
    points.push(cx, cy);
    return;
  }
  const segments = Math.max(4, Math.ceil(arcSegments(r, to - from)));
  for (let i = 0; i <= segments; i++) {
    const a = from + (to - from) * i / segments;
    points.push(cx + Math.cos(a) * r, cy + Math.sin(a) * r);
  }
}
function normalizeRadii(radius) {
  if (typeof radius === "number") return [radius, radius, radius, radius];
  if (!Array.isArray(radius) || radius.length === 0) return [0, 0, 0, 0];
  if (radius.length === 1) return [radius[0], radius[0], radius[0], radius[0]];
  if (radius.length === 2) return [radius[0], radius[1], radius[0], radius[1]];
  if (radius.length === 3) return [radius[0], radius[1], radius[2], radius[1]];
  return [radius[0], radius[1], radius[2], radius[3]];
}
function fanIndices(n, base = 0) {
  const indices = [];
  for (let i = 1; i < n - 1; i++) indices.push(base, base + i, base + i + 1);
  return indices;
}
function triangulate(points) {
  const n = points.length / 2;
  if (n < 3) return [];
  if (n === 3) return [0, 1, 2];
  const area = signedArea(points);
  if (Math.abs(area) < 1e-12) return [];
  const ccw = area > 0;
  const remaining = [];
  for (let i = 0; i < n; i++) remaining.push(i);
  const indices = [];
  let guard = 0;
  while (remaining.length > 3 && guard++ < n * n) {
    let clipped = false;
    for (let i = 0; i < remaining.length; i++) {
      const i0 = remaining[(i - 1 + remaining.length) % remaining.length];
      const i1 = remaining[i];
      const i2 = remaining[(i + 1) % remaining.length];
      if (!isConvex(points, i0, i1, i2, ccw)) continue;
      if (containsAnyPoint(points, remaining, i0, i1, i2)) continue;
      indices.push(i0, i1, i2);
      remaining.splice(i, 1);
      clipped = true;
      break;
    }
    if (!clipped) break;
  }
  if (remaining.length === 3) indices.push(remaining[0], remaining[1], remaining[2]);
  return indices;
}
function signedArea(points) {
  let area = 0;
  const n = points.length / 2;
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += points[2 * i] * points[2 * j + 1] - points[2 * j] * points[2 * i + 1];
  }
  return area / 2;
}
function isConvex(p, i0, i1, i2, ccw) {
  const cross = (p[2 * i1] - p[2 * i0]) * (p[2 * i2 + 1] - p[2 * i1 + 1]) - (p[2 * i1 + 1] - p[2 * i0 + 1]) * (p[2 * i2] - p[2 * i1]);
  return ccw ? cross > 1e-12 : cross < -1e-12;
}
function containsAnyPoint(p, remaining, i0, i1, i2) {
  for (const k of remaining) {
    if (k === i0 || k === i1 || k === i2) continue;
    if (pointInTriangle(p[2 * k], p[2 * k + 1], p, i0, i1, i2)) return true;
  }
  return false;
}
function pointInTriangle(x, y, p, i0, i1, i2) {
  const ax = p[2 * i0], ay = p[2 * i0 + 1];
  const bx = p[2 * i1], by = p[2 * i1 + 1];
  const cx = p[2 * i2], cy = p[2 * i2 + 1];
  const d1 = (x - bx) * (ay - by) - (ax - bx) * (y - by);
  const d2 = (x - cx) * (by - cy) - (bx - cx) * (y - cy);
  const d3 = (x - ax) * (cy - ay) - (cx - ax) * (y - ay);
  const hasNeg = d1 < 0 || d2 < 0 || d3 < 0;
  const hasPos = d1 > 0 || d2 > 0 || d3 > 0;
  return !(hasNeg && hasPos);
}
const GRADIENT_LUT_SIZE = 256;
function bakeGradient(stops) {
  const parsed = (stops || []).map((s) => ({ offset: clamp01(s.offset), color: parseColor(s.color) })).sort((a, b) => a.offset - b.offset);
  if (parsed.length === 0) parsed.push({ offset: 0, color: [0, 0, 0, 0] });
  const out = new Uint8Array(GRADIENT_LUT_SIZE * 4);
  for (let i = 0; i < GRADIENT_LUT_SIZE; i++) {
    const t = i / (GRADIENT_LUT_SIZE - 1);
    const [r, g, b, a] = sample(parsed, t);
    out[i * 4] = Math.round(r * a * 255);
    out[i * 4 + 1] = Math.round(g * a * 255);
    out[i * 4 + 2] = Math.round(b * a * 255);
    out[i * 4 + 3] = Math.round(a * 255);
  }
  return out;
}
function gradientKey(style) {
  return (style.stops || []).map((s) => `${s.offset}:${s.color}`).join("|");
}
function sample(stops, t) {
  if (t <= stops[0].offset) return stops[0].color;
  const last = stops[stops.length - 1];
  if (t >= last.offset) return last.color;
  for (let i = 0; i < stops.length - 1; i++) {
    const a = stops[i], b = stops[i + 1];
    if (t >= a.offset && t <= b.offset) {
      const span = b.offset - a.offset;
      const f = span <= 0 ? 0 : (t - a.offset) / span;
      return a.color.map((c, k) => c + (b.color[k] - c) * f);
    }
  }
  return last.color;
}
function clamp01(v) {
  return Math.min(1, Math.max(0, Number(v) || 0));
}
function createContext(canvas, attributes) {
  const gl = canvas.getContext("webgl2", attributes);
  if (!gl) {
    throw new Error("WebGLRenderer: WebGL2 is not available on this canvas/browser");
  }
  return gl;
}
function createProgram(gl, vertexSource, fragmentSource, attributeLocations = {}) {
  const vs = compileShader(gl, gl.VERTEX_SHADER, vertexSource);
  const fs = compileShader(gl, gl.FRAGMENT_SHADER, fragmentSource);
  const program = gl.createProgram();
  gl.attachShader(program, vs);
  gl.attachShader(program, fs);
  for (const [name, location2] of Object.entries(attributeLocations)) {
    gl.bindAttribLocation(program, location2, name);
  }
  gl.linkProgram(program);
  gl.deleteShader(vs);
  gl.deleteShader(fs);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS) && !gl.isContextLost()) {
    const log = gl.getProgramInfoLog(program);
    gl.deleteProgram(program);
    throw new Error(`WebGLRenderer: program link failed: ${log}`);
  }
  const uniforms = {};
  const count = gl.getProgramParameter(program, gl.ACTIVE_UNIFORMS) || 0;
  for (let i = 0; i < count; i++) {
    const info = gl.getActiveUniform(program, i);
    if (info) uniforms[info.name.replace(/\[0\]$/, "")] = gl.getUniformLocation(program, info.name);
  }
  return { program, uniforms };
}
function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS) && !gl.isContextLost()) {
    const log = gl.getShaderInfoLog(shader);
    gl.deleteShader(shader);
    throw new Error(`WebGLRenderer: shader compile failed: ${log}
${source}`);
  }
  return shader;
}
function createTexture(gl, { source, pixels, width, height, smooth = true, premultiply = !!source }) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, premultiply);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  if (source) {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, source);
  } else {
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, pixels || null);
  }
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
  setTextureFiltering(gl, smooth);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  return texture;
}
function setTextureFiltering(gl, smooth) {
  const filter = smooth ? gl.LINEAR : gl.NEAREST;
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, filter);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, filter);
}
function createRenderTarget(gl, width, height, { stencil = false, smooth = true } = {}) {
  const texture = createTexture(gl, { width, height, smooth });
  const framebuffer = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  let stencilBuffer = null;
  if (stencil) {
    stencilBuffer = gl.createRenderbuffer();
    gl.bindRenderbuffer(gl.RENDERBUFFER, stencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_STENCIL_ATTACHMENT, gl.RENDERBUFFER, stencilBuffer);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return { texture, framebuffer, stencilBuffer, width, height, smooth };
}
function setRenderTargetFiltering(gl, target, smooth) {
  if (!target || target.smooth === smooth) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  setTextureFiltering(gl, smooth);
  target.smooth = smooth;
}
function resizeRenderTarget(gl, target, width, height) {
  if (target.width === width && target.height === height) return;
  gl.bindTexture(gl.TEXTURE_2D, target.texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
  if (target.stencilBuffer) {
    gl.bindRenderbuffer(gl.RENDERBUFFER, target.stencilBuffer);
    gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH24_STENCIL8, width, height);
    gl.bindRenderbuffer(gl.RENDERBUFFER, null);
  }
  target.width = width;
  target.height = height;
}
function deleteRenderTarget(gl, target) {
  if (!target) return;
  if (target.stencilBuffer) gl.deleteRenderbuffer(target.stencilBuffer);
  gl.deleteFramebuffer(target.framebuffer);
  gl.deleteTexture(target.texture);
}
const ATTRIBUTES = {
  a_position: 0,
  a_uv: 1,
  a_color: 2,
  a_uvBounds: 3
};
const VERTEX_FLOATS = 12;
const MODE_SOLID = 0;
const MODE_TEXTURE = 1;
const MODE_GRADIENT = 2;
const MODE_SHADOW = 3;
const VERTEX_SHADER = `#version 300 es
precision highp float;
layout(location = 0) in vec2 a_position;
layout(location = 1) in vec2 a_uv;
layout(location = 2) in vec4 a_color;
layout(location = 3) in vec4 a_uvBounds;

uniform vec2 u_resolution;
uniform float u_flipY;

out vec2 v_uv;
out vec4 v_color;
out vec4 v_uvBounds;

void main() {
  v_uv = a_uv;
  v_color = a_color;
  v_uvBounds = a_uvBounds;
  vec2 clip = a_position / u_resolution * 2.0 - 1.0;
  gl_Position = vec4(clip.x, clip.y * u_flipY, 0.0, 1.0);
}
`;
const FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
in vec4 v_uvBounds;

uniform int u_mode;            // 0 solid, 1 texture, 2 gradient, 3 shadow tint
uniform sampler2D u_texture;
uniform int u_gradientType;    // 0 linear, 1 radial (concentric)
uniform vec4 u_gradient;       // linear: x0 y0 x1 y1   radial: x y r0 r1
uniform vec4 u_shadowColor;    // premultiplied

out vec4 fragColor;

void main() {
  if (u_mode == 0) {
    fragColor = v_color;
  } else if (u_mode == 1) {
    // Clamp into the sub-rectangle (inset half a texel by the CPU) so linear
    // filtering never bleeds neighbouring atlas tiles in.
    vec2 uv = clamp(v_uv, v_uvBounds.xy, v_uvBounds.zw);
    fragColor = texture(u_texture, uv) * v_color;
  } else if (u_mode == 2) {
    float t;
    if (u_gradientType == 0) {
      vec2 d = u_gradient.zw - u_gradient.xy;
      float len2 = dot(d, d);
      t = len2 > 0.0 ? dot(v_uv - u_gradient.xy, d) / len2 : 0.0;
    } else {
      float dist = distance(v_uv, u_gradient.xy);
      float span = u_gradient.w - u_gradient.z;
      t = span > 0.0 ? (dist - u_gradient.z) / span : 1.0;
    }
    fragColor = texture(u_texture, vec2(clamp(t, 0.0, 1.0), 0.5)) * v_color;
  } else {
    fragColor = u_shadowColor * texture(u_texture, v_uv).a * v_color.a;
  }
}
`;
const BLUR_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;
in vec4 v_uvBounds;

uniform sampler2D u_texture;
uniform vec2 u_direction;   // (1/w, 0) or (0, 1/h)
uniform float u_sigma;
uniform int u_radius;

out vec4 fragColor;

void main() {
  if (u_radius <= 0) {
    fragColor = texture(u_texture, v_uv);
    return;
  }
  float twoSigma2 = 2.0 * u_sigma * u_sigma;
  vec4 sum = texture(u_texture, v_uv);
  float weightSum = 1.0;
  for (int i = 1; i <= 128; i++) {
    if (i > u_radius) break;
    float w = exp(-float(i * i) / twoSigma2);
    vec2 offset = u_direction * float(i);
    sum += (texture(u_texture, v_uv + offset) + texture(u_texture, v_uv - offset)) * w;
    weightSum += 2.0 * w;
  }
  fragColor = sum / weightSum;
}
`;
const LIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;
in vec4 v_color;

out vec4 fragColor;

void main() {
  float d = length(v_uv);
  float falloff = clamp(1.0 - d, 0.0, 1.0);
  falloff *= falloff;
  fragColor = vec4(v_color.rgb * falloff, 1.0);
}
`;
const BRIGHT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_light;
uniform float u_threshold;

out vec4 fragColor;

void main() {
  vec3 lit = texture(u_scene, v_uv).rgb * texture(u_light, v_uv).rgb;
  float luma = max(max(lit.r, lit.g), lit.b);
  // Keep the colour, scale by how far past the threshold it is, so a bright
  // amber lamp blooms amber rather than white.
  float keep = max(0.0, luma - u_threshold) / max(luma, 0.0001);
  fragColor = vec4(lit * keep, 1.0);
}
`;
const PRESENT_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;

out vec4 fragColor;

void main() {
  fragColor = vec4(texture(u_scene, v_uv).rgb, 1.0);
}
`;
const COMPOSITE_FRAGMENT_SHADER = `#version 300 es
precision highp float;

in vec2 v_uv;

uniform sampler2D u_scene;
uniform sampler2D u_light;
uniform sampler2D u_bloom;
uniform float u_bloomStrength;
uniform float u_vignette;
uniform float u_vignetteStart;

out vec4 fragColor;

void main() {
  vec3 color = texture(u_scene, v_uv).rgb * texture(u_light, v_uv).rgb;
  color += texture(u_bloom, v_uv).rgb * u_bloomStrength;

  float r = length(v_uv - 0.5) * 1.41421356;
  color *= 1.0 - u_vignette * smoothstep(u_vignetteStart, 1.0, r);

  fragColor = vec4(color, 1.0);
}
`;
const NO_BOUNDS = [0, 0, 1, 1];
function applyBlendFunc(gl, mode) {
  switch (mode) {
    case "additive":
      gl.blendFunc(gl.ONE, gl.ONE);
      break;
    case "multiply":
      gl.blendFunc(gl.DST_COLOR, gl.ONE_MINUS_SRC_ALPHA);
      break;
    case "screen":
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_COLOR);
      break;
    default:
      gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
}
class Batch {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {Object} stats - Renderer stats object to count into
   * @param {number} [maxVertices]
   */
  constructor(gl, stats, maxVertices = 16384) {
    __privateAdd(this, _Batch_instances);
    this.gl = gl;
    this.stats = stats;
    const { program, uniforms } = createProgram(gl, VERTEX_SHADER, FRAGMENT_SHADER, ATTRIBUTES);
    this.program = program;
    this.uniforms = uniforms;
    this.vertexData = new Float32Array(maxVertices * VERTEX_FLOATS);
    this.indexData = new Uint32Array(maxVertices * 3);
    this.vertexCount = 0;
    this.indexCount = 0;
    this.vao = gl.createVertexArray();
    this.vertexBuffer = gl.createBuffer();
    this.indexBuffer = gl.createBuffer();
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(ATTRIBUTES.a_position);
    gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
    gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
    gl.enableVertexAttribArray(ATTRIBUTES.a_color);
    gl.vertexAttribPointer(ATTRIBUTES.a_color, 4, gl.FLOAT, false, stride, 16);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uvBounds);
    gl.vertexAttribPointer(ATTRIBUTES.a_uvBounds, 4, gl.FLOAT, false, stride, 32);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindVertexArray(null);
    this.key = null;
    this.applied = { mode: -1, texture: null, gradientType: -1, gradient: null, shadowColor: null, blend: null };
    this.resolution = [0, 0];
    this.flipY = -1;
    this.bounds = null;
  }
  /** Start recording the bounds of pushed positions (null to stop). */
  trackBounds(enabled) {
    this.bounds = enabled ? { minX: Infinity, minY: Infinity, maxX: -Infinity, maxY: -Infinity } : null;
  }
  destroy() {
    const gl = this.gl;
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.vertexBuffer);
    gl.deleteBuffer(this.indexBuffer);
    gl.deleteProgram(this.program);
  }
  /**
   * Set the output size. Default framebuffer output is y-flipped (pixel
   * y down → clip y up); offscreen render targets are not, so that their
   * texture rows end up in the same top-down order as pixel space.
   */
  setTarget(width, height, flipY) {
    if (this.resolution[0] !== width || this.resolution[1] !== height || this.flipY !== flipY) {
      this.flush();
      this.resolution = [width, height];
      this.flipY = flipY ? -1 : 1;
      this.resolutionDirty = true;
    }
  }
  /**
   * Start (or continue) a batch with the given paint state.
   * @param {{mode: number, texture?: WebGLTexture, gradientType?: number, gradient?: number[], shadowColor?: number[], blend?: string}} key
   */
  begin(key) {
    if (this.key && !sameKey(this.key, key)) this.flush();
    this.key = key;
  }
  /**
   * Append geometry.
   * @param {number[]} positions - Pixel-space [x, y, ...]
   * @param {number[]|null} uvs - [u, v, ...] or null for solid paint
   * @param {number[]} color - Premultiplied [r, g, b, a] for every vertex
   * @param {number[]} indices - Into `positions`
   * @param {number[]} [uvBounds] - [u0, v0, u1, v1] clamp for texture paint
   */
  push(positions, uvs, color, indices, uvBounds = NO_BOUNDS) {
    const vertexCount = positions.length / 2;
    if (vertexCount === 0 || indices.length === 0) return;
    __privateMethod(this, _Batch_instances, ensureCapacity_fn).call(this, vertexCount, indices.length);
    const base = this.vertexCount;
    let o = base * VERTEX_FLOATS;
    const vd = this.vertexData;
    const b = this.bounds;
    for (let i = 0; i < vertexCount; i++) {
      const x = positions[2 * i];
      const y = positions[2 * i + 1];
      if (b) {
        if (x < b.minX) b.minX = x;
        if (x > b.maxX) b.maxX = x;
        if (y < b.minY) b.minY = y;
        if (y > b.maxY) b.maxY = y;
      }
      vd[o++] = x;
      vd[o++] = y;
      vd[o++] = uvs ? uvs[2 * i] : 0;
      vd[o++] = uvs ? uvs[2 * i + 1] : 0;
      vd[o++] = color[0];
      vd[o++] = color[1];
      vd[o++] = color[2];
      vd[o++] = color[3];
      vd[o++] = uvBounds[0];
      vd[o++] = uvBounds[1];
      vd[o++] = uvBounds[2];
      vd[o++] = uvBounds[3];
    }
    const id = this.indexData;
    let k = this.indexCount;
    for (let i = 0; i < indices.length; i++) id[k++] = base + indices[i];
    this.vertexCount += vertexCount;
    this.indexCount = k;
  }
  /** Submit accumulated geometry as one draw call. */
  flush() {
    if (this.indexCount === 0) return;
    const gl = this.gl;
    const key = this.key;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    __privateMethod(this, _Batch_instances, applyState_fn).call(this, key);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertexData, 0, this.vertexCount * VERTEX_FLOATS);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferSubData(gl.ELEMENT_ARRAY_BUFFER, 0, this.indexData, 0, this.indexCount);
    gl.drawElements(gl.TRIANGLES, this.indexCount, gl.UNSIGNED_INT, 0);
    gl.bindVertexArray(null);
    this.stats.drawCalls++;
    this.vertexCount = 0;
    this.indexCount = 0;
  }
  /** Forget GPU-side state (after another program ran or a target switch). */
  invalidateState() {
    this.applied = { mode: -1, texture: null, gradientType: -1, gradient: null, shadowColor: null, blend: null };
    this.resolutionDirty = true;
  }
}
_Batch_instances = new WeakSet();
ensureCapacity_fn = function(vertexCount, indexCount) {
  const maxVertices = this.vertexData.length / VERTEX_FLOATS;
  if (vertexCount > maxVertices || indexCount > this.indexData.length) {
    this.flush();
    const gl = this.gl;
    const newMax = Math.max(vertexCount, maxVertices * 2);
    this.vertexData = new Float32Array(newMax * VERTEX_FLOATS);
    this.indexData = new Uint32Array(Math.max(indexCount, newMax * 3));
    gl.bindBuffer(gl.ARRAY_BUFFER, this.vertexBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.vertexData.byteLength, gl.DYNAMIC_DRAW);
    gl.bindBuffer(gl.ELEMENT_ARRAY_BUFFER, this.indexBuffer);
    gl.bufferData(gl.ELEMENT_ARRAY_BUFFER, this.indexData.byteLength, gl.DYNAMIC_DRAW);
    return;
  }
  if (this.vertexCount + vertexCount > maxVertices || this.indexCount + indexCount > this.indexData.length) {
    this.flush();
  }
};
applyState_fn = function(key) {
  const gl = this.gl;
  const u = this.uniforms;
  const applied = this.applied;
  let changes = 0;
  if (this.resolutionDirty) {
    gl.uniform2f(u.u_resolution, this.resolution[0], this.resolution[1]);
    gl.uniform1f(u.u_flipY, this.flipY);
    this.resolutionDirty = false;
    changes++;
  }
  const blend = key.blend || "normal";
  if (applied.blend !== blend) {
    applyBlendFunc(gl, blend);
    applied.blend = blend;
    changes++;
  }
  if (applied.mode !== key.mode) {
    gl.uniform1i(u.u_mode, key.mode);
    applied.mode = key.mode;
    changes++;
  }
  const texture = key.texture || null;
  if (key.mode !== MODE_SOLID && applied.texture !== texture) {
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, texture);
    gl.uniform1i(u.u_texture, 0);
    applied.texture = texture;
    changes++;
  }
  if (key.mode === MODE_GRADIENT) {
    const g = key.gradient;
    if (applied.gradientType !== key.gradientType || !sameArray(applied.gradient, g)) {
      gl.uniform1i(u.u_gradientType, key.gradientType);
      gl.uniform4f(u.u_gradient, g[0], g[1], g[2], g[3]);
      applied.gradientType = key.gradientType;
      applied.gradient = g.slice();
      changes++;
    }
  }
  if (key.mode === MODE_SHADOW && !sameArray(applied.shadowColor, key.shadowColor)) {
    const c = key.shadowColor;
    gl.uniform4f(u.u_shadowColor, c[0], c[1], c[2], c[3]);
    applied.shadowColor = c.slice();
    changes++;
  }
  this.stats.stateChanges += changes;
};
function sameKey(a, b) {
  if (a.mode !== b.mode) return false;
  if ((a.blend || "normal") !== (b.blend || "normal")) return false;
  if (a.mode === MODE_SOLID) return true;
  if ((a.texture || null) !== (b.texture || null)) return false;
  if (a.mode === MODE_GRADIENT) {
    return a.gradientType === b.gradientType && sameArray(a.gradient, b.gradient);
  }
  if (a.mode === MODE_SHADOW) return sameArray(a.shadowColor, b.shadowColor);
  return true;
}
function sameArray(a, b) {
  if (a === b) return true;
  if (!a || !b || a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
class TextureCache {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {boolean} smooth - Linear (true) or nearest filtering
   */
  constructor(gl, smooth) {
    this.gl = gl;
    this.smooth = smooth;
    this.entries = /* @__PURE__ */ new WeakMap();
    this.textures = /* @__PURE__ */ new Set();
  }
  /**
   * Get (uploading on first use) the texture for an image source.
   * @returns {{texture: WebGLTexture, width: number, height: number}|null}
   *   null when the source has no pixels yet (e.g. an image still loading)
   */
  get(source) {
    let entry = this.entries.get(source);
    if (entry) return entry;
    const width = sourceWidth(source);
    const height = sourceHeight(source);
    if (!width || !height) return null;
    if (source instanceof HTMLImageElement && !source.complete) return null;
    const texture = createTexture(this.gl, { source, smooth: this.smooth });
    entry = { texture, width, height };
    this.entries.set(source, entry);
    this.textures.add(texture);
    return entry;
  }
  setSmoothing(smooth) {
    if (this.smooth === smooth) return;
    this.smooth = smooth;
    const gl = this.gl;
    for (const texture of this.textures) {
      gl.bindTexture(gl.TEXTURE_2D, texture);
      setTextureFiltering(gl, smooth);
    }
  }
  destroy() {
    for (const texture of this.textures) this.gl.deleteTexture(texture);
    this.textures.clear();
    this.entries = /* @__PURE__ */ new WeakMap();
  }
}
function sourceWidth(source) {
  return source.naturalWidth || source.videoWidth || source.width || 0;
}
function sourceHeight(source) {
  return source.naturalHeight || source.videoHeight || source.height || 0;
}
const _TextLabels = class _TextLabels {
  /**
   * @param {WebGL2RenderingContext} gl
   */
  constructor(gl) {
    __privateAdd(this, _TextLabels_instances);
    this.gl = gl;
    this.scratch = document.createElement("canvas");
    this.scratch.width = 1;
    this.scratch.height = 1;
    this.measureContext = this.scratch.getContext("2d");
    this.cache = /* @__PURE__ */ new Map();
  }
  destroy() {
    for (const entry of this.cache.values()) this.gl.deleteTexture(entry.texture);
    this.cache.clear();
  }
  /** Same font string the Canvas backend builds, so metrics agree. */
  static font(options) {
    const size = typeof options.fontSize === "number" ? `${options.fontSize}px` : options.fontSize || "16px";
    return `${options.fontWeight || "normal"} ${size} ${options.fontFamily || "system-ui"}`.trim();
  }
  static fontSizePx(options) {
    return parseInt(options.fontSize ?? options.font) || 16;
  }
  measure(text, style = {}) {
    const ctx = this.measureContext;
    ctx.font = style.font || _TextLabels.font(style);
    return { width: ctx.measureText(text).width, height: _TextLabels.fontSizePx(style) };
  }
  /**
   * Get (rasterizing on first use) the label for a drawText call.
   * The returned anchor is the point inside the label that maps onto the
   * call's (x, y), so position = (x - anchorX, y - anchorY).
   */
  /**
   * @param {Object} options - drawText options
   * @param {number} frame - Current frame index, for eviction
   * @param {number} [scale=1] - Texels per coordinate unit. Labels are
   *   rasterized at this density and drawn at their coordinate-space size, so
   *   UI text stays sharp on HiDPI displays and at high render resolutions.
   */
  get(options, frame, scale = 1) {
    const quantized = Math.max(0.25, Math.min(4, Math.round(scale * 4) / 4));
    const key = `${labelKey(options)}${quantized}`;
    let entry = this.cache.get(key);
    if (!entry) {
      entry = __privateMethod(this, _TextLabels_instances, rasterize_fn).call(this, options, quantized);
      if (!entry) return null;
      this.cache.set(key, entry);
    }
    entry.lastUsed = frame;
    return entry;
  }
  evict(frame, maxAge = 60) {
    if (this.cache.size < 32) return;
    for (const [key, entry] of this.cache) {
      if (frame - entry.lastUsed > maxAge) {
        this.gl.deleteTexture(entry.texture);
        this.cache.delete(key);
      }
    }
  }
};
_TextLabels_instances = new WeakSet();
rasterize_fn = function(options, scale = 1) {
  const text = String(options.text ?? "");
  const font = _TextLabels.font(options);
  const size = _TextLabels.fontSizePx(options);
  const stroke = !!options.strokeStyle;
  const lineWidth = stroke ? options.lineWidth || 3 : 0;
  const pad = Math.ceil(lineWidth) + 2;
  const ctx = this.measureContext;
  ctx.font = font;
  const textWidth = ctx.measureText(text).width;
  if (textWidth <= 0 && !text.trim()) return null;
  const width = Math.max(1, Math.ceil(textWidth + 2 * pad));
  const height = Math.max(1, Math.ceil(size * 2 + 2 * pad));
  const align = options.textAlign || "left";
  const baseline = options.textBaseline || "top";
  const anchorX = align === "center" ? pad + textWidth / 2 : align === "right" || align === "end" ? pad + textWidth : pad;
  const anchorY = baseline === "top" || baseline === "hanging" ? pad : baseline === "middle" ? pad + size : pad + size * 1.5;
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.ceil(width * scale));
  canvas.height = Math.max(1, Math.ceil(height * scale));
  const c = canvas.getContext("2d");
  c.scale(scale, scale);
  c.font = font;
  c.textAlign = align;
  c.textBaseline = baseline;
  const dx = anchorX - (options.x || 0);
  const dy = anchorY - (options.y || 0);
  if (stroke) {
    c.strokeStyle = resolveStyle(c, options.strokeStyle, dx, dy);
    c.lineWidth = lineWidth;
    c.lineJoin = "round";
    c.strokeText(text, anchorX, anchorY);
  }
  c.fillStyle = resolveStyle(c, options.fillStyle || "#000", dx, dy);
  c.fillText(text, anchorX, anchorY);
  const texture = createTexture(this.gl, { source: canvas, smooth: true });
  return { texture, width, height, anchorX, anchorY, lastUsed: 0 };
};
let TextLabels = _TextLabels;
function resolveStyle(ctx, style, dx, dy) {
  if (!style || typeof style !== "object" || !style.type) return style;
  let gradient;
  if (style.type === "linear") {
    gradient = ctx.createLinearGradient(style.x0 + dx, style.y0 + dy, style.x1 + dx, style.y1 + dy);
  } else if (style.type === "radial") {
    gradient = ctx.createRadialGradient(style.x + dx, style.y + dy, style.r0 ?? 0, style.x + dx, style.y + dy, style.r1);
  } else {
    return "#000";
  }
  for (const stop of style.stops || []) gradient.addColorStop(stop.offset, stop.color);
  return gradient;
}
function styleKey(style) {
  return typeof style === "object" && style ? JSON.stringify(style) : String(style ?? "");
}
function labelKey(options) {
  return [
    options.text,
    TextLabels.font(options),
    styleKey(options.fillStyle),
    styleKey(options.strokeStyle),
    options.lineWidth ?? "",
    options.textAlign || "left",
    options.textBaseline || "top",
    // Gradient coordinates are relative to the call position.
    typeof options.fillStyle === "object" || typeof options.strokeStyle === "object" ? `${options.x},${options.y}` : ""
  ].join("");
}
const _ShadowPass = class _ShadowPass {
  constructor(gl, width, height, pixelWidth = width, pixelHeight = height) {
    __privateAdd(this, _ShadowPass_instances);
    this.gl = gl;
    this.a = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.b = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.width = width;
    this.height = height;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    const { program, uniforms } = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER, ATTRIBUTES);
    this.program = program;
    this.uniforms = uniforms;
    this.vao = gl.createVertexArray();
    this.buffer = gl.createBuffer();
    this.quad = new Float32Array(4 * VERTEX_FLOATS);
    gl.bindVertexArray(this.vao);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferData(gl.ARRAY_BUFFER, this.quad.byteLength, gl.DYNAMIC_DRAW);
    const stride = VERTEX_FLOATS * 4;
    gl.enableVertexAttribArray(ATTRIBUTES.a_position);
    gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
    gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
    gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
    gl.bindVertexArray(null);
  }
  destroy() {
    const gl = this.gl;
    deleteRenderTarget(gl, this.a);
    deleteRenderTarget(gl, this.b);
    gl.deleteVertexArray(this.vao);
    gl.deleteBuffer(this.buffer);
    gl.deleteProgram(this.program);
  }
  /**
   * @param {number} width - Coordinate-space width (world or UI units)
   * @param {number} height - Coordinate-space height
   * @param {number} [pixelWidth=width] - Target width in pixels
   * @param {number} [pixelHeight=height] - Target height in pixels
   */
  resize(width, height, pixelWidth = width, pixelHeight = height) {
    resizeRenderTarget(this.gl, this.a, pixelWidth, pixelHeight);
    resizeRenderTarget(this.gl, this.b, pixelWidth, pixelHeight);
    this.width = width;
    this.height = height;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
  }
  /** Blur radius in pixels for a shadow descriptor. */
  static radius(shadow) {
    const sigma = (shadow.blur || 0) / 2;
    return sigma > 0 ? Math.min(128, Math.ceil(sigma * 3)) : 0;
  }
  /** Bind target A cleared to transparent, ready for the silhouette. */
  beginSilhouette() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
  }
  /**
   * Blur the silhouette in A over `region` (pixel-space bounds already
   * expanded by the blur radius). Leaves the result in A.
   * @returns {number} GPU draw calls issued
   */
  blur(region, shadow) {
    const gl = this.gl;
    const radius = _ShadowPass.radius(shadow);
    if (radius === 0) return 0;
    const sigma = (shadow.blur || 0) / 2;
    gl.useProgram(this.program);
    gl.bindVertexArray(this.vao);
    gl.uniform2f(this.uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(this.uniforms.u_flipY, 1);
    gl.uniform1i(this.uniforms.u_texture, 0);
    const texelScale = __privateGet(this, _ShadowPass_instances, pixelScaleX_get);
    gl.uniform1f(this.uniforms.u_sigma, sigma * texelScale);
    gl.uniform1i(this.uniforms.u_radius, Math.min(128, Math.ceil(radius * texelScale)));
    gl.disable(gl.BLEND);
    gl.activeTexture(gl.TEXTURE0);
    const tall = expand(region, 0, radius, this.width, this.height);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.b.framebuffer);
    gl.enable(gl.SCISSOR_TEST);
    scissor(gl, __privateMethod(this, _ShadowPass_instances, pixelRect_fn).call(this, tall));
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    scissor(gl, __privateMethod(this, _ShadowPass_instances, pixelRect_fn).call(this, region));
    gl.bindTexture(gl.TEXTURE_2D, this.a.texture);
    gl.uniform2f(this.uniforms.u_direction, 1 / this.pixelWidth, 0);
    __privateMethod(this, _ShadowPass_instances, drawQuad_fn).call(this, region);
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.a.framebuffer);
    gl.bindTexture(gl.TEXTURE_2D, this.b.texture);
    gl.uniform2f(this.uniforms.u_direction, 0, 1 / this.pixelHeight);
    __privateMethod(this, _ShadowPass_instances, drawQuad_fn).call(this, region);
    gl.disable(gl.SCISSOR_TEST);
    gl.enable(gl.BLEND);
    gl.bindVertexArray(null);
    return 2;
  }
  /** The blurred silhouette texture (target A). */
  get texture() {
    return this.a.texture;
  }
};
_ShadowPass_instances = new WeakSet();
pixelScaleX_get = function() {
  return this.pixelWidth / this.width;
};
pixelScaleY_get = function() {
  return this.pixelHeight / this.height;
};
/** Convert coordinate-space bounds to the integer pixel rect for scissoring. */
pixelRect_fn = function(r) {
  const sx = __privateGet(this, _ShadowPass_instances, pixelScaleX_get);
  const sy = __privateGet(this, _ShadowPass_instances, pixelScaleY_get);
  return {
    minX: Math.max(0, Math.floor(r.minX * sx)),
    minY: Math.max(0, Math.floor(r.minY * sy)),
    maxX: Math.min(this.pixelWidth, Math.ceil(r.maxX * sx)),
    maxY: Math.min(this.pixelHeight, Math.ceil(r.maxY * sy))
  };
};
drawQuad_fn = function(r) {
  const gl = this.gl;
  const q = this.quad;
  const corners = [r.minX, r.minY, r.maxX, r.minY, r.maxX, r.maxY, r.minX, r.maxY];
  for (let i = 0; i < 4; i++) {
    const o = i * VERTEX_FLOATS;
    q[o] = corners[2 * i];
    q[o + 1] = corners[2 * i + 1];
    q[o + 2] = corners[2 * i] / this.width;
    q[o + 3] = corners[2 * i + 1] / this.height;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, q);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
};
let ShadowPass = _ShadowPass;
function expand(r, dx, dy, width, height) {
  return {
    minX: Math.max(0, Math.floor(r.minX - dx)),
    minY: Math.max(0, Math.floor(r.minY - dy)),
    maxX: Math.min(width, Math.ceil(r.maxX + dx)),
    maxY: Math.min(height, Math.ceil(r.maxY + dy))
  };
}
function scissor(gl, r) {
  gl.scissor(r.minX, r.minY, Math.max(0, r.maxX - r.minX), Math.max(0, r.maxY - r.minY));
}
const LIGHT_VERTS = 6;
class EffectsPass {
  /**
   * @param {WebGL2RenderingContext} gl
   * @param {number} width - Coordinate-space width in world units
   * @param {number} height - Coordinate-space height in world units
   * @param {number} [pixelWidth=width] - Scene target width in pixels
   * @param {number} [pixelHeight=height] - Scene target height in pixels
   * @param {Object} [options]
   * @param {boolean} [options.smooth=true] - Filter the scene is upscaled
   *   with. False is the `worldFilter: 'nearest'` setting.
   */
  constructor(gl, width, height, pixelWidth = width, pixelHeight = height, options = {}) {
    __privateAdd(this, _EffectsPass_instances);
    this.gl = gl;
    this.width = width;
    this.height = height;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
    this.scene = createRenderTarget(gl, pixelWidth, pixelHeight, {
      stencil: true,
      smooth: options.smooth ?? true
    });
    this.light = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.bloomA = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.bloomB = createRenderTarget(gl, pixelWidth, pixelHeight);
    this.lightProgram = createProgram(gl, VERTEX_SHADER, LIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.brightProgram = createProgram(gl, VERTEX_SHADER, BRIGHT_FRAGMENT_SHADER, ATTRIBUTES);
    this.blurProgram = createProgram(gl, VERTEX_SHADER, BLUR_FRAGMENT_SHADER, ATTRIBUTES);
    this.compositeProgram = createProgram(gl, VERTEX_SHADER, COMPOSITE_FRAGMENT_SHADER, ATTRIBUTES);
    this.presentProgram = createProgram(gl, VERTEX_SHADER, PRESENT_FRAGMENT_SHADER, ATTRIBUTES);
    this.quadVao = gl.createVertexArray();
    this.quadBuffer = gl.createBuffer();
    this.quad = new Float32Array(4 * VERTEX_FLOATS);
    __privateMethod(this, _EffectsPass_instances, setupVao_fn).call(this, this.quadVao, this.quadBuffer, this.quad.byteLength);
    this.lightVao = gl.createVertexArray();
    this.lightBuffer = gl.createBuffer();
    this.lightData = new Float32Array(0);
    __privateMethod(this, _EffectsPass_instances, setupVao_fn).call(this, this.lightVao, this.lightBuffer, 0);
  }
  destroy() {
    const gl = this.gl;
    deleteRenderTarget(gl, this.scene);
    deleteRenderTarget(gl, this.light);
    deleteRenderTarget(gl, this.bloomA);
    deleteRenderTarget(gl, this.bloomB);
    gl.deleteVertexArray(this.quadVao);
    gl.deleteVertexArray(this.lightVao);
    gl.deleteBuffer(this.quadBuffer);
    gl.deleteBuffer(this.lightBuffer);
    gl.deleteProgram(this.lightProgram.program);
    gl.deleteProgram(this.brightProgram.program);
    gl.deleteProgram(this.blurProgram.program);
    gl.deleteProgram(this.compositeProgram.program);
    gl.deleteProgram(this.presentProgram.program);
  }
  /**
   * Choose the filter the world is upscaled with on presentation.
   * @param {boolean} smooth - Linear (true) or nearest (false, for pixel art)
   */
  setSceneFiltering(smooth) {
    setRenderTargetFiltering(this.gl, this.scene, smooth);
  }
  /**
   * @param {number} width - Coordinate-space width in world units
   * @param {number} height - Coordinate-space height in world units
   * @param {number} [pixelWidth=width] - Target width in pixels
   * @param {number} [pixelHeight=height] - Target height in pixels
   */
  resize(width, height, pixelWidth = width, pixelHeight = height) {
    const gl = this.gl;
    resizeRenderTarget(gl, this.scene, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.light, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.bloomA, pixelWidth, pixelHeight);
    resizeRenderTarget(gl, this.bloomB, pixelWidth, pixelHeight);
    this.width = width;
    this.height = height;
    this.pixelWidth = pixelWidth;
    this.pixelHeight = pixelHeight;
  }
  /** Bind the scene target, cleared to opaque black like the world pass. */
  beginScene() {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(0, 0, 0, 1);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }
  /** Re-bind the scene target mid-frame (after an offscreen detour). */
  bindScene(clipDepth) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.scene.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    if (clipDepth > 0) gl.enable(gl.STENCIL_TEST);
  }
  /**
   * Accumulate the frame's lights into the light map.
   * @param {Array<{x, y, radius, color: number[], intensity: number}>} lights
   * @param {number[]} ambient - Straight [r, g, b] the map clears to
   * @returns {number} GPU draw calls issued
   */
  drawLights(lights, ambient) {
    const gl = this.gl;
    gl.bindFramebuffer(gl.FRAMEBUFFER, this.light.framebuffer);
    gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    gl.disable(gl.SCISSOR_TEST);
    gl.disable(gl.STENCIL_TEST);
    gl.clearColor(ambient[0], ambient[1], ambient[2], 1);
    gl.clear(gl.COLOR_BUFFER_BIT);
    if (lights.length === 0) return 0;
    const needed = lights.length * LIGHT_VERTS * VERTEX_FLOATS;
    if (this.lightData.length < needed) {
      this.lightData = new Float32Array(needed);
      gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
      gl.bufferData(gl.ARRAY_BUFFER, this.lightData.byteLength, gl.DYNAMIC_DRAW);
    }
    const data = this.lightData;
    const corners = [[-1, -1], [1, -1], [1, 1], [-1, -1], [1, 1], [-1, 1]];
    let o = 0;
    for (const lightSource of lights) {
      const { x, y, radius, color, intensity } = lightSource;
      for (let i = 0; i < LIGHT_VERTS; i++) {
        const [cx, cy] = corners[i];
        data[o] = x + cx * radius;
        data[o + 1] = y + cy * radius;
        data[o + 2] = cx;
        data[o + 3] = cy;
        data[o + 4] = color[0] * intensity;
        data[o + 5] = color[1] * intensity;
        data[o + 6] = color[2] * intensity;
        data[o + 7] = 1;
        o += VERTEX_FLOATS;
      }
    }
    const { program, uniforms } = this.lightProgram;
    gl.useProgram(program);
    gl.bindVertexArray(this.lightVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, 1);
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE);
    gl.bindBuffer(gl.ARRAY_BUFFER, this.lightBuffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, data, 0, needed);
    gl.drawArrays(gl.TRIANGLES, 0, lights.length * LIGHT_VERTS);
    gl.bindVertexArray(null);
    return 1;
  }
  /**
   * Present the world to the default framebuffer with no lighting and no post
   * effects — a straight scaled blit of the scene target into the content
   * rect, at whatever filter `setSceneFiltering` last chose.
   *
   * This is the path every game that only sets a resolution takes, so it does
   * the minimum: no light map to clear, no bloom texture to clear, one draw.
   *
   * @param {{x: number, y: number, width: number, height: number}} [content] -
   *   Where the world lands on the backing store, in GL (bottom-left) pixels
   * @returns {number} GPU draw calls issued
   */
  present(content) {
    const gl = this.gl;
    const { program, uniforms } = this.presentProgram;
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (content) {
      gl.viewport(content.x, content.y, content.width, content.height);
    } else {
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    }
    gl.useProgram(program);
    gl.bindVertexArray(this.quadVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, -1);
    __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, uniforms.u_scene, 0, this.scene.texture);
    __privateMethod(this, _EffectsPass_instances, drawFullQuad_fn).call(this);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    return 1;
  }
  /**
   * Composite the frame to the default framebuffer.
   * @param {Object|null} post - { bloom: {threshold, strength, blur}, vignette: {strength, start} }
   * @param {{x: number, y: number, width: number, height: number}} [content] - Where
   *   the world lands on the backing store. Defaults to the full offscreen size,
   *   which is the unscaled, unletterboxed case.
   * @returns {number} GPU draw calls issued
   */
  composite(post, content) {
    const gl = this.gl;
    const bloom = post == null ? void 0 : post.bloom;
    let calls = 0;
    gl.disable(gl.BLEND);
    gl.disable(gl.STENCIL_TEST);
    gl.disable(gl.SCISSOR_TEST);
    if (bloom && (bloom.strength ?? 0) > 0) {
      calls += __privateMethod(this, _EffectsPass_instances, bloom_fn).call(this, bloom);
    } else {
      gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
      gl.clearColor(0, 0, 0, 1);
      gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const vignette = post == null ? void 0 : post.vignette;
    const { program, uniforms } = this.compositeProgram;
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    if (content) {
      gl.viewport(content.x, content.y, content.width, content.height);
    } else {
      gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
    }
    gl.useProgram(program);
    gl.bindVertexArray(this.quadVao);
    gl.uniform2f(uniforms.u_resolution, this.width, this.height);
    gl.uniform1f(uniforms.u_flipY, -1);
    __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, uniforms.u_scene, 0, this.scene.texture);
    __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, uniforms.u_light, 1, this.light.texture);
    __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, uniforms.u_bloom, 2, this.bloomA.texture);
    gl.uniform1f(uniforms.u_bloomStrength, bloom ? bloom.strength ?? 0 : 0);
    gl.uniform1f(uniforms.u_vignette, vignette ? vignette.strength ?? 0 : 0);
    gl.uniform1f(uniforms.u_vignetteStart, vignette ? vignette.start ?? 0.55 : 0.55);
    __privateMethod(this, _EffectsPass_instances, drawFullQuad_fn).call(this);
    gl.bindVertexArray(null);
    gl.enable(gl.BLEND);
    return calls + 1;
  }
}
_EffectsPass_instances = new WeakSet();
setupVao_fn = function(vao, buffer, bytes) {
  const gl = this.gl;
  gl.bindVertexArray(vao);
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  if (bytes > 0) gl.bufferData(gl.ARRAY_BUFFER, bytes, gl.DYNAMIC_DRAW);
  const stride = VERTEX_FLOATS * 4;
  gl.enableVertexAttribArray(ATTRIBUTES.a_position);
  gl.vertexAttribPointer(ATTRIBUTES.a_position, 2, gl.FLOAT, false, stride, 0);
  gl.enableVertexAttribArray(ATTRIBUTES.a_uv);
  gl.vertexAttribPointer(ATTRIBUTES.a_uv, 2, gl.FLOAT, false, stride, 8);
  gl.enableVertexAttribArray(ATTRIBUTES.a_color);
  gl.vertexAttribPointer(ATTRIBUTES.a_color, 4, gl.FLOAT, false, stride, 16);
  gl.bindVertexArray(null);
};
bloom_fn = function(bloom) {
  const gl = this.gl;
  const threshold = bloom.threshold ?? 0.65;
  const sigma = Math.max(1, (bloom.blur ?? 24) / 2);
  const radius = Math.min(128, Math.ceil(sigma * 3));
  const bright = this.brightProgram;
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
  gl.viewport(0, 0, this.pixelWidth, this.pixelHeight);
  gl.useProgram(bright.program);
  gl.bindVertexArray(this.quadVao);
  gl.uniform2f(bright.uniforms.u_resolution, this.width, this.height);
  gl.uniform1f(bright.uniforms.u_flipY, 1);
  __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, bright.uniforms.u_scene, 0, this.scene.texture);
  __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, bright.uniforms.u_light, 1, this.light.texture);
  gl.uniform1f(bright.uniforms.u_threshold, threshold);
  __privateMethod(this, _EffectsPass_instances, drawFullQuad_fn).call(this);
  const blur = this.blurProgram;
  gl.useProgram(blur.program);
  gl.uniform2f(blur.uniforms.u_resolution, this.width, this.height);
  gl.uniform1f(blur.uniforms.u_flipY, 1);
  const texelScale = this.pixelWidth / this.width;
  gl.uniform1f(blur.uniforms.u_sigma, sigma * texelScale);
  gl.uniform1i(blur.uniforms.u_radius, Math.min(128, Math.ceil(radius * texelScale)));
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomB.framebuffer);
  __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, blur.uniforms.u_texture, 0, this.bloomA.texture);
  gl.uniform2f(blur.uniforms.u_direction, 1 / this.pixelWidth, 0);
  __privateMethod(this, _EffectsPass_instances, drawFullQuad_fn).call(this);
  gl.bindFramebuffer(gl.FRAMEBUFFER, this.bloomA.framebuffer);
  __privateMethod(this, _EffectsPass_instances, bindUnit_fn).call(this, blur.uniforms.u_texture, 0, this.bloomB.texture);
  gl.uniform2f(blur.uniforms.u_direction, 0, 1 / this.pixelHeight);
  __privateMethod(this, _EffectsPass_instances, drawFullQuad_fn).call(this);
  gl.bindVertexArray(null);
  return 3;
};
bindUnit_fn = function(location2, unit, texture) {
  const gl = this.gl;
  gl.activeTexture(gl.TEXTURE0 + unit);
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.uniform1i(location2, unit);
};
drawFullQuad_fn = function() {
  const gl = this.gl;
  const q = this.quad;
  const w = this.width;
  const h = this.height;
  const corners = [0, 0, w, 0, w, h, 0, h];
  for (let i = 0; i < 4; i++) {
    const o = i * VERTEX_FLOATS;
    q[o] = corners[2 * i];
    q[o + 1] = corners[2 * i + 1];
    q[o + 2] = corners[2 * i] / w;
    q[o + 3] = corners[2 * i + 1] / h;
    q[o + 4] = 1;
    q[o + 5] = 1;
    q[o + 6] = 1;
    q[o + 7] = 1;
  }
  gl.bindBuffer(gl.ARRAY_BUFFER, this.quadBuffer);
  gl.bufferSubData(gl.ARRAY_BUFFER, 0, q);
  gl.drawArrays(gl.TRIANGLE_FAN, 0, 4);
};
class WebGLRenderer extends BaseRenderer {
  /**
   * @param {Object} [options]
   * @param {WebGLContextAttributes} [options.contextAttributes] - Merged over
   *   the defaults. Tests pass `preserveDrawingBuffer: true` so pixels can be
   *   read back after the frame is presented.
   * @param {boolean} [options.imageSmoothing=true] - Linear (true) or nearest
   *   (false) texture filtering; matches Canvas 2D's default when true.
   */
  constructor(options = {}) {
    super();
    __privateAdd(this, _WebGLRenderer_instances);
    /** Scratch buffers for drawParticles, reused across particles and frames. */
    __privateAdd(this, _particleQuad, new Array(8));
    __privateAdd(this, _particleColor, new Array(4));
    this.capabilities.tint = true;
    this.capabilities.blendModes = true;
    this.capabilities.particles = true;
    this.capabilities.lights = true;
    this.capabilities.postEffects = true;
    this.ambientLight = null;
    this.lights = [];
    this.postEffects = null;
    this.targetIsScene = false;
    this.inScreenPass = false;
    this.canvas = null;
    this.gl = null;
    this.imageSmoothing = options.imageSmoothing ?? true;
    this.contextAttributes = {
      alpha: true,
      premultipliedAlpha: true,
      stencil: true,
      antialias: true,
      preserveDrawingBuffer: false,
      ...options.contextAttributes || {}
    };
    this.batch = null;
    this.textures = null;
    this.labels = null;
    this.shadowPass = null;
    this.effectsPass = null;
    this.worldMatrix = identity();
    this.screenMatrix = identity();
    this.cameraMatrix = identity();
    this.stateStack = [];
    this.clipDepth = 0;
    this.gradientCache = /* @__PURE__ */ new Map();
    this.frameIndex = 0;
  }
  // === Lifecycle ===
  init(element, options = {}) {
    this.canvas = element;
    this.gl = createContext(element, this.contextAttributes);
    if (options.worldFilter) super.setWorldFilter(options.worldFilter);
    const viewport = options.viewport || identityViewport(
      options.width || this.viewport.viewWidth,
      options.height || this.viewport.viewHeight
    );
    this.onContextLost = (event) => {
      event.preventDefault();
      this.contextLost = true;
    };
    this.onContextRestored = () => {
      this.contextLost = false;
      __privateMethod(this, _WebGLRenderer_instances, createResources_fn).call(this);
      this.resize();
    };
    element.addEventListener("webglcontextlost", this.onContextLost, false);
    element.addEventListener("webglcontextrestored", this.onContextRestored, false);
    this.contextLost = false;
    this.viewport = viewport;
    __privateMethod(this, _WebGLRenderer_instances, createResources_fn).call(this);
    this.setViewport(viewport);
  }
  destroy() {
    var _a, _b;
    if (this.canvas) {
      this.canvas.removeEventListener("webglcontextlost", this.onContextLost, false);
      this.canvas.removeEventListener("webglcontextrestored", this.onContextRestored, false);
    }
    __privateMethod(this, _WebGLRenderer_instances, releaseResources_fn).call(this);
    (_b = (_a = this.gl) == null ? void 0 : _a.getExtension("WEBGL_lose_context")) == null ? void 0 : _b.loseContext();
    this.canvas = null;
    this.gl = null;
    this.stateStack = [];
    this.clipDepth = 0;
  }
  setViewport(viewport) {
    this.viewport = viewport;
    this.gl;
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    const { backingWidth, backingHeight, viewWidth, viewHeight, worldWidth, worldHeight } = viewport;
    this.canvas.width = backingWidth;
    this.canvas.height = backingHeight;
    this.shadowPass.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    this.effectsPass.resize(viewWidth, viewHeight, worldWidth, worldHeight);
    __privateMethod(this, _WebGLRenderer_instances, bindDefaultTarget_fn).call(this);
  }
  setWorldFilter(filter) {
    super.setWorldFilter(filter);
    if (__privateGet(this, _WebGLRenderer_instances, ready_get) && this.effectsPass) {
      this.effectsPass.setSceneFiltering(this.worldFilter !== "nearest");
    }
  }
  clear(color) {
    const gl = this.gl;
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.batch.flush();
    const [r, g, b, a] = color ? parseColorPremultiplied(color) : [0, 0, 0, 0];
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.disable(gl.SCISSOR_TEST);
    gl.clearColor(r, g, b, a);
    gl.clear(gl.COLOR_BUFFER_BIT | gl.STENCIL_BUFFER_BIT);
  }
  // === Frame control ===
  beginFrame() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.frameIndex++;
    this.clear("#000");
    this.cameraMatrix = identity();
    this.worldMatrix = identity();
    this.lights.length = 0;
    __privateMethod(this, _WebGLRenderer_instances, resetStencil_fn).call(this);
    this.inScreenPass = false;
    this.targetIsScene = __privateGet(this, _WebGLRenderer_instances, effectsActive_get) || __privateGet(this, _WebGLRenderer_instances, worldIsResampled_get);
    if (!this.targetIsScene) __privateMethod(this, _WebGLRenderer_instances, bindDefaultTarget_fn).call(this);
    if (this.targetIsScene) {
      this.effectsPass.beginScene();
      this.batch.setTarget(this.width, this.height, false);
      this.batch.invalidateState();
    }
    super.beginFrame();
  }
  endFrame() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.batch.flush();
    if (this.targetIsScene) {
      const content = __privateMethod(this, _WebGLRenderer_instances, contentRect_fn).call(this);
      if (__privateGet(this, _WebGLRenderer_instances, effectsActive_get)) {
        const ambient = this.ambientLight ? parseColor(this.ambientLight) : [1, 1, 1, 1];
        this.stats.drawCalls += this.effectsPass.drawLights(this.lights, ambient);
        this.stats.drawCalls += this.effectsPass.composite(this.postEffects, content);
      } else {
        this.stats.drawCalls += this.effectsPass.present(content);
      }
      this.targetIsScene = false;
      __privateMethod(this, _WebGLRenderer_instances, bindDefaultTarget_fn).call(this);
    }
    __privateMethod(this, _WebGLRenderer_instances, evictGradients_fn).call(this);
    this.labels.evict(this.frameIndex);
  }
  beginScreenFrame() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.targetIsScene = false;
    this.inScreenPass = true;
    __privateMethod(this, _WebGLRenderer_instances, bindDefaultTarget_fn).call(this);
    this.screenMatrix = identity();
  }
  endScreenFrame() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.batch.flush();
    this.inScreenPass = false;
  }
  applyCamera(camera) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.cameraMatrix = translation(-camera.x + camera.width / 2, -camera.y + camera.height / 2);
    this.worldMatrix = multiply(this.cameraMatrix, identity());
  }
  drawSprite(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get) || !options.image) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;
    this.trackPrimitive("sprite");
    const {
      x,
      y,
      tileX = 0,
      tileY = 0,
      tileWidth,
      tileHeight,
      width = tileWidth,
      height = tileHeight,
      rotation: rotation$1 = 0,
      flipX = false,
      flipY = false
    } = options;
    let local = translation(x, y);
    if (rotation$1) local = multiply(local, rotation(rotation$1));
    if (flipX || flipY) local = multiply(local, scaling(flipX ? -1 : 1, flipY ? -1 : 1));
    const hw = width / 2, hh = height / 2;
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, submitTexturedQuad_fn).call(this, opts, entry, [-hw, -hh, hw, -hh, hw, hh, -hw, hh], local, { x: tileX * tileWidth, y: tileY * tileHeight, width: tileWidth, height: tileHeight }));
  }
  drawImage(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get) || !options.image) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;
    this.trackPrimitive("sprite");
    const width = options.width ?? entry.width;
    const height = options.height ?? entry.height;
    const source = options.sourceWidth !== void 0 && options.sourceHeight !== void 0 ? { x: options.sourceX ?? 0, y: options.sourceY ?? 0, width: options.sourceWidth, height: options.sourceHeight } : { x: 0, y: 0, width: entry.width, height: entry.height };
    const { x, y } = options;
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, submitTexturedQuad_fn).call(this, opts, entry, [x, y, x + width, y, x + width, y + height, x, y + height], null, source));
  }
  /**
   * Batched particle path. Each particle becomes one textured quad pushed
   * straight into the running batch with its own premultiplied colour, so a
   * whole field shares one texture bind and flushes only when the vertex
   * buffer fills. The quad is rotated and transformed inline rather than via
   * the matrix helpers, which would allocate per particle.
   */
  drawParticles(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get) || !options.image || !options.data) return;
    const entry = this.textures.get(options.image);
    if (!entry) return;
    const { data, tileX = 0, tileY = 0, tileWidth, tileHeight } = options;
    const available = Math.floor(data.length / PARTICLE_STRIDE);
    const count = Math.min(options.count ?? available, available);
    if (count <= 0) return;
    const { width: tw, height: th } = entry;
    const sx = tileX * tileWidth, sy = tileY * tileHeight;
    const u0 = sx / tw, v0 = sy / th;
    const u1 = (sx + tileWidth) / tw, v1 = (sy + tileHeight) / th;
    const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
    const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
    const hy = Math.min(0.5 / th, (v1 - v0) / 2);
    const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];
    const [ma, mb, mc, md, me, mf] = __privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, options);
    const aspect = tileWidth / tileHeight;
    const alphaScale = options.globalAlpha ?? 1;
    const positions = __privateGet(this, _particleQuad);
    const color = __privateGet(this, _particleColor);
    let drawn = 0;
    this.batch.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });
    for (let i = 0; i < count; i++) {
      const o = i * PARTICLE_STRIDE;
      const alpha = data[o + 7] * alphaScale;
      if (alpha <= 0) continue;
      const px = data[o], py = data[o + 1];
      const hh = data[o + 2] / 2, hw = hh * aspect;
      const rot = data[o + 3];
      const c = rot ? Math.cos(rot) : 1;
      const sn = rot ? Math.sin(rot) : 0;
      const exx = c * hw, exy = sn * hw;
      const eyx = -sn * hh, eyy = c * hh;
      let x, y;
      x = px - exx - eyx;
      y = py - exy - eyy;
      positions[0] = ma * x + mc * y + me;
      positions[1] = mb * x + md * y + mf;
      x = px + exx - eyx;
      y = py + exy - eyy;
      positions[2] = ma * x + mc * y + me;
      positions[3] = mb * x + md * y + mf;
      x = px + exx + eyx;
      y = py + exy + eyy;
      positions[4] = ma * x + mc * y + me;
      positions[5] = mb * x + md * y + mf;
      x = px - exx + eyx;
      y = py - exy + eyy;
      positions[6] = ma * x + mc * y + me;
      positions[7] = mb * x + md * y + mf;
      color[0] = data[o + 4] * alpha;
      color[1] = data[o + 5] * alpha;
      color[2] = data[o + 6] * alpha;
      color[3] = alpha;
      this.batch.push(positions, uvs, color, QUAD_INDICES, uvBounds);
      drawn++;
    }
    this.stats.primitives += drawn;
    this.stats.spritesDrawn += drawn;
  }
  setAmbientLight(color) {
    this.ambientLight = color ?? null;
  }
  setPostEffects(effects) {
    this.postEffects = effects ?? null;
  }
  drawLight(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get) || !__privateGet(this, _WebGLRenderer_instances, effectsActive_get)) return;
    const { x, y, radius, color = "#ffffff", intensity = 1 } = options;
    const m = __privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, options);
    const [sx, sy] = apply(m, x, y);
    this.lights.push({
      x: sx,
      y: sy,
      radius: radius * maxScale(m),
      color: parseColor(color),
      intensity
    });
  }
  drawRect(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.trackPrimitive("shape");
    const { x, y, width, height, cornerRadius } = options;
    const outline = roundRectPoints(x, y, width, height, cornerRadius || 0);
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, fillAndStroke_fn).call(this, opts, outline, true, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }
  drawLine(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.trackPrimitive("shape");
    const { positions, indices } = strokePolyline(
      [options.x1, options.y1, options.x2, options.y2],
      false,
      options.lineWidth || 1
    );
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, submitShape_fn).call(this, opts, positions, indices, options.strokeStyle || "#000"));
  }
  drawArc(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.trackPrimitive("shape");
    const { points, full } = arcPoints(
      options.x,
      options.y,
      options.radius,
      options.startAngle ?? 0,
      options.endAngle ?? Math.PI * 2
    );
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, fillAndStroke_fn).call(this, opts, points, full, {
      fill: options.fill !== false ? options.fillStyle : null,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth
    }));
  }
  drawPath(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    if (!options.points || options.points.length < 2) return;
    this.trackPrimitive("shape");
    const flat = [];
    for (const p of options.points) flat.push(p.x, p.y);
    const fillIndices = triangulate(flat);
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, fillAndStroke_fn).call(this, opts, flat, !!options.closed, {
      fill: options.fillStyle,
      stroke: options.strokeStyle,
      lineWidth: options.lineWidth,
      fillIndices
    }));
  }
  drawText(options) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    this.trackPrimitive("text");
    const space = __privateMethod(this, _WebGLRenderer_instances, passSpace_fn).call(this);
    const entry = this.labels.get(options, this.frameIndex, space.pixelWidth / space.width);
    if (!entry) return;
    const x = options.x - entry.anchorX;
    const y = options.y - entry.anchorY;
    __privateMethod(this, _WebGLRenderer_instances, withShadow_fn).call(this, options, (opts) => __privateMethod(this, _WebGLRenderer_instances, submitTexturedQuad_fn).call(this, opts, entry, [x, y, x + entry.width, y, x + entry.width, y + entry.height, x, y + entry.height], null, { x: 0, y: 0, width: entry.width, height: entry.height }));
  }
  // === Transform & clip stacks ===
  pushTransform(transform = {}) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    const current = __privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, transform);
    this.stateStack.push({ kind: "transform", screen: !!transform.isScreenSpace, matrix: current });
    __privateMethod(this, _WebGLRenderer_instances, setMatrixFor_fn).call(this, transform, multiply(current, fromTransform(transform)));
  }
  popTransform() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    const entry = __privateMethod(this, _WebGLRenderer_instances, popState_fn2).call(this, "transform");
    if (!entry) return;
    if (entry.kind === "transform") {
      __privateMethod(this, _WebGLRenderer_instances, setMatrixFor_fn).call(this, { isScreenSpace: entry.screen }, entry.matrix);
    } else {
      __privateMethod(this, _WebGLRenderer_instances, unclip_fn).call(this, entry);
    }
  }
  pushClip(rect) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    const outline = roundRectPoints(rect.x, rect.y, rect.width, rect.height, rect.cornerRadius || 0);
    const positions = applyToPositions(__privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, rect), outline);
    const indices = fanIndices(outline.length / 2);
    const entry = { kind: "clip", screen: !!rect.isScreenSpace, positions, indices };
    this.stateStack.push(entry);
    __privateMethod(this, _WebGLRenderer_instances, clip_fn).call(this, entry);
  }
  popClip() {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return;
    const entry = __privateMethod(this, _WebGLRenderer_instances, popState_fn2).call(this, "clip");
    if (!entry) return;
    if (entry.kind === "clip") {
      __privateMethod(this, _WebGLRenderer_instances, unclip_fn).call(this, entry);
    } else {
      __privateMethod(this, _WebGLRenderer_instances, setMatrixFor_fn).call(this, { isScreenSpace: entry.screen }, entry.matrix);
    }
  }
  // === Queries ===
  measureText(text, style = {}) {
    if (!__privateGet(this, _WebGLRenderer_instances, ready_get)) return { width: 0, height: 0 };
    return this.labels.measure(text, style);
  }
  setCursor(style) {
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}
_WebGLRenderer_instances = new WeakSet();
createResources_fn = function() {
  const gl = this.gl;
  const { viewWidth, viewHeight, worldWidth, worldHeight } = this.viewport;
  this.batch = new Batch(gl, this.stats);
  this.textures = new TextureCache(gl, this.imageSmoothing);
  this.labels = new TextLabels(gl);
  this.shadowPass = new ShadowPass(gl, viewWidth, viewHeight, worldWidth, worldHeight);
  this.effectsPass = new EffectsPass(gl, viewWidth, viewHeight, worldWidth, worldHeight, {
    smooth: this.worldFilter !== "nearest"
  });
  this.gradientCache.clear();
  gl.disable(gl.DEPTH_TEST);
  gl.disable(gl.CULL_FACE);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.disable(gl.STENCIL_TEST);
};
releaseResources_fn = function() {
  var _a, _b, _c, _d, _e;
  const gl = this.gl;
  if (!gl) return;
  (_a = this.batch) == null ? void 0 : _a.destroy();
  (_b = this.textures) == null ? void 0 : _b.destroy();
  (_c = this.labels) == null ? void 0 : _c.destroy();
  (_d = this.shadowPass) == null ? void 0 : _d.destroy();
  (_e = this.effectsPass) == null ? void 0 : _e.destroy();
  for (const entry of this.gradientCache.values()) gl.deleteTexture(entry.texture);
  this.gradientCache.clear();
  this.batch = null;
  this.textures = null;
  this.labels = null;
  this.shadowPass = null;
  this.effectsPass = null;
};
ready_get = function() {
  return !!this.gl && !this.contextLost;
};
worldIsResampled_get = function() {
  const v = this.viewport;
  return Math.abs(v.worldWidth - v.contentWidth) > 1 || Math.abs(v.worldHeight - v.contentHeight) > 1;
};
/** The content rect in GL pixels, which measure y from the bottom. */
contentRect_fn = function() {
  const v = this.viewport;
  return {
    x: v.contentX,
    y: v.backingHeight - v.contentY - v.contentHeight,
    width: v.contentWidth,
    height: v.contentHeight
  };
};
// === Paint helpers ===
/** Current matrix for a draw call's pass. */
matrixFor_fn = function(options) {
  return options.isScreenSpace ? this.screenMatrix : this.worldMatrix;
};
setMatrixFor_fn = function(options, m) {
  if (options.isScreenSpace) this.screenMatrix = m;
  else this.worldMatrix = m;
};
/**
 * Resolve a fill/stroke style into a batch key plus per-vertex colour and
 * uvs for the given local-space positions.
 */
/**
 * Premultiplied vertex colour for a textured draw.
 * @param {string} [tint] - Colour multiplied into every texel
 * @param {number} alpha - globalAlpha
 * @returns {number[]} Premultiplied [r, g, b, a]
 */
tintColor_fn = function(tint, alpha) {
  if (!tint) return [alpha, alpha, alpha, alpha];
  const [r, g, b, a] = parseColor(tint);
  const s = a * alpha;
  return [r * s, g * s, b * s, s];
};
paint_fn2 = function(style, alpha, localPositions, blend) {
  if (style && typeof style === "object" && style.type) {
    const texture = __privateMethod(this, _WebGLRenderer_instances, gradientTexture_fn).call(this, style);
    const key = style.type === "radial" ? { mode: MODE_GRADIENT, texture, gradientType: 1, gradient: [style.x, style.y, style.r0 ?? 0, style.r1], blend } : { mode: MODE_GRADIENT, texture, gradientType: 0, gradient: [style.x0, style.y0, style.x1, style.y1], blend };
    return { key, color: [alpha, alpha, alpha, alpha], uvs: localPositions };
  }
  const [r, g, b, a] = parseColorPremultiplied(style);
  return { key: { mode: MODE_SOLID, blend }, color: [r * alpha, g * alpha, b * alpha, a * alpha], uvs: null };
};
gradientTexture_fn = function(style) {
  const gl = this.gl;
  const key = gradientKey(style);
  let entry = this.gradientCache.get(key);
  if (!entry) {
    const texture = createTexture(gl, {
      pixels: bakeGradient(style.stops),
      width: GRADIENT_LUT_SIZE,
      height: 1,
      smooth: true
    });
    entry = { texture, lastUsed: this.frameIndex };
    this.gradientCache.set(key, entry);
    this.batch.invalidateState();
  }
  entry.lastUsed = this.frameIndex;
  return entry.texture;
};
evictGradients_fn = function() {
  if (this.gradientCache.size < 64) return;
  for (const [key, entry] of this.gradientCache) {
    if (this.frameIndex - entry.lastUsed > 120) {
      this.gl.deleteTexture(entry.texture);
      this.gradientCache.delete(key);
    }
  }
};
/**
 * Submit a filled/stroked local-space polygon set to the batch.
 * @param {Object} options - Draw options (alpha, shadow, pass)
 * @param {number[]} localPositions - Local-space positions
 * @param {number[]} indices
 * @param {string|Object} style
 */
submitShape_fn = function(options, localPositions, indices, style) {
  if (indices.length === 0) return;
  const alpha = options.globalAlpha ?? 1;
  const { key, color, uvs } = __privateMethod(this, _WebGLRenderer_instances, paint_fn2).call(this, style, alpha, localPositions, options.blend);
  const positions = applyToPositions(__privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, options), localPositions);
  this.batch.begin(key);
  this.batch.push(positions, uvs, color, indices);
};
fillAndStroke_fn = function(options, outline, closed, { fill, stroke, lineWidth, fillIndices }) {
  if (fill) {
    const indices = fillIndices || fanIndices(outline.length / 2);
    __privateMethod(this, _WebGLRenderer_instances, submitShape_fn).call(this, options, outline, indices, fill);
  }
  if (stroke) {
    const { positions, indices } = strokePolyline(outline, closed, lineWidth || 1);
    __privateMethod(this, _WebGLRenderer_instances, submitShape_fn).call(this, options, positions, indices, stroke);
  }
};
/**
 * Run a primitive's submissions, casting its silhouette shadow first when
 * options.shadow is set. The silhouette is whatever `draw` submits (fill
 * and stroke, or the textured quad), so every primitive shares this path.
 */
withShadow_fn = function(options, draw) {
  const shadow = options.shadow;
  if (!shadow) {
    draw(options);
    return;
  }
  this.gl;
  const batch = this.batch;
  const pass = this.shadowPass;
  const space = __privateMethod(this, _WebGLRenderer_instances, passSpace_fn).call(this);
  pass.resize(space.width, space.height, space.pixelWidth, space.pixelHeight);
  batch.flush();
  pass.beginSilhouette();
  batch.setTarget(space.width, space.height, false);
  batch.invalidateState();
  batch.trackBounds(true);
  const opaque = { ...options, globalAlpha: 1, shadow: null };
  draw(opaque);
  batch.flush();
  const bounds = batch.bounds;
  batch.trackBounds(false);
  if (bounds && bounds.minX <= bounds.maxX) {
    const radius = ShadowPass.radius(shadow);
    const region = expand(bounds, radius + 1, radius + 1, space.width, space.height);
    this.stats.drawCalls += pass.blur(region, shadow);
    __privateMethod(this, _WebGLRenderer_instances, bindCurrentTarget_fn).call(this);
    const ox = shadow.offsetX || 0;
    const oy = shadow.offsetY || 0;
    const positions = [
      region.minX + ox,
      region.minY + oy,
      region.maxX + ox,
      region.minY + oy,
      region.maxX + ox,
      region.maxY + oy,
      region.minX + ox,
      region.maxY + oy
    ];
    const uvs = [
      region.minX / space.width,
      region.minY / space.height,
      region.maxX / space.width,
      region.minY / space.height,
      region.maxX / space.width,
      region.maxY / space.height,
      region.minX / space.width,
      region.maxY / space.height
    ];
    const alpha = options.globalAlpha ?? 1;
    batch.begin({ mode: MODE_SHADOW, texture: pass.texture, shadowColor: parseColorPremultiplied(shadow.color || "rgba(0,0,0,0.5)"), blend: options.blend });
    batch.push(positions, uvs, [alpha, alpha, alpha, alpha], QUAD_INDICES);
    batch.flush();
  } else {
    __privateMethod(this, _WebGLRenderer_instances, bindCurrentTarget_fn).call(this);
  }
  draw(options);
};
/**
 * Coordinate space and pixel resolution of the pass currently drawing.
 * @returns {{width: number, height: number, pixelWidth: number, pixelHeight: number}}
 */
passSpace_fn = function() {
  const v = this.viewport;
  return this.inScreenPass ? { width: v.uiWidth, height: v.uiHeight, pixelWidth: v.backingWidth, pixelHeight: v.backingHeight } : { width: v.viewWidth, height: v.viewHeight, pixelWidth: v.worldWidth, pixelHeight: v.worldHeight };
};
/**
 * Re-bind whichever framebuffer the current pass draws into. The world pass
 * owns the effects scene target when lighting or post effects are on;
 * everything else owns the default framebuffer.
 */
bindCurrentTarget_fn = function() {
  if (this.targetIsScene) {
    this.effectsPass.bindScene(this.clipDepth);
    this.batch.setTarget(this.width, this.height, false);
    this.batch.invalidateState();
    return;
  }
  __privateMethod(this, _WebGLRenderer_instances, bindDefaultTarget_fn).call(this);
};
/**
 * Bind the default framebuffer for whichever pass is active.
 *
 * The two passes address it differently, and that difference is what keeps
 * the UI sharp: the world covers only its content rect and is measured in
 * world units, while the UI covers the whole backing store at full display
 * resolution and is measured in UI units.
 */
bindDefaultTarget_fn = function() {
  const gl = this.gl;
  const v = this.viewport;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.disable(gl.SCISSOR_TEST);
  if (this.clipDepth > 0) gl.enable(gl.STENCIL_TEST);
  if (this.inScreenPass) {
    gl.viewport(0, 0, v.backingWidth, v.backingHeight);
    this.batch.setTarget(v.uiWidth, v.uiHeight, true);
  } else {
    const glY = v.backingHeight - v.contentY - v.contentHeight;
    gl.viewport(v.contentX, glY, v.contentWidth, v.contentHeight);
    this.batch.setTarget(v.viewWidth, v.viewHeight, true);
  }
  this.batch.invalidateState();
};
// === Draw primitives ===
/**
 * Submit a textured quad. `local` is the quad's local-space corner list
 * (top-left, top-right, bottom-right, bottom-left) and `localMatrix` places
 * it before the pass matrix is applied.
 */
submitTexturedQuad_fn = function(options, entry, local, localMatrix, source) {
  const { width: tw, height: th } = entry;
  const u0 = source.x / tw, v0 = source.y / th;
  const u1 = (source.x + source.width) / tw, v1 = (source.y + source.height) / th;
  const uvs = [u0, v0, u1, v0, u1, v1, u0, v1];
  const hx = Math.min(0.5 / tw, (u1 - u0) / 2);
  const hy = Math.min(0.5 / th, (v1 - v0) / 2);
  const uvBounds = [u0 + hx, v0 + hy, u1 - hx, v1 - hy];
  const alpha = options.globalAlpha ?? 1;
  const m = localMatrix ? multiply(__privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, options), localMatrix) : __privateMethod(this, _WebGLRenderer_instances, matrixFor_fn).call(this, options);
  const positions = applyToPositions(m, local);
  const color = __privateMethod(this, _WebGLRenderer_instances, tintColor_fn).call(this, options.tint, alpha);
  this.batch.begin({ mode: MODE_TEXTURE, texture: entry.texture, blend: options.blend });
  this.batch.push(positions, uvs, color, QUAD_INDICES, uvBounds);
};
_particleQuad = new WeakMap();
_particleColor = new WeakMap();
effectsActive_get = function() {
  return Boolean(this.ambientLight || this.postEffects);
};
popState_fn2 = function(kind) {
  const entry = this.stateStack.pop();
  if (!entry) return null;
  if (entry.kind !== kind) {
    console.warn(`WebGLRenderer: pop${kind === "clip" ? "Clip" : "Transform"}() called but the top of the state stack is a ${entry.kind}; transform/clip pushes must nest`);
  }
  return entry;
};
/**
 * Stencil-based clipping with reference counting: the stencil value of a
 * pixel is the number of active clips containing it, so nested clips
 * intersect. Draws pass only where stencil == clipDepth.
 */
clip_fn = function(entry) {
  const gl = this.gl;
  this.batch.flush();
  gl.enable(gl.STENCIL_TEST);
  gl.stencilFunc(gl.EQUAL, this.clipDepth, 255);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.INCR);
  __privateMethod(this, _WebGLRenderer_instances, drawStencilGeometry_fn).call(this, entry);
  this.clipDepth++;
  gl.stencilFunc(gl.EQUAL, this.clipDepth, 255);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  this.stats.stateChanges += 2;
};
unclip_fn = function(entry) {
  const gl = this.gl;
  this.batch.flush();
  gl.stencilFunc(gl.EQUAL, this.clipDepth, 255);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.DECR);
  __privateMethod(this, _WebGLRenderer_instances, drawStencilGeometry_fn).call(this, entry);
  this.clipDepth = Math.max(0, this.clipDepth - 1);
  gl.stencilFunc(gl.EQUAL, this.clipDepth, 255);
  gl.stencilOp(gl.KEEP, gl.KEEP, gl.KEEP);
  if (this.clipDepth === 0) gl.disable(gl.STENCIL_TEST);
  this.stats.stateChanges += 2;
};
drawStencilGeometry_fn = function(entry) {
  const gl = this.gl;
  gl.colorMask(false, false, false, false);
  this.batch.begin({ mode: MODE_SOLID });
  this.batch.push(entry.positions, null, [0, 0, 0, 0], entry.indices);
  this.batch.flush();
  this.stats.drawCalls--;
  gl.colorMask(true, true, true, true);
};
resetStencil_fn = function() {
  const gl = this.gl;
  this.clipDepth = 0;
  this.stateStack = [];
  gl.disable(gl.STENCIL_TEST);
  gl.stencilMask(255);
};
const QUAD_INDICES = [0, 1, 2, 0, 2, 3];
class UIRenderer {
  /**
   * @param {import('./baseRenderer.js').BaseRenderer} renderer - Backend renderer
   */
  constructor(renderer) {
    this.renderer = renderer;
  }
  /**
   * Width of the UI coordinate space, in UI units.
   *
   * This is *not* the renderer's world size and *not* a pixel count. UI space
   * always covers the whole display, so this grows and shrinks with the
   * display's aspect ratio while the height stays put — which is what lets an
   * element anchored to the right edge sit at the real right edge. UI is
   * rasterized at the display's full pixel density regardless of the world's
   * render resolution, so it stays sharp. See `viewport.js`.
   * @type {number}
   */
  get width() {
    return this.renderer.viewport.uiWidth;
  }
  /**
   * Height of the UI coordinate space, in UI units. Fixed at the design
   * height, so UI layout is stable as the window changes.
   * @type {number}
   */
  get height() {
    return this.renderer.viewport.uiHeight;
  }
  /** Optional features of the backing renderer. @type {Record<string, boolean>} */
  get capabilities() {
    return this.renderer.capabilities;
  }
  /**
   * Whether the backing renderer supports an optional feature.
   * @param {string} feature - Capability name
   * @returns {boolean} Whether the backend implements it
   */
  supports(feature) {
    return this.renderer.supports(feature);
  }
  /**
   * Clear the presented surface (e.g. to paint a full-screen menu background).
   * @param {string} [color] - Background colour; transparent clear if omitted
   */
  clear(color) {
    this.renderer.clear(color);
  }
  beginFrame() {
    this.renderer.beginScreenFrame();
  }
  endFrame() {
    this.renderer.endScreenFrame();
  }
  drawRect(options) {
    this.renderer.drawRect({ ...options, isScreenSpace: true });
  }
  drawText(options) {
    this.renderer.drawText({ ...options, isScreenSpace: true });
  }
  drawImage(options) {
    this.renderer.drawImage({ ...options, isScreenSpace: true });
  }
  drawSprite(options) {
    this.renderer.drawSprite({ ...options, isScreenSpace: true });
  }
  drawParticles(options) {
    this.renderer.drawParticles({ ...options, isScreenSpace: true });
  }
  drawLine(options) {
    this.renderer.drawLine({ ...options, isScreenSpace: true });
  }
  drawArc(options) {
    this.renderer.drawArc({ ...options, isScreenSpace: true });
  }
  drawPath(options) {
    this.renderer.drawPath({ ...options, isScreenSpace: true });
  }
  pushTransform(transform = {}) {
    this.renderer.pushTransform({ ...transform, isScreenSpace: true });
  }
  popTransform() {
    this.renderer.popTransform();
  }
  pushClip(rect) {
    this.renderer.pushClip({ ...rect, isScreenSpace: true });
  }
  popClip() {
    this.renderer.popClip();
  }
  measureText(text, style) {
    return this.renderer.measureText(text, style);
  }
  hitTest(x, y, shape) {
    return this.renderer.hitTest(x, y, shape);
  }
  setCursor(style) {
    this.renderer.setCursor(style);
  }
}
const registry = /* @__PURE__ */ new Map([
  ["webgl", WebGLRenderer],
  ["canvas", CanvasRenderer]
]);
const DEFAULT_RENDERER = "webgl";
const FALLBACK_RENDERER = "canvas";
function createRenderer(renderer = DEFAULT_RENDERER) {
  if (typeof renderer === "string") {
    const RendererClass = registry.get(renderer);
    if (!RendererClass) {
      throw new Error(`Unknown renderer: '${renderer}'. Registered renderers: ${[...registry.keys()].join(", ")}`);
    }
    return new RendererClass();
  }
  if (typeof renderer === "function") {
    return new renderer();
  }
  return renderer;
}
const CULL_MARGIN = 200;
const MAX_ITEMS = 2e3;
const SHAPE_METHODS = ["drawRect", "drawArc", "drawLine", "drawPath", "drawImage", "drawSprite"];
class WorldOverlay {
  /** @param {import('../m2d.js').M2D} game */
  constructor(game) {
    __privateAdd(this, _WorldOverlay_instances);
    this.game = game;
    this.shapes = [];
    this.labels = [];
    this.warnedOverflow = false;
    for (const method of SHAPE_METHODS) {
      this[method] = (options) => __privateMethod(this, _WorldOverlay_instances, submit_fn).call(this, this.shapes, method, options);
    }
    game.overlays.add(this);
  }
  /**
   * Draw text anchored to a world position, at a fixed UI size.
   *
   * @param {Object} options - `drawText` options, with these reinterpreted
   * @param {number} options.x - Anchor X in **world** coordinates
   * @param {number} options.y - Anchor Y in **world** coordinates
   * @param {number} [options.offsetX=0] - Offset from the anchor, in UI units
   * @param {number} [options.offsetY=0] - Offset from the anchor, in UI units
   */
  drawText(options) {
    __privateMethod(this, _WorldOverlay_instances, submit_fn).call(this, this.labels, null, options);
  }
  /** Drop this frame's submissions. The engine calls this before the world pass. */
  clear() {
    this.shapes.length = 0;
    this.labels.length = 0;
  }
  /** Replay the frame's submissions. Runs in the engine's overlay pass. */
  draw() {
    const { shapes, labels } = this;
    if (shapes.length === 0 && labels.length === 0) return;
    this.shapes = [];
    this.labels = [];
    const game = this.game;
    const ui = game.uiRenderer;
    const v = game.viewport;
    const content = {
      x: v.contentX / v.uiScale,
      y: v.contentY / v.uiScale,
      width: v.contentWidth / v.uiScale,
      height: v.contentHeight / v.uiScale
    };
    ui.pushClip(content);
    if (shapes.length > 0) {
      ui.pushTransform(__privateMethod(this, _WorldOverlay_instances, worldTransform_fn).call(this));
      for (const { method, options } of shapes) ui[method](options);
      ui.popTransform();
    }
    for (const label of labels) {
      const anchor = game.worldToUI(label.x, label.y);
      const x = anchor.x + (label.offsetX || 0);
      const y = anchor.y + (label.offsetY || 0);
      if (x < content.x - CULL_MARGIN || x > content.x + content.width + CULL_MARGIN || y < content.y - CULL_MARGIN || y > content.y + content.height + CULL_MARGIN) continue;
      ui.drawText({ ...label, x, y });
    }
    ui.popClip();
  }
  destroy() {
    this.clear();
    this.game.overlays.delete(this);
  }
}
_WorldOverlay_instances = new WeakSet();
submit_fn = function(queue, method, options) {
  if (this.shapes.length + this.labels.length >= MAX_ITEMS) {
    if (!this.warnedOverflow) {
      this.warnedOverflow = true;
      console.warn(
        `M2D: more than ${MAX_ITEMS} world-overlay submissions in one frame; dropping the rest. A game loop that replaces the engine loop must call game.drawOverlays() each frame.`
      );
    }
    return;
  }
  queue.push(method ? { method, options } : options);
};
/**
 * The transform that turns world coordinates into UI coordinates.
 *
 * Both spaces are measured in design-sized units, so the scale works out to
 * 1 for every viewport the engine produces and this is in practice a pure
 * translation by the content rect's origin. It is derived rather than
 * assumed so the overlay stays correct if that ever stops being true.
 */
worldTransform_fn = function() {
  const v = this.game.viewport;
  const origin = this.game.worldToUI(0, 0);
  const scale = v.contentWidth / v.viewWidth / v.uiScale;
  return { x: origin.x, y: origin.y, scaleX: scale, scaleY: scale };
};
const defaultOptions = {
  renderer: DEFAULT_RENDERER,
  basePath: "",
  levelNames: [],
  currentLevel: null,
  levelsPath: "./levels/",
  initialScene: null,
  width: 1280,
  height: 720,
  worldWidth: 1920,
  worldHeight: 1080,
  /**
   * What happens when the display's aspect ratio differs from width:height.
   * 'letterbox' keeps the designed view and adds bars, so nothing past the
   * edge of the designed view is ever revealed; 'expand' widens the view to
   * fill the display, showing more world. The UI fills the display either way.
   * @type {import('./viewport.js').AspectMode}
   */
  aspectMode: "letterbox",
  /**
   * World render resolution — a fidelity/performance setting, like a game's
   * resolution menu. 'native' matches the display. A `{width, height}` or a
   * scale factor renders the world coarser or finer *without* changing how
   * much world is visible. See `setResolution`.
   */
  resolution: "native",
  /** 'nearest' keeps pixel art crisp when the world is upscaled. */
  worldFilter: "linear",
  /** Track the canvas's displayed size and follow it automatically. */
  autoResize: true,
  sounds: {},
  music: {}
};
function rendererOverrideFromURL() {
  if (typeof location === "undefined" || !location.search) return null;
  return new URLSearchParams(location.search).get("renderer");
}
class M2D {
  constructor(canvas, options = {}) {
    __privateAdd(this, _M2D_instances);
    this.options = { ...defaultOptions, ...options };
    this.constructorOptions = options;
    this.canvas = canvas;
    this.resolution = this.options.resolution;
    this.aspectMode = this.options.aspectMode;
    this.resizeListeners = [];
    this.onResizeHandlers = /* @__PURE__ */ new Set();
    this.overlays = /* @__PURE__ */ new Set();
    this.pendingResize = false;
    this.viewport = __privateMethod(this, _M2D_instances, computeViewport_fn).call(this);
    this.renderer = __privateMethod(this, _M2D_instances, initRenderer_fn).call(this, canvas, rendererOverrideFromURL() || this.options.renderer);
    this.uiRenderer = new UIRenderer(this.renderer);
    this.camera = new Camera(this.viewport.viewWidth, this.viewport.viewHeight, {
      worldWidth: this.options.worldWidth,
      worldHeight: this.options.worldHeight,
      lerp: 0.1
    });
    this.worldOverlay = new WorldOverlay(this);
    if (this.options.autoResize) __privateMethod(this, _M2D_instances, watchDisplaySize_fn).call(this);
    this.engine = Matter.Engine.create();
    this.collisionCategories = CollisionCategories;
    this.Body = Matter.Body;
    this.Bodies = Matter.Bodies;
    this.entities = /* @__PURE__ */ new Set();
    this.player = null;
    this.actors = /* @__PURE__ */ new Map();
    this.isGameOver = false;
    this.paused = false;
    this.settings = null;
    this.keys = new KeyStates();
    this.layers = new LayerManager();
    this.layers.setGame(this);
    this.sceneManager = new SceneManager(this);
    this.soundManager = new SoundManager();
    this.keys.addKey(KEY_R);
    this.keys.addKey(KEY_M);
    this.keys.addKey(KEY_D);
    this.update = this.update.bind(this);
    this.lastTime = 0;
    this.frameHandle = null;
    this.running = false;
  }
  /**
   * Recompute the viewport and push it through the renderer and camera.
   *
   * Safe to call at any time; the engine coalesces display events and calls
   * this at the top of a frame so a resize never lands mid-draw.
   */
  resize(force = false) {
    var _a, _b, _c;
    this.pendingResize = false;
    const viewport = __privateMethod(this, _M2D_instances, computeViewport_fn).call(this);
    if (!force && sameViewport(viewport, this.viewport)) return;
    this.viewport = viewport;
    this.renderer.setViewport(viewport);
    this.camera.resize(viewport.viewWidth, viewport.viewHeight);
    const scene = (_a = this.sceneManager) == null ? void 0 : _a.getCurrentScene();
    (_c = (_b = scene == null ? void 0 : scene.config) == null ? void 0 : _b.onResize) == null ? void 0 : _c.call(_b, viewport.viewWidth, viewport.viewHeight, viewport);
    for (const handler of this.onResizeHandlers) {
      handler(viewport.viewWidth, viewport.viewHeight, viewport);
    }
  }
  /**
   * Subscribe to viewport changes, for HUD and layout code that has to
   * recompute positions itself.
   * @param {(width: number, height: number, viewport: object) => void} handler
   * @returns {() => void} Unsubscribe
   */
  onResize(handler) {
    this.onResizeHandlers.add(handler);
    return () => this.onResizeHandlers.delete(handler);
  }
  /**
   * Set the world render resolution — the settings-menu knob.
   *
   * This changes only how many pixels the world is rasterized into. It does
   * *not* change how much world is visible: the camera's view is fixed by the
   * game's design size, so lowering the resolution makes the world coarser,
   * never wider. The UI is unaffected and stays at display resolution.
   *
   * @param {'native'|number|{width?: number, height: number}} resolution -
   *   'native' to match the display, a `{width, height}` preset, or a scale
   *   factor (0.5 renders at half linear resolution).
   */
  setResolution(resolution) {
    this.resolution = resolution;
    this.resize(true);
  }
  /**
   * Choose how the world is filtered when it is upscaled from its render
   * resolution to the screen. `'nearest'` keeps pixel art crisp; `'linear'`
   * (the default) smooths it. Only visible below `'native'`, where there is
   * something to upscale.
   * @param {'linear'|'nearest'} filter
   */
  setWorldFilter(filter) {
    this.options.worldFilter = filter;
    this.renderer.setWorldFilter(filter);
  }
  /** The filter the world is upscaled with. @type {'linear'|'nearest'} */
  get worldFilter() {
    return this.renderer.worldFilter;
  }
  /**
   * Choose what happens when the display's aspect ratio differs from the
   * design aspect: 'letterbox' (bars, nothing extra revealed) or 'expand'
   * (the view widens and more world becomes visible).
   * @param {import('./viewport.js').AspectMode} mode
   */
  setAspectMode(mode) {
    this.aspectMode = mode;
    this.resize(true);
  }
  /** Whether the canvas is currently the fullscreen element. */
  get isFullscreen() {
    return typeof document !== "undefined" && document.fullscreenElement === this.canvas;
  }
  /**
   * Enter fullscreen on the canvas. The resize lifecycle handles the rest.
   * @returns {Promise<void>}
   */
  async requestFullscreen() {
    var _a, _b;
    await ((_b = (_a = this.canvas).requestFullscreen) == null ? void 0 : _b.call(_a));
  }
  /** Leave fullscreen if this canvas is the fullscreen element. */
  async exitFullscreen() {
    var _a;
    if (this.isFullscreen) await ((_a = document.exitFullscreen) == null ? void 0 : _a.call(document));
  }
  /** Enter fullscreen if not in it, otherwise leave. */
  async toggleFullscreen() {
    if (this.isFullscreen) await this.exitFullscreen();
    else await this.requestFullscreen();
  }
  /**
   * Stop the loop and release everything this instance registered: display
   * and input listeners, audio, the renderer's GPU resources and the current
   * scene. After this the instance is inert and holds nothing global.
   */
  destroy() {
    var _a, _b, _c, _d;
    if (this.frameHandle !== null && typeof cancelAnimationFrame === "function") {
      cancelAnimationFrame(this.frameHandle);
    }
    this.frameHandle = null;
    this.running = false;
    for (const remove of this.resizeListeners) remove();
    this.resizeListeners = [];
    this.onResizeHandlers.clear();
    for (const overlay of [...this.overlays]) (_a = overlay.destroy) == null ? void 0 : _a.call(overlay);
    this.overlays.clear();
    this.keys.destroy();
    this.soundManager.destroy();
    (_d = (_c = (_b = this.sceneManager) == null ? void 0 : _b.getCurrentScene()) == null ? void 0 : _c.unload) == null ? void 0 : _d.call(_c);
    this.renderer.destroy();
  }
  registerActor(type, ActorClass) {
    this.actors.set(type, ActorClass);
  }
  createEntity(type, x, y, width, height, spritesheet, options = {}, physics = {}) {
    const ActorClass = this.actors.get(type);
    if (!ActorClass) {
      console.error(`Actor type not registered: ${type}`);
      return null;
    }
    console.debug(`Creating ${type} at ${x}, ${y} with size ${width}x${height}`);
    const body = Matter.Bodies.rectangle(x, y, width, height, {
      isStatic: physics.bodyType === "static",
      isSensor: physics.isSensor || false,
      friction: physics.friction || 0.1,
      frictionStatic: physics.frictionStatic || 0.5,
      frictionAir: physics.frictionAir || 0.01,
      restitution: physics.restitution || 0
    });
    body.entity = null;
    const entity = new ActorClass(
      body,
      spritesheet,
      this,
      options
    );
    body.entity = entity;
    return entity;
  }
  gameOver() {
    this.isGameOver = true;
    this.soundManager.playSound("gameOver");
  }
  drawUIBackground() {
    this.uiRenderer.drawRect({
      x: 0,
      y: 0,
      width: this.uiRenderer.width,
      height: this.uiRenderer.height,
      fillStyle: "rgba(0, 0, 0, 0.7)"
    });
  }
  drawUIText(text, y, fontSize = 24, isBold = false) {
    this.uiRenderer.drawText({
      text,
      x: this.uiRenderer.width / 2,
      y,
      fillStyle: "#fff",
      fontSize: `${fontSize}px`,
      fontFamily: "system-ui",
      fontWeight: isBold ? "bold" : "normal",
      textAlign: "center",
      textBaseline: "middle"
    });
  }
  drawGameOver() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground();
    const midY = this.uiRenderer.height / 2;
    this.drawUIText("Game Over", midY - 40, 48, true);
    this.drawUIText("Press R to restart", midY + 20);
    this.drawUIText("Press M for menu", midY + 60);
    this.uiRenderer.endFrame();
  }
  drawLoading() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground("rgb(0, 0, 0)");
    this.drawUIText("Loading...", this.uiRenderer.height / 2, 64);
    this.uiRenderer.endFrame();
    console.debug("drawing loading");
  }
  drawWorld(currentScene) {
    this.worldOverlay.clear();
    this.renderer.beginFrame();
    this.renderer.applyCamera(this.camera);
    currentScene.draw();
    this.renderer.endFrame();
  }
  drawUI(currentScene) {
    this.uiRenderer.beginFrame();
    currentScene.drawUI();
    this.uiRenderer.endFrame();
  }
  /**
   * Draw scene-independent overlays (e.g. the settings menu) above everything
   * else. The engine loop calls this last every frame; a game that replaces
   * the loop must call it at the end of its own frame.
   */
  drawOverlays() {
    if (this.overlays.size === 0) return;
    this.uiRenderer.beginFrame();
    for (const overlay of this.overlays) overlay.draw();
    this.uiRenderer.endFrame();
  }
  update(currentTime) {
    if (this.pendingResize) this.resize();
    if (!this.lastTime) {
      this.lastTime = currentTime;
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }
    const deltaTime = Math.min((currentTime - this.lastTime) / 1e3, 0.1);
    this.lastTime = currentTime;
    this.renderer.clear("#000");
    if (this.keys.isJustPressed(KEY_D)) {
      this.renderer.setDebugEnabled(!this.renderer.isDebugEnabled());
    }
    if (this.sceneManager.loading) {
      this.drawLoading();
      this.frameHandle = requestAnimationFrame(this.update);
      return;
    }
    if (!this.paused) Matter.Engine.update(this.engine, deltaTime * 1e3, 1);
    const currentScene = this.sceneManager.getCurrentScene();
    if (!this.isGameOver) {
      if (currentScene) {
        if (!this.paused) {
          this.camera.update();
          currentScene.update(deltaTime);
        }
        this.drawWorld(currentScene);
        this.drawUI(currentScene);
      }
    } else {
      if (currentScene) {
        this.drawWorld(currentScene);
      }
      this.drawGameOver();
      if (this.keys.pressedKeys().has(KEY_R)) {
        this.isGameOver = false;
        this.reset();
        currentScene.load();
      } else if (this.keys.pressedKeys().has(KEY_M)) {
        this.isGameOver = false;
        this.reset();
        this.sceneManager.switchTo("mainMenu");
      }
    }
    this.drawOverlays();
    this.keys.update();
    this.frameHandle = requestAnimationFrame(this.update);
  }
  async start() {
    this.drawLoading();
    Object.entries(this.options.sounds || {}).forEach(
      ([key, file]) => this.soundManager.loadSound(key, file)
    );
    Object.entries(this.options.music || {}).forEach(
      ([key, file]) => this.soundManager.loadMusic(key, file)
    );
    if (this.options.initialScene) {
      await this.sceneManager.switchTo(this.options.initialScene);
    } else if (this.options.currentLevel) {
      await this.sceneManager.switchTo(this.options.currentLevel);
    }
    this.setupCollisionHandlers();
    this.running = true;
    this.update();
  }
  reset() {
    Matter.Events.off(this.engine);
    Matter.World.clear(this.engine.world);
    Matter.Engine.clear(this.engine);
    Matter.Composite.clear(this.engine.world);
    this.engine.world = Matter.World.create();
    this.engine = null;
    this.engine = Matter.Engine.create();
    this.entities.clear();
    this.layers.clear();
    this.player = null;
    this.lastTime = 0;
    this.camera.x = 0;
    this.camera.y = 0;
    this.camera.target = null;
    this.setupCollisionHandlers();
    this.soundManager.stopMusic();
  }
  setupCollisionHandlers() {
    Matter.Events.on(this.engine, "collisionStart", (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (bodyA.entity) bodyA.entity.onCollisionStart(bodyB);
        if (bodyB.entity) bodyB.entity.onCollisionStart(bodyA);
      });
    });
    Matter.Events.on(this.engine, "collisionEnd", (event) => {
      event.pairs.forEach((pair) => {
        const { bodyA, bodyB } = pair;
        if (bodyA.entity) bodyA.entity.onCollisionEnd(bodyB);
        if (bodyB.entity) bodyB.entity.onCollisionEnd(bodyA);
      });
    });
  }
  /**
   * Pointer position in world coordinates.
   * @param {MouseEvent} event
   * @returns {{x: number, y: number}}
   */
  getMousePosition(event) {
    const { view } = __privateMethod(this, _M2D_instances, mapPointer_fn).call(this, event);
    return this.camera.screenToWorld(view.x, view.y);
  }
  /**
   * Pointer position in UI coordinates — the space UI elements and hit
   * testing use.
   * @param {MouseEvent} event
   * @returns {{x: number, y: number}}
   */
  getUIPosition(event) {
    return __privateMethod(this, _M2D_instances, mapPointer_fn).call(this, event).ui;
  }
  /**
   * Project a world position into UI coordinates: where that point sits in
   * the space UI elements are drawn and hit-tested in. The inverse direction
   * of `getMousePosition`, for pinning screen-space content (labels, markers,
   * off-screen indicators) to a world object.
   * @param {number} x - World X
   * @param {number} y - World Y
   * @returns {{x: number, y: number}}
   */
  worldToUI(x, y) {
    const view = this.camera.worldToScreen(x, y);
    return viewToUI({ x: view.x, y: view.y, viewport: this.viewport });
  }
}
_M2D_instances = new WeakSet();
/**
 * Create and initialise the backend. When the *default* backend cannot
 * start (typically no WebGL2), fall back to the Canvas backend with a
 * warning; an explicitly requested backend that fails is an error.
 */
initRenderer_fn = function(canvas, selection) {
  const size = {
    width: this.options.width,
    height: this.options.height,
    viewport: this.viewport,
    worldFilter: this.options.worldFilter
  };
  let renderer = createRenderer(selection);
  try {
    renderer.init(canvas, size);
    return renderer;
  } catch (error) {
    if (selection !== DEFAULT_RENDERER || "renderer" in (this.constructorOptions || {})) throw error;
    console.warn(`M2D: '${DEFAULT_RENDERER}' renderer unavailable (${error.message}); falling back to '${FALLBACK_RENDERER}'`);
    renderer = createRenderer(FALLBACK_RENDERER);
    renderer.init(canvas, size);
    return renderer;
  }
};
// === Display lifecycle ===
/** Resolve the current display state into a viewport. */
computeViewport_fn = function() {
  const dpr = typeof window !== "undefined" ? window.devicePixelRatio || 1 : 1;
  return computeViewport({
    displayWidth: this.canvas.clientWidth,
    displayHeight: this.canvas.clientHeight,
    designWidth: this.options.width,
    designHeight: this.options.height,
    pixelRatio: dpr,
    aspectMode: this.aspectMode,
    resolution: this.resolution
  });
};
/**
 * Follow the canvas's displayed size, the device pixel ratio and fullscreen
 * transitions.
 *
 * A ResizeObserver is the precise signal (it catches layout changes that
 * never touch the window), with window `resize` as the fallback where it is
 * unavailable. `fullscreenchange` is observed too because entering
 * fullscreen can change the pixel ratio without changing the CSS size.
 */
watchDisplaySize_fn = function() {
  if (typeof window === "undefined") return;
  const schedule = () => {
    this.pendingResize = true;
  };
  if (typeof ResizeObserver !== "undefined") {
    const observer = new ResizeObserver(schedule);
    observer.observe(this.canvas);
    this.resizeListeners.push(() => observer.disconnect());
  } else {
    window.addEventListener("resize", schedule);
    this.resizeListeners.push(() => window.removeEventListener("resize", schedule));
  }
  document.addEventListener("fullscreenchange", schedule);
  this.resizeListeners.push(() => document.removeEventListener("fullscreenchange", schedule));
  if (typeof window.matchMedia === "function") {
    let query = null;
    const watchRatio = () => {
      var _a, _b;
      (_a = query == null ? void 0 : query.removeEventListener) == null ? void 0 : _a.call(query, "change", onChange);
      const dpr = window.devicePixelRatio || 1;
      query = window.matchMedia(`(resolution: ${dpr}dppx)`);
      (_b = query.addEventListener) == null ? void 0 : _b.call(query, "change", onChange);
    };
    const onChange = () => {
      schedule();
      watchRatio();
    };
    watchRatio();
    this.resizeListeners.push(() => {
      var _a;
      return (_a = query == null ? void 0 : query.removeEventListener) == null ? void 0 : _a.call(query, "change", onChange);
    });
  }
};
/**
 * Map a pointer event into both coordinate spaces at once.
 *
 * Mapping through the canvas's bounding rect alone is wrong: CSS letterboxes
 * the canvas (`object-fit: contain`), so the rect can be larger than the
 * drawn pixels, and the world occupies only its content rect inside those.
 * @param {MouseEvent} event
 */
mapPointer_fn = function(event) {
  return mapPointer({
    clientX: event.clientX,
    clientY: event.clientY,
    rect: this.canvas.getBoundingClientRect(),
    viewport: this.viewport
  });
};
const DEFAULT_SCALES = [1, 0.75, 0.5, 0.25];
class SettingsMenu {
  /**
   * @param {import('../m2d.js').M2D} game
   * @param {Object} [options]
   * @param {string} [options.hotkey='o'] - Key that toggles the menu
   * @param {Array<'native'|number|{width?: number, height: number}>} [options.resolutions] -
   *   Choices offered; 'native', scale factors of the design size, or presets
   * @param {boolean} [options.pauseWhenOpen=false] - Pause the game while the
   *   menu is open, restoring the previous pause state on close
   */
  constructor(game, options = {}) {
    __privateAdd(this, _SettingsMenu_instances);
    this.game = game;
    this.isOpen = false;
    this.hotkey = options.hotkey || "o";
    this.resolutions = options.resolutions || ["native", ...DEFAULT_SCALES];
    this.pauseWhenOpen = options.pauseWhenOpen ?? false;
    this.resumeOnClose = false;
    this.rows = [];
    this.hoverIndex = -1;
    game.keys.addKey(this.hotkey, (pressed) => {
      if (pressed) this.toggle();
    });
    this.onMouseDown = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      const { x, y } = this.game.getUIPosition(event);
      this.handleMouseDown(x, y);
    };
    this.onMouseMove = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      const { x, y } = this.game.getUIPosition(event);
      this.handleMouseMove(x, y);
    };
    this.onKeyDown = (event) => {
      if (!this.isOpen) return;
      event.stopPropagation();
      if (event.key === this.hotkey || event.key === "Escape") this.close();
    };
    if (typeof window !== "undefined") {
      window.addEventListener("mousedown", this.onMouseDown, true);
      window.addEventListener("mousemove", this.onMouseMove, true);
      window.addEventListener("keydown", this.onKeyDown, true);
    }
    game.overlays.add(this);
    game.settings = this;
  }
  destroy() {
    if (typeof window !== "undefined") {
      window.removeEventListener("mousedown", this.onMouseDown, true);
      window.removeEventListener("mousemove", this.onMouseMove, true);
      window.removeEventListener("keydown", this.onKeyDown, true);
    }
    this.game.keys.removeKey(this.hotkey);
    this.game.overlays.delete(this);
    if (this.game.settings === this) this.game.settings = null;
  }
  /** Open the menu (no-op when already open). */
  open() {
    if (!this.isOpen) this.toggle();
  }
  /** Close the menu (no-op when already closed). */
  close() {
    if (this.isOpen) this.toggle();
  }
  toggle() {
    this.isOpen = !this.isOpen;
    if (this.isOpen) {
      if (this.pauseWhenOpen) {
        this.resumeOnClose = !this.game.paused;
        this.game.paused = true;
      }
    } else {
      if (this.pauseWhenOpen && this.resumeOnClose) this.game.paused = false;
      this.hoverIndex = -1;
      this.game.uiRenderer.setCursor("default");
    }
  }
  /**
   * A click in UI coordinates. Public so games (and tests) that route their
   * own input can drive the menu without synthetic DOM events.
   * @returns {boolean} Whether the menu consumed the click
   */
  handleMouseDown(x, y) {
    if (!this.isOpen) return false;
    for (const row of this.rows) {
      const r = row.rect;
      if (x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height) {
        row.onClick();
        return true;
      }
    }
    if (!__privateMethod(this, _SettingsMenu_instances, inPanel_fn).call(this, x, y)) this.close();
    return true;
  }
  /** Pointer movement in UI coordinates, for hover highlights. */
  handleMouseMove(x, y) {
    if (!this.isOpen) return false;
    const index = this.rows.findIndex(({ rect: r }) => x >= r.x && x <= r.x + r.width && y >= r.y && y <= r.y + r.height);
    if (index !== this.hoverIndex) {
      this.hoverIndex = index;
      this.game.uiRenderer.setCursor(index >= 0 ? "pointer" : "default");
    }
    return true;
  }
  draw() {
    this.rows = [];
    this.panelRect = null;
    if (!this.isOpen) return;
    const ui = this.game.uiRenderer;
    const l = __privateMethod(this, _SettingsMenu_instances, layout_fn).call(this);
    this.panelRect = { x: l.x, y: l.y, width: l.width, height: l.height };
    ui.drawRect({ x: 0, y: 0, width: ui.width, height: ui.height, fillStyle: "rgba(0, 0, 0, 0.55)" });
    ui.drawRect({
      x: l.x,
      y: l.y,
      width: l.width,
      height: l.height,
      fillStyle: "rgba(12, 20, 30, 0.95)",
      strokeStyle: "rgba(130, 190, 255, 0.5)",
      lineWidth: 1,
      cornerRadius: 10
    });
    ui.drawText({
      text: "Settings",
      x: l.x + l.width / 2,
      y: l.y + l.titleHeight / 2 + 4,
      fillStyle: "#e8f4ff",
      fontSize: "20px",
      fontFamily: "system-ui",
      fontWeight: "bold",
      textAlign: "center",
      textBaseline: "middle"
    });
    l.items.forEach((item, index) => {
      const rect = {
        x: l.x + l.pad,
        y: l.y + l.titleHeight + index * l.rowHeight,
        width: l.width - 2 * l.pad,
        height: l.rowHeight - 6
      };
      this.rows.push({ rect, onClick: item.onClick });
      ui.drawRect({
        ...rect,
        fillStyle: index === this.hoverIndex ? "rgba(90, 150, 220, 0.35)" : "rgba(255, 255, 255, 0.06)",
        cornerRadius: 6
      });
      ui.drawText({
        text: item.label,
        x: rect.x + 12,
        y: rect.y + rect.height / 2,
        fillStyle: "#cfe8ff",
        fontSize: "15px",
        fontFamily: "system-ui",
        textAlign: "left",
        textBaseline: "middle"
      });
      ui.drawText({
        text: item.value,
        x: rect.x + rect.width - 12,
        y: rect.y + rect.height / 2,
        fillStyle: "#8fd0a0",
        fontSize: "15px",
        fontFamily: "system-ui",
        textAlign: "right",
        textBaseline: "middle"
      });
    });
  }
}
_SettingsMenu_instances = new WeakSet();
/** The menu's rows: label, current value, and what a click does. */
items_fn = function() {
  const game = this.game;
  return [
    {
      label: "Resolution",
      value: __privateMethod(this, _SettingsMenu_instances, resolutionLabel_fn).call(this, game.resolution),
      onClick: () => __privateMethod(this, _SettingsMenu_instances, cycleResolution_fn).call(this, 1)
    },
    {
      label: "Fullscreen",
      value: game.isFullscreen ? "On" : "Off",
      onClick: () => game.toggleFullscreen()
    },
    {
      label: "Aspect",
      value: game.aspectMode === "expand" ? "Fill (expand)" : "Letterbox",
      onClick: () => game.setAspectMode(game.aspectMode === "expand" ? "letterbox" : "expand")
    },
    {
      label: "Paused",
      value: game.paused ? "On" : "Off",
      onClick: () => {
        game.paused = !game.paused;
      }
    },
    {
      label: "Close",
      value: `(${this.hotkey.toUpperCase()})`,
      onClick: () => this.close()
    }
  ];
};
/**
 * Human label for a resolution choice, in world-surface pixels.
 * @param {'native'|number|{width?: number, height: number}} resolution
 * @returns {string}
 */
resolutionLabel_fn = function(resolution) {
  const v = this.game.viewport;
  if (resolution === "native" || resolution == null) {
    return `Native (${v.worldWidth}x${v.worldHeight})`;
  }
  if (typeof resolution === "object") {
    return `${resolution.width ?? Math.round(resolution.height * (this.game.options.width / this.game.options.height))}x${resolution.height}`;
  }
  return `${Math.round(this.game.options.width * resolution)}x${Math.round(this.game.options.height * resolution)}`;
};
/** Advance to the next (or previous) resolution choice and apply it. */
cycleResolution_fn = function(step) {
  const current = this.resolutions.findIndex((r) => sameResolution(r, this.game.resolution));
  const index = current < 0 ? 0 : (current + step + this.resolutions.length) % this.resolutions.length;
  this.game.setResolution(this.resolutions[index]);
};
inPanel_fn = function(x, y) {
  const p = this.panelRect;
  return p && x >= p.x && x <= p.x + p.width && y >= p.y && y <= p.y + p.height;
};
/** Panel geometry against the current UI size, so it stays centred. */
layout_fn = function() {
  const ui = this.game.uiRenderer;
  const width = 340;
  const rowHeight = 44;
  const titleHeight = 52;
  const pad = 14;
  const items = __privateMethod(this, _SettingsMenu_instances, items_fn).call(this);
  const height = titleHeight + items.length * rowHeight + pad;
  return {
    items,
    width,
    rowHeight,
    titleHeight,
    pad,
    x: (ui.width - width) / 2,
    y: (ui.height - height) / 2,
    height
  };
};
export {
  CollisionCategories as C,
  KEY_X as K,
  M2D as M,
  OPTIONAL_CAPABILITIES as O,
  PARTICLE_STRIDE as P,
  SettingsMenu as S,
  UIElement as U,
  Matter as a,
  PerformanceStats as b,
  KEY_SPACE as c,
  KEY_DOWN as d,
  KEY_UP as e,
  KEY_RIGHT as f,
  KEY_LEFT as g,
  sameResolution as s
};

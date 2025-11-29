var __typeError = (msg) => {
  throw TypeError(msg);
};
var __accessCheck = (obj, member, msg) => member.has(obj) || __typeError("Cannot " + msg);
var __privateGet = (obj, member, getter) => (__accessCheck(obj, member, "read from private field"), getter ? getter.call(obj) : member.get(obj));
var __privateAdd = (obj, member, value) => member.has(obj) ? __typeError("Cannot add the same private member more than once") : member instanceof WeakSet ? member.add(obj) : member.set(obj, value);
var __privateSet = (obj, member, value, setter) => (__accessCheck(obj, member, "write to private field"), setter ? setter.call(obj, value) : member.set(obj, value), value);
var _isDebugEnabled, _debugLayer;
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
const scriptRel = "modulepreload";
const assetsURL = function(dep) {
  return "/m2d-engine/" + dep;
};
const seen = {};
const __vitePreload = function preload(baseModule, deps, importerUrl) {
  let promise = Promise.resolve();
  if (deps && deps.length > 0) {
    document.getElementsByTagName("link");
    const cspNonceMeta = document.querySelector(
      "meta[property=csp-nonce]"
    );
    const cspNonce = (cspNonceMeta == null ? void 0 : cspNonceMeta.nonce) || (cspNonceMeta == null ? void 0 : cspNonceMeta.getAttribute("nonce"));
    promise = Promise.allSettled(
      deps.map((dep) => {
        dep = assetsURL(dep);
        if (dep in seen) return;
        seen[dep] = true;
        const isCss = dep.endsWith(".css");
        const cssSelector = isCss ? '[rel="stylesheet"]' : "";
        if (document.querySelector(`link[href="${dep}"]${cssSelector}`)) {
          return;
        }
        const link = document.createElement("link");
        link.rel = isCss ? "stylesheet" : scriptRel;
        if (!isCss) {
          link.as = "script";
        }
        link.crossOrigin = "";
        link.href = dep;
        if (cspNonce) {
          link.setAttribute("nonce", cspNonce);
        }
        document.head.appendChild(link);
        if (isCss) {
          return new Promise((res, rej) => {
            link.addEventListener("load", res);
            link.addEventListener(
              "error",
              () => rej(new Error(`Unable to preload CSS for ${dep}`))
            );
          });
        }
      })
    );
  }
  function handlePreloadError(err) {
    const e = new Event("vite:preloadError", {
      cancelable: true
    });
    e.payload = err;
    window.dispatchEvent(e);
    if (!e.defaultPrevented) {
      throw err;
    }
  }
  return promise.then((res) => {
    for (const item of res || []) {
      if (item.status !== "rejected") continue;
      handlePreloadError(item.reason);
    }
    return baseModule().catch(handlePreloadError);
  });
};
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
(function(module, exports$1) {
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
        __webpack_require__.d = function(exports$12, name, getter) {
          if (!__webpack_require__.o(exports$12, name)) {
            Object.defineProperty(exports$12, name, { enumerable: true, get: getter });
          }
        };
        __webpack_require__.r = function(exports$12) {
          if (typeof Symbol !== "undefined" && Symbol.toStringTag) {
            Object.defineProperty(exports$12, Symbol.toStringTag, { value: "Module" });
          }
          Object.defineProperty(exports$12, "__esModule", { value: true });
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
        function(module2, exports$12) {
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
        function(module2, exports$12) {
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
        function(module2, exports$12) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
            Body.translate = function(body, translation, updateVelocity) {
              Body.setPosition(body, Vector.add(body.position, translation), updateVelocity);
            };
            Body.rotate = function(body, rotation, point, updateVelocity) {
              if (!point) {
                Body.setAngle(body, body.angle + rotation, updateVelocity);
              } else {
                var cos = Math.cos(rotation), sin = Math.sin(rotation), dx = body.position.x - point.x, dy = body.position.y - point.y;
                Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
                }, updateVelocity);
                Body.setAngle(body, body.angle + rotation, updateVelocity);
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
            Composite.translate = function(composite, translation, recursive) {
              var bodies = recursive ? Composite.allBodies(composite) : composite.bodies;
              for (var i = 0; i < bodies.length; i++) {
                Body.translate(bodies[i], translation);
              }
              return composite;
            };
            Composite.rotate = function(composite, rotation, point, recursive) {
              var cos = Math.cos(rotation), sin = Math.sin(rotation), bodies = recursive ? Composite.allBodies(composite) : composite.bodies;
              for (var i = 0; i < bodies.length; i++) {
                var body = bodies[i], dx = body.position.x - point.x, dy = body.position.y - point.y;
                Body.setPosition(body, {
                  x: point.x + (dx * cos - dy * sin),
                  y: point.y + (dx * sin + dy * cos)
                });
                Body.rotate(body, rotation);
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
              var decomp = Common.getDecomp(), canDecomp, body, parts, isConvex, isConcave, vertices, i, j, k, v, z;
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
                isConvex = Vertices.isConvex(vertices);
                isConcave = !isConvex;
                if (isConcave && !canDecomp) {
                  Common.warnOnce(
                    "Bodies.fromVertices: Install the 'poly-decomp' library and use Common.setDecomp or provide 'decomp' as a global to decompose concave vertices."
                  );
                }
                if (isConvex || !canDecomp) {
                  if (isConvex) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
        function(module2, exports$12, __webpack_require__) {
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
  constructor(mouseConstraint, eventsOn) {
    this.keys = /* @__PURE__ */ new Map();
    this.mouseConstraint = mouseConstraint;
    this.eventsOn = eventsOn;
    this.justPressed = /* @__PURE__ */ new Set();
    document.addEventListener("keydown", this.handleKeyDown.bind(this));
    document.addEventListener("keyup", this.handleKeyUp.bind(this));
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
class UIElement {
  constructor(x, y, width, height) {
    this.x = x;
    this.y = y;
    this.width = width;
    this.height = height;
    this.visible = true;
    this.isHovered = false;
    this.isFocused = false;
    this.game = null;
    this.stopPropagation = false;
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
class UIButton extends UIElement {
  constructor(x, y, width, height, text, onClick, style = {}) {
    super(x, y);
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
    super(x, y);
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
    super(x, y);
    this.image = image;
    this.width = options.width || image.width;
    this.height = options.height || image.height;
    this.scale = options.scale || 1;
  }
  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawImage(this.image, this.x, this.y, {
      width: this.width,
      height: this.height,
      scale: this.scale
    });
  }
}
class UIRectangle extends UIElement {
  constructor(x, y, width, height, color, options = {}) {
    super(x, y);
    this.width = width;
    this.height = height;
    this.color = color;
    this.interactive = options.interactive || false;
  }
  draw() {
    if (!this.game) return;
    this.game.uiRenderer.drawRect({
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
    super(x, y);
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
    const text = "FPS: " + fps + " · Avg FPS: " + avgFps + " · Draw Calls: " + stats.drawCalls + " · State Changes: " + stats.stateChanges + " · Sprites: " + stats.spritesDrawn + " · Text: " + stats.textDrawn + " · Shapes: " + stats.shapesDrawn;
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
    this.game = game;
    this.config = config;
    this.sprites = /* @__PURE__ */ new Map();
    this.spriteSheets = /* @__PURE__ */ new Map();
    this.ui = new Container(game);
    this._handleMouseMove = this._handleMouseMove.bind(this);
    this._handleMouseDown = this._handleMouseDown.bind(this);
  }
  _handleMouseMove(event) {
    const rect = this.game.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.game.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.game.canvas.height / rect.height);
    this.ui.onMouseMove(x, y);
  }
  _handleMouseDown(event) {
    const rect = this.game.canvas.getBoundingClientRect();
    const x = (event.clientX - rect.left) * (this.game.canvas.width / rect.width);
    const y = (event.clientY - rect.top) * (this.game.canvas.height / rect.height);
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
    const stats = new PerformanceStats(this.game, 20, 20, { textColor: "#00ff00", show: true });
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
  setupBackground([spriteIndex, x, y]) {
    const [imagePath, tileSize] = this.config.sprites[spriteIndex];
    const spriteSheet = this.spriteSheets.get(imagePath);
    if (!spriteSheet) {
      console.error(`Sprite not found: ${imagePath}`);
      return;
    }
    spriteSheet.define("default", x, y);
    const tileCountX = Math.ceil(this.game.width / tileSize);
    const tileCountY = Math.ceil(this.game.height / tileSize);
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
            () => {
              if (element.properties.onClick) {
                this.game.sceneManager.switchTo(element.properties.onClick);
              }
            },
            {
              backgroundColor: element.properties.backgroundColor,
              hoverColor: element.properties.hoverColor,
              textColor: element.properties.textColor,
              fontSize: element.properties.fontSize,
              fontFamily: element.properties.fontFamily
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
              align: element.properties.align
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
                scale: element.properties.scale
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
              interactive: ((_a = element.properties) == null ? void 0 : _a.interactive) || false
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
    this.ui.update(deltaTime);
  }
  draw(deltaTime) {
    if (this.config.type === "level") {
      this.game.layers.drawLayer("background");
      this.game.entities.forEach((entity) => entity.draw(deltaTime));
    }
  }
  drawUI(deltaTime) {
    this.ui.draw(deltaTime);
  }
}
class SceneLoader {
  constructor(game) {
    this.game = game;
    this.spriteIndices = /* @__PURE__ */ new Map();
  }
  async loadScene(sceneData) {
    if (!sceneData.version || !sceneData.type) {
      throw new Error("Invalid scene format");
    }
    return sceneData.type === "level" ? this.loadLevelScene(sceneData) : this.loadUIScene(sceneData);
  }
  async loadLevelScene(data) {
    this.mapSprites(data.assets.spritesheets);
    return {
      name: data.name,
      type: "level",
      title: data.title || data.name,
      gameType: data.gameType,
      world: data.world,
      sprites: this.getSpritesArray(data),
      player: this.createPlayerEntity(data),
      entities: this.createEntities(data)
    };
  }
  mapSprites(spritesheets) {
    this.spriteIndices.clear();
    Object.keys(spritesheets).forEach((key, index) => {
      this.spriteIndices.set(key, index);
    });
  }
  getSpritesArray(data) {
    return Object.entries(data.assets.spritesheets).map(([_, sprite]) => [
      sprite.url,
      sprite.frameWidth
    ]);
  }
  createPlayerEntity(data) {
    const playerLayer = data.layers.find(
      (layer) => layer.objects.some((obj) => obj.prefab === "player")
    );
    if (!playerLayer) return null;
    const playerObj = playerLayer.objects.find((obj) => obj.prefab === "player");
    if (!playerObj) return null;
    const prefab = data.prefabs.player;
    return this.createEntity(playerObj, prefab);
  }
  createEntities(data) {
    return data.layers.flatMap(
      (layer) => layer.objects.filter((obj) => obj.prefab !== "player").map((obj) => this.createEntity(obj, data.prefabs[obj.prefab]))
    );
  }
  createEntity(obj, prefab) {
    return {
      actor: prefab.actor,
      position: [obj.x, obj.y],
      size: [obj.width || 32, obj.height || 32],
      sprite: this.spriteIndices.get(prefab.spritesheet),
      animations: this.createAnimations(prefab),
      options: obj.properties,
      physics: prefab.physics
    };
  }
  createAnimations(prefab) {
    const spritesheet = prefab.spritesheet;
    if (!(spritesheet == null ? void 0 : spritesheet.animations)) return void 0;
    return Object.entries(spritesheet.animations).map(([name, anim]) => [
      name,
      ...anim.frames[0],
      anim.loop
    ]);
  }
  async loadUIScene(data) {
    return {
      name: data.name,
      type: "ui",
      title: data.title || data.name,
      assets: data.assets,
      elements: data.elements.map((element) => ({
        type: element.type,
        id: element.id,
        x: element.x,
        y: element.y,
        ...element.properties
      }))
    };
  }
}
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
      const loadedScene = await sceneConfig.fetch();
      if (!loadedScene) {
        console.error("Failed to load scene", sceneConfig);
        throw new Error("Failed to load scene");
      }
      this.scenes.set(sceneName, new Scene(this.game, loadedScene));
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
class Camera {
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
    this.width = scene.game.canvas.width;
    this.height = scene.game.canvas.height;
  }
  follow(target) {
    this.target = target;
  }
  update() {
    if (!this.target) return;
    const targetX = this.target.body.position.x;
    const targetY = this.target.body.position.y;
    this.x += (targetX - this.x) * this.lerp;
    this.y += (targetY - this.y) * this.lerp;
    if (this.bounds) {
      const halfWidth = this.width / 2;
      const halfHeight = this.height / 2;
      this.x = Math.max(this.bounds.left + halfWidth, Math.min(this.bounds.right - halfWidth, this.x));
      this.y = Math.max(this.bounds.top + halfHeight, Math.min(this.bounds.bottom - halfHeight, this.y));
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
}
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
    document.addEventListener("click", () => this.initialize(), { once: true });
    document.addEventListener("keydown", () => this.initialize(), { once: true });
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
class BaseRenderer {
  constructor() {
    if (this.constructor === BaseRenderer) {
      throw new Error("BaseRenderer is an abstract class and cannot be instantiated directly");
    }
  }
  /**
   * Initialize the renderer with a target element and options.
   * @param {HTMLElement} element - The target element to render to
   * @param {Object} options - Renderer-specific options
   */
  init(element, options) {
    throw new Error("Method not implemented");
  }
  /**
   * Clean up renderer resources.
   */
  destroy() {
    throw new Error("Method not implemented");
  }
  /**
   * Resize the renderer to match its container.
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    throw new Error("Method not implemented");
  }
  /**
   * Clear the renderer.
   * @param {string} [color] - Background color
   */
  clear(color) {
    throw new Error("Method not implemented");
  }
  /**
   * Begin a new frame.
   */
  beginFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * End the current frame.
   */
  endFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a sprite.
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Image to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.tileX - Tile X position in spritesheet
   * @param {number} options.tileY - Tile Y position in spritesheet
   * @param {number} options.tileWidth - Tile width
   * @param {number} options.tileHeight - Tile height
   * @param {number} [options.width] - Destination width
   * @param {number} [options.height] - Destination height
   * @param {number} [options.rotation=0] - Rotation in radians
   * @param {boolean} [options.flipX=false] - Flip horizontally
   * @param {boolean} [options.flipY=false] - Flip vertically
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawSprite(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw an animation.
   * @param {Object} options - Drawing options
   * @param {Object} options.sprite - The sprite to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} options.animation - Animation name
   * @param {number} [options.frame=0] - Animation frame
   * @param {Object} [options.transform] - Transform options
   */
  drawAnimation(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string} [options.fillStyle] - Fill color
   * @param {string} [options.strokeStyle] - Stroke color
   * @param {number} [options.lineWidth] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill the rectangle
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawRect(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} [options.color='#000'] - Text color
   * @param {string} [options.font='16px Arial'] - Font settings
   * @param {string} [options.align='left'] - Text alignment
   * @param {string} [options.baseline='top'] - Text baseline
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawText(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Apply camera transformation.
   * @param {Object} camera - Camera object with position and dimensions
   */
  applyCamera(camera) {
    throw new Error("Method not implemented");
  }
  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    throw new Error("Method not implemented");
  }
  /**
   * Enable/disable debug rendering
   * @param {boolean} enabled - Whether debug rendering should be enabled
   */
  setDebugEnabled(enabled) {
    throw new Error("setDebugEnabled not implemented");
  }
  /**
   * Check if debug rendering is enabled
   * @returns {boolean} Whether debug rendering is enabled
   */
  isDebugEnabled() {
    throw new Error("isDebugEnabled not implemented");
  }
  /**
   * Set debug rendering layer
   * @param {string} layer - Debug layer name
   */
  setDebugLayer(layer) {
    throw new Error("setDebugLayer not implemented");
  }
  /**
   * Get current debug layer
   * @returns {string} Current debug layer name
   */
  getDebugLayer() {
    throw new Error("getDebugLayer not implemented");
  }
}
class CanvasRenderer extends BaseRenderer {
  constructor() {
    super();
    __privateAdd(this, _isDebugEnabled, true);
    __privateAdd(this, _debugLayer, "default");
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
    this.width = 800;
    this.height = 600;
    this.frameCount = 0;
    this.fps = 0;
    this.lastFpsUpdate = performance.now();
    this.fpsUpdateInterval = 1e3;
    this.fpsHistory = new Array(60).fill(0);
    this.fpsHistoryIndex = 0;
    this.fpsSum = 0;
    this.fpsCount = 0;
    this.stats = {
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
    this.width = options.width || this.width;
    this.height = options.height || this.height;
    this.resize();
  }
  /**
   * Clean up renderer resources.
   */
  destroy() {
    this.canvas = null;
    this.context = null;
    this.worldBuffer = null;
    this.worldContext = null;
  }
  /**
   * Resize canvas and buffer to match container size or use fixed dimensions.
   * @param {number} [width] - New width (optional)
   * @param {number} [height] - New height (optional)
   */
  resize(width, height) {
    if (!this.canvas) return;
    if (width !== void 0 && height !== void 0) {
      this.width = width;
      this.height = height;
    }
    this.canvas.width = this.width;
    this.canvas.height = this.height;
    this.worldBuffer.width = this.width;
    this.worldBuffer.height = this.height;
  }
  /**
   * Clear both main canvas and world buffer.
   * @param {string} color - CSS color string for background
   */
  clear(color = "#000") {
    if (!this.context) return;
    this.context.fillStyle = color;
    this.context.fillRect(0, 0, this.width, this.height);
    this.worldContext.fillStyle = color;
    this.worldContext.fillRect(0, 0, this.width, this.height);
  }
  /**
   * Draw world content with double buffering.
   * @param {function(CanvasRenderingContext2D): void} callback - Drawing callback
   */
  drawWorld(callback) {
    if (!this.worldContext) return;
    this.worldContext.clearRect(0, 0, this.width, this.height);
    this.worldContext.save();
    callback(this.worldContext);
    this.worldContext.restore();
    this.context.drawImage(this.worldBuffer, 0, 0);
  }
  /**
   * Draw screen-space content directly to main canvas.
   * @param {function(CanvasRenderingContext2D): void} callback - Drawing callback
   */
  drawScreen(callback) {
    if (!this.context) return;
    this.context.save();
    callback(this.context);
    this.context.restore();
  }
  /**
   * Draw a sprite.
   * @param {Object} options - Drawing options
   */
  drawSprite(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx || !options.image) return;
    this.stats.drawCalls++;
    this.stats.spritesDrawn++;
    this.trackStateChange(ctx, {});
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
      rotation = 0,
      flipX = false,
      flipY = false
    } = options;
    ctx.save();
    ctx.translate(x, y);
    if (rotation) ctx.rotate(rotation);
    if (flipX || flipY) ctx.scale(flipX ? -1 : 1, flipY ? -1 : 1);
    ctx.drawImage(
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
    ctx.restore();
  }
  /**
   * Draw an animation.
   * @param {Object} options - Drawing options
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
   * Apply camera transformation to rendering context.
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
   * @deprecated Use renderer-specific methods instead
   * @returns {CanvasRenderingContext2D} Main rendering context
   */
  getContext() {
    return this.context;
  }
  /**
   * @deprecated Use renderer-specific methods instead
   * @returns {CanvasRenderingContext2D} World buffer context
   */
  getWorldContext() {
    return this.worldContext;
  }
  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    ctx.save();
    if (options.strokeStyle) {
      ctx.strokeStyle = options.strokeStyle;
      ctx.lineWidth = options.lineWidth || 1;
    }
    if (options.fillStyle) {
      ctx.fillStyle = options.fillStyle;
    }
    if (options.fill !== false && options.fillStyle) {
      ctx.fillRect(options.x, options.y, options.width, options.height);
    }
    if (options.strokeStyle) {
      ctx.strokeRect(options.x, options.y, options.width, options.height);
    }
    ctx.restore();
  }
  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} [options.fillStyle='#000'] - Text color
   * @param {string} [options.fontSize='16px'] - Font size with units
   * @param {string} [options.fontFamily='system-ui'] - Font family
   * @param {string} [options.fontWeight='normal'] - Font weight
   * @param {string} [options.textAlign='left'] - Text alignment (left, center, right)
   * @param {string} [options.textBaseline='top'] - Text baseline (top, middle, bottom)
   * @param {boolean} [options.isScreenSpace=false] - Whether to draw in screen space
   */
  drawText(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;
    this.stats.drawCalls++;
    this.stats.textDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      font: `${options.fontWeight || "normal"} ${options.fontSize || "16px"} ${options.fontFamily || "system-ui"}`.trim()
    });
    ctx.save();
    ctx.fillStyle = options.fillStyle || "#000";
    ctx.font = `${options.fontWeight || "normal"} ${options.fontSize || "16px"} ${options.fontFamily || "system-ui"}`.trim();
    ctx.textAlign = options.textAlign || "left";
    ctx.textBaseline = options.textBaseline || "top";
    ctx.fillText(options.text, options.x, options.y);
    ctx.restore();
  }
  /**
   * Draw a line.
   * @param {Object} options - Drawing options
   */
  drawLine(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    ctx.save();
    ctx.strokeStyle = options.strokeStyle || "#000";
    ctx.lineWidth = options.lineWidth || 1;
    ctx.beginPath();
    ctx.moveTo(options.x1, options.y1);
    ctx.lineTo(options.x2, options.y2);
    ctx.stroke();
    ctx.restore();
  }
  /**
   * Draw an arc or circle.
   * @param {Object} options - Drawing options
   */
  drawArc(options) {
    const ctx = options.isScreenSpace ? this.context : this.worldContext;
    if (!ctx) return;
    this.stats.drawCalls++;
    this.stats.shapesDrawn++;
    this.trackStateChange(ctx, {
      fillStyle: options.fillStyle,
      strokeStyle: options.strokeStyle,
      lineWidth: options.lineWidth
    });
    ctx.save();
    if (options.strokeStyle) {
      ctx.strokeStyle = options.strokeStyle;
      ctx.lineWidth = options.lineWidth || 1;
    }
    if (options.fillStyle) {
      ctx.fillStyle = options.fillStyle;
    }
    ctx.beginPath();
    ctx.arc(
      options.x,
      options.y,
      options.radius,
      options.startAngle,
      options.endAngle,
      false
    );
    if (options.fill !== false && options.fillStyle) {
      ctx.fill();
    }
    if (options.strokeStyle) {
      ctx.stroke();
    }
    ctx.restore();
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
  /**
   * Begin a new frame.
   */
  beginFrame() {
    if (!this.worldContext) return;
    this.clear("#000");
    this.worldContext.save();
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
   * End the current frame.
   */
  endFrame() {
    if (!this.worldContext) return;
    this.worldContext.restore();
    this.context.drawImage(this.worldBuffer, 0, 0);
  }
  setDebugEnabled(enabled) {
    __privateSet(this, _isDebugEnabled, enabled);
  }
  isDebugEnabled() {
    return __privateGet(this, _isDebugEnabled);
  }
  setDebugLayer(layer) {
    __privateSet(this, _debugLayer, layer);
  }
  getDebugLayer() {
    return __privateGet(this, _debugLayer);
  }
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
    this.stats.drawCalls = 0;
    this.stats.stateChanges = 0;
    this.stats.spritesDrawn = 0;
    this.stats.textDrawn = 0;
    this.stats.shapesDrawn = 0;
  }
  trackStateChange(ctx, newState) {
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
}
_isDebugEnabled = new WeakMap();
_debugLayer = new WeakMap();
class BaseUIRenderer {
  constructor() {
    if (this.constructor === BaseUIRenderer) {
      throw new Error("BaseUIRenderer is an abstract class and cannot be instantiated directly");
    }
  }
  /**
   * Initialize the renderer with a target element and options.
   * @param {HTMLElement} element - The target element to render to
   * @param {Object} options - Renderer-specific options
   */
  init(element, options) {
    throw new Error("Method not implemented");
  }
  /**
   * Clean up renderer resources.
   */
  destroy() {
    throw new Error("Method not implemented");
  }
  /**
   * Resize the renderer to match its container.
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    throw new Error("Method not implemented");
  }
  /**
   * Clear the renderer.
   * @param {string} [color] - Background color
   */
  clear(color) {
    throw new Error("Method not implemented");
  }
  /**
   * Begin a new frame.
   */
  beginFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * End the current frame.
   */
  endFrame() {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} options.width - Rectangle width
   * @param {number} options.height - Rectangle height
   * @param {string} [options.fillStyle] - Fill color
   * @param {string} [options.strokeStyle] - Stroke color
   * @param {number} [options.lineWidth] - Stroke width
   * @param {boolean} [options.fill=true] - Whether to fill the rectangle
   */
  drawRect(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw text.
   * @param {Object} options - Drawing options
   * @param {string} options.text - Text to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {string} [options.color='#000'] - Text color
   * @param {string} [options.font='16px Arial'] - Font settings
   * @param {string} [options.align='left'] - Text alignment
   * @param {string} [options.baseline='top'] - Text baseline
   */
  drawText(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw an image.
   * @param {Object} options - Drawing options
   * @param {HTMLImageElement} options.image - Image to draw
   * @param {number} options.x - X position
   * @param {number} options.y - Y position
   * @param {number} [options.width] - Destination width
   * @param {number} [options.height] - Destination height
   */
  drawImage(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Draw a path.
   * @param {Object} options - Drawing options
   * @param {Array<{x: number, y: number}>} options.points - Path points
   * @param {string} [options.strokeStyle='#000'] - Stroke color
   * @param {number} [options.lineWidth=1] - Line width
   * @param {string} [options.fillStyle] - Fill color
   * @param {boolean} [options.closed=false] - Whether to close the path
   */
  drawPath(options) {
    throw new Error("Method not implemented");
  }
  /**
   * Push a clipping rectangle.
   * @param {Object} rect - Clipping rectangle
   * @param {number} rect.x - X position
   * @param {number} rect.y - Y position
   * @param {number} rect.width - Rectangle width
   * @param {number} rect.height - Rectangle height
   */
  pushClip(rect) {
    throw new Error("Method not implemented");
  }
  /**
   * Pop the last clipping rectangle.
   */
  popClip() {
    throw new Error("Method not implemented");
  }
  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} style - Text style options
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style) {
    throw new Error("Method not implemented");
  }
  /**
   * Test if a point hits a shape.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape to test against
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) {
    throw new Error("Method not implemented");
  }
  /**
   * Set the cursor style.
   * @param {string} style - CSS cursor style
   */
  setCursor(style) {
    throw new Error("Method not implemented");
  }
}
class CanvasUIRenderer extends BaseUIRenderer {
  constructor() {
    super();
    this.canvas = null;
    this.context = null;
    this.width = 800;
    this.height = 600;
    this.clipStack = [];
  }
  /**
   * Initialize the UI renderer.
   * @param {HTMLCanvasElement} element - The canvas element to render to
   * @param {Object} options - Renderer options
   */
  init(element, options = {}) {
    this.canvas = element;
    this.context = this.canvas.getContext("2d");
    this.width = options.width || this.width;
    this.height = options.height || this.height;
    this.resize(this.width, this.height);
  }
  /**
   * Clean up renderer resources.
   */
  destroy() {
    this.canvas = null;
    this.context = null;
    this.clipStack = [];
  }
  /**
   * Resize canvas to match container size or use fixed dimensions.
   * @param {number} width - New width
   * @param {number} height - New height
   */
  resize(width, height) {
    if (!this.canvas) return;
    this.width = width;
    this.height = height;
    this.canvas.width = width;
    this.canvas.height = height;
  }
  /**
   * Clear the canvas.
   * @param {string} [color] - Background color
   */
  clear(color) {
    if (!this.context) return;
    if (color) {
      this.context.fillStyle = color;
      this.context.fillRect(0, 0, this.width, this.height);
    } else {
      this.context.clearRect(0, 0, this.width, this.height);
    }
  }
  /**
   * Begin a new frame.
   */
  beginFrame() {
    if (!this.context) return;
    this.context.save();
  }
  /**
   * End the current frame.
   */
  endFrame() {
    if (!this.context) return;
    this.context.restore();
  }
  /**
   * Draw a rectangle.
   * @param {Object} options - Drawing options
   */
  drawRect(options) {
    if (!this.context) return;
    this.context.save();
    if (options.globalAlpha !== void 0) {
      this.context.globalAlpha = options.globalAlpha;
    }
    if (options.strokeStyle) {
      this.context.strokeStyle = options.strokeStyle;
      this.context.lineWidth = options.lineWidth || 1;
    }
    if (options.fillStyle) {
      this.context.fillStyle = options.fillStyle;
    }
    if (options.fill !== false && options.fillStyle) {
      this.context.fillRect(options.x, options.y, options.width, options.height);
    }
    if (options.strokeStyle) {
      this.context.strokeRect(options.x, options.y, options.width, options.height);
    }
    this.context.restore();
  }
  /**
   * Draw text.
   * @param {Object} options - Drawing options
   */
  drawText(options) {
    if (!this.context) return;
    this.context.save();
    if (options.globalAlpha !== void 0) {
      this.context.globalAlpha = options.globalAlpha;
    }
    this.context.fillStyle = options.fillStyle || "#000";
    this.context.font = `${options.fontSize || "16px"} ${options.fontFamily || "system-ui"}`;
    this.context.textAlign = options.textAlign || "left";
    this.context.textBaseline = options.textBaseline || "top";
    this.context.fillText(options.text, options.x, options.y);
    this.context.restore();
  }
  /**
   * Draw an image.
   * @param {Object} options - Drawing options
   */
  drawImage(options) {
    if (!this.context || !options.image) return;
    this.context.save();
    if (options.globalAlpha !== void 0) {
      this.context.globalAlpha = options.globalAlpha;
    }
    this.context.drawImage(
      options.image,
      options.x,
      options.y,
      options.width || options.image.width,
      options.height || options.image.height
    );
    this.context.restore();
  }
  /**
   * Draw a path.
   * @param {Object} options - Drawing options
   */
  drawPath(options) {
    if (!this.context || !options.points || options.points.length < 2) return;
    this.context.save();
    if (options.globalAlpha !== void 0) {
      this.context.globalAlpha = options.globalAlpha;
    }
    this.context.beginPath();
    this.context.moveTo(options.points[0].x, options.points[0].y);
    for (let i = 1; i < options.points.length; i++) {
      this.context.lineTo(options.points[i].x, options.points[i].y);
    }
    if (options.closed) {
      this.context.closePath();
    }
    if (options.fillStyle) {
      this.context.fillStyle = options.fillStyle;
      this.context.fill();
    }
    if (options.strokeStyle) {
      this.context.strokeStyle = options.strokeStyle;
      this.context.lineWidth = options.lineWidth || 1;
      this.context.stroke();
    }
    this.context.restore();
  }
  /**
   * Push a clipping rectangle.
   * @param {Object} rect - Clipping rectangle
   */
  pushClip(rect) {
    if (!this.context) return;
    this.clipStack.push(rect);
    this.context.save();
    this.context.beginPath();
    this.context.rect(rect.x, rect.y, rect.width, rect.height);
    this.context.clip();
  }
  /**
   * Pop the last clipping rectangle.
   */
  popClip() {
    if (!this.context || this.clipStack.length === 0) return;
    this.clipStack.pop();
    this.context.restore();
  }
  /**
   * Measure text dimensions.
   * @param {string} text - Text to measure
   * @param {Object} style - Text style options
   * @returns {{width: number, height: number}} Text dimensions
   */
  measureText(text, style = {}) {
    if (!this.context) return { width: 0, height: 0 };
    this.context.save();
    this.context.font = style.font || "16px Arial";
    const metrics = this.context.measureText(text);
    this.context.restore();
    return {
      width: metrics.width,
      height: parseInt(style.font) || 16
    };
  }
  /**
   * Test if a point hits a shape.
   * @param {number} x - X position to test
   * @param {number} y - Y position to test
   * @param {Object} shape - Shape to test against
   * @returns {boolean} Whether the point hits the shape
   */
  hitTest(x, y, shape) {
    if (!this.context) return false;
    switch (shape.type) {
      case "rect": {
        const left = shape.x;
        const right = shape.x + shape.width;
        const top = shape.y;
        const bottom = shape.y + shape.height;
        return x >= left && x <= right && y >= top && y <= bottom;
      }
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
    if (this.canvas) {
      this.canvas.style.cursor = style;
    }
  }
}
const defaultOptions = {
  basePath: "",
  levelNames: [],
  currentLevel: null,
  levelsPath: "./levels/",
  initialScene: null,
  width: 1280,
  height: 720,
  worldWidth: 1920,
  worldHeight: 1080,
  sounds: {},
  music: {}
};
class M2D {
  constructor(canvas, options = {}) {
    this.options = { ...defaultOptions, ...options };
    this.renderer = new CanvasRenderer();
    this.uiRenderer = new CanvasUIRenderer();
    this.renderer.init(canvas, {
      width: this.options.width,
      height: this.options.height
    });
    this.uiRenderer.init(canvas, {
      width: this.options.width,
      height: this.options.height
    });
    this.canvas = canvas;
    this.context = this.renderer.getContext();
    this.canvas.width = this.options.width;
    this.canvas.height = this.options.height;
    this.camera = new Camera(this.options.width, this.options.height, {
      worldWidth: this.options.worldWidth,
      worldHeight: this.options.worldHeight,
      smoothing: 0.1
    });
    this.engine = Matter.Engine.create();
    this.collisionCategories = CollisionCategories;
    this.Body = Matter.Body;
    this.Bodies = Matter.Bodies;
    this.entities = /* @__PURE__ */ new Set();
    this.player = null;
    this.actors = /* @__PURE__ */ new Map();
    this.isGameOver = false;
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
  }
  resize() {
    const width = this.canvas.clientWidth;
    const height = this.canvas.clientHeight;
    this.renderer.resize(width, height);
    this.uiRenderer.resize(width, height);
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
      width: this.canvas.width,
      height: this.canvas.height,
      fillStyle: "rgba(0, 0, 0, 0.7)"
    });
  }
  drawUIText(text, y, fontSize = 24, isBold = false) {
    this.uiRenderer.drawText({
      text,
      x: this.canvas.width / 2,
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
    this.drawUIText("Game Over", this.canvas.height / 2 - 40, 48, true);
    this.drawUIText("Press R to restart", this.canvas.height / 2 + 20);
    this.drawUIText("Press M for menu", this.canvas.height / 2 + 60);
    this.uiRenderer.endFrame();
  }
  drawLoading() {
    this.uiRenderer.beginFrame();
    this.drawUIBackground("rgb(0, 0, 0)");
    this.drawUIText("Loading...", this.canvas.height / 2, 64);
    this.uiRenderer.endFrame();
    console.debug("drawing loading");
  }
  drawWorld(currentScene) {
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
  update(currentTime) {
    if (!this.lastTime) {
      this.lastTime = currentTime;
      requestAnimationFrame(this.update);
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
      requestAnimationFrame(this.update);
      return;
    }
    Matter.Engine.update(this.engine, deltaTime * 1e3, 1);
    const currentScene = this.sceneManager.getCurrentScene();
    if (!this.isGameOver) {
      if (currentScene) {
        this.camera.update();
        currentScene.update(deltaTime);
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
    this.keys.update();
    requestAnimationFrame(this.update);
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
  getMousePosition(event) {
    const rect = this.canvas.getBoundingClientRect();
    const screenX = event.clientX - rect.left;
    const screenY = event.clientY - rect.top;
    const scaleX = this.canvas.width / rect.width;
    const scaleY = this.canvas.height / rect.height;
    return this.camera.screenToWorld(
      screenX * scaleX,
      screenY * scaleY
    );
  }
}
export {
  CollisionCategories as C,
  KEY_X as K,
  Matter as M,
  __vitePreload as _,
  M2D as a,
  KEY_SPACE as b,
  KEY_DOWN as c,
  KEY_UP as d,
  KEY_RIGHT as e,
  KEY_LEFT as f
};

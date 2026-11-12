// Generated from 几猫国产3A大作_V1.html by scripts/extract-original.mjs.
// Preserve original shaders and geometry; adapt gameplay in the typed client layer.
import * as lt from 'three';
const {Vector3:W} = lt;
var oi = { min: new W(-40, 0, -30), max: new W(40, 30, 30), groundY: 0, seaY: -1.6, quayX: 30 };
var u1 = 0.42;
var Ls = 0.5;
var Ya = -40;
var EA = 31;
var ol = -32;
var SA = 30;
var qt = Math.round((EA - Ya) / Ls);
var Qs = Math.round((SA - ol) / Ls);
var yf = 0.5;
function d3(i) {
    let e = [], t = true, n = new Uint8Array(qt * Qs), s = new W(), o = { boxes: e, bounds: { min: oi.min.clone(), max: oi.max.clone() }, addBox(_, M, E = {}) {
      let w = f3(_), S = f3(M), z = { min: new W(Math.min(w.x, S.x), Math.min(w.y, S.y), Math.min(w.z, S.z)), max: new W(Math.max(w.x, S.x), Math.max(w.y, S.y), Math.max(w.z, S.z)), surface: E.surface || "concrete", tag: E.tag || "", noNav: !!E.noNav, bulletOnly: !!E.bulletOnly, playerOnly: !!E.playerOnly };
      return e.push(z), t = true, z;
    }, removeBox(_) {
      let M = e.indexOf(_);
      M >= 0 && (e.splice(M, 1), t = true);
    }, build() {
      a();
    }, raycast(_, M, E = 500) {
      let w = E, S = null, z = -1, H = 0, O = 0, q = _.x, U = _.y, T = _.z, D = M.x, C = M.y, G = M.z;
      if (C < -1e-6) {
        let F = (oi.groundY - U) / C;
        if (F > 0 && F < w) if (q + D * F <= oi.quayX) w = F, O = 1;
        else {
          let ne = (oi.seaY - U) / C;
          ne > 0 && ne < w && (w = ne, O = 2);
        }
      }
      let j = D === 0 ? 1 / 0 : 1 / D, N = C === 0 ? 1 / 0 : 1 / C, Q = G === 0 ? 1 / 0 : 1 / G;
      for (let F = 0; F < e.length; F++) {
        let X = e[F];
        if (X.playerOnly) continue;
        let ne = 0, re = w, $ = -1, ue = 0, me, ee;
        if (D !== 0) {
          me = (X.min.x - q) * j, ee = (X.max.x - q) * j;
          let B = -1;
          if (me > ee) {
            let P = me;
            me = ee, ee = P, B = 1;
          }
          if (me > ne && (ne = me, $ = 0, ue = B), ee < re && (re = ee), ne > re) continue;
        } else if (q < X.min.x || q > X.max.x) continue;
        if (C !== 0) {
          me = (X.min.y - U) * N, ee = (X.max.y - U) * N;
          let B = -1;
          if (me > ee) {
            let P = me;
            me = ee, ee = P, B = 1;
          }
          if (me > ne && (ne = me, $ = 1, ue = B), ee < re && (re = ee), ne > re) continue;
        } else if (U < X.min.y || U > X.max.y) continue;
        if (G !== 0) {
          me = (X.min.z - T) * Q, ee = (X.max.z - T) * Q;
          let B = -1;
          if (me > ee) {
            let P = me;
            me = ee, ee = P, B = 1;
          }
          if (me > ne && (ne = me, $ = 2, ue = B), ee < re && (re = ee), ne > re) continue;
        } else if (T < X.min.z || T > X.max.z) continue;
        $ < 0 || (w = ne, S = X, z = $, H = ue, O = 0);
      }
      if (!S && !O) return null;
      let K = new W(q + D * w, U + C * w, T + G * w);
      if (O) return { dist: w, point: K, normal: new W(0, 1, 0), surface: O === 2 ? "water" : i.level && i.level.groundSurfaceAt ? i.level.groundSurfaceAt(K.x, K.z) : "concrete", box: null };
      let ie = new W();
      return ie.setComponent(z, H), { dist: w, point: K, normal: ie, surface: S.surface, box: S };
    }, lineOfSight(_, M) {
      s.subVectors(M, _);
      let E = s.length();
      return E < 1e-4 ? true : (s.multiplyScalar(1 / E), !o.raycast(_, s, E - 0.05));
    }, groundHeight(_, M, E = 50) {
      let w = _ <= oi.quayX ? oi.groundY : oi.seaY;
      for (let S = 0; S < e.length; S++) {
        let z = e[S];
        z.bulletOnly || _ >= z.min.x && _ <= z.max.x && M >= z.min.z && M <= z.max.z && z.max.y <= E && z.max.y > w && (w = z.max.y);
      }
      return w;
    }, moveCapsule(_, M, E, w = 0.32, S = 1.8, z = true) {
      let H = { onGround: false, hitWall: false, hitCeil: false, surface: "concrete" }, O = M.x * E, q = M.z * E, U = Math.max(1, Math.ceil(Math.hypot(O, q) / (w * 0.6))), T = _.y;
      for (let K = 0; K < U; K++) {
        _.x += O / U, _.z += q / U;
        for (let ie = 0; ie < 3; ie++) {
          let F = false;
          for (let X = 0; X < e.length; X++) {
            let ne = e[X];
            if (ne.bulletOnly || ne.max.y <= _.y + (z ? u1 : 0.08) || ne.min.y >= _.y + S) continue;
            let re = Math.max(ne.min.x, Math.min(ne.max.x, _.x)), $ = Math.max(ne.min.z, Math.min(ne.max.z, _.z)), ue = _.x - re, me = _.z - $, ee = ue * ue + me * me;
            if (!(ee >= w * w)) {
              if (ee > 1e-10) {
                let B = Math.sqrt(ee), P = w - B;
                ue /= B, me /= B, _.x += ue * P, _.z += me * P;
                let V = M.x * ue + M.z * me;
                V < 0 && (M.x -= ue * V, M.z -= me * V);
              } else {
                let B = _.x - ne.min.x, P = ne.max.x - _.x, V = _.z - ne.min.z, Y = ne.max.z - _.z, L = Math.min(B, P, V, Y);
                L === B ? (_.x = ne.min.x - w, M.x > 0 && (M.x = 0)) : L === P ? (_.x = ne.max.x + w, M.x < 0 && (M.x = 0)) : L === V ? (_.z = ne.min.z - w, M.z > 0 && (M.z = 0)) : (_.z = ne.max.z + w, M.z < 0 && (M.z = 0));
              }
              F = true, H.hitWall = true;
            }
          }
          if (!F) break;
        }
      }
      let D = _.y + M.y * E, C = w * 0.7, G = _.x <= oi.quayX + C ? oi.groundY : -50, j = null, N = 1 / 0, Q = T + (z ? u1 : 0.08) + 1e-4;
      for (let K = 0; K < e.length; K++) {
        let ie = e[K];
        ie.bulletOnly || _.x + C < ie.min.x || _.x - C > ie.max.x || _.z + C < ie.min.z || _.z - C > ie.max.z || (ie.max.y <= Q && ie.max.y > G && (G = ie.max.y, j = ie.surface), ie.min.y >= T + S - 0.05 && ie.min.y < N && (N = ie.min.y));
      }
      return M.y > 0 && D + S > N ? (_.y = N - S, M.y = 0, H.hitCeil = true) : D <= G ? (_.y = G, M.y < 0 && (M.y = 0), H.onGround = true) : z && M.y <= 0 && D - G < u1 ? (_.y = G, M.y = 0, H.onGround = true) : _.y = D, H.onGround && (H.surface = j || (i.level && i.level.groundSurfaceAt ? i.level.groundSurfaceAt(_.x, _.z) : "concrete")), H;
    }, nav: { cell: Ls, isWalkable(_, M) {
      r();
      let E = l(_, M);
      return E >= 0 && !n[E];
    }, findPath(_, M) {
      r();
      let E = u(_.x, _.z), w = u(M.x, M.z);
      if (E < 0 || w < 0) return null;
      if (E === w) return [new W(M.x, 0, M.z)];
      let S = A(E, w);
      if (!S) return null;
      let z = [], H = 0;
      for (; H < S.length - 1; ) {
        let O = H + 1;
        for (let q = S.length - 1; q > H + 1; q--) if (h(S[H], S[q])) {
          O = q;
          break;
        }
        z.push(c(S[O])), H = O;
      }
      return l(M.x, M.z) === w && z.length && z[z.length - 1].set(M.x, 0, M.z), z;
    }, randomPoint(_, M) {
      r();
      for (let w = 0; w < 24; w++) {
        let S = Math.random() * 6.2832, z = Math.sqrt(Math.random()) * M, H = _.x + Math.cos(S) * z, O = _.z + Math.sin(S) * z, q = l(H, O);
        if (q >= 0 && !n[q]) return new W(H, 0, O);
      }
      let E = u(_.x, _.z);
      return E >= 0 ? c(E) : new W(_.x, 0, _.z);
    }, clearLine(_, M) {
      r();
      let E = l(_.x, _.z), w = l(M.x, M.z);
      return E >= 0 && w >= 0 && h(E, w);
    }, _grid: () => (r(), { blocked: n, w: qt, h: Qs, minX: Ya, minZ: ol, cell: Ls }) } };
    function r() {
      t && a();
    }
    function a() {
      n = new Uint8Array(qt * Qs), t = false;
      for (let _ of e) {
        if (_.noNav || _.bulletOnly || _.max.y < u1 + 0.05 || _.min.y > 1.5) continue;
        let M = Math.max(0, Math.floor((_.min.x - yf - Ya) / Ls)), E = Math.min(qt - 1, Math.floor((_.max.x + yf - Ya) / Ls)), w = Math.max(0, Math.floor((_.min.z - yf - ol) / Ls)), S = Math.min(Qs - 1, Math.floor((_.max.z + yf - ol) / Ls));
        for (let z = w; z <= S; z++) for (let H = M; H <= E; H++) n[z * qt + H] = 1;
      }
      for (let _ = 0; _ < Qs; _++) for (let M = 0; M < qt; M++) (Ya + (M + 0.5) * Ls > oi.quayX - yf || M === 0 || _ === 0 || M === qt - 1 || _ === Qs - 1) && (n[_ * qt + M] = 1);
    }
    function l(_, M) {
      let E = Math.floor((_ - Ya) / Ls), w = Math.floor((M - ol) / Ls);
      return E < 0 || w < 0 || E >= qt || w >= Qs ? -1 : w * qt + E;
    }
    function c(_) {
      return new W(Ya + (_ % qt + 0.5) * Ls, 0, ol + (Math.floor(_ / qt) + 0.5) * Ls);
    }
    function u(_, M) {
      let E = Math.floor((_ - Ya) / Ls), w = Math.floor((M - ol) / Ls);
      if (E = Math.max(0, Math.min(qt - 1, E)), w = Math.max(0, Math.min(Qs - 1, w)), !n[w * qt + E]) return w * qt + E;
      for (let S = 1; S <= 12; S++) {
        let z = -1, H = 1e9;
        for (let O = -S; O <= S; O++) for (let q = -S; q <= S; q++) {
          if (Math.max(Math.abs(q), Math.abs(O)) !== S) continue;
          let U = E + q, T = w + O;
          if (!(U < 0 || T < 0 || U >= qt || T >= Qs) && !n[T * qt + U]) {
            let D = q * q + O * O;
            D < H && (H = D, z = T * qt + U);
          }
        }
        if (z >= 0) return z;
      }
      return -1;
    }
    function h(_, M) {
      let E = _ % qt, w = Math.floor(_ / qt), S = M % qt, z = Math.floor(M / qt), H = Math.abs(S - E), O = Math.abs(z - w), q = E < S ? 1 : -1, U = w < z ? 1 : -1, T = H - O;
      for (let D = 0; D < 600; D++) {
        if (n[w * qt + E]) return false;
        if (E === S && w === z) return true;
        let C = 2 * T;
        if (C > -O && C < H) {
          if (n[w * qt + E + q] || n[(w + U) * qt + E]) return false;
          T += H - O, E += q, w += U;
        } else C > -O ? (T -= O, E += q) : (T += H, w += U);
      }
      return false;
    }
    let f = new Float32Array(qt * Qs), p = new Int32Array(qt * Qs), d = new Uint32Array(qt * Qs), v = new Uint32Array(qt * Qs), g = 0, x = [], y = [];
    function b(_, M) {
      let E = x.length;
      for (x.push(_), y.push(M); E > 0; ) {
        let w = E - 1 >> 1;
        if (y[w] <= M) break;
        x[E] = x[w], y[E] = y[w], E = w;
      }
      x[E] = _, y[E] = M;
    }
    function m() {
      let _ = x[0], M = x.pop(), E = y.pop(), w = x.length;
      if (w) {
        let S = 0;
        for (; ; ) {
          let z = 2 * S + 1;
          if (z >= w || (z + 1 < w && y[z + 1] < y[z] && z++, y[z] >= E)) break;
          x[S] = x[z], y[S] = y[z], S = z;
        }
        x[S] = M, y[S] = E;
      }
      return _;
    }
    function A(_, M) {
      g++, x.length = 0, y.length = 0;
      let E = M % qt, w = Math.floor(M / qt), S = (O) => {
        let q = Math.abs(O % qt - E), U = Math.abs(Math.floor(O / qt) - w);
        return q + U + (1.4142 - 2) * Math.min(q, U);
      };
      f[_] = 0, d[_] = g, p[_] = -1, b(_, S(_));
      let z = 0;
      for (; x.length; ) {
        let O = m();
        if (O === M) break;
        if (v[O] === g) continue;
        if (v[O] = g, ++z > 9e3) return null;
        let q = O % qt, U = Math.floor(O / qt);
        for (let T = -1; T <= 1; T++) for (let D = -1; D <= 1; D++) {
          if (!D && !T) continue;
          let C = q + D, G = U + T;
          if (C < 0 || G < 0 || C >= qt || G >= Qs) continue;
          let j = G * qt + C;
          if (n[j] || v[j] === g || D && T && (n[U * qt + C] || n[G * qt + q])) continue;
          let N = f[O] + (D && T ? 1.4142 : 1);
          (d[j] !== g || N < f[j]) && (f[j] = N, d[j] = g, p[j] = O, b(j, N + S(j)));
        }
      }
      if (d[M] !== g) return null;
      let H = [];
      for (let O = M; O !== -1; O = p[O]) H.push(O);
      return H.reverse(), H;
    }
    return o;
  }
function f3(i) {
    return i.isVector3 ? i.clone() : new W(i[0], i[1], i[2]);
  }
export {d3 as createPhysics,oi as worldBounds};

// Script de conversión definitivo: HTM → JSX
// Enfoque: state machine completo respetando strings y template literals JS
const fs = require('fs');
const path = require('path');

const SRC_FILE = path.join(__dirname, '..', 'assets', 'app.js');
const OUT_DIR = path.join(__dirname, '..', 'src', 'views');

const VIEWS = [
  { name: 'PropietariosView',       start: 315,  end: 912  },
  { name: 'NuevoViajeView',         start: 913,  end: 1468 },
  { name: 'HistorialViajesView',    start: 1469, end: 1936 },
  { name: 'LiquidacionSemanalView', start: 1937, end: 2614 },
  { name: 'AnalisisMensualView',    start: 2615, end: 2888 },
  { name: 'ChoferesView',           start: 2889, end: 3107 },
  { name: 'GandolasView',           start: 3108, end: 3311 },
  { name: 'RutasView',              start: 3312, end: 3599 },
  { name: 'GastosExtraView',        start: 3600, end: 3804 },
];

const IMPORTS = `import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { formatUSD, getTodayString, getDateRangePresets, parseTelefono, buildTelefono, PREFIJOS_VZLA } from '../utils/helpers.js';
const { ipcRenderer } = window.require('electron');
`;

const rawLines = fs.readFileSync(SRC_FILE, 'utf8').split('\n');

// ─── State machine that converts htm → JSX ───────────────────────────────────
function convertToJsx(src) {
  let out = '';
  let i = 0;
  const len = src.length;

  // State stack: 'code' | 'string_sq' | 'string_dq' | 'tpl_js' | 'tpl_htm'
  // tpl_htm: inside an html`` tagged template  → emit raw JSX chars
  // tpl_js:  inside a regular JS template literal `...`
  const stack = [{ type: 'code', depth: 0 }];

  const top = () => stack[stack.length - 1];

  while (i < len) {
    const ch = src[i];
    const st = top();

    // ── Inside single-quoted string ──────────────────────────────────────────
    if (st.type === 'string_sq') {
      if (ch === '\\') { out += ch + src[++i]; i++; continue; }
      if (ch === "'")  { out += ch; i++; stack.pop(); continue; }
      out += ch; i++; continue;
    }

    // ── Inside double-quoted string ──────────────────────────────────────────
    if (st.type === 'string_dq') {
      if (ch === '\\') { out += ch + src[++i]; i++; continue; }
      if (ch === '"')  { out += ch; i++; stack.pop(); continue; }
      out += ch; i++; continue;
    }

    // ── Inside a JS template literal `...` (NOT htm tagged) ─────────────────
    if (st.type === 'tpl_js') {
      if (ch === '\\') { out += ch + src[++i]; i++; continue; }
      if (ch === '`')  { out += ch; i++; stack.pop(); continue; }
      if (src.slice(i, i + 2) === '${') {
        out += '${'; i += 2;
        stack.push({ type: 'tpl_expr', depth: 1 });
        continue;
      }
      out += ch; i++; continue;
    }

    // ── Inside a ${...} expression inside a JS template literal ─────────────
    if (st.type === 'tpl_expr') {
      if (ch === '{') { st.depth++; out += ch; i++; continue; }
      if (ch === '}') {
        st.depth--;
        if (st.depth === 0) { out += ch; i++; stack.pop(); continue; }
        out += ch; i++; continue;
      }
      if (ch === "'") { out += ch; i++; stack.push({ type: 'string_sq' }); continue; }
      if (ch === '"') { out += ch; i++; stack.push({ type: 'string_dq' }); continue; }
      if (src.slice(i, i + 5) === 'html`') {
        // nested html`` inside tpl_expr
        out += '('; i += 5;
        stack.push({ type: 'tpl_htm', depth: 0 });
        continue;
      }
      if (ch === '`') { out += ch; i++; stack.push({ type: 'tpl_js' }); continue; }
      out += ch; i++; continue;
    }

    // ── Inside an htm html`` tagged template ────────────────────────────────
    if (st.type === 'tpl_htm') {
      // Closing backtick at depth 0 ends the htm template
      if (ch === '`' && st.depth === 0) {
        out += ')'; i++;
        stack.pop();
        continue;
      }
      // ${...} opens a JSX expression hole
      if (src.slice(i, i + 2) === '${') {
        out += '{'; i += 2;
        stack.push({ type: 'htm_expr', depth: 1 });
        continue;
      }
      // Escaped char
      if (ch === '\\') { out += ch + src[++i]; i++; continue; }
      out += ch; i++; continue;
    }

    // ── Inside ${...} expression inside an htm template ──────────────────────
    if (st.type === 'htm_expr') {
      if (ch === '{') { st.depth++; out += ch; i++; continue; }
      if (ch === '}') {
        st.depth--;
        if (st.depth === 0) { out += '}'; i++; stack.pop(); continue; }
        out += ch; i++; continue;
      }
      if (ch === "'") { out += ch; i++; stack.push({ type: 'string_sq' }); continue; }
      if (ch === '"') { out += ch; i++; stack.push({ type: 'string_dq' }); continue; }
      // Nested html`` inside htm expr
      if (src.slice(i, i + 5) === 'html`') {
        out += '('; i += 5;
        stack.push({ type: 'tpl_htm', depth: 0 });
        continue;
      }
      // Regular JS template literal inside htm expr
      if (ch === '`') { out += ch; i++; stack.push({ type: 'tpl_js' }); continue; }
      out += ch; i++; continue;
    }

    // ── Top-level code ────────────────────────────────────────────────────────
    if (ch === "'") { out += ch; i++; stack.push({ type: 'string_sq' }); continue; }
    if (ch === '"') { out += ch; i++; stack.push({ type: 'string_dq' }); continue; }
    // htm tagged template
    if (src.slice(i, i + 5) === 'html`') {
      out += '('; i += 5;
      stack.push({ type: 'tpl_htm', depth: 0 });
      continue;
    }
    // Regular template literal
    if (ch === '`') { out += ch; i++; stack.push({ type: 'tpl_js' }); continue; }
    out += ch; i++;
  }

  return out;
}

function stripBoilerplate(code) {
  return code
    .replace(/const React = window\.require\('react'\);\n?/g, '')
    .replace(/const ReactDOM = window\.require\('react-dom\/client'\);\n?/g, '')
    .replace(/const htm = window\.require\('htm'\);\n?/g, '')
    .replace(/const \{ ipcRenderer \} = window\.require\('electron'\);\n?/g, '')
    .replace(/const \{[^}]+\} = React;\n?/g, '')
    .replace(/const html = htm\.bind\(React\.createElement\);\n?/g, '')
    // style=${{ → style={{
    .replace(/style=\$\{\{/g, 'style={{')
    // Simple attribute: attr=${identifier} or attr=${'string'} → attr={...}
    // NOTE: attr=${`template`} is handled by the state machine below
    .replace(/(\s[\w-]+)=\$\{([\w.'"][^`}]*)\}/g, '$1={$2}')
    // HTML comments → JSX comments
    .replace(/<!--([\s\S]*?)-->/g, '{/*$1*/}');
}

VIEWS.forEach(({ name, start, end }) => {
  const chunk = rawLines.slice(start - 1, end).join('\n');
  const stripped = stripBoilerplate(chunk);
  const jsx = convertToJsx(stripped);

  const content = `${IMPORTS}\n${jsx}\n\nexport default ${name};\n`;
  const outPath = path.join(OUT_DIR, `${name}.jsx`);
  fs.writeFileSync(outPath, content, 'utf8');
  console.log(`✓ ${name}.jsx`);
});

console.log('\n✅ Done. Run: npx vite build');

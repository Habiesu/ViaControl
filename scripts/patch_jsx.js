// Fix específico: corrige className={)...`} → className={`...`}
// Y style={{...}}} → style={{...}}
const fs = require('fs');
const path = require('path');
const VIEWS_DIR = path.join(__dirname, '..', 'src', 'views');

const files = fs.readdirSync(VIEWS_DIR).filter(f => f.endsWith('.jsx'));

files.forEach(file => {
  const fp = path.join(VIEWS_DIR, file);
  let code = fs.readFileSync(fp, 'utf8');
  const original = code;

  // Fix: className={)...`} → className={`...`}
  // The ) comes from html` conversion, the ` is the closing of the original template literal
  code = code.replace(/=\{\)(([^`}])*)`\}/g, (match, inner) => {
    return `={\`${inner}\`}`;
  });

  // Fix: className={`...)  → className={`...`} (opening ` present, ) is wrong closing)
  // This pattern: {`btn ${expr}`} where ` was already there and ) was added incorrectly
  // Look for {`...)} and replace ) with `}
  code = code.replace(/\{`([^`}]*)\)`\}/g, (match, inner) => {
    return `{\`${inner}\`}`;
  });

  // Fix style={{}} vs style={{...}}}
  // Triple } after style
  code = code.replace(/style=\{\{([^}]*(?:\{[^}]*\}[^}]*)*)\}\}\}/g, (match, inner) => {
    return `style={{${inner}}}`;
  });

  if (code !== original) {
    fs.writeFileSync(fp, code, 'utf8');
    console.log(`Patched: ${file}`);
  } else {
    console.log(`No changes: ${file}`);
  }
});

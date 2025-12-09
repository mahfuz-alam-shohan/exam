export function renderDocument({ title, styles, script, bodyClass = 'text-slate-800 antialiased selection:bg-orange-200' }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no">
  <title>${title}</title>
  <script src="https://cdn.tailwindcss.com"></script>
  <script crossorigin src="https://unpkg.com/react@18/umd/react.production.min.js"></script>
  <script crossorigin src="https://unpkg.com/react-dom@18/umd/react-dom.production.min.js"></script>
  <script src="https://unpkg.com/@babel/standalone/babel.min.js"></script>
  <script src="https://cdn.jsdelivr.net/npm/canvas-confetti@1.6.0/dist/confetti.browser.min.js"></script>
  <link href="https://fonts.googleapis.com/css2?family=Fredoka:wght@400;600&family=Quicksand:wght@400;500;700&display=swap" rel="stylesheet">
  <style>${styles}</style>
</head>
<body class="${bodyClass}">
  <div id="root"></div>
  <script type="text/babel">${script}</script>
</body>
</html>`;
}

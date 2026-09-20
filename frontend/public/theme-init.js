// Apply the saved theme before first paint to avoid a flash.
try {
  var saved = localStorage.getItem('taloria-theme')
  if (saved === 'dark') document.documentElement.dataset.theme = 'dark'
} catch {}
/* Script de intake-prototype.html: en fichero aparte (no en línea) por la CSP. */
tailwind.config = {
  darkMode: "class",
  theme: {
    extend: {
      colors: {
        /* Mismos tokens que public/index.html (manual de marca EU Funding Studio, oct-2026) */
        "primary":"#4312d8","primary-container":"#4312d8",
        "ink":"#1b0759","violet":"#7349f0","lavender":"#b392f6","lavender-soft":"#efe8fe","cream":"#f2f2f2",
        "secondary-fixed":"#e9ff60","secondary-fixed-dim":"#d4ec3c",
        "accent-warm":"#b392f6",
        "surface":"#f8f8f8","surface-dim":"#d9d9d9","surface-bright":"#ffffff",
        "surface-container":"#f2f2f2","surface-container-low":"#f8f8f8",
        "surface-container-high":"#e8e8e8","surface-container-lowest":"#ffffff",
        "on-surface":"#1b0759","on-surface-variant":"#55577a",
        "outline":"#8a8aa3","outline-variant":"#d6d3dc",
        "error":"#ba1a1a","error-container":"#ffdad6",
        "on-error-container":"#93000a",
        "surface-tint":"#b392f6",
        "on-primary-container":"#efe8fe",
      },
      fontFamily: {
        "headline":["Poppins","sans-serif"],
        "body":["Poppins","sans-serif"],
      }
    }
  }
}

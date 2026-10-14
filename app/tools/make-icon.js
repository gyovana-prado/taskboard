// Renderiza tools/icon.html com o próprio Electron e gera build/icon.png (1024x1024).
// Depois: iconutil monta o .icns a partir do iconset (ver build-icon.sh).
const { app, BrowserWindow } = require('electron')
const fs = require('node:fs')
const path = require('node:path')

app.whenReady().then(async () => {
  const win = new BrowserWindow({
    width: 1024, height: 1024, show: false, frame: false, transparent: true,
    webPreferences: { offscreen: true },
  })
  await win.loadFile(path.join(__dirname, 'icon.html'))
  await new Promise((r) => setTimeout(r, 300))
  const img = await win.webContents.capturePage({ x: 0, y: 0, width: 1024, height: 1024 })
  fs.mkdirSync(path.join(__dirname, '..', 'build'), { recursive: true })
  fs.writeFileSync(path.join(__dirname, '..', 'build', 'icon.png'), img.toPNG())
  console.log('build/icon.png', img.getSize())
  app.quit()
})

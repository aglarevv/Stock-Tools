const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("electronAPI", {
  minimize: () => ipcRenderer.send("win:minimize"),
  maximize: () => ipcRenderer.send("win:maximize"),
  unmaximize: () => ipcRenderer.send("win:maximize"),   // win:maximize 已处理 toggle
  close: () => ipcRenderer.send("win:close"),
  isMaximized: () => ipcRenderer.invoke("win:isMaximized"),
  onMaximizeChange: (cb) => {
    ipcRenderer.on("win:maximize-change", (_, v) => cb(v));
  },
});

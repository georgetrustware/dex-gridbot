module.exports = {
    apps: [
      {
        name: "dex-grid-bot",
        script: "app.js",
        max_memory_restart: '128M',
        instances: "1",
        exec_mode: "fork",
        kill_timeout: 5000,
      }
    ]
  };

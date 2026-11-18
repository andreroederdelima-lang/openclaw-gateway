module.exports = {
  apps: [
    {
      name: "openclaw-gateway",
      script: "server.js",
      instances: 1,
      exec_mode: "fork",
      autorestart: true,
      max_restarts: 10,
      env: {
        NODE_ENV: "production",
      },
    },
  ],
};

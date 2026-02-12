module.exports = {
  apps: [
    {
      name: 'multiplant',
      script: 'npm',
      args: 'start',
      cwd: 'E:\\MainTimeClock',
      env: {
        NODE_ENV: 'production',
        PORT: 3000,
      },
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '512M',
    },
  ],
};

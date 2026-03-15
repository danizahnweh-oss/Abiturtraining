// PM2 Konfiguration für myAbiFlow
// Starten: pm2 start ecosystem.config.cjs
// Status:  pm2 status
// Logs:    pm2 logs
// Restart: pm2 restart all

module.exports = {
  apps: [
    {
      name: 'myabiflow-api',
      script: 'server.js',
      cwd: '/app/myabiflow-backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        PORT: 3000
      },
      max_memory_restart: '500M',
      error_file: '/var/log/myabiflow/api-error.log',
      out_file: '/var/log/myabiflow/api-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      restart_delay: 3000,
      max_restarts: 10,
      min_uptime: 10000
    },
    {
      name: 'myabiflow-gemini',
      script: 'gemini-proxy/server.js',
      cwd: '/app/myabiflow-backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        GEMINI_PROXY_PORT: 3001
      },
      max_memory_restart: '300M',
      error_file: '/var/log/myabiflow/gemini-error.log',
      out_file: '/var/log/myabiflow/gemini-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    },
    {
      name: 'myabiflow-tutor',
      script: 'tutor/server.js',
      cwd: '/app/myabiflow-backend',
      instances: 1,
      exec_mode: 'fork',
      env: {
        NODE_ENV: 'production',
        TUTOR_PORT: 3002
      },
      max_memory_restart: '200M',
      error_file: '/var/log/myabiflow/tutor-error.log',
      out_file: '/var/log/myabiflow/tutor-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss'
    }
  ]
};

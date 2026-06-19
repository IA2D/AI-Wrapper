module.exports = {
  apps: [
    {
      name: 'rag-service',
      script: '/usr/bin/docker-compose',
      args: 'up',
      cwd: '/home/AIchat/rag-service',
      exec_interpreter: 'none',
      exec_mode: 'fork',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: {
        NODE_ENV: 'production',
      },
      // Graceful shutdown
      kill_timeout: 30000,
      listen_timeout: 10000,
      // Logging
      log_file: '/var/log/rag-service/combined.log',
      out_file: '/var/log/rag-service/out.log',
      err_file: '/var/log/rag-service/error.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
      merge_logs: true,
      // Ensure proper cleanup on stop
      kill_retry_time: 10000,
      // Run as root (required for Docker)
      // Note: PM2 should be running as root, or user in docker group
    }
  ]
};

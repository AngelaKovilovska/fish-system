module.exports = {
  apps: [{
    name: 'fish-system',
    cwd: './server',
    script: 'index.js',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3001,
    },
    max_memory_restart: '300M',
    exp_backoff_restart_delay: 100,
    error_file: '/var/log/fish-system/error.log',
    out_file: '/var/log/fish-system/output.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    kill_timeout: 5000,
    listen_timeout: 10000,
  }],
};

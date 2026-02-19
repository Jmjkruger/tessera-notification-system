module.exports = {
  apps: [
    {
      name: 'tessera-tns',
      script: 'src/index.js',
      env: {
        NODE_ENV: 'production',
      },
      exp_backoff_restart_delay: 100,
      max_restarts: 10,
    },
  ],
};

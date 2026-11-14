module.exports = {
  '/api': {
    target: 'http://localhost:8080',
    secure: false,
    changeOrigin: true,
    on: {
      proxyReq: (proxyReq) => proxyReq.removeHeader('origin')
    }
  }
};

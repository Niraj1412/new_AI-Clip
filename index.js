const express = require('express');
const cors = require('cors');
const { connectDB } = require('./db');
const usersRoute = require('./routes/usersRoute');
const clipsRoute = require('./routes/clipsRoute');
const processRoute = require('./routes/processClip');
const uploadRoute = require('./routes/uploadRoute');
const initialVersionRoute = require('./routes/initialVersion');
const mergeRoute = require('./routes/mergeRoute');
const projectRoutes = require('./routes/projectRoutes');
const healthRoute = require('./routes/healthRoute');
const processRoutes = require('./routes/processRoutes');
const videoRoutes = require('./routes/videoRoutes');
const path = require('path');
const fs = require('fs');
require('dotenv').config();

const app = express();
const port = process.env.PORT || 4001;
const payloadLimit = '50mb';

app.set('trust proxy', true);

// 🗂 Ensure uploads and temp directories exist
const dirsToEnsure = [
  path.join(__dirname, 'uploads'),
  path.join(__dirname, 'backend/uploads'),
  path.join(__dirname, 'backend/thumbnails'),
  path.join(__dirname, 'temp')
];
dirsToEnsure.forEach(dir => {
  if (!fs.existsSync(dir)) {
    console.log(`Creating directory: ${dir}`);
    fs.mkdirSync(dir, { recursive: true });
  }
});

// 🖼 Serve static directories
const staticConfig = {
  dotfiles: 'ignore',
  etag: true,
  extensions: ['jpg', 'jpeg', 'png', 'mp4'],
  maxAge: '1d',
  setHeaders: (res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
  }
};

app.use('/uploads', express.static(path.join(__dirname, 'uploads'), staticConfig));
app.use('/temp', express.static(path.join(__dirname, 'temp'), staticConfig));
app.use('/thumbnails', express.static(path.join(__dirname, 'backend', 'thumbnails'), staticConfig));
app.use('/default-thumbnail.jpg', express.static(path.join(__dirname, 'backend', 'public', 'default-thumbnail.jpg')));

// ⚙️ Configure CORS
const corsOptions = {
  origin: function (origin, callback) {
    if (!origin) return callback(null, true); // Allow mobile/curl requests

    const allowedOrigins = process.env.ALLOWED_ORIGINS
      ? process.env.ALLOWED_ORIGINS.split(',')
      : [
          'https://clip-frontend-git-main-niraj1412s-projects.vercel.app',
          'https://clip-frontend-three.vercel.app',
          'http://localhost:3000',
          'http://127.0.0.1:3000'
        ];

    const normalizedOrigins = allowedOrigins.map(o => o.replace(/\/$/, ''));

    if (normalizedOrigins.includes(origin) || process.env.NODE_ENV !== 'production') {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS', 'HEAD'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'Accept',
    'X-Access-Token'
  ],
  credentials: true,
  exposedHeaders: [
    'Authorization',
    'Content-Length',
    'X-Request-ID'
  ],
  maxAge: 86400
};

app.use(cors(corsOptions));

// 🧠 FIX: Allow Google OAuth popups and cross-origin communication
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  res.setHeader('Cross-Origin-Embedder-Policy', 'unsafe-none');
  next();
});

// 🧰 Basic middleware
app.use(express.json({
  limit: payloadLimit,
  extended: true,
  parameterLimit: 50000
}));
app.use(express.urlencoded({
  extended: true,
  limit: payloadLimit,
  parameterLimit: 50000
}));

// 🌐 Preflight (OPTIONS) handling
app.options('*', cors(corsOptions));

// 🕓 Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
  next();
});

// 🎥 File check route for merged videos
app.head('/temp/:jobId/merged.mp4', (req, res) => {
  const { jobId } = req.params;
  const filePath = path.join(__dirname, 'temp', jobId, 'merged.mp4');
  if (fs.existsSync(filePath)) {
    const stats = fs.statSync(filePath);
    if (stats.size > 0) {
      res.setHeader('Content-Length', stats.size);
      res.setHeader('Content-Type', 'video/mp4');
      return res.status(200).end();
    }
  }
  res.status(404).end();
});

// 🩺 Health check route (important for frontend ping)
app.get('/api/v1/health/ping', (req, res) => {
  res.status(200).json({ status: true, message: 'Server online' });
});

// 📦 Routes
app.use('/api/v1/auth', usersRoute);
app.use('/api/clips', clipsRoute);
app.use('/api/v1/upload', uploadRoute);
app.use('/api/v1/youtube', initialVersionRoute);
app.use('/api/v1/video', videoRoutes);
app.use('/api/v1/url', initialVersionRoute);
app.use('/api/merge', mergeRoute);
app.use('/api/projects', projectRoutes);
app.use('/api/v1/health', healthRoute);
app.use('/api', processRoute);

// ✅ Catch-all for other /api/v1 routes
app.use('/api/v1', (req, res, next) => {
  console.log(`Incoming API v1 request: ${req.method} ${req.path}`);
  next();
}, processRoutes);

// 🧱 Production fallback
if (process.env.NODE_ENV === 'production') {
  app.get('*', (req, res, next) => {
    if (!req.path.startsWith('/api/')) {
      return res.status(404).json({
        message: 'Not found - Frontend is served separately',
        hint: 'Your frontend is deployed at a different URL'
      });
    }
    next();
  });
}

// 🛠 Global error handler
app.use((err, req, res, next) => {
  console.error('Global error handler caught:', err.stack || err);
  
  if (err.name === 'UnauthorizedError') {
    return res.status(401).json({ message: 'Invalid or expired token' });
  }

  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({ message: 'File too large' });
  }

  res.status(err.status || 500).json({
    message: 'Internal server error',
    error: process.env.NODE_ENV === 'development' ? err.message : undefined,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined
  });
});

// 🧩 Connect to MongoDB
connectDB();

// 🚀 Start the server
app.listen(port, () => {
  console.log(`✅ Server running on port ${port}`);
});

// 🧾 Log registered routes
console.log('Registered routes:');
app._router.stack.forEach(middleware => {
  if (middleware.route) {
    console.log(`${Object.keys(middleware.route.methods).join(', ').toUpperCase()} ${middleware.route.path}`);
  } else if (middleware.name === 'router') {
    middleware.handle.stack.forEach(handler => {
      if (handler.route) {
        console.log(`${Object.keys(handler.route.methods).join(', ').toUpperCase()} /api/v1${handler.route.path}`);
      }
    });
  }
});

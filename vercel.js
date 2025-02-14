{
    "version": 2,
    "builds": [
      {
        "src": "api/proxy.js",
        "use": "@vercel/node"
      }
    ],
    "routes": [
      {
        "src": "/api/proxy/(.*)",
        "dest": "/api/proxy"
      }
    ],
       "env": {
      "NODE_OPTIONS": "--no-deprecation"
    }
  }
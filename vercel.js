{
    "version": 2,
    "builds": [
      {
        "src": "index.js",
        "use": "@vercel/node"
      }
    ],
    "routes": [
      {
        "src": "/(.*)",
        "dest": "/"
      }
    ],
       "env": {
      "NODE_OPTIONS": "--no-deprecation"
    }
  }
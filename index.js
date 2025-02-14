import express, { query } from 'express';

import http from 'http';
import path, { dirname } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const server = http.createServer(app);
const io = new socketIo(server);

server.listen(8000, () => {
    console.log("Server is running on http://localhost:8000");
});

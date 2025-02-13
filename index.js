const express = require("express");
const rateLimit = require("express-rate-limit");
const session = require("express-session");
const cookieParser = require("cookie-parser");
const { createServer } = require("http");
const https = require("https");
const http = require("http");
const dotenv = require("dotenv");
const cors = require("cors");
const axios = require("axios");
const fs = require("fs");
const { createProxyMiddleware } = require("http-proxy-middleware"); // Adicionado para proxy reverso

const NodeCache = require("node-cache");
dotenv.config();
const path = require("path");
const bodyParser = require("body-parser");


const { Server } = require("socket.io");


const app = express();
app.use(express.urlencoded({ extended: true }));
app.use(express.json());

const sessionMiddleware = session({
  secret: "keyboard bill",
  resave: false,
  saveUninitialized: true,
  cookie: {
    secure: false, // true se usar HTTPS em produção
    maxAge: 1000 * 60 * 60 * 24, // 1 dia
  },
});

app.use(sessionMiddleware);
app.use(cookieParser());
app.use(cors());

const privateKey = fs.readFileSync("private.pem");
const certificate = fs.readFileSync("ssl.pem");

const credentials = { key: privateKey, cert: certificate };
const httpsServer = https.createServer(credentials, app);
const httpServer = createServer(app);
const httpServer2 = createServer(app);

httpServer2.listen(7000, () => {
  console.log(`Servidor HTTPS rodando na porta `);
});

app.get('/stream' , async(req, res) => {
  const url = req.query.url;

  if (!url) {
    return res.status(400).send('URL is required');
  }

  try {
    const range = req.headers.range;
    const headers = range ? { range } : {};

    const response = await axios.get(url, {
      responseType: 'stream',
      headers,
    });

    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', response.headers['content-type']);
    res.setHeader('Cache-Control', 'no-cache');
    response.data.pipe(res);
  } catch (error) {
    console.error(error);
    res.status(500).send('Error while fetching the content');
  }
});


const blockBrowsers = (req, res, next) => {
  const userAgent = req.headers["user-agent"];
  const browserRegex = /(chrome|firefox|safari|opera|msie|trident)/i;

  if (browserRegex.test(userAgent)) {
    return res.status(403).send("Olá curioso, seu ip foi registrado =)");
  }

  next();
};

app.get("/live", blockBrowsers, (req, res) => {
  // Obtém os parâmetros da query string
  let { url } = req.query;


  // Adiciona o prefixo à URL
  url = atob(url);

  // Redireciona para a URL final
  res.redirect(url);
});



const io = new Server(httpsServer);

io.attach(httpServer);
io.attach(httpsServer);

app.use(express.static(path.join("/etc/site/assets")));

io.use((socket, next) => {
  sessionMiddleware(socket.request, socket.request.res || {}, next);
});

// Redireciona HTTP para HTTPS

app.use((req, res, next) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader(
    "Access-Control-Allow-Methods",
    "GET, POST, OPTIONS, PUT, PATCH, DELETE"
  );
  res.setHeader(
    "Access-Control-Allow-Headers",
    "X-Requested-With,content-type"
  );
  res.setHeader("Access-Control-Allow-Credentials", true);

  next();
});

app.use((req, res, next) => {
  console.log(req.hostname);
  const host = req.hostname;

  if (host === "cinema.internet20.com.br" && req.path === "/") {
    res.sendFile("tv.html", { root: "views" }, (err) => {
      if (err) {
        next(err);
      }
    });
  } else if (host === "internet20.com.br" && req.path === "/") {
    // Rotas para cinema.midia.com.br
    res.sendFile("index.html", { root: "views" }, (err) => {
      if (err) {
        next(err);
      }
    });
  } else {
    next();
  }
});


// Cache simples para armazenar os dados do usuário, com tempo de expiração de 10 minutos (600000ms)
const userCache = {};
const CACHE_EXPIRATION_TIME = 1000; // 10 minutos






app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).json({ error: "URL is required" });
  }

  try {
    new URL(targetUrl); // Verifica se a URL é válida
  } catch (err) {
    return res.status(400).json({ error: "Invalid URL" });
  }

  const headers = {
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.124 Safari/537.36",
  };

  if (req.headers.range) {
    headers["Range"] = req.headers.range;
  }

  const axiosInstance = axios.create({
    maxRedirects: 10, // Ajuste conforme necessário
    headers: headers,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 100 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 100 }),
  });

  const fetchContent = async (url, retryCount = 3) => {
    try {
      console.log(`Fetching URL: ${url}`);
      const response = await axiosInstance.get(url, {
        responseType: "stream",
        validateStatus: (status) => status < 400,
      });

      // Ensure the correct headers are passed to the client
      if (!res.headersSent) {
        const responseHeaders = {
          ...response.headers,
          "Accept-Ranges": "bytes", // Enable range requests
          "Content-Type": response.headers["content-type"] || "video/mp4", // Ensure content-type is set
        };
        res.writeHead(response.status, responseHeaders);
      }

      response.data.pipe(res);

      response.data.on("data", (chunk) => {
       // console.log(`Streaming chunk of size: ${chunk.length}`);
      });

      response.data.on("end", () => {
        console.log("Stream ended");
        res.end(); // Force end the response
      });

      response.data.on("error", (err) => {
        console.error("Stream error:", err.message);
        if (!res.headersSent) {
          res.status(500).json({ error: "Error streaming content" });
        }
      });
    } catch (error) {
      console.error("Error fetching content:", error.message);
      if (error.response && error.response.status === 404) {
        res.status(404).json({ error: "Content not found" });
      } else if (retryCount > 0) {
        console.log(`Retrying... (${3 - retryCount + 1}/3)`);
        await fetchContent(url, retryCount - 1);
      } else {
        if (!res.headersSent) {
          res.status(500).json({ error: "Error fetching content" });
        }
      }
    }
  };

  await fetchContent(targetUrl);
});

app.use("/download", (req, res, next) => {
  const targetUrl = req.query.url;

  if (!targetUrl) {
    return res.status(400).send("A URL de destino não foi fornecida.");
  }

  req.proxyUrl = targetUrl;
  next();
});

app.use(
  "/download",
  createProxyMiddleware({
    changeOrigin: true,
    pathRewrite: (path, req) => {
      // Reescreva o caminho removendo o "/download"
      const newPath = req.proxyUrl.replace(/^\/download/, "");
      return newPath;
    },
    router: (req) => {
      // Define a URL de destino dinamicamente
      return req.proxyUrl;
    },
  })
);

app.use(bodyParser.json({ limit: "50mb" }));
app.use(express.json({ limit: "50mb" })); // Certifique-se de que esta linha também esteja presente

app.post("/upload", (req, res) => {
  const { image } = req.body;

  // Remove o prefixo da URL base64
  const base64Data = image.replace(/^data:image\/png;base64,/, "");

  // Salva a imagem em um arquivo
  fs.writeFile(
    path.join(__dirname, "uploads", "photo.png"),
    base64Data,
    "base64",
    (err) => {
      if (err) {
        console.error("Erro ao salvar a imagem:", err);
        return res.status(500).send("Erro ao salvar a imagem");
      }
      res.send("Imagem recebida e salva com sucesso");
    }
  );
});

function diferencaEmDias(dataISO) {
  const dataTimestamp = new Date(dataISO);
  const dataAtual = new Date();
  const diferencaMilissegundos = dataTimestamp.getTime() - dataAtual.getTime();
  const diferencaDias = Math.round(
    diferencaMilissegundos / (1000 * 60 * 60 * 24)
  );
  return diferencaDias;
}


app.get("/webcam", (req, res) => {
  res.sendFile("webcam.html", { root: "views" });
});
app.set("trust proxy", 1);
module.exports = {
  httpServer,
  httpsServer,
  io,
  app,
  sessionMiddleware, // Exportar o middleware de sessão para ser acessível em outros arquivos
};




const targetUrl = 'https://proxy-lake-three.vercel.app:7000'; // Altere para a URL de destino do seu servidor HLS

app.use('/live', createProxyMiddleware({
  target: targetUrl,
  changeOrigin: true,
  secure: false, 
  pathRewrite: {
    '^/live': '/live',
  },
  onProxyReq: (proxyReq, req, res) => {
    proxyReq.setHeader('X-Forwarded-Proto', 'https'); 
    proxyReq.setHeader('User-Agent', req.headers['user-agent']); 
    
    // Adicionar cabeçalhos CORS
    proxyReq.setHeader('Access-Control-Allow-Origin', '*');
    proxyReq.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
    proxyReq.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  },
  onError: (err, req, res) => {
    console.error('Erro no proxy:', err);
    res.status(500).send('Erro ao carregar o vídeo');
  }
}));

app.get("/tv",  (req, res) => {
  // Obtém os parâmetros da query string
  let { url } = req.query;


  // Adiciona o prefixo à URL
  url = atob(url);

  url = ajustarUrl(url);

  // Redireciona para a URL final
  res.redirect(url);
});


function ajustarUrl(url) {
  const urlObj = new URL(url);

  // Adiciona "/live" após a porta, se necessário
  if (!urlObj.pathname.startsWith("/live")) {
    urlObj.pathname = `/live${urlObj.pathname}`;
  }

  // Adiciona ".m3u8" no final, se necessário
  if (!urlObj.pathname.endsWith(".m3u8")) {
    urlObj.pathname += ".m3u8";
  }

  return urlObj.toString();
}

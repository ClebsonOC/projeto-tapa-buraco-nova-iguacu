const CACHE_NAME = 'tapa-buracos-ni-cache-v5'; // Incrementamos a versão para forçar a atualização

// A lista de arquivos para o cache inicial (offline fallback) continua a mesma.
const URLS_TO_CACHE = [
  '/',
  '/index.html',
  '/login.html',
  '/relatorio.html',
  '/css/main.css',
  '/css/index.css',
  '/css/relatorio.css',
  '/js/auth.js',
  '/js/index.js',
  '/js/relatorio.js',
  '/images/logo.png',
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-144x144.png'
];

// O evento de 'install' continua o mesmo, ele prepara o cache para o modo offline.
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Pré-cache para modo offline.');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => self.skipWaiting())
  );
});

// O evento de 'activate' continua o mesmo, ele limpa caches antigos.
self.addEventListener('activate', event => {
  console.log('Service Worker: Ativando...');
  event.waitUntil(
    caches.keys().then(cacheNames => {
      return Promise.all(
        cacheNames.map(cache => {
          if (cache !== CACHE_NAME) {
            console.log('Service Worker: Deletando cache antigo:', cache);
            return caches.delete(cache);
          }
        })
      );
    }).then(() => self.clients.claim())
  );
});

// --- LÓGICA DE FETCH ATUALIZADA PARA "NETWORK-FIRST" ---
self.addEventListener('fetch', event => {
  // Ignora a API, ela sempre vai para a rede.
  if (event.request.url.includes('/api/')) {
    return;
  }

  // Para todos os outros arquivos (HTML, CSS, JS)...
  event.respondWith(
    // 1. Tenta buscar na rede primeiro.
    fetch(event.request)
      .then(networkResponse => {
        // Se a busca na rede for bem-sucedida, o processo termina aqui.
        // O navegador recebe a resposta mais atual.
        // (Opcional, mas recomendado: podemos atualizar o cache com a nova versão)
        return caches.open(CACHE_NAME).then(cache => {
          cache.put(event.request, networkResponse.clone());
          return networkResponse;
        });
      })
      .catch(() => {
        // 2. Se a busca na rede falhar (offline), tenta pegar do cache como um fallback.
        console.log('Service Worker: Rede falhou, servindo do cache para:', event.request.url);
        return caches.match(event.request);
      })
  );
});
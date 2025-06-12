const CACHE_NAME = 'tapa-buracos-ni-cache-v1';

// Lista de arquivos que REALMENTE existem na sua pasta /public
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
  // Os ícones foram removidos por enquanto.
  // Se você os adicionar na pasta /public/icons, pode descomentar as linhas abaixo.
  '/icons/icon-192x192.png',
  '/icons/icon-512x512.png',
  '/icons/icon-144x144.png'
];

// Evento de Instalação: Cacheia os arquivos do App Shell
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Adicionando App Shell ao cache.');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('Service Worker: App Shell cacheado com sucesso!');
        return self.skipWaiting();
      })
      .catch(error => {
        console.error('Service Worker: Falha ao cachear App Shell.', error);
      })
  );
});

// Evento de Ativação: Limpa caches antigos
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

// Evento Fetch: Lógica de cache-first
self.addEventListener('fetch', event => {
  // Ignora completamente as requisições para a API
  if (event.request.url.includes('/api/')) {
    return;
  }

  event.respondWith(
    caches.match(event.request)
      .then(cachedResponse => {
        // Se a resposta estiver no cache, retorna a versão em cache
        if (cachedResponse) {
          return cachedResponse;
        }
        // Se não estiver no cache, busca na rede
        return fetch(event.request);
      })
  );
});
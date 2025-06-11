const CACHE_NAME = 'tapa-buracos-ni-cache-v1'; // Mude a versão se atualizar os arquivos
const URLS_TO_CACHE = [
  '/', // Redireciona para index.html ou login.html dependendo do estado
  '/index.html',
  '/login.html',
  // Adicione aqui caminhos para CSS ou JS externos se você os tiver separado
  // Ex: '/style.css', '/scripts/main.js'
  // Como seu CSS e JS principal estão embutidos nos HTMLs, cachear os HTMLs já os inclui.
  // Se você tiver ícones que quer que apareçam offline na UI (além dos do manifest):
  // '/icons/icon-192x192.png' 
];

// Evento de Instalação: Cacheia os arquivos do App Shell
self.addEventListener('install', event => {
  console.log('Service Worker: Instalando...');
  event.waitUntil(
    caches.open(CACHE_NAME)
      .then(cache => {
        console.log('Service Worker: Cache aberto, adicionando App Shell ao cache.');
        return cache.addAll(URLS_TO_CACHE);
      })
      .then(() => {
        console.log('Service Worker: App Shell cacheado com sucesso.');
        return self.skipWaiting(); // Força o novo SW a se tornar ativo imediatamente
      })
      .catch(error => {
        console.error('Service Worker: Falha ao cachear App Shell durante a instalação.', error);
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
    }).then(() => {
      console.log('Service Worker: Ativado e caches antigos limpos.');
      return self.clients.claim(); // Permite que o SW controle clientes não controlados imediatamente
    })
  );
});

// Evento Fetch: Serve do cache primeiro, depois rede (Cache-First para o App Shell)
self.addEventListener('fetch', event => {
  // Não interceptar requisições para /api/* ou outros domínios
  if (event.request.url.includes('/api/')) {
    // console.log('Service Worker: Deixando requisição de API passar para a rede:', event.request.url);
    return; // Deixa a requisição de API seguir para a rede normalmente
  }

  event.respondWith(
    caches.match(event.request)
      .then(response => {
        if (response) {
          // console.log('Service Worker: Servindo do cache:', event.request.url);
          return response; // Serve do cache se encontrado
        }
        // console.log('Service Worker: Não encontrado no cache, buscando na rede:', event.request.url);
        return fetch(event.request).then(
            // Tenta cachear novas requisições GET bem-sucedidas que não são de API
            // Cuidado: isso pode cachear coisas que você não quer se não for específico.
            // Para um cache simples de App Shell, o cache na instalação é mais controlado.
            // Esta parte abaixo é opcional e pode ser mais agressiva no cache.
            /*
            (networkResponse) => {
                if(!networkResponse || networkResponse.status !== 200 || networkResponse.type !== 'basic') {
                    return networkResponse;
                }
                // Apenas para requisições GET, não para POST etc.
                if (event.request.method === 'GET') {
                    const responseToCache = networkResponse.clone();
                    caches.open(CACHE_NAME)
                        .then(cache => {
                            cache.put(event.request, responseToCache);
                        });
                }
                return networkResponse;
            }
            */
           return fetch(event.request); // Simplesmente busca na rede se não estiver no cache
        ).catch(error => {
            console.error('Service Worker: Erro ao buscar na rede e sem cache:', event.request.url, error);
            // Poderia retornar uma página offline padrão aqui, se você tiver uma
            // return caches.match('/offline.html'); 
        });
      })
  );
});
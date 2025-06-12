// public/js/index.js

document.addEventListener('DOMContentLoaded', (event) => {
    
    // Mapeamento de todos os elementos do DOM
    const ruaInputElement = document.getElementById('ruaInput');
    const sugestoesDivElement = document.getElementById('sugestoes');
    const bairroSelectElement = document.getElementById('bairroSelect');
    const buracosContainerElement = document.getElementById('buracosContainer');
    const addBuracoBtnElement = document.getElementById('addBuracoBtn');
    const salvarTudoBtnElement = document.getElementById('salvarTudoBtn');
    const statusSalvarElement = document.getElementById('statusSalvar');
    const loadingSpinnerElement = document.getElementById('loadingSpinner');
    const fotoGeralInputElement = document.getElementById('fotoGeralInput');
    const successOverlay = document.getElementById('success-overlay');

    let debounceTimer;
    let nextUniqueBuracoId = 1;

    // Função para resetar completamente o formulário
    function resetarFormularioCompleto() {
        ruaInputElement.value = '';
        bairroSelectElement.value = '';
        fotoGeralInputElement.value = null;
        buracosContainerElement.innerHTML = '';
        document.getElementById('tempoBom').checked = true;
        statusSalvarElement.textContent = '';
        statusSalvarElement.className = '';
        adicionarNovoBuraco();
        ruaInputElement.focus();
    }
    
    // Função para carregar bairros da API
    function carregarBairros() {
        fetch('/api/buscar-bairros')
            .then(response => response.json())
            .then(bairros => {
                bairroSelectElement.innerHTML = '<option value="">Selecione um bairro</option>';
                bairros.forEach(bairro => {
                    const option = document.createElement('option');
                    option.value = bairro;
                    option.textContent = bairro;
                    bairroSelectElement.appendChild(option);
                });
            })
            .catch(error => {
                bairroSelectElement.innerHTML = '<option value="">Erro ao carregar bairros</option>';
            });
    }

    // Função para exibir sugestões de ruas
    function exibirSugestoes(ruas) {
        sugestoesDivElement.innerHTML = '';
        if (ruas && ruas.length > 0) {
            sugestoesDivElement.style.display = 'block';
            ruas.forEach(rua => {
                const divItem = document.createElement('div');
                divItem.className = 'sugestao-item';
                divItem.textContent = rua;
                divItem.addEventListener('click', () => selecionarRua(rua));
                sugestoesDivElement.appendChild(divItem);
            });
        } else {
            sugestoesDivElement.style.display = 'none';
        }
    }

    // Função para selecionar uma rua da lista
    function selecionarRua(rua) {
        ruaInputElement.value = rua;
        sugestoesDivElement.style.display = 'none';
        bairroSelectElement.focus();
    }

    // Renumera os cabeçalhos dos buracos
    function renumerarBuracosVisualmente() {
        const buracoEntries = buracosContainerElement.getElementsByClassName('buraco-entry');
        for (let i = 0; i < buracoEntries.length; i++) {
            const header = buracoEntries[i].querySelector('.buraco-header');
            if (header) {
                header.textContent = `TAPA BURACO ${i + 1}`;
            }
        }
    }

    // Adiciona um novo campo de buraco ao formulário
    function adicionarNovoBuraco() {
        if (buracosContainerElement.children.length >= 20) {
            alert("Limite de 20 buracos por submissão atingido.");
            return;
        }
        const buracoId = nextUniqueBuracoId++;
        const novoBuracoDiv = document.createElement('div');
        novoBuracoDiv.className = 'buraco-entry';
        novoBuracoDiv.id = 'buracoEntry_' + buracoId;
        novoBuracoDiv.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center;">
                <div class="buraco-header">TAPA BURACO</div>
                <button type="button" class="remove-buraco-btn">Remover</button>
            </div>
            <label>Largura (m) (use vírgula):</label> <input type="text" inputmode="decimal" class="largura" placeholder="Ex: 0,80">
            <label>Comprimento (m) (use vírgula):</label> <input type="text" inputmode="decimal" class="comprimento" placeholder="Ex: 1,20">
            <label>Espessura (cm) (use vírgula):</label> <input type="text" inputmode="decimal" class="espessura" placeholder="Ex: 5,00">
        `;
        novoBuracoDiv.querySelector('.remove-buraco-btn').addEventListener('click', () => {
            novoBuracoDiv.remove();
            renumerarBuracosVisualmente();
        });
        buracosContainerElement.appendChild(novoBuracoDiv);
        renumerarBuracosVisualmente();
    };

    // Lógica principal de salvamento
    salvarTudoBtnElement.addEventListener('click', function() {
        const ruaSelecionada = ruaInputElement.value.trim();
        const bairroSelecionado = bairroSelectElement.value;
        if (!ruaSelecionada || !bairroSelecionado) {
            alert('Por favor, selecione uma rua e um bairro.');
            return;
        }
        
        const dadosDosBuracos = [];
        const entries = buracosContainerElement.getElementsByClassName('buraco-entry');
        if (entries.length === 0) {
            alert("Adicione pelo menos um buraco para salvar.");
            return;
        }

        for (let i = 0; i < entries.length; i++) {
            const entry = entries[i];
            const larguraVal = entry.querySelector('.largura').value.trim();
            const comprimentoVal = entry.querySelector('.comprimento').value.trim();
            const espessuraVal = entry.querySelector('.espessura').value.trim();
            if (!larguraVal || !comprimentoVal || !espessuraVal) {
                alert(`Preencha todas as medidas para o TAPA BURACO ${i + 1}.`);
                return;
            }
            dadosDosBuracos.push({ identificador: `TAPA BURACO ${i + 1}`, largura: larguraVal, comprimento: comprimentoVal, espessura: espessuraVal });
        }

        loadingSpinnerElement.style.display = 'block';
        salvarTudoBtnElement.disabled = true;
        statusSalvarElement.textContent = '';
        statusSalvarElement.className = '';

        const formData = new FormData();
        const dados = {
            rua: ruaSelecionada,
            bairro: bairroSelecionado,
            buracos: dadosDosBuracos,
            condicaoTempo: document.querySelector('input[name="condicaoTempo"]:checked').value,
            username: localStorage.getItem('loggedInUser')
        };
        formData.append('dados', JSON.stringify(dados));
        const arquivosDeFoto = fotoGeralInputElement.files;
        for (let i = 0; i < arquivosDeFoto.length; i++) {
            formData.append('fotos', arquivosDeFoto[i]);
        }

        fetch('/api/salvar', { method: 'POST', body: formData })
            .then(response => response.json().then(data => ({ ok: response.ok, body: data })))
            .then(({ ok, body }) => {
                if (ok) {
                    resetarFormularioCompleto();
                    successOverlay.classList.add('active');
                    setTimeout(() => {
                        successOverlay.classList.remove('active');
                    }, 2500);
                } else {
                    statusSalvarElement.textContent = body.error || 'Ocorreu um erro.';
                    statusSalvarElement.className = 'error';
                }
            })
            .catch(err => {
                statusSalvarElement.textContent = 'Erro de conexão. Verifique a rede.';
                statusSalvarElement.className = 'error';
            })
            .finally(() => {
                loadingSpinnerElement.style.display = 'none';
                salvarTudoBtnElement.disabled = false;
            });
    });

    // Event listeners
    ruaInputElement.addEventListener('input', (event) => {
        clearTimeout(debounceTimer);
        const textoDigitado = event.target.value;
        if (textoDigitado.length < 2) {
            sugestoesDivElement.style.display = 'none';
            return;
        }
        debounceTimer = setTimeout(() => {
            fetch('/api/buscar-ruas?texto=' + encodeURIComponent(textoDigitado))
                .then(response => response.json())
                .then(listaDeRuas => exibirSugestoes(listaDeRuas));
        }, 300);
    });

    addBuracoBtnElement.addEventListener('click', adicionarNovoBuraco);
    
    // Inicialização da página
    carregarBairros();
    adicionarNovoBuraco();
});
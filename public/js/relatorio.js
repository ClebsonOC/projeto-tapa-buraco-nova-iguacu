// public/js/relatorio.js

// Variável global para guardar todos os registros do usuário e não precisar buscar na API toda hora
let todosOsRegistros = [];

document.addEventListener('DOMContentLoaded', function() {
    // Ao carregar a página, busca os dados da API uma única vez
    carregarDadosDaAPI();

    // Adiciona os "escutadores" de eventos aos campos de filtro
    const filtroRua = document.getElementById('filtro-rua');
    if(filtroRua) filtroRua.addEventListener('keyup', () => renderizarTabela());
});

/**
 * Função responsável APENAS por buscar os dados do usuário no backend.
 */
function carregarDadosDaAPI() {
    const loadingDiv = document.getElementById('loading');
    const loggedInUser = localStorage.getItem('loggedInUser');

    if (!loggedInUser) {
        loadingDiv.innerText = 'Usuário não identificado. Faça login novamente.';
        return;
    }
    
    loadingDiv.style.display = 'block';
    
    fetch(`/api/buracos?usuario=${loggedInUser}`)
        .then(response => response.json())
        .then(data => {
            if (data.error) {
                loadingDiv.innerHTML = `<span style="color: red;">${data.error}</span>`;
                return;
            }
            // Guarda os dados na nossa variável global
            todosOsRegistros = data;
            // Chama a função para renderizar a tabela pela primeira vez
            renderizarTabela();
        })
        .catch(error => {
            loadingDiv.innerText = `Erro de conexão: ${error.message}`;
        });
}

/**
 * Função responsável por FILTRAR, AGRUPAR e DESENHAR a tabela.
 * Ela usa os dados que já estão na variável `todosOsRegistros`.
 */
function renderizarTabela() {
    const loadingDiv = document.getElementById('loading');
    const tableBody = document.getElementById('report-table-body');
    const filtroRuaValue = document.getElementById('filtro-rua').value.toUpperCase();
    
    loadingDiv.style.display = 'none';
    tableBody.innerHTML = '';

    // 1. Filtra os dados em memória com base no que foi digitado
    const dadosFiltrados = todosOsRegistros.filter(item => {
        return filtroRuaValue ? item.rua.toUpperCase().includes(filtroRuaValue) : true;
    });

    // 2. Agrupa os dados JÁ FILTRADOS por 'submissionId'
    const groupedBySubmission = dadosFiltrados.reduce((acc, item) => {
        const id = item.submissionId;
        if (!acc[id]) {
            acc[id] = [];
        }
        acc[id].push(item);
        return acc;
    }, {});

    if (Object.keys(groupedBySubmission).length === 0) {
        tableBody.innerHTML = '<tr><td colspan="6" style="text-align:center;">Nenhum registro encontrado para os filtros aplicados.</td></tr>';
        return;
    }

    // 3. Renderiza UMA linha principal para CADA GRUPO
    for (const submissionId in groupedBySubmission) {
        const group = groupedBySubmission[submissionId];
        const firstItem = group[0];
        const dataFormatada = new Date(firstItem.registradoEm._seconds * 1000).toLocaleString('pt-BR');
        
        const isEditable = isRegistroEditavel(firstItem);
        
        const mainRow = document.createElement('tr');
        const acaoDeletarHtml = isEditable ?
            `<button class="btn-delete" onclick="deletarVisita('${submissionId}')">Deletar Visita</button>` :
            `<span class="acao-bloqueada">Bloqueado</span>`;

        mainRow.innerHTML = `
            <td><button class="expand-btn" onclick="toggleDetails(this, 'details-${submissionId}')">+</button></td>
            <td>${dataFormatada}</td>
            <td>${firstItem.rua}</td>
            <td>${firstItem.bairro}</td>
            <td>${firstItem.registradoPor}</td>
            <td class="actions">
                ${acaoDeletarHtml}
            </td>
        `;
        tableBody.appendChild(mainRow);
        
        const detailsRow = document.createElement('tr');
        detailsRow.id = `details-${submissionId}`;
        detailsRow.className = 'details-row';
        
        let detailsHtml = '';
        group.sort((a,b) => a.identificadorBuraco.localeCompare(b.identificadorBuraco, undefined, {numeric: true}))
             .forEach(buraco => {
            const dim = buraco.dimensoes;
            const acaoEditarHtml = isEditable ?
                `<button class="btn-update" style="padding: 4px 8px; font-size: 0.8em;" onclick="editarBuraco('${buraco.id}', '${dim.largura}', '${dim.comprimento}', '${dim.espessura}')">Editar</button>` :
                '';

            detailsHtml += `
                <p style="display:flex; justify-content:space-between; align-items:center;">
                    <span><strong>${buraco.identificadorBuraco}:</strong> L: ${dim.largura}m, C: ${dim.comprimento}m, E: ${dim.espessura}cm</span>
                    ${acaoEditarHtml}
                </p>`;
        });

        const linksHtml = (firstItem.fotosDriveLinks || []).map(link => `<a href="${link}" target="_blank">${link}</a>`).join('<br>') || 'Nenhuma foto.';
        detailsRow.innerHTML = `
            <td colspan="6">
                <div class="details-content">
                    <h4>Detalhes dos Buracos</h4>
                    ${detailsHtml}
                    <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
                    <p><strong>Condição do Tempo:</strong> ${firstItem.condicaoTempo}</p>
                    <p><strong>Links das Fotos:</strong><br>${linksHtml}</p>
                </div>
            </td>`;
        tableBody.appendChild(detailsRow);
    }
}

/**
 * Função auxiliar que verifica se um registro pode ser editado (criado no mesmo dia)
 */
function isRegistroEditavel(item) {
    const dataRegistro = new Date(item.registradoEm._seconds * 1000);
    const hoje = new Date();
    return dataRegistro.getFullYear() === hoje.getFullYear() &&
           dataRegistro.getMonth() === hoje.getMonth() &&
           dataRegistro.getDate() === hoje.getDate();
}

/**
 * Funções de ação para os botões
 */
function toggleDetails(button, detailsId) {
    const detailsRow = document.getElementById(detailsId);
    if (detailsRow) {
        detailsRow.classList.toggle('show');
        button.textContent = detailsRow.classList.contains('show') ? '−' : '+';
    }
}

function deletarVisita(submissionId) {
    if (!confirm('Tem certeza que deseja deletar TODA esta visita e seus registros?')) return;
    fetch(`/api/buracos/submission/${submissionId}`, { method: 'DELETE' })
    .then(res => res.json()).then(data => {
        alert(data.message || data.error);
        carregarDadosDaAPI(); // Recarrega os dados da API após deletar
    });
}

function editarBuraco(docId, larguraAtual, comprimentoAtual, espessuraAtual) {
    const novaLargura = prompt("Nova Largura (m):", larguraAtual);
    const novoComprimento = prompt("Novo Comprimento (m):", comprimentoAtual);
    const novaEspessura = prompt("Nova Espessura (cm):", espessuraAtual);
    if (novaLargura === null || novoComprimento === null || novaEspessura === null) return;
    const novasDimensoes = {
        largura: novaLargura.trim().replace('.',','),
        comprimento: novoComprimento.trim().replace('.',','),
        espessura: novaEspessura.trim().replace('.',',')
    };
    fetch(`/api/buracos/dimensoes/${docId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ dimensoes: novasDimensoes })
    })
    .then(res => res.json()).then(data => {
        alert(data.message || data.error);
        carregarDadosDaAPI(); // Recarrega os dados da API após editar
    });
}
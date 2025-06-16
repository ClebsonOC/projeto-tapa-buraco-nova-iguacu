// public/js/relatorio.js

let todosOsRegistros = [];

document.addEventListener('DOMContentLoaded', function() {
    carregarDadosDaAPI();
    const filtroRua = document.getElementById('filtro-rua');
    if(filtroRua) filtroRua.addEventListener('keyup', () => renderizarTabela());
});

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
            todosOsRegistros = data;
            renderizarTabela();
        })
        .catch(error => {
            loadingDiv.innerText = `Erro de conexão: ${error.message}`;
        });
}

function renderizarTabela() {
    const loadingDiv = document.getElementById('loading');
    const tableBody = document.getElementById('report-table-body');
    const filtroRuaValue = document.getElementById('filtro-rua').value.toUpperCase();
    
    loadingDiv.style.display = 'none';
    tableBody.innerHTML = '';

    const dadosFiltrados = todosOsRegistros.filter(item => {
        return filtroRuaValue ? item.rua.toUpperCase().includes(filtroRuaValue) : true;
    });

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

        // CORRIGIDO: Lógica de ordenação para garantir a ordem numérica correta na exibição.
        group.sort((a, b) => {
            const partsA = a.identificadorBuraco.split(' ');
            const numA = parseInt(partsA[partsA.length - 1], 10);
            const partsB = b.identificadorBuraco.split(' ');
            const numB = parseInt(partsB[partsB.length - 1], 10);
            return numA - numB;
        }).forEach(buraco => {
            const dim = buraco.dimensoes;
            const acoesBuracoHtml = isEditable ?
                `<button class="btn-update" style="padding: 4px 8px; font-size: 0.8em;" onclick="editarBuraco('${buraco.id}', '${dim.largura}', '${dim.comprimento}', '${dim.espessura}')">Editar</button>
                 <button class="btn-delete-item" style="padding: 4px 8px; font-size: 0.8em; background-color: #e74c3c;" onclick="deletarBuracoIndividual('${buraco.id}', '${buraco.submissionId}')">Excluir</button>` :
                '';

            detailsHtml += `
                <p style="display:flex; justify-content:space-between; align-items:center; border-bottom: 1px solid #eee; padding-bottom: 5px; margin-bottom: 5px;">
                    <span><strong>${buraco.identificadorBuraco}:</strong> L: ${dim.largura}m, C: ${dim.comprimento}m, E: ${dim.espessura}cm</span>
                    <span class="buraco-actions">${acoesBuracoHtml}</span>
                </p>`;
        });

        const linksHtml = (firstItem.fotosDriveLinks || []).map(link => `<a href="${link}" target="_blank">${link.split('?id=').pop()}</a>`).join('<br>') || 'Nenhuma foto.';
        
        const acoesVisitaHtml = isEditable ? `
            <div class="visita-actions" style="margin-top: 20px; display: flex; gap: 10px;">
                <button class="btn-add" onclick="adicionarNovoBuraco('${submissionId}')">Adicionar Buraco</button>
                <button class="btn-add-photo" onclick="document.getElementById('file-input-${submissionId}').click()">Adicionar Fotos</button>
                <input type="file" multiple style="display:none;" id="file-input-${submissionId}" onchange="adicionarNovasFotos(this, '${submissionId}')">
            </div>
        ` : '';

        detailsRow.innerHTML = `
            <td colspan="6">
                <div class="details-content">
                    <h4>Detalhes dos Buracos</h4>
                    ${detailsHtml}
                    <hr style="border:0; border-top:1px solid #ddd; margin:15px 0;">
                    <p><strong>Condição do Tempo:</strong> ${firstItem.condicaoTempo}</p>
                    <p><strong>Links das Fotos:</strong><br>${linksHtml}</p>
                    ${acoesVisitaHtml}
                </div>
            </td>`;
        tableBody.appendChild(detailsRow);
    }
}

function isRegistroEditavel(item) {
    const dataRegistro = new Date(item.registradoEm._seconds * 1000);
    const hoje = new Date();
    return dataRegistro.getFullYear() === hoje.getFullYear() &&
           dataRegistro.getMonth() === hoje.getMonth() &&
           dataRegistro.getDate() === hoje.getDate();
}

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
        carregarDadosDaAPI();
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
        carregarDadosDaAPI();
    });
}

function adicionarNovoBuraco(submissionId) {
    const largura = prompt("Nova Largura (m):");
    if (largura === null || largura.trim() === '') return;
    const comprimento = prompt("Novo Comprimento (m):");
    if (comprimento === null || comprimento.trim() === '') return;
    const espessura = prompt("Nova Espessura (cm):");
    if (espessura === null || espessura.trim() === '') return;

    fetch(`/api/buracos/submission/${submissionId}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            largura: largura.trim().replace(',', '.'), 
            comprimento: comprimento.trim().replace(',', '.'), 
            espessura: espessura.trim().replace(',', '.') 
        })
    })
    .then(res => res.json()).then(data => {
        alert(data.message || data.error);
        if(!data.error) carregarDadosDaAPI();
    });
}

function adicionarNovasFotos(fileInput, submissionId) {
    if (fileInput.files.length === 0) return;

    const formData = new FormData();
    for (const file of fileInput.files) {
        formData.append('fotos', file);
    }

    fetch(`/api/buracos/fotos/${submissionId}`, {
        method: 'PATCH',
        body: formData
    })
    .then(res => res.json()).then(data => {
        alert(data.message || data.error);
        if(!data.error) carregarDadosDaAPI();
    })
    .finally(() => {
        fileInput.value = '';
    });
}

function deletarBuracoIndividual(docId, submissionId) {
    if (!confirm('Tem certeza que deseja excluir este buraco? A numeração será reajustada.')) return;

    fetch(`/api/buracos/${docId}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ submissionId: submissionId })
    })
    .then(res => res.json()).then(data => {
        alert(data.message || data.error);
        if(!data.error) carregarDadosDaAPI();
    });
}